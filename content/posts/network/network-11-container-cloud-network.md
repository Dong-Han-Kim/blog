---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 네트워크 11장 — 컨테이너와 클라우드 네트워크'
date: '2026-09-17'
category: 'network'
tags: ['Network', 'Docker', 'Kubernetes', 'VPC', 'Container']
description: 'Docker 네트워크 드라이버와 컨테이너 안의 localhost 함정, 포트 매핑 방향과 ufw로 막히지 않는 publish, depends_on과 healthcheck, Kubernetes Service·DNS, VPC 서브넷과 보안 그룹·NACL의 차이를 다룬다.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 네트워크'
seriesOrder: 11

# 📚 SEO용
keywords: ['Network', 'Docker', 'Kubernetes', 'VPC', 'Container', 'Docker 네트워크', 'bridge', 'host', 'overlay', 'docker-compose', 'host.docker.internal', 'Kubernetes', 'ClusterIP', 'NetworkPolicy', 'VPC', '보안 그룹', 'NACL']
---

# 풀스택 개발자를 위한 네트워크 11장 — 컨테이너와 클라우드 네트워크

10장의 구성요소들은 대부분 컨테이너와 클라우드 위에서 돌아갑니다. 이번 장은 그 환경이 만드는 고유한 규칙과, 개발자가 가장 자주 틀리는 지점을 봅니다.

## 11.1 Docker 네트워크 드라이버

| 드라이버 | 설명 | 용도 |
|---|---|---|
| bridge (기본) | 가상 브리지(docker0)에 컨테이너 연결, NAT로 외부 통신 | 일반적인 단일 호스트 |
| 사용자 정의 bridge | 위와 같지만 **컨테이너 이름으로 DNS 해석 가능** | Compose 기본 |
| host | 호스트의 네트워크 스택을 그대로 사용 | 고성능, 대량 포트 필요(WebRTC) |
| none | 네트워크 없음 | 격리 작업 |
| overlay | 여러 호스트에 걸친 가상 네트워크 | Swarm |
| macvlan | 컨테이너에 물리망의 MAC/IP 직접 부여 | 레거시 장비 연동 |

## 11.2 컨테이너 네트워크에서 가장 많이 틀리는 것들

**1) 컨테이너 안의 `localhost`는 컨테이너 자신이다**

```yaml
# docker-compose.yml
services:
  app:
    environment:
      DATABASE_URL: postgres://user:pw@db:5432/app   # O: 서비스 이름
      # DATABASE_URL: postgres://user:pw@localhost:5432/app  # X
  db:
    image: postgres:16
```

- 같은 Compose 네트워크 안에서는 **서비스 이름**으로 접근합니다. Docker의 내장 DNS(`127.0.0.11`)가 이름을 해석합니다.
- 기본 bridge 네트워크(docker run만 쓴 경우)는 이름 해석이 **안 됩니다.** 사용자 정의 네트워크를 만드세요.
- 컨테이너에서 **호스트 머신**의 서비스에 접근하려면 `host.docker.internal`(Docker Desktop 기본, Linux는 `extra_hosts: ["host.docker.internal:host-gateway"]` 필요) 또는 호스트의 IP를 사용합니다.

**2) 포트 매핑의 방향**

```yaml
ports:
  - "8080:3000"          # 호스트 8080 → 컨테이너 3000
  - "127.0.0.1:5432:5432" # 호스트의 로컬에서만 접근 허용
```

- 컨테이너끼리 통신할 때는 **포트 매핑이 필요 없습니다.** 내부 포트(3000)로 직접 붙습니다.
- DB 포트를 `0.0.0.0`으로 publish하면 외부에 그대로 노출됩니다.
- **Docker는 iptables 규칙을 직접 조작하기 때문에 `ufw`로 막아도 publish한 포트가 열려 있을 수 있습니다.** 외부에 노출하면 안 되는 포트는 `127.0.0.1:`로 바인딩하거나 아예 publish하지 마세요.

**3) 서비스 기동 순서와 준비 상태**

