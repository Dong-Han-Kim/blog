---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 CI/CD 11강 — 폐쇄망 환경의 CI/CD'
date: '2026-09-17'
category: 'devops'
tags: ['CI/CD', 'Air-gapped', 'Registry', 'GitLab CI']
description: '인터넷과 분리된 폐쇄망에서는 hosted runner도 npm 레지스트리도 Docker Hub도 없습니다. 반입 횟수와 크기를 줄이는 것을 목표로 내부망 구성 요소, 이미지·의존성 반입, 폐쇄망용 Dockerfile, 내부 CI와 배포 번들 방식을 설계합니다.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 CI/CD'
seriesOrder: 11

# 📚 SEO용
keywords: ['폐쇄망', 'air-gapped', '반입 절차', '내부 레지스트리', 'Nexus', 'Verdaccio', '오프라인 npm', 'GitLab CI', '배포 번들']
---
# 풀스택 개발자를 위한 CI/CD 11강 — 폐쇄망 환경의 CI/CD

> 풀스택 개발자를 위한 CI/CD 시리즈 · 심화 11/13

조선, 건설, 플랜트, 금융, 공공 분야의 많은 시스템은 인터넷과 분리된 **폐쇄망**(air-gapped network)에서 운영됩니다. 지금까지 강의에서 당연하게 쓴 것들, 즉 GitHub-hosted runner, npm 레지스트리, Docker Hub, 마켓플레이스 액션이 모두 없는 환경입니다. 이번 강의에서는 이런 환경에서 CI/CD를 구성하는 방법을 다룹니다.

## 1. 폐쇄망에서 사라지는 것들

| 평소에 쓰던 것 | 폐쇄망에서 |
|---|---|
| `npm ci` (registry.npmjs.org) | 접속 불가 |
| `docker pull node:22-alpine` | 접속 불가 |
| `apt-get install`, `apk add` | 접속 불가 |
| GitHub Actions, hosted runner | 사용 불가 (또는 GitHub Enterprise Server 필요) |
| `uses: actions/checkout@v4` | 액션 코드를 받을 수 없음 |
| Trivy 취약점 DB 업데이트 | 접속 불가 |
| Let's Encrypt, 공인 NTP | 접속 불가 → 사설 인증서, 내부 시간 서버 |

그리고 외부에서 파일을 들여올 때는 **반입 절차**(보안 검토, 망연계 시스템, 매체 반입 신청)를 거쳐야 하는 경우가 많습니다. 반입은 느리고 비싼 작업이므로, **반입 횟수와 크기를 줄이는 것**이 폐쇄망 CI/CD 설계의 핵심 목표가 됩니다.

## 2. 두 가지 기본 전략

### 전략 A: 외부에서 빌드하고 산출물을 반입

```
[외부망] 소스 → CI → 이미지 빌드 → 이미지 tar + 배포 번들
                                          │ 반입 절차
[내부망]                                  ▼
                      내부 레지스트리 → 운영 서버 배포
```

- 장점: 내부망에 빌드 인프라가 거의 필요 없습니다.
- 단점: 소스 코드가 외부망에 있어야 합니다. 보안 정책상 불가능한 경우가 많고, 배포마다 반입이 필요합니다.

### 전략 B: 내부에 빌드 인프라를 갖추고 의존성만 반입

```
[외부망] 의존성 수집 (베이스 이미지, npm 패키지, OS 패키지, 도구)
                          │ 주기적 반입
[내부망]                  ▼
  내부 Git → 내부 CI → 내부 미러(npm, 이미지) 사용해 빌드 → 내부 레지스트리 → 배포
```

- 장점: 소스가 내부에만 있고, 일상적인 배포에는 반입이 필요 없습니다. 의존성이 바뀔 때만 반입합니다.
- 단점: 내부에 Git, CI, 레지스트리, 패키지 저장소를 구축하고 운영해야 합니다.

**중장기적으로는 전략 B가 표준**입니다. 전략 A는 내부 인프라를 갖추기 전의 과도기나 소규모 시스템에서 씁니다.

## 3. 내부망 구성 요소

