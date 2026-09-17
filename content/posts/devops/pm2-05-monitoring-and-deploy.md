---
# 📌 기본 메타데이터
title: 'PM2 완전 정복 5편 — 무엇이든 띄우고, 지켜보고, 배포하기'
date: '2026-09-17'
category: 'devops'
tags: ['PM2', 'Node.js', 'Monitoring', 'Deployment']
description: 'npm 스크립트·TypeScript·Next.js·Bun·비 Node 앱을 PM2로 띄우는 방법, pm2 monit과 @pm2/io 커스텀 메트릭 및 외부 관측성 스택과의 역할 분담, Programmatic API, 그리고 pm2 deploy와 CI/CD 중 무엇을 고를지.'

# 💬 옵션 필드
draft: false
series: 'PM2 완전 정복'
seriesOrder: 5

# 📚 SEO용
keywords: ['PM2', 'pm2 monit', '@pm2/io', '커스텀 메트릭', 'Programmatic API', 'pm2 deploy', 'CI/CD', 'Next.js', 'TypeScript', 'Bun']
---

# PM2 완전 정복 5편 — 무엇이든 띄우고, 지켜보고, 배포하기

> 이전 편: [4편 — 내부 아키텍처와 클러스터 모드, 무중단 재시작](/posts/pm2-04-internals-and-cluster)
> 이번 편 키워드: 다양한 앱 실행, 모니터링과 메트릭, Programmatic API, pm2 deploy

원리를 알았으니 이제 적용 범위를 넓힐 차례다. PM2로 무엇까지 띄울 수 있는지, 띄운 뒤 무엇을 어떻게 지켜볼지, 그리고 배포를 PM2에 맡길지 CI에 맡길지를 이번 편에서 정리한다.

## 14. 다양한 앱 실행하기

### 14-1. npm 스크립트

```bash
pm2 start npm --name web -- start
pm2 start "npm run start:prod" --name web
```

```js
{
  name: 'web',
  script: 'npm',
  args: 'start',
}
```

> ⚠️ `npm`을 통해 실행하면 PM2가 감시하는 대상은 **npm 프로세스**이고 실제 앱은 그 자식이다. 시그널 전달이 꼬이거나 클러스터 모드를 쓸 수 없다. **운영에서는 실제 진입점 파일을 `script`에 직접 지정**하는 것이 좋다.

### 14-2. TypeScript

운영에서는 **빌드 후 JS를 실행**하는 것이 정석이다.

```js
{ script: './dist/main.js' }
```

개발 편의로 TS를 직접 실행해야 한다면 로더를 지정한다.

```js
{
  script: './src/main.ts',
  interpreter: 'node',
  interpreter_args: '--import tsx',
}
```

### 14-3. Next.js

```js
// 일반 빌드 (next start)
{
  name: 'next-app',
  cwd: '/srv/next-app',
  script: 'node_modules/next/dist/bin/next',
  args: 'start -p 3000',
  exec_mode: 'cluster',
  instances: 2,
  env_production: { NODE_ENV: 'production' },
}
```

```js
// output: 'standalone' 빌드
{
  name: 'next-app',
  cwd: '/srv/next-app',
  script: '.next/standalone/server.js',
  env_production: { NODE_ENV: 'production', PORT: 3000, HOSTNAME: '0.0.0.0' },
}
```

> standalone 빌드는 `public`과 `.next/static` 디렉터리를 별도로 복사해야 한다는 점을 잊지 말자.
> 또한 여러 인스턴스를 띄우면 ISR/데이터 캐시가 인스턴스마다 다를 수 있다. 캐시 일관성이 중요하다면 공유 캐시 핸들러를 고려한다.

### 14-4. Bun

PM2 7은 Bun을 위한 전용 프로세스 컨테이너를 제공해 fork·cluster 모드 모두에서 Bun을 지원한다.

```js
{
  name: 'bun-app',
  script: './index.ts',
  interpreter: 'bun',
}
```

### 14-5. 비 Node 애플리케이션

```js
{
  name: 'py-worker',
  script: './worker.py',
  interpreter: '/opt/venv/bin/python',
  exec_mode: 'fork',   // 클러스터 모드 불가
}
```

```js
{
  name: 'binary',
  script: '/usr/local/bin/my-go-server',
  interpreter: 'none',  // 실행 파일 직접 실행
  args: '--config /etc/my-go-server.yaml',
}
```

### 14-6. 정적 파일 서버

```bash
pm2 serve ./build 8080 --name spa --spa
```

`--spa`는 모든 경로를 `index.html`로 돌려준다. 간단한 내부용 페이지에는 편리하지만, 운영 트래픽이라면 Nginx가 정적 파일을 서빙하는 것이 훨씬 효율적이다.

---

## 15. 모니터링과 메트릭

### 15-1. 기본 도구

```bash
pm2 monit       # 터미널 대시보드
pm2 describe api
```

`describe`에서 볼 만한 항목:

- `restarts`: 재시작 횟수
- `unstable restarts`: `min_uptime` 이전에 죽은 횟수 → 크래시 루프의 신호
- `uptime`: 현재 인스턴스 가동 시간
- `Heap Size`, `Event Loop Latency` 등 (메트릭 수집 시)

### 15-2. 커스텀 메트릭 (@pm2/io)

```bash
npm install @pm2/io
```

