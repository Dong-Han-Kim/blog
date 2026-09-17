---
# 📌 기본 메타데이터
title: 'PM2 완전 정복 4편 — God Daemon과 클러스터 모드, 그리고 진짜 무중단 재시작'
date: '2026-09-17'
category: 'devops'
tags: ['PM2', 'Node.js', 'Cluster', 'Zero Downtime']
description: 'PM2 데몬과 PM2_HOME의 구조, fork와 cluster 모드의 차이와 클러스터가 불러오는 상태(State) 문제, restart와 reload의 결정적 차이, wait_ready와 graceful shutdown으로 요청 유실을 0으로 만드는 흐름.'

# 💬 옵션 필드
draft: false
series: 'PM2 완전 정복'
seriesOrder: 4

# 📚 SEO용
keywords: ['PM2', 'God Daemon', 'PM2_HOME', 'cluster 모드', 'fork 모드', 'reload', 'graceful shutdown', 'wait_ready', 'SIGINT', '무중단 배포']
---

# PM2 완전 정복 4편 — God Daemon과 클러스터 모드, 그리고 진짜 무중단 재시작

> 이전 편: [3편 — 재부팅 대응과 로그 운영](/posts/pm2-03-startup-and-log-ops)
> 이번 편 키워드: God Daemon, PM2_HOME, fork vs cluster, restart vs reload, graceful shutdown

여기까지는 PM2를 사용하는 방법이었다. 이번 편부터는 PM2가 내부에서 무엇을 하고 있는지를 들여다본다. 동작 원리를 알아야 클러스터 모드와 무중단 재시작에서 무엇이 보장되고 무엇이 보장되지 않는지 판단할 수 있다.

## 11. PM2 내부 아키텍처

### 11-1. God Daemon

`pm2 start`를 처음 실행하면 백그라운드에 **PM2 데몬**(God Daemon)이 생성된다. 실제로 앱 프로세스를 생성하고 감시하는 주체가 이 데몬이다.

```
  ┌─────────────┐    RPC (Unix socket)   ┌──────────────────────────┐
  │  pm2 CLI    │ ─────────────────────▶ │   PM2 God Daemon         │
  │ (단명 프로세스)│ ◀───────────────────── │   (상주 프로세스)          │
  └─────────────┘                        │                          │
                                         │  ┌──────┐ ┌──────┐       │
                                         │  │ api  │ │ api  │  ...  │
                                         │  │ #0   │ │ #1   │       │
                                         │  └──────┘ └──────┘       │
                                         └──────────────────────────┘
```

- `pm2` 명령어(CLI)는 **데몬에게 요청만 보내고 종료**된다.
- CLI와 데몬은 `~/.pm2/` 아래의 **Unix 소켓**(`rpc.sock`, `pub.sock`)으로 통신한다.
- 데몬이 앱의 부모 프로세스이므로, 앱이 죽으면 데몬이 `exit` 이벤트를 받아 재시작을 결정한다.

### 11-2. PM2_HOME 디렉터리 구조

```
~/.pm2/
├── dump.pm2          # pm2 save 결과
├── pm2.log           # 데몬 자체 로그 (문제 추적 시 중요!)
├── pm2.pid           # 데몬 PID
├── rpc.sock          # CLI ↔ 데몬 명령 채널
├── pub.sock          # 이벤트 발행 채널
├── logs/             # 앱 로그
├── pids/             # 앱별 PID 파일
└── modules/          # pm2-logrotate 등 모듈
```

**PM2_HOME은 사용자별로 분리**된다. `han` 계정과 `root` 계정은 서로 다른 `~/.pm2`를 가지며, 따라서 **서로 다른 데몬**을 갖는다.

```bash
# 경로 변경 (여러 PM2 인스턴스 격리가 필요할 때)
export PM2_HOME=/opt/pm2-home
pm2 start app.js
```

### 11-3. 이 구조가 주는 교훈

1. **`sudo pm2`와 `pm2`는 다른 세상이다.** root로 띄운 앱은 일반 사용자의 `pm2 ls`에 보이지 않는다.
2. **데몬 로그(`~/.pm2/pm2.log`)를 보는 습관**을 들이자. 앱 로그에 아무것도 없는데 앱이 재시작된다면, 이유는 대부분 여기에 있다.
3. **CLI 버전과 데몬 버전이 다를 수 있다.** PM2를 업그레이드한 뒤 `pm2 update`를 하지 않으면 메모리에는 구버전 데몬이 계속 돈다. ([6편의 PM2 업그레이드](/posts/pm2-06-docker-nginx-airgap))

