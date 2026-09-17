---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 CI/CD 4강 — 파이프라인 최적화: 캐시, 매트릭스, 병렬, 동시성 제어'
date: '2026-09-17'
category: 'devops'
tags: ['CI/CD', 'GitHub Actions', 'Cache', 'Performance']
description: '느린 CI는 결국 무시당합니다. 어디서 시간이 새는지 측정하고 캐시의 원리, job 병렬화, 매트릭스 빌드, concurrency 동시성 제어, 실행 자체를 건너뛰는 기법까지 적용합니다.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 CI/CD'
seriesOrder: 4

# 📚 SEO용
keywords: ['파이프라인 최적화', 'CI 캐시', 'actions/cache', '매트릭스 빌드', '병렬 job', 'concurrency', 'paths 필터', 'CI 속도']
---
# 풀스택 개발자를 위한 CI/CD 4강 — 파이프라인 최적화: 캐시, 매트릭스, 병렬, 동시성 제어

> 풀스택 개발자를 위한 CI/CD 시리즈 · 중급 4/13

파이프라인이 20분씩 걸리면 개발자는 결과를 기다리지 않고 다른 일을 시작하고, 실패 알림이 왔을 때는 이미 맥락을 잃은 상태입니다. 느린 CI는 결국 무시당합니다. 이번 강의에서는 파이프라인을 빠르고 효율적으로 만드는 기법을 다룹니다.

## 1. 먼저 측정하라

최적화 전에 **어디서 시간이 새는지** 확인합니다. Actions 탭의 실행 화면에서 job별, step별 소요 시간이 보입니다. 보통 다음 항목이 큰 비중을 차지합니다.

- 의존성 설치 (`npm ci`)
- 빌드 (`next build`)
- 브라우저 설치 (Playwright)
- E2E 테스트 실행
- Docker 이미지 빌드

추측으로 최적화하지 말고, 가장 오래 걸리는 단계부터 손봅니다.

## 2. 캐시의 원리

GitHub Actions의 캐시는 **키(key)로 저장하고 키로 복원하는 파일 묶음**입니다.

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-npm-
```

동작 순서는 다음과 같습니다.

1. `key`와 **정확히 일치**하는 캐시가 있으면 복원합니다(cache hit).
2. 없으면 `restore-keys`의 **접두사로 가장 최근 캐시**를 찾아 복원합니다(partial hit).
3. job이 성공적으로 끝나면, 정확히 일치하는 캐시가 없었던 경우에 한해 현재 `path`를 `key`로 저장합니다.

**캐시는 수정되지 않습니다.** 같은 키로 한 번 저장되면 덮어쓰지 않으므로, 내용이 바뀔 때 키도 바뀌도록 설계해야 합니다. 그래서 lockfile 해시를 키에 넣습니다.

### 캐시 범위

- 캐시는 **브랜치 단위로 격리**됩니다. PR 브랜치는 자기 브랜치 캐시와 **기본 브랜치(main) 캐시**를 읽을 수 있지만, 다른 PR 브랜치의 캐시는 읽지 못합니다.
- 그래서 main에서도 워크플로가 돌면서 캐시를 만들어 두어야 새 PR의 첫 실행이 빨라집니다.
- 저장소별 용량 한도가 있고, 한도를 넘거나 오래 쓰이지 않은 캐시는 자동으로 정리됩니다.

### 무엇을 캐시할까

| 대상 | 경로 | 비고 |
|---|---|---|
| npm 다운로드 캐시 | `~/.npm` | `setup-node`의 `cache: npm`이 처리 |
| Next.js 빌드 캐시 | `.next/cache` | 증분 빌드로 빌드 시간 단축 |
| Playwright 브라우저 | `~/.cache/ms-playwright` | Playwright 버전을 키에 포함 |
| Docker 레이어 | BuildKit 캐시 | 5강에서 다룸 |

`node_modules`를 통째로 캐시하는 방법도 있지만, Node 버전이나 OS가 바뀌면 네이티브 모듈이 깨질 수 있습니다. 기본은 **다운로드 캐시** + `npm ci`가 안전합니다.

### Next.js 빌드 캐시

```yaml
- uses: actions/cache@v4
  with:
    path: ${{ github.workspace }}/.next/cache
    key: ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-${{ hashFiles('**/*.[jt]s', '**/*.[jt]sx') }}
    restore-keys: |
      ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-
