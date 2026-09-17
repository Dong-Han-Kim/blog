---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 네트워크 9장 — 실시간 통신: Polling, SSE, WebSocket, WebRTC'
date: '2026-09-17'
category: 'network'
tags: ['Network', 'WebSocket', 'SSE', 'WebRTC', 'Realtime']
description: 'Polling·SSE·WebSocket·WebRTC를 요구사항 기준으로 비교하고, Nginx 버퍼링과 Upgrade 헤더, "정확히 60초마다 끊김"의 원인, WebRTC 시그널링과 STUN/TURN/SFU의 네트워크 포인트를 다룬다.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 네트워크'
seriesOrder: 9

# 📚 SEO용
keywords: ['Network', 'WebSocket', 'SSE', 'WebRTC', 'Realtime', 'Short Polling', 'Long Polling', 'SSE', 'Server-Sent Events', 'WebSocket', 'WebRTC', 'STUN', 'TURN', 'SFU', '스티키 세션']
---

# 풀스택 개발자를 위한 네트워크 9장 — 실시간 통신: Polling, SSE, WebSocket, WebRTC

8장까지는 브라우저가 서버에 요청을 보내는 쪽을 다뤘습니다. 이번 장은 방향이 반대인 경우입니다.

HTTP는 기본적으로 클라이언트가 요청해야 서버가 응답합니다. 서버가 먼저 데이터를 보내야 하는 경우의 선택지를 비교합니다.

## 9.1 Short Polling

일정 주기로 요청. 구현이 가장 쉽고, 인프라 제약이 없습니다. 대신 불필요한 요청과 지연이 발생합니다. 갱신 주기가 수십 초 이상인 **KPI 대시보드** 같은 화면에서는 오히려 가장 합리적인 선택일 수 있습니다.

## 9.2 Long Polling

서버가 새 데이터가 생길 때까지 응답을 보류. 실시간에 가깝지만 연결을 오래 점유하며, 프록시 타임아웃을 고려해야 합니다.

## 9.3 SSE (Server-Sent Events)

```js
const es = new EventSource('/api/events');

// event: 필드가 있는 "이름 있는 이벤트"는 그 이름으로 구독해야 받는다
es.addEventListener('kpi-updated', (e) => console.log(e.data));

// onmessage는 event: 필드가 없는 기본 이벤트(type === 'message')에만 발화한다
es.onmessage = (e) => console.log('default:', e.data);
```

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache

id: 42
event: kpi-updated
data: {"line":"A","value":93.1}

```

- **서버 → 클라이언트 단방향**, 일반 HTTP 위에서 동작
- 자동 재연결, `Last-Event-ID`로 이어받기 내장
- `event:` 줄이 있으면 `addEventListener('<이름>')`로만 받을 수 있고, `onmessage`는 `event:` 줄이 없는 기본 이벤트만 받습니다
- HTTP/1.1에서는 도메인당 연결 수 제한(약 6개)에 걸리기 쉬움 → HTTP/2 권장
- LLM 스트리밍 응답(ChatGPT/Claude API의 stream)이 대표적인 SSE 사용 예
- Nginx 뒤에서 쓸 때 **응답 버퍼링을 꺼야** 이벤트가 즉시 전달됩니다.

```nginx
location /api/events {
    proxy_pass http://app;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
}
```

## 9.4 WebSocket

```
GET /ws HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13

HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

- HTTP로 시작해 **프로토콜을 업그레이드**한 뒤 양방향 프레임 통신
- `ws://`(80), `wss://`(443)
- 채팅, 협업 편집, 게임, 실시간 알림에 적합

**WebSocket 운영 시 필수 체크**

1. **리버스 프록시가 Upgrade 헤더를 전달해야 합니다.** 기본 설정의 Nginx는 전달하지 않습니다.

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

