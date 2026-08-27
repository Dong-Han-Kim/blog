---
# 📌 기본 메타데이터
title: '리눅스 명령어, 실무에서 진짜 자주 쓰는 것들 (3) — 공유 라이브러리와 ldd'
date: '2026-08-27'
category: 'linux'
tags: ['Linux', 'ELF', 'ldd', 'Shared Library', 'Troubleshooting', 'glibc']
description: 'error while loading shared libraries가 떴을 때 무엇을 봐야 하는가. .so 파일의 정체, 동적 링커의 탐색 순서, ldd·readelf·LD_DEBUG로 의존성을 추적하는 법까지.'

# 💬 옵션 필드
draft: false
series: '리눅스 명령어'
seriesOrder: 3

# 📚 SEO용
keywords: ['ldd', 'readelf', 'soname', 'LD_LIBRARY_PATH', 'RPATH', 'RUNPATH', 'LD_PRELOAD', 'patchelf', 'glibc', 'ELF']
---

# 리눅스 명령어, 실무에서 진짜 자주 쓰는 것들 (3) — 공유 라이브러리와 ldd

서버에 바이너리를 올리고 실행했더니 이런 게 뜬 적이 있을 것이다.

```
./myapp: error while loading shared libraries: libssl.so.3:
cannot open shared object file: No such file or directory
```

내 노트북에서는 잘 돌던 게 서버에서는 안 뜬다. 코드는 그대로다. 이건 **프로그램이 실행되기 직전, 동적 링커가 필요한 라이브러리를 못 찾은 것**이다.

이 글은 그 한 줄짜리 에러 뒤에서 실제로 무슨 일이 벌어지는지를 다룬다. `.so`가 정확히 무엇이고, 커널과 동적 링커가 어떤 순서로 그걸 찾아 붙이고, `ldd`가 그 과정 중 무엇을 보여주는지. 그리고 실무에서 마주치는 대표적인 실패 사례들을 어떻게 추적하는지.

> macOS에는 `ldd`가 없다. 같은 역할은 `otool -L`(의존성 목록), `dyld_info`, `DYLD_PRINT_LIBRARIES=1`이 한다. 개념은 거의 그대로 대응되지만, 이 글의 명령어는 리눅스 기준이다.

---

## 1. 정적 링크와 동적 링크

C로 짠 프로그램이 `printf`를 쓴다고 하자. `printf`의 실제 구현은 내 소스에 없다. 어딘가에서 가져와 붙여야 한다. 그 "붙이는" 방식이 두 가지다.

**정적 링크(static linking)** — 빌드 시점에 라이브러리 코드를 실행 파일 안에 복사해 넣는다. 확장자는 `.a`(archive). 결과 바이너리는 혼자서 실행된다.

**동적 링크(dynamic linking)** — 빌드 시점에는 "libc가 필요하다"는 *이름표*만 남기고, 실제 코드는 **실행 시점에** 메모리로 불러 붙인다. 확장자는 `.so`(shared object).

```bash
gcc -o app_static main.c -static     # 정적
gcc -o app_dynamic main.c            # 동적 (리눅스 기본값)

ls -lh app_static app_dynamic
# -rwxr-xr-x  1 han han  760K  app_static
# -rwxr-xr-x  1 han han   16K  app_dynamic
```

같은 코드인데 크기가 50배 가까이 차이 난다. 정적 바이너리는 libc를 통째로 품고 있기 때문이다.

| | 정적 (`.a`) | 동적 (`.so`) |
|---|---|---|
| 바이너리 크기 | 크다 | 작다 |
| 실행 환경 의존성 | 거의 없음 | 라이브러리가 있어야 함 |
| 메모리 | 프로세스마다 사본 | **코드 영역을 여러 프로세스가 공유** |
| 보안 패치 | 전부 다시 빌드 | `.so` 하나만 교체 |
| 실행 시작 속도 | 빠름 | 링킹 오버헤드 있음 |
| 배포 난이도 | 쉬움 | 의존성 관리 필요 |

동적 링크가 기본이 된 이유는 **메모리 공유**와 **보안 패치**다. OpenSSL에 취약점이 터졌을 때, 시스템에 OpenSSL을 쓰는 프로그램이 200개라면 정적 링크 세상에서는 200개를 전부 다시 빌드해야 한다. 동적 링크라면 `libssl.so.3` 하나만 갈아끼우고 서비스를 재시작하면 끝이다.

