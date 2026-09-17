---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 네트워크 10장 — 인프라 구성요소: 프록시, 로드밸런서, CDN, 게이트웨이'
date: '2026-09-17'
category: 'network'
tags: ['Network', 'Proxy', 'Load Balancing', 'CDN', 'Nginx']
description: '포워드·리버스 프록시의 역할 구분, 프록시 뒤에서 클라이언트 IP와 프로토콜을 되찾는 법, L4와 L7 로드밸런서, 헬스체크와 Graceful Shutdown, CDN과 API Gateway까지 인프라 구성요소를 정리한다.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 네트워크'
seriesOrder: 10

# 📚 SEO용
keywords: ['Network', 'Proxy', 'Load Balancing', 'CDN', 'Nginx', '포워드 프록시', '리버스 프록시', 'X-Forwarded-For', 'trust proxy', 'L4', 'L7', '로드밸런서', '헬스체크', '스티키 세션', 'CDN', 'API Gateway', 'Graceful Shutdown']
---

# 풀스택 개발자를 위한 네트워크 10장 — 인프라 구성요소: 프록시, 로드밸런서, CDN, 게이트웨이

9장까지는 클라이언트와 서버 사이에 아무것도 없다고 가정했습니다. 실제 서비스의 요청은 여러 중간 장비를 거치므로, 이번 장은 그 구성요소들을 봅니다.

## 10.1 포워드 프록시 vs 리버스 프록시

```
포워드 프록시:  [클라이언트] → [프록시] → 인터넷의 여러 서버
               (클라이언트를 대신함: 사내 인터넷 프록시, 접근 통제, 캐싱)

리버스 프록시:  클라이언트 → [프록시] → [내부의 여러 서버]
               (서버를 대신함: Nginx, Traefik, Caddy, HAProxy)
```

**리버스 프록시의 역할**

- TLS 종료(TLS Termination)
- 정적 파일 서빙, 압축, 캐싱
- 경로/호스트 기반 라우팅 (`/api` → 백엔드, `/` → 프론트)
- 로드 밸런싱
- 요청 크기 제한, 레이트 리밋, 접근 제어
- 내부 서버 은닉

> **사내 포워드 프록시 주의**: 회사망에서 `npm install`, `docker pull`, `pip install`이 안 되는 경우 대부분 `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` 환경변수 설정 문제입니다. 반대로 프록시를 설정한 뒤 **내부 서버 호출까지 프록시로 새는** 문제를 막으려면 `NO_PROXY`에 내부 대역/도메인을 넣어야 합니다. TLS를 가로채는 보안 프록시가 있다면 [7장의 사설 CA 문제](/posts/network-07-tls-https)도 함께 발생합니다.

## 10.2 프록시 뒤에서 원본 정보 얻기

리버스 프록시를 거치면 앱이 보는 클라이언트 IP는 **프록시의 IP**입니다.

```nginx
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

```js
// Express
app.set('trust proxy', 1); // 신뢰할 프록시 홉 수
req.ip;        // X-Forwarded-For 반영
req.protocol;  // X-Forwarded-Proto 반영
```

- `X-Forwarded-For: client, proxy1, proxy2` 형태로 누적됩니다.
- 이 헤더는 **클라이언트가 위조할 수 있습니다.** 신뢰하는 프록시가 추가한 값만 사용해야 합니다(`trust proxy` 범위를 정확히).
- `X-Forwarded-Proto`를 반영하지 않으면, TLS 종료 뒤의 앱은 자신이 HTTP로 서비스된다고 착각해 **리다이렉트 루프**나 `http://` 콜백 URL(OAuth 실패) 문제가 생깁니다.

## 10.3 로드밸런서: L4 vs L7

| 구분 | L4 로드밸런서 | L7 로드밸런서 |
|---|---|---|
| 판단 기준 | IP, 포트 (5-tuple) | URL, 헤더, 쿠키, 호스트 |
| TLS | 보통 통과(passthrough) | 종료 후 내용 확인 |
| 성능 | 빠름 | 상대적으로 무거움 |
| 기능 | 단순 분산 | 경로 라우팅, 헤더 조작, 인증 연동 |
| 예시 | AWS NLB, LVS, HAProxy(TCP 모드) | AWS ALB, Nginx, Envoy, Traefik |

**분산 알고리즘**: Round Robin, Weighted RR, Least Connections, IP Hash, Consistent Hashing

**헬스체크**: 로드밸런서는 주기적으로 백엔드 상태를 확인합니다. 앱에 `/health`(살아있는가 — liveness)와 `/ready`(트래픽을 받을 준비가 되었는가 — readiness)를 구분해 두는 것이 좋습니다. DB 연결 실패 시 liveness까지 실패시키면 전체 인스턴스가 연쇄 재시작되는 사고가 날 수 있습니다.

**스티키 세션**: 같은 클라이언트를 같은 서버로 보냄. 세션을 서버 메모리에 저장하는 구조라면 필요하지만, 확장성과 장애 내성이 떨어집니다. 가능하면 세션을 Redis 등 외부 저장소로 빼거나 토큰 기반으로 **무상태화**하세요.

**Graceful Shutdown**: 배포 시 인스턴스를 내리기 전에 로드밸런서에서 먼저 제외하고(draining), 진행 중인 요청을 마친 뒤 종료해야 502가 나지 않습니다. 앱은 `SIGTERM`을 받으면 새 연결 수락을 멈추고 기존 요청을 마무리하도록 구현합니다.

## 10.4 CDN

- 전 세계(또는 여러 지역)의 **엣지 서버**에 콘텐츠를 캐시해 사용자와 가까운 곳에서 응답
- 정적 파일뿐 아니라 동적 요청의 가속(TLS 종료를 가까운 곳에서, 오리진까지 최적화된 연결 재사용)
- DDoS 흡수, WAF 기능
- 캐시 키, `Cache-Control`, `Vary`, 퍼지(무효화) 전략이 핵심
- **개인화된 응답이 CDN에 캐시되는 사고**(다른 사용자의 정보 노출)를 막으려면 `private` 또는 `no-store`를 명확히 지정

## 10.5 API Gateway

마이크로서비스 앞단에서 **인증, 레이트 리밋, 라우팅, 요청 변환, 로깅, 버전 관리**를 일괄 처리합니다. Kong, AWS API Gateway, Spring Cloud Gateway 등. 리버스 프록시의 기능을 API 관리 관점으로 확장한 것이라고 보면 됩니다.

## 10.6 전형적인 웹 서비스 요청 경로

```
사용자
  → DNS
  → CDN (정적 파일 캐시, WAF)
  → L4/L7 로드밸런서 (TLS 종료)
  → 리버스 프록시 (Nginx / Ingress)
  → 애플리케이션 서버 (Next.js, Spring, Node)
  → 캐시 (Redis) / DB (PostgreSQL, Oracle) / 오브젝트 스토리지 (S3, MinIO)
```

각 화살표마다 **타임아웃, 연결 수 제한, 헤더 전달 규칙**이 존재한다는 것을 기억하세요. 장애는 대부분 이 화살표 위에서 일어납니다.

## 더 깊이

- [풀스택 개발자를 위한 인프라 3강 — 웹서버와 리버스 프록시](/posts/infra-03-web-server-reverse-proxy): 같은 구성을 Nginx 설정 파일 단위로 직접 작성해 보는 실습 편입니다.
