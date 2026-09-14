---
# 📌 기본 메타데이터
title: '프론트엔드 디자인 패턴 (3) — Headless 컴포넌트: 제어권을 설계한다'
date: '2026-09-14'
category: 'frontend'
tags: ['React', 'Component Design', 'Headless', 'Compound Component', 'API Design']
description: 'prop 15개짜리 드롭다운을 Compound Component → Control Props → State Reducer → Headless로 단계적으로 리팩터링하며 제어권 스펙트럼을 직접 만들어 본다.'

# 💬 옵션 필드
draft: false
series: '프론트엔드 디자인 패턴'
seriesOrder: 3

# 📚 SEO용
keywords: ['React', 'Component Design', 'Headless', 'Compound Component', 'API Design', '프론트엔드 디자인 패턴']
---

# 프론트엔드 디자인 패턴 (3) — Headless 컴포넌트

2편은 "로직을 어떻게 재사용하는가"였습니다. 이번 편은 직교하는 축입니다.

> **그 로직을 남에게 쓰라고 내놓을 때, 컴포넌트는 얼마나 많은 결정을 스스로 하고 얼마나 많은 결정을 사용자에게 넘겨야 하는가?**

드롭다운 하나를 가지고 다섯 단계로 리팩터링합니다. 각 단계에서 **무엇이 아파서 다음으로 갔는지**가 전부입니다.

---

## 0단계 — 모든 경우를 예측하려는 컴포넌트

사내 디자인 시스템에서 흔히 보는 출발점입니다.

```tsx
<Select
  options={options}
  value={value}
  onChange={setValue}
  placeholder="선택하세요"
  label="담당자"
  labelPosition="top"
  size="md"
  variant="outlined"
  disabled={false}
  loading={false}
  error="필수 항목입니다"
  helperText="팀 내에서만 검색됩니다"
  searchable
  clearable
  multiple={false}
  maxHeight={300}
  renderOption={(o) => <Avatar user={o} />}
  emptyMessage="결과 없음"
  closeOnSelect
  showCheckmark
  groupBy="team"
  // ... 그리고 다음 스프린트에 3개가 더 붙는다
/>
```

이게 왜 문제인가? 각각은 다 합리적인 요구에서 나왔습니다. 문제는 **구조**입니다.

**1) prop 수가 요구사항 수에 비례해 무한히 증가합니다.** "옵션 위에 구분선 넣어주세요" → `dividerAfter?: string[]`. "검색창 옆에 버튼" → `searchSuffix?: ReactNode`. 컴포넌트 하나가 조직의 모든 디자인 요구를 흡수하는 스펀지가 됩니다.

**2) 조합 폭발이 타입에 드러나지 않습니다.** `multiple`이면 `value`는 배열이어야 하고, `searchable`이 아니면 `emptyMessage`는 의미가 없습니다. 이 관계는 문서에만 있고 컴파일러는 모릅니다.

**3) 내부 동작을 바꿀 수 없습니다.** "다중 선택일 땐 선택해도 안 닫혔으면 좋겠다"는 요구가 오면? `closeOnSelect`를 추가합니다. "그런데 세 개 이상 고르면 닫혀야 해요"는? `closeAfterCount`를 추가할까요?

> **진단:** 이 설계는 **모든 사용 사례를 컴포넌트 작성자가 미리 알고 있어야** 성립합니다. 그건 불가능합니다.

---

## 1단계 — 배치의 자유: Compound Component

첫 번째 해법은 **prop으로 받던 것을 children으로 받는 것**입니다.

```tsx
<Select value={value} onChange={setValue}>
  <Select.Label>담당자</Select.Label>
  <Select.Trigger>
    <Select.Value placeholder="선택하세요" />
    <ChevronIcon />
  </Select.Trigger>
  <Select.Content>
    <Select.Search />
    <Select.Group label="개발팀">
      <Select.Option value="han"><Avatar user={han} /> 김동한</Select.Option>
    </Select.Group>
    <Select.Empty>결과 없음</Select.Empty>
  </Select.Content>
</Select>
```

`labelPosition`, `renderOption`, `emptyMessage`, `groupBy`, `searchSuffix`가 전부 사라졌습니다. **배치를 prop으로 설명하는 대신 JSX로 직접 쓰기 때문입니다.**

### 구현 — Context가 심장

