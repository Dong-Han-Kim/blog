---
# 📌 기본 메타데이터
title: 'Cron 완전 정복 4편 — systemd timer, Kubernetes CronJob, 분산 환경'
date: '2026-09-17'
category: 'linux'
tags: ['Linux', 'Cron', 'systemd', 'Kubernetes']
description: 'systemd timer 유닛 구성과 OnCalendar 문법, 컨테이너에서 cron이 깨지는 이유와 Kubernetes CronJob 필드, 수평 확장 시 중복 실행을 막는 분산 락, cron 보안과 운영 체크리스트.'

# 💬 옵션 필드
draft: false
series: 'Cron 완전 정복'
seriesOrder: 4

# 📚 SEO용
keywords: ['systemd timer', 'OnCalendar', 'Kubernetes CronJob', 'supercronic', 'ShedLock', '분산 락', 'GitHub Actions cron', 'Vercel Cron', 'cron 보안']
---

# Cron 완전 정복 4편 — systemd timer, Kubernetes CronJob, 분산 환경

여기까지가 서버 한 대의 cron입니다. 마지막 편은 도구와 규모가 커졌을 때의 이야기로, systemd timer와 컨테이너·Kubernetes, 여러 인스턴스의 중복 실행, 그리고 보안과 운영 체크리스트를 다룹니다.

## 8. systemd timer: cron의 현대적 대안

### 8.1 왜 systemd timer인가

| 항목 | cron | systemd timer |
|---|---|---|
| 로그 | 직접 구성 | journald에 자동 수집 |
| 중복 실행 | 직접 방지 | 같은 서비스는 동시에 한 번만 실행 |
| 놓친 실행 보정 | anacron 필요 | `Persistent=true` |
| 지터 | 직접 구현 | `RandomizedDelaySec` |
| 리소스 제한 | 없음 | CPU/메모리 제한, 샌드박싱 |
| 의존성 | 없음 | `After=network-online.target` 등 |
| 초 단위 | 불가 | 가능 |
| 설정 간결함 | 한 줄 | 파일 두 개 |

### 8.2 기본 구성

서비스 유닛(무엇을 실행할지)과 타이머 유닛(언제 실행할지) 두 파일로 구성됩니다.

```ini
# /etc/systemd/system/backup.service
[Unit]
Description=Nightly backup
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
User=backup
WorkingDirectory=/opt/backup
EnvironmentFile=/etc/backup/env
ExecStart=/opt/backup/run.sh
TimeoutStartSec=2h
CPUQuota=50%
MemoryMax=1G
Nice=10
```

```ini
# /etc/systemd/system/backup.timer
[Unit]
Description=Run backup daily

[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true
RandomizedDelaySec=10m

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now backup.timer

systemctl list-timers                 # 다음 실행 시각 확인
systemctl start backup.service        # 즉시 수동 실행
journalctl -u backup.service -n 100   # 로그 확인
```

### 8.3 OnCalendar 문법

형식은 `요일 연-월-일 시:분:초`입니다.

| cron | OnCalendar |
|---|---|
| `0 * * * *` | `hourly` 또는 `*-*-* *:00:00` |
| `30 2 * * *` | `*-*-* 02:30:00` |
| `0 9 * * 1-5` | `Mon..Fri *-*-* 09:00:00` |
| `*/15 * * * *` | `*:0/15` |
| `0 0 1 * *` | `monthly` 또는 `*-*-01 00:00:00` |
| (매월 말일) | `*-*~01 00:00:00` |
| (KST 기준) | `*-*-* 09:00:00 Asia/Seoul` |

cron으로 표현하기 어려웠던 "매월 말일"(`~01`)과 시간대 지정을 기본으로 지원합니다.

```bash
systemd-analyze calendar --iterations=5 "Mon..Fri *-*-* 09:00:00 Asia/Seoul"
```

### 8.4 간격 기반 타이머

