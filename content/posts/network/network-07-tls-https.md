---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 네트워크 7장 — TLS와 HTTPS: 암호화와 신뢰의 구조'
date: '2026-09-17'
category: 'network'
tags: ['Network', 'TLS', 'HTTPS', 'Certificate', 'mTLS']
description: 'HTTPS가 보장하는 기밀성·무결성·인증, 인증서 신뢰 체인과 fullchain 누락 사고, TLS 1.3 핸드셰이크와 SNI·ALPN, 폐쇄망 사설 CA의 클라이언트별 신뢰 저장소 차이를 정리한다.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 네트워크'
seriesOrder: 7

# 📚 SEO용
keywords: ['Network', 'TLS', 'HTTPS', 'Certificate', 'mTLS', 'TLS', 'HTTPS', '대칭키', '비대칭키', 'ECDHE', '인증서 체인', 'SAN', 'SNI', 'ALPN', 'Let''s Encrypt', '사설 CA', 'mTLS', 'HSTS']
---

# 풀스택 개발자를 위한 네트워크 7장 — TLS와 HTTPS: 암호화와 신뢰의 구조

6장에서 본 HTTP는 그대로 두면 평문입니다. 이번 장은 그 위에 기밀성과 무결성, 그리고 인증을 더하는 TLS의 구조를 봅니다.

## 7.1 HTTPS가 보장하는 세 가지

1. **기밀성**: 도청해도 내용을 알 수 없다 (암호화)
2. **무결성**: 중간에 변조되면 알 수 있다 (MAC/AEAD)
3. **인증**: 내가 통신하는 상대가 진짜 그 도메인의 주인이다 (인증서)

세 번째가 가장 자주 간과됩니다. 암호화만 되고 인증이 없으면 **중간자(MITM)** 와 안전하게 암호화된 대화를 하는 셈입니다.

## 7.2 대칭키와 비대칭키

- **대칭키(AES, ChaCha20)**: 같은 키로 암·복호화. 빠르다. 키 전달이 문제.
- **비대칭키(RSA, ECDSA, Ed25519)**: 공개키/개인키 쌍. 느리다. 키 전달 문제를 해결.
- **키 교환(ECDHE)**: 양측이 공개된 값만 주고받고도 같은 비밀값을 계산.

TLS는 **비대칭 암호와 키 교환으로 세션 키를 합의**하고, 실제 데이터는 **대칭키로 암호화**합니다.

## 7.3 인증서와 신뢰 체인

```
Root CA (브라우저/OS에 미리 내장된 신뢰 저장소)
  └── Intermediate CA (Root가 서명)
        └── Leaf 인증서: api.example.com (Intermediate가 서명)
```

- 서버는 **Leaf + Intermediate**를 함께 보내야 합니다(fullchain). Intermediate를 빠뜨리면 브라우저에선 되는데(캐시된 중간 인증서 덕분) **curl, Node.js, Java 클라이언트에서는 실패**하는 전형적인 문제가 생깁니다.
- 인증서 검증 항목: 서명 체인, 유효기간, **도메인 일치(SAN)**, 폐기 여부
- 요즘은 CN이 아니라 **SAN(Subject Alternative Name)** 에 도메인이 있어야 합니다. IP로 접속한다면 SAN에 IP가 있어야 합니다.

## 7.4 TLS 1.3 핸드셰이크 (단순화)

```
Client                                       Server
  | --- ClientHello (지원 암호, 키 공유값, SNI, ALPN) ---> |
  | <-- ServerHello (선택 암호, 키 공유값)                 |
  | <-- {인증서, 인증서 서명, Finished} (이미 암호화됨)     |
  | --- {Finished} -----------------------------------> |
  | === 암호화된 애플리케이션 데이터 =====================  |
```

- TLS 1.2는 2-RTT, **TLS 1.3은 1-RTT**. 세션 재개 시 0-RTT도 가능(단, 재전송 공격 위험 때문에 멱등 요청에만).
- **SNI(Server Name Indication)**: ClientHello에 접속하려는 도메인을 담아, 하나의 IP에서 여러 도메인의 인증서를 구분할 수 있게 합니다. IP로 직접 접속하면 SNI가 없어 기본 인증서가 반환됩니다.
- **ALPN**: 이 연결에서 HTTP/2를 쓸지 HTTP/1.1을 쓸지 협상.

## 7.5 인증서 발급과 운영

- **Let's Encrypt**: 무료, 90일 유효, ACME 프로토콜로 자동 갱신(certbot, Caddy, Traefik)
- 검증 방식: HTTP-01(80 포트로 파일 확인), DNS-01(TXT 레코드, 와일드카드 가능)
- 인증서 만료는 여전히 대형 장애의 단골 원인 → **만료 모니터링은 필수**

```bash
openssl s_client -connect api.example.com:443 -servername api.example.com -showcerts
echo | openssl s_client -connect api.example.com:443 2>/dev/null | openssl x509 -noout -dates -subject -ext subjectAltName
```

## 7.6 폐쇄망과 사설 CA

인터넷이 안 되는 사내/폐쇄망에서는 Let's Encrypt를 쓸 수 없으므로 **사설 CA**를 구축합니다.

1. 사설 Root CA 생성
2. 서버 인증서 발급 (SAN에 내부 도메인/IP 포함)
3. **모든 클라이언트에 Root CA를 신뢰 저장소로 배포**

클라이언트별 신뢰 저장소가 다르다는 점이 실무의 함정입니다.

| 클라이언트 | 신뢰 저장소 |
|---|---|
| 브라우저(Chrome/Edge) | OS 저장소 |
| Firefox | 자체 저장소(정책으로 OS 연동 가능) |
| Node.js | 번들된 CA → `NODE_EXTRA_CA_CERTS=/path/ca.pem` |
| Java | JDK의 `cacerts` → `keytool -importcert` |
| Python requests | certifi → `REQUESTS_CA_BUNDLE` |
| Docker 컨테이너 | 이미지 내부 저장소(호스트와 별개!) → `update-ca-certificates` |

> **절대 하지 말 것**: `NODE_TLS_REJECT_UNAUTHORIZED=0`, `verify=False`, `-k`를 운영 코드에 넣는 것. 인증을 끄는 것이므로 HTTPS의 의미가 절반 이상 사라집니다. 디버깅에만 잠깐 사용하세요.

## 7.7 mTLS (상호 TLS)

일반 TLS는 클라이언트가 서버만 검증합니다. **mTLS는 서버도 클라이언트 인증서를 검증**합니다. 서비스 간 통신(마이크로서비스, 서비스 메시), 금융·산업 시스템의 장비 인증에 사용합니다.

## 7.8 HSTS

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

브라우저가 해당 도메인에 항상 HTTPS로만 접속하도록 강제합니다. 설정 후에는 HTTP로 되돌리기 어려우니(브라우저가 기억) 신중하게 적용하세요.

## 더 깊이

- [요청 한 건의 일생 1편 — 요청은 브라우저를 떠나 어디를 지나 서버에 닿는가](/posts/request-lifecycle-01-the-map): TLS를 로드밸런서에서 끝낼지 애플리케이션까지 끌고 갈지가 서버 쪽 구성에 어떤 차이를 만드는지, 핸드셰이크 비용이 응답 시간에 어떻게 반영되는지 이어서 봅니다.
