---
# 📌 기본 메타데이터
title: 'Cron 완전 정복 2편 — 실행 환경의 함정과 시간대·서머타임'
date: '2026-09-17'
category: 'linux'
tags: ['Linux', 'Cron', 'Crontab', '서버운영']
description: 'PATH와 셸이 최소한인 cron 환경, 퍼센트 문자의 함정, 출력과 로그 수집, cron 환경 재현법. 그리고 UTC 서버에서 KST 스케줄이 9시간 어긋나는 사고와 서머타임.'

# 💬 옵션 필드
draft: false
series: 'Cron 완전 정복'
seriesOrder: 2

# 📚 SEO용
keywords: ['cron', 'crontab', 'PATH', 'MAILTO', 'cron 환경변수', 'CRON_TZ', '시간대', '서머타임', 'DST', 'timedatectl']
---

# Cron 완전 정복 2편 — 실행 환경의 함정과 시간대·서머타임

1편에서 표현식과 crontab 관리를 다뤘습니다. 이번 편은 "터미널에서는 되는데 cron에서는 안 되는" 문제의 진원지인 실행 환경과, 스케줄이 통째로 어긋나는 시간대 문제를 봅니다.

## 4. 실행 환경: 가장 많이 막히는 부분

"터미널에서는 잘 되는데 cron에서는 안 돼요"의 원인은 거의 전부 여기에 있습니다.

### 4.1 cron의 환경은 최소한이다

cron은 로그인 셸이 아니므로 `.bashrc`, `.profile`을 읽지 않습니다. 대략 이 정도만 설정된 상태로 실행됩니다.

```
SHELL=/bin/sh
PATH=/usr/bin:/bin
HOME=/home/<user>
LOGNAME=<user>
```

그 결과 이런 일이 벌어집니다.

- `/usr/local/bin`에 있는 `node`, `docker-compose`, `aws` 등을 찾지 못합니다.
- nvm, pyenv, conda로 설치한 런타임을 찾지 못합니다.
- `/bin/sh`가 Debian에서는 dash라서 bash 문법(`[[ ]]`, 배열, `$RANDOM`)이 실패합니다.
- `DATABASE_URL` 같은 애플리케이션 환경변수가 없습니다.

### 4.2 해결 방법

**방법 1: crontab 상단에 환경 선언**

```bash
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/bin:/sbin
MAILTO=""

0 3 * * * /opt/app/scripts/cleanup.sh
```

crontab의 변수 선언은 셸 문법이 아니므로 `PATH=$PATH:/foo` 같은 확장은 기대대로 동작하지 않을 수 있습니다. 전체 경로를 적으세요.

**방법 2: 절대 경로 사용**

```bash
0 3 * * * /usr/local/bin/node /opt/app/jobs/report.js
```

**방법 3 (권장): 래퍼 스크립트에서 환경을 명시적으로 구성**

```bash
#!/usr/bin/env bash
# /opt/app/scripts/run-report.sh
set -euo pipefail

export PATH=/usr/local/bin:/usr/bin:/bin
cd /opt/app                         # 작업 디렉터리 고정

set -a
source /opt/app/.env.production     # 앱 환경변수 로드
set +a

exec node jobs/report.js
```

crontab에는 스크립트 한 줄만 남깁니다. 명령 로직을 crontab에 길게 쓰지 않는 것이 유지보수의 핵심입니다.

### 4.3 작업 디렉터리

cron 작업은 사용자의 `HOME`에서 시작합니다. 스크립트가 `./config.json` 같은 상대 경로를 쓰면 실패합니다.

```bash
cd "$(dirname "$(readlink -f "$0")")"
```

### 4.4 `%` 문자의 함정

crontab의 명령 부분에서 `%`는 **줄바꿈으로 변환**되고, 첫 `%` 이후는 표준 입력으로 전달됩니다.

```bash
# 잘못된 예: 명령이 "date +" 에서 잘림
0 0 * * * tar czf /backup/data-$(date +%F).tar.gz /data

# 올바른 예
0 0 * * * tar czf /backup/data-$(date +\%F).tar.gz /data
```

래퍼 스크립트로 옮기면 신경 쓸 필요가 없어집니다.

### 4.5 출력과 로그

cron은 작업의 출력을 **메일로 보내려고 합니다**. 메일 설정(MTA)이 없으면 출력은 버려지거나 로컬 메일함에 쌓입니다.

