import { describe, expect, it } from 'vitest';

import { countCategories, countTags, sortTagsByCount } from './tags';
import { compareStrings } from './sort';

/**
 * QA 계약 테스트 — 집계·정렬 정본의 결정성과 경계.
 * /tags · ALL TAGS 패널 · ⌘K TRY 칩 세 소비처가 이 두 함수만 신뢰하므로
 * 여기서 순서가 흔들리면 세 화면이 동시에 어긋난다 (C-5.I1 / C-6.4).
 */

const post = (tags: string[], category = 'til') => ({ tags, category });

describe('countTags — 경계와 순회 계약', () => {
  it('빈 입력', () => {
    expect(countTags([]).size).toBe(0);
    expect([...countTags([]).entries()]).toEqual([]);
  });

  it('모든 글에 태그가 없으면 빈 Map', () => {
    expect(countTags([post([]), post([]), post([])]).size).toBe(0);
  });

  it('입력 배열을 변형하지 않는다', () => {
    const posts = [post(['A', 'B']), post(['A'])];
    const snapshot = structuredClone(posts);
    countTags(posts);
    expect(posts).toEqual(snapshot);
  });

  it('반환 Map은 호출마다 새 인스턴스다 (호출부가 캐시를 공유하지 않는다)', () => {
    const posts = [post(['A'])];
    const first = countTags(posts);
    first.set('오염', 99);
    expect(countTags(posts).has('오염')).toBe(false);
  });

  // ★ 한 글 안의 중복 태그는 2로 센다 — /tags 칩 카운트와 /tags/{tag} ENTRIES(글 수)가
  //   어긋나는 지점이므로 계약으로 못 박는다. 바꾸려면 의도적 결정이 필요하다.
  it('한 글 안의 중복 태그도 각각 센다 (칩 카운트 = 태그 등장 수, 글 수가 아니다)', () => {
    expect(countTags([post(['Linux', 'Linux', 'CLI'])]).get('Linux')).toBe(2);
  });

  it('대소문자가 다른 태그는 서로 다른 키다 (정규화하지 않는다)', () => {
    const counts = countTags([post(['Linux']), post(['linux']), post(['LINUX'])]);
    expect(counts.size).toBe(3);
    expect([...counts.keys()]).toEqual(['Linux', 'linux', 'LINUX']);
  });

  it('공백만 있는 태그와 빈 문자열 태그도 키가 된다 (trim하지 않는다)', () => {
    const counts = countTags([post(['', ' ', ' Linux ', 'Linux'])]);
    expect([...counts.keys()]).toEqual(['', ' ', ' Linux ', 'Linux']);
  });

  // ★ C-5.I1 — 순회 방식이 바뀌면(flatMap → for…of 등) 여기서 잡힌다
  it('키 순서 = 첫 등장 순서 (글 순서 × 글 내 태그 순서)', () => {
    const counts = countTags([
      post(['Z', 'A']),
      post(['M', 'Z']),
      post(['A', 'Q']),
    ]);
    expect([...counts.keys()]).toEqual(['Z', 'A', 'M', 'Q']);
  });

  it('입력 순서를 바꾸면 키 순서도 바뀐다 (삽입 순서 의존이 실재함의 증거)', () => {
    const a = countTags([post(['Z']), post(['A'])]);
    const b = countTags([post(['A']), post(['Z'])]);
    expect([...a.keys()]).toEqual(['Z', 'A']);
    expect([...b.keys()]).toEqual(['A', 'Z']);
  });

  it('대량 입력(2000글 × 5태그)에서 합계가 정확하다', () => {
    const posts = Array.from({ length: 2000 }, (_, i) =>
      post([`t${i % 7}`, 'common', `u${i % 13}`, 'common2', `v${i % 3}`]),
    );
    const counts = countTags(posts);
    expect(counts.get('common')).toBe(2000);
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(2000 * 5);
  });
});

describe('countCategories — 경계와 순회 계약', () => {
  it('빈 입력', () => {
    expect(countCategories([]).size).toBe(0);
  });

  it('키 순서 = 첫 등장 순서', () => {
    const counts = countCategories([
      post([], 'til'),
      post([], 'linux'),
      post([], 'til'),
      post([], 'devops'),
    ]);
    expect([...counts.entries()]).toEqual([
      ['til', 2],
      ['linux', 1],
      ['devops', 1],
    ]);
  });

  it('빈 문자열 카테고리도 키가 된다', () => {
    expect(countCategories([post([], '')]).get('')).toBe(1);
  });

  it('countTags와 서로 간섭하지 않는다 (같은 글 배열, 다른 축)', () => {
    const posts = [post(['til'], 'til'), post(['til'], 'linux')];
    expect(countTags(posts).get('til')).toBe(2);
    expect(countCategories(posts).get('til')).toBe(1);
  });
});

