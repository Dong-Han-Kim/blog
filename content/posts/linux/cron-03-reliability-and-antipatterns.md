---
# 📌 기본 메타데이터
title: 'Cron 완전 정복 3편 — 신뢰성 패턴과 안티패턴'
date: '2026-09-17'
category: 'linux'
tags: ['Linux', 'Cron', '배치', '서버운영']
description: 'flock 중복 실행 방지, 타임아웃, 멱등성, 원자적 결과 생성, 엄격한 스크립트, 실행 모니터링, 지터, 로그 관리까지 여덟 가지 패턴과 완성형 래퍼 템플릿, 그리고 안티패턴 13가지.'

# 💬 옵션 필드
draft: false
series: 'Cron 완전 정복'
seriesOrder: 3

# 📚 SEO용
keywords: ['cron', 'flock', '멱등성', 'idempotency', 'timeout', '배치 작업', 'dead man switch', '안티패턴', 'logrotate', 'set -euo pipefail']
---

# Cron 완전 정복 3편 — 신뢰성 패턴과 안티패턴

실행 환경까지 맞췄다면 이제 작업이 겹쳐 돌거나, 멈춰 있거나, 조용히 실패하는 문제가 남습니다. 이번 편은 운영 수준의 배치 작업에 필요한 패턴과, 반대로 피해야 할 안티패턴을 모았습니다.

## 6. 신뢰성 패턴

cron은 "실행"만 책임집니다. 운영 수준의 배치 작업이 되려면 다음 패턴이 필요합니다.

### 6.1 패턴 1: 중복 실행 방지 (Locking)

5분마다 도는 작업이 어느 날 7분 걸리면 두 인스턴스가 동시에 돌게 됩니다. 데이터 중복, 락 경합, 리소스 고갈로 이어지고, 늦어질수록 더 겹치는 악순환이 생깁니다.

```bash
# 락을 못 잡으면 즉시 종료 (-n)
*/5 * * * * flock -n /var/lock/sync.lock /opt/scripts/sync.sh
```

```bash
#!/usr/bin/env bash
# 스크립트 내부에서 잡는 방식
exec 9>/var/lock/sync.lock
if ! flock -n 9; then
  echo "이전 실행이 아직 진행 중. 건너뜀" >&2
  exit 0
fi
# ... 실제 작업
```

`flock`은 프로세스가 종료되면 커널이 락을 자동 해제합니다. PID 파일 방식은 비정상 종료 시 파일이 남아 영원히 실행되지 않는 문제가 있으므로 `flock`이 더 안전합니다.

단, `flock`은 **한 서버 안에서만** 유효합니다. 여러 서버에서 같은 작업이 돈다면 [4편의 분산 락](/posts/cron-04-systemd-k8s-distributed)이 필요합니다.

### 6.2 패턴 2: 타임아웃

외부 API가 응답하지 않으면 작업은 영원히 멈춰 있고, 락도 영원히 잡혀 있습니다.

```bash
*/5 * * * * flock -n /var/lock/sync.lock timeout 4m /opt/scripts/sync.sh
```

타임아웃은 **실행 주기보다 짧게** 잡는 것이 원칙입니다. `timeout`은 기본적으로 SIGTERM을 보내므로, 정리 작업이 필요하면 `trap`으로 처리합니다.

```bash
trap 'echo "중단됨, 임시 파일 정리"; rm -f "$TMPFILE"' TERM INT
```

### 6.3 패턴 3: 멱등성 (Idempotency)

cron 작업은 **여러 번 실행되어도 결과가 같도록** 설계해야 합니다. 재시도, 수동 재실행, DST 중복 실행, 장애 복구 후 재처리가 모두 안전해집니다.

| 비멱등 설계 | 멱등 설계 |
|---|---|
| 실행될 때마다 어제 데이터를 INSERT | 특정 날짜 데이터를 UPSERT, 또는 해당 날짜 삭제 후 INSERT (트랜잭션) |
| 처리한 파일을 옮긴다 (중간 실패 시 일부만 이동) | 처리 완료 표시를 남기고, 표시 없는 파일만 처리 |
| 현재 시각 기준 최근 1시간 | 명시적인 처리 구간(파라미터) |

