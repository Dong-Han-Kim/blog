---
# 📌 기본 메타데이터
title: 'PM2 완전 정복 6편 — Docker, Nginx, 폐쇄망에서 PM2를 운영하기'
date: '2026-09-17'
category: 'devops'
tags: ['PM2', 'Docker', 'Nginx', 'Air-gapped']
description: '컨테이너에서 PM2를 쓸지 말지의 판단 기준과 pm2-runtime, Nginx 리버스 프록시 구성, 인터넷이 없는 폐쇄망에서의 오프라인 설치 절차, 업그레이드 주의사항과 증상별 트러블슈팅.'

# 💬 옵션 필드
draft: false
series: 'PM2 완전 정복'
seriesOrder: 6

# 📚 SEO용
keywords: ['PM2', 'pm2-runtime', 'Docker', 'Nginx', 'reverse proxy', '폐쇄망', 'air-gapped', 'pm2 update', '트러블슈팅', 'EADDRINUSE']
---

# PM2 완전 정복 6편 — Docker, Nginx, 폐쇄망에서 PM2를 운영하기

> 이전 편: [5편 — 다양한 앱 실행·모니터링·배포](/posts/pm2-05-monitoring-and-deploy)
> 이번 편 키워드: Docker, Nginx, 폐쇄망, 업그레이드, 트러블슈팅

PM2는 혼자 돌지 않는다. 앞에는 Nginx가 있고, 밑에는 컨테이너가 있거나 인터넷이 끊긴 서버가 있다. 이번 편은 PM2를 주변 환경과 함께 놓았을 때 생기는 문제들을 다룬다.

## 18. Docker 환경에서의 PM2

### 18-1. 쓸 것인가, 말 것인가

컨테이너 환경에서는 **Docker/Kubernetes가 이미 프로세스 매니저 역할**을 한다.

| 기능 | Docker/K8s | PM2 |
|---|---|---|
| 크래시 재시작 | `restart: always`, Pod 재시작 | autorestart |
| 스케일링 | replicas | cluster instances |
| 무중단 배포 | 롤링 업데이트 | reload |
| 로그 | stdout 수집 | 파일 |

둘을 겹쳐 쓰면 **PM2가 컨테이너 안에서 조용히 재시작을 반복**해 오케스트레이터가 장애를 감지하지 못하는 문제가 생긴다.

**일반적인 권장**: Kubernetes라면 PM2 없이 `node server.js`를 직접 실행하고, 스케일링은 replica로 한다.

**PM2를 쓰는 게 합리적인 경우**

- 단일 서버에서 `docker compose`로만 운영하며, 컨테이너 하나에서 멀티코어를 쓰고 싶을 때
- 한 컨테이너에서 여러 보조 프로세스를 함께 돌려야 할 때

### 18-2. pm2-runtime

컨테이너에서는 `pm2`(데몬화) 대신 **`pm2-runtime`을 쓴다**. 포그라운드로 실행되어 컨테이너의 PID 1 역할을 하고, 로그를 stdout으로 내보내며, 시그널을 올바르게 처리한다.

```dockerfile
FROM node:22-alpine

WORKDIR /app
RUN npm install pm2 -g

COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["pm2-runtime", "ecosystem.config.js", "--env", "production"]
```

```js
// 컨테이너용 ecosystem
{
  name: 'api',
  script: './dist/server.js',
  exec_mode: 'cluster',
  instances: 2,          // max 금지: 컨테이너 CPU 제한 인식 문제
  max_memory_restart: '400M',
}
```

> ⚠️ `CMD ["pm2", "start", ...]`는 데몬을 띄우고 바로 종료되므로 컨테이너가 즉시 꺼진다. 반드시 `pm2-runtime`.

---

## 19. Nginx와 함께 쓰기

PM2 앞에 Nginx를 두는 것은 가장 흔한 운영 구성이다.

```
[Client] ─HTTPS─▶ [Nginx :443]
                     │  TLS 종료, 정적 파일, gzip, 요청 제한
                     ▼
                [PM2 cluster :3000] ─▶ worker 0..N
```

```nginx
upstream api_backend {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    # ssl_certificate ... ;

    location /static/ {
        root /srv/api/current/public;
        expires 7d;
    }

    location / {
        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    # WebSocket
    location /socket.io/ {
        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

**fork 모드 다중 포트 + sticky session**

```nginx
upstream ws_backend {
    ip_hash;
    server 127.0.0.1:4000;
    server 127.0.0.1:4001;
    server 127.0.0.1:4002;
}
```

앱에서는 `app.set('trust proxy', 1)`(Express)처럼 프록시 헤더를 신뢰하도록 설정해야 클라이언트 IP를 올바르게 얻는다.

또한 PM2 앱은 **`127.0.0.1`에만 바인딩**해서 Nginx를 우회한 직접 접근을 막는 것이 좋다.

---

## 20. 폐쇄망(에어갭) 환경에서 PM2 운영

제조·금융·공공 분야에서는 인터넷이 차단된 서버가 흔하다. 이 경우 `npm install -g pm2`와 `pm2 install`이 모두 불가능하다.

### 20-1. 오프라인 패키지 만들기 (인터넷 되는 PC)

**대상 서버와 동일한 OS 계열, 동일한 Node 메이저 버전**에서 준비한다.

```bash
mkdir pm2-offline && cd pm2-offline
npm init -y
npm install pm2@7 --omit=dev
tar czf pm2-offline.tgz node_modules package.json package-lock.json
```

### 20-2. 폐쇄망 서버에 설치

```bash
sudo mkdir -p /opt/pm2
sudo tar xzf pm2-offline.tgz -C /opt/pm2
sudo ln -sf /opt/pm2/node_modules/pm2/bin/pm2 /usr/local/bin/pm2
sudo ln -sf /opt/pm2/node_modules/pm2/bin/pm2-runtime /usr/local/bin/pm2-runtime

