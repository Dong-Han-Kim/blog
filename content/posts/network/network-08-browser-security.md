---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 네트워크 8장 — 브라우저 보안 모델: SOP, CORS, 쿠키'
date: '2026-09-17'
category: 'network'
tags: ['Network', 'CORS', 'Cookie', 'Browser', 'Security']
description: 'URL 입력부터 렌더까지의 전체 흐름을 되짚고, Origin과 SOP, CORS preflight와 credentials, 쿠키 보안 속성, CSRF·XSS를 네트워크 관점에서 정리한다. CORS 트러블슈팅 체크리스트 포함.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 네트워크'
seriesOrder: 8

# 📚 SEO용
keywords: ['Network', 'CORS', 'Cookie', 'Browser', 'Security', 'SOP', '동일 출처 정책', 'Origin', 'CORS', 'preflight', '쿠키', 'SameSite', 'HttpOnly', 'CSRF', 'XSS', 'CSP']
---

# 풀스택 개발자를 위한 네트워크 8장 — 브라우저 보안 모델: SOP, CORS, 쿠키

7장까지가 브라우저와 서버 사이를 오가는 규칙이었다면, 이번 장은 브라우저가 스스로 거는 제약입니다. 프론트엔드에서 가장 자주 부딪히는 에러들이 여기서 나옵니다.

## 8.1 URL을 입력하면 일어나는 일 (전체 흐름)

1. URL 파싱 (스킴, 호스트, 포트, 경로)
2. HSTS 목록 확인 → 필요 시 HTTPS로 전환
3. DNS 조회 (캐시 → hosts → 리졸버)
4. TCP 연결 (3-way) — HTTP/3이면 QUIC
5. TLS 핸드셰이크 (SNI, ALPN, 인증서 검증)
6. HTTP 요청 전송 (쿠키 첨부)
7. (중간) CDN → 로드밸런서 → 리버스 프록시 → 애플리케이션 → DB
8. 응답 수신, 캐시 저장 판단
9. HTML 파싱 → DOM, CSS → CSSOM → 렌더 트리 → 레이아웃 → 페인트
10. 하위 리소스(JS, CSS, 이미지) 요청 — 연결 재사용 또는 추가 연결

이 흐름을 계층별로 설명할 수 있으면, 어느 구간이 느린지 브라우저 DevTools의 **Timing 탭**(DNS Lookup, Initial connection, SSL, Waiting(TTFB), Content Download)으로 바로 찾을 수 있습니다.

## 8.2 Origin과 동일 출처 정책(SOP)

**Origin = 스킴 + 호스트 + 포트**

| 비교 대상 (기준: `https://app.example.com`) | 같은 Origin? |
|---|---|
| `https://app.example.com/other` | O |
| `http://app.example.com` | X (스킴) |
| `https://api.example.com` | X (호스트) |
| `https://app.example.com:8443` | X (포트) |

SOP는 **다른 출처의 응답을 스크립트가 읽는 것**을 기본적으로 막습니다. 요청 자체는 나갈 수도 있다는 점이 중요합니다.

> 참고로 **Site**는 Origin보다 넓은 개념(등록 가능 도메인 + 스킴)입니다. `app.example.com`과 `api.example.com`은 cross-origin이지만 same-site입니다. 쿠키의 SameSite는 이 "Site" 기준입니다.

## 8.3 CORS

CORS는 서버가 "이 출처에서 내 응답을 읽어도 된다"고 **브라우저에게 허락하는 메커니즘**입니다. CORS는 **브라우저가 강제하는 정책**이므로 curl이나 서버 간 호출에는 적용되지 않습니다. "Postman에선 되는데 브라우저에선 안 된다"의 정체입니다.

**Simple Request** (GET/HEAD/POST + 기본 헤더 + `Content-Type`이 form/text 계열)

```http
GET /api/data
Origin: https://app.example.com

HTTP/1.1 200 OK
Access-Control-Allow-Origin: https://app.example.com
```

**Preflight Request** — `Content-Type: application/json`, `Authorization` 헤더, PUT/DELETE 등을 쓰면 브라우저가 먼저 OPTIONS를 보냅니다.

