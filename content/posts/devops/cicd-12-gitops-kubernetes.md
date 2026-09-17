---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 CI/CD 12강 — GitOps와 Kubernetes 배포'
date: '2026-09-17'
category: 'devops'
tags: ['CI/CD', 'GitOps', 'Kubernetes', 'Argo CD']
description: '배포에 필요한 Kubernetes 리소스만 추린 뒤, Git을 운영 상태의 원천으로 삼는 GitOps를 다룹니다. Push와 Pull 배포의 차이, 앱 저장소와 설정 저장소 분리, Argo CD Application, GitOps에서의 비밀값과 마이그레이션 순서를 정리합니다.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 CI/CD'
seriesOrder: 12

# 📚 SEO용
keywords: ['GitOps', 'Kubernetes', 'Argo CD', 'Deployment', 'Kustomize', 'Helm', 'Argo Rollouts', 'Pull 배포', '선언형 배포']
---
# 풀스택 개발자를 위한 CI/CD 12강 — GitOps와 Kubernetes 배포

> 풀스택 개발자를 위한 CI/CD 시리즈 · 심화 12/13

서비스가 여러 개로 늘고 서버도 여러 대가 되면, SSH로 서버마다 스크립트를 실행하는 방식은 한계에 부딪힙니다. "지금 운영에 정확히 무엇이 어떤 설정으로 떠 있는가"를 파악하기 어려워지기 때문입니다. 이번 강의에서는 Kubernetes 배포의 기본과, **Git을 운영 상태의 원천으로 삼는 GitOps**를 다룹니다.

## 1. 배포 관점의 Kubernetes 핵심

Kubernetes를 전부 알 필요는 없습니다. 배포에 필요한 리소스는 다음 정도입니다.

| 리소스 | 역할 | 이전 강의와의 연결 |
|---|---|---|
| **Deployment** | 원하는 이미지와 복제본 수를 선언, 롤링 업데이트 수행 | 6강의 compose `app` 서비스 |
| **Service** | 파드들 앞의 고정된 내부 주소와 부하 분산 | Compose의 서비스 이름 |
| **Ingress / Gateway** | 외부 HTTP(S) 요청을 Service로 라우팅 | 8강의 Nginx |
| **ConfigMap / Secret** | 설정과 비밀값 주입 | 7강의 `.env` |
| **Job** | 한 번 실행하고 끝나는 작업 | 8강의 마이그레이션 실행 |

핵심 개념은 **선언형**(declarative)입니다. "컨테이너를 교체하라"고 명령하는 대신 "이 이미지로 파드 3개가 떠 있어야 한다"고 선언하면, Kubernetes가 현재 상태를 선언한 상태로 맞춥니다.

### Deployment 예시

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels: { app: web }
spec:
  replicas: 3
  selector:
    matchLabels: { app: web }
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1           # 교체 중 최대 1개 추가 생성
      maxUnavailable: 0     # 교체 중 가용 파드가 줄지 않게
  template:
    metadata:
      labels: { app: web }
    spec:
      terminationGracePeriodSeconds: 30
      securityContext:
        runAsNonRoot: true
      containers:
        - name: web
          image: harbor.internal/s-app/web@sha256:<digest>
          ports:
            - containerPort: 3000
          envFrom:
            - configMapRef: { name: web-config }
            - secretRef: { name: web-secrets }
          readinessProbe:
            httpGet: { path: /api/health, port: 3000 }
            periodSeconds: 5
          livenessProbe:
            httpGet: { path: /api/health, port: 3000 }
            initialDelaySeconds: 15
            periodSeconds: 10
          resources:
            requests: { cpu: 100m, memory: 256Mi }
            limits: { memory: 512Mi }
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
          volumeMounts:
            - name: tmp
              mountPath: /tmp
      volumes:
        - name: tmp
          emptyDir: {}
