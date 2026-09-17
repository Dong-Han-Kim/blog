---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 네트워크 6장 — HTTP: 웹의 언어와 그 진화'
date: '2026-09-17'
category: 'network'
tags: ['Network', 'HTTP', 'HTTP/2', 'HTTP/3', 'Cache']
description: 'HTTP 메시지 구조와 메서드의 의미론, 실무에서 갈리는 상태 코드(401/403, 502/504), Cache-Control과 조건부 요청, 그리고 1.0에서 3까지의 진화와 각 버전이 해결한 HOL Blocking을 다룬다.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 네트워크'
seriesOrder: 6

# 📚 SEO용
keywords: ['Network', 'HTTP', 'HTTP/2', 'HTTP/3', 'Cache', 'HTTP', '멱등성', '상태 코드', '502', '504', 'HTTP 캐싱', 'ETag', 'Cache-Control', 'HTTP/2', 'HTTP/3', 'QUIC', 'HOL Blocking']
---

# 풀스택 개발자를 위한 네트워크 6장 — HTTP: 웹의 언어와 그 진화

5장에서 이름이 주소가 되는 과정을 봤습니다. 이번 장부터는 그렇게 연결한 상대와 실제로 주고받는 응용 계층의 언어를 봅니다.

## 6.1 HTTP의 특징

- **클라이언트-서버 구조**, **요청-응답**
- **무상태(Stateless)**: 서버는 이전 요청을 기억하지 않음 → 쿠키, 세션, 토큰으로 상태를 보완
- **텍스트 기반**(HTTP/1.x), 확장 가능한 헤더

## 6.2 요청과 응답의 구조

```http
POST /api/kpi/reports HTTP/1.1
Host: api.example.com
Content-Type: application/json
Authorization: Bearer eyJhbGciOi...
Content-Length: 42

{"project":"H1234","period":"2026-09"}
```

```http
HTTP/1.1 201 Created
Content-Type: application/json
Location: /api/kpi/reports/981
Cache-Control: no-store

{"id":981}
```

## 6.3 메서드와 의미론

| 메서드 | 용도 | 안전(Safe) | 멱등(Idempotent) |
|---|---|---|---|
| GET | 조회 | O | O |
| HEAD | 헤더만 조회 | O | O |
| OPTIONS | 지원 메서드 확인, CORS preflight | O | O |
| POST | 생성, 처리 | X | X |
| PUT | 전체 대체 | X | O |
| PATCH | 부분 수정 | X | X(설계에 따라 다름) |
| DELETE | 삭제 | X | O |

**멱등성이 중요한 이유**: 네트워크는 실패합니다. 타임아웃이 났을 때 요청이 서버에 도달했는지 알 수 없습니다. 멱등한 요청은 안전하게 재시도할 수 있지만, POST는 재시도하면 중복 생성될 수 있습니다. 결제·주문 API에 **Idempotency-Key** 헤더를 도입하는 이유가 이것입니다.

## 6.4 상태 코드

| 코드 | 의미 | 실무 메모 |
|---|---|---|
| 200 OK | 성공 | |
| 201 Created | 생성됨 | `Location` 헤더 동반 |
| 204 No Content | 본문 없는 성공 | |
| 301 / 308 | 영구 리다이렉트 | 308은 메서드 유지 |
| 302 / 307 | 임시 리다이렉트 | 307은 메서드 유지 |
| 304 Not Modified | 캐시 사용 | 조건부 요청 응답 |
| 400 Bad Request | 잘못된 요청 | |
| 401 Unauthorized | **인증** 필요 | 누구인지 모름 |
| 403 Forbidden | **인가** 거부 | 누구인지는 알지만 권한 없음 |
| 404 Not Found | 리소스 없음 | |
| 405 Method Not Allowed | 메서드 미지원 | |
| 409 Conflict | 상태 충돌 | 낙관적 락 실패 등 |
| 413 Payload Too Large | 본문 과대 | Nginx `client_max_body_size` 기본 1MB |
| 429 Too Many Requests | 레이트 리밋 | `Retry-After` |
| 500 Internal Server Error | 서버 오류 | |
| 502 Bad Gateway | 프록시가 업스트림에서 잘못된 응답/연결 실패 | 앱 다운, 포트 오류 |
| 503 Service Unavailable | 일시적 불가 | 과부하, 점검 |
| 504 Gateway Timeout | 프록시가 업스트림 응답을 기다리다 시간 초과 | 느린 쿼리, 프록시 타임아웃 |