```js
const io = require('@pm2/io');

// 카운터
const activeUsers = io.counter({ name: 'Active Users' });
activeUsers.inc();
activeUsers.dec();

// 초당 이벤트 수
const reqPerSec = io.meter({ name: 'req/sec' });
app.use((req, res, next) => { reqPerSec.mark(); next(); });

// 값 감시
io.metric({
  name: 'Queue Length',
  value: () => queue.length,
});
```

이 값들은 `pm2 monit`, `pm2 describe`에 표시된다.

### 15-3. 원격 액션

```js
io.action('clear-cache', async (reply) => {
  await cache.clear();
  reply({ success: true });
});
```

```bash
pm2 trigger api clear-cache
```

운영 중 재시작 없이 캐시 비우기, 로그 레벨 변경 등을 할 때 유용하다.

### 15-4. OpenTelemetry

PM2 7에서는 `pm2 install-otel`과 `--trace` 옵션으로 OpenTelemetry 트레이싱을 사용할 수 있다. 이미 Grafana Tempo, Jaeger 등 OTel 기반 관측성 스택이 있다면 연동을 검토해보자.

### 15-5. 외부 모니터링과의 역할 분담

PM2의 모니터링은 **"프로세스가 살아있는가"** 수준이다. 운영 수준의 관측성은 다음과 같이 역할을 나눈다.

| 계층 | 도구 예시 |
|---|---|
| 프로세스 생존 | PM2 |
| 메트릭 / 알림 | Prometheus + Grafana, 사내 모니터링 |
| 로그 수집 | Loki, ELK |
| 트레이싱 | OpenTelemetry |
| 외부 헬스체크 | 로드밸런서 헬스체크, 업타임 모니터 |

> PM2가 "online"이라고 해도 앱이 실제로 응답한다는 보장은 없다(데드락, 이벤트 루프 블로킹). **HTTP 헬스체크 엔드포인트**를 따로 두자.

---

## 16. Programmatic API

PM2를 Node 코드에서 직접 제어할 수 있다. 내부 운영 도구, 관리자 API 등에 쓰인다.

```js
const pm2 = require('pm2');

pm2.connect((err) => {
  if (err) {
    console.error(err);
    process.exit(2);
  }

  pm2.start(
    {
      name: 'job-runner',
      script: './job.js',
      instances: 1,
      max_memory_restart: '200M',
    },
    (err) => {
      if (err) console.error(err);

      pm2.list((err, list) => {
        list.forEach((p) => {
          console.log(p.name, p.pm2_env.status, p.monit.memory);
        });
        pm2.disconnect();  // 반드시 연결 해제
      });
    }
  );
});
```

**이벤트 버스 구독** — 프로세스 이벤트를 받아 알림을 보낼 수 있다.

```js
pm2.launchBus((err, bus) => {
  bus.on('process:event', (packet) => {
    if (packet.event === 'exit') {
      notifySlack(`${packet.process.name} exited`);
    }
  });

  bus.on('log:err', (packet) => {
    // 에러 로그 실시간 수신
  });
});
```

> `pm2.connect(true, ...)`처럼 첫 인자를 `true`로 주면 **데몬 없는 모드**(no-daemon)로 동작하며, 스크립트가 종료되면 관리하던 프로세스도 함께 종료된다.

---

## 17. 배포: pm2 deploy와 CI/CD

### 17-1. pm2 deploy

PM2에는 SSH 기반의 간단한 배포 시스템이 내장되어 있다.

```js
module.exports = {
  apps: [/* ... */],
  deploy: {
    production: {
      user: 'deploy',
      host: ['10.0.0.11', '10.0.0.12'],
      ref: 'origin/main',
      repo: 'git@github.com:org/api.git',
      path: '/srv/api',
      'pre-deploy-local': '',
      'post-deploy':
        'npm ci && npm run build && pm2 reload ecosystem.config.js --env production',
    },
  },
};
```

```bash
pm2 deploy production setup    # 최초 1회: 디렉터리 구성, clone
pm2 deploy production          # 배포
pm2 deploy production revert 1 # 이전 커밋으로 롤백
```

서버 디렉터리는 `current`(심볼릭 링크), `source`, `shared` 구조로 관리된다.

### 17-2. 현실적인 권장

`pm2 deploy`는 소규모 프로젝트에 간편하지만, 다음 한계가 있다.

- 서버에서 직접 빌드하므로 **서버마다 빌드 결과가 다를 수 있음**
- 서버가 Git 저장소에 접근할 수 있어야 함 (폐쇄망에서는 불가)
- 테스트·승인·아티팩트 관리가 없음

팀 규모의 운영이라면 **CI에서 빌드 → 아티팩트 생성 → 서버에 배포 → `pm2 reload`의** 흐름이 더 안전하다.

```yaml
# GitHub Actions 예시 (개념)
- run: npm ci && npm run build
- run: tar czf release.tgz dist package.json package-lock.json ecosystem.config.js
- run: scp release.tgz deploy@server:/srv/api/releases/
- run: |
    ssh deploy@server '
      cd /srv/api && \
      mkdir -p releases/$GITHUB_SHA && \
      tar xzf releases/release.tgz -C releases/$GITHUB_SHA && \
      cd releases/$GITHUB_SHA && npm ci --omit=dev && \
      ln -sfn /srv/api/releases/$GITHUB_SHA /srv/api/current && \
      cd /srv/api/current && pm2 reload ecosystem.config.js --env production
    '
```

> 💡 `current` 심볼릭 링크 방식이라면 ecosystem의 `cwd`를 `/srv/api/current`로 두자. 롤백은 링크만 이전 릴리스로 바꾸고 reload하면 된다.