| 역할 | 선택지 | 비고 |
|---|---|---|
| Git 서버 | GitLab CE/EE, Gitea, GitHub Enterprise Server | GitLab은 CI까지 통합 |
| CI 실행 | GitLab Runner, Jenkins, Gitea Actions(act_runner) | Gitea Actions는 GitHub Actions와 문법이 거의 호환 |
| 컨테이너 레지스트리 | Harbor, GitLab Container Registry, Docker Registry | Harbor는 취약점 스캔과 복제, 프로젝트 권한 제공 |
| 패키지 저장소 | Nexus Repository, Verdaccio(npm 전용) | npm, Maven, PyPI 등을 하나로 관리 |
| OS 패키지 미러 | apt/apk 미러, Nexus의 apt 저장소 | 베이스 이미지에서 패키지를 설치할 때 필요 |
| 시간·인증서 | 내부 NTP, 사설 CA | TLS와 서명 검증에 필수 |

## 4. 컨테이너 이미지 반입

### 기본: docker save / load

```bash
# ===== 외부망 =====
# 운영 서버 아키텍처를 명시해서 받음
docker pull --platform linux/amd64 node:22-alpine
docker save node:22-alpine | gzip > node-22-alpine.tar.gz
sha256sum node-22-alpine.tar.gz > node-22-alpine.tar.gz.sha256

# ===== 내부망 =====
sha256sum -c node-22-alpine.tar.gz.sha256       # 무결성 확인
docker load -i node-22-alpine.tar.gz
docker tag node:22-alpine harbor.internal/base/node:22-alpine
docker push harbor.internal/base/node:22-alpine
```

- **아키텍처 명시**: 외부망 PC가 Apple Silicon(arm64)이면 기본으로 arm64 이미지를 받습니다. 운영 서버가 amd64라면 반입 후 `exec format error`로 실행되지 않습니다.
- **체크섬 확인**: 반입 과정에서 파일이 손상되거나 바뀌지 않았는지 검증합니다.
- **내부 레지스트리에 재태깅**: 이후 모든 빌드와 배포는 내부 레지스트리 주소를 씁니다.

### 여러 이미지를 한 번에

```bash
#!/usr/bin/env bash
# collect-images.sh (외부망)
set -euo pipefail
PLATFORM=linux/amd64
OUT=images-$(date +%Y%m%d)
mkdir -p "$OUT"

while read -r img; do
  [[ -z "$img" || "$img" == \#* ]] && continue
  docker pull --platform "$PLATFORM" "$img"
done < images.txt

grep -vE '^\s*(#|$)' images.txt | xargs docker save | gzip > "$OUT/images.tar.gz"
cp images.txt "$OUT/"
(cd "$OUT" && sha256sum images.tar.gz > SHA256SUMS)
```

```
# images.txt
node:22-alpine
postgres:16
nginx:1.27-alpine
goharbor/harbor-core:v2.x.x    # 실제 버전으로 고정
```

**반입 목록(`images.txt`)을 Git으로 관리**하면 무엇이 언제 반입되었는지 이력이 남습니다.

### skopeo, crane

Docker 데몬 없이 레지스트리 간 복사나 OCI 레이아웃 저장이 가능한 도구입니다. digest를 보존한 채 옮길 수 있어, 서명 검증이 필요한 환경에서 유리합니다.

```bash
skopeo copy --override-arch amd64 \
  docker://docker.io/library/node:22-alpine \
  oci-archive:node-22-alpine.tar
```

## 5. npm 의존성 반입

### 방법 1: 내부 npm 프록시/저장소 (권장)

Nexus나 Verdaccio를 내부에 두고, 외부에서 수집한 패키지를 올려 둡니다.

```ini
# .npmrc (저장소에 커밋)
registry=https://nexus.internal/repository/npm-group/
strict-ssl=true
cafile=/etc/ssl/certs/internal-ca.pem
```

외부망에서 패키지를 수집하는 방법은 다음과 같습니다.

```bash
# 외부망: lockfile 기준으로 모든 패키지 tarball을 캐시에 채움
npm ci --cache ./npm-cache --prefer-online
tar czf npm-cache.tar.gz npm-cache
```

내부망에서 이 캐시를 이용해 설치하거나, 캐시의 tarball을 내부 저장소에 게시하는 스크립트를 운영합니다. 패키지가 많으면 lockfile을 읽어 tarball을 내려받고 내부 저장소에 일괄 업로드하는 도구(예: 레지스트리 동기화 스크립트)를 쓰기도 합니다.

