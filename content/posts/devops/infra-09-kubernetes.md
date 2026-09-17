---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 인프라 9강 — 쿠버네티스'
date: '2026-09-17'
category: 'devops'
tags: ['Kubernetes', 'Helm', 'Container', 'Orchestration', 'DevOps']
description: '컨트롤 플레인과 핵심 오브젝트, probe 세 종류의 구분, requests와 limits, 오토스케일링, 롤링 업데이트와 무중단 종료, Helm·Kustomize 패키징, 그리고 쿠버네티스를 쓰지 말아야 할 때.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 인프라'
seriesOrder: 9

# 📚 SEO용
keywords: ['쿠버네티스', 'Kubernetes', 'k8s', 'Pod', 'Deployment', 'Service', 'Ingress', 'probe', 'HPA', 'Helm', 'Kustomize', 'k3s', 'graceful shutdown']
---

# 풀스택 개발자를 위한 인프라 9강 — 쿠버네티스

[8강](/posts/infra-08-iac)까지로 인프라를 코드로 재현할 수 있게 됐다면, 이번 강에서는 여러 서버에 걸친 컨테이너의 배치와 유지를 사람이 아니라 시스템이 계속 맞춰 주도록 넘기는 방법을 다룬다.

## 1. 왜 오케스트레이션이 필요한가

서버 한 대의 Docker Compose로는 다음 문제를 풀기 어렵다.

- 서버가 죽으면 그 위의 컨테이너를 **다른 서버로 옮겨** 다시 띄우기
- 트래픽에 따라 컨테이너 수를 **자동으로 늘리고 줄이기**
- 여러 서버에 걸친 **무중단 롤링 배포와 롤백**
- 서버 여러 대의 자원을 **하나의 풀**처럼 스케줄링
- 서비스 디스커버리, 설정·비밀 주입의 표준화

쿠버네티스(K8s)는 이것들을 **선언형 API**로 제공하는 컨테이너 오케스트레이터다.

## 2. 아키텍처

```
┌──────────────────── Control Plane ────────────────────┐
│ kube-apiserver   ← 모든 요청의 입구 (kubectl, 컨트롤러) │
│ etcd             ← 클러스터 상태 저장소 (key-value)     │
│ kube-scheduler   ← 새 Pod를 어느 노드에 둘지 결정        │
│ controller-manager ← 원하는 상태를 유지하는 컨트롤러들   │
└───────────────────────────────────────────────────────┘
            │
┌───── Worker Node ─────┐   ┌───── Worker Node ─────┐
│ kubelet     ← Pod 실행 관리 │   │ kubelet               │
│ kube-proxy  ← Service 라우팅│   │ kube-proxy            │
│ containerd  ← 컨테이너 런타임│   │ containerd            │
│ [Pod] [Pod] [Pod]      │   │ [Pod] [Pod]           │
└────────────────────────┘   └───────────────────────┘
       + CNI 플러그인 (Pod 네트워크: Calico, Cilium, Flannel)
       + CoreDNS (클러스터 내부 DNS)
```

etcd는 클러스터의 **유일한 진실의 원천**이다. etcd 백업이 곧 클러스터 설정 백업이다.

### 조정 루프 (Reconciliation)

```
사용자: "replicas: 3 인 Deployment" 를 선언 → etcd에 저장
컨트롤러: 현재 2개 → 1개 생성
스케줄러: 새 Pod를 여유 있는 노드에 배치
kubelet: 컨테이너 실행
... Pod 하나 죽음 → 컨트롤러가 다시 감지 → 새로 생성
```

사용자는 "어떻게"가 아니라 "**무엇이어야 하는가**"를 선언하고, 컨트롤러들이 끊임없이 현재 상태를 원하는 상태로 맞춘다. [8강의 선언형 개념](/posts/infra-08-iac)이 런타임에서 계속 동작하는 셈이다.

## 3. 핵심 오브젝트

