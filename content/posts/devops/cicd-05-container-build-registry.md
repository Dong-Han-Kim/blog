---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 CI/CD 5강 — 컨테이너 빌드와 이미지 레지스트리'
date: '2026-09-17'
category: 'devops'
tags: ['CI/CD', 'Docker', 'Container', 'Registry']
description: 'Build Once Deploy Many를 컨테이너 이미지로 구현합니다. Next.js standalone 멀티스테이지 빌드, 빌드 시점 환경변수 문제, 태깅 전략과 digest, 레지스트리 선택, 멀티 플랫폼 빌드를 다룹니다.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 CI/CD'
seriesOrder: 5

# 📚 SEO용
keywords: ['컨테이너 빌드', '멀티스테이지 빌드', 'Next.js standalone', '이미지 태깅', 'digest', '컨테이너 레지스트리', 'GHCR', '멀티 플랫폼 이미지', '헬스체크']
---
# 풀스택 개발자를 위한 CI/CD 5강 — 컨테이너 빌드와 이미지 레지스트리

> 풀스택 개발자를 위한 CI/CD 시리즈 · 중급 5/13

1강의 원칙 "Build Once, Deploy Many"와 "불변 산출물"을 가장 자연스럽게 구현하는 방법이 **컨테이너 이미지**입니다. 이번 강의에서는 Next.js 앱을 운영용 이미지로 만들고, CI에서 레지스트리에 올리는 과정까지 구성합니다.

## 1. 왜 산출물을 이미지로 만드나

| 문제 | 이미지가 해결하는 방식 |
|---|---|
| 서버마다 Node 버전이 다름 | 런타임이 이미지 안에 포함됨 |
| 서버에서 빌드하면 느리고 불안정 | CI에서 빌드한 결과를 그대로 실행 |
| "지금 운영에 뭐가 떠 있지?" | 이미지 태그와 digest로 정확히 식별 |
| 롤백이 복잡함 | 이전 이미지로 컨테이너만 교체 |

이미지는 한번 만들어지면 **digest**(`sha256:...`)라는 내용 기반 식별자를 가집니다. 태그는 바뀔 수 있지만 digest는 내용이 같으면 절대 바뀌지 않습니다.

## 2. Next.js 운영 이미지: 멀티스테이지 빌드

먼저 Next.js의 standalone 출력을 켭니다. 실행에 필요한 파일만 `.next/standalone`에 모아 주기 때문에 이미지 크기가 크게 줄어듭니다.

```js
// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

```dockerfile
# syntax=docker/dockerfile:1

# ---- 1단계: 의존성 설치 ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# ---- 2단계: 빌드 ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- 3단계: 실행 ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

설계 포인트는 다음과 같습니다.

- **멀티스테이지**: 빌드 도구와 devDependencies는 앞 단계에만 있고, 최종 이미지에는 실행에 필요한 파일만 남습니다. 수백 MB가 100MB대로 줄어듭니다.
- **레이어 순서**: 자주 바뀌지 않는 `package.json`과 lockfile을 먼저 복사하고 설치한 뒤, 자주 바뀌는 소스를 나중에 복사합니다. 소스만 바뀌면 설치 레이어는 캐시에서 재사용됩니다.
- **비루트 사용자**: 컨테이너가 탈취되더라도 root 권한을 갖지 않게 합니다.
- **exec 형식 CMD**: `CMD ["node", "server.js"]`처럼 배열로 적어야 node가 PID 1이 되어 종료 신호(SIGTERM)를 직접 받습니다. 무중단 배포에 중요합니다(8강).
- **베이스 이미지 태그 고정**: `node:latest` 대신 메이저 버전을 명시합니다. 더 엄격하게는 digest로 고정합니다.

### .dockerignore

빌드 컨텍스트에서 불필요한 파일을 뺍니다. 빌드가 빨라지고, 비밀 파일이 이미지에 들어가는 사고를 막습니다.

```
node_modules
.next
.git
.github
*.md
.env*
coverage
playwright-report
Dockerfile
docker-compose*.yml
```

`.env` 파일이 이미지에 들어가면 이미지를 받을 수 있는 모든 사람이 비밀값을 볼 수 있습니다. 반드시 제외합니다.

### 로컬에서 확인

```bash
docker build -t my-app:local .
docker run --rm -p 3000:3000 my-app:local
docker image ls my-app          # 크기 확인
docker history my-app:local     # 레이어별 크기 확인
```

