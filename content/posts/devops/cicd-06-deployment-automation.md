---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 CI/CD 6강 — 배포 자동화: 서버 배포와 플랫폼 배포'
date: '2026-09-17'
category: 'devops'
tags: ['CI/CD', 'Deployment', 'Docker Compose', 'Vercel']
description: '레지스트리에 올린 이미지를 서버에서 실행시키는 CD 단계를 만듭니다. Push와 Pull 방식을 비교하고, SSH + Docker Compose 배포 스크립트와 워크플로, 플랫폼 배포, PR 미리보기 환경, 릴리스 자동화를 구성합니다.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 CI/CD'
seriesOrder: 6

# 📚 SEO용
keywords: ['배포 자동화', 'SSH 배포', 'Docker Compose', 'Push 배포', 'Pull 배포', 'Vercel', 'PR 미리보기', '릴리스 자동화']
---
# 풀스택 개발자를 위한 CI/CD 6강 — 배포 자동화: 서버 배포와 플랫폼 배포

> 풀스택 개발자를 위한 CI/CD 시리즈 · 중급 6/13

5강까지 레지스트리에 이미지가 올라갔다면, 이제 그 이미지를 서버에서 실행시키는 CD 단계를 만듭니다. 가장 흔한 형태인 **단일 서버 + Docker Compose** 배포를 직접 구성하고, 플랫폼 배포와 릴리스 자동화도 함께 봅니다.

## 1. 배포 대상의 종류

| 대상 | 예시 | 배포 방식 | 적합한 경우 |
|---|---|---|---|
| 플랫폼(PaaS) | Vercel, Netlify, Render | 저장소 연결 또는 CLI | 빠른 시작, 소규모 팀 |
| 가상 머신 | EC2, 사내 서버, 개인 서버 | SSH + Docker Compose | 제어가 필요하거나 비용 민감 |
| 관리형 컨테이너 | ECS, Cloud Run | 서비스 정의 업데이트 | 서버 관리 부담 감소 |
| Kubernetes | EKS, 온프레미스 k8s | kubectl, Helm, GitOps | 다수 서비스, 대규모 (12강) |

이번 강의의 중심은 가상 머신입니다. 원리를 가장 투명하게 볼 수 있고, 사내 서버와 폐쇄망에서도 그대로 쓰이는 방식이기 때문입니다.

## 2. Push 방식과 Pull 방식

- **Push 방식**: CI가 서버에 접속해서 배포 명령을 실행합니다. 구현이 쉽고 결과를 CI에서 바로 확인할 수 있습니다. 대신 CI가 서버 접근 권한을 가져야 합니다.
- **Pull 방식**: 서버(또는 서버 안의 에이전트)가 주기적으로 새 버전을 확인하고 스스로 업데이트합니다. 서버가 인바운드 접근을 열 필요가 없습니다. 12강의 GitOps가 대표적입니다.

이번 강의에서는 Push 방식으로 구성합니다.

## 3. 서버 준비

서버에는 다음 구조를 만듭니다.

```
/srv/app/
├── compose.yaml        # 서비스 정의
├── .env                # 런타임 비밀값 (권한 600)
├── deploy.sh           # 배포 스크립트
└── releases.log        # 배포 이력
```

### compose.yaml

```yaml
services:
  app:
    image: ghcr.io/my-org/my-app:${IMAGE_TAG:?IMAGE_TAG is required}
    restart: unless-stopped
    env_file: .env
    environment:
      APP_VERSION: ${IMAGE_TAG}
    ports:
      - "127.0.0.1:3000:3000"      # 외부에 직접 노출하지 않고 리버스 프록시 뒤에 둠
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3000/api/health"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 20s
    stop_grace_period: 30s
```

- `${IMAGE_TAG:?...}`는 변수가 비어 있으면 실행 자체를 막습니다. 태그 없이 엉뚱한 이미지가 뜨는 사고를 방지합니다.
- 포트를 `127.0.0.1`에만 바인딩하고, 앞단의 Nginx나 Caddy가 HTTPS를 처리합니다.

### 배포 전용 계정

```bash
sudo useradd -m -s /bin/bash deploy
sudo usermod -aG docker deploy
sudo mkdir -p /srv/app && sudo chown deploy:deploy /srv/app
```

> docker 그룹 권한은 사실상 root 권한과 같습니다. 배포 계정의 SSH 키는 CI 전용으로 발급하고, 다른 용도로 쓰지 않습니다.

더 엄격하게 하려면 `authorized_keys`에 **forced command**를 걸어, 이 키로는 배포 스크립트만 실행할 수 있게 제한합니다.

```
command="/srv/app/deploy.sh",no-port-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... ci-deploy
```

forced command를 쓰면 클라이언트가 보낸 명령은 `SSH_ORIGINAL_COMMAND` 환경변수로 전달되므로, 스크립트에서 이 값을 검증해 태그로 사용합니다.

### 비공개 이미지 pull 준비

