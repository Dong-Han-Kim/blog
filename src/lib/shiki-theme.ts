import type { ThemeRegistrationAny } from 'shiki';

/**
 * 3단계 그린 인광 테마 (설계 §6.1, D4): 기본 text-body / 명령·문자열 code-token / 주석 text-dim.
 * shiki 테마는 CSS 변수를 받지 못해 hex 리터럴이 유일하게 허용되는 파일이다 (U14 grep 허용 목록).
 * 토큰 대응: #cfeedb=--color-text-body, #55b678=--color-text-dim, #a8e9bf=--color-code-token,
 * #071008=--color-bg-raised (keepBackground: false라 배경은 CodeBlock 래퍼가 담당).
 * 주의: rehype-pretty-code는 `tokenColors` 키 존재로 JSON 테마를 판별하므로
 * `settings` 별칭이 아닌 `tokenColors`를 사용해야 한다.
 */
export const crtTheme: ThemeRegistrationAny = {
  name: 'crt-green',
  type: 'dark',
  fg: '#cfeedb',
  bg: '#071008',
  tokenColors: [
    { settings: { foreground: '#cfeedb' } }, // 기본 = text-body
    {
      scope: ['comment', 'punctuation.definition.comment'],
      settings: { foreground: '#55b678' }, // 주석 = text-dim
    },
    {
      scope: [
        'string',
        'keyword',
        'storage',
        'entity.name.function',
        'support.function',
        'constant.language',
        'variable.language',
      ],
      settings: { foreground: '#a8e9bf' }, // 명령·문자열 = code-token
    },
  ],
};