## 3. 빌드 시점 환경변수 문제

Next.js의 `NEXT_PUBLIC_*` 변수는 **빌드할 때 JavaScript 번들에 문자열로 박힙니다**. 즉 스테이징용 API 주소로 빌드한 이미지를 운영에 그대로 쓸 수 없고, "Build Once, Deploy Many" 원칙이 깨집니다.

해결 방법은 몇 가지가 있습니다.

1. **서버에서 읽기**: 서버 컴포넌트, Route Handler, 서버 액션에서는 `process.env`를 **실행 시점**에 읽습니다. 동적 렌더링되는 서버 코드라면 이미지 하나로 환경을 바꿀 수 있습니다.
2. **런타임 설정 API**: 클라이언트가 필요한 공개 설정을 `/api/config` 같은 엔드포인트나, 서버에서 렌더링한 레이아웃에서 전달합니다.
3. **같은 도메인의 상대 경로 사용**: API를 같은 도메인 아래(`/api`)에 두면 클라이언트는 주소를 몰라도 됩니다. 리버스 프록시가 경로를 라우팅합니다.
4. **환경별 빌드를 허용**: 불가피하다면 환경별로 빌드하되, 같은 커밋·같은 lockfile·같은 베이스 이미지를 쓰고 이 사실을 명시적으로 문서화합니다.

가장 깔끔한 것은 **클라이언트 번들에 환경 의존 값을 넣지 않는 구조**입니다.

## 4. 태깅 전략

| 태그 | 예시 | 용도 |
|---|---|---|
| 커밋 SHA | `ghcr.io/org/app:3f2a9c1...` | 어떤 커밋인지 정확히 추적. 배포에 사용 |
| 시맨틱 버전 | `1.4.2`, `1.4` | 릴리스 식별 |
| 브랜치 | `main` | 최신 main 확인용 |
| `latest` | `latest` | 편의용. **배포에는 쓰지 않음** |
| digest | `@sha256:ab12...` | 절대 변하지 않는 식별. 가장 엄격한 배포 방식 |

`latest`로 배포하면 "지금 무엇이 떠 있는지"를 알 수 없고, 서버마다 받아 간 시점에 따라 다른 이미지가 떠 있을 수 있습니다. **배포에는 SHA 태그나 digest**를 씁니다.

## 5. 레지스트리 선택

| 레지스트리 | 특징 |
|---|---|
| GitHub Container Registry (GHCR) | GitHub 저장소와 권한이 통합되고, `GITHUB_TOKEN`으로 push 가능 |
| Docker Hub | 가장 널리 쓰이며, 무료 계정은 pull 횟수 제한이 있음 |
| AWS ECR, GCP Artifact Registry 등 | 클라우드 배포 시 네트워크와 IAM이 통합됨 |
| Harbor | 설치형 레지스트리. 취약점 스캔, 복제, 접근 제어 기능. 폐쇄망에서 많이 씀 (11강) |

## 6. CI에서 이미지 빌드하고 push하기

```yaml
name: Image

on:
  push:
    branches: [main]
    tags: ['v*.*.*']
  pull_request:

permissions:
  contents: read
  packages: write          # GHCR push 권한

jobs:
  image:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    outputs:
      digest: ${{ steps.build.outputs.digest }}
    steps:
      - uses: actions/checkout@v4

      - name: Buildx 설정
        uses: docker/setup-buildx-action@v3

      - name: GHCR 로그인
        if: github.event_name != 'pull_request'
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: 태그와 라벨 생성
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=sha,format=long
            type=ref,event=branch
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=raw,value=latest,enable={{is_default_branch}}

      - name: 빌드 및 push
        id: build
        uses: docker/build-push-action@v6
        with:
          context: .
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- **PR에서는 빌드만 하고 push하지 않습니다.** Dockerfile이 깨지지 않았는지 검증하는 용도입니다.
- **`metadata-action`**: 이벤트에 맞는 태그를 자동으로 만듭니다. 태그 push(`v1.4.2`)면 `1.4.2`, `1.4`가, main push면 SHA, `main`, `latest`가 붙습니다. OCI 표준 라벨(소스 저장소, 커밋, 생성 시각)도 붙여 줍니다.
- **이미지 이름은 소문자여야 합니다.** GitHub 사용자명이나 조직명에 대문자가 있으면 `github.repository`에도 대문자가 들어갑니다. `metadata-action`은 소문자로 변환해 주지만, 태그를 직접 조합할 때는 변환을 잊지 않도록 주의합니다.
- **`cache-from/cache-to: type=gha`**: Docker 레이어 캐시를 GitHub Actions 캐시에 저장합니다. `mode=max`는 중간 스테이지 레이어까지 캐시합니다.
- **`outputs.digest`**: 이후 배포와 서명(9강)에서 digest를 사용합니다.

## 7. 멀티 플랫폼 이미지

Apple Silicon 노트북이나 ARM 서버에서도 실행하려면 여러 아키텍처로 빌드합니다.

```yaml
      - uses: docker/setup-qemu-action@v3
      - uses: docker/setup-buildx-action@v3
      - uses: docker/build-push-action@v6
        with:
          platforms: linux/amd64,linux/arm64
          # ...
