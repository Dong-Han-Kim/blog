import { CategoryContent } from '../types/common';

// 카테고리 페이지(6b) 헤더에 노출되는 확정 문구 (U7).
// TIL은 핸드오버 예시 문구를 그대로 사용한다.
export const CATEGORY_CONTENT: CategoryContent = {
  frontend: {
    name: 'Frontend',
    description: 'React·Next.js·브라우저 렌더링 — 화면단 개발 기록',
  },
  backend: {
    name: 'Backend',
    description: '서버·API·인증 — 백엔드 개발 기록',
  },
  devops: {
    name: 'DevOps',
    description: 'Docker·CI/CD·인프라 — 배포와 운영 자동화 기록',
  },
  database: {
    name: 'Database',
    description: '쿼리·인덱스·트랜잭션 — 데이터베이스 기록',
  },
  projects: {
    name: 'Projects',
    description: '직접 만들고 운영한 프로젝트의 구현과 회고',
  },
  til: {
    name: 'TIL',
    description: 'Today I Learned — 그날 배운 것을 짧게 남긴 기록',
  },
};
