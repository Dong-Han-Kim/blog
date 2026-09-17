---
# 📌 기본 메타데이터
title: 'DB 설계 A to Z 12강 — 데이터 타입 설계'
date: '2026-09-17'
category: 'database'
tags: ['Database', 'DB Design', 'Data Type', 'PostgreSQL', 'MySQL']
description: '정수·실수·문자열·날짜 타입을 도메인에 맞게 고르는 원칙, 금액에 NUMERIC을 쓰는 이유, 문자 인코딩과 길이 단위, UTC 기준 시각 타입, 조인 컬럼의 타입·콜레이션 불일치가 인덱스를 무력화하는 지점을 DBMS별로 정리한다. 시리즈 Part 3 "물리 설계"의 첫 강이다.'

# 💬 옵션 필드
draft: false
series: 'DB 설계 A to Z'
seriesOrder: 12

# 📚 SEO용
keywords: ['DB 설계', '데이터베이스 설계', '데이터 타입', 'NUMERIC', 'VARCHAR', '타임존', 'UTC', '콜레이션', '물리 설계']
---

# DB 설계 A to Z 12강 — 데이터 타입 설계

여기서부터 Part 3 물리 설계입니다. 논리 설계로 정한 테이블을 실제 DBMS 위에 올릴 때 가장 먼저 내리는 결정이 컬럼의 타입입니다.

## 1. 타입 선택의 원칙

1. **도메인을 정확히 표현하는 가장 좁은 타입**을 고른다
2. 타입 자체가 제약조건 역할을 하게 한다 (날짜를 문자열로 저장하지 않는다)
3. 조인되는 컬럼끼리 **타입과 길이, 콜레이션을 일치**시킨다 (불일치 시 암묵적 변환으로 인덱스를 못 탈 수 있음)
4. 행 크기는 페이지당 행 수, 버퍼 캐시 적중률, 인덱스 크기로 이어진다

## 2. 정수

| 범위 | PostgreSQL | MySQL | Oracle | SQL Server |
|---|---|---|---|---|
| 1바이트 | — | TINYINT | NUMBER(3) | TINYINT (0~255) |
| 2바이트 | SMALLINT | SMALLINT | NUMBER(5) | SMALLINT |
| 4바이트 | INTEGER | INT | NUMBER(10) | INT |
| 8바이트 | BIGINT | BIGINT | NUMBER(19) | BIGINT |

- Oracle의 NUMBER는 가변 길이 십진 저장이므로 정밀도 지정이 **공간보다는 제약** 의미가 큽니다.
- MySQL의 `INT(11)` 같은 표시 폭은 8.0.17부터 deprecated이며 저장 범위와 무관합니다.
- **PK는 처음부터 BIGINT**를 권장합니다. INT(약 21억) 소진 후 타입 변경은 대형 테이블에서 매우 비쌉니다.

## 3. 실수와 금액

| 타입 | 저장 방식 | 용도 |
|---|---|---|
| REAL / FLOAT / DOUBLE | 이진 부동소수점 (근사값) | 과학 측정값, 좌표 |
| NUMERIC / DECIMAL | 십진 고정소수점 (정확값) | **금액**, 수량, 시수 |

```sql
SELECT 0.1::float8 + 0.2::float8 = 0.3::float8;    -- false
SELECT 0.1::numeric + 0.2::numeric = 0.3::numeric;  -- true
```
금액·중량·시수는 `NUMERIC(p, s)`를 사용하고, 스케일은 업무 규칙(소수 둘째 자리 반올림 등)에 맞춥니다.

## 4. 문자열

| 항목 | PostgreSQL | MySQL | Oracle | SQL Server |
|---|---|---|---|---|
| 가변 문자열 | VARCHAR(n), TEXT | VARCHAR(n) | VARCHAR2(n) | VARCHAR(n), NVARCHAR(n) |
| 길이 단위 | 문자 | 문자 | 기본 BYTE (`CHAR` 지정 가능) | VARCHAR: 바이트, NVARCHAR: 바이트 쌍 |
| 대용량 | TEXT | TEXT/LONGTEXT | CLOB | VARCHAR(MAX) |
| 빈 문자열 | NULL과 구분 | NULL과 구분 | **NULL로 취급** | NULL과 구분 |

주의 사항:
- **Oracle `VARCHAR2(10)`은 기본 10바이트**입니다. AL32UTF8에서 한글은 3바이트이므로 3글자만 들어갑니다. `VARCHAR2(10 CHAR)` 또는 `NLS_LENGTH_SEMANTICS=CHAR`를 사용합니다.
- **MySQL은 utf8mb4**를 사용합니다. `utf8`(utf8mb3)은 이모지 등 4바이트 문자를 저장하지 못합니다.
- MySQL InnoDB 인덱스 키는 기본 행 포맷(DYNAMIC)에서 최대 3072바이트입니다. utf8mb4는 문자당 최대 4바이트이므로 `VARCHAR(768)`은 768 × 4 = 3072바이트로 한계와 정확히 같아 아직 전체 인덱싱이 됩니다. `VARCHAR(769)`부터가 한계를 넘어 불가합니다.
- PostgreSQL에서 `VARCHAR(n)`과 `TEXT`는 성능 차이가 없습니다. 길이 제한은 업무 규칙이 있을 때만 두고, 필요하면 CHECK로 표현해도 됩니다.
- `CHAR(n)`은 공백 패딩과 비교 규칙이 까다로워 **고정 길이 코드**(국가코드 등) 외에는 피합니다.