"마지막 실행이 끝나고 5분 뒤"처럼 상대 시간도 지정할 수 있습니다. 작업 시간이 들쭉날쭉해도 중첩 없이 일정한 간격을 유지합니다.

```ini
[Timer]
OnBootSec=2min
OnUnitInactiveSec=5min
```

### 8.5 실패 알림

```ini
# backup.service
[Unit]
OnFailure=notify-failure@%n.service
```

```ini
# /etc/systemd/system/notify-failure@.service
[Service]
Type=oneshot
ExecStart=/opt/scripts/notify.sh "%i 실패"
```

### 8.6 무엇을 쓸까

간단한 사용자 작업이나 이식성이 중요하면 cron, 시스템 수준의 중요한 작업이나 리소스 제어와 로그 통합이 필요하면 systemd timer가 좋은 선택입니다.

---

## 9. 컨테이너와 Kubernetes CronJob

### 9.1 컨테이너 안에서 cron을 돌릴 때의 문제

- **환경변수가 전달되지 않습니다.** `docker run -e DB_URL=...`로 넣은 값을 cron 작업은 보지 못합니다.
- **로그가 `docker logs`에 나오지 않습니다.** 작업 출력이 컨테이너 stdout으로 가지 않습니다.
- **cron 데몬이 root 권한을 요구하는 경우가 많습니다.**
- 컨테이너의 시간대는 호스트와 다를 수 있습니다(보통 UTC).

흔히 쓰는 우회책은 다음과 같습니다.

```bash
# 작업 출력을 PID 1의 stdout으로 보내기
* * * * * /app/job.sh > /proc/1/fd/1 2>/proc/1/fd/2

# 엔트리포인트에서 환경변수를 파일로 덤프 후 작업에서 로드
printenv | grep -v "no_proxy" > /etc/environment
```

더 나은 방법은 컨테이너 친화적인 cron 구현인 **supercronic**을 쓰는 것입니다. 환경변수를 그대로 전달하고, 출력을 stdout으로 보내며, root 권한이 필요 없고, 이전 실행이 끝나지 않았으면 다음 실행을 건너뜁니다.

```dockerfile
# 바이너리는 공식 릴리스에서 버전을 고정해 설치하고 체크섬을 검증하세요
COPY crontab /app/crontab
CMD ["supercronic", "/app/crontab"]
```

Docker Compose 환경이라면 스케줄러 컨테이너 하나를 별도로 두고, 앱 컨테이너 여러 개에 cron을 넣지 않는 것이 원칙입니다.

### 9.2 Kubernetes CronJob

Kubernetes에서는 스케줄마다 **새 Job(과 Pod)을 생성**하는 CronJob 리소스를 씁니다.

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: nightly-report
spec:
  schedule: "0 9 * * 1-5"
  timeZone: "Asia/Seoul"
  concurrencyPolicy: Forbid
  startingDeadlineSeconds: 300
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 5
  jobTemplate:
    spec:
      backoffLimit: 2
      activeDeadlineSeconds: 3600
      ttlSecondsAfterFinished: 86400
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: report
              image: registry.example.com/report:1.4.2
              args: ["node", "jobs/report.js"]
              envFrom:
                - secretRef:
                    name: report-secrets
              resources:
                requests: { cpu: 100m, memory: 256Mi }
                limits: { memory: 512Mi }
