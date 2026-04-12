---
# 📌 기본 메타데이터
title: 'JavaScript Proxy — Reflect와 실무 패턴 4가지'
date: '2026-04-13'
category: 'til'
tags: ['JavaScript', 'Proxy', 'Reflect', 'Metaprogramming']
description: 'Proxy의 단짝 Reflect의 역할과, 유효성 검사·읽기 전용·변경 감지·기본값 제공 실무 패턴을 정리합니다.'

# 💬 옵션 필드
draft: false

# 📚 SEO용
keywords: ['JavaScript', 'Proxy', 'Reflect', 'Metaprogramming', 'ES2015', 'Vue 3']
---

# JavaScript Proxy — Reflect와 실무 패턴 4가지

## Reflect — Proxy의 단짝

Proxy trap 안에서 원본 동작을 수행할 때 `target[key]` 직접 접근 대신 **Reflect**를 쓰는 게 권장 패턴이다. Reflect는 Proxy trap과 1:1 대응하는 메서드를 제공한다.

```text
trap 호출 → 커스텀 로직 → Reflect.method() → 원본 동작 수행
```

```js
// ❌ 직접 접근 방식 (prototype chain 문제 발생 가능)
get(target, key) {
  return target[key]; // this 바인딩이 틀릴 수 있음
}

// ✅ Reflect 방식 (권장)
get(target, key, receiver) {
  console.log(`읽기: ${String(key)}`);
  return Reflect.get(target, key, receiver);
}
```

## 실전: Observable 객체 (Vue 3 반응형 원리)

```js
function observable(obj, onChange) {
  return new Proxy(obj, {
    set(target, key, value, receiver) {
      const result = Reflect.set(target, key, value, receiver);
      if (result) onChange({ key, value });
      return result;
    }
  });
}

const state = observable({ count: 0 }, (change) => {
  renderUI(change); // Vue 3의 reactive()가 이 방식으로 동작
});
```

## 실무 패턴 1 — 유효성 검사

객체 자체에 유효성 규칙을 내장한다.

```js
function createValidated(obj, rules) {
  return new Proxy(obj, {
    set(target, key, value) {
      if (rules[key] && !rules[key].test?.(value)) {
        throw new Error(`${key} 유효성 실패`);
      }
      target[key] = value;
      return true;
    }
  });
}

const user = createValidated({}, {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  age:   { test: v => v >= 0 && v <= 120 }
});

user.email = 'han@example.com'; // OK
user.email = 'invalid';         // Error!
```

## 실무 패턴 2 — 읽기 전용 보호

설정 객체나 상수를 실수로 수정하는 것을 방지한다.

```js
function readonly(obj) {
  return new Proxy(obj, {
    set() {
      throw new Error('읽기 전용 객체입니다');
    },
    deleteProperty() {
      throw new Error('삭제 불가합니다');
    }
  });
}

const CONFIG = readonly({
  API_URL: 'https://api.example.com',
  TIMEOUT: 5000
});

CONFIG.API_URL = '...'; // Error! 보호됨
```

## 실무 패턴 3 — 변경 감지 / 로깅

상태가 언제, 어떻게 바뀌는지 추적한다.

```js
function withLogging(obj, label) {
  return new Proxy(obj, {
    set(target, key, value) {
      const old = target[key];
      target[key] = value;
      console.log(`[${label}] ${key}: ${old} → ${value}`);
      return true;
    }
  });
}

const kpiState = withLogging(
  { planValue: 100, actualValue: 80 },
  'KPI'
);
kpiState.actualValue = 95;
// → [KPI] actualValue: 80 → 95
```

## 실무 패턴 4 — 기본값 제공

존재하지 않는 키 접근 시 `undefined` 대신 기본값을 반환한다.

```js
function withDefault(obj, defaultVal) {
  return new Proxy(obj, {
    get(target, key) {
      return key in target
        ? target[key]
        : defaultVal;
    }
  });
}

const scores = withDefault({}, 0);
scores['공정A'] = 87;
scores['공정A']; // → 87
scores['공정B']; // → 0 (기본값)
```
