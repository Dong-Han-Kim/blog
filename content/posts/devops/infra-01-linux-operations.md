---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 인프라 1강 — 리눅스 운영 기본'
date: '2026-09-17'
category: 'devops'
tags: ['Linux', 'Infra', 'systemd', 'Server', 'DevOps']
description: 'FHS 디렉터리 구조와 권한, 프로세스와 시그널, systemd 서비스, 패키지 관리, 환경 변수, 텍스트 처리, 쉘 스크립트, 리소스 점검까지 — 서버에 접속했을 때 무엇이 어디에 있고 무엇이 어떻게 돌고 있는지 스스로 파악하는 법.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 인프라'
seriesOrder: 1

# 📚 SEO용
keywords: ['Linux', 'Infra', 'systemd', 'journalctl', 'FHS', '권한', '프로세스', '쉘 스크립트', '서버 운영', '인프라 강의']
---

# 풀스택 개발자를 위한 인프라 1강 — 리눅스 운영 기본

> 목표: "내 코드가 실제로 어디서, 어떻게 돌아가는가"를 아래 계층부터 이해하고, 직접 배포·운영·장애 대응까지 할 수 있는 수준에 도달한다.

> 시리즈 전체 구성
>
> - 1강. 리눅스 운영 기본
> - 2강. 네트워크 기초
> - 3강. 웹서버와 리버스 프록시
> - 4강. Docker
> - 5강. CI/CD
> - 6강. 클라우드 기초 (AWS)
> - 7강. 관측성 (Observability)
> - 8강. IaC (Infrastructure as Code)
> - 9강. 쿠버네티스
> - 10강. 운영 심화
> - 부록. 전체 과정 요약

## 이 시리즈를 학습하는 방법

이론만 따로 보기보다, **하나의 개인 프로젝트를 강의마다 한 단계씩 진화시키는 방식**을 권장한다.

1. 리눅스 서버에 직접 설치해서 실행 (1강)
2. 포트·방화벽·DNS 연결 (2강)
3. Nginx와 HTTPS 붙이기 (3강)
4. Docker Compose로 전환 (4강)
5. GitHub Actions로 자동 배포 (5강)
6. 클라우드로 이전 (6강)
7. 모니터링 붙이기 (7강)
8. Terraform/Ansible로 인프라 재구성 (8강)
9. k3s로 이전 (9강)
10. 백업·SLO·장애 대응 체계 수립 (10강)

권장 기간(평일 저녁 기준): 1\~4강 약 2개월, 5\~7강 약 2개월, 8\~10강 3개월 이상.

## 1. 왜 개발자에게 리눅스가 중요한가

서버의 대부분은 리눅스에서 돌아간다. Docker 컨테이너도 결국 리눅스 커널의 기능(namespace, cgroup)을 사용한다. "로컬에서는 되는데 서버에서는 안 돼요"라는 문제는 대개 권한, 경로, 환경 변수, 프로세스 관리에서 발생한다. 이 강의의 목표는 **서버에 접속했을 때 무엇이 어디에 있고, 무엇이 어떻게 돌고 있는지 스스로 파악할 수 있는 것**이다.

### 배포판 계열

| 계열 | 대표 배포판 | 패키지 관리자 | 주 사용처 |
|---|---|---|---|
| Debian 계열 | Ubuntu, Debian | `apt` | 클라우드, 스타트업, 개인 서버 |
| RHEL 계열 | RHEL, Rocky, AlmaLinux | `dnf` (구 `yum`) | 기업, 금융·제조, 폐쇄망 |

두 계열은 명령어 대부분이 같고, 패키지 관리와 일부 설정 파일 위치가 다르다. 제조·플랜트 쪽 사내 서버는 RHEL 계열인 경우가 많으니 둘 다 익혀 두는 게 좋다.

## 2. 파일 시스템 구조 (FHS)

리눅스는 드라이브 문자(C:, D:) 없이 모든 것이 `/`(루트) 하나에서 시작하는 트리 구조다.

| 경로 | 역할 | 실무에서 볼 때 |
|---|---|---|
| `/etc` | 시스템·서비스 설정 파일 | Nginx, systemd, hosts 설정 |
| `/var` | 자주 변하는 데이터 | `/var/log` 로그, `/var/lib/docker` 컨테이너 데이터 |
| `/home` | 일반 사용자 홈 | `~` 가 가리키는 곳 |
| `/root` | root 사용자 홈 | |
| `/opt` | 외부(서드파티) 소프트웨어 | 상용 솔루션, 에이전트 설치 위치 |
| `/usr` | 프로그램, 라이브러리 | `/usr/bin`, `/usr/local/bin` |
| `/tmp` | 임시 파일 | 재부팅 시 삭제될 수 있음 |
| `/proc` | 커널이 보여주는 가상 파일 | 프로세스·메모리 정보 |
| `/dev` | 장치 파일 | 디스크(`/dev/sda`), `/dev/null` |
| `/mnt`, `/media` | 마운트 지점 | 외부 디스크, USB |