**lockfile의 `resolved` 주소**에 주의합니다. lockfile에 `https://registry.npmjs.org/...`가 기록되어 있어도 npm은 설정된 registry로 요청을 보내지만, 도구나 버전에 따라 동작이 달라질 수 있으니 내부망에서 실제로 설치가 되는지 반드시 검증합니다.

### 방법 2: 오프라인 캐시로 설치

내부 저장소가 아직 없다면, 반입한 캐시로 설치할 수 있습니다.

```bash
tar xzf npm-cache.tar.gz
npm ci --cache ./npm-cache --offline
```

lockfile이 바뀔 때마다 캐시를 다시 반입해야 하므로, 과도기용으로만 씁니다.

### 네이티브 모듈

`sharp`, `bcrypt`, Oracle 드라이버처럼 **플랫폼별 바이너리**를 설치 시점에 내려받는 패키지는 폐쇄망에서 자주 실패합니다.

- 외부망에서 **운영과 같은 OS·아키텍처·libc**(glibc vs musl/alpine)로 설치해 바이너리를 확보합니다.
- 패키지가 지원하는 바이너리 미러 환경변수를 내부 주소로 설정합니다.
- 가능하면 순수 JavaScript 대체 패키지를 검토합니다.

## 6. 폐쇄망용 Dockerfile

베이스 이미지 주소와 패키지 저장소를 인자로 받게 만들면, 같은 Dockerfile을 외부망과 내부망에서 모두 쓸 수 있습니다.

```dockerfile
# syntax=docker/dockerfile:1
ARG REGISTRY=docker.io/library

FROM ${REGISTRY}/node:22-alpine AS deps
WORKDIR /app
ARG NPM_REGISTRY=https://registry.npmjs.org/
COPY package.json package-lock.json ./
COPY certs/internal-ca.pem /usr/local/share/ca-certificates/internal-ca.crt
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/internal-ca.crt
RUN npm config set registry "$NPM_REGISTRY" && npm ci

FROM ${REGISTRY}/node:22-alpine AS builder
# ... 5강과 동일

FROM ${REGISTRY}/node:22-alpine AS runner
# ... 5강과 동일
```

```bash
docker build \
  --build-arg REGISTRY=harbor.internal/base \
  --build-arg NPM_REGISTRY=https://nexus.internal/repository/npm-group/ \
  -t harbor.internal/s-app/web:$SHA .
```

- **사설 CA**: 내부 서비스가 사설 인증서를 쓰면 Node.js는 기본적으로 신뢰하지 않습니다. `NODE_EXTRA_CA_CERTS`로 CA를 추가합니다. `NODE_TLS_REJECT_UNAUTHORIZED=0`으로 검증을 끄는 것은 편하지만 위험하므로 피합니다.
- **빌드 중 인터넷 접근 금지 확인**: 외부망에서 `docker build --network=none`으로 설치 이후 단계를 테스트해 보면, 빌드가 몰래 인터넷에 의존하는 부분(텔레메트리, 폰트 다운로드 등)을 미리 찾을 수 있습니다. Next.js의 `next/font/google`은 빌드 시 Google Fonts에 접속하므로, 폐쇄망에서는 `next/font/local`로 폰트 파일을 저장소에 포함합니다.

## 7. 내부 CI 예시: GitLab CI

폐쇄망에서 가장 흔한 조합 중 하나인 GitLab CE + GitLab Runner 예시입니다. 개념은 지금까지의 GitHub Actions와 같습니다.