대신 대가가 있다. **"내 컴퓨터에서는 되는데요"의 상당 부분이 여기서 나온다.** 이 글의 나머지는 그 대가를 다루는 방법이다.

---

## 2. `.so` 파일의 정체

`.so`는 확장자만 다를 뿐 실행 파일과 같은 **ELF(Executable and Linkable Format)** 포맷이다.

```bash
file /usr/lib64/libssl.so.3
# ELF 64-bit LSB shared object, x86-64, dynamically linked, ...

file /usr/bin/ls
# ELF 64-bit LSB pie executable, x86-64, dynamically linked,
# interpreter /lib64/ld-linux-x86-64.so.2, ...
```

둘 다 ELF다. 차이는 ELF 헤더의 타입(`ET_DYN` vs `ET_EXEC`)과, 실행 파일에는 **interpreter**가 지정되어 있다는 점이다. 저 `interpreter /lib64/ld-linux-x86-64.so.2`가 이 글의 주인공인 **동적 링커(dynamic linker/loader)** 다.

### 위치 독립 코드 (PIC)

공유 라이브러리는 프로세스마다 서로 다른 주소에 로드된다. A 프로세스에서는 `0x7f...1000`에, B 프로세스에서는 `0x7f...9000`에 올라갈 수 있다. 그래서 라이브러리 코드는 **자기가 어느 주소에 올라가든 동작해야 한다.** 이걸 위치 독립 코드(Position Independent Code)라 하고, 그래서 `.so`를 만들 때 `-fPIC`가 필요하다.

```bash
gcc -fPIC -c mylib.c -o mylib.o
gcc -shared -o libmylib.so mylib.o
```

`-fPIC`를 빼면 링크 단계에서 이런 에러를 본다.

```
relocation R_X86_64_32S against `.rodata' can not be used when making a shared object;
recompile with -fPIC
```

정적 라이브러리(`.a`)를 공유 라이브러리에 끌어다 쓸 때 자주 만나는 에러다. 그 `.a`가 `-fPIC` 없이 빌드된 것이다.

### ELF 안에 뭐가 들어 있나

`readelf`로 들여다보면 동적 링크에 필요한 정보가 `.dynamic` 섹션에 정리되어 있다.

```bash
readelf -d /usr/bin/curl

# Dynamic section at offset 0x1f2c8 contains 30 entries:
#  Tag        Type              Name/Value
# 0x0000...1 (NEEDED)      Shared library: [libcurl.so.4]
# 0x0000...1 (NEEDED)      Shared library: [libc.so.6]
# 0x000...1d (RUNPATH)     Library runpath: [$ORIGIN/../lib]
# 0x000...0e (SONAME)      Library soname: [...]
```

실무에서 알아야 할 태그는 네 개다.

| 태그 | 의미 |
|---|---|
| `NEEDED` | 이 파일이 직접 필요로 하는 라이브러리 이름 |
| `SONAME` | 이 라이브러리가 스스로 주장하는 "공식 이름" |
| `RPATH` | 탐색 경로 (구식, RUNPATH가 있으면 무시됨) |
| `RUNPATH` | 탐색 경로 (현대적 방식) |

여기에 심볼 테이블(`.dynsym`)과 재배치 정보(`.rela.plt`, `.rela.dyn`), 그리고 함수 호출을 중계하는 `.plt`/`.got`가 붙는다. PLT/GOT는 뒤에서 다시 나온다.

---

## 3. 이름이 세 개인 이유

`/usr/lib64`를 보면 이런 식으로 되어 있다.

```bash
ls -l /usr/lib64/libssl*
# lrwxrwxrwx  libssl.so     -> libssl.so.3
# lrwxrwxrwx  libssl.so.3   -> libssl.so.3.0.7
# -rwxr-xr-x  libssl.so.3.0.7
```

파일은 하나인데 이름이 세 개다. 각각 역할이 다르다.

| 이름 | 부르는 말 | 누가 쓰나 |
|---|---|---|
| `libssl.so` | **linker name** | 빌드할 때 `-lssl`이 찾는 이름. `-devel` 패키지에만 있다 |
| `libssl.so.3` | **soname** | 실행 시점에 로더가 찾는 이름. ELF의 `SONAME`에 박혀 있다 |
| `libssl.so.3.0.7` | **real name** | 실제 파일. 버전이 올라가면 이 이름이 바뀐다 |

핵심은 **soname이 ABI 호환성의 계약**이라는 점이다.

- 버그 수정, 내부 개선처럼 **기존 함수 시그니처와 동작이 유지되면** → real name만 올린다 (`3.0.7` → `3.0.8`). soname은 `libssl.so.3` 그대로. 기존 바이너리는 재빌드 없이 그대로 동작한다.
- 함수를 없애거나 구조체 레이아웃을 바꾸는 등 **ABI가 깨지면** → soname을 올린다 (`libssl.so.3` → `libssl.so.4`). 그러면 옛 바이너리는 `libssl.so.3`을 계속 찾고, 시스템에 둘을 나란히 둘 수 있다.

빌드할 때 `-Wl,-soname`으로 직접 박는다.

```bash
gcc -shared -Wl,-soname,libmylib.so.1 -o libmylib.so.1.0.0 mylib.o
ln -sf libmylib.so.1.0.0 libmylib.so.1     # 로더용
ln -sf libmylib.so.1     libmylib.so       # 컴파일러용
```

`ldconfig`를 돌리면 soname 심볼릭 링크는 자동으로 만들어준다. 하지만 linker name(`libssl.so`)은 만들어주지 않는다. **"라이브러리는 깔았는데 컴파일할 때 `-lssl`이 못 찾는다"는 대부분 `-devel` 패키지를 안 깐 것**이다.

```bash
dnf install openssl-devel     # RHEL 계열
apt install libssl-dev        # Debian 계열
```

---

## 4. 프로그램이 실행되기까지 — 로딩의 전체 흐름

`./myapp`을 쳤을 때 실제로 일어나는 일이다.

```
1. 셸이 execve("./myapp") 호출
2. 커널이 ELF 헤더를 읽는다
3. PT_INTERP 세그먼트에서 인터프리터 경로를 발견
   → /lib64/ld-linux-x86-64.so.2
