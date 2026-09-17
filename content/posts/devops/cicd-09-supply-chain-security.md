---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 CI/CD 9강 — 공급망 보안: 스캔, SBOM, 서명'
date: '2026-09-17'
category: 'devops'
tags: ['CI/CD', 'Security', 'SBOM', 'Supply Chain', 'SLSA']
description: '의존성·베이스 이미지·서드파티 액션까지 모두 공급망입니다. 액션 고정과 의존성 관리 자동화, 코드·비밀값 스캔, 컨테이너 이미지 스캔, SBOM 생성, 이미지 서명과 검증, SLSA 프레임워크를 파이프라인에 심습니다.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 CI/CD'
seriesOrder: 9

# 📚 SEO용
keywords: ['공급망 보안', '타이포스쿼팅', '액션 SHA 고정', 'Dependabot', 'Renovate', 'Trivy', 'SBOM', 'Syft', 'cosign', 'SLSA']
---
# 풀스택 개발자를 위한 CI/CD 9강 — 공급망 보안: 스캔, SBOM, 서명

> 풀스택 개발자를 위한 CI/CD 시리즈 · 심화 9/13

현대 애플리케이션 코드의 대부분은 우리가 작성하지 않았습니다. npm 패키지, 베이스 이미지, CI에서 쓰는 서드파티 액션이 모두 **소프트웨어 공급망**입니다. 이 중 하나만 오염되어도 우리 빌드와 운영 환경이 오염됩니다. 이번 강의에서는 파이프라인에 공급망 보안을 심는 방법을 다룹니다.

## 1. 공급망 공격의 경로

```
[의존성]      악성 버전 배포, 타이포스쿼팅(reacct, lodahs), 유지보수자 계정 탈취
    ↓
[CI 도구]     서드파티 액션 탈취, 태그 변조
    ↓
[빌드]        빌드 중 코드 주입, 시크릿 탈취
    ↓
[산출물]      레지스트리의 이미지 바꿔치기
    ↓
[운영]        검증 없이 받은 이미지 실행
```

실제 사례도 많습니다. npm에서는 인기 패키지의 유지보수 권한이 넘어가 악성 코드가 들어간 사건이 여러 번 있었고, 2025년에는 널리 쓰이던 GitHub 액션(`tj-actions/changed-files`)이 탈취되어 태그가 악성 커밋을 가리키도록 바뀌면서, 이를 쓰던 수많은 저장소의 CI 로그에 시크릿이 노출될 위험이 생겼습니다.

방어는 각 단계마다 겹겹이 쌓아야 합니다.

## 2. 서드파티 액션 고정

`uses: some/action@v3`의 `v3`은 **움직일 수 있는 태그**입니다. 액션 저장소가 탈취되면 태그가 악성 커밋으로 옮겨질 수 있습니다. 커밋 SHA는 옮길 수 없으므로, **전체 커밋 SHA로 고정**합니다.

```yaml
# ❌ 태그는 바뀔 수 있음
- uses: some-org/some-action@v3

# ✅ 40자리 커밋 SHA로 고정, 사람이 읽을 수 있게 버전을 주석으로
- uses: some-org/some-action@<40자리-커밋-SHA> # v3.2.1
```

SHA는 액션 저장소의 Releases 페이지에서 해당 태그가 가리키는 커밋을 확인하거나, 다음 명령으로 얻습니다.

```bash
git ls-remote --tags https://github.com/some-org/some-action 'v3.2.1*'
```

- GitHub 공식 액션(`actions/*`)과 신뢰도가 높은 조직의 액션은 태그를 허용하는 팀도 있지만, 일관되게 SHA로 고정하는 편이 관리가 쉽습니다.
- 조직 설정에서 **허용할 액션 목록**을 제한하고, SHA 고정을 강제하는 정책을 켤 수 있습니다.
- SHA로 고정하면 업데이트가 멈추므로, 아래의 Dependabot으로 **자동 업데이트 PR**을 받습니다.

## 3. 의존성 관리 자동화

