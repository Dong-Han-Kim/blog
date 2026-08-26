---
# 📌 기본 메타데이터
title: '리눅스 명령어, 실무에서 진짜 자주 쓰는 것들 (1) — 기본편'
date: '2026-08-26'
category: 'linux'
tags: ['Linux', 'CLI', 'Shell', '터미널']
description: '파일 탐색부터 텍스트 처리, 권한, 프로세스까지. 외우는 목록이 아니라 손에 붙는 순서로 정리한 리눅스 명령어 기본편.'

# 💬 옵션 필드
draft: false
series: '리눅스 명령어'
seriesOrder: 1

# 📚 SEO용
keywords: ['Linux', '리눅스 명령어', 'CLI', 'Shell', 'grep', 'find', 'sed', 'awk', '파이프', '리다이렉션', 'chmod', 'tmux']
---

# 리눅스 명령어, 실무에서 진짜 자주 쓰는 것들 (1) — 기본편

터미널을 처음 열면 명령어가 수천 개처럼 보이지만, 실제로 하루에 쓰는 건 30개 남짓이다. 이 글은 그 30개를 "카테고리별 목록"이 아니라 **실제로 쓰게 되는 순서**대로 정리한 것이다. 각 명령어마다 "이걸 왜 쓰는지"를 먼저 적었다.

1편은 로컬 개발 환경에서 쓰는 기본기, [2편](/posts/linux-commands-2-server-ops)은 서버에 SSH로 붙어서 장애를 다룰 때 쓰는 실무 명령어를 다룬다.

---

## 1. 지금 어디 있고 뭐가 있는가

터미널 작업의 90%는 "현재 위치 파악 → 이동 → 확인"의 반복이다.

```bash
pwd                 # 현재 경로 출력
ls                  # 목록
ls -al              # 숨김 파일 포함 + 상세 정보 (가장 많이 쓰는 조합)
ls -alh             # 용량을 사람이 읽기 쉽게 (1.2K, 3.4M)
ls -alt             # 수정 시간 최신순 — "방금 뭐가 바뀌었지?" 할 때
ls -alSh            # 용량 큰 순 — 디스크 정리할 때
```

`-h`(human-readable)는 용량을 다루는 거의 모든 명령어에서 통한다. `du -h`, `df -h`, `free -h` 전부 마찬가지다.

```bash
cd /var/log         # 절대 경로 이동
cd ..               # 상위로
cd -                # 직전 디렉토리로 토글 (두 곳 왔다갔다 할 때 아주 유용)
cd                  # 홈으로 (cd ~ 와 동일)
```

`cd -`는 의외로 모르는 사람이 많은데, 로그 디렉토리와 설정 디렉토리를 번갈아 볼 때 체감 효율이 크다.

---

## 2. 파일 다루기

```bash
touch file.txt              # 빈 파일 생성 (또는 타임스탬프 갱신)
mkdir logs                  # 디렉토리 생성
mkdir -p a/b/c              # 중간 경로까지 한 번에 — 스크립트에서는 항상 -p
cp src.txt dst.txt          # 복사
cp -r dir1 dir2             # 디렉토리 복사
cp -a dir1 dir2             # 권한·타임스탬프·심볼릭 링크까지 보존 (백업용)
mv old.txt new.txt          # 이동 겸 이름 변경
rm file.txt
rm -rf dir/                 # 재귀 강제 삭제
```

`rm -rf`는 되돌릴 수 없다. 습관을 하나 들이면 좋다 — **삭제 전에 같은 경로로 `ls`를 먼저 쳐본다.** 변수를 쓰는 스크립트라면 더더욱 (`rm -rf "$DIR"/`에서 `$DIR`가 비면 루트가 날아간다).

```bash
ln -s /opt/app/current /usr/local/bin/app   # 심볼릭 링크
readlink -f /usr/local/bin/app              # 링크가 최종적으로 가리키는 실제 경로
```

배포 디렉토리를 `current` 심볼릭 링크로 두고 링크만 갈아끼우는 방식은 무중단 배포의 고전적인 패턴이다.

---

## 3. 파일 내용 보기

파일 크기에 따라 도구를 바꾸는 게 핵심이다.

```bash
cat config.yml              # 짧은 파일 전체 출력
head -n 20 access.log       # 앞 20줄
tail -n 50 access.log       # 뒤 50줄
tail -f access.log          # 실시간으로 계속 따라 붙기
tail -F access.log          # 로그 로테이션 후에도 계속 따라감 (실무에선 -F 권장)
less access.log             # 페이저로 열기 — 큰 파일은 무조건 이것
```

