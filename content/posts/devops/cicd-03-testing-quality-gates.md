---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 CI/CD 3강 — 테스트 전략과 품질 게이트'
date: '2026-09-17'
category: 'devops'
tags: ['CI/CD', 'Testing', 'Playwright', 'Vitest', 'Quality Gate']
description: '정적 분석부터 E2E까지 테스트를 파이프라인 어디에 둘지 설계하고, 서비스 컨테이너로 실제 DB 통합 테스트를 돌리고, 불안정한 테스트를 다루며 브랜치 보호 규칙으로 머지 게이트를 만듭니다.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 CI/CD'
seriesOrder: 3

# 📚 SEO용
keywords: ['테스트 전략', '품질 게이트', '테스트 피라미드', '테스팅 트로피', 'Vitest', 'Playwright', '서비스 컨테이너', 'flaky test', '브랜치 보호 규칙']
---
# 풀스택 개발자를 위한 CI/CD 3강 — 테스트 전략과 품질 게이트

> 풀스택 개발자를 위한 CI/CD 시리즈 · 기초 3/13

CI의 신뢰도는 테스트의 신뢰도를 넘을 수 없습니다. 파이프라인이 초록불이어도 테스트가 부실하면 그 초록불은 아무 의미가 없습니다. 이번 강의에서는 어떤 테스트를 파이프라인 어디에 둘지 설계하고, "통과하지 않으면 머지할 수 없는" 게이트를 만듭니다.

## 1. 테스트의 종류와 배치

| 종류 | 검증 대상 | 속도 | 대표 도구 | 파이프라인 위치 |
|---|---|---|---|---|
| 정적 분석 | 문법, 스타일, 타입 | 수 초 | ESLint, TypeScript | 가장 앞 |
| 단위 테스트 | 함수, 컴포넌트 하나 | 수 초~수십 초 | Vitest, Jest | 앞 |
| 통합 테스트 | API + 실제 DB, 모듈 간 연결 | 수십 초~수 분 | Vitest + 테스트 DB, Supertest | 중간 |
| E2E 테스트 | 브라우저에서 사용자 흐름 전체 | 수 분 | Playwright, Cypress | 뒤 |
| 스모크 테스트 | 배포 직후 핵심 기능 생존 여부 | 수 초 | curl, 간단한 Playwright | 배포 후 |

### 피라미드와 트로피

전통적인 **테스트 피라미드**는 단위 테스트를 가장 많이, E2E를 가장 적게 두라고 말합니다. 프론트엔드 진영에서는 **테스팅 트로피**라는 변형도 많이 쓰는데, 구현 세부에 묶이는 단위 테스트보다 **통합 테스트에 가장 큰 비중**을 두자는 주장입니다.

풀스택 관점에서 실용적인 기준은 다음과 같습니다.

- **순수 로직**(계산, 변환, 검증 규칙)은 단위 테스트로 촘촘하게 검증합니다.
- **API와 DB가 만나는 곳**은 모킹 대신 실제 DB로 통합 테스트를 합니다. SQL 오류, 제약 조건 위반, 마이그레이션 누락은 모킹으로 절대 잡히지 않습니다.
- **E2E는 핵심 사용자 흐름 몇 개**(로그인, 핵심 조회, 핵심 저장)에 집중합니다. 모든 것을 E2E로 검증하려 하면 느리고 불안정한 파이프라인이 됩니다.

## 2. 단위 테스트와 커버리지 기준

Vitest에서 커버리지 기준을 설정하면, 기준 미달 시 테스트 명령 자체가 실패합니다. 이것이 가장 단순한 품질 게이트입니다.

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 70,
        branches: 60,
        functions: 70,
      },
    },
  },
});
```

```yaml
- run: npx vitest run --coverage --reporter=default --reporter=github-actions
```

`github-actions` 리포터를 쓰면 실패한 테스트 위치가 PR의 코드 라인에 주석(annotation)으로 표시됩니다.

**커버리지 수치에 대한 주의**: 커버리지는 "테스트가 실행한 코드의 비율"이지 "검증한 코드의 비율"이 아닙니다. 단언(assert) 없는 테스트로도 100%를 만들 수 있습니다. 목표 숫자를 너무 높게 잡으면 의미 없는 테스트만 늘어나므로, **기준선이 떨어지지 않게 막는 용도**로 쓰는 편이 건강합니다.

## 3. 서비스 컨테이너로 실제 DB 통합 테스트

GitHub Actions의 `services`를 쓰면 job이 실행되는 동안 옆에 DB 컨테이너를 띄울 수 있습니다.

```yaml
jobs:
  integration:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: app
          POSTGRES_PASSWORD: app
          POSTGRES_DB: app_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U app"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10

    env:
      DATABASE_URL: postgresql://app:app@localhost:5432/app_test

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - name: 마이그레이션 적용
        run: npx prisma migrate deploy
      - name: 통합 테스트
        run: npm run test:integration
