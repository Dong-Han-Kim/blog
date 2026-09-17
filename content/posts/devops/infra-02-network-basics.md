---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 인프라 2강 — 네트워크 기초'
date: '2026-09-17'
category: 'devops'
tags: ['Network', 'TCP', 'DNS', 'HTTPS', 'Infra']
description: 'OSI 계층과 IP·서브넷, TCP와 UDP, DNS, HTTP와 HTTPS, NAT·프록시·로드밸런서, 방화벽과 바인딩 주소까지 — 접속이 안 되는 원인을 DNS에서 응용까지 순서대로 좁혀 가는 법.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 인프라'
seriesOrder: 2

# 📚 SEO용
keywords: ['Network', 'TCP', 'UDP', 'DNS', 'TLS', 'HTTPS', '방화벽', '바인딩 주소', '네트워크 트러블슈팅', '인프라 강의']
---

# 풀스택 개발자를 위한 인프라 2강 — 네트워크 기초

[1강](/posts/infra-01-linux-operations)에서 서버 안쪽 — 파일, 권한, 프로세스, 서비스 — 을 다루는 법을 익혔다. 이번 강의는 그 서버 바깥을 본다. 요청 하나가 브라우저에서 출발해 서버의 프로세스에 닿기까지 어떤 경로를 지나는지 따라간다.

## 1. 왜 네트워크를 알아야 하는가

"접속이 안 돼요"라는 한 문장 뒤에는 DNS, 라우팅, 방화벽, 포트 바인딩, TLS, 애플리케이션 오류 중 하나가 숨어 있다. 이 강의의 목표는 **요청 하나가 브라우저에서 서버 코드에 도달하기까지의 경로를 설명하고, 어느 구간에서 막혔는지 도구로 좁혀 가는 능력**이다.

## 2. 계층 모델

| TCP/IP 계층 | OSI 대응 | 주요 프로토콜 | 다루는 단위 | 관련 장비/개념 |
|---|---|---|---|---|
| 응용 | 5~7 | HTTP, DNS, SSH, TLS | 메시지 | L7 로드밸런서, API 게이트웨이 |
| 전송 | 4 | TCP, UDP | 세그먼트 | 포트, L4 로드밸런서 |
| 인터넷 | 3 | IP, ICMP | 패킷 | 라우터, IP 주소 |
| 네트워크 접근 | 1~2 | Ethernet, Wi-Fi | 프레임 | 스위치, MAC 주소 |

실무에서 "L4", "L7"이라고 부르는 것은 OSI 번호다. **L4는 IP와 포트만 보고, L7은 HTTP 내용(경로, 헤더, 쿠키)까지 본다.**

## 3. IP 주소와 서브넷

### CIDR 표기

`192.168.10.0/24`에서 `/24`는 앞 24비트가 네트워크 부분이라는 뜻이다. 남은 8비트로 256개 주소를 만들고, 네트워크 주소(.0)와 브로드캐스트(.255)를 뺀 254개를 호스트에 쓴다.

| CIDR | 주소 수 | 흔한 용도 |
|---|---|---|
| /32 | 1 | 단일 호스트 (방화벽 규칙) |
| /24 | 256 | 일반 서브넷 |
| /16 | 65,536 | VPC 전체 |
| /0 | 전체 | "어디서든" (`0.0.0.0/0`) |

### 사설 IP 대역 (RFC 1918)

- `10.0.0.0/8`
- `172.16.0.0/12` (172.16 ~ 172.31) — Docker 기본 브리지가 여기(`172.17.0.0/16`)를 쓴다
- `192.168.0.0/16`

사설 IP는 인터넷에서 직접 라우팅되지 않는다. **사내망 대역과 Docker 대역이 겹치면** 컨테이너에서 사내 서버에 접속하지 못하는 문제가 생긴다. 이때는 Docker의 `default-address-pools`를 바꾼다.

### 특수 주소

- `127.0.0.1` (localhost): 자기 자신. **외부에서 접근 불가**
- `0.0.0.0`: 바인딩 시 "모든 인터페이스에서 받겠다"는 뜻

