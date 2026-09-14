---
# 📌 기본 메타데이터
title: '리눅스 명령어, 실무에서 진짜 자주 쓰는 것들 (4) — 터미널 에디터 지형도'
date: '2026-09-14'
category: 'linux'
tags: ['Linux', 'Vim', 'Neovim', 'nano', '터미널', '에디터']
description: 'vi, Vim, Neovim, nano는 뭐가 다른가. 계보와 설계 철학부터 실무에서 뭘 고를지, 폐쇄망 서버에 에디터를 어떻게 들고 갈지까지 정리한 터미널 에디터 전체 지형도.'

# 💬 옵션 필드
draft: false
series: '리눅스 명령어'
seriesOrder: 4

# 📚 SEO용
keywords: ['Linux', 'Vim', 'Neovim', 'nano', '터미널', '에디터', '리눅스 명령어', 'EDITOR', 'update-alternatives', 'Helix', 'micro']
---

# 리눅스 명령어, 실무에서 진짜 자주 쓰는 것들 (4) — 터미널 에디터 지형도

`crontab -e`를 쳤는데 처음 보는 화면이 떴다. 뭘 눌러도 글자가 안 써지고, Ctrl+C도 안 먹는다. 결국 터미널 창을 그냥 닫아버린 경험, 아마 다들 한 번쯤 있을 것이다.

[2편](/posts/linux-commands-2-server-ops)에서 다룬 `crontab -e`, `visudo`, `systemctl edit` 같은 명령어는 전부 **에디터를 띄운다.** 그리고 그 에디터가 뭐가 될지는 서버 설정에 달려 있다. 즉 서버를 다루는 이상 에디터 선택은 취향 문제가 아니라 **장애 대응 능력의 일부**다.

이 글은 터미널 에디터의 전체 지형도를 다룬다. vi와 Vim이 왜 다른 이름인지, Neovim이 왜 갈라져 나왔는지, nano를 언제 쓰는 게 맞는지, 그리고 폐쇄망 서버에 원하는 에디터를 어떻게 들고 갈지까지.

## 1. 한 장으로 보는 계보

```text
ed (1969, 라인 에디터)
 └─ ex (1976, ed의 확장)
     └─ vi (1976, ex의 "비주얼 모드")  ← Bill Joy
         ├─ nvi / elvis / vile        (BSD 계열 클론)
         └─ Vim (1991, Bram Moolenaar) ← "Vi IMproved"
             ├─ Neovim (2014 fork)
             └─ (영향) Helix, Kakoune, IDE의 vim 모드 …

별개 계보:
pico (Pine 메일 클라이언트의 내장 에디터)
 └─ GNU nano (1999, pico의 자유 소프트웨어 대체품)

또 다른 우주:
Emacs (1976~) — 에디터라기보다 Lisp 런타임
```

이 지형도의 핵심 분기점은 딱 하나다. **모달(modal)이냐 아니냐.**

vi 계열은 "지금 글자를 입력 중인가, 명령을 내리는 중인가"를 모드로 구분한다. nano와 Emacs 계열은 구분하지 않고, 명령은 Ctrl·Alt 조합으로 낸다. 나머지 차이는 대부분 이 한 가지 선택에서 파생된 것이다.

## 2. 모달 편집은 왜 생겼나

지금 기준으로 보면 "입력하려면 `i`를 눌러야 한다"는 건 이상한 설계다. 하지만 1976년의 제약을 보면 납득이 된다.

Bill Joy가 vi를 만들 때 쓰던 건 **ADM-3A 터미널**이었고, 접속은 300 보드(baud) 모뎀이었다. 초당 30바이트. 화면 한 번 다시 그리는 데 수십 초가 걸린다는 뜻이다. 여기서 두 가지 설계가 강제된다.

**첫째, 화면 갱신을 최소화해야 한다.** 그래서 `3dd`(세 줄 삭제) 같은 **압축된 명령**이 필요했다. 전송량이 곧 비용이었으니까.

**둘째, 별도 수식 키를 쓸 수 없다.** ADM-3A 키보드에는 화살표 키가 따로 없었다. 대신 `h j k l` 키에 화살표가 각인되어 있었다. 지금 우리가 `hjkl`로 이동하는 이유가 이것이다. 그리고 `Esc` 키는 지금의 `Tab` 자리, 즉 새끼손가락 바로 옆에 있었다. 지금 `Esc`가 멀게 느껴지는 건 vi의 잘못이 아니라 키보드가 바뀐 탓이다.

