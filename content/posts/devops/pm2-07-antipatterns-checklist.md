---
# 📌 기본 메타데이터
title: 'PM2 완전 정복 7편 — 안티패턴 12선과 운영 체크리스트'
date: '2026-09-17'
category: 'devops'
tags: ['PM2', 'Node.js', 'Anti-Pattern', 'Checklist']
description: 'sudo pm2 혼용부터 K8s 안에서 PM2로 스케일링까지 현장에서 반복되는 안티패턴 12가지를 증상·원인·해결로 정리하고, 설치부터 무중단·로그·보안까지 운영 셋업 체크리스트와 명령어 치트시트로 시리즈를 마무리한다.'

# 💬 옵션 필드
draft: false
series: 'PM2 완전 정복'
seriesOrder: 7

# 📚 SEO용
keywords: ['PM2', '안티패턴', '운영 체크리스트', '치트시트', 'sudo pm2', 'pm2 save', 'watch', 'instances max', 'Kubernetes']
---

# PM2 완전 정복 7편 — 안티패턴 12선과 운영 체크리스트

> 이전 편: 6편 — Docker, Nginx, 폐쇄망 운영
> 이번 편 키워드: 안티패턴 12선, 운영 셋업 체크리스트, 명령어 치트시트

마지막 편은 앞의 여섯 편을 뒤집어 본다. 현장에서 반복해서 나오는 잘못된 사용법을 증상·원인·해결로 묶고, 새 서버에 PM2를 올릴 때 그대로 따라갈 수 있는 체크리스트와 치트시트로 시리즈를 닫는다.

## 안티패턴 12선

### ❌ 1. `sudo pm2`와 `pm2`를 섞어 쓰기

**증상**: 같은 앱이 두 번 떠서 포트 충돌, `pm2 ls`에 앱이 안 보임, 재부팅 후 엉뚱한 목록 복원.
**원인**: 사용자마다 별도의 데몬과 `~/.pm2`를 가진다.
**해결**: 전용 서비스 계정(예: `deploy`) 하나로만 운영하고, 1024 미만 포트가 필요하면 Nginx에 맡긴다.

### ❌ 2. `pm2 save` 없이 운영

**증상**: 재부팅 후 앱이 안 뜨거나, 몇 달 전에 삭제한 앱이 되살아남.
**해결**: 목록 변경 후 항상 `pm2 save`. 배포 스크립트 마지막에 포함.

### ❌ 3. 운영 환경에서 `watch: true`

**증상**: 업로드나 로그 기록 때마다 재시작, 배포 도중 반쯤 복사된 파일로 재시작.
**해결**: watch는 개발 전용. 운영 반영은 명시적 `reload`로.

### ❌ 4. 인메모리 상태 + 클러스터 모드

**증상**: 간헐적 로그아웃, 캐시 불일치, 레이트 리미터가 인스턴스 수만큼 느슨해짐.
**해결**: 상태는 Redis/DB 등 외부로. 앱은 무상태(stateless)로 설계.

### ❌ 5. 앱 내부 크론을 모든 워커에서 실행

**증상**: 알림 중복 발송, 배치 중복 처리.
**해결**: 스케줄러를 별도 fork 앱으로 분리하거나 인스턴스 0에서만 실행, 가능하면 분산 락까지.

### ❌ 6. 로그 로테이션 미설정

**증상**: 어느 날 디스크 100% → DB까지 함께 장애.
**해결**: pm2-logrotate 또는 OS logrotate를 서버 셋업 체크리스트에 포함.

### ❌ 7. `max_memory_restart`로 메모리 누수 은폐

**증상**: 서비스는 "돌아가지만" 주기적으로 재시작되어 응답 지연 스파이크, 진행 중 요청 유실.
**해결**: 임계치는 안전망으로만 두고, 재시작 횟수를 모니터링해 누수를 추적·수정.

### ❌ 8. 무한 재시작 허용

**증상**: 설정 오류로 앱이 초당 수십 번 재시작 → CPU 점유, 로그 폭증, 외부 시스템(DB)에 연결 폭탄.
**해결**: `exp_backoff_restart_delay` + `min_uptime` + `max_restarts` 조합, `errored` 상태 알림.

### ❌ 9. 설정 변경 후 `--update-env` 누락

**증상**: "분명 바꿨는데 적용이 안 돼요."
**해결**: 배포 스크립트에 `--update-env`를 고정으로 포함. 구조 변경 시 delete → start.

### ❌ 10. 컨테이너/공유 서버에서 `instances: max`

**증상**: CPU 제한이 2개인 컨테이너에서 워커 16개 → 컨텍스트 스위칭으로 성능 저하, 메모리 부족.
**해결**: 인스턴스 수를 명시. 같은 서버의 DB 등 다른 프로세스 몫도 고려.

### ❌ 11. Kubernetes 안에서 PM2로 재시작/스케일링까지 담당

