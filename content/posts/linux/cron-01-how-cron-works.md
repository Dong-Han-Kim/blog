---
# 📌 기본 메타데이터
title: 'Cron 완전 정복 1편 — 동작 원리와 스케줄 표현식, crontab 관리'
date: '2026-09-17'
category: 'linux'
tags: ['Linux', 'Cron', 'Crontab', '서버운영']
description: 'cron 데몬이 매 분 무엇을 하는지, 5개 필드 표현식과 매크로, 일·요일이 OR로 결합되는 함정, crontab이 저장되는 위치와 run-parts·anacron·접근 제어까지.'

# 💬 옵션 필드
draft: false
series: 'Cron 완전 정복'
seriesOrder: 1

# 📚 SEO용
keywords: ['cron', 'crontab', '리눅스 cron', 'cron 표현식', 'cron job', 'run-parts', 'anacron', 'cron.d', '스케줄러']
---

# Cron 완전 정복 1편 — 동작 원리와 스케줄 표현식, crontab 관리

> 시리즈 전체 구성 (원본 절 번호를 그대로 유지합니다)
>
> - 1편. 동작 원리와 스케줄 표현식, crontab 관리 — 1~3장
> - 2편. 실행 환경의 함정과 시간대·서머타임 — 4~5장
> - 3편. 신뢰성 패턴과 안티패턴 — 6~7장
> - 4편. systemd timer, Kubernetes CronJob, 분산 환경 — 8~12장

## 들어가며

Cron은 "정해진 시간에 명령을 실행하는" 단순한 도구입니다. 그런데 실제 운영에서 나는 사고는 대부분 cron 문법이 아니라 그 주변에서 생깁니다. 환경변수가 달라서 수동 실행은 되는데 cron에서는 실패하는 경우, 이전 작업이 끝나지 않았는데 다음 작업이 겹쳐 도는 경우, 실패해도 아무도 모르는 경우가 대표적입니다.

이 글은 문법에서 시작해 이런 운영상의 문제를 해결하는 패턴까지 다룹니다.

---

## 1. Cron의 정체와 동작 원리

### 1.1 Cron이란

Cron은 유닉스 계열 OS에서 백그라운드로 도는 **스케줄러 데몬**입니다. 이름은 시간을 뜻하는 그리스어 *chronos*에서 왔습니다.

| 용어 | 의미 |
|---|---|
| cron / crond | 스케줄을 확인하고 작업을 실행하는 데몬 |
| crontab | 스케줄 정의 파일이자 이를 편집하는 명령어 (cron table) |
| cron job | crontab에 등록된 작업 한 줄 |
| cron expression | `0 3 * * *` 같은 시간 표현식 |

### 1.2 구현체

"cron"은 하나의 프로그램이 아니라 여러 구현이 있는 개념입니다.

| 구현 | 주 사용처 | 특징 |
|---|---|---|
| Vixie cron | 과거 대부분의 리눅스 | 현대 cron 문법의 사실상 표준 |
| cronie | RHEL, Rocky, Fedora, Arch | Vixie cron 기반, `CRON_TZ`, anacron 통합 |
| Debian cron | Debian, Ubuntu | Vixie cron에 Debian 패치 적용 |
| BusyBox crond | Alpine, 임베디드 | 경량, 일부 기능 없음 |
| systemd timer | 최신 리눅스 전반 | cron은 아니지만 대체 수단 |

구현마다 세부 동작이 조금씩 다르므로, 문제가 생기면 먼저 **내 서버가 어떤 cron을 쓰는지** 확인해야 합니다.

```bash
# Debian/Ubuntu
systemctl status cron
# RHEL 계열
systemctl status crond
```

### 1.3 동작 원리

1. 기동할 때 crontab 파일들을 읽어 메모리에 올립니다.
2. **매 분마다** 깨어나 현재 시각과 일치하는 작업이 있는지 검사합니다.
3. 일치하는 작업이 있으면 자식 프로세스를 fork하여 `/bin/sh`로 명령을 실행합니다.
4. crontab 파일의 수정 시각(mtime)이 바뀌면 다시 읽습니다.

여기서 두 가지 결론이 나옵니다.