```text
ADM-3A 키보드 배열 (일부)

  Esc   1  2  3  4  5  ...        ← Esc가 여기 있었다
  Tab   Q  W  E  R  T  ...
  Ctrl  A  S  D  F  G  H← J↓ K↑ L→  ← hjkl에 화살표가 각인
```

제약에서 나온 설계지만, 결과적으로 **손이 홈 포지션을 떠나지 않는다**는 부수 효과가 남았고 그게 40년 넘게 살아남은 이유가 됐다. Caps Lock을 Ctrl이나 Esc로 리맵하는 것이 vim 사용자들의 첫 번째 의식인 것도 이 역사 때문이다.

## 3. vi — 이름이자 규격, 그리고 유령

`vi`는 POSIX 표준에 명세된 **인터페이스 규격**이다. "어떤 유닉스에 가도 vi는 있다"가 성립하는 이유다. 문제는 **`vi`를 쳤을 때 실제로 실행되는 프로그램이 시스템마다 다르다**는 점이다.

| **환경** | **`vi`의 실체** |
|---|---|
| RHEL / Rocky (minimal 설치) | `vim-minimal` 패키지의 축소판 Vim |
| Debian / Ubuntu 기본 | `vim.tiny` 또는 `vim-basic` (`update-alternatives`로 연결) |
| macOS | Vim 심볼릭 링크 |
| FreeBSD / OpenBSD | `nvi` (진짜 vi 클론) |
| Alpine / Busybox 컨테이너 | `busybox vi` — 완전히 다른 최소 구현 |

```bash
readlink -f $(which vi)     # 실체 확인
vi --version | head -1      # Vim이면 버전이 뜬다
```

**실무에서 순수한 vi를 만나는 순간은 한정적이다.** 갓 프로비저닝된 서버, 폐쇄망, 컨테이너 안, 복구 모드(single user mode). 즉 아무것도 깔려 있지 않은 곳. 이때 vi로 `/etc/ssh/sshd_config` 한 줄을 고쳐 서비스를 살리는 능력이 필요하다.

유명한 함정 하나 — Debian 계열의 `vim.tiny`를 `vi`로 쓰면 **입력 모드에서 방향키가** **`ABCD`** **문자를 찍는다.** `nocompatible`이 설정되지 않아 방향키의 이스케이프 시퀀스를 그대로 받기 때문이다. 해법은 `hjkl`을 쓰거나, 정 안 되면:

```bash
echo 'set nocompatible' >> ~/.vimrc
```

**장점** — 어디에나 있다. 가볍다. 의존성이 없다. **단점** — 그게 전부다. 신택스 하이라이팅도, 여러 번 실행 취소도 보장되지 않는다.

## 4. Vim — 사실상의 기본값

vi에 사람이 원할 만한 걸 30년간 붙여온 결과물. 1991년 Bram Moolenaar가 Amiga용으로 시작했고, 지금은 사실상 유닉스 세계의 표준 에디터다.

현재 안정 버전은 **2026년 2월 14일에 나온 9.2**다. 9.1 이후 2년 만의 메이저 릴리스로, 주요 변경은 이렇다.

- **Vim9 Script 강화** — enum, 제네릭 함수, 튜플 타입 추가. 내장 함수를 메서드처럼 쓸 수 있게 됨
- **자동완성 개선** — 입력 모드 완성에 퍼지 매칭 도입, 대용량 버퍼에서 완성이 멈추던 문제 개선
- **XDG Base Directory 준수** — 설정을 `~/.vimrc`가 아니라 `~/.config/vim`에 둘 수 있게 됨
- **Wayland 실험적 지원** — UI와 클립보드 연동
- **대화형 튜터 플러그인 내장** — 에디터 안에서 바로 학습 가능
- **수직 탭 패널** — 버퍼가 많을 때 가로 탭라인의 대안

Bram Moolenaar가 2023년 8월 세상을 떠난 뒤로는 커뮤니티 유지보수 체제로 운영되고 있다. 릴리스 속도는 느려졌지만 개발은 꾸준히 이어지고 있다.

**장점**