```

8강에서 다룬 개념이 모두 여기에 선언으로 들어 있습니다.

- `maxUnavailable: 0` + `readinessProbe` → 새 파드가 준비되어야 구 파드를 내리는 무중단 롤링
- `terminationGracePeriodSeconds` → Graceful Shutdown 유예 시간
- 이미지를 **digest**로 지정 → 불변 배포 (5강, 9강)
- `readOnlyRootFilesystem` → 컨테이너 강화. 쓰기가 필요한 경로만 볼륨으로 제공

## 2. Push 배포와 Pull 배포

### Push: CI에서 kubectl 실행

```yaml
- run: kubectl set image deployment/web web=harbor.internal/s-app/web@${DIGEST}
- run: kubectl rollout status deployment/web --timeout=5m
```

간단하지만 문제가 있습니다.

- CI가 **클러스터 관리자 권한**을 가져야 합니다.
- 누군가 `kubectl edit`으로 운영을 직접 바꾸면, Git과 실제 상태가 **조용히 어긋납니다(drift)**.
- "지금 운영 설정이 무엇인가"의 답이 CI 로그와 클러스터 곳곳에 흩어집니다.

### Pull: GitOps

클러스터 안의 에이전트가 **Git 저장소를 계속 지켜보다가**, Git에 선언된 상태로 클러스터를 맞춥니다.

```
개발자 ──PR──▶ [설정 저장소 (Git)] ◀──주기적 확인── [Argo CD (클러스터 내부)]
                                                         │
                                                         ▼ 동기화
                                                   [Kubernetes 리소스]
```

## 3. GitOps의 네 가지 원칙

OpenGitOps 프로젝트가 정리한 원칙은 다음과 같습니다.

1. **선언형(Declarative)**: 시스템의 원하는 상태를 선언으로 표현한다.
2. **버전 관리되고 불변(Versioned and Immutable)**: 원하는 상태가 이력과 함께 불변 형태로 저장된다. (Git)
3. **자동으로 당겨옴(Pulled Automatically)**: 에이전트가 원하는 상태를 스스로 가져간다.
4. **지속적으로 조정(Continuously Reconciled)**: 에이전트가 실제 상태를 계속 관찰하고 원하는 상태로 맞춘다.

얻는 것은 다음과 같습니다.

- **운영 변경 = Git 커밋**: 누가, 언제, 왜 바꿨는지 PR과 리뷰로 남습니다.
- **롤백 = `git revert`**: 이전 상태로 되돌리는 방법이 하나로 통일됩니다.
- **drift 자동 복구**: 누가 클러스터를 직접 바꿔도 Git 상태로 되돌아갑니다.
- **CI는 클러스터 권한이 필요 없음**: CI는 Git에 커밋만 하고, 클러스터 접근은 내부 에이전트만 합니다. 폐쇄망이나 방화벽 안의 클러스터에도 잘 맞습니다.

## 4. 저장소 구조: 앱 저장소와 설정 저장소

```
app 저장소 (my-app)               설정 저장소 (my-app-config)
├── src/                          └── apps/web/
├── Dockerfile                        ├── base/
└── .github/workflows/                │   ├── deployment.yaml
    └── ci.yml                        │   ├── service.yaml
                                      │   └── kustomization.yaml
                                      └── overlays/
                                          ├── staging/
                                          │   └── kustomization.yaml
                                          └── production/
                                              └── kustomization.yaml
```

**저장소를 분리하는 이유**: 앱 코드 커밋과 배포 설정 커밋의 이력이 섞이지 않고, 설정 저장소에만 엄격한 권한과 리뷰 규칙을 걸 수 있습니다. 소규모 팀이라면 한 저장소의 `deploy/` 폴더로 시작해도 괜찮습니다.

### Kustomize로 환경별 차이 표현

```yaml
# apps/web/base/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deployment.yaml
  - service.yaml
```

```yaml
# apps/web/overlays/production/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: web-prod
resources:
  - ../../base
images:
  - name: harbor.internal/s-app/web
    digest: sha256:<운영 digest>
replicas:
  - name: web
    count: 3
```

base는 공통, overlay는 환경별 차이(이미지, 복제본 수, 네임스페이스, 설정)만 담습니다. 템플릿 변수와 패키지 배포가 필요하면 **Helm**을 씁니다. Kustomize는 "YAML 패치", Helm은 "템플릿 + 패키지"라고 보면 됩니다.

## 5. CI와 GitOps 연결

CI의 역할은 **이미지를 만들고, 설정 저장소의 이미지 참조를 갱신**하는 데서 끝납니다.

```yaml
  update-staging:
    needs: image
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          repository: my-org/my-app-config
          token: ${{ secrets.CONFIG_REPO_TOKEN }}

      - name: 스테이징 이미지 갱신
        env:
          DIGEST: ${{ needs.image.outputs.digest }}
        run: |
          cd apps/web/overlays/staging
          kustomize edit set image "harbor.internal/s-app/web@${DIGEST}"

      - name: 커밋 & push
        env:
          SHA: ${{ github.sha }}
        run: |
          git config user.name "ci-bot"
          git config user.email "ci-bot@users.noreply.github.com"
          git commit -am "web(staging): ${SHA::7}"
          git push
