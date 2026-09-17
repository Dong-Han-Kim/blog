---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 CI/CD 8강 — 배포 전략, 롤백, DB 마이그레이션'
date: '2026-09-17'
category: 'devops'
tags: ['CI/CD', 'Deployment', 'Blue-Green', 'Database Migration']
description: 'Recreate·Rolling·Blue-Green·Canary·기능 플래그를 비교하고 단일 서버 Blue-Green을 직접 구현합니다. 롤백의 세 가지 방식과, 구·신 버전이 공존하는 시간을 전제로 한 Expand-Contract DB 마이그레이션까지 설계합니다.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 CI/CD'
seriesOrder: 8

# 📚 SEO용
keywords: ['배포 전략', 'Rolling', 'Blue-Green', 'Canary', 'Feature Flag', '롤백', 'DB 마이그레이션', 'Expand-Contract', '무중단 배포']
---
# 풀스택 개발자를 위한 CI/CD 8강 — 배포 전략, 롤백, DB 마이그레이션

> 풀스택 개발자를 위한 CI/CD 시리즈 · 심화 8/13

배포를 자동화했다면 다음 질문은 "배포하는 동안 사용자는 무엇을 겪는가"와 "문제가 생기면 어떻게 되돌리는가"입니다. 그리고 풀스택 개발자에게 가장 어려운 질문이 남아 있습니다. **데이터베이스는 어떻게 함께 바꾸는가**입니다.

## 1. 배포 전략 비교

| 전략 | 방식 | 장점 | 단점 |
|---|---|---|---|
| **Recreate** | 구버전 중지 → 신버전 시작 | 가장 단순, 두 버전 공존 없음 | 중단 시간 발생 |
| **Rolling** | 인스턴스를 하나씩 교체 | 추가 자원 적음, 무중단 | 교체 중 두 버전 공존, 롤백도 점진적 |
| **Blue-Green** | 신버전 환경을 옆에 띄우고 트래픽을 한 번에 전환 | 즉시 전환·즉시 롤백 | 순간적으로 자원 2배 |
| **Canary** | 신버전에 일부 트래픽(예: 5%)만 보낸 뒤 점차 확대 | 위험을 작은 범위로 제한 | 트래픽 제어와 지표 분석 필요 |
| **Feature Flag** | 코드는 배포하되 기능은 설정으로 켜고 끔 | 배포와 릴리스 분리 | 플래그 관리 부채 |

6강의 `docker compose up -d`는 사실상 Recreate입니다. 컨테이너가 교체되는 몇 초 동안 요청이 실패할 수 있습니다.

**중요한 공통점**: Recreate를 제외한 모든 전략에서 **구버전과 신버전이 동시에 동작하는 시간**이 있습니다. 이 사실이 DB 마이그레이션 설계의 출발점이 됩니다.

## 2. 무중단의 전제 조건

전략보다 먼저 앱이 갖춰야 할 조건이 있습니다.

### Readiness와 Liveness

- **Readiness**: "요청을 받을 준비가 되었나?" DB 연결, 캐시 준비가 끝나야 true입니다. false면 트래픽을 보내지 않습니다.
- **Liveness**: "프로세스가 살아 있나?" false가 지속되면 재시작합니다.

두 개를 구분하지 않으면, DB가 잠깐 느려졌을 때 모든 인스턴스가 재시작되는 연쇄 장애가 생길 수 있습니다. Liveness에는 외부 의존성 검사를 넣지 않는 것이 일반적입니다.

### Graceful Shutdown

교체되는 구버전은 **처리 중인 요청을 마치고** 종료되어야 합니다.

```
1. 로드밸런서/프록시에서 구버전을 트래픽 대상에서 제외
2. SIGTERM 수신 → 새 요청 거부, 처리 중인 요청 완료 대기
3. DB 커넥션 등 자원 정리 후 종료
4. 유예 시간(stop_grace_period)이 지나면 SIGKILL
```

5강에서 CMD를 exec 형식으로 쓴 이유가 여기 있습니다. 셸이 PID 1이면 SIGTERM이 앱에 전달되지 않아 곧바로 강제 종료됩니다. 커스텀 서버를 쓴다면 SIGTERM 핸들러를 직접 구현합니다.

```ts
process.on('SIGTERM', () => {
  server.close(async () => {
    await db.end();
    process.exit(0);
  });
});
```

