---
# 📌 기본 메타데이터
title: '리눅스 명령어, 실무에서 진짜 자주 쓰는 것들 (2) — 서버 운영편'
date: '2026-08-26'
category: 'linux'
tags: ['Linux', 'SysAdmin', 'systemd', 'Troubleshooting', '서버운영']
description: '서버가 죽었을 때 실제로 치는 명령어들. systemd, journalctl, 포트 점유 추적, 디스크 풀 대응, 컨테이너 운영까지 상황별로 정리.'

# 💬 옵션 필드
draft: false
series: '리눅스 명령어'
seriesOrder: 2

# 📚 SEO용
keywords: ['Linux', '리눅스 명령어', '서버 운영', 'systemd', 'journalctl', 'ss', '포트 충돌', '디스크 풀', 'OOM', 'SSH', 'Podman', 'pm2', 'cron']
---

# 리눅스 명령어, 실무에서 진짜 자주 쓰는 것들 (2) — 서버 운영편

[1편](/posts/linux-commands-1-basics)이 로컬에서 쓰는 기본기였다면, 2편은 **서버에 SSH로 붙은 상태에서 문제를 다룰 때** 쓰는 명령어다. 목록이 아니라 상황별로 정리했다. 실제로 장애 대응은 "어떤 명령어를 아느냐"보다 "어떤 순서로 좁혀 들어가느냐"의 문제이기 때문이다.

예시는 RHEL 9 계열(`dnf`, `systemd`) 기준이지만 대부분 Ubuntu에서도 동일하다.

---

## 0. 접속하자마자 치는 3줄

서버에 붙으면 상태 파악부터 한다. 이 세 줄이면 대략적인 그림이 나온다.

```bash
uptime          # 부팅 후 경과 시간 + 로드 애버리지
free -h         # 메모리
df -h           # 디스크
```

`uptime` 출력의 `load average: 0.52, 0.48, 0.45`는 각각 1분/5분/15분 평균이다. **코어 수보다 크면 대기가 발생하고 있다는 뜻**이다. `nproc`으로 코어 수를 확인하고 비교하면 된다.

```bash
nproc                       # CPU 코어 수
hostnamectl                 # 호스트명, OS, 커널 버전 한 번에
cat /etc/os-release         # 배포판 정보
uname -r                    # 커널 버전
```

---

## 1. 서비스 관리 — systemd

요즘 리눅스 서버의 서비스는 거의 전부 systemd가 관리한다.

```bash
systemctl status nginx          # 상태 확인 (가장 많이 씀)
systemctl start nginx
systemctl stop nginx
systemctl restart nginx         # 중단 후 시작
systemctl reload nginx          # 설정만 다시 읽기 (무중단)
systemctl enable nginx          # 부팅 시 자동 시작 등록
systemctl disable nginx
systemctl enable --now nginx    # 등록과 시작을 한 번에
```

`restart`와 `reload`의 차이는 실무에서 중요하다. <strong>nginx 설정만 바꿨다면 `reload`</strong>로 커넥션을 끊지 않고 반영할 수 있다. 단, 바꾼 설정이 문법적으로 틀렸으면 서비스가 안 올라오므로 순서는 이렇다.

```bash
nginx -t                # 설정 문법 검사
systemctl reload nginx  # 통과하면 반영
```

```bash
systemctl list-units --type=service --state=running   # 실행 중인 서비스 전부
systemctl list-units --failed                         # 실패한 서비스만 — 장애 시 1순위
systemctl cat nginx                                   # 유닛 파일 내용 확인
systemctl daemon-reload                               # 유닛 파일 수정 후 필수
systemctl is-enabled nginx                            # 자동시작 등록 여부
```

유닛 파일(`/etc/systemd/system/*.service`)을 직접 수정했다면 **`daemon-reload`를 하지 않으면 변경이 반영되지 않는다.** "분명 고쳤는데 그대로인데?" 상황의 단골 원인이다.

---

## 2. 로그 — journalctl

systemd 환경에서 로그는 `/var/log`의 파일이 아니라 저널에 쌓이는 경우가 많다.