- 어지간한 리눅스 서버에 이미 있거나 `dnf install vim` 한 줄로 끝
- 단일 바이너리에 의존성이 적어 **폐쇄망 이식이 쉽다**
- 30년치 문서(`:help`)와 Q&A 축적량이 압도적. 막히면 반드시 답이 있다
- 하위 호환에 극도로 보수적 — 10년 전 `.vimrc`가 지금도 대체로 동작한다

**단점**

- 기본 설정이 1990년대 감성. 쓸 만해지려면 `.vimrc`를 손봐야 한다
- Vimscript는 느리고 문법이 독특하다 (Vim9 Script로 많이 개선됐지만 생태계 전환은 더디다)
- LSP·Tree-sitter 같은 현대적 기능은 플러그인으로 붙여야 한다
- **신규 플러그인 생태계가 Neovim 쪽으로 상당히 넘어갔다** — 실질적으로 가장 큰 단점

## 5. Neovim — 리팩터링에서 시작된 갈라짐

2014년, "Vim 코드베이스가 너무 낡아서 기여가 사실상 불가능하다"는 문제의식에서 포크됐다. 2015년 11월에 첫 릴리스가 나왔다.

목표는 Vim을 대체하는 게 아니라 **유지보수 가능한 형태로 다시 쓰는 것**이었다. 결과적으로 Vim보다 소스 코드가 30% 적고, Lua가 내장되어 있으면서 Vimscript도 계속 지원한다. 2021년 7월 0.5 릴리스에서 LSP를 내장하면서 방향이 확실해졌다.

버전은 **2026년 3월 말 0.12.0**이 나온 뒤 빠른 속도로 점 릴리스가 이어져 8월 말 기준 0.12.5까지 올라왔다. 1.0을 향해 가는 중이다. 2025년 Stack Overflow 개발자 설문에서는 5년 연속 "가장 선망받는 개발 환경"으로 뽑혔다.

### Vim과 실제로 뭐가 다른가

| **항목** | **Vim** | **Neovim** |
|---|---|---|
| 설정 언어 | Vimscript / Vim9 Script | **Lua** (`init.lua`), Vimscript도 가능 |
| 설정 위치 | `~/.vimrc` (9.2부터 `~/.config/vim`도) | `~/.config/nvim/init.lua` |
| LSP | 플러그인 (coc.nvim, vim-lsp) | **내장** (`vim.lsp`) |
| Tree-sitter | 없음 | **내장** — 구문 트리 기반 정확한 하이라이팅 |
| 비동기 작업 | Vim 8부터 지원 | 처음부터 설계에 포함 |
| 터미널 내장 | 있음 (`:terminal`) | 있음 |
| 아키텍처 | 단일 프로세스 | **RPC 기반 클라이언트/서버** |
| 외부 UI | 제한적 (gvim) | Neovide, VSCode Neovim, Firenvim 등 |
| 라이선스 | Vim License (charityware) | Apache 2.0 |

아키텍처 차이가 의외로 중요하다. Neovim은 에디터 코어와 UI가 RPC로 분리되어 있어서, **VSCode 안에서 진짜 Neovim을 엔진으로 돌리거나** GPU 렌더링 GUI를 붙이는 게 가능하다. Vim에서는 구조적으로 어려운 일이다. Neovim 공식 문서가 UI를 "거꾸로 된 플러그인(inverted plugins)"이라고 부르는 이유다.

### Tree-sitter가 실제로 뭘 바꾸나

Vim의 신택스 하이라이팅은 **정규식 기반**이다. 파일을 위에서부터 패턴 매칭으로 훑는다. 그래서 중첩이 깊어지면 틀리고, 큰 파일에서 느려진다. JSX처럼 언어가 섞인 파일에서 하이라이팅이 깨지는 걸 본 적 있다면 그 원인이다.

Tree-sitter는 **실제 파서를 돌려 구문 트리를 만든다.** 그래서:

- 하이라이팅이 문법적으로 정확하다
- 편집할 때마다 트리 전체가 아니라 **바뀐 부분만 증분 파싱**한다 → 빠르다
- 구문 트리가 있으니 "함수 단위 선택", "인자 단위 이동" 같은 조작이 가능해진다

```vim
:InspectTree      " 현재 파일의 구문 트리를 옆 창에 띄운다
```

이건 플러그인으로는 얻기 어려운 종류의 차이라, Neovim을 고르는 실질적 이유 중 하나다.

**장점**

