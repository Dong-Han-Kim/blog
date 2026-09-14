---
# 📌 기본 메타데이터
title: 'React Lane 내부 구현 — 비트마스크로 우선순위를 관리하는 법 (번외편)'
date: '2026-04-05'
category: 'frontend'
tags: ['React', 'Lane', 'Bitmask', 'Scheduler', 'Internals']
description: 'React가 업데이트 우선순위를 31비트 정수 하나로 관리하는 방법과, 그 설계가 선택된 이유를 살펴봅니다.'

# 💬 옵션 필드
draft: false
series: 'React 렌더링 Deep Dive'
seriesOrder: 4

# 📚 SEO용
keywords: ['React', 'Lane', 'Bitmask', 'Scheduler', 'Internals', 'React 렌더링']
---

# React Lane 내부 구현 — 비트마스크로 우선순위를 관리하는 법 (번외편)

[2편](/posts/react-fiber-architecture)에서 Lane이라는 우선순위 체계를 소개했다. 이번 번외편에서는 Lane이 소스 코드 레벨에서 실제로 어떻게 구현되어 있는지 들여다본다.

## Lane은 31비트 정수다

React 소스 코드를 열어보면 Lane은 이렇게 정의되어 있다.

```js
const SyncLane =                0b0000000000000000000000000000010;
const InputContinuousLane =     0b0000000000000000000000010000000;
const DefaultLane =             0b0000000000000000000010000000000;
const TransitionLane1 =         0b0000000000000010000000000000000;
const TransitionLane2 =         0b0000000000000100000000000000000;
// ... 총 31개 비트
const IdleLane =                0b0100000000000000000000000000000;
```

각 Lane은 **31비트 정수에서 비트 하나**다. 오른쪽(낮은 비트)일수록 우선순위가 높다. 클릭 같은 동기 업데이트는 `SyncLane`, `startTransition`으로 감싼 업데이트는 `TransitionLane` 중 하나에 배정된다.

## 왜 하필 비트마스크인가

우선순위 관리라면 배열이나 우선순위 큐를 떠올리기 쉽다. 하지만 비트마스크를 쓰면 핵심 연산이 전부 **CPU 명령어 몇 개 수준의 비트 연산**이 된다.

```js
// 여러 업데이트가 대기 중 — Lane 합치기 (OR)
pendingLanes = SyncLane | TransitionLane1 | DefaultLane;
// → 하나의 정수에 "대기 중인 모든 작업"이 담긴다

// 가장 급한 Lane 찾기 — 최하위 비트 추출
function getHighestPriorityLane(lanes) {
  return lanes & -lanes;   // 이 한 줄이 끝
}

// 특정 Lane이 포함되어 있는가? (AND)
(pendingLanes & SyncLane) !== 0

// 작업이 완료된 Lane 제거
pendingLanes &= ~SyncLane;
```

### `lanes & -lanes`의 원리

마법처럼 보이는 이 한 줄은 2의 보수 표현의 성질이다. `-lanes`는 `~lanes + 1`이므로, 원래 값과 AND를 하면 **가장 오른쪽에 켜진 비트 하나만 남는다**.

```
lanes  = 0b0010100  (TransitionLane과 DefaultLane이 대기 중)
-lanes = 0b1101100
AND    = 0b0000100  → 더 급한 DefaultLane만 추출
```

"대기 중인 작업 중 가장 급한 것"을 찾는 데 반복문도 정렬도 필요 없다. 렌더링마다 수없이 호출되는 연산이므로 이 선택이 성능에 직결된다. Linux 커널 스케줄러나 체스 엔진의 비트보드와 같은 계열의 고전적인 최적화 기법이다.

## Lane이 여러 개인 이유 — 독립 추적과 배칭

눈여겨볼 점은 `TransitionLane`이 1개가 아니라 여러 개라는 것이다.

- 서로 다른 transition들이 각자 다른 Lane을 받아 **독립적으로 추적**될 수 있다
- 반대로 같은 Lane에 배정된 업데이트들은 **한 번의 렌더링으로 배칭**된다

Lane 이전의 모델은 `ExpirationTime`(만료 시간 기반의 단일 숫자)이었다. 단일 숫자로는 "우선순위는 낮지만 먼저 들어온 작업"과 "우선순위 높은 나중 작업"을 분리해 표현할 수 없었고, 그래서 Lane 모델로 전면 교체됐다. 비트마스크는 **"어떤 작업들의 집합"을 정수 하나로 표현**할 수 있기 때문이다.

## 기아(Starvation) 방지

저속 차선의 작업이 급한 작업들에 계속 밀려 영원히 실행되지 못하면 안 된다. React는 각 Lane에 만료 시간을 두고, 너무 오래 밀린 Lane은 **강제로 동기 처리로 승격**시킨다. 우선순위 스케줄링을 도입한 시스템이라면 반드시 함께 설계해야 하는 안전장치다.

## 정리

| 질문 | 답 |
|------|-----|
| Lane의 정체 | 31비트 정수의 비트 하나. 낮은 비트일수록 높은 우선순위 |
| 왜 비트마스크인가 | 합집합·포함 검사·최고 우선순위 추출이 전부 O(1) 비트 연산 |
| 왜 Lane이 여러 개인가 | 작업의 "집합"을 표현 — 독립 추적과 배칭을 동시에 |
| 기아 방지 | 오래 밀린 Lane은 동기 처리로 강제 승격 |