```

핵심 포인트는 다음과 같습니다.

- **`--health-cmd`**: DB가 실제로 접속 가능해질 때까지 step 실행을 기다립니다. 이게 없으면 "connection refused"로 간헐적으로 실패합니다.
- **마이그레이션을 먼저 적용**: 테스트 DB 스키마를 운영과 같은 방법으로 만듭니다. 이 과정이 곧 **마이그레이션 파일 자체에 대한 테스트**가 됩니다.
- **테스트 간 격리**: 각 테스트는 트랜잭션 롤백이나 테이블 초기화로 서로 영향을 주지 않게 합니다.
- **운영과 같은 DB 엔진과 버전**: 운영이 PostgreSQL 16이면 테스트도 16을 씁니다. SQLite로 대체하면 방언 차이로 잡히지 않는 버그가 생깁니다.

> Oracle처럼 컨테이너 이미지가 무겁거나 라이선스 제약이 있는 DB는 서비스 컨테이너로 띄우기 어렵습니다. 이런 경우 공유 테스트 DB에 스키마를 분리해 쓰거나, self-hosted runner에서 내부 테스트 DB에 접속하는 방식을 씁니다(11강).

## 4. E2E 테스트: Playwright

```yaml
jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - name: 브라우저 설치
        run: npx playwright install --with-deps chromium
      - name: 빌드
        run: npm run build
      - name: E2E 실행
        run: npx playwright test
      - name: 실패 시 리포트 업로드
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

Playwright 설정에서 CI일 때의 동작을 따로 잡아 둡니다.

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,         // test.only가 남아 있으면 실패
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',            // 재시도 시 트레이스 저장
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run start',           // 빌드된 앱을 실행
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- `CI` 환경변수는 GitHub Actions가 자동으로 `true`로 설정합니다.
- **개발 서버(`next dev`)가 아니라 빌드한 결과물(`next start`)로 테스트**해야 운영과 가까운 결과를 얻습니다.
- 실패 시 트레이스와 스크린샷을 아티팩트로 받으면, 원격 환경에서만 나는 실패를 재현하지 않고도 분석할 수 있습니다.

## 5. 불안정한 테스트(Flaky Test) 다루기

같은 코드인데 가끔 실패하는 테스트는 CI의 신뢰를 무너뜨리는 가장 큰 적입니다. 사람들이 "또 그거네" 하며 재실행 버튼만 누르기 시작하면, 진짜 실패도 무시하게 됩니다.

흔한 원인과 대응은 다음과 같습니다.

| 원인 | 대응 |
|---|---|
| 고정 시간 대기(`sleep 2000`) | 조건 기반 대기(요소 표시, 응답 수신)로 변경 |
| 테스트 간 공유 상태 | 테스트마다 데이터 생성·정리, 순서 의존 제거 |
| 현재 시각, 난수, 시간대 의존 | 시계 고정(fake timers), 시드 고정, `TZ` 명시 |
| 외부 API 호출 | 테스트 환경에서 목 서버 사용 |
| 동시 실행 경쟁 | 병렬 실행 시 데이터 격리 |

운영 방침으로는 **재시도는 최대 1회**로 제한하고, 재시도로 통과한 테스트를 기록해 두었다가 **격리(quarantine) 목록**으로 옮겨 수정 일정을 잡습니다. 재시도 횟수를 늘려 문제를 덮는 것은 해결이 아닙니다.

## 6. 품질 게이트: 브랜치 보호 규칙