4. 커널은 myapp이 아니라 "동적 링커"를 먼저 메모리에 올리고 제어권을 넘긴다
5. 동적 링커가:
   a. myapp의 DT_NEEDED 목록을 읽는다
   b. 각 라이브러리를 정해진 순서로 탐색해 찾는다
   c. 찾은 라이브러리의 DT_NEEDED도 재귀적으로 처리 (의존성의 의존성)
   d. 전부 mmap으로 주소 공간에 매핑
   e. 재배치(relocation) 수행 — 심볼 주소를 실제 값으로 채운다
   f. 각 라이브러리의 초기화 코드(DT_INIT / .init_array) 실행
6. 그제서야 myapp의 main()으로 점프
```

**즉, `main()`이 시작되기도 전에 실패하는 것**이다. 그래서 프로그램 내부의 에러 처리나 로깅이 전혀 동작하지 않고, 저 무뚝뚝한 한 줄만 남는다.

### 탐색 순서 — 이게 핵심이다

동적 링커가 `libfoo.so.1`을 찾는 순서는 정해져 있다. 이 순서를 알면 "왜 엉뚱한 라이브러리를 집어갔지?" 같은 문제가 풀린다.

1. **`DT_RPATH`** — 바이너리에 박힌 경로. 단, `DT_RUNPATH`가 있으면 완전히 무시된다
2. **`LD_LIBRARY_PATH`** 환경변수
3. **`DT_RUNPATH`** — 바이너리에 박힌 경로 (현대적 방식)
4. **`/etc/ld.so.cache`** — `ldconfig`가 만든 캐시
5. **기본 경로** — `/lib64`, `/usr/lib64` (32비트는 `/lib`, `/usr/lib`)

여기서 실무적으로 중요한 두 가지.

**첫째, `DT_RPATH`와 `DT_RUNPATH`의 우선순위가 `LD_LIBRARY_PATH` 기준으로 갈린다.** RPATH는 환경변수보다 **위**고, RUNPATH는 **아래**다. 그래서 RPATH가 박힌 바이너리는 `LD_LIBRARY_PATH`로 라이브러리를 갈아끼울 수 없다. RUNPATH가 권장되는 이유다.

**둘째, `DT_RUNPATH`는 상속되지 않는다.** 자기 자신의 직접 의존성에만 적용되고, 그 의존성이 다시 필요로 하는 라이브러리에는 적용되지 않는다. RPATH는 상속됐다. 이 차이 때문에 RPATH에서 RUNPATH로 바꾼 뒤 갑자기 못 찾는 라이브러리가 생기는 일이 있다.

### `ld.so.cache`와 `ldconfig`

매번 디렉토리를 뒤지면 느리므로, 시스템은 캐시를 쓴다.

```bash
ldconfig -p | head                   # 캐시에 등록된 라이브러리 목록
ldconfig -p | grep libssl            # 특정 라이브러리가 등록되어 있나
ldconfig -p | wc -l                  # 보통 수백~수천 개
```

새 경로에 라이브러리를 설치했다면 캐시에 알려줘야 한다.

```bash
echo "/opt/myapp/lib" > /etc/ld.so.conf.d/myapp.conf
ldconfig                             # 캐시 재생성 + soname 심볼릭 링크 생성
ldconfig -v | grep myapp             # 등록됐는지 확인
```

**`/opt`나 `/usr/local/lib`에 라이브러리를 직접 복사해놓고 `ldconfig`를 안 돌려서 못 찾는 경우**가 정말 흔하다. 소스 빌드 후 `make install`을 했다면 습관적으로 `ldconfig`를 한 번 치자.

### 지연 바인딩 (lazy binding)

라이브러리에 함수가 수천 개인데 프로그램이 실제로 쓰는 건 몇 개뿐일 수 있다. 그래서 기본값은 **함수를 처음 호출하는 순간에 주소를 해석**하는 방식이다.

동작은 PLT(Procedure Linkage Table)와 GOT(Global Offset Table)로 이뤄진다. 처음 호출하면 PLT가 동적 링커를 부르고, 링커가 실제 주소를 찾아 GOT에 써둔다. 두 번째부터는 GOT를 통해 바로 점프한다.

이걸 끄면 시작할 때 전부 해석한다.

```bash
LD_BIND_NOW=1 ./myapp                # 실행 시 강제
gcc -Wl,-z,now -Wl,-z,relro ...      # 빌드 시 고정 (Full RELRO)
```

보안적으로는 `-z now -z relro`(Full RELRO)가 권장된다. GOT를 읽기 전용으로 만들어 **GOT overwrite 공격**을 막기 때문이다. 대신 시작이 조금 느려진다. 그리고 디버깅 관점에서는 부수 효과가 하나 있다 — **없는 심볼이 있으면 프로그램 시작 시점에 바로 터진다.** "한참 잘 돌다가 특정 기능을 눌렀을 때만 `undefined symbol`이 뜨는" 상황을 재현할 때 유용하다.

---

## 5. `ldd` — 무엇을 보여주는가

이제 본론이다.

```bash
ldd /usr/bin/curl
#   linux-vdso.so.1 (0x00007ffd8b5f0000)
#   libcurl.so.4 => /lib64/libcurl.so.4 (0x00007f2c4a800000)
#   libc.so.6 => /lib64/libc.so.6 (0x00007f2c4a400000)
#   /lib64/ld-linux-x86-64.so.2 (0x00007f2c4ac00000)
```

읽는 법:

- **`이름 => 경로 (주소)`** — 찾았다. 그 경로의 파일이 그 주소에 매핑될 예정이다
- **`이름 => not found`** — **못 찾았다. 이게 범인이다**
- **`linux-vdso.so.1`** — 디스크에 없는 파일이다. 커널이 프로세스 주소 공간에 직접 매핑해주는 가상 라이브러리로, `gettimeofday` 같은 걸 시스템 콜 없이 빠르게 처리한다. `=>` 경로가 없는 게 정상이니 신경 쓸 필요 없다
- **`/lib64/ld-linux-x86-64.so.2`** — 동적 링커 자신

`ldd`는 **재귀적으로 전체 의존성 트리를 평평하게 펼쳐서** 보여준다. `curl`이 직접 필요로 하는 건 몇 개뿐인데 출력이 수십 줄인 이유다.

### 자주 쓰는 옵션

```bash
ldd -v ./myapp        # 심볼 버전 정보까지 (GLIBC_2.34 같은)
ldd -u ./myapp        # 링크는 했지만 실제로 안 쓰는 의존성 찾기
ldd -r ./myapp        # 데이터 심볼까지 재배치 시도 — undefined symbol 조기 발견
```

`ldd -u`는 빌드 스크립트에서 불필요한 `-l` 옵션을 걷어낼 때 쓴다. 의존성이 적을수록 배포도, 보안 패치 추적도 쉬워진다. 다만 **오탐이 흔하다** — 실제로 함수를 호출하는 라이브러리를 "unused"로 잡는 경우가 있으니, 지우기 전에 `nm -D --undefined-only`로 교차 확인하는 게 안전하다. 애초에 링커에게 맡기는 방법도 있다.

```bash
gcc ... -Wl,--as-needed          # 실제로 심볼을 쓰는 라이브러리만 NEEDED에 남긴다
```

### 중요 — `ldd`는 실행 파일이 아니라 셸 스크립트다

```bash
file $(which ldd)
# /usr/bin/ldd: Bourne-Again shell script, ASCII text executable
```

내부적으로 하는 일은 **동적 링커에게 "로드는 하되 main은 실행하지 말고 목록만 뱉어라"라고 시키는 것**이다.

```bash
LD_TRACE_LOADED_OBJECTS=1 /usr/bin/curl     # ldd와 사실상 같은 출력
```

여기서 보안 이슈가 나온다. **신뢰할 수 없는 바이너리에 `ldd`를 쓰면 안 된다.** 상황에 따라 그 바이너리의 코드(정확히는 그것이 지정한 인터프리터나 초기화 코드)가 실제로 실행될 수 있다. `ldd`의 man 페이지에도 명시된 경고다.

안전한 대안은 파일을 **읽기만** 하는 도구다.

```bash
objdump -p ./unknown_binary | grep NEEDED
readelf -d ./unknown_binary | grep NEEDED
```

이 둘은 바이너리를 실행하지 않고 ELF 헤더만 파싱한다. 다만 **직접 의존성만** 보여준다는 차이가 있다. 트리 전체가 필요하면 `ldd`, 안전이 우선이거나 직접 의존성만 알면 될 때는 `readelf -d`. 이렇게 나눠 쓰면 된다.

### `ldd`가 못 보는 것

**`dlopen()`으로 런타임에 여는 라이브러리는 `ldd`에 안 나온다.** 플러그인 구조가 대표적이다. `ldd`는 깨끗한데 실행하면 "플러그인 로드 실패"가 뜬다면 이 경우다. 이때는 실제 실행을 추적해야 한다.

```bash
strace -f -e trace=openat ./myapp 2>&1 | grep '\.so'
LD_DEBUG=libs ./myapp 2>&1 | less
```

---

## 6. 실전 트러블슈팅

### 시나리오 A — `cannot open shared object file`

가장 흔한 케이스. 순서대로 좁힌다.

```bash
# 1. 뭐가 없는지 확인
ldd ./myapp | grep "not found"
#   libssl.so.3 => not found

