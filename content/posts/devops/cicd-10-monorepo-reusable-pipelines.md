---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 CI/CD 10강 — 모노레포와 재사용 가능한 파이프라인'
date: '2026-09-17'
category: 'devops'
tags: ['CI/CD', 'Monorepo', 'GitHub Actions', 'Turborepo']
description: '"README 하나 고쳤는데 왜 전체가 빌드되지?"와 "같은 워크플로를 복사해 붙여 넣는 문제"를 함께 풉니다. 변경 영향 분석과 paths-filter, Composite Action과 Reusable Workflow의 차이, 조직 단위 표준화를 다룹니다.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 CI/CD'
seriesOrder: 10

# 📚 SEO용
keywords: ['모노레포', 'affected', '변경 영향 분석', 'paths-filter', 'Composite Action', 'Reusable Workflow', 'Turborepo', 'polyrepo']
---
# 풀스택 개발자를 위한 CI/CD 10강 — 모노레포와 재사용 가능한 파이프라인

> 풀스택 개발자를 위한 CI/CD 시리즈 · 심화 10/13

풀스택 프로젝트는 자연스럽게 여러 패키지로 나뉩니다. 프론트엔드, API 서버, 공유 타입, UI 컴포넌트, 배치 작업. 이들을 하나의 저장소(모노레포)에 두면 파이프라인에 새로운 문제가 생깁니다. **"README 하나 고쳤는데 왜 전체가 빌드되지?"** 그리고 저장소가 여러 개로 늘어나면 **같은 워크플로를 복사해 붙여 넣는 문제**가 생깁니다. 이번 강의에서는 두 문제를 해결합니다.

## 1. 모노레포 구조

```
my-platform/
├── apps/
│   ├── web/           # Next.js 프론트엔드
│   └── api/           # 백엔드 API
├── packages/
│   ├── ui/            # 공유 UI 컴포넌트
│   ├── types/         # 공유 타입
│   └── config/        # ESLint, TS 설정 공유
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

| 도구 | 역할 |
|---|---|
| pnpm / npm / yarn workspaces | 패키지 간 의존성 연결, 설치 |
| Turborepo | 태스크 실행 순서, 캐시, 변경 영향 분석 |
| Nx | Turborepo와 비슷하며 코드 생성과 플러그인이 풍부 |

모노레포의 장점은 **공유 타입을 바꾸면 프론트와 백엔드가 한 PR에서 함께 검증**된다는 것입니다. API 계약이 어긋나는 문제를 CI에서 바로 잡을 수 있습니다.

## 2. 변경 영향 분석(affected)

패키지 사이의 의존 관계는 그래프입니다.

```
packages/types ──▶ packages/ui ──▶ apps/web
       │
       └──────────────────────────▶ apps/api
```

- `apps/web`만 바뀌면 → web만 검사
- `packages/ui`가 바뀌면 → ui, web 검사
- `packages/types`가 바뀌면 → 전부 검사

### Turborepo로 필터링

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "lint": {},
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"] }
  }
}
```

- `"^build"`: 의존하는 패키지의 build를 먼저 실행합니다.
- `outputs`: 캐시할 결과물 경로입니다.

CI에서 변경된 패키지와 그 영향을 받는 패키지만 실행합니다.

```yaml
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0          # 비교할 이력이 필요
      # ... pnpm 설치
      - run: pnpm turbo run lint typecheck test build --filter="...[origin/main]"
```

`...[origin/main]`은 "main 대비 변경된 패키지와, 그 패키지에 의존하는 모든 패키지"를 뜻합니다.

### 태스크 캐시

Turborepo는 입력(소스, 의존성, 환경변수)의 해시가 같으면 이전 결과를 재사용합니다. **원격 캐시**를 설정하면 CI와 개발자 PC가 캐시를 공유해, 이미 누군가 빌드한 결과를 다시 빌드하지 않습니다. 원격 캐시는 Vercel 호스팅을 쓰거나, 호환 서버를 직접 운영할 수 있습니다.

주의할 점은 **환경변수**입니다. 빌드 결과에 영향을 주는 환경변수를 `turbo.json`에 선언하지 않으면, 다른 설정으로 빌드한 캐시가 잘못 재사용될 수 있습니다.

## 3. job 단위로 건너뛰기: paths-filter

앱마다 배포 방식이 다르면 job을 나누고, 변경된 앱의 job만 실행합니다.

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  pull-requests: read

jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      web: ${{ steps.filter.outputs.web }}
      api: ${{ steps.filter.outputs.api }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            shared: &shared
              - 'packages/types/**'
              - 'pnpm-lock.yaml'
            web:
              - *shared
              - 'apps/web/**'
              - 'packages/ui/**'
            api:
              - *shared
              - 'apps/api/**'

  web:
    needs: changes
    if: needs.changes.outputs.web == 'true'
    uses: ./.github/workflows/_node-app.yml
    with:
      app: web

  api:
    needs: changes
    if: needs.changes.outputs.api == 'true'
    uses: ./.github/workflows/_node-app.yml
    with:
      app: api

  ci-result:
    name: CI Result
    if: always()
    needs: [changes, web, api]
    runs-on: ubuntu-latest
    steps:
      - name: 결과 집계
        env:
          RESULTS: ${{ join(needs.*.result, ' ') }}
        run: |
          echo "job 결과: $RESULTS"
          for r in $RESULTS; do
            if [[ "$r" == "failure" || "$r" == "cancelled" ]]; then
              exit 1
            fi
          done
```

### 집계 job이 필요한 이유

4강에서 본 함정을 다시 떠올려 봅시다. 필수 체크로 `web`과 `api`를 모두 지정하면, 그중 하나가 skipped된 PR을 머지 가능으로 볼지를 매번 신경 써야 하고, job이 추가될 때마다 보호 규칙도 고쳐야 합니다.

대신 **`CI Result` 하나만 필수 체크로 지정**합니다.

- `if: always()`로 선행 job이 실패하거나 건너뛰어져도 항상 실행됩니다.
- 선행 job 중 **실패나 취소가 하나라도 있으면 실패**, 성공이나 skipped면 통과합니다.
- job이 늘어나도 `needs`에만 추가하면 되고 보호 규칙은 그대로입니다.

## 4. Composite Action: step 묶음 재사용

모든 job에 반복되는 "pnpm 설치 → Node 설치 → 의존성 설치"를 하나로 묶습니다.

```yaml
# .github/actions/setup/action.yml
name: Setup workspace
description: pnpm, Node.js 설치 후 의존성 설치

inputs:
  node-version-file:
    description: Node 버전 파일
    default: .nvmrc

runs:
  using: composite
  steps:
    - uses: pnpm/action-setup@v4

    - uses: actions/setup-node@v4
      with:
        node-version-file: ${{ inputs.node-version-file }}
        cache: pnpm

    - name: 의존성 설치
      shell: bash
      run: pnpm install --frozen-lockfile
```

사용하는 쪽은 한 줄로 줄어듭니다.

```yaml
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - run: pnpm turbo run test --filter=web
```

- composite action 안의 `run` step은 **`shell`을 반드시 명시**해야 합니다.
- 로컬 경로(`./.github/actions/...`)로 쓰려면 먼저 체크아웃이 되어 있어야 합니다.

## 5. Reusable Workflow: job 전체 재사용

job 여러 개, 권한, Environment, 시크릿까지 포함한 **워크플로 전체**를 재사용합니다.

```yaml
# .github/workflows/_node-app.yml
name: Node app pipeline

on:
  workflow_call:
    inputs:
      app:
        required: true
        type: string
      node-version-file:
        type: string
        default: .nvmrc
    outputs:
      digest:
        value: ${{ jobs.image.outputs.digest }}

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - run: pnpm turbo run lint typecheck test build --filter="${{ inputs.app }}..."

  image:
    needs: verify
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      digest: ${{ steps.build.outputs.digest }}
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: build
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/${{ inputs.app }}/Dockerfile
          push: true
          tags: ghcr.io/my-org/${{ inputs.app }}:${{ github.sha }}
          cache-from: type=gha,scope=${{ inputs.app }}
          cache-to: type=gha,mode=max,scope=${{ inputs.app }}
```

- 파일 이름 앞의 `_`는 "직접 실행하지 않는 재사용 워크플로"라는 팀 내 관례입니다(기능적 의미는 없음).
- `inputs.app`은 호출하는 워크플로가 정한 값이지만, 외부 입력을 받는 구조라면 7강의 규칙대로 `env`를 거쳐 씁니다.
- 앱별로 GHA 캐시 `scope`를 나눠 캐시가 서로 덮어쓰지 않게 합니다.
- 모노레포에서는 빌드 컨텍스트가 저장소 루트이고, Dockerfile만 앱별로 둡니다. 이때 `turbo prune <app> --docker`로 해당 앱에 필요한 패키지만 추려서 이미지 빌드 컨텍스트를 줄이는 방법이 많이 쓰입니다.

### 다른 저장소에서 호출하기

조직 공용 저장소에 워크플로를 두고 여러 서비스 저장소가 호출할 수 있습니다.

```yaml
jobs:
  deploy:
    uses: my-org/platform-workflows/.github/workflows/deploy.yml@v2
    with:
      service: kpi-dashboard
      environment: production
    secrets: inherit
```

- `@v2`처럼 **버전(태그)을 붙여** 공용 워크플로 변경이 모든 서비스를 동시에 깨뜨리지 않게 합니다. 보안 요구가 높다면 SHA로 고정합니다.
- `secrets: inherit`는 호출자의 시크릿을 모두 넘깁니다. 편리하지만, 필요한 시크릿만 명시적으로 넘기는 편이 더 안전합니다.
- 비공개 공용 저장소라면 저장소 설정에서 조직 내 다른 저장소의 접근을 허용해야 합니다.
- 재사용 워크플로의 중첩 깊이와 한 워크플로에서 호출할 수 있는 수에는 제한이 있으니 공식 문서를 확인합니다.

## 6. Composite Action vs Reusable Workflow

| 항목 | Composite Action | Reusable Workflow |
|---|---|---|
| 재사용 단위 | step 묶음 | job 묶음 (워크플로 전체) |
| 사용 위치 | job의 `steps` 안 | job의 `uses` |
| Runner 지정 | 호출한 job의 Runner 사용 | 내부에서 `runs-on` 지정 |
| 시크릿 | inputs로 전달 | `secrets`로 전달 또는 `inherit` |
| Environment, 권한 | 지정 불가 | 내부 job에서 지정 가능 |
| 로그 표시 | 하나의 step으로 접혀 보임 | job별로 표시 |
| 적합한 용도 | 설치, 로그인 같은 공통 절차 | 표준 빌드·배포 파이프라인 |

실무에서는 **표준 파이프라인은 reusable workflow로, 그 안의 반복 절차는 composite action으로** 조합합니다.

## 7. 조직 단위 표준화

서비스가 많아지면 "모든 저장소가 최소한의 보안 검사를 거치게" 만들고 싶어집니다.

- **공용 워크플로 저장소**: 빌드, 스캔, 배포 표준 워크플로를 버전 관리하며 배포합니다.
- **Rulesets의 필수 워크플로**: 조직 규칙으로 특정 워크플로가 통과해야 머지되도록 강제할 수 있습니다.
- **Starter workflow**: 새 저장소에서 Actions 탭에 조직 표준 템플릿이 보이게 합니다.
- **표준의 문서화**: 공용 워크플로의 입력값, 출력값, 변경 이력(CHANGELOG)을 관리합니다. 공용 워크플로도 하나의 제품입니다.

## 8. 여러 저장소(polyrepo)를 연결하기

서비스 저장소에서 이미지를 만든 뒤, 별도의 배포 저장소에 배포를 요청하는 구조도 있습니다.

```yaml
# 서비스 저장소: 이미지 빌드 후 배포 저장소에 이벤트 전송
- run: |
    gh api repos/my-org/deployments/dispatches \
      -f event_type=deploy \
      -f "client_payload[service]=web" \
      -f "client_payload[digest]=$DIGEST"
  env:
    GH_TOKEN: ${{ secrets.DEPLOY_REPO_TOKEN }}
    DIGEST: ${{ steps.build.outputs.digest }}
```

```yaml
# 배포 저장소
on:
  repository_dispatch:
    types: [deploy]
```

이 패턴은 12강의 GitOps에서 "설정 저장소의 이미지 태그를 업데이트"하는 방식으로 발전합니다.

## 9. 정리

- 모노레포에서는 의존 그래프를 기준으로 변경된 패키지와 영향받는 패키지만 검사합니다.
- Turborepo의 필터와 태스크 캐시로 불필요한 작업을 줄입니다.
- job 단위 필터링을 할 때는 집계 job 하나를 필수 체크로 지정합니다.
- 반복 step은 composite action, 표준 파이프라인은 reusable workflow로 재사용합니다.
- 공용 워크플로는 버전을 붙여 배포하고, 하나의 제품처럼 관리합니다.

## 확인 문제와 해설

**Q1.** `packages/types`를 수정한 PR에서 `apps/api`의 테스트가 실행되지 않았습니다. 필터 설정에서 무엇이 빠졌을까요?

> `api` 필터에 공유 패키지 경로(`packages/types/**`)가 포함되지 않았습니다. 의존하는 공유 패키지 경로를 필터에 반드시 넣어야 합니다.

**Q2.** 집계 job에 `if: always()`를 빼면 어떻게 되나요?

> 선행 job이 실패하면 집계 job이 skipped 처리되고, skipped는 필수 체크에서 통과로 간주되어 실패한 PR이 머지될 수 있습니다.

**Q3.** 공용 배포 워크플로를 `@main`으로 호출하던 20개 서비스가 동시에 배포 실패했습니다. 예방책은요?

> 공용 워크플로를 버전 태그(`@v2`)로 호출하게 하고, 변경은 새 버전으로 배포해 서비스별로 점진적으로 올리게 합니다.