```

| 필드 | 역할 | 권장 |
|---|---|---|
| `schedule` | 5필드 cron 표현식 | 표준 문법만 사용 |
| `timeZone` | 스케줄 기준 시간대 | 명시적으로 지정 (미지정 시 컨트롤러 기준, 보통 UTC) |
| `concurrencyPolicy` | 이전 Job 실행 중일 때 동작 | `Allow`(기본), `Forbid`(건너뜀), `Replace`(이전 것 종료) |
| `startingDeadlineSeconds` | 예정 시각을 놓쳤을 때 허용 지연 | 반드시 설정 |
| `backoffLimit` | Pod 실패 시 재시도 횟수 | 멱등 작업일 때만 여유 있게 |
| `activeDeadlineSeconds` | Job 전체 타임아웃 | 반드시 설정 |
| `ttlSecondsAfterFinished` | 완료된 Job 자동 정리 | 설정 권장 |
| `suspend` | 일시 중지 | 점검 시 활용 |

주의할 동작이 있습니다.

- **`startingDeadlineSeconds`를 설정하지 않으면** 컨트롤러는 마지막 스케줄 이후 놓친 실행 횟수를 세는데, 100회를 넘기면 Job을 더 이상 시작하지 않고 에러를 남깁니다. 1분 주기 작업이 컨트롤러 장애로 2시간 멈추면 이 상황이 됩니다.
- **CronJob은 정확히 한 번 실행을 보장하지 않습니다.** 드물게 Job이 두 번 생성되거나 생성되지 않을 수 있으므로 작업은 멱등해야 합니다.
- `concurrencyPolicy: Forbid`는 같은 CronJob의 Job끼리만 겹침을 막습니다.

```bash
kubectl get cronjob
kubectl create job --from=cronjob/nightly-report manual-run-1   # 수동 실행
kubectl patch cronjob nightly-report -p '{"spec":{"suspend":true}}'
kubectl logs job/manual-run-1
```

---

## 10. 애플리케이션 스케줄러와 분산 환경

### 10.1 cron 표현식 방언

같은 "cron 표현식"이라도 도구마다 필드 수가 다릅니다. 복사해서 붙여 넣을 때 가장 많이 틀리는 부분입니다.

| 도구 | 필드 | 형식 | 매일 09:00 |
|---|---|---|---|
| Unix cron, K8s | 5 | 분 시 일 월 요일 | `0 9 * * *` |
| Spring `@Scheduled` | 6 | **초** 분 시 일 월 요일 | `0 0 9 * * *` |
| Quartz | 6~7 | 초 분 시 일 월 요일 [년] | `0 0 9 * * ?` |
| node-cron | 5 또는 6 | [초] 분 시 일 월 요일 | `0 9 * * *` |
| GitHub Actions | 5 | Unix와 동일 | `0 0 * * *` (UTC 기준) |

Quartz 계열은 확장 문자를 지원합니다.

| 문자 | 의미 | 예시 |
|---|---|---|
| `?` | 값 지정 안 함 (일/요일 중 하나에 필수) | `0 0 9 ? * MON` |
| `L` | 마지막 | `0 0 0 L * ?` (매월 말일) |
| `W` | 가장 가까운 평일 | `0 0 9 15W * ?` |
| `#` | N번째 요일 | `0 0 9 ? * MON#2` (둘째 월요일) |

Spring은 5.3부터 `L`, `W`, `#`을 지원하며, `zone` 속성으로 시간대를 지정할 수 있습니다.

```java
@Scheduled(cron = "0 0 9 * * MON-FRI", zone = "Asia/Seoul")
public void morningReport() { ... }
```

### 10.2 수평 확장 시 중복 실행 문제

앱 내장 스케줄러의 가장 큰 함정은 **인스턴스 수만큼 작업이 실행된다**는 점입니다. 서버를 3대로 늘리는 순간 정산 작업이 세 번 돕니다.

**1) 스케줄러 전용 인스턴스 분리**

환경변수로 스케줄러 활성화 여부를 제어하고 한 곳에서만 켭니다. 가장 단순하지만 그 인스턴스가 단일 장애점이 됩니다.

**2) DB 기반 분산 락**

작업 시작 시 공유 DB에서 락을 획득한 인스턴스만 실행합니다. Spring에서는 ShedLock이 대표적입니다.

```java
@Scheduled(cron = "0 */10 * * * *")
@SchedulerLock(name = "syncOrders", lockAtMostFor = "9m", lockAtLeastFor = "1m")
public void syncOrders() { ... }
```

`lockAtMostFor`는 노드가 죽었을 때 락이 풀리는 최대 시간, `lockAtLeastFor`는 서버 간 시계 차이로 인한 중복을 막는 최소 보유 시간입니다.