| 오브젝트 | 역할 | Compose 대응 |
|---|---|---|
| **Pod** | 배포 최소 단위. 컨테이너 1개 이상 + 네트워크·볼륨 공유 | 컨테이너 |
| ReplicaSet | Pod 개수 유지 | |
| **Deployment** | ReplicaSet 버전 관리, 롤링 업데이트, 롤백 | service |
| StatefulSet | 고정 이름·고정 스토리지가 필요한 Pod (DB) | |
| DaemonSet | 모든 노드에 하나씩 (로그 수집기, 모니터링 에이전트) | |
| Job / CronJob | 일회성 / 주기적 작업 (마이그레이션, 배치) | cron |
| **Service** | Pod 집합에 대한 고정 주소 + 로드밸런싱 | 서비스 이름 DNS |
| **Ingress / Gateway** | 외부 HTTP(S) 트래픽 라우팅 | Nginx |
| **ConfigMap / Secret** | 설정 / 비밀 주입 | env_file |
| PV / PVC / StorageClass | 영구 스토리지 | volumes |
| Namespace | 논리적 격리 (팀, 환경) | 프로젝트 |

Pod는 **언제든 죽고 새 IP로 다시 태어난다.** 그래서 Pod IP에 직접 접속하지 않고 Service를 거친다. Pod를 직접 만들지 않고 Deployment 같은 상위 오브젝트로 관리한다.

### Service 타입

| 타입 | 접근 범위 |
|---|---|
| ClusterIP (기본) | 클러스터 내부에서만. `이름.네임스페이스.svc.cluster.local` |
| NodePort | 모든 노드의 특정 포트(30000~32767)로 외부 노출 |
| LoadBalancer | 클라우드 로드밸런서 자동 생성 (온프레미스는 MetalLB 등 필요) |
| Headless (`clusterIP: None`) | 로드밸런싱 없이 Pod IP 목록 반환 (StatefulSet) |

Service는 **label selector**로 대상 Pod를 찾는다. 라벨이 어긋나면 Service에 대상이 0개가 되어 접속이 안 된다(`kubectl get endpointslices`로 확인).

## 4. 매니페스트 예시

`app.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: api-config
  namespace: blog
data:
  LOG_LEVEL: info
  REDIS_URL: redis://redis:6379
---
apiVersion: v1
kind: Secret
metadata:
  name: api-secret
  namespace: blog
type: Opaque
stringData:
  DATABASE_URL: postgres://app:changeme@postgres:5432/app
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: blog
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1          # 교체 중 최대 1개 추가
      maxUnavailable: 0    # 가용 Pod가 줄지 않게
  template:
    metadata:
      labels:
        app: api
    spec:
      terminationGracePeriodSeconds: 30
      securityContext:
        runAsNonRoot: true
      containers:
        - name: api
          image: ghcr.io/example/api:a1b2c3d
          ports:
            - containerPort: 3000
          envFrom:
            - configMapRef:
                name: api-config
            - secretRef:
                name: api-secret
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              memory: 512Mi
          startupProbe:
            httpGet: { path: /healthz, port: 3000 }
            failureThreshold: 30
            periodSeconds: 2
          livenessProbe:
            httpGet: { path: /healthz, port: 3000 }
            periodSeconds: 10
          readinessProbe:
            httpGet: { path: /readyz, port: 3000 }
            periodSeconds: 5
          lifecycle:
            preStop:
              exec:
                command: ["sleep", "5"]
---
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: blog
spec:
  selector:
    app: api
  ports:
    - port: 80
      targetPort: 3000
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api
  namespace: blog
spec:
  ingressClassName: traefik
  tls:
    - hosts: [api.example.com]
      secretName: api-tls
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 80
```

```bash
kubectl create namespace blog
kubectl apply -f app.yaml
kubectl -n blog get all
```

### Secret에 대한 오해

Secret은 기본적으로 **base64 인코딩일 뿐 암호화가 아니다.** 매니페스트를 그대로 Git에 올리면 비밀이 노출된다. 실무에서는 다음 중 하나를 쓴다.

- Sealed Secrets: 클러스터만 복호화할 수 있게 암호화해 Git에 저장
- SOPS: 파일 단위 암호화
- External Secrets Operator: Vault, AWS Secrets Manager 등에서 동기화

etcd 저장 시 암호화(encryption at rest)와 RBAC로 Secret 조회 권한을 제한하는 것도 필요하다.

### Ingress와 Gateway API

Ingress는 실제로 트래픽을 처리하는 **Ingress Controller**(Traefik, NGINX 계열, HAProxy 등)가 있어야 동작한다. 널리 쓰이던 커뮤니티 `ingress-nginx` 프로젝트는 유지보수 종료가 발표되었으므로, 신규 구축이라면 다른 컨트롤러나 후속 표준인 **Gateway API**(Gateway, HTTPRoute) 구현체를 검토한다. 인증서는 **cert-manager**로 자동 발급·갱신한다.

## 5. Probe — 7강의 헬스체크가 여기서 쓰인다