```http
OPTIONS /api/data
Origin: https://app.example.com
Access-Control-Request-Method: PUT
Access-Control-Request-Headers: content-type, authorization

HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE
Access-Control-Allow-Headers: content-type, authorization
Access-Control-Max-Age: 600
```

**Credentials (쿠키 포함)**

```js
fetch(url, { credentials: 'include' })
```

```http
Access-Control-Allow-Origin: https://app.example.com   ← * 불가
Access-Control-Allow-Credentials: true
Vary: Origin
```

**CORS 트러블슈팅 체크리스트**

- preflight(OPTIONS)에 대해 인증 미들웨어가 401을 반환하고 있지 않은가? → OPTIONS는 인증 전에 처리
- 에러 응답(4xx/5xx)에도 CORS 헤더가 붙는가? 안 붙으면 실제 에러가 CORS 에러로 가려짐
- Nginx와 앱이 **둘 다** CORS 헤더를 붙여 중복(`*, *`)되고 있지 않은가?
- credentials 사용 시 `*`를 쓰고 있지 않은가?
- 동적으로 Origin을 반사할 때 `Vary: Origin`을 넣었는가? (CDN 캐시 오염 방지)

> **근본적 회피책**: 프론트와 API를 같은 Origin으로 서빙하면(`/api`를 리버스 프록시로 백엔드에 전달, 또는 Next.js rewrites) CORS 자체가 필요 없습니다. 사내 시스템에서는 이 구조가 가장 단순하고 안전한 경우가 많습니다.

## 8.4 쿠키와 보안 속성

```http
Set-Cookie: session=abc123; Path=/; Domain=example.com; Max-Age=3600; HttpOnly; Secure; SameSite=Lax
```

| 속성 | 의미 |
|---|---|
| `Domain` | 생략 시 해당 호스트만. 지정 시 하위 도메인 포함 |
| `Path` | 쿠키를 보낼 경로 |
| `Expires` / `Max-Age` | 생략 시 세션 쿠키 |
| `HttpOnly` | JS(`document.cookie`)에서 접근 불가 → XSS 피해 완화 |
| `Secure` | HTTPS에서만 전송 |
| `SameSite=Strict` | 크로스 사이트 요청에 절대 미전송 |
| `SameSite=Lax` | 최상위 GET 네비게이션에만 전송 (Chrome 등 기본값) |
| `SameSite=None` | 항상 전송, 반드시 `Secure` 필요 |

- 프론트(`app.example.com`)와 API(`api.example.com`)는 same-site이므로 Lax로도 쿠키가 전송됩니다.
- 프론트와 API가 **완전히 다른 도메인**이면 `SameSite=None; Secure`가 필요하고, 서드파티 쿠키 차단 정책의 영향을 받습니다.
- 로컬 개발(`http://localhost`)에서 `Secure` 쿠키가 안 붙는 문제도 흔합니다. (브라우저는 localhost를 신뢰할 수 있는 출처로 취급하는 경우가 많지만, IP나 사설 도메인은 아님)

## 8.5 CSRF와 XSS의 네트워크적 관점

- **CSRF**: 사용자의 브라우저가 쿠키를 자동으로 첨부한다는 점을 악용. 방어: SameSite, CSRF 토큰, Origin 헤더 검증.
- **XSS**: 악성 스크립트가 같은 Origin에서 실행됨 → SOP로 막을 수 없음. 방어: 출력 이스케이프, CSP, HttpOnly 쿠키.
- **CSP(Content-Security-Policy)**: 어떤 출처의 스크립트/리소스/연결을 허용할지 선언. `connect-src`는 fetch/WebSocket 목적지를 제한합니다.

## 더 깊이

- [요청 한 건의 일생 1편 — 요청은 브라우저를 떠나 어디를 지나 서버에 닿는가](/posts/request-lifecycle-01-the-map): 8.1의 "URL을 입력하면 일어나는 일"을 서버 입장에서 다시 따라갑니다. 프록시가 `X-Forwarded-For`로 원본 정보를 어떻게 넘기는지도 여기서 다룹니다.