```bash
journalctl -u nginx                 # 특정 서비스 로그
journalctl -u nginx -f              # 실시간 (tail -f 에 해당)
journalctl -u nginx -n 100          # 최근 100줄
journalctl -u nginx --since "10 min ago"
journalctl -u nginx --since today
journalctl -u nginx --since "2026-08-26 09:00" --until "2026-08-26 10:00"
journalctl -u nginx -p err          # 에러 레벨 이상만
journalctl -xe                      # 최근 로그 + 상세 설명 (장애 직후 습관적으로)
journalctl -b                       # 이번 부팅 이후 전체
journalctl -b -1                    # 직전 부팅 로그 (갑자기 재부팅된 원인 추적)
journalctl --disk-usage             # 저널이 차지한 용량
journalctl --vacuum-time=7d         # 7일치만 남기고 정리
```

가장 자주 쓰는 조합:

```bash
journalctl -u myapp --since "30 min ago" -p err --no-pager | less
```

전통적인 파일 로그도 여전히 많다.

```bash
tail -F /var/log/messages           # RHEL 계열 시스템 로그
tail -F /var/log/syslog             # Debian/Ubuntu 계열
tail -F /var/log/nginx/error.log
zcat /var/log/nginx/access.log.1.gz | grep " 500 "   # 로테이션된 로그 검색
```

로그 로테이션 설정 자체를 확인하려면:

```bash
cat /etc/logrotate.d/nginx
logrotate -d /etc/logrotate.conf    # dry-run으로 동작 확인
```

---

## 3. "포트가 이미 사용 중" — 점유 프로세스 추적

가장 흔한 상황이다. `Address already in use`를 봤을 때.

```bash
ss -tulnp                       # 리스닝 중인 포트 전부 + 프로세스
ss -tulnp | grep :8080          # 특정 포트
ss -tnp                         # 현재 연결된 TCP 세션
lsof -i :8080                   # 해당 포트를 쓰는 프로세스 (lsof 설치 필요)
fuser -n tcp 8080               # PID만 간단히
```

`ss` 옵션은 이렇게 읽는다: `-t` TCP, `-u` UDP, `-l` 리스닝만, `-n` 이름 대신 숫자, `-p` 프로세스. **`ss -tulnp` 한 덩어리로 외워두면 된다.** (`netstat`은 대부분의 배포판에서 deprecated 되었고 기본 미설치인 경우가 많다.)

찾았으면:

```bash
ss -tulnp | grep :8080
# users:(("node",pid=12345,fd=20))
kill 12345
```

연결 상태 통계를 보고 싶을 때:

```bash
ss -s                                   # 소켓 요약
ss -tan | awk '{print $1}' | sort | uniq -c | sort -rn   # 상태별 집계
```

`TIME_WAIT`이 비정상적으로 많다면 커넥션을 제대로 재사용하지 않고 있다는 신호일 수 있다.

---

## 4. "디스크가 가득 찼다" — 대응 순서

`No space left on device`. 순서대로 좁혀 들어간다.

```bash
df -h                       # 어느 파티션이 찼는지
df -i                       # inode 고갈일 수도 있다 (작은 파일이 수백만 개일 때)
```

파티션을 특정했으면 그 안에서 큰 디렉토리를 찾는다.

```bash
du -h --max-depth=1 /var | sort -rh | head -20
```

`--max-depth=1`로 한 단계씩 내려가며 범인을 좁히는 게 요령이다. 처음부터 전체를 훑으면 오래 걸린다.

```bash
du -sh /var/log                     # 특정 디렉토리 총합
find / -type f -size +500M 2>/dev/null | head -20   # 큰 파일 직접 찾기
ncdu /var                           # 대화형 탐색 (별도 설치, 매우 편함)
```

흔한 원인 세 가지:

```bash
journalctl --disk-usage             # 1) 저널이 수 GB
du -sh /var/lib/containers          # 2) 컨테이너 이미지/레이어 (docker는 /var/lib/docker)
du -sh /var/log/*                   # 3) 로테이션 안 된 로그
```

**한 가지 함정** — 파일을 `rm` 했는데 용량이 안 줄어드는 경우가 있다. 프로세스가 해당 파일을 아직 열고 있으면 디스크가 반환되지 않는다.

```bash
lsof +L1                            # 삭제됐지만 열려 있는 파일 확인
```

