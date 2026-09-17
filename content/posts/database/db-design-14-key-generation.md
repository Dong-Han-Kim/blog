---
# 📌 기본 메타데이터
title: 'DB 설계 A to Z 14강 — 키 생성 전략'
date: '2026-09-17'
category: 'database'
tags: ['Database', 'DB Design', 'Primary Key', 'UUID']
description: '시퀀스·IDENTITY·UUIDv4·UUIDv7·Snowflake를 정렬성, 크기, 분산 생성, 추측 가능성으로 비교한다. 번호에 구멍이 생기는 것이 정상인 이유와 내부 PK·외부 ID·업무 번호를 분리하는 설계를 다룬다.'

# 💬 옵션 필드
draft: false
series: 'DB 설계 A to Z'
seriesOrder: 14

# 📚 SEO용
keywords: ['DB 설계', '데이터베이스 설계', '대리키', '시퀀스', 'IDENTITY', 'UUIDv4', 'UUIDv7', 'Snowflake', '외부 ID']
---

# DB 설계 A to Z 14강 — 키 생성 전략

제약조건으로 유일성을 선언했다면, 그 키 값을 실제로 무엇으로 채울지가 남습니다.

## 1. 대리키 생성 방식

| 방식 | 생성 위치 | 정렬성 | 크기 | 분산 생성 | 추측 가능성 |
|---|---|---|---|---|---|
| 시퀀스 / IDENTITY / AUTO_INCREMENT | DB | 단조 증가 | 8B | 어려움 | 높음 |
| UUIDv4 | 어디서나 | 무작위 | 16B | 쉬움 | 낮음 |
| UUIDv7 | 어디서나 | 시간순 | 16B | 쉬움 | 낮음 (시각은 노출) |
| ULID | 어디서나 | 시간순 | 16B (문자열 26자) | 쉬움 | 낮음 |
| Snowflake | 앱 (노드 ID 필요) | 시간순 | 8B | 쉬움 (노드 ID 관리) | 중간 |

## 2. 시퀀스 계열

```sql
-- PostgreSQL 10+ / Oracle 12c+ / SQL Server (IDENTITY)
CREATE TABLE block (
    block_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ...
);

-- MySQL
CREATE TABLE block (
    block_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    ...
);
```
특성:
- **번호에 구멍이 생기는 것은 정상**입니다. 롤백되거나 캐시된 시퀀스 값은 재사용되지 않습니다. "빈 번호 없는 전표 번호"가 업무 요구라면 대리키와 별개의 채번 테이블로 설계해야 합니다.
- PostgreSQL에서는 `SERIAL`보다 `IDENTITY`가 표준이고 권한 관리가 명확합니다.
- `GENERATED ALWAYS`는 수동 값 입력을 막아 시퀀스와 실제 값의 불일치를 예방합니다.
- 외부에 노출되면 **총 건수와 생성 속도가 추측**되고, ID 증가로 다른 리소스 접근을 시도하는 공격(IDOR)의 단서가 됩니다.

## 3. UUIDv4의 문제

InnoDB는 PK 순서로 데이터를 저장합니다(클러스터드 인덱스). 무작위 UUID는:
- 삽입 위치가 무작위 → **페이지 분할** 빈발, 페이지 채움률 저하
- 최근 삽입 데이터가 인덱스 전체에 흩어짐 → **버퍼 풀 캐시 적중률 저하**
- 모든 세컨더리 인덱스에 16바이트 PK 포함

PostgreSQL은 힙 테이블이라 데이터 자체는 영향을 덜 받지만, **PK B-Tree 인덱스**는 동일한 문제를 겪고 WAL의 full page write도 늘어납니다.

## 4. UUIDv7

RFC 9562(2024)에서 표준화된 형식으로, 앞 48비트가 Unix 밀리초 타임스탬프입니다.

```
0192f3a1-7c2e-7xxx-yxxx-xxxxxxxxxxxx
└──── 시간 ────┘ └ 버전 7
```
- 시간순 정렬 → B-Tree 우측 삽입, 시퀀스와 비슷한 삽입 특성
- 분산 환경에서 조정 없이 생성
- **생성 시각이 노출**된다는 점은 감안해야 합니다
- PostgreSQL 18부터 `uuidv7()` 함수 기본 제공, 이전 버전은 애플리케이션 라이브러리나 확장으로 생성

**저장 형식**
```sql
-- PostgreSQL
id UUID PRIMARY KEY

-- MySQL: 문자열(CHAR(36))로 저장하지 않는다 → 36바이트 이상 + 콜레이션 비교
id BINARY(16) PRIMARY KEY
-- 입력: UUID_TO_BIN('...')   조회: BIN_TO_UUID(id)
```
MySQL의 `UUID()` 함수는 v1을 생성하며, `UUID_TO_BIN(uuid, 1)`은 **v1의 시간 필드를 재배치**해 정렬성을 높이는 옵션입니다. v7은 이미 정렬되어 있으므로 스왑 없이 저장합니다.

## 5. Snowflake

```
| 1bit 부호 | 41bit 타임스탬프 | 10bit 노드 ID | 12bit 시퀀스 |
```
- BIGINT에 들어가므로 UUID보다 작습니다.
- 노드 ID 중복 할당 방지, **시계 역행(NTP 보정)** 처리가 필요합니다.
- JavaScript의 Number는 2⁵³까지만 정확하므로 **API에서는 문자열로 직렬화**해야 합니다.

## 6. 내부 키와 외부 키 분리

```sql
CREATE TABLE work_order (
    work_order_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- 내부 조인용
    public_id     UUID NOT NULL UNIQUE,                              -- API·URL 노출용
    order_no      VARCHAR(20) NOT NULL UNIQUE,                       -- 업무 번호 (WO-2026-000123)
    ...
);
```
세 종류의 식별자는 목적이 다릅니다.
| 식별자 | 목적 | 요구사항 |
|---|---|---|
| 내부 PK | 조인, FK | 작고 빠름 |
| 외부 ID | API, URL | 추측 불가, 불변 |
| 업무 번호 | 사람이 읽고 말함 | 규칙적, 체계 변경 가능 |

## 7. 선택 가이드

| 상황 | 권장 |
|---|---|
| 단일 DB, 내부 시스템 | IDENTITY/시퀀스 |
| 외부 노출 ID 필요 | 내부 IDENTITY + 외부 UUID |
| 여러 노드·서비스에서 생성, 오프라인 생성 | UUIDv7 |
| 분산 생성 + 8바이트 필요 | Snowflake |
| 데이터 병합 (여러 사업장 DB 통합) | UUIDv7 (시퀀스 충돌 없음) |

## 14강 정리

1. 시퀀스 번호의 구멍은 정상이며, 연속 번호가 필요하면 별도 채번을 설계한다.
2. 무작위 UUIDv4는 클러스터드 인덱스와 PK 인덱스에 불리하다.
3. UUIDv7은 분산 생성과 삽입 효율을 함께 얻지만 생성 시각이 노출된다.
4. 내부 PK, 외부 ID, 업무 번호는 목적이 다르므로 분리할 수 있다.