# 2. 시스템에 있기는 한가
ldconfig -p | grep libssl.so.3
find / -name "libssl.so.3*" 2>/dev/null

# 3-a. 아예 없다면 → 어느 패키지에 들어 있는지 찾아 설치
dnf provides '*/libssl.so.3'          # RHEL 계열
apt-file search libssl.so.3           # Debian 계열 (apt-file 설치 필요)

# 3-b. 있는데 경로가 등록 안 됐다면 → 캐시에 등록
echo "/opt/openssl/lib" > /etc/ld.so.conf.d/openssl.conf
ldconfig
ldd ./myapp | grep libssl             # 다시 확인
```

임시로 확인만 하고 싶다면 환경변수로 때울 수 있다.

```bash
LD_LIBRARY_PATH=/opt/openssl/lib ./myapp
```

다만 이건 **디버깅용이지 배포 방식이 아니다.** systemd 서비스로 띄우면 그 환경변수가 없어서 다시 실패한다. 굳이 서비스에 넣어야 한다면 유닛 파일에 명시해야 한다.

```ini
[Service]
Environment="LD_LIBRARY_PATH=/opt/openssl/lib"
```

더 나은 해법은 `ldconfig` 등록이거나, 배포 시점에 바이너리에 `RUNPATH`를 박아두는 것이다.

```bash
gcc ... -Wl,-rpath,'$ORIGIN/../lib'      # 바이너리 위치 기준 상대 경로
```

`$ORIGIN`은 "이 바이너리가 놓인 디렉토리"로 실행 시점에 치환된다. 설치 경로가 고정되지 않은 애플리케이션을 배포할 때의 표준 기법이다. (셸이 먼저 확장하지 않도록 작은따옴표를 쓰는 것에 주의.)

### 시나리오 B — `version 'GLIBC_2.34' not found`

```
./myapp: /lib64/libc.so.6: version `GLIBC_2.34' not found (required by ./myapp)
```