```bash
ip addr          # 내 IP 확인 (구 ifconfig)
ip route         # 라우팅 테이블, default via 가 게이트웨이
```

## 4. TCP와 UDP

| 구분 | TCP | UDP |
|---|---|---|
| 연결 | 연결 지향 (handshake) | 비연결 |
| 신뢰성 | 순서 보장, 재전송 | 보장 없음 |
| 속도 | 상대적으로 느림 | 빠름 |
| 예 | HTTP/1.1, HTTP/2, SSH, DB | DNS, 스트리밍, WebRTC, HTTP/3(QUIC) |

### 3-way handshake와 종료

```
클라이언트            서버
   │ ── SYN ───────▶ │
   │ ◀── SYN+ACK ─── │
   │ ── ACK ───────▶ │   연결 수립 (ESTABLISHED)
   ...데이터...
   │ ── FIN ───────▶ │
   │ ◀── ACK ─────── │
   │ ◀── FIN ─────── │
   │ ── ACK ───────▶ │   먼저 끊은 쪽은 TIME_WAIT 상태로 잠시 대기
```

실무 포인트:

- **연결 수립 자체가 비용**이다. 그래서 HTTP keep-alive, DB 커넥션 풀을 쓴다.
- SYN을 보냈는데 응답이 없으면 **timeout**(방화벽이 조용히 버림), RST가 오면 **connection refused**(포트에 아무도 안 듣고 있음). 이 차이가 원인 파악의 첫 단서다.
- 짧은 연결을 대량으로 맺으면 `TIME_WAIT` 소켓이 쌓여 포트가 고갈될 수 있다.

### 포트

- 0~1023: well-known 포트 (22 SSH, 80 HTTP, 443 HTTPS, 53 DNS). 바인딩에 root 권한 필요
- 1024~49151: 등록 포트 (3306 MySQL, 5432 PostgreSQL, 6379 Redis, 1521 Oracle)
- 그 이상: 클라이언트가 임시로 쓰는 ephemeral 포트

하나의 TCP 연결은 **(출발 IP, 출발 포트, 목적 IP, 목적 포트)** 네 값으로 식별된다. 그래서 서버는 443 포트 하나로 수만 개의 연결을 동시에 처리할 수 있다.

## 5. DNS

### 조회 과정

```
브라우저: blog.example.com 의 IP는?
 1. 브라우저/OS 캐시 확인
 2. /etc/hosts 확인
 3. /etc/resolv.conf 의 리졸버(예: 사내 DNS, 8.8.8.8)에 질의
 4. 리졸버가 재귀 조회:
    루트(.) → .com 네임서버 → example.com 네임서버 → 최종 IP
 5. 응답을 TTL 동안 캐시
```

### 주요 레코드

| 레코드 | 의미 | 예 |
|---|---|---|
| A | 도메인 → IPv4 | `api.example.com → 203.0.113.10` |
| AAAA | 도메인 → IPv6 | |
| CNAME | 도메인 → 다른 도메인 (별칭) | `www → example.vercel.app` |
| MX | 메일 서버 | |
| TXT | 임의 텍스트 | 도메인 소유 인증, SPF |
| NS | 이 도메인을 담당하는 네임서버 | |

- **TTL**: 캐시 유지 시간. 서버 이전을 앞두고는 TTL을 미리 짧게(예: 300초) 줄여 둔다.
- 루트 도메인(`example.com`)에는 표준상 CNAME을 쓸 수 없어 DNS 업체별 ALIAS/ANAME 기능을 쓴다.
- 폐쇄망에서는 내부 DNS가 없으면 `/etc/hosts`로 이름을 고정하는 경우가 많다. 조회 순서는 `/etc/nsswitch.conf`가 결정한다.

```bash
dig api.example.com            # 상세 조회
dig +short api.example.com     # IP만
dig @8.8.8.8 api.example.com   # 특정 DNS 서버에 질의
nslookup api.example.com
getent hosts api.example.com   # /etc/hosts 포함, 실제 앱과 같은 방식으로 조회
```