- 기본 상태로도 상당히 현대적 (Tree-sitter, LSP, 플로팅 윈도우)
- Lua 설정은 빠르고, 그냥 프로그래밍 언어라 디버깅이 쉽다
- LazyVim, kickstart.nvim 같은 배포판으로 30분이면 IDE급 환경 구성
- 신규 플러그인 대부분이 여기로 온다

**단점**

- **0.x 시절 API 변경이 잦았다.** 버전 업에 설정이 깨지는 경험을 다들 한 번쯤 한다
- 서버에 기본 설치되어 있지 않다. 폐쇄망이면 직접 옮겨야 한다 (아래 12장)
- 플러그인을 욕심내면 시작이 무거워지고, 결국 **"설정 관리"가 취미가 되는 함정**에 빠지기 쉽다
- 설정이 Vim과 호환되지 않는다 (Vimscript는 대체로 통하지만 Lua 설정은 반대로 못 간다)

## 6. nano — "그냥 고치고 나가고 싶다"

Pine 메일 클라이언트의 내장 에디터였던 pico의 GNU 대체품. 1999년에 나왔다. 모드가 없고, **하단에 단축키가 항상 표시된다.** `^X`는 Ctrl+X를 뜻한다.

```text
^G Help    ^O Write Out   ^W Where Is   ^K Cut      ^T Execute
^X Exit    ^R Read File   ^\ Replace    ^U Paste    ^C Location
```

**장점**

- 학습 곡선이 사실상 0. 처음 켠 사람도 저장하고 나갈 수 있다
- 최근 버전은 신택스 하이라이팅, 다중 버퍼, 정규식 검색, 줄 번호까지 지원
- Ubuntu 계열에서 `EDITOR` 기본값인 경우가 많다
- **팀에 vi를 못 쓰는 사람이 있을 때 사고를 줄여준다** — 실무적으로 이게 진짜 장점이다

**단점**

- 대용량 파일에서 느리고 무겁다
- 매크로, 복잡한 치환, 다중 커서가 없다. 반복 편집은 고통스럽다
- 커서 이동이 전부 방향키 → 손이 홈 포지션을 떠난다
- 확장성이 거의 없다

`~/.nanorc` 몇 줄만 넣어도 체감이 크게 달라진다.

```text
set linenumbers          # 줄 번호
set tabstospaces         # 탭을 스페이스로
set tabsize 4
set constantshow         # 커서 위치 상시 표시
set softwrap             # 긴 줄 부드럽게 감싸기
set mouse                # 마우스 클릭으로 커서 이동
include /usr/share/nano/*.nanorc   # 신택스 하이라이팅 전부 로드
```

한 가지 주의 — nano는 기본적으로 **긴 줄을 자동으로 줄바꿈해서 저장**하던 시절이 있었다. 설정 파일을 편집할 때 치명적일 수 있으니, 오래된 버전을 만나면 `-w`(`--nowrap`) 옵션을 붙이는 습관이 안전하다. 최신 버전은 기본값이 바뀌었다.

```bash
nano -w /etc/nginx/nginx.conf
```

## 7. 지형도의 나머지

### Emacs

에디터가 아니라 **Lisp 런타임에 가깝다.** 메일, git, 파일 관리, 셸, 문서 작성(org-mode)까지 그 안에서 돌린다. `magit`은 여전히 "존재하는 최고의 git 인터페이스"라는 평이 많고, 그것만으로 Emacs를 쓰는 사람도 있다.

다만 서버 운영 맥락에서는 거의 만나지 않는다. 기본 설치되는 경우가 드물고 무겁다. 요즘은 `evil-mode`로 vim 키바인딩을 얹어 쓰는 게 사실상 표준이라, "vim 조작 + Emacs 생태계" 조합으로 수렴하는 경향이 있다.

### Helix

Rust로 작성된 모달 에디터. **LSP와 Tree-sitter가 내장이고 설정 파일 없이 바로 IDE처럼 동작한다.** 이게 가장 큰 매력이다.

가장 큰 차이는 키 순서다. Vim이 동사 → 명사라면 Helix는 **명사 → 동사**다.

```text
vim:    dw    (delete word)      — 먼저 지운다고 선언하고 범위를 말한다
helix:  wd    (word → delete)    — 먼저 범위를 선택하고 지운다
```

선택 범위가 항상 화면에 보이므로 "무슨 일이 일어날지" 예측하기 쉽다. 대신 **vim 근육 기억과 정면으로 충돌한다.** 아직 플러그인 시스템이 미완성이라는 점도 감안해야 한다.

