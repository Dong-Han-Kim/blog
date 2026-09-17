---
# 📌 기본 메타데이터
title: 'PM2 완전 정복 2편 — Ecosystem 파일로 설정을 선언하고 재시작을 설계한다'
date: '2026-09-17'
category: 'devops'
tags: ['PM2', 'Node.js', 'DevOps', 'Configuration']
description: 'CLI 옵션을 ecosystem.config.js로 옮겨 재현 가능하게 만들고, env 블록과 --update-env 함정을 정리하며, 크래시 루프 방지·지수 백오프·메모리 기반 재시작·크론 재시작까지 재시작 정책을 의도적으로 설계한다.'

# 💬 옵션 필드
draft: false
series: 'PM2 완전 정복'
seriesOrder: 2

# 📚 SEO용
keywords: ['PM2', 'ecosystem.config.js', '환경 변수', 'update-env', 'exp_backoff_restart_delay', 'max_memory_restart', 'cron_restart', 'dotenv']
---

# PM2 완전 정복 2편 — Ecosystem 파일로 설정을 선언하고 재시작을 설계한다

> 이전 편: [1편 — 프로세스 매니저가 필요한 이유와 첫 실행](/posts/pm2-01-why-and-basics)
> 이번 편 키워드: Ecosystem 파일, 환경 변수, `--update-env`, 재시작 전략

1편에서는 `pm2 start`와 몇 가지 CLI 옵션으로 앱을 띄웠다. 운영에서는 이 옵션들을 매번 손으로 입력하는 대신 파일로 선언하고, 앱이 죽었을 때의 행동까지 미리 정해 둬야 한다.

## 5. Ecosystem 파일

CLI 옵션을 매번 입력하는 건 재현성이 떨어진다. 운영에서는 **설정을 파일로 선언**하는 것이 원칙이다. 이것이 Ecosystem 파일이다.

```bash
pm2 init simple   # ecosystem.config.js 생성
```

### 기본 구조

```js
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'api',
      script: './dist/server.js',
      cwd: '/srv/api',

      // 실행 모드
      exec_mode: 'cluster',
      instances: 2,

      // 환경 변수
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 8080,
      },

      // 재시작 정책
      autorestart: true,
      max_memory_restart: '512M',
      exp_backoff_restart_delay: 100,

      // 무중단 재시작
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 5000,

      // 로그
      out_file: '/var/log/api/out.log',
      error_file: '/var/log/api/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Node 옵션
      node_args: '--max-old-space-size=1024',
    },
    {
      name: 'worker',
      script: './dist/worker.js',
      exec_mode: 'fork',
      instances: 1,
      cron_restart: '0 4 * * *',
    },
  ],
};
```

### 실행

```bash
pm2 start ecosystem.config.js                   # 전체 앱
pm2 start ecosystem.config.js --only api        # 특정 앱만
pm2 start ecosystem.config.js --env production  # env_production 적용
pm2 reload ecosystem.config.js --env production
```

### 주요 옵션 한눈에 보기