라이브러리 파일은 있는데 **버전이 낮다.** glibc는 심볼 버저닝을 쓰기 때문에, 같은 `libc.so.6`이라도 안에 든 심볼 버전이 다르다.

```bash
ldd --version                            # 현재 시스템의 glibc 버전
strings /lib64/libc.so.6 | grep -E '^GLIBC_[0-9]' | sort -V | tail -5
readelf -V ./myapp | grep GLIBC          # 바이너리가 요구하는 버전들
```

원인은 거의 항상 하나다. **빌드한 곳의 glibc가 실행하는 곳보다 최신이다.** (예: Ubuntu 24.04에서 빌드해서 RHEL 8에 올림.)

glibc는 하위 호환은 되지만 상위 호환은 안 된다. 즉 옛날 환경에서 빌드한 건 새 환경에서 돌아가지만, 반대는 안 된다. 해법은 원인 쪽을 고치는 것이다.

- **가장 오래된 대상 환경에서 빌드한다** — 컨테이너로 빌드 환경을 대상 서버에 맞추는 게 정석
- 정적 링크로 빌드한다 (glibc 정적 링크는 NSS 관련 함정이 있어 완전한 해결책은 아니다)
- Go나 Rust처럼 정적 바이너리를 만들기 쉬운 스택이라면 그쪽 옵션을 쓴다