이 경우 해당 프로세스를 재시작해야 공간이 돌아온다. 로그 파일을 지우는 대신 비우는 방법이 더 안전하다.

```bash
: > /var/log/huge.log               # 파일을 삭제하지 않고 내용만 비움
```

---

## 5. "서버가 느리다" — CPU와 메모리

```bash
top                     # 기본
htop                    # 보기 편한 버전
top -o %MEM             # 메모리 사용량 순 정렬
ps aux --sort=-%mem | head -10      # 메모리 상위 10개
ps aux --sort=-%cpu | head -10      # CPU 상위 10개
```

`top` 안에서 `P`는 CPU순, `M`은 메모리순, `1`은 코어별 표시, `k`는 프로세스 종료다.

```bash
free -h
#               total   used   free   shared  buff/cache   available
# Mem:            15Gi  6.2Gi  1.1Gi    120Mi       8.0Gi       8.6Gi
```

여기서 **`free`가 아니라 `available`을 봐야 한다.** `buff/cache`는 커널이 캐시로 쓰는 것이고 필요하면 즉시 반환되므로, 실제 여유는 `available`이다. `free`가 낮다고 메모리 부족이 아니다.

OOM(메모리 부족으로 커널이 프로세스를 죽인 것)이 의심되면:

```bash
dmesg -T | grep -i "out of memory"
journalctl -k | grep -i oom
```

프로세스가 "아무 이유 없이 사라졌다"면 십중팔구 OOM Killer다.

```bash
vmstat 1 5              # 1초 간격 5회 — si/so(스왑 in/out)가 0이 아니면 메모리 압박
iostat -x 1 3           # 디스크 I/O (sysstat 패키지)
uptime                  # 로드 애버리지 추이
```

---

## 6. 네트워크 진단

```bash
ip a                        # IP 주소 (ifconfig 대체)
ip r                        # 라우팅 테이블
ip -s link                  # 인터페이스별 통계 (에러/드롭 카운트)

ping -c 4 8.8.8.8           # 도달성
traceroute example.com      # 경로 추적
mtr example.com             # ping + traceroute 실시간 결합 (강력 추천)

dig example.com             # DNS 조회
dig +short example.com      # 결과만
cat /etc/resolv.conf        # DNS 서버 설정
cat /etc/hosts              # 로컬 이름 해석
```

**"서버 A에서 서버 B의 포트가 열려 있나"** 를 확인하는 건 방화벽 이슈에서 가장 자주 하는 검증이다.

```bash
nc -zv 10.0.0.5 5432        # nc(netcat)로 포트 연결 테스트
timeout 3 bash -c "</dev/tcp/10.0.0.5/5432" && echo OK || echo FAIL   # nc 없을 때
curl -v telnet://10.0.0.5:5432
```

방화벽 확인 (RHEL 계열):

```bash
firewall-cmd --list-all
firewall-cmd --add-port=8080/tcp --permanent
firewall-cmd --reload

# SELinux가 원인인 경우도 많다
getenforce
sestatus
ausearch -m avc -ts recent      # SELinux 거부 로그
```

RHEL 계열에서 "설정은 다 맞는데 연결이 안 된다"면 **방화벽 → SELinux 순으로 의심**하는 게 정석이다.

---

## 7. 사용자와 권한

```bash
whoami
id                          # UID, GID, 소속 그룹
groups han                  # 특정 사용자의 그룹
w                           # 현재 접속 중인 사용자와 하는 일
last -n 20                  # 최근 로그인 기록
lastb                       # 로그인 실패 기록

useradd -m -s /bin/bash deploy
passwd deploy
usermod -aG docker deploy   # 그룹 추가 (-a 없이 -G만 쓰면 기존 그룹이 날아간다)
userdel -r olduser
```

`usermod -aG`의 `-a`(append)를 빠뜨려서 사용자의 기존 그룹을 전부 날리는 건 유명한 사고다. **`-aG`는 항상 붙여서 외우자.**

sudo 권한은 `visudo`로 편집한다. 문법 오류를 저장 전에 검사해주기 때문에, `/etc/sudoers`를 직접 편집하면 안 된다.

