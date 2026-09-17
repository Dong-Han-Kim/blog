---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 네트워크 4장 — 전송 계층: TCP와 UDP, 포트, 소켓'
date: '2026-09-17'
category: 'network'
tags: ['Network', 'TCP', 'UDP', 'Socket', 'Port']
description: '포트와 소켓의 생애주기부터 3-way/4-way 핸드셰이크, TIME_WAIT과 CLOSE_WAIT이 알려주는 것, 재전송·흐름 제어·혼잡 제어, UDP와의 비교, 그리고 에러 코드로 계층을 읽는 법까지.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 네트워크'
seriesOrder: 4

# 📚 SEO용
keywords: ['Network', 'TCP', 'UDP', 'Socket', 'Port', 'TCP', 'UDP', '포트', '소켓', '3-way handshake', 'TIME_WAIT', 'CLOSE_WAIT', 'TCP_NODELAY', 'ECONNRESET', 'ECONNREFUSED']
---

# 풀스택 개발자를 위한 네트워크 4장 — 전송 계층: TCP와 UDP, 포트, 소켓

3장까지는 패킷이 목적지 컴퓨터에 도착하는 과정이었습니다. 이번 장은 그 컴퓨터 안의 어떤 프로세스에게 전달되는지, 그리고 그 전달을 얼마나 믿을 수 있는지를 다룹니다.

## 4.1 포트

IP가 "건물 주소"라면 포트는 "호수"입니다. 0~65535의 16비트 숫자.

| 범위 | 이름 | 예시 |
|---|---|---|
| 0 ~ 1023 | Well-known | 22 SSH, 53 DNS, 80 HTTP, 443 HTTPS |
| 1024 ~ 49151 | Registered | 3306 MySQL, 5432 PostgreSQL, 6379 Redis, 1521 Oracle, 27017 MongoDB, 9000 MinIO |
| 49152 ~ 65535 | Dynamic/Ephemeral | 클라이언트 임시 포트 |

- Linux에서 1024 미만 포트 바인딩은 root 권한(또는 `CAP_NET_BIND_SERVICE`) 필요 → 앱은 3000/8080에 띄우고 앞단 Nginx가 80/443을 받는 구조가 일반적.
- 클라이언트가 연결할 때는 OS가 **임시 포트(ephemeral port)** 를 자동 배정합니다. Linux 기본 범위는 `32768~60999`.

```bash
cat /proc/sys/net/ipv4/ip_local_port_range
```

## 4.2 소켓

소켓은 **네트워크 통신을 위한 OS의 인터페이스(파일 디스크립터)** 입니다. 서버 소켓의 생애주기:

```
socket() → bind(IP, port) → listen(backlog) → accept() → read()/write() → close()
```

클라이언트:

```
socket() → connect(서버IP, 포트) → write()/read() → close()
```

Express의 `app.listen(3000)`, Spring의 내장 Tomcat도 내부적으로 이 과정을 수행합니다. `listen`의 **backlog**는 accept 대기열 크기로, 트래픽 폭주 시 이 큐가 차면 연결이 거부되거나 지연됩니다.

## 4.3 TCP — 신뢰성 있는 연결

TCP는 다음을 보장합니다.

- **연결 지향**: 통신 전 연결 수립
- **신뢰성**: 유실 시 재전송
- **순서 보장**: 시퀀스 번호로 재조립
- **흐름 제어**: 수신자가 감당할 만큼만 전송 (수신 윈도우)
- **혼잡 제어**: 네트워크가 감당할 만큼만 전송 (혼잡 윈도우)

### 3-way Handshake (연결 수립)

```
Client                         Server
  | ------ SYN (seq=x) ------->  |   LISTEN
  | <-- SYN+ACK (seq=y,ack=x+1)  |   SYN_RECEIVED
  | ------ ACK (ack=y+1) ----->  |   ESTABLISHED
ESTABLISHED
```

이 과정 때문에 **새 연결은 비쌉니다.** 1 RTT(왕복 시간)가 추가되고, HTTPS라면 TLS 핸드셰이크가 더해집니다. 그래서 **Keep-Alive, 커넥션 풀**이 중요합니다([12장](/posts/network-12-performance-and-stability)).

### 4-way Handshake (연결 종료)

```
Active Closer                  Passive Closer
  | ------ FIN -------------->  |   CLOSE_WAIT
  | <----- ACK ---------------  |
FIN_WAIT_2                      |   (남은 데이터 전송 후)
  | <----- FIN ---------------  |   LAST_ACK
  | ------ ACK -------------->  |   CLOSED
TIME_WAIT (2MSL 대기) → CLOSED
```

**개발자가 꼭 알아야 할 두 상태**:

- **TIME_WAIT**: 먼저 연결을 끊은 쪽에 남습니다. Linux는 약 60초. 지연된 패킷이 새 연결에 섞이는 것을 방지합니다. 짧은 연결을 초당 수천 개씩 맺고 끊으면 TIME_WAIT이 쌓여 **임시 포트가 고갈**됩니다 → `EADDRNOTAVAIL` / `connect: cannot assign requested address`. 해결책은 커널 튜닝보다 **커넥션 재사용**이 우선입니다.
- **CLOSE_WAIT**: 상대가 FIN을 보냈는데 **내 애플리케이션이 close()를 호출하지 않은 상태**. CLOSE_WAIT이 계속 쌓인다면 거의 확실히 **애플리케이션 코드의 리소스 누수**(응답 스트림 미종료, 커넥션 미반납)입니다.

