---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 네트워크 12장 — 네트워크 성능과 안정성 설계'
date: '2026-09-17'
category: 'network'
tags: ['Network', 'Performance', 'Timeout', 'Retry', 'Connection Pool']
description: 'RTT로 계산하는 새 연결의 최소 비용, HTTP 클라이언트와 DB 커넥션 풀의 재사용, 바깥이 안쪽보다 길어야 하는 타임아웃 정렬, 백오프와 지터, 서킷 브레이커와 격벽, 프론트엔드 최적화까지.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 네트워크'
seriesOrder: 12

# 📚 SEO용
keywords: ['Network', 'Performance', 'Timeout', 'Retry', 'Connection Pool', 'RTT', '지연 시간', '커넥션 풀', 'keep-alive', '타임아웃 설계', '지수 백오프', '지터', '서킷 브레이커', '격벽', 'preconnect']
---

# 풀스택 개발자를 위한 네트워크 12장 — 네트워크 성능과 안정성 설계

여기까지가 "어떻게 연결되는가"였습니다. 이번 장은 "얼마나 빠르고 안정적으로 연결되는가"를 설계의 문제로 다룹니다.

## 12.1 지연 시간(Latency)의 구성

- **전파 지연**: 물리적 거리 (빛의 속도 한계, 광섬유에서 약 200,000km/s)
- **전송 지연**: 데이터 크기 / 대역폭
- **처리 지연**: 라우터, 서버의 처리
- **큐잉 지연**: 혼잡 시 대기

**RTT(Round Trip Time)** 가 모든 계산의 기본 단위입니다. HTTPS 요청 하나의 최소 비용(새 연결):

```
DNS 조회 (≈1 RTT, 캐시 없을 때)
+ TCP 핸드셰이크 (1 RTT)
+ TLS 1.3 핸드셰이크 (1 RTT)
+ HTTP 요청/응답 (1 RTT + 서버 처리 시간)
≈ 4 RTT + 서버 처리
```

서울-미국 서부 RTT가 약 130~150ms라면, 새 연결 요청은 서버가 0ms로 처리해도 0.5초 이상 걸릴 수 있습니다. **연결 재사용과 사용자 가까이 배포하는 것**이 왜 중요한지 보여주는 숫자입니다.

**대역폭 vs 지연**: 대역폭은 "도로의 폭", 지연은 "도로의 길이"입니다. 대부분의 웹 페이지는 작은 요청이 많아 **대역폭보다 지연에 민감**합니다.

## 12.2 연결 재사용과 커넥션 풀

**HTTP 클라이언트**

```js
// Node.js — 서버 간 호출 시 연결 재사용
import { Agent } from 'undici';
const agent = new Agent({ keepAliveTimeout: 10_000, connections: 100 });
```

- Node.js 19+부터 기본 `http.Agent`의 keepAlive가 활성화되었고, Node 18+의 전역 `fetch`(undici)도 연결을 재사용합니다.
- 서비스 간 호출에서 매 요청마다 새 클라이언트 인스턴스를 만들면 재사용이 깨집니다. **클라이언트는 싱글톤으로.**

**DB 커넥션 풀**

- DB 연결은 TCP + TLS + 인증까지 있어 매우 비쌉니다 → 풀 사용이 필수.
- 풀 크기는 "크면 좋다"가 아닙니다. DB의 `max_connections`, 앱 인스턴스 수 × 풀 크기를 함께 계산해야 합니다.
- 서버리스(Vercel Functions 등)는 인스턴스가 많이 뜨면 연결이 폭증하므로 **PgBouncer, Supabase Pooler(Supavisor)** 같은 외부 풀러를 사용합니다.
- **유휴 연결 타임아웃은 중간 방화벽/LB의 유휴 타임아웃보다 짧게** 설정해 "죽은 연결"을 꺼내 쓰는 문제를 예방합니다. 풀의 연결 검증(validation query, `testOnBorrow`) 옵션도 활용하세요.

## 12.3 타임아웃 설계

타임아웃이 없는 네트워크 호출은 **언젠가 반드시 시스템 전체를 멈추게 합니다.**

| 종류 | 의미 |
|---|---|
| Connect timeout | TCP(+TLS) 연결 수립까지 |
| Read/Socket timeout | 데이터 수신 사이의 최대 대기 |
| Request/Total timeout | 요청 전체의 최대 시간 |
| Idle timeout | 유휴 연결 유지 시간 |

**계층별 타임아웃 정렬 원칙**: 바깥쪽이 안쪽보다 길어야 합니다.

```
클라이언트(30s) > 로드밸런서(25s) > Nginx(20s) > 앱의 외부 호출(15s) > DB 쿼리(10s)
```

반대로 설정되면 안쪽 작업이 끝나기 전에 바깥쪽이 끊어지고, 안쪽은 아무도 기다리지 않는 작업을 계속 수행합니다(자원 낭비 + 재시도 폭주).

```js
// fetch 타임아웃
const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
```

## 12.4 재시도와 백오프

- **멱등한 요청만** 자동 재시도
- **지수 백오프 + 지터(Jitter)**: `대기 = min(최대, 기본 × 2^시도) × random(0.5~1)`
- 모든 클라이언트가 동시에 재시도하면 복구 중인 서버를 다시 쓰러뜨립니다(Thundering Herd, Retry Storm) → 지터가 필수
- 재시도 횟수 제한, 전체 데드라인 준수
- `429`, `503`의 `Retry-After` 존중

## 12.5 서킷 브레이커와 격벽

- **서킷 브레이커**: 실패율이 임계치를 넘으면 일정 시간 호출 자체를 차단하고 빠르게 실패(fail fast) → 장애 전파 방지
- **격벽(Bulkhead)**: 외부 의존성별로 커넥션 풀/스레드를 분리 → 하나가 느려져도 다른 기능은 동작
- **Fallback**: 캐시된 값이나 기본값 반환

## 12.6 페이로드 최적화

- 압축: `gzip`, `br`(Brotli). 이미 압축된 파일(이미지, 동영상)은 재압축 불필요
- 필요한 필드만 응답 (Over-fetching 방지, GraphQL/필드 선택)
- 페이지네이션 (Offset보다 Cursor 기반이 대용량에 유리)
- 대용량 파일은 **Presigned URL**로 클라이언트가 스토리지(S3/MinIO)에 직접 업로드/다운로드 → 앱 서버 대역폭 절약
- 대용량 업로드: 멀티파트 업로드, 재개 가능한 업로드(tus)
- 다수의 작은 요청은 배치 API로 묶기 (N+1 요청 방지)

## 12.7 프론트엔드 관점의 네트워크 최적화

```html
<link rel="preconnect" href="https://api.example.com" crossorigin>
<link rel="dns-prefetch" href="https://cdn.example.com">
<link rel="preload" href="/fonts/main.woff2" as="font" type="font/woff2" crossorigin>
```

- `preconnect`: DNS+TCP+TLS를 미리 수행
- 요청 워터폴을 줄이기: 순차 요청 → 병렬 요청(`Promise.all`)
- 요청 중복 제거, 캐싱(React Query/SWR의 staleTime)
- 이미지 최적화(포맷, 크기, lazy loading)