| Probe | 실패 시 | 용도 |
|---|---|---|
| startupProbe | 성공할 때까지 나머지 probe 보류, 한도 초과 시 재시작 | 시작이 느린 앱 (JVM 등) |
| livenessProbe | **컨테이너 재시작** | 교착 상태 등 스스로 회복 불가 |
| readinessProbe | **Service 대상에서 제외** (재시작 안 함) | 준비 전·일시적 과부하·의존성 장애 |

liveness에 DB 검사를 넣으면 DB 장애 시 **모든 Pod가 재시작 루프**에 빠진다. liveness는 가볍게, 의존성은 readiness에서 본다 — [7강의 헬스체크](/posts/infra-07-observability)에서 세운 원칙 그대로다.

## 6. 리소스 requests와 limits

- **requests**: 스케줄링 기준. "최소 이만큼 보장해 달라"
- **limits**: 상한. CPU는 초과 시 **스로틀링**(느려짐), 메모리는 초과 시 **OOMKilled**(재시작)

| QoS 클래스 | 조건 | 노드 메모리 부족 시 |
|---|---|---|
| Guaranteed | 모든 컨테이너 requests = limits | 가장 나중에 축출 |
| Burstable | requests만 있거나 limits와 다름 | 중간 |
| BestEffort | 둘 다 없음 | 가장 먼저 축출 |

실무 팁:

- 메모리는 requests와 limits를 **비슷하게** 두는 편이 예측 가능하다
- CPU limit은 지연 시간에 민감한 서비스에서 불필요한 스로틀링을 일으킬 수 있어, requests만 두는 팀도 많다
- Node.js는 컨테이너 메모리 제한을 인식하지만, 힙 크기(`--max-old-space-size`)를 limit보다 여유 있게 작게 잡아 OOMKilled 대신 앱 수준에서 제어되게 한다
- requests를 안 쓰면 스케줄러가 한 노드에 Pod를 과하게 몰아넣는다

## 7. 오토스케일링

| 종류 | 무엇을 | 기준 |
|---|---|---|
| **HPA** | Pod 개수 | CPU, 메모리, 커스텀 메트릭 |
| VPA | Pod의 requests 값 | 실제 사용량 |
| Cluster Autoscaler / Karpenter | 노드 개수 | 스케줄 못 된 Pod |
| KEDA | Pod 개수 (0까지) | 큐 길이 등 이벤트 |

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api
  namespace: blog
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70     # requests 대비 비율
```

HPA는 **metrics-server**가 필요하고, 사용률은 **requests 대비**로 계산하므로 requests가 없으면 동작하지 않는다.

## 8. 배포, 롤백, 무중단 종료

```bash
kubectl -n blog set image deployment/api api=ghcr.io/example/api:d4e5f6a
kubectl -n blog rollout status deployment/api
kubectl -n blog rollout history deployment/api
kubectl -n blog rollout undo deployment/api            # 직전 버전으로
kubectl -n blog rollout restart deployment/api         # 설정 변경 후 재시작
```

실무에서는 `set image` 대신 매니페스트의 이미지 태그를 Git에서 바꾸고 `apply`(또는 GitOps)한다. 명령으로 바꾸면 Git과 클러스터가 어긋난다.

### Pod 종료 순서와 502 방지

```
1. Pod 삭제 요청
2. 동시에: (a) Endpoint에서 제거 시작  (b) preStop 훅 실행
3. preStop 종료 후 컨테이너에 SIGTERM
4. terminationGracePeriodSeconds 초과 시 SIGKILL
```

(a)가 전체 노드와 Ingress에 반영되기 전에 앱이 종료되면 일부 요청이 죽은 Pod로 가서 502가 난다. 그래서 `preStop`에서 몇 초 기다린 뒤 SIGTERM을 받게 하고, 앱은 SIGTERM에서 **새 연결 거부 → 진행 중 요청 완료 → 종료**를 수행한다. [1강의 graceful shutdown](/posts/infra-01-linux-operations)이 여기서 완성된다.

**PodDisruptionBudget**으로 노드 점검 중에도 최소 가용 Pod 수를 보장한다.

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api
  namespace: blog
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: api
```

## 9. 스토리지와 상태 저장 워크로드

- **PVC**: "10Gi 스토리지가 필요하다"는 요청
- **PV**: 실제 스토리지
- **StorageClass**: PVC 요청 시 PV를 자동 생성하는 방법 (클라우드 디스크, Longhorn, local-path)
- **accessModes**: `ReadWriteOnce`(한 노드), `ReadWriteMany`(여러 노드, NFS 등)