`less` 안에서는:

| 키 | 동작 |
|---|---|
| `/문자열` | 앞으로 검색 |
| `?문자열` | 뒤로 검색 |
| `n` / `N` | 다음 / 이전 검색 결과 |
| `G` / `g` | 맨 끝 / 맨 앞 |
| `F` | `tail -f`처럼 실시간 따라가기 (Ctrl+C로 빠져나옴) |
| `q` | 종료 |

수백 MB짜리 로그에 `cat`을 치면 터미널이 몇 분간 마비된다. **큰 파일엔 `less`, 실시간엔 `tail -F`.**

```bash
wc -l access.log            # 줄 수 세기 — 건수 파악의 기본
file mystery.bin            # 파일 종류 판별
stat file.txt               # 크기, 권한, 접근/수정 시간 상세
```

---

## 4. 찾기: find 와 grep

리눅스에서 가장 자주 쓰게 되는 두 명령어다. 역할이 다르다.

- `find` — **파일을 이름/속성으로** 찾는다
- `grep` — **파일 안의 내용을** 찾는다

### find

```bash
find . -name "*.log"                    # 현재 경로 아래 .log 전부
find . -iname "*.LOG"                   # 대소문자 무시
find /var/log -type f -mtime -1         # 최근 24시간 내 수정된 파일
find /var/log -type f -size +100M       # 100MB 넘는 파일 — 디스크 찰 때 1순위
find . -type d -name node_modules       # 디렉토리만
find . -name "*.tmp" -delete            # 찾아서 바로 삭제
find . -name "*.log" -exec gzip {} \;   # 찾은 각 파일에 명령 실행
```

`-delete`나 `-exec`를 붙이기 전에, **먼저 조건만으로 실행해서 목록을 눈으로 확인하는 습관**이 사고를 막아준다.

### grep

```bash
grep "ERROR" app.log
grep -i "error" app.log         # 대소문자 무시
grep -n "ERROR" app.log         # 줄 번호 표시
grep -r "TODO" ./src            # 디렉토리 재귀 검색
grep -v "healthcheck" app.log   # 해당 패턴을 제외 (노이즈 걷어내기)
grep -c "ERROR" app.log         # 매칭 건수만
grep -A 5 -B 5 "Exception" app.log   # 매칭 줄의 앞뒤 5줄까지 (스택트레이스 볼 때 필수)
grep -E "ERROR|FATAL" app.log   # 확장 정규식 (OR 조건)
```

실무에서 가장 자주 쓰는 조합은 이것이다:

```bash
grep -n -A 20 "Exception" app.log | less
```

에러 위치와 그 뒤 스택트레이스를 줄 번호와 함께 페이저로 보는 것. 하루에도 몇 번씩 친다.

> 참고: `ripgrep`(`rg`)을 설치하면 `grep -r`보다 훨씬 빠르고, `.gitignore`를 자동으로 존중한다. 코드베이스 검색은 `rg`가 사실상 표준이 됐다.

---

## 5. 파이프와 리다이렉션 — 유닉스의 핵심

명령어 하나하나보다 **조합하는 방식**이 리눅스의 진짜 힘이다.

```bash
command > file.txt      # 표준출력을 파일로 (덮어쓰기)
command >> file.txt     # 이어쓰기
command 2> error.log    # 표준에러만 파일로
command > out.log 2>&1  # 표준출력 + 표준에러 모두 한 파일로
command &> out.log      # 위와 동일 (bash 축약형)
command < input.txt     # 파일을 표준입력으로
command1 | command2     # 앞의 출력을 뒤의 입력으로
```

`2>&1`은 크론잡이나 백그라운드 실행에서 필수다. 에러 로그가 안 남아서 원인을 못 찾는 사고의 대부분이 이걸 빠뜨린 경우다.

```bash
sort                # 정렬
sort -u             # 정렬 + 중복 제거
sort -n             # 숫자 정렬 (없으면 10이 9보다 앞에 온다)
sort -rn            # 숫자 역순
uniq -c             # 중복 개수 세기 (반드시 sort 뒤에)
cut -d, -f1,3       # 콤마 구분 1,3번째 필드
tr -d '\r'          # 문자 삭제 (CRLF 정리에 자주 씀)
xargs               # 앞의 출력을 뒤 명령의 "인자"로 넘김
tee output.log      # 화면에 출력하면서 동시에 파일로도 저장
```

가장 유명한 조합 하나:

```bash
# 접속 IP를 많은 순으로 상위 10개
awk '{print $1}' access.log | sort | uniq -c | sort -rn | head -10
```