```

- `CONFIG_REPO_TOKEN`은 설정 저장소 **한 곳에만 쓰기 권한**을 가진 토큰(fine-grained PAT 또는 GitHub App 토큰)으로 발급합니다.
- 스테이징은 바로 커밋하고, **운영은 PR을 만들어 리뷰 후 머지**하도록 하면 승인 절차가 Git 리뷰로 자연스럽게 바뀝니다.

```
스테이징: CI가 직접 커밋 → Argo CD 자동 동기화
운영:     CI가 PR 생성 → 리뷰·승인 → 머지 → Argo CD 동기화
```

이미지 갱신을 CI 대신 **Argo CD Image Updater**나 **Flux의 이미지 자동화** 컨트롤러가 레지스트리를 감시해서 처리하게 할 수도 있습니다.

## 6. Argo CD Application

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: web-production
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://git.internal/my-org/my-app-config.git
    targetRevision: main
    path: apps/web/overlays/production
  destination:
    server: https://kubernetes.default.svc
    namespace: web-prod
  syncPolicy:
    automated:
      prune: true        # Git에서 지운 리소스는 클러스터에서도 삭제
      selfHeal: true     # 클러스터에서 직접 바꾼 내용은 Git 상태로 복구
    syncOptions:
      - CreateNamespace=true
```

Argo CD 화면에서는 각 앱이 **Synced / OutOfSync**, **Healthy / Degraded** 상태로 표시됩니다. "지금 운영이 Git과 일치하는가"를 한눈에 볼 수 있습니다.

- `prune`과 `selfHeal`은 강력한 만큼, 처음에는 끈 상태로 시작해 동작을 이해한 뒤 켜는 것도 방법입니다.
- 서비스가 많으면 **App of Apps** 패턴이나 **ApplicationSet**으로 Application 자체도 Git으로 생성합니다.
- 대안으로 **Flux**가 있습니다. 원칙은 같고, Argo CD는 UI가 강하며 Flux는 Kubernetes 네이티브 컨트롤러 구성이 특징입니다.

## 7. GitOps에서의 비밀값

Git에 모든 것을 둔다고 해서 **비밀값을 평문으로 커밋하면 안 됩니다.** Kubernetes Secret은 base64 인코딩일 뿐 암호화가 아닙니다.

| 방식 | 원리 |
|---|---|
| **Sealed Secrets** | 클러스터의 공개키로 암호화한 SealedSecret을 Git에 커밋. 클러스터 안의 컨트롤러만 복호화 가능 |
| **SOPS** | 파일 안의 값만 암호화(age, KMS 등). Argo CD/Flux 플러그인으로 복호화 |
| **External Secrets Operator** | Git에는 "어느 시크릿 매니저의 어떤 키"라는 참조만 두고, 실제 값은 Vault나 클라우드 시크릿 매니저에서 가져옴 |

규모가 커질수록 External Secrets Operator처럼 **Git에는 참조만 두는 방식**이 교체와 감사에 유리합니다.

## 8. 마이그레이션과 배포 순서

8강의 "마이그레이션은 앱 배포 전에, 한 번만"을 GitOps에서는 **Sync Hook**으로 표현합니다.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: web-migrate
  annotations:
    argocd.argoproj.io/hook: PreSync
    argocd.argoproj.io/hook-delete-policy: BeforeHookCreation
spec:
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: harbor.internal/s-app/web@sha256:<digest>   # 앱과 같은 이미지
          command: ["npx", "prisma", "migrate", "deploy"]
          envFrom:
            - secretRef: { name: web-secrets }
```

- **PreSync**: 동기화 전에 Job을 실행하고, 성공해야 Deployment 갱신으로 넘어갑니다.
- 리소스 간 순서가 더 필요하면 **sync wave** 어노테이션으로 단계를 나눕니다.
- 이 Job 역시 **이전 버전 코드와 호환되는 마이그레이션**만 실행해야 합니다. Expand-Contract 원칙은 도구가 바뀌어도 그대로입니다.

## 9. 점진적 배포: Argo Rollouts

Deployment의 롤링 업데이트는 "문제가 있어도 끝까지 교체"합니다. **Argo Rollouts**를 쓰면 8강의 카나리를 선언형으로 만들 수 있습니다.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: web
spec:
  replicas: 5
  strategy:
    canary:
      steps:
        - setWeight: 10
        - pause: { duration: 5m }
        - analysis:
            templates:
              - templateName: error-rate     # Prometheus 오류율 조회
        - setWeight: 50
        - pause: { duration: 10m }
        - setWeight: 100
  # selector, template은 Deployment와 동일
```