location /ws {
    proxy_pass http://app;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_read_timeout 3600s;
}
```

2. **"정확히 60초마다 끊긴다"** → Nginx `proxy_read_timeout` 기본값이 60초입니다. AWS ALB 기본 유휴 타임아웃도 60초입니다. 타임아웃을 늘리거나 **ping/pong 하트비트**를 그보다 짧은 주기로 보내세요.
3. **로드밸런서 다중 인스턴스**: 연결이 특정 서버에 고정되므로, 서버 간 메시지 전파에 Redis Pub/Sub 같은 브로커가 필요합니다. Socket.IO의 polling 폴백을 쓰면 **스티키 세션**도 필요합니다.
4. **재연결 로직**(지수 백오프)과 재연결 후 상태 동기화는 클라이언트의 책임입니다.
5. 인증: 브라우저 WebSocket API는 커스텀 헤더를 못 붙이므로 쿠키, 쿼리 토큰(로그 노출 주의), 또는 연결 직후 첫 메시지로 인증합니다.

## 9.5 WebRTC

브라우저 간 **P2P로 음성/영상/데이터**를 주고받는 기술. 기본적으로 UDP 기반입니다.

구성 요소:

- **시그널링**: 연결 정보(SDP offer/answer, ICE candidate)를 교환하는 채널. WebRTC 표준이 정의하지 않으므로 보통 WebSocket으로 직접 구현.
- **ICE**: 가능한 모든 경로 후보를 모아 연결 가능한 경로를 찾는 프레임워크.
- **STUN**: "외부에서 보이는 내 공인 IP:포트"를 알려주는 서버 (NAT 뒤 장비를 위해).
- **TURN**: 직접 연결이 불가능할 때(대칭형 NAT, 엄격한 방화벽) **미디어를 대신 중계**하는 서버. 대역폭 비용이 큼.

```
[A] ─── 시그널링 서버(WebSocket) ─── [B]
 │                                    │
 ├── STUN으로 공인 주소 확인 ──────────┤
 │                                    │
 └────── 직접 P2P (UDP) ──────────────┘
         ↓ 실패 시
 └────── TURN 서버 경유 ──────────────┘
```

**다자간 통화의 구조**

| 구조 | 설명 | 특징 |
|---|---|---|
| Mesh | 모든 참가자가 서로 P2P | 인원 증가 시 업로드 폭증, 소규모만 |
| MCU | 서버가 영상을 합성해 하나로 전송 | 서버 CPU 부담 큼 |
| **SFU** | 서버가 스트림을 **디코딩 없이 선택적으로 전달** | 현재 주류. LiveKit, mediasoup, Janus 등 |

**SFU(예: LiveKit)를 자체 호스팅할 때의 네트워크 포인트**

- 시그널링용 HTTP/WebSocket 포트와 별개로 **미디어용 UDP 포트 대역**, TCP 폴백 포트, 내장 TURN 포트를 방화벽에서 열어야 합니다. 시그널링은 되는데 영상이 안 나오는 증상의 대부분이 UDP 대역 차단입니다.
- 서버가 클라이언트에게 알려주는 **ICE candidate의 IP가 클라이언트에서 도달 가능한 주소**여야 합니다. 폐쇄망에서 외부 IP 자동 탐지(STUN 기반)를 켜두면 엉뚱한 주소를 광고하거나 탐지 자체가 실패하므로, 내부 IP를 명시적으로 지정해야 합니다.
- 컨테이너로 띄울 때는 수천 개의 UDP 포트를 매핑하는 대신 `network_mode: host`를 쓰는 경우가 많습니다.
- 녹화(egress) 결과를 MinIO/S3에 저장하는 구조라면, egress 컨테이너 → 스토리지 엔드포인트 간 **내부 DNS 해석과 접근 경로**도 함께 점검해야 합니다.

## 9.6 선택 가이드

| 요구사항 | 추천 |
|---|---|
| 수십 초 단위 갱신 | Short Polling |
| 서버 → 클라이언트 알림, 스트리밍 텍스트 | SSE |
| 양방향 저지연 메시지 | WebSocket |
| 음성/영상, 대용량 P2P 데이터 | WebRTC (+SFU) |
| 서비스 간 스트리밍 RPC | gRPC (HTTP/2) |