```yaml
# .gitlab-ci.yml
stages: [verify, build, deploy]

variables:
  REGISTRY: harbor.internal
  IMAGE: $REGISTRY/s-app/web
  NPM_REGISTRY: https://nexus.internal/repository/npm-group/

default:
  image: $REGISTRY/base/node:22-alpine

verify:
  stage: verify
  cache:
    key:
      files: [package-lock.json]
    paths: [.npm/]
  script:
    - npm config set registry "$NPM_REGISTRY"
    - npm ci --cache .npm --prefer-offline
    - npm run lint
    - npm run typecheck
    - npm test
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

build-image:
  stage: build
  tags: [docker-builder]        # Docker가 설치된 shell executor Runner
  script:
    - echo "$HARBOR_PASSWORD" | docker login "$REGISTRY" -u "$HARBOR_USER" --password-stdin
    - >
      docker build
      --build-arg REGISTRY=$REGISTRY/base
      --build-arg NPM_REGISTRY=$NPM_REGISTRY
      -t $IMAGE:$CI_COMMIT_SHA .
    - docker push $IMAGE:$CI_COMMIT_SHA
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

deploy-production:
  stage: deploy
  tags: [deployer]
  environment:
    name: production
  when: manual                   # 수동 승인 (Continuous Delivery)
  resource_group: production     # 동시 배포 방지 (Actions의 concurrency)
  script:
    - ssh deploy@app-server-01 "/srv/app/deploy.sh $CI_COMMIT_SHA"
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

| GitHub Actions | GitLab CI |
|---|---|
| `on:` | `rules:`, `workflow:` |
| `jobs.<id>` | 최상위 job 정의 + `stage` |
| `needs:` | `stages` 순서, `needs:` |
| `runs-on:` | `tags:` (Runner 선택) |
| `environment:` + 승인 | `environment:` + `when: manual`, 보호 환경 |
| `concurrency:` | `resource_group:` |
| `secrets.*` | CI/CD Variables (Masked, Protected) |
| `actions/cache` | `cache:` |

`HARBOR_PASSWORD` 같은 변수는 **Protected**(보호 브랜치에서만 사용)와 **Masked** 옵션을 켜서 등록합니다.

### Gitea Actions를 쓴다면

Gitea Actions는 GitHub Actions 워크플로 문법을 거의 그대로 씁니다. 다만 `uses: actions/checkout@v4`의 액션 코드를 받아 올 곳이 필요하므로, **자주 쓰는 액션 저장소를 내부 Gitea에 미러링**하고 인스턴스 설정에서 기본 액션 주소를 내부로 지정합니다. GitHub Enterprise Server도 비슷하게 액션 동기화 도구를 제공합니다.

## 8. 내부 CI가 없을 때: 배포 번들 방식

아직 내부 CI를 갖추지 못했다면, 최소한 **배포를 재현 가능한 번들**로 만듭니다. 사람이 서버에서 명령을 기억해 치는 방식에서 벗어나는 첫걸음입니다.

```
release-2026.09.17-3f2a9c1/
├── MANIFEST.txt            # 버전, 커밋, 빌드 일시, 포함 이미지 목록
├── SHA256SUMS              # 모든 파일의 체크섬
├── images.tar.gz           # 앱 이미지 (+ 바뀐 인프라 이미지)
├── compose.yaml
├── migrations/             # 이번 릴리스의 DB 마이그레이션
├── deploy.sh               # load → tag → push → migrate → up → healthcheck
├── rollback.sh
└── RUNBOOK.md              # 절차, 확인 항목, 장애 시 연락처
```

```bash
#!/usr/bin/env bash
# deploy.sh (번들 내부)
set -euo pipefail
cd "$(dirname "$0")"

echo "==> 무결성 확인"
sha256sum -c SHA256SUMS

echo "==> 이미지 적재"
docker load -i images.tar.gz

source MANIFEST.txt        # APP_TAG 등 정의
echo "==> 마이그레이션"
docker compose run --rm migrate

echo "==> 교체"
IMAGE_TAG="$APP_TAG" docker compose up -d --wait app

echo "==> 확인"
curl -fsS http://127.0.0.1:3000/api/health | grep -q "$APP_TAG"
echo "$(date -Iseconds) $APP_TAG" >> /srv/app/releases.log
```

이 번들은 외부망 CI(전략 A)에서 자동으로 만들 수 있고, 나중에 내부 CI가 생기면 같은 스크립트를 파이프라인 step으로 옮기면 됩니다.

**RUNBOOK.md를 반드시 포함**합니다. 폐쇄망 시스템은 담당자가 바뀌면 "이 컨테이너가 왜 떠 있는지, 어떻게 다시 띄우는지" 아무도 모르는 상태가 되기 쉽습니다. 구성, 포트, 볼륨, 의존 서비스, 기동 순서, 점검 명령을 문서로 남기는 것 자체가 폐쇄망 운영의 안정성입니다.

## 9. 폐쇄망에서의 보안 검사

- **Trivy 오프라인 스캔**: 외부망에서 취약점 DB를 내려받아 반입하고, 내부에서는 DB 업데이트 없이 스캔합니다.

```bash
# 외부망
trivy image --download-db-only --cache-dir ./trivy-cache
tar czf trivy-db.tar.gz trivy-cache