"**모든 것은 파일이다**"라는 철학이 핵심이다. 디스크, 프로세스 정보, 심지어 `/dev/null`(버리는 곳)까지 파일처럼 읽고 쓴다.

```bash
cat /proc/cpuinfo      # CPU 정보
cat /proc/meminfo      # 메모리 정보
cat /etc/os-release    # 배포판 확인
```

## 3. 사용자, 그룹, 권한

### 권한 읽는 법

```bash
$ ls -l
-rwxr-x--- 1 deploy app 2048 Sep 17 10:00 start.sh
```

```
-    rwx    r-x    ---
│    │      │      └ 기타 사용자(other): 권한 없음
│    │      └ 그룹(app): 읽기, 실행
│    └ 소유자(deploy): 읽기, 쓰기, 실행
└ 파일 종류 (- 파일, d 디렉터리, l 심볼릭 링크)
```

권한은 숫자로도 표현한다. r=4, w=2, x=1을 더한다.

| 표기 | 숫자 | 흔한 용도 |
|---|---|---|
| `rwxr-xr-x` | 755 | 실행 파일, 디렉터리 |
| `rw-r--r--` | 644 | 일반 파일 |
| `rw-------` | 600 | SSH 개인키, 비밀 설정 파일 |

**디렉터리에서 x의 의미**는 "들어갈 수 있는가"다. 디렉터리에 r만 있고 x가 없으면 목록은 보여도 안의 파일에 접근할 수 없다. Nginx가 정적 파일을 못 읽어 403이 나는 흔한 원인이 상위 디렉터리의 x 권한 누락이다.

### 주요 명령

```bash
chmod 755 start.sh            # 숫자 방식
chmod u+x start.sh            # 소유자에 실행 권한 추가
chown deploy:app start.sh     # 소유자:그룹 변경
chown -R deploy:app /opt/app  # 하위까지 재귀 적용

id                            # 내 UID, GID, 소속 그룹
useradd -m -s /bin/bash deploy
usermod -aG docker deploy     # docker 그룹에 추가 (-a 없으면 기존 그룹이 날아감!)
```

### sudo와 root

root는 모든 권한을 가진 사용자다. 실무에서는 root로 직접 작업하지 않고, 일반 사용자로 로그인한 뒤 필요할 때만 `sudo`를 쓴다. 애플리케이션도 **전용 사용자**로 실행하는 게 원칙이다. 앱이 탈취되더라도 피해 범위를 줄이기 위해서다.

### 특수 권한 (알아만 두기)

- **setuid** (`rwsr-xr-x`): 실행 시 파일 소유자 권한으로 실행됨. `passwd` 명령이 대표적
- **sticky bit** (`rwxrwxrwt`): 누구나 쓸 수 있지만 자기 파일만 삭제 가능. `/tmp`에 적용
- **umask**: 새 파일 생성 시 기본으로 빠지는 권한. 보통 `022` → 파일 644, 디렉터리 755

## 4. 프로세스

프로세스는 실행 중인 프로그램이다. 모든 프로세스는 **PID**(고유 번호)와 **PPID**(부모 PID)를 가지며, 최상위에는 PID 1인 `systemd`가 있다.

```bash
ps aux                     # 모든 프로세스
ps aux | grep node         # node 프로세스만
ps -ef --forest            # 부모-자식 트리
top                        # 실시간 (htop이 있으면 더 편함)
pgrep -a java              # 이름으로 PID 찾기
```

### 시그널

| 시그널 | 번호 | 의미 |
|---|---|---|
| SIGTERM | 15 | "정리하고 종료해 줘" (기본값) |
| SIGKILL | 9 | 강제 종료. 프로세스가 거부 불가 |
| SIGHUP | 1 | 설정 다시 읽기 용도로 자주 사용 |
| SIGINT | 2 | Ctrl+C |

```bash
kill 1234        # SIGTERM
kill -9 1234     # SIGKILL — 최후의 수단
```

`kill -9`를 습관적으로 쓰면 앱이 DB 커넥션 정리, 처리 중인 요청 마무리, 임시 파일 삭제를 할 기회를 잃는다. Node.js라면 `process.on('SIGTERM', ...)`에서 graceful shutdown을 구현하는데, 이것이 나중에 Docker와 쿠버네티스에서 무중단 배포의 기반이 된다.