### Kakoune

Helix가 참고한 원조. 다중 선택 중심이고, **유닉스 철학에 충실하다** — 에디터 안에 기능을 넣기보다 외부 명령과 자유롭게 파이프로 연결하는 방식을 택했다. `|` 하나로 선택 영역을 `sort`나 `jq`에 통과시킬 수 있다.

### micro

Go로 만든 단일 바이너리 에디터. **Ctrl+S 저장, Ctrl+C 복사, Ctrl+Z 실행 취소 등 일반적인 GUI 단축키가 그대로 통한다.** nano보다 현대적이면서 학습 비용은 비슷하다. 정적 바이너리라 서버에 그냥 던져넣으면 끝이라, 폐쇄망에서 특히 편하다.

### ed

화면이 없는 라인 에디터. 진짜로 부서진 시스템에서 마지막 수단. 알 필요는 없지만 존재는 알아둘 만하다. 참고로 `sed`의 `s/old/new/` 문법이 여기서 왔다.

## 8. 비교 정리

|  | **vi** | **nano** | **micro** | **Vim** | **Neovim** | **Helix** |
|---|---|---|---|---|---|---|
| 기본 설치 | ✅ 항상 | 대부분 | ❌ | 흔함 | ❌ | ❌ |
| 모드 기반 | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| 학습 곡선 | 가파름 | 없음 | 없음 | 가파름 | 가파름 | 중간 |
| 설정 없이 쓸 만한가 | ❌ | ✅ | ✅ | △ | △ | **✅** |
| LSP | ❌ | ❌ | 제한적 | 플러그인 | **내장** | **내장** |
| Tree-sitter | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| 설정 언어 | — | ini 유사 | JSON | Vimscript | **Lua** | TOML |
| 대용량 파일 | 양호 | 취약 | 보통 | 양호 | 양호 | 양호 |
| 폐쇄망 이식 | 불필요 | 쉬움 | **매우 쉬움** | 쉬움 | 중간 | 중간 |

## 9. Vim을 "문법"으로 이해하기

Vim 학습이 어려운 이유는 대부분 **명령어를 목록으로 외우려 하기 때문**이다. 실제로는 문법이 있고, 단어를 조합하는 구조다.

```text
[횟수] 동사 [횟수] 모션/텍스트오브젝트
```

**동사 (operator)**

| **키** | **의미** |
|---|---|
| `d` | delete — 지우기 |
| `c` | change — 지우고 입력 모드로 |
| `y` | yank — 복사 |
| `>` / `<` | 들여쓰기 / 내어쓰기 |
| `=` | 자동 정렬 |
| `gu` / `gU` | 소문자 / 대문자 |

**모션 (motion)**

| **키** | **의미** |
|---|---|
| `w` / `b` | 다음 단어 / 이전 단어 |
| `e` | 단어 끝 |
| `0` / `^` / `$` | 줄 처음 / 첫 글자 / 줄 끝 |
| `gg` / `G` | 파일 처음 / 끝 |
| `f<문자>` / `t<문자>` | 그 문자까지 / 직전까지 |
| `%` | 짝이 되는 괄호로 |

**텍스트 오브젝트 (text object)** — 이게 vim의 진짜 힘이다.

| **키** | **의미** |
|---|---|
| `iw` / `aw` | 단어 안 / 단어 + 주변 공백 |
| `i"` / `a"` | 따옴표 안 / 따옴표 포함 |
| `i(` / `a(` | 괄호 안 / 괄호 포함 |
| `it` / `at` | HTML 태그 안 / 태그 포함 |
| `ip` / `ap` | 문단 |

조합하면 이렇게 읽힌다.

```vim
diw     " delete inner word — 커서가 단어 어디에 있든 그 단어를 지운다
ci"     " change inner quote — 따옴표 안 내용을 통째로 바꾼다
ya(     " yank a paren — 괄호 포함해서 복사
d2j     " 아래 두 줄 포함해 삭제
>ip     " 현재 문단 전체 들여쓰기
cit     " HTML 태그 안 내용 전부 교체
```

**`i`** **= inner(안쪽),** **`a`** **= around(포함).** 이 두 글자만 이해하면 조합 수십 개가 자동으로 생긴다. 목록을 외우는 게 아니라 문장을 만드는 것이다.