---

## 12. 클러스터 모드의 동작 원리

### 12-1. Fork 모드 vs Cluster 모드

| | Fork 모드 | Cluster 모드 |
|---|---|---|
| 기반 | `child_process.fork`/`spawn` | Node.js `cluster` 모듈 |
| 대상 | Node, Python, Bun, 셸 등 **모든 실행 파일** | **Node.js (및 PM2 7 기준 Bun)** HTTP/TCP 서버 |
| 포트 공유 | ❌ 인스턴스마다 다른 포트 필요 | ✅ 여러 인스턴스가 같은 포트 공유 |
| 로드 밸런싱 | ❌ | ✅ 내장 |
| 무중단 reload | ❌ (reload = restart) | ✅ |

### 12-2. 내부 동작

```
                    ┌──────────────────────────────┐
  클라이언트 요청 ────▶│  Primary (PM2 데몬 내부)        │
                    │  :3000 소켓을 실제로 listen      │
                    └────┬─────────┬─────────┬─────┘
                  라운드로빈  │         │         │
                         ▼         ▼         ▼
                    ┌────────┐┌────────┐┌────────┐
                    │Worker 0││Worker 1││Worker 2│
                    └────────┘└────────┘└────────┘
```

- 워커가 `server.listen(3000)`을 호출하면, 실제 포트는 **Primary가 대신 열고** 연결을 워커에게 넘겨준다.
- Linux/macOS에서는 Primary가 **라운드로빈**으로 연결을 분배한다. (Windows는 OS 스케줄링에 맡긴다)
- 앱 코드는 수정할 필요가 없다. 평범한 `http` 서버를 그대로 클러스터로 돌릴 수 있다.

### 12-3. 인스턴스 수 설정

```bash
pm2 start app.js -i max    # CPU 코어 수
pm2 start app.js -i 0      # max와 동일
pm2 start app.js -i -1     # 코어 수 - 1 (DB 등 다른 프로세스 몫 남기기)
pm2 start app.js -i 4      # 고정 4개

pm2 scale api 6            # 실행 중에 6개로 조정
pm2 scale api +2           # 2개 추가
```

> 💡 `max`는 **컨테이너의 CPU 제한(cgroup)을 인식하지 못할 수 있다**. 16코어 호스트에서 CPU 2개로 제한된 컨테이너에 `max`를 쓰면 16개 워커가 떠서 오히려 느려진다. 컨테이너나 공유 서버에서는 숫자를 명시하자.

### 12-4. 클러스터 모드의 진짜 난관: 상태(State)

클러스터 모드는 **각 워커가 완전히 독립된 프로세스**라는 사실을 잊으면 버그가 생긴다.

**문제 1 — 인메모리 세션**

```js
// ❌ 워커 0에서 로그인 → 다음 요청이 워커 1로 가면 세션 없음
app.use(session({ store: new MemoryStore() }));
```

→ Redis 등 **외부 저장소**로 세션을 옮긴다.

**문제 2 — 인메모리 캐시**

워커마다 캐시가 따로 있으므로 캐시 무효화가 일관되지 않는다. → Redis 같은 공유 캐시를 쓰거나, "워커별로 달라도 괜찮은 데이터"만 메모리에 둔다.

**문제 3 — WebSocket / Socket.IO**

Socket.IO의 HTTP long-polling 폴백은 같은 워커로 요청이 가야 한다(sticky session). PM2의 라운드로빈은 sticky를 보장하지 않는다.

→ 선택지:
- WebSocket 전송만 허용 (`transports: ['websocket']`)
- 인스턴스를 fork 모드로 여러 포트에 띄우고 **Nginx의 `ip_hash`로** sticky 처리
- Redis 어댑터로 워커 간 이벤트 브로드캐스트

**문제 4 — 스케줄러 중복 실행**

`node-cron`을 앱 안에서 돌리면 **워커 수만큼 크론이 실행**된다. 메일이 4번 발송되는 사고가 생긴다.

```js
// 인스턴스 0번에서만 크론 실행
if (process.env.NODE_APP_INSTANCE === '0') {
  startCronJobs();
}
```

PM2는 클러스터 워커마다 `NODE_APP_INSTANCE`(0, 1, 2 ...)를 주입한다. 다만 `config` 라이브러리도 이 변수명을 사용하므로 충돌한다면 이름을 바꾼다.

```js
{ instance_var: 'INSTANCE_ID' }
```

더 견고한 방법은 **스케줄러를 별도 fork 앱으로 분리**하는 것이다.

### 12-5. Fork 모드에서 여러 인스턴스 띄우기