분석 단계에서 오류율이 기준을 넘으면 **자동으로 중단하고 이전 버전으로 되돌립니다.** 트래픽을 정밀하게 나누려면 Ingress 컨트롤러나 서비스 메시와 연동합니다.

## 10. 정책으로 지키기

클러스터에 들어오는 리소스를 **admission 정책**으로 검사할 수 있습니다(Kyverno, OPA Gatekeeper).

- 서명 검증에 실패한 이미지 거부 (9강)
- `latest` 태그 사용 거부, digest 강제
- 루트 실행, 권한 상승 거부
- `resources` 미지정 거부
- 허용된 레지스트리(`harbor.internal/*`) 이외의 이미지 거부 (11강)

파이프라인의 규칙이 **클러스터 입구에서 한 번 더** 강제됩니다.

## 11. Kubernetes가 항상 답은 아니다

| 상황 | 권장 |
|---|---|
| 서비스 1\~3개, 서버 1\~2대, 소규모 팀 | Docker Compose + 6·8강의 스크립트 배포 |
| 운영 인력 없이 확장이 필요 | 관리형 컨테이너 서비스, PaaS |
| 서비스 다수, 여러 팀, 자동 복구·확장 필요 | Kubernetes + GitOps |

Kubernetes는 강력하지만 **클러스터 자체의 운영 비용**(업그레이드, 네트워크, 스토리지, 모니터링)이 큽니다. 다만 GitOps의 원칙, 즉 "원하는 상태를 Git에 선언하고, 에이전트가 맞춘다"는 Compose 환경에서도 설정 저장소와 pull 스크립트로 흉내 낼 수 있습니다.

## 12. 정리

- Kubernetes에서 배포는 명령이 아니라 원하는 상태의 선언입니다.
- GitOps는 Git을 운영 상태의 원천으로 삼고, 클러스터 내부 에이전트가 이를 지속적으로 맞추는 방식입니다.
- CI는 이미지를 만들고 설정 저장소를 갱신하는 데서 끝나며, 클러스터 권한이 필요 없습니다.
- 운영 승인은 설정 저장소의 PR 리뷰로, 롤백은 `git revert`로 통일됩니다.
- 비밀값은 암호화하거나 외부 시크릿 매니저 참조로만 Git에 둡니다.
- 마이그레이션은 PreSync Hook으로, 카나리는 Argo Rollouts로 선언합니다.

## 확인 문제와 해설

**Q1.** 장애 대응 중 `kubectl scale deployment/web --replicas=10`을 실행했는데 잠시 후 3개로 돌아갔습니다. 이유는요?

> Argo CD의 `selfHeal`이 Git에 선언된 `replicas: 3`으로 되돌렸기 때문입니다. GitOps 환경에서는 설정 저장소를 변경하거나, HPA처럼 복제본 수를 관리하는 리소스를 사용하고 해당 필드를 동기화 대상에서 제외해야 합니다.

**Q2.** GitOps 설정 저장소에 Kubernetes Secret YAML을 그대로 커밋했습니다. base64로 인코딩되어 있으니 안전할까요?

> 안전하지 않습니다. base64는 누구나 디코딩할 수 있습니다. Sealed Secrets, SOPS, External Secrets Operator 중 하나를 사용해야 합니다.

**Q3.** GitOps에서 CI가 클러스터 접근 권한을 갖지 않아도 되는 이유는요?

> CI는 설정 저장소에 커밋만 하고, 실제 클러스터 변경은 클러스터 내부의 에이전트가 Git을 읽어 수행하기 때문입니다.

## 더 깊이

- 이 편이 전제로 깔고 가는 쿠버네티스 자체(Pod와 Deployment, Service와 Ingress, 클러스터 운영)는 [풀스택 개발자를 위한 인프라 9강 — 쿠버네티스](/posts/infra-09-kubernetes)에서 다룹니다.