여기에 반복 두 개를 더하면 실무에서 쓰는 건 거의 다 된다.

```vim
.       " 직전 편집 반복 — vim에서 가장 강력한 한 글자
u       " 실행 취소
Ctrl+r  " 다시 실행
```

## 10. 최소 생존 세트

취향과 무관하게 이건 익혀두는 게 좋다. `crontab -e`나 `visudo`가 갑자기 vi를 띄웠을 때 빠져나오지 못하면 **그 자체가 사고**가 되기 때문이다.

```text
i          입력 모드 진입
a          커서 다음 위치에서 입력
o          아래에 새 줄 만들고 입력
Esc        입력 모드 탈출

:w         저장
:q         종료
:wq / ZZ   저장 후 종료
:q!        저장하지 않고 강제 종료   ← 가장 중요
:w !sudo tee %   sudo 없이 열었을 때 강제 저장

dd         한 줄 삭제
yy / p     한 줄 복사 / 붙여넣기
u          실행 취소

/문자열     아래로 검색  (n 다음, N 이전)
:숫자       해당 줄로 이동
gg / G     맨 앞 / 맨 끝
:%s/a/b/g  전체 치환
:set nu    줄 번호 표시
```

`vimtutor`를 한 번(약 30분) 돌리면 이 정도는 몸에 붙는다. Vim 9.2부터는 에디터 안에서 바로 띄우는 대화형 튜터 플러그인도 들어갔다.

```bash
vimtutor        # 터미널에서
vimtutor ko     # 한국어 버전 (배포판에 따라 있음)
```

## 11. 설정 시작점

### .vimrc 최소 세트

플러그인 없이 이것만으로도 체감이 크게 달라진다.

```vim
set nocompatible          " vi 호환 끄기 (방향키 문제 해결)
syntax on
filetype plugin indent on

set number relativenumber " 줄 번호 + 상대 번호 (5j 같은 이동에 유용)
set expandtab
set tabstop=4 shiftwidth=4 softtabstop=4
set autoindent smartindent

set ignorecase smartcase  " 소문자로 검색하면 대소문자 무시, 대문자 섞으면 구분
set incsearch hlsearch    " 입력하면서 검색 + 결과 강조
set scrolloff=5           " 커서 위아래 최소 5줄 여유

set undofile              " 파일을 닫아도 실행 취소 기록 유지
set undodir=~/.vim/undo
set noswapfile

set clipboard=unnamedplus " 시스템 클립보드 공유 (+clipboard 빌드 필요)
set mouse=a

" Esc 대신 jk
inoremap jk <Esc>
" 검색 강조 끄기
nnoremap <silent> <Esc><Esc> :nohlsearch<CR>
```

`set undofile` 하나만으로도 "어제 편집한 걸 오늘 되돌리는" 게 가능해진다. 의외로 잘 안 쓰는 설정이다.

```bash
mkdir -p ~/.vim/undo
vim --version | grep clipboard    # +clipboard 인지 -clipboard 인지 확인
```

RHEL의 `vim-minimal`은 `-clipboard`인 경우가 많다. 시스템 클립보드 연동이 필요하면 `vim-enhanced`를 설치해야 한다.

### Neovim 시작점

맨바닥부터 `init.lua`를 쓰는 건 학습에는 좋지만 시간이 많이 든다. 현실적인 선택지는 셋이다.

| **방식** | **성격** | **추천 대상** |
|---|---|---|
| **kickstart.nvim** | 주석 달린 단일 파일 설정. 읽고 고치라는 취지 | 원리를 이해하며 직접 쌓고 싶은 경우 |
| **LazyVim** | 잘 구성된 완제품 배포판 | 빨리 쓸 환경이 필요한 경우 |
| 맨바닥 `init.lua` | 전부 직접 | 시간 여유와 학습 목적이 확실할 때 |

kickstart로 시작해 필요한 것만 붙여가는 쪽을 권한다. 완제품 배포판은 편하지만, **뭔가 깨졌을 때 어디를 봐야 할지 모르는 상태**가 되기 쉽다.

```lua
-- ~/.config/nvim/init.lua 최소 예시
vim.opt.number = true
vim.opt.relativenumber = true
vim.opt.expandtab = true
vim.opt.shiftwidth = 4
vim.opt.ignorecase = true
vim.opt.smartcase = true
vim.opt.undofile = true
vim.g.mapleader = " "

vim.keymap.set("i", "jk", "<Esc>")
vim.keymap.set("n", "<Esc>", "<cmd>nohlsearch<CR>")
```

