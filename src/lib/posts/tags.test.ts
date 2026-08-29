import { describe, expect, it } from 'vitest';
import { countCategories, countTags, sortTagsByCount } from './tags';

const post = (tags: string[], category = 'til') => ({ tags, category });

describe('countTags', () => {
  it('빈 배열은 빈 Map', () => {
    expect(countTags([]).size).toBe(0);
  });
  it('단일 태그를 센다', () => {
    expect([...countTags([post(['Linux'])]).entries()]).toEqual([['Linux', 1]]);
  });
  it('중복 태그를 누적한다', () => {
    const counts = countTags([post(['Linux', 'CLI']), post(['Linux'])]);
    expect(counts.get('Linux')).toBe(2);
    expect(counts.get('CLI')).toBe(1);
  });
  it('태그 없는 글이 섞여도 무시한다', () => {
    expect([...countTags([post([]), post(['A']), post([])]).keys()]).toEqual([
      'A',
    ]);
  });
  // ★ C-5.I1 회귀 안전망 — /tags 페이지가 이 순서에 의존한다
  it('Map 키 순서는 첫 등장 순서를 따른다', () => {
    const counts = countTags([post(['Z', 'A']), post(['M', 'Z'])]);
    expect([...counts.keys()]).toEqual(['Z', 'A', 'M']);
  });
});

describe('countCategories', () => {
  it('단일값 키를 센다', () => {
    const counts = countCategories([
      post([], 'til'),
      post([], 'linux'),
      post([], 'til'),
    ]);
    expect([...counts.entries()]).toEqual([
      ['til', 2],
      ['linux', 1],
    ]);
  });
});

describe('sortTagsByCount', () => {
  it('count 내림차순이 1차 축이다', () => {
    const counts = new Map([
      ['a', 1],
      ['b', 3],
      ['c', 2],
    ]);
    expect(sortTagsByCount(counts).map(([t]) => t)).toEqual(['b', 'c', 'a']);
  });
  // ★ 환경 로케일 무관 결정성 고정 (C-6.4)
  it('동률은 compareStrings 오름차순 — 대소문자·한글 혼합 골든 순서', () => {
    const counts = new Map([
      ['터미널', 1],
      ['glibc', 1],
      ['Virtual DOM', 1],
      ['ldd', 1],
      ['CLI', 1],
      ['서버운영', 1],
      ['systemd', 1],
      ['Next.js', 1],
    ]);
    expect(sortTagsByCount(counts).map(([t]) => t)).toEqual([
      'CLI',
      'Next.js',
      'Virtual DOM',
      'glibc',
      'ldd',
      'systemd',
      '서버운영',
      '터미널',
    ]);
  });
  it('1차 축이 2차 축을 이긴다', () => {
    const counts = new Map([
      ['zzz', 5],
      ['aaa', 1],
    ]);
    expect(sortTagsByCount(counts).map(([t]) => t)).toEqual(['zzz', 'aaa']);
  });
});