```bash
visudo
# deploy ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart myapp
```

---

## 8. SSH

```bash
ssh user@host
ssh -p 2222 user@host
ssh -i ~/.ssh/id_ed25519 user@host
ssh -v user@host                    # 접속 안 될 때 원인 추적

ssh-keygen -t ed25519 -C "han@macbook"      # 키 생성 (요즘은 rsa보다 ed25519)
ssh-copy-id user@host                       # 공개키를 서버에 등록
```

`~/.ssh/config`에 정리해두면 삶이 편해진다.

```
Host prod
    HostName 10.0.0.5
    User hse
    Port 22
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 60
```

이러면 `ssh prod` 한 줄로 붙는다. `ServerAliveInterval`은 유휴 상태에서 세션이 끊기는 걸 막아준다.

포트 포워딩은 폐쇄망 작업에서 특히 유용하다.

```bash
ssh -L 5432:localhost:5432 user@host    # 로컬 5432 → 원격 5432 (DB 툴로 붙을 때)
ssh -L 8080:internal-svc:80 user@host   # 원격에서만 보이는 서비스를 로컬로
ssh -N -f -L 5432:localhost:5432 user@host   # 셸 없이 터널만 백그라운드로
```

---

## 9. 컨테이너 — Docker / Podman

RHEL 계열은 Docker 대신 Podman이 기본인 경우가 많다. `podman-docker` 패키지가 깔려 있으면 `docker` 명령이 그대로 podman으로 동작하므로, 아래 명령어는 양쪽에 거의 그대로 통한다.

```bash
podman ps                       # 실행 중인 컨테이너
podman ps -a                    # 중지된 것 포함
podman logs -f myapp            # 로그 실시간
podman logs --tail 100 myapp
podman exec -it myapp bash      # 컨테이너 안으로 진입
podman restart myapp
podman stats                    # 리소스 사용량 실시간
podman inspect myapp            # 상세 설정 (포트, 볼륨, 환경변수)
podman port myapp               # 포트 매핑만 빠르게
```

문제 상황에서 가장 많이 쓰는 건 `logs`와 `exec`다. 컨테이너 안에서 실제로 어떤 설정으로 떠 있는지 확인하는 게 원인 파악의 지름길이다.

```bash
podman inspect myapp | grep -i mount        # 볼륨 마운트 확인
podman exec myapp env                       # 실제 주입된 환경변수 확인
podman exec myapp cat /app/config.yml       # 컨테이너 안의 설정 파일
```

정리 명령어:

```bash
podman image prune -a           # 사용 안 하는 이미지 삭제
podman system prune -a          # 컨테이너/이미지/네트워크 일괄 정리
podman system df                # 컨테이너가 쓰는 디스크 용량
```

디스크가 찼을 때 `podman system prune -a`로 수 GB가 회수되는 경우가 흔하다. 단, 사용 중이지 않은 볼륨도 지울지 여부(`--volumes`)는 신중하게 판단해야 한다.

Podman만의 유용한 기능 하나 — 컨테이너를 systemd 서비스로 등록할 수 있다. 예전에는 `podman generate systemd`를 썼지만, Podman 4.4 이후로는 **Quadlet**이 권장 방식이다(5.x에서 `generate systemd`는 deprecated 경고가 뜬다).

`/etc/containers/systemd/myapp.container` 파일을 만들면 systemd가 유닛을 자동 생성해준다.

```ini
[Container]
Image=docker.io/library/nginx:latest
PublishPort=8080:80
Volume=/opt/app/data:/data:Z

[Service]
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl start myapp           # 유닛 이름은 파일명 그대로
systemctl status myapp
```

SELinux가 켜진 RHEL에서 볼륨을 마운트할 때 `:Z` 옵션을 빠뜨리면 컨테이너가 파일에 접근하지 못한다. 컨테이너에서 `Permission denied`가 뜨는데 권한은 멀쩡해 보인다면 이걸 의심하면 된다.

---

## 10. Node 서비스 운영 — pm2

Node 애플리케이션을 직접 띄워 운영한다면 `pm2`가 편하다.