DB를 쿠버네티스에서 운영하는 것은 가능하지만(StatefulSet, 오퍼레이터: CloudNativePG 등), 백업·복구·업그레이드 난도가 높다. 클라우드라면 **관리형 DB(RDS)를 클러스터 밖에** 두는 것이 일반적인 출발점이다.

## 10. kubectl과 디버깅

```bash
kubectl config get-contexts / use-context prod      # 어느 클러스터인지 항상 확인
kubectl get pods -n blog -o wide
kubectl describe pod api-xxx -n blog                # Events 섹션이 핵심
kubectl logs api-xxx -n blog [-c 컨테이너] [--previous]   # --previous: 죽기 전 로그
kubectl logs -l app=api -n blog --tail=100          # 라벨로 여러 Pod
kubectl exec -it api-xxx -n blog -- sh
kubectl port-forward svc/api 8080:80 -n blog        # 로컬에서 서비스 접근
kubectl get events -n blog --sort-by=.lastTimestamp
kubectl top pods -n blog                            # metrics-server 필요
kubectl debug -it api-xxx -n blog --image=nicolaka/netshoot --target=api   # 디버그 컨테이너
kubectl get endpointslices -n blog                  # Service 대상 확인
kubectl explain deployment.spec.strategy            # 필드 설명
kubectl apply -f app.yaml --dry-run=server          # 서버 검증만
kubectl diff -f app.yaml                            # 적용 전 차이
```

### 상태별 진단

| 상태 | 의미 | 확인 |
|---|---|---|
| **Pending** | 배치할 노드가 없음 | describe Events: 자원 부족, PVC 미바인딩, taint/affinity |
| **ImagePullBackOff** | 이미지를 못 받음 | 태그 오타, 레지스트리 인증(imagePullSecrets), 폐쇄망 레지스트리 접근 |
| **CrashLoopBackOff** | 시작 후 계속 죽음 | `logs --previous`, 환경변수·설정 누락, liveness 과민 |
| **OOMKilled** | 메모리 limit 초과 | `describe`의 Last State, limits 조정 또는 누수 확인 |
| **Running인데 접속 불가** | 네트워크/라우팅 | readiness 실패?, Service selector?, endpointslices?, Ingress 규칙? |
| **CreateContainerConfigError** | ConfigMap/Secret 참조 실패 | 이름 오타, 네임스페이스 불일치 |

접속 문제는 바깥에서 안으로 좁힌다: **Ingress → Service → EndpointSlice → Pod(readiness) → 컨테이너 포트/바인딩.**

## 11. 패키징: Helm과 Kustomize

| | Helm | Kustomize |
|---|---|---|
| 방식 | 템플릿 + values | 원본 YAML + 패치(overlay) |
| 강점 | 패키지 배포·버전 관리, 공개 차트 생태계 | 템플릿 없이 단순, `kubectl`에 내장 |
| 적합 | 서드파티 소프트웨어 설치 (Prometheus, cert-manager) | 자체 앱의 환경별 차이 |

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install monitoring prometheus-community/kube-prometheus-stack -n monitoring --create-namespace -f values.yaml
helm upgrade / rollback / uninstall
```

```
k8s/
├── base/             deployment.yaml, service.yaml, kustomization.yaml
└── overlays/
    ├── dev/          kustomization.yaml (replicas 1, 이미지 태그)
    └── prod/         kustomization.yaml (replicas 3, 리소스 증가)
```

```bash
kubectl apply -k k8s/overlays/prod
```

### GitOps

Argo CD나 Flux가 Git 저장소의 매니페스트를 감시하다가 클러스터에 자동 반영하고, 누군가 클러스터를 직접 바꾸면 drift로 표시하거나 되돌린다. [5강](/posts/infra-05-cicd)에서 말한 pull 기반 배포다.

## 12. 보안 기본

- **RBAC**: 사람과 서비스 계정(ServiceAccount)에 최소 권한
- **NetworkPolicy**: 기본적으로 모든 Pod 간 통신이 허용되므로, 필요한 통신만 허용 (CNI가 지원해야 함)
- **Pod Security Standards**: 네임스페이스에 `restricted` 수준 적용 (root 실행, 권한 상승 금지)
- 이미지 출처 제한, 취약점 스캔
- `default` 네임스페이스 사용 지양, kubeconfig 파일 보호

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: db-allow-api-only
  namespace: blog
spec:
  podSelector:
    matchLabels: { app: postgres }
  ingress:
    - from:
        - podSelector:
            matchLabels: { app: api }
      ports:
        - port: 5432
```