## 3. 단일 서버 Blue-Green 구현

Kubernetes 없이 서버 한 대에서도 Blue-Green을 만들 수 있습니다.

```
            ┌────────── Nginx ──────────┐
요청 ──────▶│ upstream → active.conf    │
            └──────┬──────────────┬─────┘
                   ▼              ▼
             app-blue:3001   app-green:3002
```

```yaml
# compose.yaml
services:
  app-blue:
    image: ghcr.io/my-org/my-app:${BLUE_TAG:-initial}
    env_file: .env
    ports: ["127.0.0.1:3001:3000"]
    restart: unless-stopped
  app-green:
    image: ghcr.io/my-org/my-app:${GREEN_TAG:-initial}
    env_file: .env
    ports: ["127.0.0.1:3002:3000"]
    restart: unless-stopped
```

```nginx
# /etc/nginx/conf.d/app.conf
include /etc/nginx/app/active.conf;   # upstream 정의가 들어 있는 파일

server {
    listen 443 ssl;
    server_name app.example.com;
    location / {
        proxy_pass http://app_active;
    }
}
```

```bash
#!/usr/bin/env bash
# blue-green-deploy.sh <새 태그>
set -euo pipefail
NEW_TAG="$1"
cd /srv/app

ACTIVE=$(cat active_color 2>/dev/null || echo blue)
if [[ "$ACTIVE" == "blue" ]]; then TARGET=green; PORT=3002; else TARGET=blue; PORT=3001; fi

# 1. 비활성 색의 태그만 갱신하고 새 버전 기동
touch tags.env
{ grep -v "^${TARGET^^}_TAG=" tags.env || true; echo "${TARGET^^}_TAG=$NEW_TAG"; } > tags.env.tmp
mv tags.env.tmp tags.env
docker compose --env-file tags.env pull "app-$TARGET"
docker compose --env-file tags.env up -d --no-deps "app-$TARGET"

# 2. 새 버전 헬스체크
for i in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:$PORT/api/health" | grep -q "$NEW_TAG" && break
  [[ $i -eq 30 ]] && { echo "헬스체크 실패, 전환하지 않음" >&2; exit 1; }
  sleep 2
done

# 3. 트래픽 전환 (설정 검증 후 무중단 reload)
echo "upstream app_active { server 127.0.0.1:$PORT; }" | sudo tee /etc/nginx/app/active.conf > /dev/null
sudo nginx -t && sudo systemctl reload nginx
echo "$TARGET" > active_color
echo "$(date -Iseconds) $TARGET $NEW_TAG" >> releases.log

# 4. 구버전은 즉시 롤백할 수 있도록 일정 시간 유지 후 수동/예약 정리
echo "전환 완료: $ACTIVE → $TARGET"
```

- `tags.env`에는 `BLUE_TAG`, `GREEN_TAG`가 함께 기록되어, 한쪽을 갱신해도 다른 쪽 태그가 유지됩니다.
- 헬스체크에 실패하면 **트래픽을 전환하지 않으므로** 사용자는 영향을 받지 않습니다.
- Nginx `reload`는 기존 연결을 끊지 않고 새 설정을 적용합니다.
- **롤백은 upstream을 이전 포트로 되돌리고 reload하는 것**뿐이라 수 초면 끝납니다.

## 4. 롤백의 세 가지 방식

| 방식 | 설명 | 사용 시점 |
|---|---|---|
| **트래픽 롤백** | Blue-Green에서 이전 환경으로 전환 | 가장 빠름. 이전 환경이 살아 있을 때 |
| **재배포 롤백** | 이전 이미지 태그로 다시 배포 | 일반적인 방법 |
| **Roll Forward** | 수정 커밋을 빠르게 배포 | 롤백이 불가능하거나 더 위험할 때 |

그리고 롤백을 **불가능하게 만드는 것이 거의 항상 데이터베이스**입니다. 새 버전이 컬럼을 삭제했다면, 이전 이미지로 돌아가도 이전 코드가 찾는 컬럼이 없습니다.

## 5. 자동 롤백

배포 직후 지표를 확인하고 이상하면 자동으로 되돌릴 수 있습니다.

