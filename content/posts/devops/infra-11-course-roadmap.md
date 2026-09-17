---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 인프라 부록 — 전체 과정 요약'
date: '2026-09-17'
category: 'devops'
tags: ['Infra', 'DevOps', 'Roadmap', 'Summary']
description: '1강부터 10강까지의 핵심 질문과 도구, 반드시 기억할 점을 한 표로 모으고 각 강으로 가는 링크를 정리한다. 그리고 네트워크·데이터·플랫폼·보안 심화로 이어지는 다음 학습 방향까지.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 인프라'
seriesOrder: 11

# 📚 SEO용
keywords: ['인프라 로드맵', '인프라 학습 순서', 'DevOps', 'SRE', '쿠버네티스', 'Terraform', '관측성', '다음 학습 방향']
---

# 풀스택 개발자를 위한 인프라 부록 — 전체 과정 요약

열 번의 강의에서 다룬 것을 한 화면에서 다시 볼 수 있도록 모았다. 각 행의 링크로 해당 강으로 바로 이동할 수 있다.

| 강의 | 핵심 질문 | 핵심 도구 | 반드시 기억할 것 |
|---|---|---|---|
| 1. 리눅스 | 서버에서 무엇이 어떻게 돌고 있나? | systemd, journalctl, df/free | 전용 사용자, SIGTERM, 절대 경로 |
| 2. 네트워크 | 요청이 어디서 막혔나? | dig, ss, curl, tcpdump | timeout vs refused, 0.0.0.0 vs 127.0.0.1 |
| 3. 리버스 프록시 | 앱 앞에서 무엇을 대신해 주나? | Nginx, certbot | X-Forwarded-* 헤더, 502/504 구분 |
| 4. Docker | 어디서나 같게 실행하려면? | Dockerfile, Compose | exec form, 볼륨, 방화벽 우회, 플랫폼 |
| 5. CI/CD | 안전하게 자주 배포하려면? | GitHub Actions | 한 번 빌드, SHA 태그, expand-contract |
| 6. 클라우드 | 관리형 자원을 안전하게 쓰려면? | VPC, IAM, EC2, S3, RDS, ALB | 멀티 AZ, 최소 권한, 비용 알림 |
| 7. 관측성 | 무슨 일이 왜 일어났나? | Prometheus, Grafana, Loki, OTel | p95, 카디널리티, 증상 기반 알림 |
| 8. IaC | 인프라를 재현하려면? | Terraform, Ansible | plan 읽기, state 보호, 멱등성 |
| 9. 쿠버네티스 | 여러 서버에서 자동으로 운영하려면? | kubectl, Helm, Kustomize | probe 구분, requests, graceful shutdown |
| 10. 운영 심화 | 장애에 강한 시스템과 조직은? | k6, PgBouncer, Vault | RPO/RTO, SLO·에러 버짓, 회고 |

## 각 강 바로 가기

| 강의 | 제목 | 링크 |
|---|---|---|
| 1강 | 리눅스 운영 기본 | [/posts/infra-01-linux-operations](/posts/infra-01-linux-operations) |
| 2강 | 네트워크 기초 | [/posts/infra-02-network-basics](/posts/infra-02-network-basics) |
| 3강 | 웹서버와 리버스 프록시 | [/posts/infra-03-web-server-reverse-proxy](/posts/infra-03-web-server-reverse-proxy) |
| 4강 | Docker | [/posts/infra-04-docker](/posts/infra-04-docker) |
| 5강 | CI/CD | [/posts/infra-05-cicd](/posts/infra-05-cicd) |
| 6강 | 클라우드 기초 (AWS) | [/posts/infra-06-aws-cloud-basics](/posts/infra-06-aws-cloud-basics) |
| 7강 | 관측성 | [/posts/infra-07-observability](/posts/infra-07-observability) |
| 8강 | IaC | [/posts/infra-08-iac](/posts/infra-08-iac) |
| 9강 | 쿠버네티스 | [/posts/infra-09-kubernetes](/posts/infra-09-kubernetes) |
| 10강 | 운영 심화 | [/posts/infra-10-operations-advanced](/posts/infra-10-operations-advanced) |

## 다음 학습 방향

- **네트워크 심화**: BGP 기초, VPN/전용선, 서비스 메시(Istio, Linkerd), eBPF(Cilium)
- **데이터 심화**: DB 내부 구조, 파티셔닝·샤딩, 메시지 스트리밍(Kafka)
- **플랫폼 엔지니어링**: 내부 개발자 플랫폼, 셀프서비스 배포
- **보안 심화**: 제로 트러스트, 정책 엔진(OPA/Kyverno), 컨테이너 런타임 보안
- **자격증(선택)**: AWS Solutions Architect Associate, CKA/CKAD, Terraform Associate