```

소스가 바뀌면 키가 바뀌어 새 캐시가 저장되고, 복원은 `restore-keys`로 직전 캐시를 가져와 증분 빌드에 씁니다. 이 캐시가 없으면 빌드 로그에 "No build cache found" 경고가 보입니다.

### Playwright 브라우저 캐시

```yaml
- id: pw
  run: echo "version=$(npx playwright --version | awk '{print $2}')" >> "$GITHUB_OUTPUT"

- uses: actions/cache@v4
  id: pw-cache
  with:
    path: ~/.cache/ms-playwright
    key: ${{ runner.os }}-playwright-${{ steps.pw.outputs.version }}

- if: steps.pw-cache.outputs.cache-hit != 'true'
  run: npx playwright install --with-deps chromium

- if: steps.pw-cache.outputs.cache-hit == 'true'
  run: npx playwright install-deps chromium   # OS 패키지는 캐시되지 않으므로 설치
```

## 3. 병렬화: job 나누기

서로 의존하지 않는 검사는 별도 job으로 나눠 동시에 실행합니다.

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps: [ ... npm ci, npm run lint ]
  typecheck:
    runs-on: ubuntu-latest
    steps: [ ... npm ci, npm run typecheck ]
  unit:
    runs-on: ubuntu-latest
    steps: [ ... npm ci, npm test ]
  build:
    needs: [lint, typecheck, unit]
    runs-on: ubuntu-latest
    steps: [ ... ]
```

**트레이드오프**: job마다 체크아웃과 의존성 설치가 반복됩니다. 설치가 30초이고 각 검사가 10초라면 나누는 게 오히려 손해입니다. 검사 하나하나가 설치 시간보다 충분히 길 때 병렬화가 이득입니다. 비공개 저장소라면 **실행 시간(분) 합계가 비용**이라는 점도 고려합니다.

반복되는 설치 step은 10강에서 composite action으로 묶어 중복을 줄입니다.

## 4. 매트릭스 빌드

같은 job을 여러 조합으로 돌릴 때 `strategy.matrix`를 씁니다.

```yaml
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false            # 하나가 실패해도 나머지는 계속
      matrix:
        os: [ubuntu-latest, windows-latest]
        node: [20, 22]
        include:
          - os: ubuntu-latest
            node: 24
            experimental: true
        exclude:
          - os: windows-latest
            node: 20
    continue-on-error: ${{ matrix.experimental == true }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm test
```

- 애플리케이션은 보통 운영 Node 버전 하나만 테스트하면 충분합니다. 매트릭스는 **여러 환경을 지원해야 하는 라이브러리**나 **런타임 업그레이드 준비**에 유용합니다.
- `fail-fast`의 기본값은 `true`로, 하나가 실패하면 나머지를 취소합니다. 어느 조합이 실패하는지 전체를 보고 싶으면 `false`로 둡니다.

### 테스트 샤딩

매트릭스는 느린 테스트를 쪼개는 데도 씁니다.

```yaml
jobs:
  e2e:
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    runs-on: ubuntu-latest
    steps:
      # ... 설치, 빌드
      - run: npx playwright test --shard=${{ matrix.shard }}/4
```

E2E 12분이 4개 머신에서 약 3분씩으로 줄어듭니다. 각 샤드마다 빌드가 반복되므로, 빌드 결과를 앞 job에서 아티팩트로 만들어 넘기면 더 빨라집니다.

## 5. 동시성 제어(concurrency)

PR에 커밋을 연달아 push하면 이전 커밋의 워크플로는 더 이상 의미가 없습니다. `concurrency`로 오래된 실행을 취소합니다.

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

- 같은 `group`에 속한 실행은 동시에 하나만 진행됩니다.
- PR에서는 이전 실행을 취소하고, main push에서는 취소하지 않고 순서대로 대기시킵니다. main의 각 커밋은 기록과 배포 대상으로서 의미가 있기 때문입니다.

**배포 job에는 반드시 concurrency를 겁니다.** 두 배포가 동시에 서버에 접근하면 결과를 예측할 수 없습니다.

```yaml
jobs:
  deploy:
    concurrency:
      group: deploy-production
      cancel-in-progress: false     # 진행 중인 배포는 절대 중간에 끊지 않음
```

