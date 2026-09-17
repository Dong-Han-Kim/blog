---
# 📌 기본 메타데이터
title: '요청 한 건의 일생 1편 — 요청은 브라우저를 떠나 어디를 지나 서버에 닿는가'
date: '2026-09-17'
category: 'backend'
tags: ['Backend', 'HTTP', 'Network', 'Nginx']
description: '버튼 하나를 누른 요청이 DB에 닿았다가 돌아오기까지의 전체 지도를 먼저 그린다. URL 해석과 DNS, TCP와 TLS 핸드셰이크, 그리고 로드밸런서와 리버스 프록시가 요청에 무엇을 더하는지까지.'

# 💬 옵션 필드
draft: false
series: '요청 한 건의 일생'
seriesOrder: 1

# 📚 SEO용
keywords: ['백엔드', 'HTTP 요청 흐름', 'DNS', 'TCP 핸드셰이크', 'TLS', '로드밸런서', '리버스 프록시', 'Nginx', 'X-Forwarded-For']
---

# 요청 한 건의 일생 1편 — 요청은 브라우저를 떠나 어디를 지나 서버에 닿는가

> 시리즈 전체 구성
>
> - 1편. 요청이 지나가는 길의 전체 지도 — 클라이언트와 서버 앞단
> - 2편. 애플리케이션 서버의 입구 — 이벤트 루프, 라우팅, 계층 구조
> - 3편. 커넥션 풀과 DB 내부, 그리고 응답 만들기
> - 4편. 트랜잭션, 커넥션 풀 고갈, 쿼리 성능
> - 5편. 캐싱, 타임아웃 체인, 에러 처리, 관측성
> - 6편. 스트리밍, 읽기 복제본, Graceful Shutdown, 종합 체크리스트

> 브라우저에서 버튼 하나를 눌렀을 때, 그 요청은 어떤 길을 지나 DB에 닿고 어떻게 응답이 되어 돌아올까?
> 이 시리즈는 요청 한 건이 지나가는 파이프라인을 **기초 → 심화** 순서로 끝까지 따라간다.
> 예제 코드는 Node.js(TypeScript) + Express + PostgreSQL(`pg`) 기준이지만, 원리는 Spring, NestJS, Django 등 어떤 스택에도 그대로 적용된다.

세부로 들어가기 전에 전체 그림부터 머리에 넣자. 아래 흐름이 이 글 전체의 뼈대다.

```
[브라우저 / 앱]
   │ 1. URL 해석 → DNS 조회 → TCP 연결 → TLS 핸드셰이크 → HTTP 요청 전송
   ▼
[CDN / 방화벽 / 로드밸런서]
   │ 2. TLS 종료, 부하 분산, 헬스체크
   ▼
[리버스 프록시 (Nginx)]
   │ 3. 정적 파일 처리, 헤더 추가, 업스트림으로 전달
   ▼
[애플리케이션 서버 (Node.js)]
   │ 4. 소켓 수신 → HTTP 파싱 → req/res 객체 생성
   │ 5. 미들웨어 체인 (로깅 → 인증 → 검증 …)
   │ 6. 라우터 → Controller → Service → Repository
   │ 7. 커넥션 풀에서 연결 획득
   ▼
[데이터베이스 (PostgreSQL)]
   │ 8. 파싱 → 재작성 → 실행 계획 → 실행 (인덱스/버퍼 풀/디스크)
   │ 9. 결과 행(row) 전송
   ▼
[애플리케이션 서버]
   │ 10. 연결 반납 → 행을 도메인 객체/DTO로 매핑 → JSON 직렬화
   │ 11. 상태 코드 + 헤더 + 바디 작성
   ▼
[Nginx → 로드밸런서]
   │ 12. 압축, 헤더 정리, 응답 전달
   ▼
[브라우저]
     13. 응답 수신 → 파싱 → 렌더링 / 캐시 저장
```

핵심 관점 하나만 먼저 짚고 가자.

> **요청은 "여러 번의 네트워크 왕복"과 "여러 개의 대기열"을 통과한다.**

느린 요청을 디버깅할 때 대부분의 원인은 이 둘 중 하나다. 어딘가의 **왕복이 너무 많거나(RTT)**, 어딘가의 **줄이 너무 길거나(큐잉)**. 이 관점을 들고 한 칸씩 따라가 보자.

---

여기서부터가 기초편이다. 요청이 지나가는 길을 클라이언트 쪽 첫 걸음부터 순서대로 따라간다.

## 1. 요청의 탄생: 클라이언트에서 일어나는 일

사용자가 `https://api.example.com/users/42` 를 호출한다고 하자.

### 1-1. URL 해석

브라우저(또는 `fetch`)는 URL을 쪼갠다.

| 구성 요소 | 값 | 의미 |
|---|---|---|
| scheme | `https` | 프로토콜과 기본 포트(443) 결정 |
| host | `api.example.com` | DNS로 IP를 찾아야 할 이름 |
| path | `/users/42` | 서버가 라우팅에 사용할 경로 |

### 1-2. DNS 조회

호스트 이름을 IP로 바꿔야 연결할 수 있다. 조회 순서는 대략 다음과 같다.

```
브라우저 DNS 캐시 → OS 캐시(/etc/hosts 포함) → 설정된 리졸버(공유기, 사내 DNS, 8.8.8.8 등)
→ (캐시 미스 시) 루트 → .com → example.com 권한 서버
```

