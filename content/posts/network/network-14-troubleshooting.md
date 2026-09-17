---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 네트워크 14장 — 실전 트러블슈팅'
date: '2026-09-17'
category: 'network'
tags: ['Network', 'Troubleshooting', 'tcpdump', 'curl', 'DevTools']
description: '이름 해석부터 애플리케이션 로직까지 아래에서 위로 올라가는 진단 순서와, 각 단계에서 쓰는 명령어(nc·ss·curl -w·tcpdump·mtr·openssl), 브라우저 DevTools 활용법, 증상별 원인 사전을 담았다.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 네트워크'
seriesOrder: 14

# 📚 SEO용
keywords: ['Network', 'Troubleshooting', 'tcpdump', 'curl', 'DevTools', '트러블슈팅', 'dig', 'getent', 'nc', 'ss', 'curl', 'tcpdump', 'traceroute', 'mtr', 'openssl s_client', 'DevTools']
---

# 풀스택 개발자를 위한 네트워크 14장 — 실전 트러블슈팅

앞선 장들이 계층별 지식이었다면, 이번 장은 장애가 났을 때 그 지식을 꺼내 쓰는 순서입니다.

## 14.1 계층별 진단 순서 (아래에서 위로)

"API가 안 된다"는 신고를 받았을 때:

```
1. 이름 해석이 되는가?         → getent hosts / dig
2. 경로가 있는가?              → ip route / traceroute / ping(차단 가능성 고려)
3. 포트가 열려 있는가?          → nc -zv / telnet / ss -tlnp (서버 측)
4. TLS가 성립하는가?           → openssl s_client / curl -v
5. HTTP 응답이 오는가?          → curl -v, 상태 코드, 헤더
6. 애플리케이션 로직이 맞는가?    → 앱 로그, 트레이싱
```

위 단계 중 **처음 실패하는 지점**이 원인에 가장 가깝습니다.

## 14.2 필수 명령어

**연결 확인**

```bash
nc -zv 10.0.2.15 5432            # 포트 오픈 여부 (TCP)
nc -zvu 10.0.2.15 3478           # UDP (결과 해석에 주의: 응답 없음 ≠ 차단 확정)
timeout 3 bash -c '</dev/tcp/10.0.2.15/5432' && echo open   # nc가 없을 때
curl -v telnet://10.0.2.15:5432
```

**HTTP 디버깅**

```bash
curl -v https://api.example.com/health
curl -I https://example.com                          # 헤더만
curl -sS -o /dev/null -w "dns:%{time_namelookup} connect:%{time_connect} tls:%{time_appconnect} ttfb:%{time_starttransfer} total:%{time_total}\n" https://example.com
curl --resolve api.example.com:443:10.0.1.20 https://api.example.com/   # DNS 우회해서 특정 서버로
curl -H "Origin: https://app.example.com" -X OPTIONS -i https://api.example.com/data   # CORS preflight 재현
curl --http2 -I https://example.com
```

`-w` 타이밍 출력은 "DNS가 느린지, 연결이 느린지, TLS가 느린지, 서버 처리가 느린지"를 한 줄로 구분해줍니다.

**리스닝 포트와 연결 상태**

```bash
ss -tlnp                          # TCP 리스닝 포트와 프로세스
ss -ulnp                          # UDP 리스닝
ss -tanp | grep 5432              # 특정 포트의 연결
ss -s                             # 요약 통계
lsof -i :3000                     # 포트를 점유한 프로세스 (macOS 포함)
```

리스닝 주소가 `127.0.0.1:3000`인지 `0.0.0.0:3000`인지 반드시 확인하세요.

**패킷 캡처**

```bash
sudo tcpdump -i any port 5432 -nn
sudo tcpdump -i any host 10.0.2.15 and port 443 -nn -w capture.pcap   # Wireshark로 분석
```

tcpdump로 보면 다음이 명확해집니다.

- SYN만 반복되고 응답이 없다 → 방화벽 DROP 또는 경로 문제
- SYN → RST → 포트 닫힘 (서버 미기동/바인딩 주소 오류)
- 3-way는 되는데 데이터 교환 중 멈춘다 → MTU, 앱 hang, 중간 장비 문제

**경로와 DNS**

```bash
traceroute -T -p 443 api.example.com   # TCP로 traceroute (ICMP 차단 환경)
mtr api.example.com                    # 지속적인 경로/손실 측정
dig +short api.example.com
cat /etc/resolv.conf
```

**TLS**

```bash
openssl s_client -connect api.example.com:443 -servername api.example.com
openssl x509 -in cert.pem -noout -text | grep -A1 "Subject Alternative Name"
```

## 14.3 브라우저 DevTools 활용

- **Network 탭**: 상태 코드, 요청/응답 헤더, Timing, Initiator(누가 이 요청을 발생시켰나)
- "Disable cache"로 캐시 영향 제거
- 실패한 요청의 **Console 메시지**에서 CORS/Mixed Content/CSP 위반 확인
- `Copy as cURL`로 동일한 요청을 터미널에서 재현 → **브라우저 정책 문제인지 서버 문제인지 분리**
- WS 탭에서 WebSocket 프레임 확인
- `chrome://net-internals`, `chrome://webrtc-internals` (WebRTC ICE 후보·연결 상태 확인)

## 14.4 증상별 원인 사전

| 증상 | 1순위 의심 |
|---|---|
| 로컬은 되는데 컨테이너에선 DB 연결 실패 | `localhost` 사용, 서비스 이름/네트워크 불일치 |
| 외부에서 컨테이너 앱 접속 불가 | 앱이 `127.0.0.1`에 바인딩, 포트 매핑 누락, 방화벽 |
| 브라우저에서만 API 실패 | CORS, Mixed Content(HTTPS 페이지에서 HTTP 호출), 쿠키 SameSite |
| 파일 업로드만 실패(413) | 프록시 body size 제한 |
| 긴 요청만 실패(504) | 프록시/LB 타임아웃 |
| 정확히 N초마다 WebSocket 끊김 | 프록시 read timeout, LB idle timeout |
| 간헐적 ECONNRESET | 유휴 연결 재사용, keep-alive 타임아웃 불일치 |
| 트래픽 증가 시 connect 실패 | 임시 포트 고갈(TIME_WAIT), backlog 초과, 파일 디스크립터 한도 |
| 특정 사내 서버만 접속 불가 | Docker 대역 충돌, VLAN/방화벽 정책 |
| curl/Node에선 인증서 오류, 브라우저는 정상 | 중간 인증서 누락, 사설 CA 미등록 |
| 서버 이전 후 일부 사용자만 옛 서버로 | DNS TTL, 앱/OS DNS 캐시, 기존 커넥션 재사용 |
| 시그널링은 되는데 영상이 안 나옴 | UDP 포트 차단, ICE candidate IP 오류, TURN 부재 |
| VPN 연결 시 특정 사이트만 멈춤 | MTU 문제 |
| JWT가 발급 즉시 만료 처리됨 | 서버 간 시간 불일치(NTP) |
| 배포할 때마다 잠깐 502 | Graceful shutdown/draining 미구현 |
