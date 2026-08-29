import { describe, expect, it } from 'vitest';
import { tagHref } from './routes';

/**
 * QA 계약 테스트 — 태그 URL 조립 (A-2 / M5).
 * sitemap의 <loc>와 화면 링크가 같은 함수를 쓰는 것이 이 단위의 전부이므로,
 * "어떤 태그 문자열이 들어와도 /tags/ 접두사 + 단일 경로 세그먼트"가 계약이다.
 */

describe('tagHref — 접두사와 세그먼트 계약', () => {
  it('항상 /tags/ 로 시작한다', () => {
    for (const tag of ['linux', '리눅스', 'a/b', '#', '?q', '', ' ']) {
      expect(tagHref(tag).startsWith('/tags/')).toBe(true);
    }
  });

  // ★ 핵심: 태그에 무엇이 들어와도 경로 세그먼트가 늘어나면 안 된다 (/tags/a/b 방지)
  it('경로 구분자를 만들지 않는다 — 슬래시는 항상 %2F로 인코딩된다', () => {
    expect(tagHref('a/b')).toBe('/tags/a%2Fb');
    expect(tagHref('/')).toBe('/tags/%2F');
    expect(tagHref('../../etc/passwd')).toBe('/tags/..%2F..%2Fetc%2Fpasswd');
    for (const tag of ['a/b', '/', '../secret', 'x//y']) {
      expect(tagHref(tag).split('/')).toHaveLength(3); // ['', 'tags', '<segment>']
    }
  });

  it('쿼리·프래그먼트 구분자를 인코딩한다 (URL 경계 탈출 방지)', () => {
    expect(tagHref('?')).toBe('/tags/%3F');
    expect(tagHref('#')).toBe('/tags/%23');
    expect(tagHref('a?b#c')).toBe('/tags/a%3Fb%23c');
    expect(tagHref('C#')).toBe('/tags/C%23');
  });

  it.each([
    ['&', '/tags/%26'],
    ['=', '/tags/%3D'],
    ['+', '/tags/%2B'],
    [' ', '/tags/%20'],
    ['%', '/tags/%25'],
    ['"', '/tags/%22'],
    ['<', '/tags/%3C'],
    ['>', '/tags/%3E'],
    [':', '/tags/%3A'],
    ['\n', '/tags/%0A'],
  ])('URL 특수문자 %j → %s', (tag, expected) => {
    expect(tagHref(tag)).toBe(expected);
  });

  it('encodeURIComponent가 통과시키는 unreserved 문자는 그대로 둔다 (기존 색인 유지)', () => {
    expect(tagHref("A-Z_a-z0-9-_.!~*'()")).toBe("/tags/A-Z_a-z0-9-_.!~*'()");
    expect(tagHref('Next.js')).toBe('/tags/Next.js');
    expect(tagHref('linux')).toBe('/tags/linux');
  });

  it('한글·이모지·서로게이트 페어를 UTF-8 퍼센트 인코딩한다', () => {
    expect(tagHref('리눅스')).toBe('/tags/%EB%A6%AC%EB%88%85%EC%8A%A4');
    expect(tagHref('서버운영')).toBe('/tags/%EC%84%9C%EB%B2%84%EC%9A%B4%EC%98%81');
    expect(tagHref('\u{1F600}')).toBe('/tags/%F0%9F%98%80');
  });

  it('round-trip: decodeURIComponent로 원본 태그를 복원할 수 있다 (페이지가 이 전제를 쓴다)', () => {
    const tags = [
      'linux',
      '리눅스 명령어',
      'Shared Library',
      'C#',
      'A&B',
      'a/b',
      '?=+%',
      '\u{1F600}',
      "!~*'()",
    ];
    for (const tag of tags) {
      const segment = tagHref(tag).slice('/tags/'.length);
      expect(decodeURIComponent(segment)).toBe(tag);
    }
  });

  it('멱등이 아니다 — 이미 인코딩된 값을 다시 넣으면 이중 인코딩된다 (호출부는 원값을 넘겨야 한다)', () => {
    expect(tagHref('%EB%A6%AC')).toBe('/tags/%25EB%25A6%25AC');
  });

  it('공백만 있는 태그도 빈 세그먼트를 만들지 않는다', () => {
    expect(tagHref(' ')).toBe('/tags/%20');
    expect(tagHref('   ')).toBe('/tags/%20%20%20');
  });

  // ⚠️ 결함 재현: 빈 태그는 태그 상세가 아니라 /tags 인덱스로 가는 URL을 만든다.
  //    postFrontmatterSchema가 tags: z.array(z.string()).min(1) 이라 원소가 ''인 것은
  //    막지 못하므로, 빈 문자열 태그가 유입되면 링크가 조용히 목적지를 잃는다.
  it('빈 문자열 태그는 /tags/ 를 만든다 (태그 상세가 아닌 인덱스로 낙하 — 알려진 취약점)', () => {
    expect(tagHref('')).toBe('/tags/');
    expect(tagHref('').slice('/tags/'.length)).toBe('');
  });
});