> 참고로 glibc 2.34에서 `libpthread`, `libdl`, `librt`가 `libc`로 통합됐다. 그래서 이 버전 경계에서 유독 문제가 자주 보인다.

### 시나리오 C — `undefined symbol`

```
./myapp: symbol lookup error: ./myapp: undefined symbol: SSL_new
```

라이브러리는 찾았는데 **그 안에 원하는 함수가 없다.** 대개 버전이 안 맞거나 엉뚱한 파일을 집어간 것이다.

```bash
# 그 라이브러리가 정의하는 심볼 목록에서 찾아본다
nm -D --defined-only /lib64/libssl.so.3 | grep SSL_new
readelf --dyn-syms /lib64/libssl.so.3 | grep SSL_new

# 바이너리가 요구하는 정의되지 않은 심볼들
nm -D --undefined-only ./myapp | head -20

# 재배치를 강제로 수행해 조기에 확인
ldd -r ./myapp
```

`nm -D`의 출력에서 두 번째 컬럼이 `T`면 그 라이브러리가 정의한 함수, `U`면 자기도 남에게 의존하는 미정의 심볼이다.

### 시나리오 D — 엉뚱한 라이브러리를 집어갔다

시스템에 같은 라이브러리가 여러 버전 깔려 있을 때 생긴다. **탐색 순서 전체를 눈으로 보는 게 가장 빠르다.**

```bash
LD_DEBUG=libs ./myapp 2>&1 | less
#   trying file=/opt/custom/lib/libssl.so.3
#   trying file=/lib64/libssl.so.3
#   calling init: /lib64/libssl.so.3
```

`LD_DEBUG`는 동적 링커의 내장 디버깅 기능이고, 이 주제에서 가장 강력한 도구다. 실제 출력에는 `trying file=./glibc-hwcaps/x86-64-v3/libfoo.so.1` 같은 줄이 잔뜩 섞여 나오는데, 이건 CPU 기능별 최적화 빌드를 먼저 찾아보는 정상 동작이니 무시하면 된다.

```bash
LD_DEBUG=help ./myapp          # 사용 가능한 옵션 목록
LD_DEBUG=libs ./myapp          # 라이브러리 탐색 과정 (가장 많이 씀)
LD_DEBUG=files ./myapp         # 파일 로드 순서
LD_DEBUG=symbols ./myapp       # 심볼 해석 과정 (출력이 매우 많다)
LD_DEBUG=bindings ./myapp      # 어떤 심볼이 어디로 바인딩됐는지
LD_DEBUG=libs LD_DEBUG_OUTPUT=/tmp/ld.log ./myapp    # 파일로 저장
```

바이너리에 박힌 경로를 확인하고 필요하면 고칠 수도 있다.

```bash
readelf -d ./myapp | grep -E 'RPATH|RUNPATH'
patchelf --print-rpath ./myapp
patchelf --set-rpath '$ORIGIN/../lib' ./myapp
patchelf --replace-needed libssl.so.1.1 libssl.so.3 ./myapp
```