## 6. 실행 자체를 건너뛰기

### 경로 필터

```yaml
on:
  pull_request:
    paths-ignore:
      - 'docs/**'
      - '**.md'
```

문서만 바뀐 PR에서 전체 파이프라인을 돌릴 필요는 없습니다.

**주의할 함정**: 워크플로 수준의 경로 필터로 워크플로가 아예 실행되지 않으면, 그 워크플로의 job이 **필수 체크로 지정되어 있을 때 PR이 영원히 "대기 중"** 상태가 됩니다. 필수 체크와 경로 필터를 함께 쓰려면 워크플로는 항상 실행하고, **job 수준에서** 변경 여부를 판단해 건너뛰는 방식을 씁니다(10강에서 `dorny/paths-filter`와 집계 job 패턴으로 다룹니다). job이 `if` 조건으로 skipped되면 필수 체크는 통과로 간주됩니다.

### 조건부 step

```yaml
- name: 운영 빌드에서만 소스맵 업로드
  if: github.ref == 'refs/heads/main'
  run: npm run upload-sourcemaps
```

## 7. 그 밖의 최적화

- **`timeout-minutes`**: 멈춘 job이 자원을 낭비하지 않게 합니다.
- **얕은 체크아웃**: 기본값 `fetch-depth: 1`을 유지하고, 전체 이력이 필요한 경우(변경 파일 비교, 릴리스 노트 생성)에만 `fetch-depth: 0`을 씁니다.
- **큰 Runner**: 빌드가 CPU 병목이라면 코어가 많은 larger runner나 self-hosted runner가 비용 대비 효과적일 수 있습니다.
- **불필요한 작업 제거**: `postinstall`에서 무거운 작업을 하는 패키지, 매번 도는 코드 생성 등을 점검합니다.
- **테스트 자체 속도**: 테스트 러너의 병렬 워커 수, 느린 테스트 상위 10개 개선이 캐시보다 효과가 클 때가 많습니다.

## 8. 최적화된 CI 예시

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    strategy:
      fail-fast: false
      matrix:
        task: [lint, typecheck, test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm run ${{ matrix.task }}

  build:
    needs: verify
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - uses: actions/cache@v4
        with:
          path: ${{ github.workspace }}/.next/cache
          key: ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-${{ hashFiles('**/*.[jt]s', '**/*.[jt]sx') }}
          restore-keys: |
            ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-
      - run: npm run build
```

매트릭스를 "검사 종류"로 활용해 lint, typecheck, test를 한 정의로 병렬 실행하는 패턴입니다.

## 9. 정리

- 최적화는 측정부터 시작합니다.
- 캐시는 키로 저장·복원되며 수정되지 않으므로, 내용이 바뀔 때 키가 바뀌도록 설계합니다.
- 병렬화는 설치 비용과 검사 시간의 균형을 보고 결정합니다.
- 매트릭스는 환경 조합과 테스트 샤딩에 씁니다.
- PR에서는 이전 실행을 취소하고, 배포는 절대 동시에 실행되지 않게 concurrency를 겁니다.
- 경로 필터와 필수 체크를 함께 쓸 때는 job 수준 필터를 사용합니다.

## 확인 문제와 해설

**Q1.** 캐시 키를 `npm-cache`라는 고정 문자열로 두었더니 새 패키지를 추가해도 설치가 느립니다. 왜일까요?

> 캐시는 같은 키로 덮어쓰지 않기 때문에 처음 저장된 오래된 캐시만 계속 복원됩니다. lockfile 해시를 키에 포함해야 합니다.

**Q2.** 새로 만든 PR의 첫 실행에서 캐시가 전혀 복원되지 않습니다. 가능한 원인은요?

> main 브랜치에서 워크플로가 실행된 적이 없어 기본 브랜치 캐시가 없는 경우입니다. PR 브랜치는 다른 PR의 캐시를 읽을 수 없습니다.

**Q3.** main에 빠르게 두 번 머지되었을 때 배포 job에 `cancel-in-progress: true`를 두면 어떤 위험이 있나요?

> 첫 번째 배포가 서버 교체 도중에 취소되어 절반만 반영된 상태가 될 수 있습니다. 배포는 취소하지 않고 순서대로 대기시켜야 합니다.
