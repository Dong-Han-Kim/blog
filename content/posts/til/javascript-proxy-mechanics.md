---
# 📌 기본 메타데이터
title: 'JavaScript Proxy — target, handler, trap 동작 원리'
date: '2026-04-13'
category: 'til'
tags: ['JavaScript', 'Proxy', 'Reflect', 'Metaprogramming']
description: 'Proxy의 3요소인 target, handler, trap의 동작 원리와 receiver, Proxy.revocable()까지 정리합니다.'

# 💬 옵션 필드
draft: false

# 📚 SEO용
keywords: ['JavaScript', 'Proxy', 'Reflect', 'Metaprogramming', 'ES2015', 'Vue 3']
---

# JavaScript Proxy — target, handler, trap 동작 원리

## 기본 문법

```js
const proxy = new Proxy(target, handler);
// target  : 가로챌 원본 객체
// handler : trap(가로채기 함수)을 담은 객체
```

## target — "감싸질 원본"

Proxy는 target을 **복사하지 않는다**. 같은 객체를 참조하기 때문에 proxy를 통해 수정하면 원본도 바뀐다.

```js
const user = { name: '한씨' };
const proxy = new Proxy(user, {});

proxy.name = '이씨';
console.log(user.name); // → '이씨' ← 원본도 바뀜
```

target이 될 수 있는 타입은 다양하다.

```js
new Proxy([], handler);              // 배열
new Proxy(function() {}, handler);   // 함수
new Proxy(new Map(), handler);       // Map 인스턴스
new Proxy(otherProxy, handler);      // 다른 Proxy (체이닝)
```

## handler — "trap을 담는 컨테이너"

handler는 그냥 **평범한 객체**다. handler에 trap이 없으면 해당 동작은 target으로 그대로 위임된다.

```js
const proxy = new Proxy(user, {}); // 완전 투명, 아무것도 안 가로챔
```

handler는 동적으로 수정할 수 있다.

```js
const handler = {};
const proxy = new Proxy(target, handler);

// 나중에 trap 추가
handler.set = (target, key, value) => {
  console.log(`[감지] ${key} = ${value}`);
  return Reflect.set(target, key, value);
};

// trap 제거 → 동작이 target으로 바로 위임
delete handler.set;
```

## trap 함수 인자 정리

```js
const handler = {
  // 읽기
  get(target, key, receiver) {},

  // 쓰기 — 반드시 true 반환
  set(target, key, value, receiver) {
    return true;
  },

  // in 연산자
  has(target, key) {},

  // 함수 호출 (target이 함수일 때만)
  apply(target, thisArg, argumentsList) {},

  // delete 연산자
  deleteProperty(target, key) {},

  // Object.keys() 등
  ownKeys(target) {},
};
```

> **주의:** `set` trap은 성공 시 반드시 `true`를 반환해야 한다. 반환하지 않으면 strict mode에서 `TypeError`가 발생한다.

## receiver가 왜 필요한가

`target[key]`로 직접 접근하면 상속 구조에서 `this` 바인딩 버그가 생긴다.

```js
const parent = {
  get fullInfo() {
    return `${this.name} / ${this.role}`; // this가 누구냐가 중요
  }
};

// ❌ receiver 없이
const bad = new Proxy(parent, {
  get(target, key) {
    return target[key]; // this = parent → child 속성 못 읽음
  }
});

// ✅ Reflect + receiver
const good = new Proxy(parent, {
  get(target, key, receiver) {
    return Reflect.get(target, key, receiver);
    // receiver(=child)를 this로 올바르게 전달
  }
});
```

## Proxy.revocable() — 취소 가능한 Proxy

일반 `new Proxy()`는 영구적이다. `Proxy.revocable()`을 쓰면 나중에 프록시를 무효화할 수 있다.

```js
const { proxy, revoke } = Proxy.revocable(target, handler);

proxy.name; // 정상 동작

revoke(); // 프록시 폐기

proxy.name; // TypeError: Cannot perform 'get' on a revoked proxy
```

세션 만료나 권한 해제 시 객체 접근을 완전히 차단하는 패턴에 활용한다.