설정을 건드린 뒤에는 진단 명령을 습관적으로 치자.

```vim
:checkhealth        " 의존성, LSP, 클립보드, 프로바이더 상태 전부 점검
:Lazy               " 플러그인 상태 (LazyVim/lazy.nvim)
:LspInfo            " 현재 버퍼에 붙은 LSP 서버
```

## 12. 폐쇄망 서버에 에디터 들고 가기

여기서 [3편](/posts/linux-commands-3-shared-libraries)의 내용이 그대로 나온다.

### Vim — 가장 쉬운 경우

의존성이 적어 패키지 하나면 대체로 끝난다.

```bash
# 인터넷 되는 동일 버전 장비에서
dnf download --resolve vim-enhanced
# 생성된 rpm들을 옮긴 뒤
dnf install -y ./*.rpm
```

### Neovim — glibc 벽을 만난다

Neovim 공식 릴리스는 AppImage와 tarball로 배포된다. 그런데 **빌드 환경의 glibc가 대상 서버보다 최신이면 실행되지 않는다.** 공식 다운로드 페이지에도 "시스템의 glibc 버전이 부족하면 구버전 glibc용(비공식) 빌드를 쓰라"는 안내가 있을 정도로 흔한 문제다.

```bash
./nvim.appimage
# ./nvim: /lib64/libc.so.6: version `GLIBC_2.34' not found
```

3편의 **시나리오 B**와 정확히 같은 상황이다. 확인과 대응은 이렇다.

```bash
ldd --version                       # 대상 서버의 glibc 버전
ldd ./nvim | grep "not found"       # 무엇이 없는지

# 대응 1) 구버전 glibc 빌드 받기 (neovim-releases 저장소)
# 대응 2) 대상 서버와 같은 배포판 컨테이너에서 직접 빌드
# 대응 3) 그냥 Vim을 쓴다
```

AppImage는 FUSE를 요구하는데, 폐쇄망 서버에 FUSE가 없는 경우도 흔하다. 이때는 압축을 풀어서 쓰면 된다.

```bash
./nvim.appimage --appimage-extract
./squashfs-root/usr/bin/nvim --version
ln -s $PWD/squashfs-root/usr/bin/nvim /usr/local/bin/nvim
```

여기에 더해, Neovim의 플러그인 대부분은 **설치 시 git clone을 시도한다.** 폐쇄망에서는 `lazy.nvim`이 무한정 실패한다. 결국 플러그인 디렉토리(`~/.local/share/nvim/lazy/`)를 통째로 tar로 말아서 옮기고, `lazy-lock.json`으로 버전을 고정하는 방식이 현실적이다.

```bash
# 외부 장비에서
tar -czf nvim-plugins.tar.gz -C ~/.local/share/nvim lazy
tar -czf nvim-config.tar.gz -C ~/.config nvim

# 폐쇄망 서버에서
tar -xzf nvim-plugins.tar.gz -C ~/.local/share/nvim/
tar -xzf nvim-config.tar.gz -C ~/.config/
```

Tree-sitter 파서도 런타임에 컴파일해 받아오므로 같이 옮겨야 한다. 서버에 C 컴파일러가 없으면 파싱이 통째로 안 된다.

### micro — 가장 마찰 없는 선택

Go로 빌드된 **정적 단일 바이너리**라 의존성이 없다. 3편의 문제를 아예 만나지 않는다.

```bash
# 바이너리 하나만 옮기면 끝
scp micro user@closed-server:/usr/local/bin/
```

"폐쇄망 서버에서 그래도 좀 사람답게 편집하고 싶다"면 micro가 비용 대비 효과가 가장 좋다.

## 13. $EDITOR, $VISUAL, 그리고 update-alternatives

2편에서 다룬 `crontab -e`, `visudo`, `systemctl edit`, `git commit`은 전부 환경변수를 보고 에디터를 결정한다. 순서가 정해져 있다.

```text
$VISUAL  →  $EDITOR  →  시스템 기본값
```

`$VISUAL`이 먼저인 건 역사적 이유다. 원래 `$EDITOR`는 `ed` 같은 라인 에디터를, `$VISUAL`은 vi 같은 전체 화면 에디터를 가리켰다. 지금은 둘 다 같은 값으로 두는 게 보통이다.

```bash
echo 'export EDITOR=vim' >> ~/.bashrc
echo 'export VISUAL=vim' >> ~/.bashrc