> **502와 504 구분**은 장애 대응의 첫 단추입니다. 502는 "뒤에 있는 앱과 대화가 안 됨"(죽었거나 포트가 틀림), 504는 "뒤에 있는 앱이 너무 느림"입니다. 파일 업로드 시 갑자기 413이 뜬다면 앱이 아니라 **Nginx 설정**부터 보세요.

## 6.5 핵심 헤더

- `Host`: 하나의 IP에서 여러 도메인을 서비스하는 가상 호스팅의 기반
- `Content-Type`, `Content-Length`, `Transfer-Encoding: chunked`
- `Accept`, `Accept-Encoding` (gzip, br), `Content-Encoding`
- `Authorization`
- `Cookie`, `Set-Cookie`
- `Cache-Control`, `ETag`, `Last-Modified`, `If-None-Match`, `If-Modified-Since`
- `Connection`, `Keep-Alive`, `Upgrade`
- `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Real-IP`, `Forwarded` (프록시 뒤의 원본 정보)

## 6.6 HTTP 캐싱

```http
Cache-Control: public, max-age=31536000, immutable   # 해시가 붙은 정적 파일
Cache-Control: no-cache                                # 매번 검증 후 사용
Cache-Control: no-store                                # 절대 저장 금지 (개인정보)
Cache-Control: private, max-age=60                     # 브라우저만 캐시, CDN 금지
```

- `no-cache`는 "캐시하지 마라"가 아니라 "**사용 전에 반드시 서버에 확인하라**"입니다. 저장 자체를 막으려면 `no-store`.
- **조건부 요청**: 서버가 `ETag: "abc"`를 주면, 브라우저는 다음에 `If-None-Match: "abc"`를 보내고, 변경이 없으면 서버가 본문 없이 `304`를 응답 → 대역폭 절약.
- 빌드 산출물에 해시를 붙이고(`app.3f9a1c.js`) 긴 max-age + immutable, HTML은 `no-cache` — 이것이 SPA/Next.js 배포 캐싱의 기본 전략입니다.

## 6.7 HTTP/1.0 → 1.1 → 2 → 3

**HTTP/1.0**: 요청마다 새 TCP 연결.

**HTTP/1.1**
- Persistent Connection(Keep-Alive) 기본
- `Host` 헤더 필수
- 파이프라이닝이 있었으나 사실상 사용되지 않음
- **HOL(Head-of-Line) Blocking**: 한 연결에서 앞 응답이 끝나야 다음 응답 → 브라우저는 도메인당 약 6개의 연결을 병렬로 엶
- 그래서 과거에 이미지 스프라이트, 파일 번들링, 도메인 샤딩 같은 최적화가 유행

**HTTP/2**
- 바이너리 프레이밍
- **멀티플렉싱**: 하나의 TCP 연결에서 여러 스트림 동시 처리 → 애플리케이션 레벨 HOL 해결
- **HPACK 헤더 압축**
- 스트림 우선순위, (Server Push는 사실상 폐기)
- 한계: TCP 위에서 동작하므로 **패킷 하나가 유실되면 모든 스트림이 대기**(TCP 레벨 HOL)
- 사실상 TLS와 함께 사용(h2), 협상은 TLS의 **ALPN**으로
- gRPC가 HTTP/2 위에서 동작

**HTTP/3**
- **QUIC(UDP 기반)** 위에서 동작
- 스트림이 독립적이라 한 스트림의 손실이 다른 스트림을 막지 않음
- TLS 1.3이 프로토콜에 내장 → 연결 수립이 빠름(1-RTT, 재연결 시 0-RTT)
- **Connection ID**로 연결을 식별 → Wi-Fi에서 LTE로 IP가 바뀌어도 연결 유지(Connection Migration)
- 서버는 `Alt-Svc` 헤더로 HTTP/3 지원을 알리고, 브라우저가 다음부터 UDP 443으로 시도
- 주의: 사내망/폐쇄망에서 UDP 443이 막혀 있으면 HTTP/2로 폴백

```
HTTP/1.1:  [TCP] [TLS] 요청1 → 응답1 → 요청2 → 응답2
HTTP/2  :  [TCP] [TLS] 요청1,2,3 동시 (스트림) — 패킷 손실 시 전부 대기
HTTP/3  :  [QUIC+TLS 통합, UDP] 스트림별 독립 — 손실 영향 국소화
```

## 더 깊이

- [요청 한 건의 일생 1편 — 요청은 브라우저를 떠나 어디를 지나 서버에 닿는가](/posts/request-lifecycle-01-the-map): 여기서 본 HTTP 요청이 서버에 도착한 뒤 리버스 프록시와 애플리케이션 안에서 어떤 경로를 지나는지 이어서 따라갑니다.
