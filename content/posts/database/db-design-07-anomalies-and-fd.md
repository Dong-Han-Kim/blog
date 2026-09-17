---
# 📌 기본 메타데이터
title: 'DB 설계 A to Z 7강 — 이상현상과 함수 종속성'
date: '2026-09-17'
category: 'database'
tags: ['Database', 'DB Design', 'Data Modeling', 'Normalization']
description: '삽입·갱신·삭제 이상현상의 원인, 함수 종속성의 정의와 종류, 암스트롱 공리와 유도 규칙, 속성 폐포로 후보키를 기계적으로 찾는 방법, 최소 커버까지 정규화의 도구를 준비한다.'

# 💬 옵션 필드
draft: false
series: 'DB 설계 A to Z'
seriesOrder: 7

# 📚 SEO용
keywords: ['DB 설계', '데이터베이스 설계', '데이터 모델링', '이상현상', '함수 종속성', 'FD', '암스트롱 공리', '속성 폐포', '최소 커버', '후보키']
---

# DB 설계 A to Z 7강 — 이상현상과 함수 종속성

[6강](/posts/db-design-06-er-to-relational)에서 만든 테이블이 좋은 구조인지 판단하는 도구를 봅니다.

## 1. 정규화되지 않은 테이블

| block_no | ship_no | ship_owner | process_code | process_name | plan_date |
|---|---|---|---|---|---|
| B101 | S2401 | A해운 | P10 | 취부 | 2026-03-01 |
| B101 | S2401 | A해운 | P20 | 용접 | 2026-03-05 |
| B102 | S2401 | A해운 | P10 | 취부 | 2026-03-02 |
| B201 | S2402 | B해운 | P10 | 취부 | 2026-04-01 |

## 2. 세 가지 이상현상

| 이상 | 현상 | 예시 |
|---|---|---|
| 삽입 이상 | 불필요한 데이터 없이는 삽입 불가 | 새 공정 "P30 도장"을 등록하려면 블록이 있어야 함 |
| 갱신 이상 | 같은 사실을 여러 행에서 고쳐야 함 | S2401 선주가 바뀌면 3행 수정, 일부 누락 시 불일치 |
| 삭제 이상 | 하나를 지우면 다른 사실도 사라짐 | B201을 지우면 "S2402의 선주는 B해운"이라는 사실이 소멸 |

원인은 하나입니다. **서로 다른 사실(선주, 공정명, 계획일)이 한 테이블에 섞여 있기 때문**입니다. 이를 형식적으로 분석하는 도구가 함수 종속성입니다.

## 3. 함수 종속성(FD)의 정의

> X → Y : X 값이 같은 두 행은 반드시 Y 값도 같다.
> "X가 Y를 결정한다", X를 **결정자**, Y를 **종속자**라 부른다.

위 테이블의 FD:
```
ship_no                  → ship_owner
block_no                 → ship_no
process_code             → process_name
{block_no, process_code} → plan_date
```

**주의:** FD는 **데이터 샘플에서 발견하는 것이 아니라 업무 규칙에서 도출**합니다. 샘플 4행만 보면 `plan_date → process_code`처럼 보이는 우연한 패턴이 있을 수 있지만, 업무상 성립하지 않으면 FD가 아닙니다.

## 4. FD의 종류

| 종류 | 정의 | 예시 |
|---|---|---|
| 자명한 FD | Y ⊆ X | `{block_no, ship_no}` → ship_no |
| 완전 함수 종속 | X의 어떤 진부분집합도 Y를 결정하지 못함 | `{block_no, process_code}` → plan_date |
| 부분 함수 종속 | X의 일부만으로 Y를 결정 | `{block_no, process_code}` → ship_no (block_no만으로 충분) |
| 이행적 종속 | X → Y, Y → Z 이고 Y ↛ X | block_no → ship_no → ship_owner |

부분 종속은 2NF 위반, 이행적 종속은 3NF 위반의 원인입니다 ([8강](/posts/db-design-08-normalization)).

## 5. 암스트롱 공리

FD 집합에서 새로운 FD를 추론하는 규칙입니다.

| 규칙 | 내용 |
|---|---|
| 반사 (Reflexivity) | Y ⊆ X 이면 X → Y |
| 증가 (Augmentation) | X → Y 이면 XZ → YZ |
| 이행 (Transitivity) | X → Y, Y → Z 이면 X → Z |

유도 규칙:

| 규칙 | 내용 |
|---|---|
| 합집합 (Union) | X → Y, X → Z 이면 X → YZ |
| 분해 (Decomposition) | X → YZ 이면 X → Y, X → Z |
| 의사이행 (Pseudotransitivity) | X → Y, WY → Z 이면 WX → Z |

## 6. 속성 폐포(Closure)로 키 찾기

X⁺ = X로부터 결정되는 모든 속성의 집합입니다. **X⁺가 전체 속성이면 X는 슈퍼키**입니다.

R(block_no, ship_no, ship_owner, process_code, process_name, plan_date) 에서 `{block_no, process_code}⁺` 계산:

| 단계 | 적용 FD | 폐포 |
|---|---|---|
| 시작 | — | `{block_no, process_code}` |
| 1 | block_no → ship_no | + ship_no |
| 2 | ship_no → ship_owner | + ship_owner |
| 3 | process_code → process_name | + process_name |
| 4 | `{block_no, process_code}` → plan_date | + plan_date |
| 결과 | | **전체 속성** → 슈퍼키 |

`{block_no}⁺` = `{block_no, ship_no, ship_owner}` → 전체가 아니므로 키가 아님
`{process_code}⁺` = `{process_code, process_name}` → 키가 아님

따라서 `{block_no, process_code}`는 최소성까지 만족하는 **후보키**입니다.

**키 찾기 팁:** 어떤 FD의 우변에도 나타나지 않는 속성은 **모든 후보키에 반드시 포함**됩니다. 여기서는 block_no, process_code가 그렇습니다.

## 7. 최소 커버(Canonical Cover)

FD 집합에서 중복을 제거한 동치 집합입니다.
1. 우변을 단일 속성으로 분해
2. 좌변의 불필요한 속성 제거 (부분 종속 발견)
3. 다른 FD로 유도 가능한 FD 제거

최소 커버는 [8강](/posts/db-design-08-normalization)의 **3NF 합성 알고리즘**의 입력이 됩니다.

## 7강 정리

1. 이상현상은 서로 다른 사실이 한 테이블에 섞여서 생긴다.
2. FD는 데이터 샘플이 아니라 업무 규칙에서 도출한다.
3. 부분 종속과 이행적 종속이 정규화의 대상이다.
4. 속성 폐포로 후보키를 기계적으로 찾을 수 있다.