결과는 TTL 동안 캐싱된다. 폐쇄망 환경에서 "서버는 살아있는데 접속이 안 된다"면 가장 먼저 의심할 곳이 이 단계다. 내부 DNS에 레코드가 없거나, `/etc/hosts`가 꼬여 있는 경우가 흔하다.

### 1-3. TCP 연결 (3-way handshake)

```
Client ──SYN──────────▶ Server
Client ◀──SYN+ACK────── Server
Client ──ACK──────────▶ Server     (여기까지 1 RTT)
```

RTT(Round Trip Time)는 패킷이 한 번 왕복하는 시간이다. 서울-서울이면 1ms 안팎, 서울-미국 서부면 130ms 이상이다. **연결을 새로 맺는 것 자체가 비용**이라는 점을 기억하자. 뒤에서 커넥션 풀과 keep-alive가 왜 중요한지 여기서 설명된다.

### 1-4. TLS 핸드셰이크

HTTPS라면 TCP 위에서 암호화 채널을 협상한다.

- **TLS 1.2**: 보통 2 RTT 추가
- **TLS 1.3**: 1 RTT로 단축, 재연결 시 0-RTT도 가능

이 과정에서 인증서 검증(도메인 일치, 만료일, 신뢰 체인)이 일어난다. 사내 사설 인증서를 쓰는 환경에서 Node.js가 `UNABLE_TO_VERIFY_LEAF_SIGNATURE` 에러를 뱉는 것이 바로 이 단계의 실패다.

### 1-5. HTTP 요청 전송

드디어 실제 요청 메시지가 나간다. HTTP/1.1 기준으로 보면 사실 **텍스트**다.

```http
GET /users/42 HTTP/1.1
Host: api.example.com
Accept: application/json
Authorization: Bearer eyJhbGciOi...
Accept-Encoding: gzip, br
Connection: keep-alive
```

HTTP 버전별 차이도 알아두자.

| 버전 | 특징 | 요청 파이프라인 관점 |
|---|---|---|
| HTTP/1.1 | 텍스트, 연결당 요청 1개씩 순차 처리 | 브라우저는 도메인당 연결을 6개 정도 열어 병렬화 |
| HTTP/2 | 바이너리 프레임, 하나의 연결에서 다중화 | 연결 1개로 여러 요청 동시 처리, 헤더 압축(HPACK) |
| HTTP/3 | UDP 기반 QUIC | TCP 레벨의 HOL 블로킹 제거, 핸드셰이크 통합 |

> **정리**: 요청 한 건이 서버에 도착하기 전에 이미 DNS + TCP + TLS라는 비용을 치렀다. 연결을 재사용하면 이 비용 대부분이 사라진다.

---

## 2. 서버 앞단: 리버스 프록시와 로드밸런서

요청은 곧바로 Node.js 프로세스에 닿지 않는 경우가 대부분이다. 보통 앞에 한두 겹의 중간 계층이 있다.

```
Client ──▶ L4/L7 로드밸런서 ──▶ Nginx ──▶ Node.js (여러 인스턴스)
```

### 2-1. 로드밸런서

- **L4**: IP/포트 수준에서 분산. 빠르지만 HTTP 내용을 모른다.
- **L7**: HTTP를 이해한다. 경로 기반 라우팅, 헤더 기반 분기, TLS 종료가 가능하다.

분산 알고리즘은 라운드로빈, 최소 연결(least connections), IP 해시 등이 있다. **헬스체크**로 죽은 인스턴스를 빼는 것도 로드밸런서의 역할이다.

### 2-2. 리버스 프록시 (Nginx)

Nginx가 하는 일은 다음과 같다.

1. **TLS 종료**: 암호화를 여기서 풀고, 내부는 평문 HTTP로 전달
2. **정적 파일 서빙**: 이미지/JS 같은 파일은 앱까지 보내지 않음
3. **버퍼링**: 느린 클라이언트의 업로드를 Nginx가 다 받은 뒤 앱에 한 번에 전달 → 앱 워커가 느린 클라이언트에 묶이지 않음
4. **헤더 추가**: 원래 클라이언트 정보 전달
5. **업스트림 연결 재사용**

```nginx
upstream app_servers {
    server 10.0.0.11:3000;
    server 10.0.0.12:3000;
    keepalive 32;                     # 업스트림 연결 재사용 풀
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    location /api/ {
        proxy_pass http://app_servers;
        proxy_http_version 1.1;           # keepalive를 쓰려면 필수
        proxy_set_header Connection "";   # "close"가 전달되지 않도록

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-Id      $request_id;

        proxy_connect_timeout 3s;
        proxy_read_timeout    30s;
    }
}
```

주의할 점:

- 앱에서 `req.ip`를 찍으면 Nginx의 IP가 나온다. 진짜 클라이언트 IP가 필요하면 Express에서 `app.set('trust proxy', 1)`처럼 **신뢰할 프록시 단계를 명시**해야 한다. 무작정 `true`로 두면 클라이언트가 `X-Forwarded-For`를 위조할 수 있다.
- `X-Request-Id`를 여기서 발급하면, 이후 앱 로그와 DB 로그까지 하나의 ID로 묶을 수 있다([5편](/posts/request-lifecycle-05-cache-timeout-observability)에서 다룬다).

## 더 깊이

- [풀스택 개발자를 위한 네트워크 1장 — 네트워크의 기본 구조: 패킷, 프로토콜, 계층 모델](/posts/network-01-packets-and-layers): 여기서 한 문단으로 지나간 DNS, TCP, TLS를 계층 모델부터 15장에 걸쳐 파고드는 시리즈입니다.