`awk`로 첫 필드(IP)만 뽑고 → 정렬하고 → 중복 세고 → 개수 역순 정렬 → 상위 10개. 이 패턴은 IP뿐 아니라 에러 종류, URL, 상태 코드 집계에 그대로 재사용된다.

```bash
# 파일에 저장하면서 동시에 화면으로도 보기
./build.sh 2>&1 | tee build.log
```

---

## 6. 텍스트 가공: sed 와 awk

둘 다 깊게 파면 언어 수준이지만, 실무에서 쓰는 건 몇 가지 패턴뿐이다.

### sed — 치환

```bash
sed 's/old/new/' file.txt        # 각 줄의 첫 번째만 치환 (출력만, 파일은 그대로)
sed 's/old/new/g' file.txt       # 각 줄 전체 치환
sed -i 's/old/new/g' file.txt    # 파일을 직접 수정
sed -i.bak 's/old/new/g' file.txt  # 수정 전 .bak 백업 남기기
sed -n '10,20p' file.txt         # 10~20번째 줄만 출력
sed '/^#/d' config.conf          # 주석 줄 삭제
```

`-i`는 되돌릴 수 없다. **먼저 `-i` 없이 실행해서 결과를 눈으로 확인한 뒤 `-i`를 붙이는 것**이 안전한 순서다.

### awk — 필드 추출과 계산

```bash
awk '{print $1}' file            # 1번째 필드
awk '{print $1, $NF}' file       # 1번째와 마지막 필드
awk -F: '{print $1}' /etc/passwd # 구분자 지정
awk '$3 > 100 {print $0}' file   # 조건에 맞는 줄만
awk '{sum += $2} END {print sum}' file   # 특정 열 합계
```

로그에서 응답시간 평균 같은 걸 즉석에서 뽑을 때 `awk` 한 줄이면 끝난다.

---

## 7. 권한

리눅스를 쓰다 막히는 원인 1위는 대부분 권한이다.

```bash
ls -l script.sh
# -rwxr-xr--  1 han staff  1024 Aug 26 10:00 script.sh
#  │└┬┘└┬┘└┬┘
#  │ │  │  └── other (기타 사용자)
#  │ │  └───── group (그룹)
#  │ └──────── owner (소유자)
#  └────────── 파일 타입 (- 파일, d 디렉토리, l 링크)
```

`r`=4, `w`=2, `x`=1로 더한 값이 숫자 표기다.

```bash
chmod 755 script.sh     # 소유자 rwx, 그룹/기타 r-x — 실행 스크립트 기본값
chmod 644 config.yml    # 소유자 rw-, 나머지 r-- — 일반 파일 기본값
chmod 600 id_rsa        # 소유자만 rw- — SSH 개인키는 반드시 이것
chmod +x deploy.sh      # 실행 권한만 추가
chmod -R 755 public/    # 재귀 적용

chown han:staff file.txt      # 소유자:그룹 변경
chown -R han:staff /opt/app   # 재귀
```

SSH 키 권한이 `600`이 아니면 접속이 거부된다. `Permissions 0644 for 'id_rsa' are too open` 에러를 보면 `chmod 600`을 떠올리면 된다.

```bash
sudo command            # 관리자 권한으로 1회 실행
sudo -i                 # 루트 셸로 전환
sudo -u hse command     # 특정 사용자로 실행
```

---

## 8. 프로세스

```bash
ps aux                          # 전체 프로세스 목록
ps aux | grep node              # 특정 프로세스 찾기
pgrep -a node                   # 더 깔끔한 대안
top                             # 실시간 모니터링
htop                            # top의 개선판 (별도 설치)

kill 1234                       # 종료 시그널(TERM) — 정상 종료 시도
kill -9 1234                    # 강제 종료(KILL) — 최후의 수단
pkill -f "node server.js"       # 명령줄 패턴으로 종료
```

`kill -9`는 프로세스가 정리 작업(파일 flush, 커넥션 반납)을 할 기회를 주지 않는다. **먼저 `kill`, 안 되면 `kill -9`** 순서를 지키는 게 좋다.

```bash
command &               # 백그라운드 실행
jobs                    # 백그라운드 작업 목록
fg %1                   # 포그라운드로 가져오기
Ctrl+Z                  # 현재 작업 일시정지
bg                      # 정지된 작업을 백그라운드로

nohup ./server.sh &     # 로그아웃해도 계속 실행
```

다만 실무에서 장시간 작업은 `nohup`보다 `tmux`나 `zellij` 같은 터미널 멀티플렉서를 쓰는 게 낫다. 접속이 끊겨도 세션이 그대로 살아 있고, 다시 붙어서 화면을 이어볼 수 있다.