EDITOR=nano crontab -e      # 이번 한 번만 nano로
```

시스템 전역 기본값은 배포판마다 다른 곳에서 잡힌다.

```bash
# Debian / Ubuntu
sudo update-alternatives --config editor
sudo update-alternatives --display editor

# RHEL 계열 — /etc/profile.d/ 아래 스크립트 또는 개별 설정
grep -r EDITOR /etc/profile.d/
```

**주의할 것 하나** — `visudo`는 보안상의 이유로 `$EDITOR`를 무조건 따르지 않는다. `sudoers` 파일의 `Defaults editor` 설정과 `env_editor` 옵션에 따라 무시될 수 있다.

```bash
grep -E 'editor' /etc/sudoers
# Defaults editor=/usr/bin/vim
```

`env_editor`가 꺼져 있으면 사용자의 `$EDITOR`는 무시되고 지정된 에디터만 뜬다. **이건 보안 기능이지 불편함이 아니다** — 임의 프로그램을 `$EDITOR`로 지정해 `visudo` 권한으로 실행시키는 공격을 막는 것이다.

git은 별도 설정을 따로 갖는다.

```bash
git config --global core.editor "vim"
git config --global core.editor "nvim"
git config --global core.editor "code --wait"   # VSCode
```

## 14. 그래서 뭘 고를까

의사결정을 단순화하면 이렇다.

```text
서버에 SSH로 붙어 한 줄 고치는 상황인가?
 └─ 예 → vi. 뭘 깔 상황이 아니다. 최소 생존 세트면 충분하다

여러 사람이 같이 만지는 공용 서버인가?
 └─ 예 → nano를 기본 EDITOR로. 사고가 줄어든다

매일 코드를 쓰는 로컬 환경인가?
 ├─ 모달 편집을 배울 의향이 있다 → nvim (kickstart로 시작)
 ├─ 설정에 시간 쓰기 싫다 → helix
 └─ 배울 생각 없다 → IDE + vim 확장으로 키바인딩만 가져오기

폐쇄망 서버에서 좀 편하게 쓰고 싶다
 └─ micro. 정적 바이너리 하나면 끝난다
```

한 가지 덧붙이면, **"Vim을 주력 에디터로 쓸 것인가"와 "Vim을 쓸 줄 아는가"는 다른 질문**이다. 앞엣것은 취향이지만 뒤엣것은 서버를 다루는 사람에게는 사실상 필수에 가깝다. 10장의 최소 생존 세트까지만 해도 충분하고, 그 이상은 각자 판단할 영역이다.

그리고 흔한 함정 하나 — **에디터 설정 자체가 취미가 되는 것.** 플러그인 40개를 붙이고 시작 시간을 100ms 단위로 깎다 보면, 정작 그 에디터로 코드를 쓴 시간보다 설정한 시간이 길어진다. 설정은 **불편함을 느낀 시점에 그 불편함만 해결하는 방식**으로 늘려가는 게 결국 가장 빠르다.

## 마치며

이 시리즈를 관통하는 원칙은 하나다. **도구를 목록으로 외우지 말고, 하고 싶은 일에서 도구를 역으로 떠올리는 것.**

에디터도 마찬가지다. "Vim 명령어 200개"를 외우는 건 의미가 없고, "커서가 어디 있든 이 단어만 바꾸고 싶다 → `ciw`"처럼 필요에서 출발하면 필요한 만큼만 자연스럽게 남는다.

| **하고 싶은 일** | **도구** |
|---|---|
| 서버에서 설정 한 줄 고치기 | `vi` + 최소 생존 세트 |
| 팀원도 쓸 수 있게 | `nano` |
| 매일 쓰는 개발 환경 | `nvim` (kickstart / LazyVim) |
| 설정 없이 바로 IDE처럼 | `helix` |
| 폐쇄망에 하나 들고 가기 | `micro` (정적 바이너리) |
| 에디터가 뭔지 확인 | `readlink -f $(which vi)` |
| 기본 에디터 바꾸기 | `$EDITOR` / `update-alternatives` |
| Vim에서 못 빠져나올 때 | `Esc` → `:q!` |
