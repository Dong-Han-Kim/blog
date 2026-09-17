---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 네트워크 5장 — DNS: 이름이 주소가 되기까지'
date: '2026-09-17'
category: 'network'
tags: ['Network', 'DNS', 'TTL', 'Cache']
description: 'DNS의 계층 구조와 조회 과정, 주요 레코드 타입과 apex CNAME 제약, TTL과 애플리케이션 레벨 캐시의 함정, /etc/hosts 오버라이드, dig·getent로 확인하는 법을 정리한다.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 네트워크'
seriesOrder: 5

# 📚 SEO용
keywords: ['Network', 'DNS', 'TTL', 'Cache', 'DNS', '재귀 질의', '반복 질의', 'A 레코드', 'CNAME', 'TTL', 'DNS 캐싱', '/etc/hosts', 'dig', 'getent']
---

# 풀스택 개발자를 위한 네트워크 5장 — DNS: 이름이 주소가 되기까지

4장까지 IP와 포트로 상대를 지정하는 방법을 봤습니다. 다만 코드가 실제로 적는 것은 숫자가 아니라 이름이므로, 이번 장은 이름이 주소로 바뀌는 과정을 봅니다.

## 5.1 DNS의 구조

DNS는 **분산된 계층형 데이터베이스**입니다.

```
. (루트)
└── com. (TLD)
    └── example.com. (권한 있는 네임서버)
        └── api.example.com.
```

## 5.2 조회 과정

```
브라우저 캐시 → OS 캐시 → /etc/hosts → 재귀 리졸버(ISP, 8.8.8.8, 사내 DNS)
  재귀 리졸버 → 루트 서버: ".com 담당 누구?"
  재귀 리졸버 → .com TLD 서버: "example.com 담당 누구?"
  재귀 리졸버 → example.com 권한 서버: "api.example.com의 IP는?"
  → 결과를 캐시하고 클라이언트에 응답
```

- 클라이언트 → 리졸버: **재귀 질의(Recursive)**
- 리졸버 → 각 서버: **반복 질의(Iterative)**
- 기본적으로 UDP 53, 응답이 크면 TCP 53. 최근엔 DoH(DNS over HTTPS), DoT도 사용.

## 5.3 주요 레코드 타입

| 레코드 | 용도 | 예시 |
|---|---|---|
| A | 도메인 → IPv4 | `api.example.com → 203.0.113.10` |
| AAAA | 도메인 → IPv6 | |
| CNAME | 도메인 → 다른 도메인 (별칭) | `www → example.vercel.app` |
| MX | 메일 서버 | |
| TXT | 임의 텍스트 (도메인 소유 인증, SPF, DKIM) | |
| NS | 해당 영역의 네임서버 | |
| SOA | 영역의 기본 정보 | |
| PTR | IP → 도메인 (역방향) | |
| SRV | 서비스 위치 (호스트+포트) | |
| CAA | 인증서 발급 허용 CA 지정 | |

> **CNAME 제약**: 루트 도메인(apex, 예: `example.com`)에는 CNAME을 둘 수 없습니다(다른 레코드와 공존 불가 규칙 때문). 그래서 Vercel, Cloudflare 같은 곳은 apex에 A 레코드를 쓰거나 ALIAS/CNAME Flattening 기능을 제공합니다.

## 5.4 TTL과 캐싱

각 레코드에는 캐시 유지 시간(TTL)이 있습니다.

- TTL이 길면: 조회가 빨라지고 DNS 부하가 줄지만, **변경이 늦게 반영**됩니다.
- 서버 이전 계획이 있다면 **며칠 전에 TTL을 60~300초로 낮춰 두는 것**이 정석입니다.
- 애플리케이션 레벨 캐시도 조심해야 합니다. JVM은 설정에 따라 DNS 결과를 오래(혹은 영원히) 캐시할 수 있고, 커넥션 풀은 이미 맺은 연결을 계속 쓰기 때문에 DNS가 바뀌어도 **기존 IP로 계속 붙습니다.**

## 5.5 로컬 오버라이드: /etc/hosts

```
# /etc/hosts
10.10.1.50   api.internal.company
127.0.0.1    myapp.local
```

- 개발/테스트 시 도메인을 임시로 특정 IP에 연결할 때 유용합니다.
- **DNS 서버가 없는 폐쇄망**에서는 hosts 파일이 사실상의 DNS 역할을 하기도 합니다. 다만 서버가 많아지면 관리가 어려워지므로 내부 DNS(bind, dnsmasq, CoreDNS)를 두는 것이 좋습니다.

## 5.6 DNS 확인 명령어

```bash
dig api.example.com              # 상세 조회
dig +short api.example.com       # IP만
dig @8.8.8.8 api.example.com     # 특정 DNS 서버에 질의
dig api.example.com CNAME
dig +trace example.com           # 루트부터 추적
nslookup api.example.com
getent hosts api.example.com     # /etc/hosts까지 포함한 OS 해석 결과
```

> `dig`는 `/etc/hosts`를 보지 않습니다. 애플리케이션이 실제로 어떤 IP로 해석하는지는 `getent hosts`가 더 정확합니다.