GHCR 이미지가 비공개라면, 서버에서 **읽기 전용 권한(`read:packages`)만 가진 토큰**으로 한 번 로그인해 둡니다.

```bash
echo "$GHCR_READ_TOKEN" | docker login ghcr.io -u <username> --password-stdin
```

## 4. 배포 스크립트

```bash
#!/usr/bin/env bash
# /srv/app/deploy.sh
set -euo pipefail

# forced command로 실행되면 클라이언트가 보낸 명령이 SSH_ORIGINAL_COMMAND에 담김
# ("/srv/app/deploy.sh <SHA>" 형태이므로 마지막 단어를 태그로 사용)
if [[ -n "${SSH_ORIGINAL_COMMAND:-}" ]]; then
  TAG="${SSH_ORIGINAL_COMMAND##* }"
else
  TAG="${1:-}"
fi

# 태그 형식 검증 (40자리 커밋 SHA만 허용)
if [[ ! "$TAG" =~ ^[0-9a-f]{40}$ ]]; then
  echo "유효하지 않은 태그: '$TAG'" >&2
  exit 1
fi

cd /srv/app
export IMAGE_TAG="$TAG"

echo "==> 이미지 받기: $IMAGE_TAG"
docker compose pull app

echo "==> 컨테이너 교체"
docker compose up -d --wait --wait-timeout 90 app

echo "==> 헬스체크"
for i in $(seq 1 15); do
  if curl -fsS http://127.0.0.1:3000/api/health | grep -q "$IMAGE_TAG"; then
    echo "$(date -Iseconds) $IMAGE_TAG" >> releases.log
    echo "==> 배포 성공"
    docker image prune -f --filter "until=168h" > /dev/null
    exit 0
  fi
  sleep 2
done

echo "==> 헬스체크 실패" >&2
exit 1
```

- **`set -euo pipefail`**: 명령 하나라도 실패하면 즉시 중단합니다. 배포 스크립트의 기본입니다.
- **입력 검증**: CI에서 넘어오는 값이라도 형식을 검증합니다.
- **`--wait`**: Compose가 컨테이너의 healthcheck가 healthy가 될 때까지 기다립니다.
- **버전 확인**: 헬스체크 응답에 새 태그가 들어 있는지 확인해서, 이전 컨테이너가 응답하는 착시를 피합니다.
- **이력 기록**: `releases.log`의 직전 줄이 곧 롤백 대상입니다.
- **정리**: 디스크가 이미지로 가득 차는 것은 흔한 장애 원인입니다. 오래된 이미지를 정리하되, 롤백용으로 최근 것은 남깁니다.

**이 방식은 컨테이너를 교체하는 몇 초 동안 요청이 실패할 수 있습니다.** 무중단 배포는 8강에서 다룹니다.

### 롤백

```bash
# 직전 성공 배포 확인
tail -n 2 /srv/app/releases.log
# 이전 태그로 다시 배포
/srv/app/deploy.sh <이전-커밋-SHA>
```

불변 이미지와 태그 이력 덕분에, 롤백은 "이전 태그로 배포하기"라는 같은 동작이 됩니다.

## 5. 배포 워크플로

5강의 이미지 워크플로 뒤에 배포 job을 붙입니다.

```yaml
  deploy:
    needs: image
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    timeout-minutes: 10
    environment:
      name: production
      url: https://app.example.com
    concurrency:
      group: deploy-production
      cancel-in-progress: false
    steps:
      - name: SSH 설정
        env:
          SSH_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
          KNOWN_HOSTS: ${{ secrets.DEPLOY_KNOWN_HOSTS }}
        run: |
          install -m 700 -d ~/.ssh
          printf '%s\n' "$SSH_KEY" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          printf '%s\n' "$KNOWN_HOSTS" > ~/.ssh/known_hosts

      - name: 배포
        env:
          HOST: ${{ secrets.DEPLOY_HOST }}
          TAG: ${{ github.sha }}
        run: |
          ssh -i ~/.ssh/deploy_key deploy@"$HOST" "/srv/app/deploy.sh $TAG"

      - name: 외부 스모크 테스트
        run: |
          curl -fsS --retry 5 --retry-delay 3 https://app.example.com/api/health
```

주의할 점은 다음과 같습니다.

- **`known_hosts`를 등록합니다.** `StrictHostKeyChecking=no`로 우회하면 중간자 공격에 노출됩니다. 서버에서 `ssh-keyscan -t ed25519 <host>`로 얻은 값을 시크릿으로 저장합니다.
- **시크릿은 `env`로 넘기고 `run` 안에서는 셸 변수로 씁니다.** `${{ }}`를 `run` 스크립트에 직접 넣는 습관은 스크립트 인젝션으로 이어질 수 있습니다(7강).
- **`environment: production`**: 7강에서 이 환경에 승인 규칙을 걸어 Continuous Delivery로 만듭니다.
- 서버가 사설망에 있어 GitHub-hosted runner가 접근할 수 없다면, 사내에 self-hosted runner를 두거나 VPN, 또는 Pull 방식을 씁니다.

