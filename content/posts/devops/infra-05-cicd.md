---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 인프라 5강 — CI/CD'
date: '2026-09-17'
category: 'devops'
tags: ['CI/CD', 'GitHub Actions', 'Deployment', 'DevOps', 'Infra']
description: 'CI와 CD의 구분, GitHub Actions 워크플로 구조, 이미지 빌드와 푸시, 시크릿과 OIDC, 블루/그린과 롤링 배포, 롤백과 expand-contract DB 마이그레이션까지 — 배포를 사람 손에서 파이프라인으로 옮기는 법.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 인프라'
seriesOrder: 5

# 📚 SEO용
keywords: ['CI/CD', 'GitHub Actions', '배포 자동화', '블루 그린 배포', '롤백', 'expand-contract', 'OIDC', 'self-hosted runner', '인프라 강의']
---

# 풀스택 개발자를 위한 인프라 5강 — CI/CD

[4강](/posts/infra-04-docker)에서 앱과 실행 환경을 이미지 하나로 고정했다. 이번 강의는 그 이미지를 사람 손 대신 파이프라인이 만들고 내보내게 하는 CI/CD를 다룬다.

## 1. 개념

- **CI (Continuous Integration)**: 코드가 합쳐질 때마다 자동으로 빌드·테스트해서 "메인 브랜치는 항상 동작한다"를 유지하는 것
- **CD (Continuous Delivery)**: 언제든 배포 가능한 산출물을 자동으로 준비. 운영 반영은 사람이 승인
- **CD (Continuous Deployment)**: 승인 없이 운영까지 자동 반영

핵심 가치는 속도보다 **반복 가능성**이다. 사람이 SSH로 들어가 손으로 하던 배포를 코드로 고정하면, 누가 언제 무엇을 배포했는지 기록이 남고 실수가 줄어든다.

## 2. 파이프라인 단계

```
push/PR
  → 체크아웃
  → 의존성 설치 (캐시)
  → 정적 검사 (lint, type check)
  → 테스트 (unit → integration)
  → 빌드 (앱, 컨테이너 이미지)
  → 보안 검사 (의존성·이미지 스캔)
  → 산출물 저장 (레지스트리)
  → 배포: dev → stage → (승인) → prod
  → 배포 후 검증 (스모크 테스트, 헬스체크)
  → 실패 시 롤백
```

원칙: **빌드는 한 번만, 같은 산출물을 여러 환경에 배포**한다. 환경마다 다시 빌드하면 "스테이지에서 검증한 것"과 "운영에 나간 것"이 달라질 수 있다. 환경 차이는 이미지가 아닌 **설정**(환경 변수)으로 준다.

## 3. GitHub Actions 구조

| 개념 | 설명 |
|---|---|
| Workflow | `.github/workflows/*.yml` 파일 하나 |
| Event (on) | 실행 조건: push, pull_request, schedule, workflow_dispatch(수동) |
| Job | 하나의 러너에서 실행되는 단위. 기본은 병렬, `needs`로 순서 지정 |
| Step | Job 안의 명령 또는 Action |
| Action | 재사용 가능한 단계 (`uses: actions/checkout@v4`) |
| Runner | 실행 머신. GitHub 호스팅 또는 self-hosted |

## 4. CI 워크플로 예시

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true          # 같은 브랜치의 이전 실행 취소

jobs:
  test:
    runs-on: ubuntu-latest
    services:                        # 테스트용 DB 컨테이너
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
        env:
          DATABASE_URL: postgres://postgres:test@localhost:5432/postgres
      - run: npm run build
```

> Action 버전(`@v4` 등)은 사용 시점의 최신 메이저 버전을 확인한다. 보안이 중요한 경우 서드파티 Action은 커밋 SHA로 고정한다.

PR 병합 조건으로 이 워크플로 통과를 요구하려면 저장소 설정의 **Branch protection / Rulesets**에서 required status check로 지정한다.

## 5. 이미지 빌드와 푸시

```yaml
  image:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      tag: ${{ steps.meta.outputs.tag }}
    steps:
      - uses: actions/checkout@v4
      - id: meta
        run: echo "tag=${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:${{ steps.meta.outputs.tag }}
            ghcr.io/${{ github.repository }}:main
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### 태깅 전략

| 태그 | 용도 |
|---|---|
| git SHA (`a1b2c3d`) | 어떤 커밋인지 정확히 추적. 배포에 사용 |
| 시맨틱 버전 (`1.4.2`) | 릴리스 단위 관리 |
| 브랜치명 (`main`) | 편의용. 배포 기준으로 쓰지 않음 |

## 6. 배포 방식

### (1) SSH 푸시 배포 — 단일 서버

```yaml
  deploy:
    needs: image
    runs-on: ubuntu-latest
    environment: production          # 승인 규칙, 환경별 시크릿
    steps:
      - name: Deploy
        env:
          SSH_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
          HOST: ${{ secrets.DEPLOY_HOST }}
          TAG: ${{ needs.image.outputs.tag }}
        run: |
          install -m 600 /dev/null key && echo "$SSH_KEY" > key
          ssh -i key -o StrictHostKeyChecking=accept-new deploy@"$HOST" \
            "cd /opt/myapp && APP_TAG=$TAG docker compose pull app && APP_TAG=$TAG docker compose up -d app"
      - name: Smoke test
        run: curl -fsS --retry 10 --retry-delay 3 https://app.example.com/api/health
```