```bash
tmux new -s work        # 새 세션
tmux ls                 # 세션 목록
tmux attach -t work     # 다시 붙기
# Ctrl+B 후 D 로 분리(detach)
```

---

## 9. 압축과 전송

```bash
tar -czf backup.tar.gz dir/     # 압축 (c생성 z gzip f파일)
tar -xzf backup.tar.gz          # 해제
tar -tzf backup.tar.gz          # 내용만 확인 (풀기 전 확인용)
tar -xzf backup.tar.gz -C /opt  # 특정 경로에 풀기

zip -r archive.zip dir/
unzip archive.zip
gzip file.log                   # 단일 파일 압축 (원본 대체)
gunzip file.log.gz
zcat file.log.gz | grep ERROR   # 압축 푼 채로 검색 (로테이션된 로그에 유용)
```

`tar` 옵션은 `czf`(압축) / `xzf`(해제) 두 개만 외워도 충분하다.

```bash
scp file.txt user@host:/path/           # 로컬 → 원격
scp user@host:/path/file.txt .          # 원격 → 로컬
scp -r dir/ user@host:/path/            # 디렉토리

rsync -avz --progress src/ user@host:/dst/    # 변경분만 동기화
rsync -avz --delete src/ dst/                 # 원본에 없는 건 대상에서도 삭제
```

큰 디렉토리를 반복 전송한다면 `scp`보다 `rsync`가 압도적으로 빠르다. 바뀐 부분만 보내기 때문이다. 단 `--delete`는 위험하니 `--dry-run`으로 먼저 확인하자.

---

## 10. 네트워크 기초

```bash
curl https://api.example.com
curl -I https://example.com             # 헤더만
curl -v https://example.com             # 상세 (핸드셰이크까지)
curl -X POST -H "Content-Type: application/json" \
     -d '{"key":"value"}' https://api.example.com

wget https://example.com/file.zip       # 파일 다운로드
ping example.com
dig example.com                         # DNS 조회
nslookup example.com
```

API 디버깅은 `curl -v`가 브라우저 개발자 도구보다 빠를 때가 많다. 응답 시간만 재고 싶으면:

```bash
curl -o /dev/null -s -w "%{time_total}\n" https://example.com
```

---

## 11. 알아두면 삶이 편해지는 것들

```bash
history                     # 명령어 기록
history | grep docker       # 예전에 쳤던 그 명령어 찾기
!!                          # 직전 명령 재실행 (sudo !! 조합이 유명)
!1234                       # 기록 번호로 재실행
Ctrl+R                      # 기록 역방향 검색 — 가장 많이 쓰는 단축키

which node                  # 실행 파일 경로
type ll                     # alias인지 함수인지 실행파일인지 판별
man grep                    # 매뉴얼
grep --help                 # 짧은 도움말 (man보다 빠를 때가 많다)
tldr tar                    # 예시 중심 요약 (별도 설치, 강력 추천)
```

터미널 편집 단축키도 몇 개만 익히면 체감이 크다.

| 단축키 | 동작 |
|---|---|
| `Ctrl+A` / `Ctrl+E` | 줄 맨 앞 / 맨 끝으로 |
| `Ctrl+W` | 앞 단어 삭제 |
| `Ctrl+U` | 커서 앞 전체 삭제 |
| `Ctrl+K` | 커서 뒤 전체 삭제 |
| `Ctrl+L` | 화면 지우기 (`clear`와 동일) |
| `Ctrl+C` | 현재 명령 중단 |
| `Ctrl+D` | 입력 종료 / 셸 종료 |

---

## 정리

명령어를 외우려 하지 말고, **하고 싶은 일에서 도구를 역으로 떠올리는 연습**을 하는 게 빠르다.

| 하고 싶은 일 | 도구 |
|---|---|
| 파일 이름으로 찾기 | `find` |
| 파일 내용으로 찾기 | `grep` / `rg` |
| 큰 로그 보기 | `less` |
| 로그 실시간 감시 | `tail -F` |
| 값 치환 | `sed` |
| 열 뽑기 / 집계 | `awk` |
| 건수 집계 | `sort \| uniq -c \| sort -rn` |
| 안 되면 권한부터 의심 | `ls -l`, `chmod`, `chown` |

2편에서는 실제 서버에 붙어서 쓰는 것들 — `systemd`, `journalctl`, 포트 점유 추적, 디스크 풀 대응, 컨테이너 운영 — 을 다룬다.