- **최소 단위는 1분입니다.** 초 단위 스케줄은 기본 cron으로 불가능합니다.
- **cron은 "실행"만 합니다.** 작업이 끝났는지, 성공했는지, 겹쳐 도는지는 신경 쓰지 않습니다. 이 빈틈을 메우는 것이 [3편 — 신뢰성 패턴과 안티패턴](/posts/cron-03-reliability-and-antipatterns)의 주제입니다.

---

## 2. 스케줄 표현식 문법

### 2.1 5개 필드

```
┌───────────── 분 (0-59)
│ ┌─────────── 시 (0-23)
│ │ ┌───────── 일 (1-31)
│ │ │ ┌─────── 월 (1-12 또는 JAN-DEC)
│ │ │ │ ┌───── 요일 (0-7, 0과 7은 일요일, 또는 SUN-SAT)
│ │ │ │ │
* * * * *  실행할 명령
```

### 2.2 특수 문자

| 문자 | 의미 | 예시 | 해석 |
|---|---|---|---|
| `*` | 모든 값 | `* * * * *` | 매 분 |
| `,` | 값 목록 | `0 9,18 * * *` | 9시와 18시 정각 |
| `-` | 범위 | `0 9-18 * * *` | 9시부터 18시까지 매 정각 |
| `/` | 간격 | `*/15 * * * *` | 15분마다 (0, 15, 30, 45분) |
| 범위 + 간격 | 범위 안의 간격 | `0 9-18/3 * * *` | 9, 12, 15, 18시 |

### 2.3 자주 쓰는 예제

| 표현식 | 의미 |
|---|---|
| `0 * * * *` | 매시 정각 |
| `30 2 * * *` | 매일 02:30 |
| `0 9 * * 1-5` | 평일 09:00 |
| `0 0 1 * *` | 매월 1일 자정 |
| `0 0 * * 0` | 매주 일요일 자정 |
| `*/5 9-18 * * 1-5` | 평일 업무 시간에 5분마다 |
| `0 0 1 1 *` | 매년 1월 1일 자정 |
| `15 3 * * 6` | 매주 토요일 03:15 |

### 2.4 매크로

| 매크로 | 동일 표현식 |
|---|---|
| `@yearly` / `@annually` | `0 0 1 1 *` |
| `@monthly` | `0 0 1 * *` |
| `@weekly` | `0 0 * * 0` |
| `@daily` / `@midnight` | `0 0 * * *` |
| `@hourly` | `0 * * * *` |
| `@reboot` | cron 데몬 시작 시 한 번 |

`@reboot`은 엄밀히 말해 "OS 부팅 시"가 아니라 "cron 데몬이 시작될 때"입니다. 데몬만 재시작해도 다시 실행될 수 있고, 네트워크나 DB가 아직 준비되지 않은 시점에 실행될 수도 있습니다. 서비스 기동 용도라면 systemd 서비스로 만드는 편이 맞습니다.

### 2.5 함정: 일(DOM)과 요일(DOW)은 OR 조건

```
0 0 13 * 5
```

"13일의 금요일 자정"처럼 보이지만, 실제로는 **매월 13일 또는 매주 금요일**에 실행됩니다. 일 필드와 요일 필드가 둘 다 `*`가 아니면 두 조건은 OR로 결합됩니다. 둘 중 하나가 `*`이면 나머지 하나만 조건이 됩니다.

실제 "13일의 금요일"은 명령 안에서 거릅니다.

```bash
0 0 13 * * [ "$(date +\%u)" = "5" ] && /opt/scripts/friday13.sh
```

"매월 마지막 날"도 표준 cron으로는 표현이 안 되므로 같은 방식으로 처리합니다.

```bash
# 내일이 1일이면 오늘이 말일
55 23 28-31 * * [ "$(date -d tomorrow +\%d)" = "01" ] && /opt/scripts/month_end.sh
```

> Vixie 계열에서는 `*/2`처럼 `*`로 시작하는 표현도 "`*`로 취급"되어 OR 판정에 영향을 줍니다. 일과 요일을 동시에 제한할 때는 동작을 반드시 테스트하세요.

### 2.6 표현식 검증

표현식을 머릿속으로만 해석하지 말고 도구로 확인하세요. crontab.guru 같은 웹 도구로 해석을 확인할 수 있고, systemd가 있는 서버라면 [4편](/posts/cron-04-systemd-k8s-distributed)의 `systemd-analyze calendar`로 다음 실행 시각을 계산할 수 있습니다.

---

## 3. crontab 파일과 관리

### 3.1 crontab 명령어