# 내부망
tar xzf trivy-db.tar.gz
trivy image --cache-dir ./trivy-cache --skip-db-update --offline-scan \
  harbor.internal/s-app/web:$SHA
```

- **Harbor 내장 스캐너**: Harbor에 Trivy 스캐너를 연동하고 DB를 주기적으로 반입하면, push되는 이미지를 자동 스캔하고 "취약점이 있는 이미지는 pull 금지" 정책을 걸 수 있습니다.
- **반입 파일 검사**: 반입 절차에서 악성코드 검사가 이뤄지는지 확인하고, 체크섬과 서명으로 무결성을 검증합니다.
- **취약점 DB의 신선도**: DB가 오래될수록 새 취약점을 놓칩니다. 반입 주기(예: 주 1회)를 정해 운영합니다.

## 10. 폐쇄망 CI/CD 체크리스트

- [ ] 반입 대상(이미지, 패키지, 도구, 취약점 DB) 목록이 Git으로 관리된다
- [ ] 이미지는 운영 서버 아키텍처로 받고, 체크섬으로 검증한다
- [ ] 내부 레지스트리와 패키지 저장소 주소가 빌드 인자로 분리되어 있다
- [ ] 빌드 과정에 숨은 인터넷 의존성(폰트, 텔레메트리, 바이너리 다운로드)이 없다
- [ ] 사설 CA가 이미지와 Runner에 등록되어 있고, TLS 검증을 끄지 않는다
- [ ] 서버 시간이 내부 NTP로 동기화되어 있다 (인증서, 토큰 검증에 필요)
- [ ] 배포가 스크립트나 파이프라인으로 재현 가능하다
- [ ] 롤백용 이전 이미지가 내부 레지스트리에 보존된다
- [ ] 구성과 절차가 RUNBOOK으로 문서화되어 있다
- [ ] 취약점 DB 반입 주기가 정해져 있다

## 11. 정리

- 폐쇄망 CI/CD의 핵심은 외부 의존성을 내부로 옮겨 오고, 반입 횟수를 줄이는 것입니다.
- 장기적으로는 내부에 Git, CI, 레지스트리, 패키지 저장소를 갖추고 의존성만 주기적으로 반입하는 구조가 표준입니다.
- 이미지 반입 시 아키텍처와 무결성을, npm 반입 시 네이티브 모듈을 특히 주의합니다.
- 레지스트리 주소를 빌드 인자로 분리하면 같은 Dockerfile을 내·외부망에서 함께 씁니다.
- 내부 CI가 없어도 배포 번들과 RUNBOOK으로 재현 가능한 배포를 만들 수 있습니다.

## 확인 문제와 해설

**Q1.** 외부망 맥북에서 `docker pull`한 이미지를 반입했더니 서버에서 `exec format error`가 납니다. 원인은요?

> 맥북(arm64) 아키텍처 이미지가 반입되었기 때문입니다. `--platform linux/amd64`로 운영 서버 아키텍처를 명시해 다시 받아야 합니다.

**Q2.** 내부망에서 Next.js 빌드가 폰트 다운로드 단계에서 멈춥니다. 어떻게 해결할까요?

> `next/font/google`이 빌드 시 외부에 접속하기 때문입니다. 폰트 파일을 저장소에 포함하고 `next/font/local`로 바꿉니다.

**Q3.** 내부 서비스 호출 시 인증서 오류가 나자 `NODE_TLS_REJECT_UNAUTHORIZED=0`을 설정했습니다. 더 나은 방법은요?

> 모든 TLS 검증을 끄면 중간자 공격에 무방비가 됩니다. 사설 CA 인증서를 `NODE_EXTRA_CA_CERTS`로 등록해 검증을 유지해야 합니다.

## 더 깊이

- 폐쇄망에서 Node 앱을 PM2와 Nginx로 운영하는 구체적인 절차는 [PM2 완전 정복 6편 — Docker, Nginx, 폐쇄망에서 PM2를 운영하기](/posts/pm2-06-docker-nginx-airgap)
- 반입한 산출물을 실제로 올리는 서버 쪽 기본기는 [풀스택 개발자를 위한 인프라 1강 — 리눅스 운영 기본](/posts/infra-01-linux-operations)
- 폐쇄망 DevOps 전반의 패턴과 안티패턴은 [DevOps 패턴과 안티패턴 특별편 — 폐쇄망에서의 DevOps](/posts/devops-patterns-08-air-gapped)