## 13. 실습 환경과 폐쇄망

| 도구 | 특징 |
|---|---|
| kind, minikube | 로컬 학습용 |
| **k3s** | 경량 배포판, 단일 바이너리. Traefik·local-path 스토리지 기본 포함. 소규모 운영·엣지·폐쇄망에 적합 |
| RKE2 | 보안 강화형, 공공·폐쇄망에서 많이 쓰임 |
| kubeadm | 표준 설치 도구, 구성 요소를 직접 이해하기 좋음 |
| EKS/GKE/AKS | 관리형 control plane |

```bash
# k3s 설치 (인터넷 환경)
curl -sfL https://get.k3s.io | sh -
sudo k3s kubectl get nodes
```

폐쇄망 설치: k3s와 RKE2는 **에어갭 설치**를 공식 지원한다. 바이너리, 에어갭 이미지 묶음(tar), 설치 스크립트를 반입하고, 사내 레지스트리(Harbor)를 `registries.yaml`로 미러 지정한다. 앱 이미지와 Helm 차트, 차트가 참조하는 이미지까지 **전부 목록화해서 반입**하는 것이 핵심이다.

## 14. 쿠버네티스를 쓰지 말아야 할 때

- 서비스가 몇 개 없고 트래픽이 안정적 → Compose, ECS, PaaS로 충분
- 팀에 운영 인력이 없음 → 클러스터 업그레이드, 인증서, CNI, 스토리지 운영 부담이 크다
- 목표가 "이력서"라면 학습은 좋지만, 운영 선택은 문제 크기에 맞춘다

쿠버네티스는 복잡성을 없애 주지 않고 **표준화된 방식으로 옮겨 놓는다.**

## 15. 실습 과제

1. VM 1~3대에 k3s 클러스터를 구성한다(단일 노드로 시작해도 된다).
2. 4강 이미지를 Deployment(3 replicas) + Service + Ingress로 배포한다.
3. Pod 하나를 삭제하고 자동으로 복구되는 과정을 `kubectl get pods -w`로 관찰한다.
4. readiness를 일부러 실패시키고 Service 대상에서 빠지는지 endpointslices로 확인한다.
5. 존재하지 않는 이미지 태그, 누락된 Secret, 너무 작은 메모리 limit으로 각각 ImagePullBackOff, CreateContainerConfigError, OOMKilled를 재현하고 진단한다.
6. 부하 테스트 중 롤링 업데이트를 수행하고, preStop 유무에 따른 에러 발생을 비교한다.
7. HPA를 설정하고 부하를 걸어 Pod 수가 늘어나는지 확인한다.
8. Helm으로 kube-prometheus-stack을 설치하고 7강의 대시보드를 클러스터 기준으로 다시 만든다.
9. Kustomize로 dev/prod overlay를 만들고, (선택) Argo CD로 GitOps 배포를 구성한다.

## 16. 핵심 정리

- 선언한 상태를 컨트롤러가 계속 맞추는 조정 루프가 본질
- Pod는 일회용, 접근은 Service로, 관리는 Deployment로
- Service ↔ Pod 연결은 라벨이 전부
- Secret은 암호화가 아니다 → Sealed Secrets/SOPS/External Secrets
- liveness는 재시작, readiness는 트래픽 제외
- requests는 스케줄링과 HPA의 기준, 메모리 limit 초과는 OOMKilled
- preStop + graceful shutdown + PDB로 무중단
- 디버깅은 `describe`의 Events와 `logs --previous`부터
- 서드파티는 Helm, 자체 앱은 Kustomize, 배포는 GitOps
- 폐쇄망은 k3s/RKE2 에어갭 설치 + 사내 레지스트리 + 이미지 전수 목록화
- 문제 크기에 맞을 때만 도입

## 더 깊이

- 매니페스트를 Git에 두고 클러스터가 스스로 따라오게 만드는 방법은 [CI/CD 12강 — GitOps와 Kubernetes 배포](/posts/cicd-12-gitops-kubernetes)
- CronJob으로 주기 작업을 돌릴 때의 함정은 [Cron 완전 정복 4편 — systemd timer, Kubernetes CronJob, 분산 환경](/posts/cron-04-systemd-k8s-distributed)
