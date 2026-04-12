---
# 📌 기본 메타데이터
title: 'JavaScript Proxy — 왜 필요한가?'
date: '2026-04-13'
category: 'til'
tags: ['JavaScript', 'Proxy', 'Reflect', 'Metaprogramming']
description: 'ES2015에서 도입된 Proxy가 해결하는 3가지 핵심 문제와 사용 판단 기준을 정리합니다.'

# 💬 옵션 필드
draft: false

# 📚 SEO용
keywords: ['JavaScript', 'Proxy', 'Reflect', 'Metaprogramming', 'ES2015', 'Vue 3']
---

# JavaScript Proxy — 왜 필요한가?

> ES2015에서 도입된 메타프로그래밍 기능. Vue 3의 반응형 시스템과 Immer 같은 라이브러리의 핵심 기반.

## 핵심 문제: 관심사가 섞인다

Proxy 없이 유효성 검사를 강제하려면, 값을 쓰는 **모든 곳**에 검사 코드를 반복해야 한다.

```js
// ❌ Proxy 없이 — 쓰는 곳마다 반복
function updateUser(user, age) {
  if (typeof age !== 'number') throw new Error('숫자만 가능');
  user.age = age;
}

function importUsers(users, ages) {
  ages.forEach((age, i) => {
    if (typeof age !== 'number') throw new Error('숫자만 가능'); // 또 반복
    users[i].age = age;
  });
}
```

```js
// ✅ Proxy — 객체 자체가 규칙을 가짐
const user = new Proxy({}, {
  set(target, key, value) {
    if (key === 'age' && typeof value !== 'number')
      throw new Error('숫자만 가능');
    return Reflect.set(target, key, value);
  }
});

user.age = '서른'; // 어디서 써도 자동으로 Error!
```

## Proxy가 해결하는 3가지 문제

### 1. 유효성 검사 중복 제거

검사 로직을 한 곳에만 두고, 사용하는 쪽은 신경 쓸 필요가 없어진다.

### 2. 변경 감지 가능

일반 객체는 언제 바뀌는지 알 방법이 없다. Vue 2가 `Object.defineProperty()`라는 제한적인 API를 쓴 이유도 이 때문이다.

```js
// ✅ Proxy — 변경을 자동으로 감지
const state = new Proxy({ count: 0 }, {
  set(target, key, value) {
    const result = Reflect.set(target, key, value);
    renderUI(); // 바뀔 때마다 자동 실행
    return result;
  }
});
```

### 3. 원본 객체를 건드리지 않고 기능 추가

외부 라이브러리 객체나 수정하면 안 되는 객체에도 기능을 덧붙일 수 있다.

```js
function withLogging(obj) {
  return new Proxy(obj, {
    get(target, key, receiver) {
      console.log(`[읽기] ${String(key)}`);
      return Reflect.get(target, key, receiver);
    }
  });
}

const trackedUser = withLogging(new User('한씨')); // 원본 클래스 수정 없음
```

## 핵심 요약

> **"객체를 사용하는 쪽"과 "객체를 보호/감시하는 로직"을 분리하는 것.**
> 이것이 Proxy의 존재 이유다. — 관심사의 분리(Separation of Concerns)

## Proxy 사용 판단 기준

| 상황 | 적합 여부 |
|---|---|
| 여러 곳에서 같은 유효성 검사 반복 | ✅ 적합 |
| 상태 변경을 감지해서 UI 업데이트 | ✅ 적합 |
| 외부 라이브러리 객체에 기능 추가 | ✅ 적합 |
| API 응답 객체를 읽기 전용으로 보호 | ✅ 적합 |
| 단순히 값 하나 검사하는 함수 | ❌ 과함 |
| 성능이 극도로 중요한 hot path | ❌ 주의 |