| 분류 | 옵션 | 설명 |
|---|---|---|
| 기본 | `name`, `script`, `args`, `cwd` | 이름, 실행 파일, 인자, 작업 디렉터리 |
| 런타임 | `interpreter`, `interpreter_args`, `node_args` | 실행기와 그 옵션 |
| 실행 | `exec_mode`, `instances` | `fork`/`cluster`, 인스턴스 수 (`max`, `-1` 등) |
| 재시작 | `autorestart`, `max_restarts`, `min_uptime`, `restart_delay`, `exp_backoff_restart_delay`, `stop_exit_codes` | [7장](#7-재시작-전략) 참고 |
| 자원 | `max_memory_restart` | 메모리 임계치 초과 시 재시작 |
| 스케줄 | `cron_restart` | 크론 표현식으로 주기적 재시작 |
| 감시 | `watch`, `ignore_watch`, `watch_delay` | 파일 변경 감지 |
| 종료 | `kill_timeout`, `shutdown_with_message` | 종료 대기 시간, Windows용 메시지 종료 |
| 시작 | `wait_ready`, `listen_timeout` | ready 신호 대기 |
| 로그 | `out_file`, `error_file`, `log_file`, `log_date_format`, `merge_logs`, `time` | 로그 경로와 형식 |
| 인스턴스 | `instance_var`, `increment_var` | 인스턴스 번호 변수 이름, 포트 증가 변수 |

> 💡 JSON(`ecosystem.json`)이나 YAML도 지원하지만, JS 파일은 주석과 로직(예: 경로 계산)을 넣을 수 있어 가장 많이 쓰인다.

---

## 6. 환경 변수 관리

### env 블록 전환

```js
env: { NODE_ENV: 'development' },
env_staging: { NODE_ENV: 'staging', API_URL: 'https://stg.example.com' },
env_production: { NODE_ENV: 'production', API_URL: 'https://api.example.com' },
```

```bash
pm2 start ecosystem.config.js --env staging
```

`--env <이름>`은 `env_<이름>` 블록을 `env` 위에 **덮어쓴다**.

### 가장 흔한 함정: `--update-env`

PM2는 **앱을 처음 시작할 때의 환경 변수를 기억**한다. 셸에서 환경 변수를 바꾸고 `pm2 restart`만 하면 **이전 값이 그대로** 쓰인다.

```bash
export DB_HOST=new-db.internal
pm2 restart api                 # ❌ 여전히 이전 DB_HOST
pm2 restart api --update-env    # ✅ 새 값 반영
```

Ecosystem 파일을 수정했을 때도 마찬가지로 명시적으로 반영해야 한다.

```bash
pm2 reload ecosystem.config.js --env production --update-env
```

> ⚠️ `exec_mode`나 `instances` 같은 **구조적인 설정 변경**은 reload로 온전히 반영되지 않는 경우가 있다. 이럴 땐 `pm2 delete api && pm2 start ecosystem.config.js --only api`로 새로 등록하는 것이 가장 확실하다. (짧은 다운타임이 생기므로 트래픽이 적은 시간에)

### `.env` 파일 사용

PM2 자체는 `.env`를 자동으로 읽지 않는다. 방법은 두 가지다.

```js
// 방법 1: ecosystem 파일에서 직접 로드
require('dotenv').config({ path: '/srv/api/.env' });

module.exports = {
  apps: [{
    name: 'api',
    script: './dist/server.js',
    env: {
      NODE_ENV: 'production',
      DB_HOST: process.env.DB_HOST,
    },
  }],
};
```

```bash
# 방법 2: Node 20.6+ 내장 기능 사용
# ecosystem에서 node_args: '--env-file=.env'
```

> 🔐 **비밀 값을 ecosystem 파일에 하드코딩하고 Git에 커밋하지 말 것.** 서버에만 존재하는 `.env`나 시크릿 매니저에서 주입하자.

---

## 7. 재시작 전략

PM2의 핵심 가치는 "죽으면 살린다"이다. 하지만 **무조건 살리는 것**은 오히려 위험할 수 있다. 설정을 이해하고 의도적으로 조합해야 한다.

### 7-1. 기본 동작

- `autorestart: true` (기본값): 프로세스가 종료되면 재시작
- `stop_exit_codes: [0]`: 지정한 종료 코드로 끝나면 재시작하지 않음 (정상 종료된 배치 작업 등)

### 7-2. 크래시 루프 방지

앱이 시작하자마자 죽는다면(설정 오류, DB 연결 실패 등) PM2는 무한히 재시작을 반복한다. 이를 **크래시 루프**라고 한다.

```js
{
  min_uptime: '10s',   // 이 시간보다 짧게 살아있으면 "불안정한 시작"으로 간주
  max_restarts: 10,    // 불안정한 재시작이 이 횟수를 넘으면 errored로 전환하고 포기
}
```

### 7-3. 재시작 지연

```js
// 고정 지연
restart_delay: 3000,  // 매번 3초 후 재시작

// 지수 백오프 (권장)
exp_backoff_restart_delay: 100,
```

지수 백오프를 쓰면 첫 재시작은 100ms 후, 이후 지연이 점점 늘어나 최대 15초까지 증가한다. 앱이 30초 이상 안정적으로 떠 있으면 지연이 다시 0으로 초기화된다.

**왜 지수 백오프가 좋은가?** DB가 잠시 내려간 상황을 생각해보자. 고정 간격 재시작은 DB에 연결 시도를 계속 퍼붓고 로그를 도배한다. 지수 백오프는 장애 상황에서 스스로 속도를 늦춘다.

### 7-4. 메모리 기반 재시작

```js
max_memory_restart: '512M',  // K, M, G 단위 사용
```

PM2 데몬이 주기적으로 메모리 사용량을 확인해서 임계치를 넘으면 재시작한다. 실시간 감시가 아니므로 순간적인 스파이크는 놓칠 수 있다.

> ⚠️ 이 옵션은 **안전망**이지 **해결책**이 아니다. 메모리 누수가 있다면 힙 스냅샷을 떠서 원인을 찾아야 한다. (안티패턴 섹션 참고)

`node_args: '--max-old-space-size=...'`와 함께 쓸 때는 **V8 힙 한계보다 `max_memory_restart`를 약간 낮게** 잡아야 OOM 크래시 전에 PM2가 정상적으로 재시작할 수 있다. (단, RSS에는 힙 외 메모리도 포함되므로 실제 측정값을 보고 조정할 것)

### 7-5. 크론 재시작

```js
cron_restart: '0 3 * * *',  // 매일 새벽 3시 재시작
```

재시작하지 않고 한 번만 실행하는 배치 작업이라면 `autorestart: false`와 조합한다.

```js
{
  name: 'daily-report',
  script: './jobs/report.js',
  cron_restart: '0 6 * * *',
  autorestart: false,
}
```

### 7-6. 설정 조합 예시

```js
// API 서버: 빠르게 복구하되 크래시 루프는 멈춤
{
  autorestart: true,
  exp_backoff_restart_delay: 100,
  min_uptime: '10s',
  max_restarts: 15,
  max_memory_restart: '768M',
}
```