PostgreSQL이라면 Advisory Lock으로 직접 구현할 수도 있습니다.

```sql
-- 락을 얻으면 true, 다른 세션이 잡고 있으면 false
SELECT pg_try_advisory_lock(hashtext('sync-orders'));
-- ... 작업 ...
SELECT pg_advisory_unlock(hashtext('sync-orders'));
```

Node.js 환경에서는 Redis의 `SET key value NX PX <ms>` 패턴이나 BullMQ의 반복 작업(repeatable job)을 활용할 수 있습니다.

**3) 외부 스케줄러 + 트리거**

cron, K8s CronJob, 클라우드 스케줄러가 HTTP 엔드포인트나 큐 메시지를 한 번만 발행하고, 앱은 실행만 담당합니다. 스케줄과 실행을 분리하는 구조입니다. 엔드포인트는 반드시 인증을 걸고, 중복 요청에도 안전하도록 멱등하게 만듭니다.

**4) 워크플로 오케스트레이터**

작업 간 의존성, 재시도, 백필(backfill), 실행 이력이 중요해지면 Airflow, Temporal, Argo Workflows 같은 도구가 적합합니다. cron으로 의존성 체인을 흉내 내기 시작했다면 넘어갈 시점입니다.

### 10.3 서버리스와 CI의 스케줄 기능

**GitHub Actions**

```yaml
on:
  schedule:
    - cron: "0 0 * * 1-5"   # 평일 UTC 00:00 = KST 09:00
  workflow_dispatch:         # 수동 실행 버튼
```

기본 기준 시간대가 UTC이고, 최소 간격은 5분이며, 부하가 몰리는 시각(특히 정각)에는 실행이 지연되거나 누락될 수 있습니다. 공개 저장소에서 일정 기간 활동이 없으면 예약 워크플로가 자동 비활성화됩니다. 정확한 시각이 중요한 운영 작업보다는 리포트 생성이나 의존성 점검 같은 작업에 알맞습니다. 세부 제약은 최신 공식 문서를 확인하세요.

**Vercel Cron Jobs 등 호스팅 플랫폼**

`vercel.json`에 경로와 스케줄을 등록하면 플랫폼이 해당 API 경로를 주기적으로 호출합니다. UTC 기준이고 플랜별 실행 빈도나 정밀도 제한이 있으므로 현재 문서를 확인하세요. 호출되는 엔드포인트는 외부에서도 접근 가능하므로 시크릿 헤더를 검증해야 합니다.

```ts
// app/api/cron/cleanup/route.ts
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  // 멱등한 정리 작업
  return Response.json({ ok: true });
}
```

---

## 11. 보안

cron은 권한을 가진 채 **사람이 보지 않는 시간에** 명령을 실행합니다. 공격자 입장에서 매력적인 지점입니다.

**권한 상승 경로를 막는다.** root crontab이 실행하는 스크립트를 일반 사용자가 수정할 수 있다면, 그 사용자는 사실상 root입니다. 스크립트 파일뿐 아니라 **상위 디렉터리와 스크립트가 source하는 파일**의 권한까지 확인하세요.

```bash
ls -la /opt/scripts/backup.sh
namei -l /opt/scripts/backup.sh   # 경로상 모든 디렉터리 권한 확인
```

**최소 권한으로 실행한다.** 모든 작업을 root로 돌리지 말고 전용 서비스 계정을 만드세요. systemd timer라면 `User=`, `ProtectSystem=strict`, `PrivateTmp=true` 같은 샌드박싱 옵션을 활용할 수 있습니다.

**비밀 정보를 crontab에 넣지 않는다.** 명령행 인자는 `ps`로 다른 사용자에게 보이고, crontab은 백업이나 설정 관리 도구에 그대로 복사됩니다. 권한 600의 환경 파일, 시크릿 관리 도구, K8s Secret을 사용하세요.