### Dependabot

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    groups:
      dev-dependencies:
        dependency-type: development
    open-pull-requests-limit: 10

  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly

  - package-ecosystem: docker
    directory: /
    schedule:
      interval: weekly
```

- npm, 액션, Dockerfile 베이스 이미지를 모두 대상으로 합니다.
- `groups`로 관련 업데이트를 묶어 PR 폭주를 줄입니다.
- 업데이트 PR도 **일반 PR과 같은 CI 게이트**를 통과해야 머지됩니다. 3강의 테스트가 여기서 빛을 발합니다. Renovate도 비슷한 역할을 하며 설정이 더 유연합니다.

### PR에서 새 의존성 검사

```yaml
name: Dependency Review
on: pull_request
permissions:
  contents: read
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/dependency-review-action@v4
        with:
          fail-on-severity: high
          deny-licenses: GPL-3.0, AGPL-3.0
```

PR에서 **새로 추가되거나 바뀐 의존성**에 알려진 취약점이 있거나, 허용하지 않은 라이선스가 있으면 실패시킵니다.

### 설치 단계 방어

- `npm ci`는 lockfile의 무결성 해시(`integrity`)를 검증합니다. lockfile 변경은 코드 리뷰에서 반드시 확인합니다.
- `npm audit --audit-level=high`를 파이프라인에 넣을 수 있지만, 개발 의존성의 경고가 많아 소음이 될 수 있으므로 `--omit=dev`와 함께 기준을 정합니다.
- 설치 스크립트(`postinstall`)는 공격 경로가 되기도 합니다. pnpm은 의존성의 설치 스크립트를 명시적으로 허용한 패키지만 실행하도록 설정할 수 있습니다.

## 4. 코드와 비밀값 스캔

| 종류 | 도구 | 검사 대상 |
|---|---|---|
| SAST (정적 분석) | CodeQL, Semgrep | 인젝션, XSS 등 코드의 취약한 패턴 |
| 시크릿 스캔 | GitHub secret scanning, gitleaks | 커밋에 포함된 키, 토큰 |
| SCA (구성 요소 분석) | Dependabot, `npm audit`, Trivy | 의존성의 알려진 취약점 |
| 컨테이너 스캔 | Trivy, Grype | 이미지 안의 OS 패키지, 런타임 라이브러리 |
| IaC 스캔 | Trivy, Checkov | Dockerfile, Kubernetes YAML, Terraform 설정 오류 |

CodeQL 예시입니다.

```yaml
name: CodeQL
on:
  push: { branches: [main] }
  pull_request:
  schedule:
    - cron: '0 3 * * 1'
permissions:
  contents: read
  security-events: write
jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript
      - uses: github/codeql-action/analyze@v3
```

결과는 저장소의 Security 탭에 모입니다. **스케줄 실행**을 함께 두는 이유는, 코드가 바뀌지 않아도 새로운 취약점 규칙이 추가되기 때문입니다.

## 5. 컨테이너 이미지 스캔

```yaml
      - name: 이미지 취약점 스캔
        uses: aquasecurity/trivy-action@<커밋-SHA> # 버전 주석
        with:
          image-ref: ghcr.io/my-org/my-app:${{ github.sha }}
          severity: CRITICAL,HIGH
          ignore-unfixed: true
          exit-code: '1'
          format: table