`patchelf`는 재빌드 없이 ELF의 의존성 정보를 수정하는 도구다. 폐쇄망에서 남이 준 바이너리를 어떻게든 돌려야 할 때 요긴하지만, **원본을 백업해두고 쓰자.**

### 시나리오 E — 컨테이너에서만 안 된다

Alpine 이미지에서 특히 자주 본다.

```
/app/myapp: not found
```

파일은 분명히 있는데 `not found`라고 한다. 이건 **파일이 아니라 인터프리터를 못 찾은 것**이다. Alpine은 glibc가 아니라 **musl** libc를 쓴다. glibc로 빌드된 바이너리가 요구하는 `/lib64/ld-linux-x86-64.so.2`가 Alpine에는 없다.

```bash
file ./myapp                          # 어떤 인터프리터를 요구하는지
readelf -l ./myapp | grep interpreter
ldd ./myapp                           # musl의 ldd는 출력 형식이 다르다
```

해법은 셋 중 하나다.

- 베이스 이미지를 `debian-slim`이나 `ubi9-minimal` 같은 glibc 계열로 바꾼다
- Alpine에서 직접 빌드한다 (musl로 링크됨)
- `gcompat` 패키지를 깐다 (호환 레이어, 완전하지는 않다)

멀티스테이지 빌드에서 **빌드 스테이지와 런타임 스테이지의 베이스 이미지가 다르면** 이 문제가 그대로 발생한다. 흔한 실수다.

### 시나리오 F — `wrong ELF class`

```
./myapp: error while loading shared libraries: libfoo.so:
wrong ELF class: ELFCLASS32
```

64비트 프로그램이 32비트 라이브러리를 집었다.

```bash
file /usr/lib/libfoo.so /usr/lib64/libfoo.so
readelf -h ./myapp | grep Class
```

`/usr/lib`(32비트)와 `/usr/lib64`(64비트)가 섞였을 때 발생한다. `LD_LIBRARY_PATH`에 32비트 경로가 먼저 들어가 있는 경우가 많다.

---

## 7. `LD_PRELOAD` — 함수를 가로채기

동적 링킹의 특성을 이용한 강력한 기능이다. 지정한 `.so`를 **다른 모든 라이브러리보다 먼저** 로드하므로, 같은 이름의 함수를 정의해두면 원래 함수 대신 내 것이 호출된다.

```bash
LD_PRELOAD=/usr/lib64/libjemalloc.so.2 ./myapp     # malloc 구현 교체
LD_PRELOAD=./mymalloc_tracker.so ./myapp           # 메모리 할당 추적
```

실무에서는 이런 데 쓴다.

- 메모리 할당자 교체 (jemalloc, tcmalloc) — 재빌드 없이 성능 실험
- 소스 수정 없이 함수 호출 추적/프로파일링
- 레거시 바이너리의 특정 동작 패치

반대로 **보안 관점에서는 공격 벡터**이기도 하다. 그래서 setuid 바이너리 같은 보안 실행 환경(secure-execution mode)에서는 `LD_PRELOAD`와 `LD_LIBRARY_PATH`가 무시되거나 제한된다. 침해 사고 조사에서 `/etc/ld.so.preload` 파일의 존재 여부를 확인하는 것도 이 때문이다 — 루트킷이 즐겨 쓰는 은신처다.

```bash
cat /etc/ld.so.preload 2>/dev/null     # 정상 시스템에서는 보통 없거나 비어 있다
```

---

## 8. 직접 만들어보기

개념은 한 번 만들어보면 확실해진다.

```bash
# 1. 라이브러리 소스
cat > mylib.c <<'EOF'
#include <stdio.h>
void hello(void) { printf("hello from shared library\n"); }
EOF

# 2. soname을 붙여 .so 빌드
gcc -fPIC -c mylib.c -o mylib.o
gcc -shared -Wl,-soname,libmylib.so.1 -o libmylib.so.1.0.0 mylib.o

# 3. 이름 세 개 만들기
ln -sf libmylib.so.1.0.0 libmylib.so.1
ln -sf libmylib.so.1     libmylib.so

readelf -d libmylib.so.1.0.0 | grep SONAME
# 0x...0e (SONAME)  Library soname: [libmylib.so.1]

# 4. 사용하는 프로그램
cat > main.c <<'EOF'
void hello(void);
int main(void) { hello(); return 0; }
EOF
gcc -o app main.c -L. -lmylib

# 5. 그냥 실행하면 실패한다 — 현재 디렉토리는 탐색 경로가 아니다
./app
# ./app: error while loading shared libraries: libmylib.so.1: cannot open ...

ldd ./app | grep mylib
# libmylib.so.1 => not found

# 6. 경로를 알려주면 된다
LD_LIBRARY_PATH=. ./app
# hello from shared library
```