**crontab 변경을 감시한다.** 공격자가 지속성(persistence)을 확보하기 위해 가장 먼저 건드리는 곳 중 하나가 crontab입니다.

```bash
# auditd 규칙 예시
-w /etc/crontab -p wa -k cron_changes
-w /etc/cron.d/ -p wa -k cron_changes
-w /var/spool/cron/ -p wa -k cron_changes
```

**접근을 제한한다.** `/etc/cron.allow`로 crontab을 쓸 수 있는 사용자를 명시적으로 지정합니다.

**정기 점검한다.**

```bash
# 모든 사용자 crontab
for u in $(cut -d: -f1 /etc/passwd); do
  out=$(crontab -l -u "$u" 2>/dev/null) && echo "== $u ==" && echo "$out"
done
# 시스템 crontab
cat /etc/crontab; ls -la /etc/cron.d /etc/cron.*ly
# systemd timer
systemctl list-timers --all
```

---

## 12. 운영 체크리스트

**스케줄**
- [ ] 서버/컨트롤러의 시간대를 확인했는가
- [ ] 자정 근처 스케줄의 날짜·요일 변환을 검증했는가
- [ ] 일/요일 필드를 동시에 제한하지 않았는가 (OR 함정)
- [ ] 여러 작업이 같은 시각에 몰리지 않는가

**실행 환경**
- [ ] 명령과 파일을 절대 경로로 지정했는가
- [ ] PATH, SHELL, 작업 디렉터리, 앱 환경변수를 명시했는가
- [ ] `%` 문자를 이스케이프했거나 스크립트로 분리했는가
- [ ] cron 환경(`env -i`)에서 실행을 재현해 봤는가

**신뢰성**
- [ ] 중복 실행 방지(flock, `concurrencyPolicy`, 분산 락)가 있는가
- [ ] 타임아웃이 실행 주기보다 짧게 설정됐는가
- [ ] 여러 번 실행되어도 안전한가 (멱등성)
- [ ] 처리 구간을 인자로 받아 재처리할 수 있는가
- [ ] 결과물을 원자적으로 생성하는가

**관측성**
- [ ] 표준 출력/에러가 수집되는가
- [ ] 로그 로테이션이 설정됐는가
- [ ] 실패 시 알림을 받는가
- [ ] 실행되지 않았을 때도 알 수 있는가 (dead man's switch)

**보안과 관리**
- [ ] 최소 권한 계정으로 실행하는가
- [ ] 스크립트와 상위 디렉터리 권한이 안전한가
- [ ] 비밀 정보가 crontab에 노출되지 않았는가
- [ ] crontab/유닛 파일이 Git으로 관리되는가
- [ ] 작업의 목적, 담당자, 실패 시 대응 방법이 문서화됐는가

**확장**
- [ ] 서버가 여러 대로 늘어나도 한 번만 실행되는가

---

## 마치며

cron의 문법은 10분이면 익힐 수 있지만, 운영에서 신뢰할 수 있는 배치 작업을 만드는 것은 별개의 문제입니다. 핵심을 세 줄로 정리하면 다음과 같습니다.

1. **cron은 실행만 한다.** 중복 방지, 타임아웃, 모니터링은 직접 채워야 한다.
2. **환경과 시간대를 가정하지 않는다.** 모든 것을 명시하고 cron 환경에서 검증한다.
3. **작업은 멱등하게, 결과는 관측 가능하게 만든다.** 그래야 재실행과 확장이 두렵지 않다.

규모가 커지면 systemd timer, Kubernetes CronJob, 분산 락, 워크플로 오케스트레이터로 자연스럽게 넘어가게 됩니다. 도구는 바뀌어도 이 원칙은 그대로 적용됩니다.

## 더 깊이

- 이 편 9장에서 CronJob 매니페스트로만 만난 Pod, Job, 클러스터 운영을 처음부터 다룬 글은 [풀스택 개발자를 위한 인프라 9강 — 쿠버네티스](/posts/infra-09-kubernetes)입니다.