```tsx
type SelectContextValue = {
  value: string | null;
  setValue: (v: string) => void;
  isOpen: boolean;
  setOpen: (o: boolean) => void;
  triggerId: string;
  listboxId: string;
};

const SelectContext = React.createContext<SelectContextValue | null>(null);

function useSelectContext(component: string) {
  const ctx = React.useContext(SelectContext);
  if (!ctx) {
    throw new Error(`<${component}>은 <Select> 안에서만 사용할 수 있습니다.`);
  }
  return ctx;
}

function Select({ value, onChange, children }: SelectProps) {
  const [isOpen, setOpen] = React.useState(false);
  const id = React.useId();

  const ctx = React.useMemo<SelectContextValue>(() => ({
    value,
    setValue: onChange,
    isOpen,
    setOpen,
    triggerId: `${id}-trigger`,
    listboxId: `${id}-listbox`,
  }), [value, onChange, isOpen, id]);

  return <SelectContext.Provider value={ctx}>{children}</SelectContext.Provider>;
}

Select.Option = function Option({ value, children }: OptionProps) {
  const { value: selected, setValue, setOpen } = useSelectContext('Select.Option');
  return (
    <div
      role="option"
      aria-selected={selected === value}
      onClick={() => { setValue(value); setOpen(false); }}
    >
      {children}
    </div>
  );
};
```

### 이 단계에서 반드시 지킬 것

**1) Context 부재를 명시적 에러로 잡으세요.** 위의 `useSelectContext`가 하는 일입니다. Compound Component의 최대 약점은 **"계약이 타입으로 표현되지 않는다"** 는 것입니다. `<Select.Option>`을 `<Select>` 밖에 써도 컴파일은 통과합니다. 런타임 에러라도 친절해야 합니다.

**2) `children`을 순회해서 검사하지 마세요.**

```tsx
// 안티패턴
React.Children.map(children, child => {
  if (child.type !== Select.Option) throw new Error('...');
  return React.cloneElement(child, { selected: ... });
});
```

이렇게 하면 `<Select.Option>`을 `<div>`로 한 겹만 감싸도 깨집니다. Compound Component의 통신은 **반드시 Context로** 해야 합니다. 그래야 중간에 무엇이 끼어도 동작합니다.

**3) `useMemo`로 Context 값을 고정하세요.** 안 하면 `Select`가 렌더될 때마다 모든 소비자가 리렌더됩니다.

### 남은 문제

배치는 자유로워졌지만 **동작은 여전히 고정**입니다. `Select.Option`의 `onClick`에 `setOpen(false)`가 하드코딩되어 있습니다. "다중 선택일 땐 안 닫히게"를 하려면 여전히 prop이 필요합니다.

---

## 2단계 — 상태를 밖으로: Control Props

`<Select value onChange>` 는 이미 제어(controlled) 컴포넌트입니다. 그런데 실무에서는 **간단한 경우엔 상태를 컴포넌트가 알아서 들고 있어 주길** 바랍니다. HTML이 정확히 그렇게 되어 있죠.

```tsx
<input value={v} onChange={f} />       {/* 제어 */}
<input defaultValue="hello" />         {/* 비제어 */}
```

이 둘을 동시에 지원하는 훅을 직접 만들어 봅시다. 실무에서 가장 자주 재사용하게 되는 조각입니다.

```typescript
type UseControllableStateParams<T> = {
  prop?: T;                       // 제어 값 (있으면 제어 모드)
  defaultProp?: T;                // 비제어 초기값
  onChange?: (value: T) => void;
};

function useControllableState<T>({
  prop,
  defaultProp,
  onChange,
}: UseControllableStateParams<T>) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultProp);
  const isControlled = prop !== undefined;
  const value = (isControlled ? prop : uncontrolledValue) as T;

  // onChange가 매 렌더 새 함수여도 setValue의 참조가 흔들리지 않도록 ref에 보관
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => { onChangeRef.current = onChange; });

  const setValue = React.useCallback((next: React.SetStateAction<T>) => {
    if (isControlled) {
      const resolved = typeof next === 'function'
        ? (next as (prev: T) => T)(prop as T)
        : next;
      if (resolved !== prop) onChangeRef.current?.(resolved);
    } else {
      setUncontrolledValue(prev => {
        const resolved = typeof next === 'function'
          ? (next as (prev: T) => T)(prev as T)
          : next;
        if (resolved !== prev) onChangeRef.current?.(resolved);
        return resolved;
      });
    }
  }, [isControlled, prop]);

  return [value, setValue] as const;
}
```