```

- **`ignore-unfixed: true`**: 아직 패치가 없는 취약점은 우리가 할 수 있는 일이 없으므로 게이트에서 제외합니다(기록은 별도로 남깁니다).
- **`exit-code: '1'`**: 기준 이상의 취약점이 있으면 파이프라인을 실패시킵니다.
- SARIF 형식으로 출력해 Security 탭에 올리면 이력을 관리하기 좋습니다.

### 예외 관리

모든 취약점을 즉시 고칠 수는 없습니다. 실제로 영향이 없는 취약점은 사유와 함께 예외로 등록합니다.

```
# .trivyignore
# CVE-XXXX-YYYY: 해당 기능 미사용 확인 (담당: han, 재검토: 2026-12-31)
CVE-XXXX-YYYY
```

**예외에는 사유, 담당자, 만료일**을 남겨 주기적으로 재검토합니다. 사유 없는 예외 목록은 금방 무의미해집니다.

### 베이스 이미지 줄이기

취약점 대부분은 우리가 쓰지도 않는 OS 패키지에서 나옵니다.

- `node:22` (Debian 전체) → `node:22-slim` → `node:22-alpine` → distroless 순으로 포함된 패키지가 줄어듭니다.
- distroless 이미지는 셸조차 없어 공격 표면이 작지만, 디버깅이 어려워집니다. 팀의 운영 역량에 맞춰 선택합니다.
- 베이스 이미지를 **정기적으로 재빌드**해야 OS 보안 패치가 반영됩니다. 코드 변경이 없어도 주간 스케줄 빌드를 두는 이유입니다.

## 6. SBOM: 소프트웨어 구성 명세서

SBOM(Software Bill of Materials)은 **산출물에 무엇이 들어 있는지에 대한 목록**입니다. 새로운 심각한 취약점이 공개되었을 때 "우리 서비스 중 어디에 이 라이브러리가 들어 있지?"라는 질문에 몇 분 만에 답할 수 있게 해 줍니다.

- 표준 형식은 **SPDX**와 **CycloneDX**입니다.
- 공공기관이나 대기업 납품 시 SBOM 제출을 요구하는 경우가 늘고 있습니다.

BuildKit으로 이미지 빌드와 동시에 SBOM과 출처 증명(provenance)을 첨부할 수 있습니다.

```yaml
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          sbom: true
          provenance: mode=max
```

별도 파일로 만들려면 Syft를 씁니다.

```bash
syft ghcr.io/my-org/my-app:$TAG -o spdx-json > sbom.spdx.json
grype sbom:sbom.spdx.json      # SBOM 기반 취약점 검사
```

## 7. 이미지 서명과 검증

스캔과 SBOM은 "이미지에 무엇이 들었나"를 알려 줍니다. 서명은 "**이 이미지를 정말 우리 파이프라인이 만들었나**"를 보장합니다. 레지스트리가 탈취되어 이미지가 바꿔치기되어도, 서명 검증에서 걸러집니다.

### Cosign keyless 서명

Sigstore의 Cosign은 7강의 **OIDC 토큰으로 서명**할 수 있어, 관리할 서명 키가 없습니다. 서명에는 "어느 저장소의 어느 워크플로가 서명했는지"가 기록되고, 공개 투명성 로그에 남습니다.

```yaml
  sign:
    needs: image
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      packages: write
    steps:
      - uses: sigstore/cosign-installer@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: digest로 서명
        env:
          IMAGE: ghcr.io/my-org/my-app
          DIGEST: ${{ needs.image.outputs.digest }}
        run: cosign sign --yes "${IMAGE}@${DIGEST}"
```

**태그가 아니라 digest에 서명**합니다. 태그는 다른 이미지로 옮겨질 수 있기 때문입니다.

배포 전에 검증합니다.

```bash
cosign verify "ghcr.io/my-org/my-app@${DIGEST}" \
  --certificate-identity-regexp '^https://github.com/my-org/my-app/\.github/workflows/.+@refs/heads/main$' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

"my-org/my-app 저장소의 main 브랜치 워크플로가 서명한 이미지만 허용"한다는 의미입니다. 6강의 배포 스크립트에 이 검증을 넣으면, 서명되지 않은 이미지는 서버에서 실행되지 않습니다.

### GitHub Artifact Attestations

GitHub 자체 기능으로 출처 증명을 만들고 검증할 수도 있습니다.

```yaml
      - uses: actions/attest-build-provenance@v2
        with:
          subject-name: ghcr.io/my-org/my-app
          subject-digest: ${{ steps.build.outputs.digest }}
          push-to-registry: true
```

```bash
gh attestation verify oci://ghcr.io/my-org/my-app@${DIGEST} --owner my-org
```

이 액션은 `id-token: write`와 `attestations: write` 권한이 필요합니다.

### Kubernetes에서 강제하기

