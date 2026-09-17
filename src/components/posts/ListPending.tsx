'use client';

import { useLinkStatus } from 'next/link';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from 'react';
import { ListSkeleton } from '@/components/shared/ListSkeleton';

/**
 * 페이저 클릭 중 목록 스켈레톤 (설계 §6.6 대안 경로).
 *
 * loading.tsx를 쓰지 않는 이유: loading.tsx가 만드는 Suspense 경계는 셸을 먼저
 * 커밋해 버려서 notFound()/permanentRedirect()가 전부 HTTP 200으로 나간다
 * (실험으로 확인 — generateMetadata로 판정을 옮겨도 동일하게 200이다).
 * 상태 코드가 문제되는 건 문서 요청뿐이고 페이저 클릭은 클라이언트 네비게이션
 * (RSC fetch)이라 영향이 없으므로, 스켈레톤을 클라이언트 전환에만 붙인다.
 *
 * useLinkStatus는 Suspense 경계를 만들지 않아 상태 코드에 영향이 없다.
 * 다만 이 훅은 조상 <Link> 내부에서만 동작하므로, 각 페이저 링크 안에서
 * pending을 읽어(PagerLinkPending) 경계 밖 목록 슬롯(ListPendingSlot)으로
 * 올려 보내는 구조를 쓴다.
 */

/** 현재 pending 여부만 구독 — 값이 바뀔 때마다 갱신된다 */
const ListPendingStateContext = createContext(false);

type SetLinkPending = (id: string, pending: boolean) => void;

/**
 * 세터 전용 컨텍스트. 상태 컨텍스트와 분리해 두어야 세터 정체성이 고정되고,
 * PagerLinkPending의 effect가 pending 변화마다 재실행되지 않는다.
 */
const ListPendingApiContext = createContext<SetLinkPending | null>(null);

/**
 * 목록 슬롯과 페이저를 함께 감싸는 얇은 클라이언트 셸.
 * children은 서버에서 렌더된 엘리먼트를 그대로 받는다 — PostList는 서버
 * 컴포넌트로 유지된다.
 */
export function ListPendingBoundary({ children }: { children: ReactNode }) {
  // 여러 링크가 동시에 pending일 수 있어(연타·프리페치) 집합으로 센다.
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const setLinkPending = useCallback<SetLinkPending>((id, pending) => {
    setPendingIds((prev) => {
      // 상태가 그대로면 같은 참조를 돌려줘 불필요한 리렌더를 막는다
      if (prev.has(id) === pending) return prev;
      const next = new Set(prev);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  return (
    <ListPendingApiContext.Provider value={setLinkPending}>
      <ListPendingStateContext.Provider value={pendingIds.size > 0}>
        {children}
      </ListPendingStateContext.Provider>
    </ListPendingApiContext.Provider>
  );
}

/**
 * 각 페이저 <Link>의 자식으로 넣는 센서. 렌더 결과가 없고 pending만 올려 보낸다.
 * useLinkStatus는 가장 가까운 조상 Link의 상태를 보므로 반드시 Link 내부에 둔다.
 */
export function PagerLinkPending() {
  const setLinkPending = useContext(ListPendingApiContext);
  const id = useId();
  const { pending } = useLinkStatus();

  useEffect(() => {
    if (!setLinkPending) return;
    setLinkPending(id, pending);
    // 전환이 끝나 링크가 사라져도 pending이 남지 않도록 정리한다
    return () => setLinkPending(id, false);
  }, [setLinkPending, id, pending]);

  return null;
}

/**
 * 목록 자리. pending이면 스켈레톤으로 바꾸고, 아니면 서버 렌더된 children을
 * 그대로 통과시킨다.
 */
export function ListPendingSlot({ children }: { children: ReactNode }) {
  const pending = useContext(ListPendingStateContext);
  if (pending) return <ListSkeleton />;
  return <>{children}</>;
}