**증상**: 앱이 계속 죽는데 Pod는 Healthy, 오토스케일러가 부하를 잘못 판단.
**해결**: 오케스트레이터가 있다면 재시작·스케일링은 오케스트레이터에 일원화. PM2를 써야 한다면 `pm2-runtime`으로 최소한만.

### ❌ 12. `npm start`를 PM2로 감싸서 운영

**증상**: 종료 시그널이 앱까지 전달되지 않아 graceful shutdown이 동작하지 않음, 클러스터 모드 불가.
**해결**: `script`에 실제 진입점 파일(`dist/server.js`)을 지정.

---

## 운영 셋업 체크리스트

```
[설치]
 [ ] Node.js 버전이 PM2 요구사항(7.x → 20+)을 만족하는가
 [ ] PM2를 운영할 전용 계정이 정해졌는가
 [ ] pm2 update 절차가 문서화되어 있는가

[설정]
 [ ] ecosystem.config.js로 선언적 관리 + Git 버전 관리 (시크릿 제외)
 [ ] exec_mode / instances가 서버 자원에 맞게 명시되었는가
 [ ] 재시작 정책: exp_backoff_restart_delay, min_uptime, max_restarts
 [ ] max_memory_restart가 heap 한도와 정합하는가
 [ ] watch 비활성화

[무중단]
 [ ] 앱이 SIGINT/SIGTERM에서 graceful shutdown을 수행하는가
 [ ] wait_ready + process.send('ready') 적용
 [ ] kill_timeout / listen_timeout이 실제 소요 시간보다 넉넉한가
 [ ] 배포 시 restart가 아닌 reload를 사용하는가

[영속성]
 [ ] pm2 startup 등록 + 실제 재부팅 테스트 완료
 [ ] 배포 스크립트에 pm2 save 포함

[로그]
 [ ] 로그 로테이션 설정 (pm2-logrotate 또는 OS logrotate)
 [ ] 로그 경로가 충분한 디스크를 가진 파티션인가
 [ ] 타임스탬프 / JSON 형식 정책 결정

[아키텍처]
 [ ] 앱이 무상태인가 (세션/캐시 외부화)
 [ ] 스케줄러 중복 실행 방지
 [ ] Nginx 등 리버스 프록시 뒤에서 127.0.0.1 바인딩
 [ ] HTTP 헬스체크 엔드포인트 및 외부 모니터링

[관측]
 [ ] 재시작 횟수 / errored 상태 알림
 [ ] ~/.pm2/pm2.log 확인 절차가 런북에 있는가
```

---

## 명령어 치트시트

```bash
# 실행
pm2 start app.js --name api -i max
pm2 start ecosystem.config.js --env production
pm2 start ecosystem.config.js --only api

# 조회
pm2 ls | pm2 describe api | pm2 monit | pm2 env 0

# 제어
pm2 restart api --update-env
pm2 reload api
pm2 stop api | pm2 delete api | pm2 reset api
pm2 scale api 4
pm2 sendSignal SIGUSR2 api

# 로그
pm2 logs api --lines 200 --err
pm2 flush | pm2 reloadLogs
pm2 install pm2-logrotate

# 영속성
pm2 startup | pm2 save | pm2 resurrect | pm2 unstartup

# 데몬
pm2 ping | pm2 kill | pm2 update

# 기타
pm2 serve ./build 8080 --spa
pm2 trigger api <action>
pm2-runtime ecosystem.config.js
```

---

## 마치며

PM2를 "앱이 죽으면 살려주는 도구"로만 쓰면 절반만 쓰는 셈이다.

1. **선언적 설정**(ecosystem)으로 재현 가능하게 만들고,
2. **재시작 정책**을 의도적으로 설계하고,
3. **graceful start/shutdown**으로 진짜 무중단 배포를 구현하고,
4. **클러스터 모드의 상태 문제**를 아키텍처 차원에서 해결하고,
5. **로그와 부팅 영속성**을 셋업 단계에서 끝내 두는 것.

이 다섯 가지가 갖춰졌을 때 PM2는 비로소 "운영 도구"가 된다. 그리고 컨테이너 오케스트레이션으로 넘어가는 시점이 오면, PM2가 해주던 역할이 Kubernetes의 어떤 기능으로 옮겨가는지 [6편의 비교 표](/posts/pm2-06-docker-nginx-airgap)를 다시 떠올려 보자. 개념은 그대로이고, 책임지는 주체만 바뀔 뿐이다.

---

### 참고

- PM2 공식 문서: https://pm2.keymetrics.io/docs/usage/quick-start/
- What's New in PM2: https://pm2.keymetrics.io/docs/usage/whats-new/
- PM2 GitHub: https://github.com/Unitech/pm2
- Node.js Cluster 모듈: https://nodejs.org/api/cluster.html