describe('sortTagsByCount — 결정성과 전순서', () => {
  it('빈 Map은 빈 배열', () => {
    expect(sortTagsByCount(new Map())).toEqual([]);
  });

  it('단일 항목', () => {
    expect(sortTagsByCount(new Map([['A', 3]]))).toEqual([['A', 3]]);
  });

  it('입력 Map을 변형하지 않고 새 배열을 반환한다', () => {
    const counts = new Map([
      ['b', 1],
      ['a', 1],
    ]);
    const before = [...counts.entries()];
    sortTagsByCount(counts).push(['오염', 0]);
    expect([...counts.entries()]).toEqual(before);
  });

  // ★ 핵심 계약: 삽입 순서를 어떻게 바꿔도 결과가 같다.
  //   tie-break가 사라지면(예: `b[1] - a[1]`만 남으면) 즉시 실패한다.
  it('Map 삽입 순서를 바꿔도 결과가 동일하다 (동률 tie-break 존재의 증거)', () => {
    const entries: Array<[string, number]> = [
      ['터미널', 1],
      ['glibc', 1],
      ['Virtual DOM', 1],
      ['ldd', 1],
      ['CLI', 1],
      ['서버운영', 1],
      ['systemd', 1],
      ['Next.js', 1],
      ['Linux', 4],
      ['Troubleshooting', 2],
    ];
    const golden = sortTagsByCount(new Map(entries)).map(([t]) => t);
    expect(golden).toEqual([
      'Linux',
      'Troubleshooting',
      'CLI',
      'Next.js',
      'Virtual DOM',
      'glibc',
      'ldd',
      'systemd',
      '서버운영',
      '터미널',
    ]);
    for (let shift = 0; shift < entries.length; shift += 1) {
      const rotated = [...entries.slice(shift), ...entries.slice(0, shift)];
      expect(sortTagsByCount(new Map(rotated)).map(([t]) => t)).toEqual(golden);
      expect(sortTagsByCount(new Map([...rotated].reverse())).map(([t]) => t)).toEqual(golden);
    }
  });

  it('인접 쌍 불변식: count 내림차순, 동률이면 compareStrings 오름차순', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 60; i += 1) {
      counts.set(`tag-${String(i).padStart(2, '0')}-${i % 2 ? 'A' : 'z'}`, i % 4);
    }
    const sorted = sortTagsByCount(counts);
    expect(sorted).toHaveLength(60);
    for (let i = 1; i < sorted.length; i += 1) {
      const [prevName, prevCount] = sorted[i - 1];
      const [name, count] = sorted[i];
      expect(prevCount).toBeGreaterThanOrEqual(count);
      if (prevCount === count) expect(compareStrings(prevName, name)).toBeLessThan(0);
    }
  });

  it('count 0 과 음수도 순서 규칙을 그대로 따른다', () => {
    const counts = new Map([
      ['zero', 0],
      ['neg', -1],
      ['one', 1],
    ]);
    expect(sortTagsByCount(counts).map(([t]) => t)).toEqual(['one', 'zero', 'neg']);
  });

  it('count 차가 큰 값에서도 부동소수 오차 없이 정렬된다', () => {
    const counts = new Map([
      ['big', Number.MAX_SAFE_INTEGER],
      ['small', 1],
    ]);
    expect(sortTagsByCount(counts).map(([t]) => t)).toEqual(['big', 'small']);
  });

  // ★ localeCompare가 다시 스며들면 실패하는 최소 케이스
  it('동률 정렬이 localeCompare와 갈리는 지점을 코드 유닛 기준으로 고정한다', () => {
    const counts = new Map([
      ['ldd', 1],
      ['Next.js', 1],
    ]);
    expect(sortTagsByCount(counts).map(([t]) => t)).toEqual(['Next.js', 'ldd']);
    // 대비: localeCompare였다면 ldd가 먼저다
    expect('ldd'.localeCompare('Next.js')).toBeLessThan(0);
  });

  it('countTags 결과를 그대로 받아도 계약이 유지된다 (파이프라인 통합)', () => {
    const posts = [
      post(['Linux', 'CLI']),
      post(['Linux', 'systemd']),
      post(['Linux', 'ldd', 'Next.js']),
    ];
    expect(sortTagsByCount(countTags(posts))).toEqual([
      ['Linux', 3],
      ['CLI', 1],
      ['Next.js', 1],
      ['ldd', 1],
      ['systemd', 1],
    ]);
  });
});
