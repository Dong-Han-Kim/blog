import { describe, expect, it } from 'vitest';
import { tagHref } from './routes';

describe('tagHref', () => {
  it('ASCII 태그는 인코딩 전후가 동일하다 (기존 색인 유지)', () => {
    expect(tagHref('linux')).toBe('/tags/linux');
    expect(tagHref('Next.js')).toBe('/tags/Next.js'); // . 은 unreserved
  });
  it('한글 태그를 UTF-8 퍼센트 인코딩한다', () => {
    expect(tagHref('리눅스')).toBe('/tags/%EB%A6%AC%EB%88%85%EC%8A%A4');
    expect(tagHref('터미널')).toBe('/tags/%ED%84%B0%EB%AF%B8%EB%84%90');
  });
  it('공백·#·& 를 인코딩한다', () => {
    expect(tagHref('Shared Library')).toBe('/tags/Shared%20Library');
    expect(tagHref('C#')).toBe('/tags/C%23');
    expect(tagHref('A&B')).toBe('/tags/A%26B');
  });
});