처리 대상을 "실행 시각"에서 유도하면 지연 실행이나 재실행 시 구간이 어긋납니다. **처리 구간을 인자로 받도록** 만들면 누락 구간을 수동으로 다시 돌리기 쉬워집니다.

```bash
# 기본값은 어제, 필요 시 날짜 지정해 재처리
TARGET_DATE="${1:-$(date -d yesterday +%F)}"
```

### 6.4 패턴 4: 원자적 결과 생성

작업 도중 실패하면 반쯤 쓰인 파일이 남고, 다른 프로세스가 그걸 읽어갈 수 있습니다. 임시 파일에 쓴 뒤 `mv`로 교체합니다. 같은 파일시스템 안의 `mv`는 원자적입니다.

```bash
TMP=$(mktemp /data/report.XXXXXX)
generate_report > "$TMP"
mv "$TMP" /data/report.csv
```

### 6.5 패턴 5: 엄격한 스크립트와 종료 코드

```bash
#!/usr/bin/env bash
set -euo pipefail
# -e: 명령 실패 시 즉시 종료
# -u: 정의되지 않은 변수 사용 시 오류
# -o pipefail: 파이프 중간 실패도 감지
```

스크립트가 실패를 정확한 종료 코드로 알려야 모니터링이 가능합니다. `|| true`로 에러를 삼키는 코드는 신중하게 사용하세요.

### 6.6 패턴 6: 실행 모니터링 (Dead Man's Switch)

로그만으로는 **작업이 실행되지 않은 사실**을 알 수 없습니다. cron 데몬이 죽었거나, crontab이 지워졌거나, 서버가 교체된 경우 로그 자체가 생기지 않기 때문입니다.

해결책은 **작업이 성공할 때마다 외부 모니터에 신호를 보내고, 신호가 끊기면 알림을 받는** 구조입니다. Healthchecks.io 같은 서비스나 Uptime Kuma의 Push 모니터, Prometheus Pushgateway 등을 사용할 수 있습니다.

```bash
0 3 * * * /opt/scripts/backup.sh && curl -fsS -m 10 --retry 3 -o /dev/null https://monitor.example.com/ping/<uuid>
```

시작과 실패도 함께 보고하면 실행 시간과 실패까지 추적할 수 있습니다.

```bash
#!/usr/bin/env bash
PING=https://monitor.example.com/ping/<uuid>
curl -fsS -m 10 -o /dev/null "$PING/start"
if /opt/scripts/backup-core.sh; then
  curl -fsS -m 10 -o /dev/null "$PING"
else
  curl -fsS -m 10 -o /dev/null "$PING/fail"
fi
```

외부로 나갈 수 없는 폐쇄망이라면 내부 모니터링 서버를 두거나, "마지막 성공 시각"을 파일이나 DB에 기록하고 별도 점검 작업이 그 값을 확인하는 방식으로 같은 효과를 낼 수 있습니다.

### 6.7 패턴 7: 지터 (Jitter)

수백 대의 서버가 모두 `0 0 * * *`에 백업을 시작하면 스토리지와 네트워크가 한순간에 몰립니다(Thundering Herd).

```bash
SHELL=/bin/bash
# %를 escape하지 않으면 cron이 줄바꿈으로 바꿔 "sleep $((RANDOM " 에서 잘린다
0 0 * * * sleep $((RANDOM \% 900)); /opt/scripts/backup.sh
```

여기서 `\%`는 [2편에서 본 `%` 함정](/posts/cron-02-execution-environment) 그 자체입니다. crontab 명령부의 `%`는 줄바꿈으로 변환되므로, 이스케이프하지 않으면 `sleep $((RANDOM `에서 명령이 잘립니다. 나머지는 표준 입력으로 넘어갑니다. 이런 표현이 길어지면 래퍼 스크립트로 빼는 편이 안전합니다.

```bash
# 대안: 지터를 래퍼 스크립트 안으로 옮기면 %를 신경 쓸 필요가 없다
0 0 * * * /opt/scripts/backup-with-jitter.sh
```

`$RANDOM`은 bash 기능이므로 `SHELL=/bin/bash`가 필요합니다. 서버마다 다른 분(minute)을 설정 관리 도구로 배정하는 방법도 좋습니다. 외부 API를 호출하는 작업이라면 정각 대신 `7`분, `23`분처럼 애매한 시각을 고르는 것만으로도 혼잡을 피할 수 있습니다.