```bash
pm2 list                    # 프로세스 목록과 상태
pm2 logs                    # 전체 로그 실시간
pm2 logs myapp --lines 200
pm2 restart myapp
pm2 reload myapp            # 무중단 재시작 (cluster 모드)
pm2 stop myapp
pm2 monit                   # 대화형 모니터링
pm2 describe myapp          # 상세 정보 (재시작 횟수, 메모리)
pm2 save                    # 현재 목록 저장
pm2 startup                 # 부팅 시 자동 복구 설정
```

`pm2 describe`의 **restart 횟수가 계속 늘고 있다면 앱이 크래시–재시작을 반복하고 있다는 뜻**이다. 이때는 `pm2 logs`에서 크래시 직전 스택트레이스를 찾아야 한다.

---

## 11. 예약 작업

```bash
crontab -l                  # 현재 사용자의 크론 목록
crontab -e                  # 편집
sudo crontab -l -u hse      # 특정 사용자의 크론

# 분 시 일 월 요일
# 0 3 * * *     매일 새벽 3시
# */10 * * * *  10분마다
# 0 0 * * 0     매주 일요일 자정
```

크론 작업은 **로그를 반드시 남기게 작성하는 것**이 중요하다. 안 그러면 실패해도 아무도 모른다.

```bash
0 3 * * * /opt/scripts/backup.sh >> /var/log/backup.log 2>&1
```

크론이 실행됐는지 자체를 확인하려면:

```bash
journalctl -u crond --since today        # RHEL
journalctl -u cron --since today         # Debian/Ubuntu
```

크론은 로그인 셸이 아니라 최소한의 환경에서 실행된다. **"수동으로는 되는데 크론에서만 안 된다"의 99%는 PATH나 환경변수 문제**다. 스크립트 안에서 절대 경로를 쓰거나 필요한 환경변수를 명시적으로 설정하면 해결된다.

systemd timer는 크론의 현대적 대안이다.

```bash
systemctl list-timers --all
```

---

## 12. 패키지 관리

```bash
# RHEL / Rocky / Alma (dnf)
dnf install -y htop
dnf update
dnf search nginx
dnf info nginx
dnf list installed | grep nginx
dnf provides */ss           # 이 명령어가 어느 패키지에 있는지

# Debian / Ubuntu (apt)
apt update && apt upgrade
apt install -y htop
apt search nginx
apt list --installed | grep nginx
dpkg -l | grep nginx
```

폐쇄망 서버라면 `dnf provides`로 필요한 패키지를 특정한 뒤 `dnf download --resolve`로 의존성까지 받아 옮기는 방식이 유용하다.

---

## 상황별 요약

| 증상 | 첫 명령 | 그다음 |
|---|---|---|
| 서비스가 안 뜬다 | `systemctl status <svc>` | `journalctl -xe -u <svc>` |
| 포트 충돌 | `ss -tulnp \| grep :포트` | 해당 PID `kill` |
| 디스크 풀 | `df -h`, `df -i` | `du -h --max-depth=1 <경로> \| sort -rh` |
| 서버가 느리다 | `uptime`, `top` | `free -h`, `vmstat 1 5` |
| 프로세스가 사라졌다 | `dmesg -T \| grep -i oom` | 메모리 한계 조정 |
| 연결이 안 된다 | `nc -zv <host> <port>` | `firewall-cmd --list-all`, `getenforce` |
| 재부팅 원인 추적 | `last -x \| head` | `journalctl -b -1 -e` |
| 컨테이너 이상 | `podman logs --tail 100` | `podman inspect`, `podman exec` |

---

## 마치며

서버 운영에서 명령어 암기보다 중요한 건 **좁혀 들어가는 순서**다. 넓은 지표(`df`, `free`, `uptime`)로 영역을 특정하고, 그 영역의 로그(`journalctl`, `tail -F`)로 시점을 특정하고, 그 시점의 프로세스(`ss`, `ps`, `lsof`)로 원인을 특정한다. 이 세 단계만 몸에 배면 대부분의 장애는 몇 분 안에 원인까지 도달한다.

그리고 위험한 명령어(`rm -rf`, `sed -i`, `kill -9`, `--delete`)는 항상 **먼저 조회로 확인하고 나서 실행**하는 습관을 들이는 게, 결국 가장 많은 시간을 아껴준다.
