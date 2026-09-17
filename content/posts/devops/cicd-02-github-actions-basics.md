---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 CI/CD 2강 — GitHub Actions 해부와 첫 워크플로'
date: '2026-09-17'
category: 'devops'
tags: ['CI/CD', 'GitHub Actions', 'Next.js', 'Workflow']
description: 'Workflow·Event·Job·Step·Action의 구성 요소부터 트리거와 표현식·컨텍스트, Next.js 첫 CI 워크플로 작성, job 분리와 아티팩트 전달, Runner 이해와 디버깅까지 다룹니다.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 CI/CD'
seriesOrder: 2

# 📚 SEO용
keywords: ['GitHub Actions', 'CI/CD', 'workflow', 'job', 'step', 'runner', '아티팩트', 'Next.js CI', '상태 배지']
---
# 풀스택 개발자를 위한 CI/CD 2강 — GitHub Actions 해부와 첫 워크플로

> 풀스택 개발자를 위한 CI/CD 시리즈 · 기초 2/13

1강에서 파이프라인의 개념을 잡았다면, 이번 강의에서는 그 개념이 GitHub Actions에서 어떤 문법으로 표현되는지 보고 Next.js 프로젝트에 첫 CI 워크플로를 붙입니다.

> 이 시리즈의 예제에 나오는 액션 버전(`@v4` 등)은 작성 시점 기준입니다. 실제로 적용할 때는 각 액션 저장소의 최신 릴리스를 확인하세요.

## 1. 구성 요소 한눈에 보기

```
Repository
└── .github/workflows/
    ├── ci.yml          ← Workflow (파일 하나 = 워크플로 하나)
    │   ├── on:         ← Event (언제 실행할까)
    │   └── jobs:
    │       ├── lint    ← Job (Runner 한 대에서 실행)
    │       │   └── steps:
    │       │       ├── uses: ...   ← Action (재사용 가능한 부품)
    │       │       └── run: ...    ← 셸 명령
    │       └── test
    └── deploy.yml
```

| 구성 요소 | 설명 |
|---|---|
| **Workflow** | `.github/workflows/` 아래의 YAML 파일 하나입니다. |
| **Event** | 워크플로를 실행시키는 사건으로, `on:`에 정의합니다. |
| **Job** | 하나의 Runner에서 실행되는 step 묶음입니다. job마다 **새 가상 머신**에서 시작하므로 job 사이에 파일이 공유되지 않습니다. |
| **Step** | job 안에서 순서대로 실행되고, 같은 job의 step끼리는 파일 시스템을 공유합니다. |
| **Action** | `uses:`로 가져다 쓰는 재사용 부품입니다. 체크아웃, 런타임 설치, 캐시 등이 있습니다. |
| **Runner** | job을 실행하는 머신입니다. `runs-on:`으로 지정합니다. |

"job 사이에는 파일이 공유되지 않는다"는 점은 처음 헷갈리기 쉬운 부분입니다. build job에서 만든 `.next` 폴더를 deploy job에서 쓰려면 아티팩트로 넘겨야 합니다(뒤에서 다룹니다).

## 2. 트리거(on) 정리

```yaml
on:
  push:
    branches: [main]
    tags: ['v*']            # v로 시작하는 태그 push
    paths-ignore:
      - '**.md'             # 문서만 바뀌면 실행하지 않음
  pull_request:
    branches: [main]        # main을 대상으로 하는 PR
  workflow_dispatch:        # Actions 탭에서 수동 실행 버튼
    inputs:
      environment:
        type: choice
        options: [staging, production]
  schedule:
    - cron: '0 18 * * *'    # 매일 18:00 UTC = 한국 시간 새벽 3시
```

알아 둘 점이 몇 가지 있습니다.

- `schedule`의 cron은 **UTC 기준**이고, 기본 브랜치의 워크플로 파일로만 동작합니다. 부하가 몰리는 시간에는 지연될 수 있습니다.
- `pull_request`는 PR 브랜치와 대상 브랜치를 **병합한 결과**를 기준으로 실행됩니다. "합쳤을 때도 괜찮은가"를 검사하는 셈입니다.
- 포크(fork)에서 올라온 PR에는 기본적으로 **시크릿이 전달되지 않습니다**. 공개 저장소 보안을 위한 동작입니다(7강에서 자세히 다룹니다).

## 3. 표현식과 컨텍스트

`${{ }}` 안에는 표현식을 씁니다. 자주 쓰는 컨텍스트는 다음과 같습니다.