Kubernetes 환경이라면 Kyverno나 Sigstore Policy Controller 같은 **admission controller**로 "서명 검증에 실패한 이미지는 클러스터에 배포 불가" 정책을 걸 수 있습니다(12강).

## 8. SLSA 프레임워크

SLSA(Supply-chain Levels for Software Artifacts)는 공급망 보안 수준을 단계로 정의한 프레임워크입니다. 핵심 요구 사항을 요약하면 다음과 같습니다.

- 빌드가 **격리된 환경**에서, **정의된 파이프라인**으로만 실행된다.
- 산출물에 **어떤 소스, 어떤 빌드 과정**에서 나왔는지에 대한 **검증 가능한 출처 증명**이 있다.
- 사람이 로컬에서 빌드한 산출물을 운영에 올리지 않는다.

지금까지 강의에서 만든 구조(격리된 Runner, Pipeline as Code, provenance, 서명)가 이 요구 사항을 상당 부분 충족합니다.

## 9. Runner와 워크플로 강화

- 워크플로 `permissions`는 최소로 (7강).
- 공개 저장소에서는 포크 PR 워크플로 실행에 승인을 요구합니다.
- **공개 저장소에 self-hosted runner를 붙이지 않습니다.** 외부인의 PR 코드가 내부 머신에서 실행될 수 있습니다.
- self-hosted runner는 job마다 깨끗한 환경을 제공하는 **일회성(ephemeral)** 구성을 권장합니다.
- OpenSSF Scorecard로 저장소의 보안 관행을 점검할 수 있습니다.

## 10. 보안 파이프라인 전체 그림

```
PR ─┬─ lint / test
    ├─ CodeQL (SAST)
    ├─ Dependency Review (신규 의존성)
    ├─ gitleaks (비밀값)
    └─ 이미지 빌드 + Trivy (push 없음)

main ─ 이미지 빌드 (SBOM, provenance 포함)
     ─ Trivy 스캔 (CRITICAL/HIGH, fix 있음 → 실패)
     ─ push → digest 확보
     ─ cosign 서명 / attestation
     ─ 배포 (서명 검증 후 digest로 실행)

주간 스케줄 ─ 베이스 이미지 재빌드, CodeQL, 운영 이미지 재스캔
상시 ─ Dependabot (npm, actions, docker)
```

## 11. 정리

- 서드파티 액션은 커밋 SHA로 고정하고 Dependabot으로 업데이트합니다.
- PR 단계에서 신규 의존성, 코드 패턴, 비밀값을 검사합니다.
- 이미지 스캔은 수정 가능한 고위험 취약점을 게이트로 삼고, 예외는 사유와 만료일로 관리합니다.
- SBOM으로 구성 요소를 기록하고, digest 기반 keyless 서명으로 출처를 보장합니다.
- 배포 시점에 서명을 검증해야 서명이 의미를 가집니다.

## 확인 문제와 해설

**Q1.** 이미지 태그 `v1.2.0`에 서명했는데 누군가 레지스트리에서 같은 태그로 다른 이미지를 push했습니다. 검증은 어떻게 될까요?

> Cosign은 태그를 digest로 해석해 서명을 찾습니다. 바꿔치기된 이미지의 digest에는 서명이 없으므로 검증에 실패합니다. 그래서 서명과 배포 모두 digest 기준으로 하는 것이 원칙입니다.

**Q2.** Trivy가 매번 수십 개의 HIGH 취약점을 보고하는데 대부분 패치가 없는 OS 패키지입니다. 어떻게 개선할까요?

> `ignore-unfixed`로 게이트 대상을 수정 가능한 것으로 좁히고, 더 작은 베이스 이미지(slim, alpine, distroless)로 바꿔 불필요한 패키지를 제거합니다.

**Q3.** 코드 변경이 없는데 왜 주간 스케줄 빌드와 스캔이 필요할까요?

> 베이스 이미지의 OS 보안 패치는 재빌드해야 반영되고, 새로운 취약점은 코드가 그대로여도 매일 공개되기 때문입니다.