테스트를 돌리는 것만으로는 부족합니다. **실패했을 때 머지를 막아야** 게이트가 됩니다. 저장소 Settings → Rules(Rulesets) 또는 Branch protection에서 main에 다음을 설정합니다.

- **Require a pull request before merging**: main에 직접 push 금지
- **Require approvals**: 최소 1명 리뷰 승인
- **Require status checks to pass**: 지정한 CI job이 성공해야 머지 가능
- **Require branches to be up to date**: 최신 main을 반영한 상태에서 검사 통과
- **Block force pushes**: 강제 push 금지

**필수 체크(required status check)는 job 이름으로 지정**됩니다. 그래서 job의 `name`을 자주 바꾸면 보호 규칙이 깨집니다. 게이트로 쓸 job 이름은 안정적으로 유지하세요.

### Merge Queue

"최신 main 반영 후 검사 통과" 규칙은 PR이 많아지면 병목이 됩니다. 한 PR이 머지될 때마다 나머지 PR이 모두 다시 업데이트하고 검사를 기다려야 하기 때문입니다. **Merge queue**를 켜면 GitHub이 머지 대기 PR들을 순서대로 main 위에 쌓아 검사한 뒤 자동으로 머지합니다. 이 경우 워크플로에 `merge_group` 이벤트를 추가해야 합니다.

```yaml
on:
  pull_request:
  merge_group:
```

## 7. 로컬 훅과의 역할 분담

husky와 lint-staged로 커밋 전에 lint를 돌리는 것도 좋은 습관이지만, **로컬 훅은 CI의 대체재가 아닙니다.** `--no-verify`로 쉽게 우회할 수 있고 개발자마다 환경이 다르기 때문입니다.

| 위치 | 역할 |
|---|---|
| 에디터 | 즉각적인 피드백 (저장 시 포맷, 타입 오류 표시) |
| pre-commit 훅 | 변경 파일에 대한 빠른 lint·포맷 (수 초 이내) |
| CI | **최종 판정**. 깨끗한 환경에서 전체 검사 |

## 8. 파이프라인 구성 예시

```
PR 생성/업데이트
 ├─ lint ─────────┐
 ├─ typecheck ────┤
 ├─ unit test ────┼─→ build ─→ e2e
 └─ integration ──┘
          (모두 필수 체크)
```

빠른 검사 네 개를 병렬로 돌리고, 모두 통과하면 빌드와 E2E로 넘어갑니다. job 병렬화와 캐시는 4강에서 다룹니다.

## 9. 정리

- 순수 로직은 단위 테스트로, API와 DB의 경계는 실제 DB 통합 테스트로, 핵심 흐름은 E2E로 검증합니다.
- 서비스 컨테이너와 헬스체크로 운영과 같은 DB 엔진을 CI에서 띄웁니다.
- E2E는 빌드된 앱을 대상으로 실행하고, 실패 시 트레이스를 아티팩트로 남깁니다.
- Flaky 테스트는 재시도로 덮지 말고 격리 후 수정합니다.
- 브랜치 보호와 필수 체크를 설정해야 테스트가 비로소 게이트가 됩니다.

## 확인 문제와 해설

**Q1.** 통합 테스트에서 가끔 "connection refused"가 납니다. 가장 먼저 확인할 설정은요?

> 서비스 컨테이너의 `--health-cmd` 설정입니다. DB가 준비되기 전에 테스트가 시작되고 있을 가능성이 높습니다.

**Q2.** 커버리지 기준을 95%로 올렸더니 테스트 수는 늘었는데 버그는 줄지 않았습니다. 왜일까요?

> 커버리지는 코드가 실행되었는지만 측정하고, 결과가 올바른지는 측정하지 않습니다. 숫자를 맞추기 위한 단언 없는 테스트가 늘었을 가능성이 큽니다.

**Q3.** CI job의 `name`을 "Test"에서 "Unit Tests"로 바꾼 뒤 PR이 영원히 머지 대기 상태입니다. 원인은요?

> 브랜치 보호 규칙의 필수 체크가 여전히 "Test"라는 이름을 기다리고 있기 때문입니다. 보호 규칙의 체크 이름도 함께 바꿔야 합니다.