```yaml
      - name: 배포
        run: ssh deploy@"$HOST" "/srv/app/deploy.sh $TAG"

      - name: 배포 후 검증 (5분간 스모크 테스트)
        id: verify
        run: ./scripts/post-deploy-check.sh https://app.example.com 300

      - name: 검증 실패 시 롤백
        if: failure() && steps.verify.outcome == 'failure'
        run: ssh deploy@"$HOST" "/srv/app/rollback.sh"
```

검증 스크립트는 헬스체크뿐 아니라 핵심 API 응답, 오류율 같은 지표를 확인합니다. 모니터링 시스템(Prometheus, Datadog 등)의 오류율을 조회해 판단하면 더 신뢰할 수 있습니다.

## 6. DB 마이그레이션의 기본 원칙

### 마이그레이션 도구

| 생태계 | 도구 |
|---|---|
| Node.js | Prisma Migrate, Drizzle Kit, Knex, TypeORM |
| Java | Flyway, Liquibase |
| 범용 | Atlas, dbmate, sqitch |

어떤 도구든 원칙은 같습니다. **스키마 변경을 버전이 붙은 파일로 저장소에 커밋**하고, 도구가 "어디까지 적용되었는지"를 DB의 이력 테이블에 기록합니다.

### 파이프라인에서의 위치

```
이미지 빌드 → [마이그레이션 실행] → 앱 배포 → 검증
```

- 마이그레이션은 **앱 시작 시 자동 실행하지 않고, 별도 단계로 한 번만** 실행합니다. 인스턴스가 여러 개면 동시에 마이그레이션을 시도하는 경쟁이 생깁니다.
- 마이그레이션 실행에도 **같은 이미지**를 씁니다. 버전이 어긋나지 않습니다.

```bash
docker run --rm --env-file .env ghcr.io/my-org/my-app:$TAG npx prisma migrate deploy
```

- 운영 마이그레이션 job에는 Environment 승인을 걸고, 실행 전에 **백업 또는 스냅샷**을 확보합니다.
- 운영과 유사한 데이터로 스테이징에서 먼저 실행해 **소요 시간과 잠금**을 확인합니다. 로컬의 빈 테이블에서 1초 걸린 마이그레이션이 운영의 수천만 건 테이블에서는 몇 시간 동안 테이블을 잠글 수 있습니다.

## 7. Expand-Contract 패턴

무중단 배포 중에는 **구버전 코드와 신버전 코드가 같은 DB를 동시에 사용**합니다. 따라서 모든 스키마 변경은 **양쪽 버전과 호환**되어야 합니다. 이를 위한 방법이 Expand-Contract(Parallel Change) 패턴입니다.

### 예시: `users.name` 컬럼을 `full_name`으로 이름 변경

한 번에 `RENAME COLUMN`을 하면, 교체 중인 구버전 인스턴스가 `name`을 찾다가 오류를 냅니다. 대신 다섯 번의 안전한 단계로 나눕니다.

```
단계 1. Expand (스키마 확장)
  마이그레이션: ALTER TABLE users ADD COLUMN full_name VARCHAR(100) NULL;
  코드 v2    : 쓰기 → name과 full_name 둘 다 / 읽기 → name
  ✔ v1(구버전)은 새 컬럼을 모르지만 문제없음

단계 2. Backfill (데이터 이관)
  배치: UPDATE users SET full_name = name WHERE full_name IS NULL;
  (대량이면 1000건씩 나눠 실행해 잠금 최소화)

단계 3. 읽기 전환
  코드 v3    : 쓰기 → 둘 다 / 읽기 → full_name
  ✔ 문제가 생기면 v2로 롤백 가능 (name도 계속 채워지고 있으므로)

단계 4. 이전 컬럼 쓰기 중단
  코드 v4    : 쓰기·읽기 → full_name만
  ✔ 충분한 관찰 기간을 둠

단계 5. Contract (스키마 축소)
  마이그레이션: ALTER TABLE users DROP COLUMN name;
  ✔ name을 쓰는 코드가 운영에 하나도 없음을 확인한 뒤 실행
```

번거로워 보이지만, **모든 단계에서 롤백이 가능**하다는 것이 핵심입니다.

### 변경 유형별 안전 가이드