`depends_on`은 기본적으로 "컨테이너 시작 순서"만 보장하고, DB가 **연결을 받을 준비가 되었는지**는 보장하지 않습니다.

```yaml
services:
  db:
    image: postgres:16
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user"]
      interval: 5s
      retries: 10
  app:
    depends_on:
      db:
        condition: service_healthy
```

앱 코드에도 **연결 재시도 로직**을 두는 것이 근본적인 해결책입니다.

**4) 네트워크 진단**

```bash
docker network ls
docker network inspect <network>
docker exec -it app sh -c "getent hosts db"
docker exec -it app sh -c "nc -zv db 5432"
docker run --rm -it --network container:app nicolaka/netshoot   # 진단 도구 컨테이너
```

> 폐쇄망이라 netshoot 이미지를 받을 수 없다면, 인터넷이 되는 환경에서 `docker save`로 tar를 만들어 반입해 두면 장애 대응 시 큰 도움이 됩니다.

## 11.3 Kubernetes 네트워크 핵심 개념

- **Pod**: 각 Pod는 고유 IP를 가지며, 모든 Pod는 NAT 없이 서로 통신 가능(CNI 플러그인이 구현: Calico, Cilium, Flannel)
- **Service**: Pod IP는 수시로 바뀌므로 **고정된 가상 IP + DNS 이름** 제공
  - `ClusterIP`: 클러스터 내부 전용 (기본)
  - `NodePort`: 각 노드의 포트(30000~32767)로 노출
  - `LoadBalancer`: 클라우드 LB 연동
  - `Headless`(`clusterIP: None`): DNS가 Pod IP들을 직접 반환 (StatefulSet)
- **DNS**: `<service>.<namespace>.svc.cluster.local`
- **Ingress / Gateway API**: L7 라우팅 (호스트/경로 → Service)
- **NetworkPolicy**: Pod 간 통신 허용 규칙 (기본은 모두 허용)
- **kube-proxy**: Service 가상 IP로 온 트래픽을 iptables/IPVS로 실제 Pod에 분산

## 11.4 클라우드 네트워크 (VPC)

```
VPC 10.0.0.0/16
├── Public Subnet 10.0.1.0/24   (Internet Gateway로 라우팅)
│     └── ALB, Bastion, NAT Gateway
└── Private Subnet 10.0.2.0/24  (NAT Gateway로만 외부 통신)
      └── 앱 서버, DB
```

- **Public Subnet**: 라우팅 테이블에 IGW 경로가 있고 공인 IP를 가질 수 있음
- **Private Subnet**: 외부에서 직접 접근 불가, 아웃바운드는 NAT Gateway 경유
- **보안 그룹(Security Group)**: 인스턴스 단위, **상태 기반(stateful)** — 인바운드를 허용하면 응답은 자동 허용
- **NACL**: 서브넷 단위, **상태 비기반(stateless)** — 응답 트래픽(임시 포트 대역)도 명시적으로 허용해야 함
- **VPC Peering / Transit Gateway**: VPC 간 연결 (CIDR 겹치면 불가 → 대역 설계가 중요)
- **Private Endpoint / PrivateLink**: 인터넷을 거치지 않고 관리형 서비스(S3 등)에 접근

> 개인 프로젝트를 Vercel, Render, Fly.io, Railway 같은 PaaS에 배포하면 이 모든 것이 추상화되지만, **"DB는 외부에서 못 붙게, 앱에서만 붙게"** 라는 원칙은 여전히 적용됩니다. PaaS의 Private Networking 기능이나 IP 허용 목록을 확인하세요.

## 더 깊이

- [풀스택 개발자를 위한 인프라 4강 — Docker](/posts/infra-04-docker): 여기서 네트워크 관점으로만 훑은 컨테이너를 이미지·볼륨·Compose까지 포함해 다룹니다.
- [풀스택 개발자를 위한 인프라 9강 — 쿠버네티스](/posts/infra-09-kubernetes): Service와 Ingress가 실제 매니페스트에서 어떻게 생겼는지, 클러스터 운영 관점의 나머지 절반을 다룹니다.