`dig`는 `/etc/hosts`를 보지 않는다. **앱이 실제로 보는 결과는 `getent hosts`로 확인**한다.

## 6. HTTP

### 요청과 응답

```
GET /api/users?page=2 HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJ...
Accept: application/json

HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store

{"users": [...]}
```

### 상태 코드 — 인프라 관점

| 코드 | 의미 | 인프라에서 흔한 원인 |
|---|---|---|
| 301/302/307/308 | 리다이렉트 | HTTP→HTTPS, 끝 슬래시 처리 |
| 400 | 잘못된 요청 | 헤더 크기 초과 |
| 401 / 403 | 인증 필요 / 권한 없음 | 파일 권한, IP 제한 |
| 404 | 없음 | 프록시 경로 매핑 오류 |
| 413 | 본문 너무 큼 | Nginx `client_max_body_size` |
| 502 | Bad Gateway | 프록시 뒤 앱이 죽었거나 포트 오류 |
| 503 | Service Unavailable | 과부하, 점검, 헬스체크 실패 |
| 504 | Gateway Timeout | 앱 응답이 프록시 타임아웃보다 느림 |

**502/504는 프록시가 만든 응답**이다. 앱 로그에 아무것도 없다면 앱까지 요청이 도달하지 못한 것이다.

### 버전별 특징

- **HTTP/1.1**: keep-alive로 연결 재사용, 한 연결에 요청 하나씩 처리
- **HTTP/2**: 한 연결에서 여러 요청을 동시에(멀티플렉싱), 헤더 압축
- **HTTP/3**: UDP 기반 QUIC 위에서 동작, 패킷 손실에 강함

### 쿠키와 CORS (인프라와 겹치는 부분)

- 쿠키의 `Secure` 속성은 HTTPS에서만 전송된다. 프록시 뒤에서 앱이 자신을 HTTP로 인식하면 문제가 생긴다(3강 `X-Forwarded-Proto`).
- CORS는 브라우저가 강제하는 규칙이다. `curl`로는 되는데 브라우저에서만 안 되면 CORS를 의심한다.

## 7. HTTPS와 TLS

### 핸드셰이크 요약 (TLS 1.3)

1. 클라이언트가 ClientHello로 지원하는 암호 방식, **SNI**(접속하려는 도메인 이름), 그리고 미리 계산한 **키 공유 값**(`key_share`)을 보낸다
2. 서버가 ServerHello로 자기 쪽 `key_share`를 보낸다 — 이 시점에 양쪽이 같은 세션 키를 계산해 낸다
3. **이후 메시지는 전부 암호화된다.** 서버는 암호화된 채로 **인증서**와 그 인증서로 서명한 CertificateVerify를 보낸다
4. 클라이언트가 인증서와 서명을 검증하고 Finished를 보내면 핸드셰이크가 끝난다

키 교환이 인증서보다 **먼저** 끝나는 것이 TLS 1.3의 핵심이다. 덕분에 인증서가 평문에 노출되지 않고, 왕복 한 번(1-RTT)에 핸드셰이크가 끝난다. TLS 1.2는 반대로 인증서를 평문으로 먼저 보내고 그 뒤에 키를 교환해 왕복이 두 번(2-RTT) 필요했다.

SNI 덕분에 IP 하나에 여러 도메인의 인증서를 둘 수 있다. 다만 SNI는 1.3에서도 평문이므로 어떤 도메인에 접속하는지는 중간에서 보인다.

### 인증서 체인

```
루트 CA (OS/브라우저에 미리 내장)
  └ 중간 CA (서버가 함께 보내야 함)
      └ 서버 인증서 (api.example.com)
```

흔한 문제:

- **중간 인증서 누락**: 브라우저는 캐시 덕에 되는데 `curl`이나 서버 간 통신에서 실패. 서버에는 `fullchain.pem`을 설정해야 한다.
- **도메인 불일치**: 인증서의 SAN 목록에 접속 도메인이 없음
- **만료**: 자동 갱신 누락
- **사설 CA (폐쇄망)**: 사내 CA가 발급한 인증서는 OS가 모른다. OS 신뢰 저장소에 추가하고(`update-ca-trust` / `update-ca-certificates`), Node.js는 자체 저장소를 쓰므로 `NODE_EXTRA_CA_CERTS=/path/ca.pem`을 지정한다. `NODE_TLS_REJECT_UNAUTHORIZED=0`으로 검증을 끄는 것은 해결이 아니다.

```bash
openssl s_client -connect api.example.com:443 -servername api.example.com
openssl x509 -in cert.pem -noout -dates -subject -ext subjectAltName
curl -v https://api.example.com
```

## 8. NAT, 프록시, 로드밸런서

### NAT

사설 IP 장비들이 공인 IP 하나를 공유해 인터넷에 나가는 방식이다. 공유기, 클라우드의 NAT 게이트웨이가 이 역할을 한다.

- **SNAT(출발지 변환)**: 내부 → 외부로 나갈 때
- **DNAT / 포트포워딩**: 외부 공인IP:8080 → 내부 서버:80. `docker run -p 8080:80`도 내부적으로 DNAT다.

### 프록시

- **포워드 프록시**: 클라이언트 앞에 선다. 사내망에서 외부 접속을 통제. `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` 환경 변수로 설정
- **리버스 프록시**: 서버 앞에 선다. 클라이언트는 뒤의 서버를 모른다. Nginx가 대표적(3강)

사내 프록시 환경에서는 `npm`, `git`, `docker`, `apt/dnf`가 각각 프록시 설정을 따로 가진다는 점에 주의한다.

### 로드밸런서

여러 서버에 트래픽을 나눈다. L4는 연결 단위로, L7은 요청 단위로 분배한다. 3강과 6강에서 자세히 다룬다.

## 9. 방화벽

리눅스 방화벽의 실체는 커널의 netfilter이고, 이를 다루는 도구가 여러 개 있다.

| 도구 | 주 사용처 |
|---|---|
| `iptables` / `nftables` | 저수준. nftables가 후속 |
| `firewalld` (`firewall-cmd`) | RHEL 계열 기본 |
| `ufw` | Ubuntu에서 간편 설정 |

```bash
# firewalld
sudo firewall-cmd --list-all
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="10.0.0.0/8" port port="5432" protocol="tcp" accept'
sudo firewall-cmd --reload

# ufw
sudo ufw allow 22/tcp
sudo ufw allow from 10.0.0.0/8 to any port 5432
sudo ufw enable
sudo ufw status numbered
```

원칙: **기본은 차단, 필요한 것만 허용**. DB 포트는 인터넷에 열지 않는다. SSH를 막는 규칙을 적용하기 전에 허용 규칙부터 넣어 원격 접속이 끊기지 않게 한다.

방화벽은 서버에만 있는 게 아니다. 경로 중간의 네트워크 방화벽, 클라우드의 보안 그룹이 각각 막을 수 있다.

## 10. 바인딩 주소 — 가장 흔한 함정

```bash
$ ss -tlnp
State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process
LISTEN 0      511    127.0.0.1:3000      0.0.0.0:*         users:(("node",pid=812))
LISTEN 0      511    0.0.0.0:80          0.0.0.0:*         users:(("nginx",pid=501))
```

- `127.0.0.1:3000` → **서버 내부에서만** 접근 가능. 외부에서 3000으로 접속하면 refused
- `0.0.0.0:80` → 모든 인터페이스에서 접근 가능

앱을 Nginx 뒤에 둘 때는 `127.0.0.1`로 바인딩하는 것이 오히려 안전하다. 반대로 **컨테이너 안의 앱은 `0.0.0.0`으로 바인딩**해야 포트 매핑이 동작한다(4강).

## 11. 디버깅 도구