**빌드는 `-L.`로 성공했는데 실행은 실패한다** — 이 지점이 정적/동적의 차이를 가장 잘 보여준다. 빌드 시점의 탐색 경로(`-L`)와 실행 시점의 탐색 경로(`ld.so`)는 완전히 별개다.

`dlopen`으로 런타임에 여는 방식도 확인해보자.

```c
#include <dlfcn.h>
#include <stdio.h>

int main(void) {
    void *h = dlopen("./libmylib.so.1", RTLD_LAZY);
    if (!h) { fprintf(stderr, "%s\n", dlerror()); return 1; }

    void (*hello)(void) = dlsym(h, "hello");
    if (hello) hello();

    dlclose(h);
    return 0;
}
```

```bash
gcc -o plugin_app plugin.c            # glibc 2.34+ 는 -ldl 불필요
ldd ./plugin_app | grep mylib         # 아무것도 안 나온다 — ldd는 dlopen을 모른다
```

플러그인 아키텍처가 이 방식으로 만들어진다. 그리고 우리가 매일 쓰는 것들이 이미 그렇다 — **Node.js의 네이티브 모듈(`.node` 파일)은 실제로는 공유 오브젝트**고, Python의 C 확장(`_ssl.cpython-311-x86_64-linux-gnu.so`)도 마찬가지다. `npm install`한 패키지가 특정 서버에서만 로드 실패한다면, 십중팔구 이 글의 시나리오 A~E 중 하나다.

```bash
ldd node_modules/bcrypt/lib/binding/napi-v3/bcrypt_lib.node
```

---

## 9. 도구 정리

| 하고 싶은 일 | 명령어 |
|---|---|
| 의존성 트리 전체 보기 | `ldd ./app` |
| 직접 의존성만 (안전하게) | `readelf -d ./app \| grep NEEDED` |
| 안 쓰는 의존성 찾기 | `ldd -u ./app` |
| 심볼 문제 조기 발견 | `ldd -r ./app` |
| RPATH/RUNPATH 확인 | `readelf -d ./app \| grep -E 'RPATH\|RUNPATH'` |
| soname 확인 | `readelf -d lib.so \| grep SONAME` |
| 라이브러리가 정의한 함수 | `nm -D --defined-only lib.so` |
| 캐시 등록 목록 | `ldconfig -p \| grep 이름` |
| 캐시 갱신 | `ldconfig` |
| 탐색 과정 추적 | `LD_DEBUG=libs ./app` |
| 실제 파일 접근 추적 | `strace -e trace=openat ./app` |
| glibc 버전 | `ldd --version` |
| RPATH 수정 (재빌드 없이) | `patchelf --set-rpath ...` |
| 함수 가로채기 | `LD_PRELOAD=./hook.so ./app` |

---

## 마치며

`error while loading shared libraries` 한 줄에서 시작해서, 확인 순서는 결국 이렇게 정리된다.

1. **`ldd`로 `not found`를 찾는다** — 무엇이 없는가
2. **`ldconfig -p`와 `find`로 시스템에 있는지 본다** — 없는가, 못 찾는가
3. 없으면 **설치**, 있으면 **`ldconfig` 등록 또는 RUNPATH 수정**
4. 파일은 있는데 버전이 안 맞으면 → **`readelf -V`, `nm -D`로 심볼 확인** → 빌드 환경을 대상 환경에 맞춘다
5. 그래도 모르겠으면 **`LD_DEBUG=libs`로 로더가 실제로 어디를 뒤졌는지 본다**

그리고 애초에 이 문제를 덜 만나는 방법도 있다. **빌드 환경과 실행 환경을 같은 이미지로 고정하는 것.** 컨테이너가 널리 쓰이게 된 이유의 상당 부분이 사실 이 글의 내용이다. 동적 링크의 이점(작은 바이너리, 메모리 공유, 개별 보안 패치)은 그대로 누리면서, 환경 차이라는 대가만 이미지로 봉인해버리는 것이다.