| 변경 | 안전한가 | 방법 |
|---|---|---|
| 테이블/컬럼 추가 (NULL 허용) | ✅ | 바로 적용 |
| NOT NULL 컬럼 추가 | ⚠️ | NULL 허용으로 추가 → 백필 → 제약 추가 |
| 컬럼 삭제 | ⚠️ | 코드에서 사용 제거 배포 후, 다음 릴리스에서 삭제 |
| 컬럼/테이블 이름 변경 | ❌ | Expand-Contract |
| 컬럼 타입 변경 | ❌ | 새 컬럼 추가 후 Expand-Contract |
| 인덱스 추가 | ⚠️ | 온라인 방식 사용 (PostgreSQL `CREATE INDEX CONCURRENTLY`, Oracle `ONLINE` 옵션 등) |
| 제약 조건 추가 | ⚠️ | 검증을 분리할 수 있는 DB 기능 활용 (예: PostgreSQL `NOT VALID` 후 `VALIDATE`) |

### 마이그레이션 규칙 요약

1. **한 릴리스에서 스키마 파괴적 변경과 그에 의존하는 코드 변경을 함께 하지 않는다.**
2. 마이그레이션은 **앱 배포보다 먼저** 실행되고, 이전 버전 코드와 호환되어야 한다.
3. 컬럼 삭제는 **최소 한 릴리스 뒤에** 한다.
4. 대량 데이터 변경은 스키마 변경과 분리해 **나눠서** 실행한다.
5. down 마이그레이션에 의존하지 않는다. 데이터가 사라지는 변경은 down으로도 되돌릴 수 없다. **앞으로 고치는(roll forward) 것이 기본**이다.

## 8. 기능 플래그: 배포와 릴리스의 분리

```ts
if (await flags.isEnabled('new-kpi-dashboard', { userId })) {
  return <NewDashboard />;
}
return <LegacyDashboard />;
```

- 코드는 main에 계속 통합·배포하되, 기능은 꺼 둔 채로 둡니다(dark launch).
- 내부 사용자 → 일부 사용자 → 전체 순으로 켜서 **코드 수준의 카나리**를 만듭니다.
- 문제가 생기면 **배포 없이** 플래그를 끕니다.
- 다 켠 플래그는 반드시 코드에서 제거합니다. 남은 플래그는 기술 부채입니다.

## 9. 정리

- 무중단 전략에서는 구버전과 신버전이 동시에 실행되는 시간이 반드시 존재합니다.
- Readiness/Liveness 구분과 Graceful Shutdown이 무중단의 전제입니다.
- 단일 서버에서도 Nginx upstream 전환으로 Blue-Green과 즉시 롤백을 구현할 수 있습니다.
- DB 마이그레이션은 별도 단계로 한 번만 실행하고, 항상 이전 코드와 호환되게 만듭니다.
- 파괴적 변경은 Expand-Contract로 나누어 모든 단계에서 롤백 가능하게 유지합니다.
- 기능 플래그로 배포와 릴리스를 분리할 수 있습니다.

## 확인 문제와 해설

**Q1.** 새 버전에서 `orders.status` 컬럼을 삭제하는 마이그레이션과 해당 컬럼을 안 쓰는 코드를 함께 배포했습니다. 롤링 배포 중 어떤 일이 생길까요?

> 마이그레이션이 먼저 적용되면, 아직 교체되지 않은 구버전 인스턴스가 `status` 컬럼을 조회하다가 오류를 냅니다. 이후 롤백해도 컬럼이 없어 복구되지 않습니다. 코드에서 사용을 먼저 제거하고, 다음 릴리스에서 컬럼을 삭제해야 합니다.

**Q2.** 앱 컨테이너의 시작 명령에 `prisma migrate deploy && node server.js`를 넣었습니다. 인스턴스가 3개일 때 어떤 문제가 있나요?

> 세 인스턴스가 동시에 마이그레이션을 시도해 경쟁이 생길 수 있고, 마이그레이션 실패가 곧 앱 시작 실패로 이어져 장애 범위가 커집니다. 마이그레이션은 배포 전 별도 단계에서 한 번만 실행해야 합니다.

**Q3.** Blue-Green 전환 직후 오류가 급증했습니다. 가장 빠른 복구 방법은요?

> 이전 색(구버전)이 아직 실행 중이므로 Nginx upstream을 이전 포트로 되돌리고 reload합니다. 이미지 재배포보다 훨씬 빠릅니다.

## 더 깊이

- Expand–Contract를 스키마 설계자 입장에서 정리한 글은 [DB 설계 A to Z 22강 — 스키마 진화](/posts/db-design-22-schema-evolution)입니다.