## 6. 플랫폼 배포: Vercel을 CI에서 제어하기

Vercel의 Git 연동을 그대로 써도 되지만, "테스트를 통과한 커밋만 배포"하려면 CI에서 Vercel CLI로 배포하는 방법이 있습니다.

```yaml
  deploy-vercel:
    needs: verify
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    env:
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm install --global vercel@latest
      - run: vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}
      - run: vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}
      - run: vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}
```

이때는 Vercel 프로젝트 설정에서 Git 연동의 자동 배포를 꺼서 이중 배포를 막습니다. `vercel build`로 CI에서 빌드하고 `--prebuilt`로 결과만 올리므로, 검증한 빌드와 배포되는 빌드가 같아집니다.

## 7. PR 미리보기 환경

PR마다 임시 환경을 띄우면 리뷰어가 실제 동작을 보고 판단할 수 있습니다.

- **플랫폼**: Vercel, Netlify는 기본 제공합니다.
- **직접 구성**: PR 번호로 서브도메인(`pr-123.preview.example.com`)과 Compose 프로젝트 이름(`docker compose -p pr-123`)을 분리해 띄우고, `pull_request`의 `closed` 이벤트에서 정리합니다.

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, closed]

jobs:
  preview:
    if: github.event.action != 'closed'
    # ... pr-${{ github.event.number }} 로 배포
  cleanup:
    if: github.event.action == 'closed'
    # ... docker compose -p pr-${{ github.event.number }} down
```

미리보기 환경은 **운영 데이터에 접근하지 않도록** 별도 DB나 시드 데이터를 씁니다.

## 8. 릴리스 자동화

"언제 버전을 올리고 변경 내역을 어떻게 남길 것인가"도 파이프라인으로 자동화할 수 있습니다.

### Conventional Commits

```
feat: 대시보드에 월별 KPI 필터 추가
fix: 배관 공정률 계산 시 0으로 나누는 오류 수정
feat!: 인증 API 응답 형식 변경
```

`feat`은 마이너, `fix`는 패치, `!`나 `BREAKING CHANGE`는 메이저 버전 증가로 해석합니다.

### 도구

| 도구 | 방식 |
|---|---|
| release-please | 커밋을 분석해 "릴리스 PR"을 만들고, 머지하면 태그와 GitHub Release 생성 |
| semantic-release | main 머지 시 자동으로 버전 결정, 태그, 릴리스 노트 생성 |
| Changesets | PR마다 변경 설명 파일을 추가. 모노레포 패키지 버전 관리에 강함 |

릴리스 태그(`v1.5.0`)가 push되면 5강의 이미지 워크플로가 semver 태그 이미지를 만들고, 운영 배포는 이 태그를 기준으로 진행하는 흐름이 자연스럽습니다.

```
feat/fix 커밋 → main 머지 → 스테이징 자동 배포 (SHA 태그)
                   ↓
            릴리스 PR 머지 → v1.5.0 태그 → 운영 배포 (승인 후)
```

## 9. 정리

- 가상 머신 배포는 "이미지 pull → 컨테이너 교체 → 헬스체크 → 이력 기록"의 반복입니다.
- 배포 스크립트는 `set -euo pipefail`, 입력 검증, 새 버전 확인까지 포함해야 합니다.
- CI의 서버 접근은 전용 계정, 전용 키, `known_hosts` 검증, 가능하면 forced command로 제한합니다.
- 롤백은 이전 태그로 같은 배포 스크립트를 실행하는 것입니다.
- 플랫폼 배포도 CI에서 제어하면 "검증된 빌드만 배포"를 보장할 수 있습니다.
- Conventional Commits와 릴리스 도구로 버전과 변경 내역을 자동화합니다.

## 확인 문제와 해설

**Q1.** 배포 후 헬스체크가 성공했는데 실제로는 이전 버전이 떠 있었습니다. 스크립트에서 무엇이 빠졌을까요?

> 헬스체크 응답이 **새 버전인지** 확인하는 단계가 빠졌습니다. 응답에 버전(태그)을 포함시키고 기대값과 비교해야 합니다.

**Q2.** 편의를 위해 SSH 옵션에 `StrictHostKeyChecking=no`를 넣었습니다. 어떤 위험이 있나요?

> 서버의 신원을 확인하지 않으므로, 중간에서 서버를 가장한 공격자에게 배포 키 인증과 명령을 보낼 수 있습니다. `known_hosts`를 시크릿으로 등록해 검증해야 합니다.

**Q3.** 운영 서버 디스크가 가득 차 배포가 실패했습니다. 파이프라인 관점에서 예방책은요?

> 배포 스크립트에 오래된 이미지 정리를 포함하되 롤백용 최근 이미지는 남기고, 디스크 사용량 모니터링 알림을 설정합니다.