pm2 -v
```

`pm2 startup`이 출력하는 명령에는 이 경로(`/opt/pm2/...`)가 들어가므로, 설치 경로를 바꾸면 startup을 다시 등록해야 한다.

### 20-3. 로그 로테이션

`pm2 install pm2-logrotate`는 npm 레지스트리 접근이 필요하다. 폐쇄망에서는 **OS logrotate**([3편](/posts/pm2-03-startup-and-log-ops))를 쓰는 것이 가장 단순하고 안정적이다.

### 20-4. 앱 의존성

앱의 `node_modules`도 같은 방식으로 외부에서 준비해 반입하거나, 사내 npm 미러(Verdaccio, Nexus 등)를 운영한다. 네이티브 모듈(bcrypt, sharp 등)은 **OS·아키텍처·Node ABI가 일치해야** 하므로 반드시 동일 환경에서 빌드한다.

### 20-5. 폐쇄망 체크리스트

- [ ] 대상 서버 Node 버전 확인 (`node -v`) → PM2 7은 20 이상
- [ ] 반입 패키지 무결성(체크섬) 확인
- [ ] `pm2 startup` 등록 후 **실제로 재부팅 테스트**
- [ ] OS logrotate 설정
- [ ] `pm2 save` 이후 dump 파일 백업 (재구성 시 참고용)
- [ ] 인수인계 문서에 "어느 계정으로 PM2를 운영하는지" 명시

---

## 21. PM2 업그레이드

```bash
npm install pm2@latest -g
pm2 update
```

`pm2 update`는 **메모리에 떠 있는 구버전 데몬을 새 버전으로 교체**하면서 관리 중인 프로세스를 유지한다. 내부적으로는 save → 데몬 kill → 새 데몬 기동 → resurrect 과정이며, 이 과정에서 앱이 재시작된다.

CLI만 업그레이드하고 `pm2 update`를 잊으면 아래 경고가 나타난다.

```
>>>> In-memory PM2 is out-of-date, do:
>>>> $ pm2 update
```

**메이저 업그레이드 시 주의**

- PM2 7은 Node.js 16/18 지원을 중단했다. 서버의 Node 버전부터 확인하자.
- 트래픽이 적은 시간에 수행한다.
- 업그레이드 전 `pm2 save`로 목록을 저장해 둔다.

---

## 22. 트러블슈팅

### 앱이 `errored` 상태에서 멈춤

```bash
pm2 logs api --err --lines 100   # 앱 에러 확인
tail -n 100 ~/.pm2/pm2.log       # 데몬 로그 확인
pm2 describe api                 # unstable restarts 확인
```

대부분 `max_restarts`에 도달한 크래시 루프다. 원인을 고친 뒤:

```bash
pm2 reset api
pm2 restart api
```

**직접 실행해 보는 것**이 가장 빠른 디버깅이다.

```bash
cd /srv/api/current
NODE_ENV=production node dist/server.js
```

### `EADDRINUSE`

- fork 모드로 `instances > 1`인데 포트가 같다 → cluster 모드로 바꾸거나 `increment_var` 사용
- 이전 프로세스가 남아 있다 → `ss -ltnp | grep 3000`으로 점유 프로세스 확인
- **다른 사용자의 PM2 데몬**이 같은 앱을 띄워 놓았다 → `ps aux | grep PM2`

### `pm2 ls`에 앱이 안 보임

- 다른 계정(root 등)으로 띄웠을 가능성 → `sudo pm2 ls`, `ps aux | grep "PM2"`
- `PM2_HOME`이 다름 → `echo $PM2_HOME`

### 재부팅 후 앱이 안 뜸

```bash
systemctl status pm2-<user>
journalctl -u pm2-<user> -n 100
cat ~/.pm2/dump.pm2 | head
```

- `pm2 save`를 하지 않았다
- Node 경로가 바뀌어 서비스 파일의 PATH가 틀렸다 → unstartup 후 재등록
- 앱이 의존하는 서비스(DB 등)보다 먼저 떠서 실패했다 → 재시작 정책(지수 백오프)으로 대응하거나 systemd 유닛에 의존성 추가

### 환경 변수가 반영되지 않음

→ `--update-env` ([2편의 환경 변수 관리](/posts/pm2-02-ecosystem-and-restart))

### reload 중 502 에러

- `wait_ready` + `process.send('ready')` 미적용
- graceful shutdown 미구현으로 진행 중 요청이 끊김
- fork 모드에서는 reload가 restart와 같음 → cluster 모드 사용

### 메모리가 계속 증가하다 재시작 반복

```bash
pm2 describe api    # restarts 증가 추세 확인
```

→ 누수 조사: `node --inspect`로 힙 스냅샷 비교, `--heapsnapshot-near-heap-limit` 옵션 활용.

### 로그 디스크 가득 참

```bash
du -sh ~/.pm2/logs
pm2 flush
```

→ 로테이션 설정 ([3편의 로그 관리 심화](/posts/pm2-03-startup-and-log-ops))

## 더 깊이

- Nginx 설정 문법과 리버스 프록시 원리는 [풀스택 개발자를 위한 인프라 3강 — 웹서버와 리버스 프록시](/posts/infra-03-web-server-reverse-proxy)
- 이미지·볼륨·네트워크 등 Docker 기초는 [풀스택 개발자를 위한 인프라 4강 — Docker](/posts/infra-04-docker)
- 폐쇄망에 산출물을 반입하는 파이프라인 쪽 이야기는 [CI/CD 11강 — 폐쇄망 CI/CD](/posts/cicd-11-air-gapped-cicd)