- 배포 전용 사용자와 전용 키를 쓰고, 가능하면 서버의 `authorized_keys`에서 허용 명령을 제한한다.
- 운영에서는 `known_hosts`를 시크릿으로 미리 등록하는 편이 더 안전하다.

### (2) Self-hosted runner — 폐쇄망/사내망

GitHub 호스팅 러너는 사내 서버에 접근할 수 없다. 사내에 러너를 설치하면 **러너가 GitHub으로 아웃바운드 연결**을 맺어 작업을 가져오므로, 인바운드 포트를 열 필요가 없다. 단, 러너가 GitHub에 나갈 수 있어야 한다.

완전 폐쇄망이라면 GitHub Actions를 쓸 수 없으므로 사내 GitLab CI, Jenkins, Gitea Actions 등을 두거나, 외부에서 빌드한 산출물을 반입하는 **반입 절차 자체를 스크립트로 표준화**한다.

주의: self-hosted runner는 **공개 저장소에서 쓰지 않는다.** 외부인의 PR이 사내 서버에서 코드를 실행할 수 있다.

### (3) Pull 기반 배포 (GitOps)

CI는 이미지 푸시와 "배포할 버전"을 Git에 기록하는 데까지만 하고, 클러스터 안의 도구(Argo CD, Flux)가 Git을 감시해 스스로 반영한다. 운영 환경 접근 권한을 CI에 줄 필요가 없다는 장점이 있다(9강).

## 7. 시크릿 관리

- 저장소 **Secrets**와 **Variables**를 구분한다 (비밀 / 비밀 아닌 설정)
- **Environments**(`production`, `staging`)로 환경별 시크릿을 분리하고, production에는 승인자(required reviewers)를 둔다
- 시크릿은 로그에 마스킹되지만, 변형(base64 등)해서 출력하면 노출된다
- `permissions:`로 `GITHUB_TOKEN` 권한을 최소화한다
- 클라우드 배포 시 장기 액세스 키 대신 **OIDC**로 임시 자격 증명을 받는다

```yaml
permissions:
  id-token: write
  contents: read
steps:
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: arn:aws:iam::123456789012:role/github-deploy
      aws-region: ap-northeast-2
```

- `pull_request_target` 이벤트는 포크 PR에서도 시크릿에 접근할 수 있어 위험하다. 의미를 정확히 알 때만 쓴다.

## 8. 배포 전략

| 전략 | 방식 | 장점 | 단점 |
|---|---|---|---|
| 재생성 (Recreate) | 전부 내리고 새로 올림 | 단순 | 다운타임 발생 |
| 롤링 (Rolling) | 인스턴스를 하나씩 교체 | 추가 자원 적음 | 구버전·신버전 공존 |
| 블루/그린 | 새 환경(그린)을 완성 후 트래픽 전환 | 즉시 전환·롤백 | 자원 2배 |
| 카나리 | 일부 트래픽(예: 5%)만 신버전으로 | 위험 최소화 | 트래픽 분할·모니터링 필요 |

### Nginx로 블루/그린 흉내 내기

```nginx
# /etc/nginx/conf.d/upstream.conf  ← 배포 스크립트가 이 파일만 바꾼다
# blue=3000, green=3001. 아래 스크립트가 이 파일의 포트를 뒤집는다
upstream app_backend { server 127.0.0.1:3000; }
```

```bash
#!/usr/bin/env bash
set -euo pipefail
CONF=/etc/nginx/conf.d/upstream.conf

# 0) 지금 트래픽을 받는 쪽(CURRENT)과 넘어갈 쪽(NEXT)을 파일에서 읽는다
CURRENT=$(grep -oE '127\.0\.0\.1:(3000|3001)' "$CONF" | cut -d: -f2)
if [ "$CURRENT" = "3000" ]; then NEXT=3001; else NEXT=3000; fi

# 1) NEXT 쪽 컨테이너 기동 → 2) 헬스체크 통과 확인
curl -fsS "http://127.0.0.1:${NEXT}/api/health"

# 3) upstream 교체 후 무중단 반영
sed -i "s/127.0.0.1:${CURRENT}/127.0.0.1:${NEXT}/" "$CONF"
nginx -t && systemctl reload nginx

# 4) 일정 시간 관찰 후 CURRENT 쪽 종료
#    롤백은 같은 스크립트를 한 번 더 실행하면 된다(CURRENT와 NEXT가 뒤바뀐다)
```

무중단 배포의 전제 조건:

1. 새 인스턴스가 **준비된 뒤** 트래픽을 받는다 (readiness)
2. 구 인스턴스는 **처리 중인 요청을 끝낸 뒤** 종료한다 (graceful shutdown, 1강의 SIGTERM)
3. 구버전과 신버전이 **동시에 동작해도 문제가 없다** (특히 DB 스키마)

