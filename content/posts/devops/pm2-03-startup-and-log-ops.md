---
# 📌 기본 메타데이터
title: 'PM2 완전 정복 3편 — 재부팅에도 살아남는 프로세스와 로그 운영'
date: '2026-09-17'
category: 'devops'
tags: ['PM2', 'Node.js', 'DevOps', 'Logging']
description: 'watch 모드를 개발 전용으로 두는 이유, startup/save/resurrect로 만드는 부팅 영속성, 그리고 pm2-logrotate와 OS logrotate로 로그 디스크를 지키는 방법.'

# 💬 옵션 필드
draft: false
series: 'PM2 완전 정복'
seriesOrder: 3

# 📚 SEO용
keywords: ['PM2', 'pm2 startup', 'pm2 save', 'pm2 resurrect', 'pm2-logrotate', 'logrotate', 'watch 모드', '로그 로테이션']
---

# PM2 완전 정복 3편 — 재부팅에도 살아남는 프로세스와 로그 운영

> 이전 편: [2편 — Ecosystem 파일과 재시작 전략](/posts/pm2-02-ecosystem-and-restart)
> 이번 편 키워드: watch 모드, startup / save / resurrect, 로그 로테이션

설정을 파일로 선언하고 재시작 정책까지 정했다면, 다음 질문은 "서버가 재부팅돼도 이 상태가 그대로 살아나는가"와 "쌓이는 로그를 누가 치우는가"다. 이번 편은 그 두 가지 영속성을 다룬다.

## 8. Watch 모드

파일이 바뀌면 자동으로 재시작한다. `nodemon`과 비슷한 기능이다.

```js
{
  watch: ['src', 'config'],
  ignore_watch: ['node_modules', 'logs', 'uploads', '.git'],
  watch_delay: 1000,
}
```

```bash
pm2 start server.js --watch
pm2 start server.js --watch --ignore-watch="node_modules logs"
```

**주의사항**

- `ignore_watch`를 설정하지 않으면 **로그 파일 쓰기 → 변경 감지 → 재시작 → 로그 쓰기 → ...** 무한 루프가 생길 수 있다.
- 업로드 디렉터리를 감시하면 사용자가 파일을 올릴 때마다 서버가 재시작된다.
- `watch`를 켠 앱은 `pm2 stop`만으로는 감시가 풀리지 않을 수 있다. `pm2 stop api --watch`로 감시까지 끄자.

> 운영 환경에서는 watch를 쓰지 않는다. 개발 환경 전용 기능이라고 생각하자.

---

## 9. 서버 재부팅 대응: startup / save / resurrect

서버가 재부팅되어도 앱이 자동으로 올라오게 하려면 세 단계가 필요하다.

### 9-1. 부팅 스크립트 생성

```bash
pm2 startup
```

PM2가 init 시스템(systemd 등)을 감지해 **실행해야 할 명령어를 출력**한다.

```
[PM2] To setup the Startup Script, copy/paste the following command:
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u han --hp /home/han
```

출력된 명령을 **그대로 복사해서 실행**한다. 그러면 `pm2-han.service` 같은 systemd 유닛이 생성된다.

```bash
systemctl status pm2-han
```

### 9-2. 현재 프로세스 목록 저장

```bash
pm2 save
```

`~/.pm2/dump.pm2`에 현재 실행 중인 앱 목록과 설정이 저장된다. 부팅 시 PM2는 **이 파일을 읽어서** 앱을 복원한다.

### 9-3. 수동 복원

```bash
pm2 resurrect   # dump.pm2에서 복원
```

### 핵심 포인트

- **앱을 추가/삭제한 뒤에는 반드시 `pm2 save`를 다시 실행**해야 한다. 그렇지 않으면 재부팅 후 옛날 목록이 복원된다.
- **Node.js 버전을 올리거나 nvm으로 경로가 바뀌면** 부팅 스크립트 안의 경로가 틀어진다. 이때는 다시 등록한다.

```bash
pm2 unstartup systemd
pm2 startup
# 출력된 명령 실행
pm2 save
```

- 부팅 스크립트를 제거하려면 `pm2 unstartup`.

### 부팅 흐름

```
[서버 부팅]
    │
    ▼
[systemd] ──▶ pm2-han.service 시작
    │
    ▼
[PM2 데몬 기동] ──▶ ~/.pm2/dump.pm2 읽기
    │
    ▼
[저장된 앱들 복원] ──▶ api, worker ... online
```

---

## 10. 로그 관리 심화

### 10-1. pm2-logrotate

```bash
pm2 install pm2-logrotate
```

PM2 모듈로 동작하며, 설치하면 `pm2 ls`에 모듈 항목으로 표시된다.

```bash
pm2 set pm2-logrotate:max_size 10M          # 파일이 10MB 넘으면 로테이션
pm2 set pm2-logrotate:retain 30             # 최대 30개 보관
pm2 set pm2-logrotate:compress true         # gzip 압축
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'  # 매일 자정 강제 로테이션
pm2 set pm2-logrotate:workerInterval 30     # 크기 검사 주기(초)

pm2 conf pm2-logrotate                      # 현재 설정 확인
```

### 10-2. OS logrotate 사용

PM2 모듈 설치가 어려운 환경(폐쇄망 등)이거나 회사 표준이 OS logrotate라면 이 방식을 쓴다.

```
# /etc/logrotate.d/pm2-han
/home/han/.pm2/logs/*.log {
    daily
    rotate 14
    missingok
    notifempty
    compress
    delaycompress
    copytruncate
}
```

`copytruncate`를 쓰면 PM2가 파일 핸들을 그대로 유지해도 된다. `copytruncate` 대신 파일 이동 방식을 쓴다면 `postrotate`에서 `pm2 reloadLogs`를 호출해야 한다.

### 10-3. 로그 형식

```js
{
  log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS Z',  // 각 줄 앞에 타임스탬프
  merge_logs: true,    // 클러스터 인스턴스 로그를 한 파일로
  // 또는 time: true
}
```

구조화된 로그 수집(ELK, Loki 등)이 목적이라면 PM2 설정보다 **앱에서 JSON 로거(pino, winston)를 쓰는 것**이 낫다. PM2의 타임스탬프가 JSON 앞에 붙으면 파싱이 깨질 수 있으니, 이 경우 `log_date_format`은 끄자.

### 10-4. 로그를 버리고 싶을 때

```js
{
  out_file: '/dev/null',
  error_file: '/dev/null',
}
```

로그를 앱이 직접 외부로 전송하는 경우에만 사용한다.