### 포그라운드와 백그라운드

```bash
node app.js &                          # 백그라운드 실행
jobs                                   # 현재 쉘의 작업 목록
nohup node app.js > app.log 2>&1 &     # 로그아웃해도 유지
```

`nohup`은 임시방편이다. 재부팅되면 살아나지 않고, 죽어도 재시작되지 않는다. 그래서 systemd를 쓴다.

## 5. systemd — 서비스 관리

```bash
systemctl status nginx
systemctl start|stop|restart nginx
systemctl reload nginx         # 설정만 다시 읽기 (무중단)
systemctl enable nginx         # 부팅 시 자동 시작
systemctl enable --now nginx   # 활성화 + 즉시 시작
systemctl list-units --type=service --state=failed
```

### 직접 서비스 등록하기

`/etc/systemd/system/myapp.service`:

```ini
[Unit]
Description=My Node App
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/myapp
EnvironmentFile=/opt/myapp/.env
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload     # unit 파일 변경 후 필수
sudo systemctl enable --now myapp
```

`After`는 네트워크 준비 후 시작하라는 순서 지정, `User`는 전용 사용자 실행, `Restart=on-failure`는 비정상 종료 시 자동 재시작, `WantedBy=multi-user.target`은 일반 부팅 시 함께 올라오게 한다.

### journalctl — 로그 보기

```bash
journalctl -u myapp              # 특정 서비스 로그
journalctl -u myapp -f           # 실시간 추적
journalctl -u myapp --since "1 hour ago"
journalctl -u myapp -n 100 --no-pager
journalctl -p err -b             # 이번 부팅 이후 에러만
```

## 6. 패키지 관리

```bash
# Debian/Ubuntu
sudo apt update && sudo apt install -y nginx
apt list --installed | grep nginx

# RHEL/Rocky
sudo dnf install -y nginx
rpm -qa | grep nginx
```

### 폐쇄망에서의 설치

```bash
# 인터넷 되는 동일 버전 OS에서 (의존성 포함)
dnf download --resolve --destdir=./pkgs nginx
# 반입 후 폐쇄망 서버에서
sudo dnf install ./pkgs/*.rpm
```

반입할 패키지가 많아지면 `createrepo`로 내부 로컬 저장소를 만든다. 핵심은 **외부에서 받는 OS 버전과 아키텍처를 대상 서버와 맞추는 것**이다.

## 7. 환경 변수와 쉘 설정

```bash
echo $PATH
export NODE_ENV=production
env | grep NODE
which node
```

- `~/.bashrc`: 대화형 쉘을 열 때마다 읽음
- `~/.bash_profile` / `~/.profile`: 로그인 시 읽음
- `/etc/environment`, `/etc/profile.d/*.sh`: 시스템 전체

**함정**: 터미널에서는 `node`가 되는데 systemd나 cron에서는 "command not found"가 나는 경우. systemd와 cron은 `.bashrc`를 읽지 않는다. unit 파일에는 **절대 경로**를 쓰고, 환경 변수는 `EnvironmentFile`로 명시한다. nvm으로 설치한 node에서 특히 잦다.

## 8. 텍스트 처리와 파이프

```bash
tail -f /var/log/nginx/access.log
tail -n 200 app.log | grep -i error
grep -rn "DATABASE_URL" /opt/myapp
less app.log

# access.log에서 응답코드별 개수
awk '{print $9}' access.log | sort | uniq -c | sort -rn

# 설정 파일 값 치환 (백업 파일 생성)
sed -i.bak 's/port=3000/port=8080/' app.conf
```

### 리다이렉션

```bash
cmd > out.log         # 표준출력 덮어쓰기
cmd >> out.log        # 이어쓰기
cmd 2> err.log        # 표준에러만
cmd > all.log 2>&1    # 둘 다 같은 파일로
cmd > /dev/null 2>&1  # 전부 버리기
```

1은 stdout, 2는 stderr. `2>&1`은 "2번을 1번이 가는 곳으로"라는 뜻이므로 **순서가 중요**하다.

## 9. 쉘 스크립트 기초

```bash
#!/usr/bin/env bash
set -euo pipefail     # 에러 시 즉시 중단, 미정의 변수 금지, 파이프 에러 감지

APP_DIR="/opt/myapp"
BACKUP_DIR="/backup/$(date +%Y%m%d_%H%M%S)"

log() { echo "[$(date '+%F %T')] $*"; }

if [[ ! -d "$APP_DIR" ]]; then
  log "앱 디렉터리가 없습니다: $APP_DIR"
  exit 1
fi

mkdir -p "$BACKUP_DIR"
cp -r "$APP_DIR/config" "$BACKUP_DIR/"
log "백업 완료: $BACKUP_DIR"

for svc in nginx myapp; do
  if systemctl is-active --quiet "$svc"; then
    log "$svc: 정상"
  else
    log "$svc: 중지됨"
  fi
done
```