## 5. 날짜와 시간

| 의미 | PostgreSQL | MySQL | Oracle | SQL Server |
|---|---|---|---|---|
| 날짜만 | DATE | DATE | (DATE에 시간 포함) | DATE |
| 시각, 시간대 없음 | TIMESTAMP | DATETIME | TIMESTAMP | DATETIME2 |
| 절대 시점 | TIMESTAMPTZ | TIMESTAMP (UTC 변환 저장) | TIMESTAMP WITH (LOCAL) TIME ZONE | DATETIMEOFFSET |

**핵심 구분: "벽시계 시각" vs "절대 시점"**
| 종류 | 예시 | 권장 |
|---|---|---|
| 절대 시점 | 로그 발생 시각, 결재 승인 시각 | TIMESTAMPTZ 계열 (UTC 기준 저장) |
| 벽시계 시각 | "현지 오전 9시 작업 시작" | 시간대 없는 타입 + 시간대 컬럼 별도 |
| 날짜 | 계획일, 생년월일 | DATE |

DBMS별 주의점:
- PostgreSQL `TIMESTAMPTZ`는 시간대를 저장하지 않고 **UTC로 변환해 저장**, 조회 시 세션 시간대로 표시합니다.
- MySQL `TIMESTAMP`는 **2038-01-19까지만** 표현 가능합니다. 장기 데이터는 DATETIME + UTC 규약을 권장합니다.
- Oracle `DATE`는 시분초를 포함하므로 `WHERE plan_date = DATE '2026-03-01'`이 시간이 있는 행을 놓칩니다. `TRUNC()` 또는 범위 조건을 사용합니다.

해외 조선소나 해외 선주와 데이터를 주고받는다면 **절대 시점은 UTC로 통일**하는 것이 이후의 혼란을 가장 크게 줄입니다.

## 6. 불리언과 코드값

| DBMS | 불리언 |
|---|---|
| PostgreSQL | BOOLEAN |
| MySQL | BOOLEAN (= TINYINT(1)) |
| Oracle | 23ai부터 BOOLEAN, 이전은 NUMBER(1)/CHAR(1) + CHECK |
| SQL Server | BIT |

**상태값**을 불리언 여러 개로 표현하지 않습니다.
```sql
-- 나쁜 예: is_started, is_finished, is_inspected → 모순 조합 가능 (started=false, finished=true)
-- 좋은 예
status VARCHAR(10) NOT NULL CHECK (status IN ('PLANNED','STARTED','FINISHED','INSPECTED'))
```

**코드값 구현 방식 비교**
| 방식 | 장점 | 단점 |
|---|---|---|
| CHECK 제약 | 단순, 빠름 | 값 추가 시 DDL |
| ENUM 타입 (PG, MySQL) | 공간 절약, 타입 안정성 | 값 삭제·순서 변경 어려움 |
| 코드 테이블 + FK | 값에 속성(이름, 정렬순서) 추가 가능, DML로 관리 | 조인 필요 |

값이 **업무 담당자에 의해 추가**된다면 코드 테이블, 값이 **코드 로직과 1:1로 묶여** 있다면 CHECK가 적합합니다.

## 7. 기타 타입

| 용도 | 권장 |
|---|---|
| UUID | PostgreSQL `UUID`(16바이트), MySQL `BINARY(16)`, SQL Server `UNIQUEIDENTIFIER`, Oracle `RAW(16)` |
| IP 주소 | PostgreSQL `INET`, 그 외 VARBINARY(16) |
| 대용량 파일 | DB 밖(오브젝트 스토리지) + 경로·해시·크기 메타데이터만 저장 |
| 반정형 | PostgreSQL `JSONB`, MySQL `JSON` ([19강](/posts/db-design-19-flexible-structures)) |

## 12강 정리

1. 금액·수량은 NUMERIC, 절대 시점은 UTC 기준 타입을 쓴다.
2. Oracle VARCHAR2의 바이트 단위, 빈 문자열=NULL, DATE의 시간 포함에 주의한다.
3. MySQL은 utf8mb4, PK는 처음부터 BIGINT.
4. 상태는 불리언 조합이 아니라 단일 상태 컬럼으로 표현한다.
5. 조인 컬럼은 타입·길이·콜레이션을 일치시킨다.