| 컨텍스트 | 예시 | 내용 |
|---|---|---|
| `github` | `github.sha`, `github.ref_name`, `github.event_name` | 커밋, 브랜치, 이벤트 정보 |
| `env` | `env.NODE_ENV` | 워크플로/잡/스텝에 정의한 환경변수 |
| `vars` | `vars.API_URL` | 저장소·환경에 등록한 일반 변수 |
| `secrets` | `secrets.DEPLOY_KEY` | 암호화된 시크릿 |
| `steps` | `steps.meta.outputs.tags` | 같은 job 안 이전 step의 출력 |
| `needs` | `needs.build.outputs.image` | 선행 job의 출력과 결과 |
| `runner` | `runner.os` | Runner 정보 |

조건 실행은 `if:`로 합니다.

```yaml
- name: 운영 배포
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  run: ./deploy.sh

- name: 실패했을 때만 리포트 업로드
  if: failure()
  run: echo "테스트 실패"
```

상태 함수로는 `success()`(기본값), `failure()`, `cancelled()`, `always()`가 있습니다.

## 4. 첫 워크플로: Next.js CI

먼저 `package.json`에 파이프라인에서 호출할 스크립트를 준비합니다. **파이프라인은 스크립트를 호출만 하고, 실제 명령은 `package.json`에 둔다**는 원칙을 지키면 로컬과 CI에서 같은 명령을 쓸 수 있습니다.

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

Node 버전은 `.nvmrc` 파일로 고정합니다.

```
22
```

이제 `.github/workflows/ci.yml`을 작성합니다.

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

# GITHUB_TOKEN 권한을 최소로 제한
permissions:
  contents: read

jobs:
  ci:
    name: Lint, Test, Build
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: 코드 체크아웃
        uses: actions/checkout@v4

      - name: Node.js 설치
        uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm              # ~/.npm 캐시 자동 처리

      - name: 의존성 설치
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: 타입 체크
        run: npm run typecheck

      - name: 단위 테스트
        run: npm test

      - name: 빌드
        run: npm run build
        env:
          NEXT_TELEMETRY_DISABLED: 1
```

한 줄씩 짚어 보겠습니다.

- **`permissions`**: 워크플로에는 `GITHUB_TOKEN`이 자동 발급되는데, 필요한 권한만 명시해 두는 습관이 보안의 시작입니다.
- **`timeout-minutes`**: 기본값은 360분(6시간)입니다. 무한 대기에 빠진 테스트가 실행 시간을 다 잡아먹지 않도록 반드시 줄여 둡니다.
- **`actions/checkout`**: Runner는 빈 머신이라 코드를 먼저 받아야 합니다. 기본적으로 최신 커밋 하나만 받습니다(`fetch-depth: 1`).
- **`cache: npm`**: `package-lock.json` 해시를 키로 npm 캐시를 저장하고 복원합니다.
- **`npm ci`**: lockfile과 정확히 일치하게 설치하고, `node_modules`를 지우고 새로 설치합니다. lockfile과 `package.json`이 어긋나면 **실패**합니다. CI에서 `npm install`을 쓰면 lockfile이 조용히 바뀔 수 있으므로 쓰지 않습니다.

pnpm을 쓴다면 설치 부분만 바꾸면 됩니다.

```yaml
      - uses: pnpm/action-setup@v4       # package.json의 packageManager 필드로 버전 결정
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
```

## 5. job 나누기와 아티팩트 전달

하나의 job에 모든 step을 넣으면 단순하지만, 단계별 결과가 한눈에 안 보입니다. job을 나누고 `needs`로 순서를 잡아 보겠습니다.

```yaml
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test

  build:
    needs: verify                    # verify 성공 후 실행
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.ver.outputs.version }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm run build
      - id: ver
        run: echo "version=$(node -p "require('./package.json').version")" >> "$GITHUB_OUTPUT"
      - name: 빌드 결과를 아티팩트로 업로드
        uses: actions/upload-artifact@v4
        with:
          name: next-build
          path: |
            .next
            !.next/cache
          retention-days: 7

  report:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: next-build
          path: .next
      - run: |
          echo "버전: ${{ needs.build.outputs.version }}"
          du -sh .next