| 도구 | 용도 |
|---|---|
| `ping` | ICMP로 도달 여부 (ICMP가 막혀 있으면 실패해도 정상일 수 있음) |
| `traceroute` / `tracepath` / `mtr` | 경로 중 어디서 끊기는지 |
| `dig`, `getent hosts` | DNS |
| `ss -tlnp` | 내가 열고 있는 포트 (`netstat` 후속) |
| `ss -tanp` | 현재 연결 상태 |
| `nc -vz host 5432` | 특정 포트 연결 가능 여부 |
| `curl -v` | HTTP/TLS 전 과정 |
| `tcpdump` | 패킷 캡처 |

```bash
# curl 타이밍 분석: 어느 단계가 느린가
curl -o /dev/null -s -w 'dns:%{time_namelookup} connect:%{time_connect} tls:%{time_appconnect} ttfb:%{time_starttransfer} total:%{time_total}\n' https://api.example.com

# 포트 확인 (nc가 없으면 bash 내장 기능)
timeout 3 bash -c '</dev/tcp/10.0.0.5/5432' && echo open || echo closed

# 패킷 캡처: 5432 포트로 SYN이 나가는지, 응답이 오는지
sudo tcpdump -i any -nn port 5432
```

## 12. "접속이 안 된다" 트러블슈팅 순서

```
1. DNS      이름이 올바른 IP로 풀리는가?        getent hosts / dig
2. 경로     그 IP까지 네트워크가 닿는가?          ping / traceroute / ip route
3. 포트     그 포트에 연결되는가?                nc -vz / curl -v
             - timeout   → 방화벽/보안그룹/라우팅
             - refused   → 프로세스가 안 떠 있거나 127.0.0.1 바인딩
4. 서버측   프로세스가 LISTEN 중인가?            ss -tlnp (서버에서)
5. TLS      인증서가 유효한가?                   openssl s_client / curl -v
6. 응용     HTTP 응답 코드와 앱 로그는?          curl -i / journalctl / docker logs
```

아래 계층부터 확인하면 추측이 아닌 근거로 원인을 좁힐 수 있다.

## 13. 실습 과제

1. 1강의 서버에서 앱을 `127.0.0.1:3000`과 `0.0.0.0:3000`으로 각각 띄우고 외부에서 접속 결과를 비교한다.
2. 방화벽에서 3000 포트를 막고 `curl`의 에러 메시지(timeout vs refused)를 비교한다.
3. `/etc/hosts`에 가짜 도메인을 등록하고 `dig`와 `getent hosts` 결과를 비교한다.
4. `curl -w`로 공개 사이트 몇 곳의 DNS/연결/TLS/TTFB 시간을 측정한다.
5. `tcpdump`를 켠 상태에서 `curl http://...` 요청을 보내 3-way handshake를 눈으로 확인한다.
6. `openssl s_client`로 공개 사이트의 인증서 체인과 만료일을 확인한다.

## 14. 핵심 정리

- L4는 IP·포트, L7은 HTTP 내용까지 본다
- 사설 대역 3개를 외우고, Docker 대역과 사내망 대역 충돌에 주의
- timeout은 방화벽/경로, refused는 프로세스/바인딩 문제
- DNS는 TTL로 캐시되며, 앱이 보는 결과는 `getent hosts`로 확인
- 502/504는 프록시가 만든 응답 → 프록시 뒤를 본다
- 서버 인증서는 fullchain으로, 사설 CA는 신뢰 저장소에 등록 (검증 끄기 금지)
- 기본 차단, 필요한 포트만 허용
- 트러블슈팅은 DNS → 경로 → 포트 → 프로세스 → TLS → 응용 순서

## 더 깊이

이 강은 인프라를 운영하는 데 필요한 최소한만 다뤘다. 계층 모델부터 TLS, 실시간 통신, 트러블슈팅까지 15장으로 파고드는 심화 시리즈가 따로 있다.

- [풀스택 개발자를 위한 네트워크 1장 — 네트워크의 기본 구조: 패킷, 프로토콜, 계층 모델](/posts/network-01-packets-and-layers)