```bash
crontab -e            # 현재 사용자 crontab 편집
crontab -l            # 목록 보기
crontab -r            # 전체 삭제 (확인 없음!)
crontab -ri           # 삭제 전 확인
crontab -u deploy -e  # 다른 사용자 crontab 편집 (root)
crontab mycron.txt    # 파일 내용으로 통째로 교체
```

`-e`와 `-r`은 키보드에서 바로 옆에 있습니다. 오타 한 번에 crontab 전체가 사라지는 사고가 실제로 자주 일어납니다.

```bash
# 편집 전 백업
crontab -l > ~/crontab.backup.$(date +%F)

# 또는 crontab 내용을 Git으로 관리하고 파일로 적용
crontab ./ops/crontab.txt
```

### 3.2 crontab이 저장되는 위치

| 종류 | 위치 | 사용자 필드 | 편집 방법 |
|---|---|---|---|
| 사용자 crontab | Debian: `/var/spool/cron/crontabs/<user>`<br />RHEL: `/var/spool/cron/<user>` | 없음 | `crontab -e` (직접 편집 금지) |
| 시스템 crontab | `/etc/crontab` | **있음** | 직접 편집 |
| 드롭인 디렉터리 | `/etc/cron.d/*` | **있음** | 파일 추가 |
| 주기별 디렉터리 | `/etc/cron.{hourly,daily,weekly,monthly}/` | 해당 없음 | 실행 파일 배치 |

시스템 crontab과 `/etc/cron.d`는 **6번째 필드로 실행 사용자**를 적습니다.

```bash
# /etc/cron.d/backup
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin
MAILTO=""

30 2 * * * backup /opt/backup/run.sh >> /var/log/backup.log 2>&1
```

설정 관리 도구(Ansible 등)로 배포할 때는 `/etc/cron.d`에 파일 단위로 넣는 방식이 가장 깔끔합니다. 파일 하나가 작업 하나의 단위가 되어 추가와 삭제가 명확해집니다.

### 3.3 run-parts와 파일명 함정

`/etc/cron.daily` 같은 디렉터리는 `run-parts`가 안의 실행 파일을 차례로 실행합니다. Debian 계열의 `run-parts`는 파일명이 영문, 숫자, `_`, `-`로만 이루어진 경우에만 실행합니다.

```
/etc/cron.daily/backup      → 실행됨
/etc/cron.daily/backup.sh   → 조용히 무시됨
```

`/etc/cron.d`의 파일명에도 Debian에서는 같은 규칙이 적용됩니다. 또한 `/etc/cron.d`의 파일은 root 소유이고 그룹과 기타 사용자에게 쓰기 권한이 없어야 읽힙니다.

```bash
# 실제로 실행될 대상 미리 확인
run-parts --test /etc/cron.daily
```

### 3.4 anacron: 항상 켜져 있지 않은 머신

cron은 그 시각에 서버가 꺼져 있었다면 작업을 그냥 건너뜁니다. **anacron**은 "마지막 실행 후 N일이 지났으면 실행"하는 방식으로 이를 보완합니다.

```
# /etc/anacrontab
# 주기(일)  지연(분)  작업ID        명령
1           5         cron.daily    run-parts /etc/cron.daily
7           10        cron.weekly   run-parts /etc/cron.weekly
@monthly    15        cron.monthly  run-parts /etc/cron.monthly
```

많은 배포판에서 `cron.daily`, `cron.weekly`, `cron.monthly`는 이미 anacron을 통해 실행됩니다. 그래서 이 디렉터리의 작업은 정확한 시각이 아니라 "하루에 한 번쯤" 실행된다고 생각하는 것이 맞습니다.

### 3.5 접근 제어

| 파일 | 동작 |
|---|---|
| `/etc/cron.allow` 존재 | 목록에 있는 사용자만 crontab 사용 가능 |
| `/etc/cron.deny`만 존재 | 목록에 있는 사용자는 사용 불가 |

## 더 깊이

- 권한, systemd, 로그, 디스크까지 서버 운영 기본기를 한 강으로 묶은 글은 [풀스택 개발자를 위한 인프라 1강 — 리눅스 운영 기본](/posts/infra-01-linux-operations)입니다. 그 강이 스크립트 자동화 예시 정도로만 짧게 지나간 cron을 이 시리즈가 네 편으로 펼쳤습니다.