```

QEMU 에뮬레이션은 느리므로 꼭 필요한 플랫폼만 지정합니다. 운영 서버가 amd64뿐이라면 `linux/amd64` 하나로 충분합니다.

## 8. 헬스체크 엔드포인트

배포 자동화(6강)와 무중단 배포(8강)를 위해 앱에 헬스체크 엔드포인트를 미리 만들어 둡니다.

```ts
// app/api/health/route.ts
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    status: 'ok',
    version: process.env.APP_VERSION ?? 'unknown',
    time: new Date().toISOString(),
  });
}
```

`APP_VERSION`에 커밋 SHA를 넣어 두면 "지금 떠 있는 버전"을 HTTP로 확인할 수 있습니다. 이 값은 빌드 시 `--build-arg`로 넣거나, 배포 시 환경변수로 주입합니다.

## 9. 이미지 품질 체크리스트

- [ ] 멀티스테이지로 빌드 도구가 최종 이미지에 없다
- [ ] 비루트 사용자로 실행한다
- [ ] 베이스 이미지 버전이 고정되어 있다
- [ ] `.dockerignore`로 `.env`, `.git`, `node_modules`가 제외된다
- [ ] 이미지에 비밀값이 들어 있지 않다 (`docker history`로 확인)
- [ ] CMD가 exec 형식이다
- [ ] 헬스체크 엔드포인트가 있다
- [ ] 배포에는 SHA 태그나 digest를 쓴다

## 10. 정리

- 컨테이너 이미지는 런타임까지 포함한 불변 산출물이며, digest로 정확히 식별됩니다.
- 멀티스테이지, 레이어 순서, 비루트 사용자, standalone 출력으로 작고 안전한 이미지를 만듭니다.
- `NEXT_PUBLIC_*`처럼 빌드 시점에 박히는 값은 Build Once 원칙을 깨므로 구조적으로 피합니다.
- CI에서는 `metadata-action`으로 태그를 만들고, `build-push-action`과 GHA 캐시로 빌드합니다.
- 배포에는 `latest`가 아닌 SHA 태그나 digest를 씁니다.

## 확인 문제와 해설

**Q1.** 소스 한 줄만 고쳤는데 Docker 빌드가 매번 `npm ci`부터 다시 합니다. Dockerfile에서 무엇을 의심해야 할까요?

> `COPY . .`가 `npm ci`보다 앞에 있는지 확인합니다. 소스가 바뀌면 그 이후 레이어가 모두 무효화되므로, 의존성 파일만 먼저 복사해 설치해야 합니다.

**Q2.** 운영 서버 두 대가 모두 `app:latest`로 실행 중인데 동작이 다릅니다. 어떻게 된 걸까요?

> 두 서버가 서로 다른 시점에 `latest`를 받아서 실제로는 다른 이미지일 가능성이 큽니다. SHA 태그나 digest로 배포하면 이 문제가 생기지 않습니다.

**Q3.** `docker history`를 보니 한 레이어에서 `.env.production`이 복사된 흔적이 있습니다. 나중 레이어에서 파일을 지웠다면 안전한가요?

> 안전하지 않습니다. 이전 레이어는 이미지 안에 그대로 남아 있어 추출할 수 있습니다. `.dockerignore`로 처음부터 빌드 컨텍스트에서 제외하고, 이미 노출된 비밀값은 교체해야 합니다.