**여기서 짚을 세 가지:**

**1) `prop !== undefined` 가 모드를 결정합니다.** `null`은 "제어 중이고 값이 없음"이므로 제어로 쳐야 합니다. 그래서 `!= null`이 아니라 `!== undefined` 입니다.

**2) 제어 모드에서는 내부 상태를 건드리지 않습니다.** 부모에게 알리고 끝입니다. 부모가 `value`를 안 바꾸면 아무 일도 일어나지 않아야 합니다 — 이게 제어 컴포넌트의 계약입니다. `<input value="fixed" onChange={() => {}} />` 가 타이핑을 거부하는 것과 같은 이치입니다.

**3) `onChange`를 ref에 보관하는 이유는 2편의 클로저 함정입니다.** 의존성에 `onChange`를 넣으면 부모가 인라인 함수를 쓸 때마다 `setValue`의 참조가 바뀌고, 이게 자식의 `useEffect`로 전파됩니다.

### 적용

```tsx
function Select({ value, defaultValue, onChange, open, defaultOpen, onOpenChange, children }) {
  const [selected, setSelected] = useControllableState({
    prop: value, defaultProp: defaultValue, onChange,
  });
  const [isOpen, setOpen] = useControllableState({
    prop: open, defaultProp: defaultOpen ?? false, onChange: onOpenChange,
  });
  // ...
}
```

이제 **두 상태 모두 제어/비제어를 선택할 수 있습니다.** 간단한 경우엔 `<Select defaultValue="han" />`, 복잡한 경우엔 `open`까지 직접 관리.

**개발 환경 경고도 넣어주면 좋습니다.**

```typescript
if (process.env.NODE_ENV !== 'production') {
  const wasControlled = React.useRef(isControlled);
  React.useEffect(() => {
    if (wasControlled.current !== isControlled) {
      console.error('Select가 제어/비제어 모드를 도중에 바꿨습니다. value를 undefined로 만들지 마세요.');
    }
    wasControlled.current = isControlled;
  }, [isControlled]);
}
```

### 남은 문제

상태의 **소유권**은 넘겼지만 **전이 규칙**은 여전히 안에 있습니다. "언제 닫히는가"는 컴포넌트가 정합니다. `open`을 제어하면 직접 관리할 수 있지만, 그러면 키보드 내비게이션, 외부 클릭, ESC 처리까지 전부 사용자가 다시 짜야 합니다. **전부 아니면 전무**입니다.

---

## 3단계 — 전이 규칙을 넘긴다: State Reducer

Kent C. Dodds가 Downshift에서 대중화한 패턴입니다. 발상은 이렇습니다.

> 컴포넌트가 **"이 이벤트에 대해 다음 상태는 이겁니다"라고 제안**하고, 사용자가 그 제안을 가로채 수정한다.

```typescript
type SelectState = {
  isOpen: boolean;
  selected: string | null;
  highlightedIndex: number;
};

type SelectActionType =
  | 'TriggerClick'
  | 'OptionClick'
  | 'KeyDownArrowDown'
  | 'KeyDownArrowUp'
  | 'KeyDownEnter'
  | 'KeyDownEscape'
  | 'ClickOutside';

type SelectAction =
  | { type: 'OptionClick'; value: string }
  | { type: Exclude<SelectActionType, 'OptionClick'> };

// 컴포넌트의 기본 전이 규칙
function defaultReducer(state: SelectState, action: SelectAction): SelectState {
  switch (action.type) {
    case 'TriggerClick':
      return { ...state, isOpen: !state.isOpen };
    case 'OptionClick':
      return { ...state, selected: action.value, isOpen: false };
    case 'KeyDownArrowDown':
      return { ...state, isOpen: true, highlightedIndex: state.highlightedIndex + 1 };
    case 'KeyDownEscape':
    case 'ClickOutside':
      return { ...state, isOpen: false };
    default:
      return state;
  }
}
```

그리고 사용자가 가로챌 지점을 엽니다.

