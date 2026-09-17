---
# 📌 기본 메타데이터
title: 'PM2 완전 정복 1편 — 프로세스 매니저가 필요한 이유와 첫 실행'
date: '2026-09-17'
category: 'devops'
tags: ['PM2', 'Node.js', 'DevOps', 'Process Manager']
description: 'node server.js가 운영에서 부딪히는 여섯 가지 문제, systemd·Docker와의 역할 비교, 설치와 첫 실행, 상태 조회부터 stop/delete/kill 구분까지 필수 명령어와 로그 기초.'

# 💬 옵션 필드
draft: false
series: 'PM2 완전 정복'
seriesOrder: 1

# 📚 SEO용
keywords: ['PM2', 'Node.js', 'DevOps', 'Process Manager', '프로세스 매니저', 'pm2 start', 'pm2 logs', 'systemd', 'nohup']
---

# PM2 완전 정복 1편 — 프로세스 매니저가 필요한 이유와 첫 실행

> 시리즈 전체 구성
>
> - 1편. 프로세스 매니저가 필요한 이유와 첫 실행
> - 2편. Ecosystem 파일과 재시작 전략
> - 3편. 재부팅 대응과 로그 운영
> - 4편. 내부 아키텍처와 클러스터 모드, 무중단 재시작
> - 5편. 다양한 앱 실행·모니터링·배포
> - 6편. Docker, Nginx, 폐쇄망 운영
> - 7편. 안티패턴 12선과 운영 체크리스트

**기준 버전**: PM2 7.x (Node.js 20 이상 필요)

Node.js 앱을 "그냥 켜두는 것"과 "운영하는 것"은 다르다. 이 시리즈는 PM2를 처음 설치하는 단계부터 내부 아키텍처·클러스터 모드·무중단 재시작·폐쇄망 운영·안티패턴까지 7편에 걸쳐 정리한다. 1편에서는 그 출발점인 프로세스 매니저의 존재 이유와 기본 사용법을 다룬다.

## 1. 프로세스 매니저는 왜 필요한가

서버에서 Node.js 앱을 이렇게 실행했다고 해보자.

```bash
node server.js
```

이 방식은 운영 환경에서 곧바로 여러 문제에 부딪힌다.

| 문제 | 상황 |
|---|---|
| **크래시 시 복구 불가** | 처리되지 않은 예외 하나로 프로세스가 죽으면 누군가 다시 켜기 전까지 서비스 중단 |
| **터미널 종속** | SSH 세션을 닫으면 프로세스도 함께 종료 (`nohup`, `&`로 버티는 건 임시방편) |
| **재부팅 대응 불가** | 서버가 재시작되면 앱이 자동으로 뜨지 않음 |
| **싱글 스레드 한계** | Node.js는 기본적으로 CPU 코어 하나만 사용 |
| **로그 관리 부재** | stdout/stderr가 어디에도 체계적으로 남지 않음 |
| **배포 시 다운타임** | 코드 교체 시 "끄고 → 켜는" 사이 요청 유실 |

**프로세스 매니저**는 이 문제들을 한 곳에서 해결한다. 프로세스를 감시하다가 죽으면 되살리고, 로그를 파일로 모으고, 여러 인스턴스를 띄워 부하를 분산하고, 부팅 시 자동 실행까지 책임진다.

PM2(Process Manager 2)는 Node.js 생태계에서 가장 널리 쓰이는 프로세스 매니저다. 최근에는 Bun 런타임도 네이티브로 지원하며, Python·셸 스크립트 등 임의의 실행 파일도 관리할 수 있다.

### 다른 선택지와 비교

| 도구 | 특징 |
|---|---|
| **systemd** | 리눅스 기본 서비스 관리자. 추가 설치 불필요, 매우 견고. 단 Node 특화 기능(클러스터, 무중단 reload)은 없음 |
| **PM2** | Node 특화 기능이 풍부. 클러스터 모드, reload, 로그, 모니터링을 CLI 하나로 제공 |
| **Docker / Kubernetes** | 컨테이너 단위의 재시작·스케일링·롤링 배포. 이미 오케스트레이터가 있다면 PM2의 역할과 겹침 |

> 핵심: **PM2는 "VM/베어메탈 서버에서 Node 앱을 직접 운영할 때"** 가장 빛난다.

---

## 2. 설치와 첫 실행

### 설치

```bash
# 전역 설치
npm install pm2@latest -g

# 버전 확인
pm2 -v
```