```bash
ss -tan state time-wait | wc -l
ss -tanp state close-wait
```

### RST — 강제 종료

- 닫힌 포트로 SYN을 보내면 RST가 돌아옵니다 → 클라이언트에서 `ECONNREFUSED`.
- 이미 끊긴 연결에 데이터를 보내면 RST → `ECONNRESET`.
- 로드밸런서/방화벽이 유휴 연결을 조용히 정리한 뒤, 클라이언트가 그 연결을 재사용하면 `ECONNRESET`이나 응답 없음이 발생합니다. (커넥션 풀 유휴 타임아웃을 중간 장비보다 짧게 설정해야 하는 이유)

### 재전송, 흐름 제어, 혼잡 제어

- **재전송**: ACK가 일정 시간(RTO) 내 오지 않거나 중복 ACK 3개를 받으면 재전송.
- **흐름 제어**: 수신 측이 `window size`로 "이만큼만 보내"라고 알림. 수신 앱이 데이터를 늦게 읽으면 윈도우가 0이 되어 송신이 멈춥니다.
- **혼잡 제어**: Slow Start로 작게 시작해 점점 늘리고, 손실이 감지되면 줄입니다. 대표 알고리즘: CUBIC(리눅스 기본), BBR.

> **Slow Start의 실무적 의미**: 새 연결은 처음에 조금씩만 보낼 수 있습니다. 그래서 새 연결에서 큰 파일을 받으면 초반이 느리고, **연결을 재사용하는 것**이 성능상 유리합니다.

### Nagle 알고리즘과 TCP_NODELAY

작은 패킷을 모아서 보내는 최적화입니다. 실시간성이 중요한 프로토콜(게임, 터미널, 일부 RPC)에서는 지연을 유발하므로 `TCP_NODELAY`로 끕니다. Node.js는 `socket.setNoDelay(true)`, 대부분의 HTTP 서버/클라이언트 라이브러리는 이미 기본으로 끄고 있습니다.

### TCP Keepalive

유휴 연결이 살아있는지 확인하는 **TCP 수준의 탐지 패킷**입니다. HTTP의 Keep-Alive(연결 재사용)와 이름만 같고 다른 개념이니 구분하세요. Linux 기본값은 2시간 후 시작이라 대부분의 방화벽 유휴 타임아웃보다 깁니다. DB 커넥션이 방화벽에 의해 조용히 끊기는 문제가 있다면 드라이버의 keepalive 옵션을 짧게 설정합니다.

## 4.4 UDP — 빠르고 단순한 전송

- 연결 수립 없음, 재전송 없음, 순서 보장 없음
- 헤더가 8바이트로 가벼움
- 사용처: DNS, 스트리밍, 음성/영상 통화(WebRTC), 게임, QUIC(HTTP/3)

| 항목 | TCP | UDP |
|---|---|---|
| 연결 | 연결 지향 | 비연결 |
| 신뢰성 | 보장 | 없음 |
| 순서 | 보장 | 없음 |
| 속도/오버헤드 | 상대적으로 무거움 | 가벼움 |
| 스트림/메시지 | 바이트 스트림 (경계 없음) | 메시지 단위 (경계 보존) |
| 대표 용도 | HTTP/1·2, DB, SSH | DNS, WebRTC, QUIC |

> **TCP는 바이트 스트림이다**: `write("Hello")`, `write("World")`를 두 번 호출해도 수신 측은 `"HelloWorld"`를 한 번에 받을 수도, `"Hel"`, `"loWorld"`로 나눠 받을 수도 있습니다. 직접 TCP 프로토콜을 만든다면 **길이 prefix나 구분자로 메시지 경계를 직접 정의**해야 합니다.

## 4.5 에러 코드로 계층 읽기

| 에러 | 의미 | 의심할 것 |
|---|---|---|
| `ECONNREFUSED` | 호스트엔 도달했으나 포트에 리스닝 프로세스 없음 (RST 수신) | 서버 미기동, 잘못된 포트, 127.0.0.1 바인딩 |
| `ETIMEDOUT` | 응답 자체가 없음 | 방화벽 DROP, 라우팅 불가, 서버 과부하 |
| `EHOSTUNREACH` | 목적지 호스트로 경로 없음 | 라우팅, 잘못된 IP, 서브넷 |
| `ECONNRESET` | 연결 중 상대가 RST | 서버 크래시, 중간 장비의 유휴 연결 정리, 프록시 타임아웃 |
| `ENOTFOUND` / `EAI_AGAIN` | DNS 해석 실패 | DNS 서버, 도메인 오타, 폐쇄망 DNS |
| `EADDRINUSE` | 바인딩할 포트가 이미 사용 중 | 이전 프로세스 잔존 |
| `EPIPE` | 닫힌 소켓에 쓰기 시도 | 클라이언트가 먼저 끊음 |

이 표 하나만 외워도 장애 초기 진단 속도가 크게 달라집니다. **REFUSED는 "빨리 거절", TIMEDOUT은 "아무 대답 없음"** 입니다. 후자는 거의 항상 방화벽이나 네트워크 경로 문제입니다.