```typescript
type StateReducer = (
  state: SelectState,
  payload: { action: SelectAction; changes: SelectState }
) => SelectState;

function useSelect({ stateReducer, ...options }: UseSelectOptions) {
  const reducer = React.useCallback(
    (state: SelectState, action: SelectAction) => {
      const changes = defaultReducer(state, action);       // 컴포넌트의 제안
      return stateReducer ? stateReducer(state, { action, changes }) : changes;
    },
    [stateReducer]
  );

  const [state, dispatch] = React.useReducer(reducer, initialState);
  // ...
}
```

### 이게 왜 강력한가

앞서 나온 모든 요구를 **prop 추가 없이** 처리할 수 있습니다.

```typescript
// 요구 1: 다중 선택이라 선택해도 닫히지 않게
useSelect({
  stateReducer: (state, { action, changes }) =>
    action.type === 'OptionClick' ? { ...changes, isOpen: true } : changes,
});

// 요구 2: 단 세 개 이상 골랐으면 닫히게
useSelect({
  stateReducer: (state, { action, changes }) => {
    if (action.type !== 'OptionClick') return changes;
    return { ...changes, isOpen: selectedItems.length < 2 };
  },
});

// 요구 3: ESC로는 안 닫히게 (모달 안에서 모달이 닫히는 걸 막고 싶을 때)
useSelect({
  stateReducer: (state, { action, changes }) =>
    action.type === 'KeyDownEscape' ? state : changes,
});
```

**`closeOnSelect`, `closeAfterCount`, `disableEscapeClose` 세 개의 prop이 필요 없어졌습니다.** 그리고 앞으로 나올 예측 불가능한 요구도 대부분 여기서 처리됩니다.

> **제어의 역전(IoC)이 이 패턴의 정체입니다.** 라이브러리가 모든 정책을 알 필요가 없어지고, 대신 **정책이 적용되는 지점 자체를 확장 포인트로 노출**합니다. Redux 미들웨어가 `next(action)`으로 체인을 여는 것과 같은 구조입니다 — 4편에서 다시 만납니다.

### 설계상 주의

**액션 타입을 공개 API로 취급해야 합니다.** 사용자가 `action.type === 'OptionClick'`으로 분기하는 순간, 그 문자열은 semver 대상이 됩니다. Downshift가 `useSelect.stateChangeTypes.ItemClick` 같은 상수를 노출하는 이유입니다.

```typescript
useSelect.stateChangeTypes = {
  OptionClick: 'OptionClick',
  KeyDownEscape: 'KeyDownEscape',
} as const;
```

---

## 4단계 — 표현을 완전히 분리한다: Headless

여기까지 왔으면 마지막 질문이 남습니다. **이 컴포넌트가 DOM과 스타일을 가져야 할 이유가 있는가?**

실무 경험은 이렇게 말합니다. **디자인은 계속 바뀌지만, 키보드 내비게이션과 ARIA와 포커스 관리는 거의 안 바뀝니다.** 그러면 그 둘을 갈라놓는 게 맞습니다.

### prop getter 패턴

Headless 라이브러리의 표준 인터페이스는 **"이 엘리먼트에 펼쳐 넣으세요"라고 prop 뭉치를 반환**하는 것입니다.

```typescript
function useSelect<T>(options: UseSelectOptions<T>) {
  const [state, dispatch] = React.useReducer(reducer, initialState);
  const id = React.useId();

  const getTriggerProps = (userProps: React.HTMLAttributes<HTMLElement> = {}) => ({
    ...userProps,
    id: `${id}-trigger`,
    role: 'combobox' as const,
    'aria-expanded': state.isOpen,
    'aria-controls': `${id}-listbox`,
    'aria-activedescendant': state.isOpen
      ? `${id}-option-${state.highlightedIndex}`
      : undefined,
    tabIndex: 0,
    // 사용자 핸들러를 먼저 호출하고, 막지 않았으면 내부 동작 수행
    onClick: composeHandlers(userProps.onClick, () => dispatch({ type: 'TriggerClick' })),
    onKeyDown: composeHandlers(userProps.onKeyDown, (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); dispatch({ type: 'KeyDownArrowDown' }); break;
        case 'ArrowUp':   e.preventDefault(); dispatch({ type: 'KeyDownArrowUp' }); break;
        case 'Enter':     e.preventDefault(); dispatch({ type: 'KeyDownEnter' }); break;
        case 'Escape':    dispatch({ type: 'KeyDownEscape' }); break;
      }
    }),
  });

  const getOptionProps = (index: number, value: string, userProps = {}) => ({
    ...userProps,
    id: `${id}-option-${index}`,
    role: 'option' as const,
    'aria-selected': state.selected === value,
    'data-highlighted': state.highlightedIndex === index ? '' : undefined,
    onClick: composeHandlers(userProps.onClick, () =>
      dispatch({ type: 'OptionClick', value })
    ),
  });

  return { state, getTriggerProps, getOptionProps, /* ... */ };
}
```

