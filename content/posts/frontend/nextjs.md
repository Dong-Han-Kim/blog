---
# 📌 기본 메타데이터
title: 'React Hooks 완벽 가이드5'
date: '2025-10-05'
category: 'frontend'
tags: ['React', 'Hooks', 'useEffect', 'useState']
description: 'React Hooks의 개념과 실전 활용법을 정리했습니다.'
thumbnail: '/images/react-hooks-thumbnail.png'

# 💬 옵션 필드
draft: false # true면 아직 공개 안 함

# 📚 SEO용
keywords: ['React', 'Frontend', 'Hooks', 'useEffect']
---

React 16.8부터 도입된 **Hooks**는 함수형 컴포넌트에서도 상태 관리와 라이프사이클 제어를 가능하게 합니다.

---

## 🧠 1. Hooks란?

Hooks는 React 함수형 컴포넌트에 기능을 추가하기 위한 특별한 함수입니다.  
대표적인 Hook에는 다음과 같은 것들이 있습니다:

- `useState`
- `useEffect`
- `useContext`

예시 코드:

```tsx
import { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>Count: {count}</button>;
}
```