### 6.8 패턴 8: 로그 관리

```
# /etc/logrotate.d/cron-jobs
/var/log/job.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
    copytruncate
}
```

로그에는 시작 시각, 종료 시각, 처리 건수, 소요 시간을 남기세요.

```bash
log() { echo "[$(date '+%F %T')] $*"; }
log "시작"
# ...
log "완료: ${COUNT}건, ${SECONDS}초"
```

### 6.9 완성형 템플릿

```bash
#!/usr/bin/env bash
# /opt/jobs/bin/run-job.sh <job-name> <command...>
set -euo pipefail

JOB="$1"; shift
LOCK="/var/lock/${JOB}.lock"
LOG="/var/log/jobs/${JOB}.log"
TIMEOUT="${JOB_TIMEOUT:-30m}"

export PATH=/usr/local/bin:/usr/bin:/bin
mkdir -p "$(dirname "$LOG")"
exec >>"$LOG" 2>&1

log() { echo "[$(date '+%F %T')] [$JOB] $*"; }

exec 9>"$LOCK"
if ! flock -n 9; then
  log "이전 실행 진행 중, 건너뜀"
  exit 0
fi

log "시작"
start=$(date +%s)
if timeout "$TIMEOUT" "$@"; then
  log "성공 ($(( $(date +%s) - start ))초)"
else
  code=$?
  log "실패 (exit=$code, $(( $(date +%s) - start ))초)"
  exit "$code"
fi
```

```bash
# crontab
SHELL=/bin/bash
MAILTO=""
*/10 * * * * /opt/jobs/bin/run-job.sh sync-orders /opt/app/jobs/sync-orders.sh
30 2 * * *   JOB_TIMEOUT=2h /opt/jobs/bin/run-job.sh backup /opt/app/jobs/backup.sh
```

---

## 7. 안티패턴 모음

| 안티패턴 | 증상 | 개선 |
|---|---|---|
| 긴 명령을 crontab에 직접 작성 | 읽기 어렵고, `%` 문제, 테스트 불가 | 스크립트로 분리하고 crontab은 한 줄 |
| 상대 경로, PATH 의존 | 수동 실행은 되는데 cron에서 실패 | 절대 경로, 래퍼에서 환경 구성 |
| 출력을 `> /dev/null 2>&1`로 전부 버림 | 실패 원인을 알 수 없음 | 로그 파일 또는 journald로 수집 |
| 락 없는 짧은 주기 작업 | 작업 중첩, 데이터 중복 | `flock` + `timeout` |
| 실패 감지 없음 | 몇 주 뒤에야 백업이 안 된 걸 발견 | Dead man's switch 모니터링 |
| 모든 작업이 정각 실행 | 자원 경합, 외부 API 제한 | 지터, 시각 분산 |
| 시간대 가정 | 9시간 어긋난 실행 | 서버 TZ 확인, UTC 통일 |
| 수평 확장 서버마다 같은 crontab | 작업이 N번 실행 | 전용 배치 서버 또는 분산 락 |
| 1분 미만 주기를 `sleep`으로 흉내 | 드리프트, 중첩 | systemd timer 또는 상주 워커 |
| crontab을 서버에서 직접 수정 | 변경 이력 없음, 서버 교체 시 유실 | Git으로 관리하고 배포로 적용 |
| 처리 구간을 실행 시각에 의존 | 지연·재실행 시 데이터 구간 누락 | 처리 구간을 인자로 받는 멱등 설계 |
| 비밀번호를 crontab 명령에 직접 기입 | `ps`, 로그, 백업에 노출 | 권한 제한된 환경 파일, 시크릿 관리 도구 |
| cron을 큐 대신 사용 | 매 분 DB 폴링, 지연과 부하 | 이벤트 기반 처리나 메시지 큐 |

마지막 항목은 설계 수준의 이야기입니다. "주문이 들어오면 처리"처럼 **이벤트가 트리거인 작업**을 매 분 cron 폴링으로 구현하면 최대 1분의 지연과 불필요한 DB 부하가 생깁니다. cron은 **시간이 트리거인 작업**에 쓰는 도구입니다.