**핵심은 `composeHandlers`입니다.**

```typescript
function composeHandlers<E extends React.SyntheticEvent>(
  userHandler: ((e: E) => void) | undefined,
  internalHandler: (e: E) => void
) {
  return (event: E) => {
    userHandler?.(event);
    if (!event.defaultPrevented) internalHandler(event);
  };
}
```

사용자 핸들러를 **먼저** 부르고, `preventDefault()`를 호출하지 않았을 때만 내부 동작을 실행합니다. 이 한 조각이 "내 핸들러를 붙였더니 라이브러리 동작이 사라졌어요" 버그의 99%를 없앱니다. 그리고 사용자는 `e.preventDefault()` 한 줄로 내부 동작을 **끌 수 있게** 됩니다 — 또 하나의 제어 역전 지점이죠.

### 사용하는 쪽

```tsx
function TeamPicker() {
  const { state, getTriggerProps, getOptionProps } = useSelect({ items: members });

  return (
    <div className="relative">
      <button {...getTriggerProps({ className: 'w-full rounded border px-3 py-2' })}>
        {state.selected ?? '선택하세요'}
      </button>
      {state.isOpen && (
        <ul className="absolute mt-1 w-full rounded border bg-white shadow-lg">
          {members.map((m, i) => (
            <li
              key={m.id}
              {...getOptionProps(i, m.id, {
                className: 'px-3 py-2 data-[highlighted]:bg-slate-100',
              })}
            >
              <Avatar user={m} /> {m.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

**DOM 구조도, 클래스도, 태그도 전부 사용자 것입니다.** 라이브러리가 주는 건 상태와 동작과 접근성 속성뿐입니다.

### `data-*` 속성으로 상태를 노출하는 이유

`data-highlighted`를 눈여겨보세요. **상태를 DOM 속성으로 내보내면 스타일링이 CSS 문제가 됩니다.**

```css
[data-highlighted] { background: #f1f5f9; }
[data-state="open"] { animation: slideDown 150ms; }
```

JS로 `className={isHighlighted ? 'bg-slate-100' : ''}` 를 계산하는 것보다 훨씬 낫습니다. Radix UI가 `data-state`, `data-disabled`, `data-side` 를 일관되게 노출하는 이유이고, Tailwind가 `data-[state=open]:` variant를 지원하는 이유입니다.

---

## 5단계 — 래퍼 DOM 없이 동작만 주입: asChild와 Slot

Headless여도 마지막 문제가 하나 남습니다. 이미 있는 내 버튼 컴포넌트에 trigger 동작을 붙이고 싶을 때입니다.

```tsx
// prop getter를 직접 펼치면 되지만, Compound API에서는?
<Tooltip.Trigger>
  <MyButton />       {/* Trigger가 <button>을 하나 더 만들어서 중첩된다 */}
</Tooltip.Trigger>
```

`asChild`는 **"새 엘리먼트를 만들지 말고, 내가 준 자식에게 네 prop을 합쳐라"** 라고 지시합니다.

```tsx
<Tooltip.Trigger asChild>
  <MyButton />       {/* MyButton이 곧 trigger가 된다 */}
</Tooltip.Trigger>
```

### Slot 구현

```tsx
type SlotProps = React.HTMLAttributes<HTMLElement> & {
  children?: React.ReactNode;
};

const Slot = React.forwardRef<HTMLElement, SlotProps>(
  function Slot({ children, ...slotProps }, forwardedRef) {
    if (!React.isValidElement(children)) return null;

    const childProps = children.props as Record<string, unknown>;

    return React.cloneElement(children, {
      ...mergeProps(slotProps, childProps),
      ref: composeRefs(forwardedRef, (children as any).ref),
    } as any);
  }
);

function mergeProps(
  slotProps: Record<string, any>,
  childProps: Record<string, any>
) {
  const merged = { ...slotProps, ...childProps };

  for (const key of Object.keys(slotProps)) {
    const slotValue = slotProps[key];
    const childValue = childProps[key];

    // 이벤트 핸들러는 둘 다 호출한다 (자식 먼저)
    if (/^on[A-Z]/.test(key) && typeof slotValue === 'function') {
      merged[key] = (...args: unknown[]) => {
        childValue?.(...args);
        slotValue(...args);
      };
    }
    // className은 합친다
    else if (key === 'className') {
      merged[key] = [slotValue, childValue].filter(Boolean).join(' ');
    }
    // style은 병합한다
    else if (key === 'style') {
      merged[key] = { ...slotValue, ...childValue };
    }
  }
  return merged;
}

function composeRefs<T>(...refs: (React.Ref<T> | undefined)[]) {
  return (node: T) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node);
      else if (ref && typeof ref === 'object') {
        (ref as React.MutableRefObject<T>).current = node;
      }
    }
  };
}
```

그리고 컴포넌트에서:

```tsx
function TooltipTrigger({ asChild, ...props }: { asChild?: boolean } & SlotProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp {...getTriggerProps(props)} />;
}
```

**`mergeProps`의 세 갈래가 이 패턴의 전부입니다.** 이벤트는 둘 다 호출, className은 연결, style은 병합, 나머지는 자식 우선. 이 규칙 하나로 "래퍼 없이 동작 합성"이 성립합니다.

### `as` prop과 무엇이 다른가

```tsx
<Button as={Link} to="/home">가기</Button>   {/* 구식 */}
<Button asChild><Link to="/home">가기</Link></Button>   {/* 현재 */}
```

`as`는 **타입이 지옥**입니다. `as`에 넘긴 컴포넌트의 prop을 `Button`의 prop 타입에 합성해야 하는데, 이게 제네릭 다형 컴포넌트 타입이라 에러 메시지가 사람이 읽을 수 없는 수준이 됩니다. `asChild`는 자식이 그냥 JSX이므로 **각자의 타입이 각자 검사됩니다.** 타입 복잡도를 구조로 해결한 사례입니다.

---

## 접근성은 왜 Headless의 몫인가

Headless 라이브러리를 "스타일 없는 컴포넌트"로만 보면 가치의 절반을 놓칩니다. 진짜 가치는 **아무도 혼자서는 제대로 구현하지 않는 것들**을 담당한다는 데 있습니다.

드롭다운 하나에 필요한 것들:

- `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`
- 화살표 키 이동, Home/End, 타이핑으로 점프(typeahead)
- 열릴 때 포커스 이동, 닫힐 때 트리거로 복귀
- 외부 클릭 감지 (단, 스크롤바 클릭은 제외)
- ESC 처리, 그리고 중첩된 오버레이에서 **가장 안쪽 것만** 닫기
- 뷰포트 밖으로 나가면 위로 뒤집기(collision detection)
- 모바일에서 스크롤 잠금, iOS Safari의 주소창 이슈

이 목록 중 절반은 **버그 리포트를 받기 전엔 존재하는지도 모릅니다.** 디자인 시스템을 직접 만들 때 Radix 같은 것 위에 올리는 이유가 스타일이 아니라 이 목록입니다.

---

## 그래서 어디까지 넘길 것인가 — 제어권 스펙트럼

다섯 단계를 하나의 표로 정리하면 이렇습니다.

| 단계 | 사용자가 결정하는 것 | 컴포넌트가 결정하는 것 | 적합한 상황 |
|---|---|---|---|
| 0. prop 다발 | 거의 없음 | 배치, 동작, 스타일, 상태 | 한 팀, 한 디자인, 사용처 5곳 이하 |
| 1. Compound | 배치 | 동작, 스타일, 상태 | 사내 디자인 시스템 |
| 2. Control Props | 배치, 상태 소유권 | 동작, 스타일 | 폼 라이브러리와 통합해야 할 때 |
| 3. State Reducer | 배치, 상태, **전이 규칙** | 스타일, 접근성 | 요구가 계속 변하는 공용 컴포넌트 |
| 4. Headless | 전부 + DOM/스타일 | 접근성, 키보드, 포지셔닝 | 여러 제품/여러 디자인 |
| 5. asChild | + 엘리먼트 타입 | 동작 합성 규칙 | 오픈소스 라이브러리 |

**판단 기준은 "누가 쓰느냐"입니다.**

- **사용처가 한 팀, 디자인이 하나**라면 0~1단계에서 멈추세요. Headless로 만들면 모든 사용처가 똑같은 Tailwind 클래스를 복붙하게 되고, 그건 추상화 실패입니다.
- **다른 팀이 쓰기 시작하면** 2~3단계로 올리세요. 신호는 명확합니다. **"이 컴포넌트에 prop 추가해 주세요" 요청이 분기마다 들어오면** State Reducer 시점입니다.
- **여러 제품에서, 서로 다른 디자인으로 쓴다면** 4단계입니다.

### 과잉 설계의 신호

거꾸로, **Headless로 만들었는데 사용처가 세 곳이고 전부 같은 모양이라면** 그건 실패입니다. 모든 사용처가 똑같은 50줄 JSX를 복사하고 있다면, 그 50줄을 감싼 스타일 레이어를 만들어서 기본값으로 제공해야 합니다.

실제 라이브러리들이 이렇게 합니다. Radix(headless) 위에 shadcn/ui(스타일 레이어)가 얹히는 구조죠. **Headless는 최종 제품이 아니라 기반층입니다.**

---

## 흔한 안티패턴 셋

### 1. Boolean prop 폭발

```tsx
<Button primary large outlined disabled loading fullWidth rounded />
```

`primary`와 `secondary`를 동시에 줄 수 있습니다. 조합이 2⁷개인데 유효한 건 스무 개쯤이겠죠.

```tsx
<Button variant="primary" size="lg" state="loading" />   // 유니온 타입으로
```

**상호배타적인 것은 boolean이 아니라 유니온입니다.** 타입이 잘못된 조합을 막아줍니다.

### 2. `renderX` prop의 남발

```tsx
<Table renderHeader={...} renderRow={...} renderFooter={...} renderEmpty={...} />
```

`render` prop이 네 개를 넘어가면 그건 **Compound Component로 써야 할 것을 함수로 쓰고 있다**는 신호입니다.

```tsx
<Table>
  <Table.Header>...</Table.Header>
  <Table.Body>...</Table.Body>