원칙: `set -euo pipefail`, 변수는 항상 `"$VAR"`, 종료 코드(`$?`, 0이면 성공) 활용.

```bash
crontab -e
# 분 시 일 월 요일  명령
0 3 * * * /opt/scripts/backup.sh >> /var/log/backup.log 2>&1
```

## 10. 리소스 점검

### 디스크

```bash
df -h
df -i                          # inode 사용량
du -sh /var/log/*
du -h --max-depth=1 / 2>/dev/null | sort -rh | head
```

- **용량은 남는데 파일 생성이 안 됨** → inode 고갈. `df -i`로 확인
- **파일을 지웠는데 용량이 안 줄어듦** → 프로세스가 파일을 열고 있음. `lsof +L1`로 찾고 재시작

### 메모리

```bash
free -h
```

리눅스는 남는 메모리를 디스크 캐시(`buff/cache`)로 쓰고 필요하면 반납한다. **실제로 볼 값은 `available`이다**. 메모리가 부족하면 OOM Killer가 프로세스를 종료한다.

```bash
dmesg -T | grep -i "killed process"
journalctl -k | grep -i oom
```

### CPU와 부하

```bash
uptime      # load average: 1분, 5분, 15분
nproc       # 코어 수
```

load average가 **코어 수보다 지속적으로 높으면** 작업이 밀리고 있다는 신호다.

### 로그 로테이션

`/etc/logrotate.d/myapp`:

```
/opt/myapp/logs/*.log {
    daily
    rotate 14
    compress
    missingok
    notifempty
    copytruncate
}
```

## 11. 서버 첫 접속 시 점검 순서

```bash
cat /etc/os-release                        # 1. 어떤 OS인가
uptime; nproc; free -h; df -h              # 2. 자원 상태
systemctl list-units --type=service --state=running   # 3. 무엇이 돌고 있나
ss -tlnp                                   # 4. 어떤 포트가 열려 있나
ls /opt /etc/systemd/system                # 5. 설치된 앱과 서비스
crontab -l; ls /etc/cron.d                 # 6. 예약 작업
docker ps -a 2>/dev/null                   # 7. 컨테이너
last -n 10                                 # 8. 최근 접속 기록
```

## 12. 실습 과제

1. VM(또는 WSL, 클라우드 무료 인스턴스)에 Ubuntu나 Rocky Linux 설치
2. `deploy` 사용자 생성, `/opt/myapp` 소유권 이전
3. Node.js 서버를 systemd 서비스로 등록
4. `kill -9` 후 `Restart=on-failure`로 살아나는지 확인
5. `journalctl -u myapp -f`로 로그를 보며 요청 전송
6. 서비스·디스크 점검 스크립트 작성 후 cron 등록
7. logrotate 설정 후 `logrotate -d`로 dry-run

## 13. 핵심 정리

- 설정은 `/etc`, 변하는 데이터와 로그는 `/var`, 외부 소프트웨어는 `/opt`
- 권한은 rwx와 숫자(755/644/600), 디렉터리의 x는 "진입 권한"
- 앱은 전용 사용자로 실행
- 종료는 SIGTERM이 기본, `kill -9`는 최후의 수단
- 서비스는 systemd, 로그는 `journalctl`
- systemd·cron은 `.bashrc`를 읽지 않음 → 절대 경로와 명시적 환경 변수
- 메모리는 `available`, 디스크는 용량과 inode 둘 다
- 스크립트는 `set -euo pipefail`과 따옴표 습관부터

## 더 깊이

- 여기서 훑은 명령어를 손에 익히려면 [리눅스 명령어, 실무에서 진짜 자주 쓰는 것들 (1) — 기본편](/posts/linux-commands-1-basics)
- cron으로 주기 작업을 거는 이야기는 [Cron 완전 정복 1편 — 동작 원리와 스케줄 표현식, crontab 관리](/posts/cron-01-how-cron-works)에서 훨씬 자세히 다룬다.
- 폐쇄망에 패키지를 반입하는 이야기를 빌드 파이프라인 쪽에서 이어 보려면 [풀스택 개발자를 위한 CI/CD 11강 — 폐쇄망 환경의 CI/CD](/posts/cicd-11-air-gapped-cicd)