```bash
# 표준 출력과 에러를 모두 로그 파일에
0 3 * * * /opt/scripts/job.sh >> /var/log/job.log 2>&1

# 흔한 실수: 순서가 바뀌면 에러는 로그에 안 남음
0 3 * * * /opt/scripts/job.sh 2>&1 >> /var/log/job.log

# syslog/journald로 보내기 (태그로 검색 가능)
0 3 * * * /opt/scripts/job.sh 2>&1 | logger -t nightly-job
```

리다이렉션은 왼쪽부터 처리됩니다. `>> file 2>&1`은 "stdout을 파일로 보낸 뒤 stderr를 stdout이 가리키는 곳(파일)으로"라는 뜻입니다.

`MAILTO=""`는 메일 발송을 끕니다. 메일 인프라가 있다면 `MAILTO=ops@example.com`으로 실패 알림 수단으로 쓸 수도 있습니다.

### 4.6 cron 자체의 로그 확인

```bash
# Debian/Ubuntu
journalctl -u cron --since "today"
grep CRON /var/log/syslog

# RHEL 계열
journalctl -u crond --since "today"
tail -f /var/log/cron
```

로그에 `CMD (...)`가 찍혔다면 cron은 제 역할을 한 것이고, 문제는 스크립트 안에 있습니다.

### 4.7 cron 환경 재현하기

```bash
# 1) cron의 실제 환경을 덤프하는 임시 작업 등록
* * * * * env > /tmp/cron-env.txt

# 2) 1분 뒤 그 환경 그대로 스크립트 실행
env -i $(cat /tmp/cron-env.txt | xargs) /bin/sh -c '/opt/scripts/job.sh'
```

터미널에서 이 방식으로 실패를 재현하면 원인을 바로 찾을 수 있습니다. 확인이 끝나면 임시 작업을 반드시 지우세요.

---

## 5. 시간대와 서머타임

### 5.1 cron은 시스템 로컬 시간을 따른다

cron은 기본적으로 **데몬이 기동될 때의 시스템 시간대**를 기준으로 동작합니다.

```bash
timedatectl
# Time zone: Etc/UTC (UTC, +0000)
```

클라우드 서버와 컨테이너는 UTC가 기본인 경우가 많아, 한국 시간 기준으로 작성한 스케줄이 9시간 어긋나는 사고가 흔합니다.

| 의도 (KST) | UTC 서버에 적을 표현식 |
|---|---|
| 매일 09:00 | `0 0 * * *` |
| 매일 00:00 | `0 15 * * *` (전날 15:00 UTC) |
| 평일 09:00 | `0 0 * * 1-5` |
| 월요일 00:30 | `30 15 * * 0` (일요일 15:30 UTC) |

마지막 예처럼 **자정 근처의 스케줄은 날짜와 요일까지 함께 바뀝니다.**

시스템 시간대를 바꿨다면 cron 데몬을 재시작해야 반영됩니다.

```bash
sudo timedatectl set-timezone Asia/Seoul
sudo systemctl restart cron   # 또는 crond
```

### 5.2 작업별 시간대 지정

cronie 등 일부 구현은 `CRON_TZ` 변수를 지원합니다.

```bash
CRON_TZ=Asia/Seoul
0 9 * * 1-5 /opt/scripts/morning-report.sh
```

지원하지 않는 구현도 있으므로 `man 5 crontab`으로 확인하세요. `TZ` 변수는 작업 프로세스의 환경에만 영향을 줄 뿐, **스케줄 계산에는 영향을 주지 않는 경우가 많습니다.**

### 5.3 서머타임(DST)

한국은 서머타임이 없지만, 해외 리전 서버나 해외 사용자 기준 작업에서는 알아둬야 합니다.

- **시계가 앞으로 갈 때** (02:00 → 03:00): 02:30에 예약된 작업은 그날 해당 시각이 존재하지 않습니다.
- **시계가 뒤로 갈 때** (02:00 → 01:00): 01:30 작업이 두 번 실행될 수 있습니다.

Vixie 계열 구현은 몇 시간 이내의 시간 변경을 보정하는 로직을 갖고 있지만 구현마다 다릅니다.

> **서버와 스케줄은 UTC로 통일하고, 로컬 시간 변환은 애플리케이션에서 처리한다.** 로컬 시간을 꼭 써야 한다면 01:00~03:00 사이의 스케줄은 피한다.