</Table>
```

기준: **항목마다 반복되고 인자가 필요하면 함수(`children`으로), 한 번만 나오는 영역이면 Compound.**

### 3. Context를 상태 관리자로 쓰기

```tsx
// 안티패턴 — 값 하나만 바뀌어도 전체 소비자가 리렌더
<AppContext.Provider value={{ user, theme, cart, notifications, setX, setY }}>
```

Context는 **의존성 주입 메커니즘**이지 상태 관리자가 아닙니다. React Context는 값이 바뀌면 **모든** 소비자를 리렌더합니다(선택적 구독이 없습니다). Compound Component처럼 범위가 좁고 변경이 드문 곳에는 완벽하지만, 앱 전역 상태에는 Zustand나 Jotai가 맞습니다 — 5편에서 왜 그런지 다룹니다.

---

## 요약

| 패턴 | 넘기는 것 | 핵심 구현 | 대가 |
|---|---|---|---|
| Compound Component | 배치 | Context + 명시적 에러 | 계약이 타입에 안 잡힘 |
| Control Props | 상태 소유권 | `useControllableState` | 제어/비제어 전환 버그 |
| State Reducer | 전이 규칙 | 기본 리듀서 + 가로채기 | 액션 타입이 공개 API가 됨 |
| Headless | DOM, 스타일 | prop getter + `composeHandlers` | 사용처마다 스타일 중복 |
| asChild / Slot | 엘리먼트 타입 | `cloneElement` + `mergeProps` | 자식이 단일 엘리먼트여야 함 |

**관통하는 원리:** 모든 사용 사례를 예측해서 prop을 만들려 하지 말고, **결정이 일어나는 지점 자체를 확장 포인트로 열어라.** prop이 15개를 넘어가는 순간이 그 신호입니다.

---

## 다음 편

**4편 — Redux를 밑바닥부터 구현하기**

3단계에서 State Reducer가 "제안하고 가로채기"라는 구조를 만들었습니다. 사실 이건 Redux 미들웨어와 동형입니다.

다음 편은 40줄짜리 `createStore`를 직접 구현하면서, 미들웨어 체인(`compose`)이 왜 그렇게 생겼는지, 타임트래블이 왜 설계의 필연적 결과인지, 그리고 Redux가 풀던 문제 중 무엇이 아직 유효한지를 봅니다.