```

- step의 출력은 `$GITHUB_OUTPUT` 파일에 `key=value`를 쓰는 방식으로 만듭니다.
- job 출력(`outputs`)은 문자열만 전달할 수 있습니다. 파일은 아티팩트로 넘깁니다.
- 아티팩트는 이 강의처럼 job 사이 전달에도 쓰지만, 테스트 리포트나 빌드 결과를 **사람이 내려받아 확인하는 용도**로도 많이 씁니다.

실무에서는 5강부터 빌드 산출물을 아티팩트 대신 **Docker 이미지**로 만들고 레지스트리에 올립니다. 아티팩트는 보관 기간이 짧고 배포용 저장소가 아니기 때문입니다.

## 6. Runner 이해하기

| 구분 | GitHub-hosted | Self-hosted |
|---|---|---|
| 관리 | GitHub이 관리하며 매 job마다 깨끗한 VM 제공 | 직접 설치·패치·보안 관리 |
| 환경 | `ubuntu-latest`, `windows-latest`, `macos-latest` 등 | 원하는 OS, 하드웨어, 네트워크 |
| 비용 | 공개 저장소 무료, 비공개 저장소는 플랜별 무료 분 제공 후 과금 | 머신 비용 |
| 적합한 경우 | 대부분의 일반 프로젝트 | 내부망 접근, 특수 하드웨어, 폐쇄망 |

`ubuntu-latest`는 시간이 지나면 가리키는 버전이 바뀝니다. 재현성이 중요하다면 `ubuntu-24.04`처럼 버전을 명시하는 것도 방법입니다.

## 7. 디버깅 방법

1. **로그 읽기**: Actions 탭에서 실패한 step을 펼칩니다. 대부분의 원인은 여기서 보입니다.
2. **디버그 로그 켜기**: 실패한 실행을 "Re-run jobs"할 때 "Enable debug logging"을 체크하면 상세 로그가 나옵니다.
3. **컨텍스트 출력**: 이벤트 데이터가 궁금하면 잠깐 출력해 봅니다. 단, 시크릿이 담길 수 있는 컨텍스트는 출력하지 않습니다.
   ```yaml
   - run: echo '${{ toJSON(github.event) }}'
   ```
4. **로컬 실행**: [act](https://github.com/nektos/act)를 쓰면 Docker로 워크플로를 로컬에서 흉내 낼 수 있습니다. 완전히 같지는 않으니 문법 확인 용도로 씁니다.
5. **YAML 검증**: 들여쓰기 한 칸 차이로 워크플로가 아예 인식되지 않을 수 있습니다. 에디터에 GitHub Actions 확장을 설치하고, [actionlint](https://github.com/rhysd/actionlint)로 정적 검사를 하면 좋습니다.

## 8. 자주 하는 실수

| 실수 | 결과 | 해결 |
|---|---|---|
| lockfile을 커밋하지 않음 | `npm ci` 실패 또는 매번 다른 의존성 | lockfile을 반드시 커밋 |
| CI에서 `npm install` 사용 | lockfile이 몰래 바뀌어 재현성 붕괴 | `npm ci` 사용 |
| `timeout-minutes` 미설정 | 멈춘 job이 최대 6시간 실행 | 적절한 타임아웃 설정 |
| job 간 파일 공유를 기대 | 다음 job에서 파일 없음 | 아티팩트 또는 이미지로 전달 |
| `permissions` 생략 | 필요 이상 권한의 토큰이 발급될 수 있음 | 최소 권한 명시 |
| 워크플로 파일 위치 오류 | 아예 실행되지 않음 | `.github/workflows/*.yml` 확인 |

## 9. README에 상태 배지 달기

```markdown
![CI](https://github.com/<OWNER>/<REPO>/actions/workflows/ci.yml/badge.svg)
```

main 브랜치의 상태가 README에 표시되어, "지금 main이 건강한가"를 모두가 볼 수 있습니다.

## 10. 정리

- 워크플로는 Event → Job → Step 구조이며, job마다 새 머신에서 실행됩니다.
- 명령은 `package.json` 스크립트에 두고, 파이프라인은 호출만 합니다.
- CI에서는 `npm ci`, 버전 고정(`.nvmrc`), 최소 권한, 타임아웃이 기본입니다.
- job 간 데이터는 `outputs`(문자열)와 아티팩트(파일)로 전달합니다.

## 확인 문제와 해설

**Q1.** build job에서 `npm run build`를 하고, 다음 deploy job에서 `ls .next`를 했더니 폴더가 없습니다. 이유는요?

> job마다 새 Runner에서 실행되어 파일 시스템이 공유되지 않기 때문입니다. `upload-artifact`/`download-artifact`로 넘기거나, 이미지를 만들어 레지스트리로 전달해야 합니다.

**Q2.** 매일 한국 시간 오전 9시에 실행하려면 cron을 어떻게 적어야 할까요?

> cron은 UTC 기준이므로 9시간을 뺀 `0 0 * * *`입니다.

**Q3.** 로컬에서는 되는데 CI에서만 `npm ci`가 실패합니다. 가장 먼저 의심할 것은요?

> `package.json`과 `package-lock.json`의 불일치입니다. 로컬에서 `npm install`로 패키지를 추가하고 lockfile을 커밋하지 않은 경우가 가장 흔합니다.