PM2 7부터는 **Node.js 20 이상**이 필요하다. 구버전 Node를 쓰는 서버라면 PM2 6.x에 머물러야 하는지 먼저 확인하자.

### 첫 실행

```js
// server.js
const http = require('http');

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.end(`hello from pid ${process.pid}\n`);
}).listen(PORT, () => {
  console.log(`listening on ${PORT}`);
});
```

```bash
pm2 start server.js
```

출력되는 표를 보자.

```
┌────┬──────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┬──────────┐
│ id │ name     │ mode    │ ↺       │ status   │ cpu    │ mem  │ user      │ watching │
├────┼──────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┼──────────┤
│ 0  │ server   │ fork    │ 0       │ online   │ 0%     │ 40mb │ han       │ disabled │
└────┴──────────┴─────────┴─────────┴──────────┴────────┴──────┴───────────┴──────────┘
```

| 컬럼 | 의미 |
|---|---|
| `id` | PM2가 부여한 고유 번호 (`pm_id`) |
| `name` | 앱 이름. 지정하지 않으면 파일명 |
| `mode` | `fork` 또는 `cluster` |
| `↺` | 재시작 횟수. **이 숫자가 계속 오르면 뭔가 잘못된 것** |
| `status` | `online`, `stopped`, `errored`, `launching` 등 |

### 자주 쓰는 실행 옵션

```bash
# 이름 지정
pm2 start server.js --name api

# 클러스터 모드로 CPU 코어 수만큼
pm2 start server.js --name api -i max

# 스크립트에 인자 전달 (-- 뒤는 앱에 전달됨)
pm2 start server.js --name api -- --port 4000

# Node 옵션 전달
pm2 start server.js --node-args="--max-old-space-size=1024"

# 타임스탬프 로그
pm2 start server.js --time
```

---

## 3. 필수 명령어

### 상태 조회

```bash
pm2 list            # = pm2 ls, pm2 status
pm2 describe api    # 특정 앱 상세 정보 (경로, 로그 위치, 재시작 횟수, 환경 등)
pm2 show api        # describe와 동일
pm2 env 0           # id 0 프로세스의 환경 변수
pm2 jlist           # JSON 출력 (스크립트 연동용)
pm2 prettylist      # 보기 좋은 JSON
pm2 monit           # 터미널 대시보드 (CPU/메모리/로그 실시간)
```

### 생명주기 제어

```bash
pm2 stop api        # 중지 (목록에는 남음)
pm2 restart api     # 강제 재시작 (kill → start)
pm2 reload api      # 무중단 재시작 (클러스터 모드에서 의미 있음)
pm2 delete api      # 목록에서 제거
pm2 reset api       # 재시작 카운터 등 메타데이터 초기화

# 대상 지정 방법
pm2 restart 0            # id로
pm2 restart api          # 이름으로
pm2 restart all          # 전부
pm2 restart api worker   # 여러 개
pm2 restart /^api-/      # 정규식
```

### 데몬 제어

```bash
pm2 ping    # 데몬 살아있는지 확인
pm2 kill    # 데몬과 모든 프로세스 종료
```

### `stop` vs `delete` vs `kill`

- `stop`: 프로세스만 멈춘다. `pm2 ls`에 `stopped`로 남는다.
- `delete`: 프로세스를 멈추고 **관리 목록에서 제거**한다.
- `kill`: **PM2 데몬 자체**를 죽인다. 관리 중인 모든 앱이 내려간다.

---

## 4. 로그 기초

PM2는 각 앱의 stdout/stderr를 파일로 저장한다.

```
~/.pm2/logs/
├── api-out.log      # stdout (console.log)
└── api-error.log    # stderr (console.error)
```

클러스터 모드에서 인스턴스가 여러 개라면 `api-out-0.log`, `api-out-1.log`처럼 인스턴스별로 나뉜다.

```bash
pm2 logs                 # 전체 앱 실시간 로그
pm2 logs api             # 특정 앱
pm2 logs api --lines 200 # 최근 200줄부터
pm2 logs api --err       # 에러 로그만
pm2 logs --json          # JSON 형식
pm2 flush                # 모든 로그 파일 비우기
pm2 flush api            # 특정 앱만
pm2 reloadLogs           # 로그 파일 핸들 다시 열기 (외부 로테이션 후 사용)
```

> ⚠️ 기본 설정으로는 **로그가 무한히 쌓인다**. 운영 서버라면 반드시 [3편의 로그 관리 심화](/posts/pm2-03-startup-and-log-ops)의 로테이션을 설정하자.