## 9. 롤백과 DB 마이그레이션

롤백은 "이전 이미지 태그로 다시 배포"하면 된다. 그래서 태그를 SHA로 남기고, 직전 배포 버전을 기록해 둔다.

문제는 **DB 스키마**다. 코드는 되돌려도 스키마는 쉽게 되돌리지 못한다. 그래서 **expand-contract(확장-수축)** 패턴을 쓴다.

컬럼 이름을 `name` → `full_name`으로 바꾸는 경우:

| 배포 | 스키마 | 코드 |
|---|---|---|
| 1 (expand) | `full_name` 추가 (nullable) | 두 컬럼에 모두 쓰고, `name`에서 읽음 |
| 2 (migrate) | 기존 데이터 복사 | `full_name`에서 읽음 |
| 3 (contract) | `name` 삭제 | `full_name`만 사용 |

각 단계에서 바로 이전 버전 코드가 새 스키마와 함께 동작하므로 언제든 롤백할 수 있다.

기타 원칙:

- 마이그레이션은 **배포 파이프라인의 별도 단계**로, 한 번만 실행한다 (인스턴스마다 실행하지 않음)
- 대용량 테이블의 인덱스 추가·컬럼 변경은 잠금을 유발할 수 있으므로 DB별 온라인 방식(Postgres `CREATE INDEX CONCURRENTLY` 등)을 쓴다
- 마이그레이션 전 백업 또는 스냅샷

## 10. 브랜치 전략

| 전략 | 방식 | 적합 |
|---|---|---|
| GitHub Flow | main + 짧은 기능 브랜치 → PR → 병합 후 배포 | 대부분의 웹 서비스 |
| Trunk-based | main에 작게 자주 병합, 미완성 기능은 feature flag로 숨김 | 배포 빈도가 높은 팀 |
| Git Flow | develop, release, hotfix 브랜치 | 릴리스 주기가 정해진 제품 (설치형 등) |

브랜치가 오래 살수록 병합 충돌과 통합 위험이 커진다. **작게, 자주** 합치는 것이 CI의 전제다.

## 11. 환경 분리와 설정 (12-Factor)

- 설정은 코드가 아니라 **환경 변수**로 주입
- dev / stage / prod는 가능한 한 동일한 구성 (같은 이미지, 같은 DB 종류)
- 로그는 파일이 아니라 **표준 출력**으로 → 수집은 플랫폼이 담당 (7강)
- 프로세스는 무상태, 상태는 DB·캐시·오브젝트 스토리지에
- 빠른 시작과 graceful shutdown

## 12. 파이프라인 품질

- **캐시**: 의존성(`setup-node` cache), Docker 레이어(`type=gha`)
- **병렬화**: lint와 test를 별도 job으로
- **경로 필터**: 문서만 바뀌면 빌드 생략 (`on.push.paths-ignore`)
- **재사용**: reusable workflow(`workflow_call`), composite action
- **알림**: 실패 시 Slack/메일
- **보안 스캔**: `npm audit`, Dependabot/Renovate, Trivy 이미지 스캔, 시크릿 스캔

## 13. 실습 과제

1. 4강의 프로젝트에 lint, test, build를 수행하는 CI 워크플로를 추가하고 PR에서 필수 체크로 지정한다.
2. main 병합 시 GHCR에 SHA 태그로 이미지를 푸시한다.
3. `production` environment를 만들고 승인자를 지정한 뒤, SSH로 서버에 배포하는 job을 추가한다.
4. 배포 후 스모크 테스트가 실패하면 직전 태그로 되돌리는 스크립트를 작성한다.
5. Nginx upstream 교체 방식으로 블루/그린 배포를 구현하고, 배포 중 `while true; do curl ...; done`으로 요청 실패가 없는지 확인한다.
6. 컬럼 이름 변경을 expand-contract 3단계로 나눠 배포해 본다.

## 14. 핵심 정리

- 빌드는 한 번, 같은 산출물을 모든 환경에 → 차이는 설정으로
- 이미지는 SHA 태그로 추적, 롤백은 이전 태그 재배포
- 시크릿은 environment 단위로 분리하고 운영은 승인 필수, 클라우드는 OIDC
- 사내망은 self-hosted runner(아웃바운드만), 완전 폐쇄망은 사내 CI나 반입 절차 표준화
- 무중단의 3조건: 준비 후 투입, 정리 후 종료, 신구 버전 공존 가능
- DB 변경은 expand-contract로 항상 롤백 가능하게
- 작게, 자주 병합

## 더 깊이

이 강은 CI/CD의 전체 그림을 한 번에 훑었다. GitHub Actions 문법, 캐시 최적화, 공급망 보안, GitOps까지 13강으로 나눠 다루는 심화 시리즈가 따로 있다.

- [풀스택 개발자를 위한 CI/CD 1강 — CI/CD란 무엇인가: 개념과 전체 그림](/posts/cicd-01-what-is-cicd)