클러스터 모드를 쓸 수 없는 앱이라면 인스턴스마다 포트를 다르게 준다.

```js
{
  name: 'legacy',
  script: './legacy.js',
  exec_mode: 'fork',
  instances: 3,
  increment_var: 'PORT',
  env: { PORT: 4000 },   // 4000, 4001, 4002
}
```

그리고 Nginx `upstream`으로 묶는다. ([6편의 Nginx와 함께 쓰기](/posts/pm2-06-docker-nginx-airgap))

---

## 13. 무중단 재시작: Graceful Start / Shutdown

### 13-1. restart vs reload

```
[restart]
  워커 0 kill ─┐
  워커 1 kill ─┼─▶ 모두 새로 시작     ⇒ 짧은 순간 요청 실패 가능
  워커 2 kill ─┘

[reload]  (클러스터 모드)
  새 워커 0' 시작 → ready → 기존 워커 0 종료
  새 워커 1' 시작 → ready → 기존 워커 1 종료
  새 워커 2' 시작 → ready → 기존 워커 2 종료   ⇒ 항상 누군가는 요청을 받는 중
```

`reload`는 **한 번에 하나씩 교체**한다. 하지만 PM2 입장에서 "새 워커가 준비됐다"와 "기존 워커가 요청을 다 처리했다"를 **앱이 알려주지 않으면** 여전히 요청이 유실될 수 있다. 이를 해결하는 것이 graceful start/shutdown이다.

### 13-2. Graceful Shutdown

PM2가 프로세스를 멈출 때의 순서:

1. 프로세스에 `SIGINT` 전송
2. `kill_timeout`(기본 약 1.6초)만큼 대기
3. 그래도 살아 있으면 `SIGKILL`로 강제 종료

앱은 `SIGINT`를 받으면 **새 연결을 거부하고, 진행 중인 요청을 마무리하고, 리소스를 정리한 뒤** 스스로 종료해야 한다.

```js
const server = app.listen(PORT);

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[${signal}] graceful shutdown start`);

  // 1. 새 연결 수락 중지 + 진행 중 요청 완료 대기
  server.close(async (err) => {
    try {
      // 2. 외부 리소스 정리
      await db.end();
      await redis.quit();
      console.log('shutdown complete');
      process.exit(err ? 1 : 0);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

  // 3. keep-alive 연결이 server.close()를 막지 않도록 (Node 18.2+)
  server.closeIdleConnections?.();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));  // Docker/systemd 대비
```

정리 작업이 기본 대기 시간보다 오래 걸린다면 늘려준다.

```js
{ kill_timeout: 10000 }  // 10초
```

> Windows에서는 시그널이 제대로 전달되지 않으므로 `shutdown_with_message: true`로 설정하고 `process.on('message', msg => msg === 'shutdown' && ...)`로 처리한다.

### 13-3. Graceful Start

PM2는 기본적으로 프로세스가 **떴다는 것만으로** 준비 완료로 간주한다. 하지만 DB 연결, 캐시 워밍업이 끝나기 전에 트래픽을 받으면 에러가 난다.

`wait_ready`를 켜면 PM2는 앱이 **직접 `ready` 신호를 보낼 때까지** 기다린다.

```js
// ecosystem.config.js
{
  wait_ready: true,
  listen_timeout: 10000,  // 이 시간 내에 ready가 안 오면 준비된 것으로 간주하고 진행
}
```

```js
// server.js
async function bootstrap() {
  await db.connect();
  await cache.warmUp();

  const server = app.listen(PORT, () => {
    // PM2에게 준비 완료 알림
    if (process.send) process.send('ready');
  });
}

bootstrap();
```

`process.send`는 PM2(부모 프로세스)와 IPC 채널이 있을 때만 존재하므로, 로컬에서 `node server.js`로 실행해도 문제가 없도록 존재 여부를 확인한다.

### 13-4. 전체 흐름

```
pm2 reload api
   │
   ├─▶ 새 워커 0' spawn
   │      └─ DB 연결, 워밍업 ... process.send('ready')
   │
   ├─▶ (ready 수신) 기존 워커 0 에 SIGINT
   │      └─ server.close() → 진행 중 요청 완료 → exit(0)
   │      └─ kill_timeout 초과 시 SIGKILL
   │
   ├─▶ 새 워커 1' spawn ... (반복)
   ▼
 완료: 요청 유실 0
```

### 13-5. 커스텀 시그널

```bash
pm2 sendSignal SIGUSR2 api   # 앱에 임의 시그널 전송 (설정 리로드 등)
```
