---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 인프라 4강 — Docker'
date: '2026-09-17'
category: 'devops'
tags: ['Docker', 'Container', 'Dockerfile', 'Docker Compose', 'Infra']
description: '컨테이너와 VM의 차이, 이미지 레이어와 캐시, 멀티 스테이지 Dockerfile, 볼륨과 네트워크, Compose, 로그·리소스 제한, 폐쇄망 반입과 트러블슈팅까지 — 실행 환경을 이미지로 고정하는 법.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 인프라'
seriesOrder: 4

# 📚 SEO용
keywords: ['Docker', '컨테이너', 'Dockerfile', '멀티 스테이지 빌드', 'Docker Compose', '볼륨', '폐쇄망', 'docker save', '인프라 강의']
---

# 풀스택 개발자를 위한 인프라 4강 — Docker

[3강](/posts/infra-03-web-server-reverse-proxy)까지로 서버 한 대에 앱을 직접 올리고 Nginx 뒤에서 서비스하는 구성을 만들었다. 이번 강의는 그 실행 환경 자체를 이미지로 고정하는 Docker를 다룬다.

## 1. 컨테이너란 무엇인가

| | 가상 머신 | 컨테이너 |
|---|---|---|
| 격리 단위 | OS 전체 (게스트 커널 포함) | 프로세스 |
| 커널 | 각자 보유 | 호스트 커널 공유 |
| 시작 시간 | 수십 초~분 | 1초 내외 |
| 크기 | GB 단위 | MB 단위 |
| 격리 강도 | 강함 | 상대적으로 약함 |

컨테이너는 **특별한 설정이 걸린 리눅스 프로세스**다. 커널의 두 기능이 핵심이다.

- **namespace**: 보이는 것을 격리 (PID, 네트워크, 마운트, 호스트명, 사용자)
- **cgroup**: 쓸 수 있는 자원을 제한 (CPU, 메모리, I/O)

그래서 호스트에서 `ps aux`를 치면 컨테이너 안의 프로세스가 그대로 보인다. macOS/Windows의 Docker Desktop은 내부에 리눅스 VM을 띄워 그 위에서 컨테이너를 실행한다.

구성 요소: Docker CLI → Docker 데몬(dockerd) → containerd → runc. 쿠버네티스는 Docker 없이 containerd를 직접 쓴다(9강). 이미지는 OCI 표준이라 어느 런타임에서도 동일하게 동작한다.

## 2. 이미지와 레이어

- **이미지**: 실행에 필요한 파일시스템 + 메타데이터. 읽기 전용
- **컨테이너**: 이미지 위에 쓰기 가능한 레이어를 얹어 실행한 것. 컨테이너를 지우면 이 레이어도 사라진다
- **레이어**: Dockerfile의 명령 하나하나가 레이어가 되며, 같은 레이어는 여러 이미지가 공유한다
- **레지스트리**: 이미지 저장소 (Docker Hub, GHCR, ECR, Harbor)

이미지 이름 구조:

```
registry.example.com/team/myapp:1.4.2
└── 레지스트리 ──┘ └ 저장소 ┘ └태그┘
myapp@sha256:3f1a...   ← 다이제스트: 내용 기반 고정 식별자
```

**태그는 바뀔 수 있다.** `latest`는 "최신"이 아니라 그냥 기본 태그 이름일 뿐이다. 운영 배포에는 버전 태그나 git SHA 태그를, 완전한 재현성이 필요하면 다이제스트를 쓴다.

## 3. 기본 명령

```bash
docker pull nginx:1.27
docker images
docker run -d --name web -p 8080:80 nginx:1.27   # -d 백그라운드, -p 호스트:컨테이너
docker ps -a
docker logs -f web
docker exec -it web sh                           # 컨테이너 안에서 쉘
docker stop web        # SIGTERM → 10초 후 SIGKILL
docker rm web
docker rmi nginx:1.27

docker inspect web                               # 전체 설정(JSON)
docker stats                                     # 실시간 자원 사용량
docker system df                                 # 디스크 사용량
docker system prune                              # 안 쓰는 리소스 정리 (주의해서)
```

## 4. Dockerfile

### 명령어

| 명령 | 역할 |
|---|---|
| `FROM` | 베이스 이미지 |
| `WORKDIR` | 작업 디렉터리 |
| `COPY` | 파일 복사 (`ADD`보다 `COPY` 권장) |
| `RUN` | 빌드 시 명령 실행 |
| `ENV` | 환경 변수 |
| `ARG` | 빌드 시에만 쓰는 변수 |
| `EXPOSE` | 문서화 목적의 포트 표시 (실제로 열지 않음) |
| `USER` | 실행 사용자 |
| `HEALTHCHECK` | 상태 검사 명령 |
| `ENTRYPOINT` / `CMD` | 컨테이너 시작 명령 |

### 레이어 캐시와 명령 순서

Docker는 명령과 입력이 바뀌지 않으면 캐시를 재사용한다. 한 레이어가 바뀌면 **그 아래 모든 레이어를 다시 빌드**한다. 그래서 **자주 바뀌지 않는 것을 위에** 둔다.

```dockerfile
# 나쁜 예: 소스 한 줄만 바뀌어도 npm install이 다시 돈다
COPY . .
RUN npm ci

# 좋은 예: 의존성 목록이 안 바뀌면 설치 레이어는 캐시
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
```

### 멀티 스테이지 빌드 — Next.js 예시

`next.config.js`에 `output: 'standalone'`을 설정한 경우:

```dockerfile
# 1단계: 의존성
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 2단계: 빌드
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 3단계: 실행 (빌드 도구 없이 결과물만)
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /app/public ./public
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
ENV HOSTNAME=0.0.0.0 PORT=3000
CMD ["node", "server.js"]
```

효과: 최종 이미지에 소스 코드, devDependencies, 빌드 캐시가 없어 크기가 작고 공격 표면이 줄어든다.

주의: `NEXT_PUBLIC_*` 변수는 **빌드 시점에 코드에 박힌다**. 환경마다 다른 값이면 빌드를 따로 하거나 런타임 설정 방식으로 바꿔야 한다.

### .dockerignore

```
node_modules
.next
.git
.env*
*.log
Dockerfile
```

빌드 컨텍스트가 작아져 빠르고, `.env` 같은 비밀이 이미지에 들어가는 사고를 막는다.

### ENTRYPOINT, CMD, 그리고 PID 1

```dockerfile
CMD ["node", "server.js"]      # exec form: node가 PID 1 → SIGTERM을 직접 받음
CMD node server.js             # shell form: sh가 PID 1 → node에 시그널이 전달 안 될 수 있음
```

shell form을 쓰면 `docker stop` 시 앱이 SIGTERM을 못 받고 10초 뒤 강제 종료된다. **항상 exec form**을 쓴다. `npm start`로 실행하는 것도 npm이 중간에 끼므로 `node`를 직접 실행하는 편이 안전하다. 좀비 프로세스 정리가 필요하면 `docker run --init`이나 `tini`를 쓴다.

- `ENTRYPOINT`: 고정 실행 파일
- `CMD`: 기본 인자 (`docker run 이미지 다른명령`으로 덮어쓸 수 있음)

### 베이스 이미지 선택

| 종류 | 특징 |
|---|---|
| `node:22` (Debian) | 호환성 최고, 크다 |
| `node:22-slim` | 적당한 크기, glibc |
| `node:22-alpine` | 작음, musl libc → 일부 네이티브 모듈 호환 문제 |
| distroless | 쉘조차 없음, 보안 우수, 디버깅 어려움 |

## 5. 데이터와 볼륨

컨테이너는 언제든 지우고 다시 만드는 **일회용**이다. 남겨야 할 데이터는 컨테이너 밖에 둔다.

| 방식 | 문법 | 특징 | 용도 |
|---|---|---|---|
| named volume | `-v pgdata:/var/lib/postgresql/data` | Docker가 관리 (`/var/lib/docker/volumes`) | DB 데이터 |
| bind mount | `-v /opt/app/config:/app/config:ro` | 호스트 경로 직접 연결 | 설정 파일, 개발 중 소스 |
| tmpfs | `--tmpfs /tmp` | 메모리 | 임시 데이터 |

```bash
docker volume ls
docker volume inspect pgdata
```

**권한 문제**: bind mount 시 컨테이너 안 사용자의 UID와 호스트 디렉터리 소유자의 UID가 다르면 쓰기가 실패한다. 이름이 아니라 **숫자 UID가 기준**이다. `id` 명령으로 컨테이너 안 UID를 확인하고 호스트 디렉터리 소유자를 맞춘다. RHEL 계열에서는 SELinux 때문에 `:Z` 옵션이 필요할 수 있다.

MinIO, Postgres 같은 상태 저장 컨테이너를 복구할 때는 **볼륨이 어디에 있는지**가 핵심이다. `docker inspect 컨테이너 --format '{{json .Mounts}}'`로 확인한다.

## 6. 네트워크

| 드라이버 | 동작 |
|---|---|
| bridge (기본) | 가상 브리지(docker0)에 연결, 호스트와 NAT |
| 사용자 정의 bridge | bridge + **컨테이너 이름으로 DNS 조회 가능** |
| host | 호스트 네트워크를 그대로 사용 (격리 없음, 포트 매핑 불필요) |
| none | 네트워크 없음 |

```bash
docker network create appnet
docker run -d --name db  --network appnet postgres:16
docker run -d --name api --network appnet -e DB_HOST=db myapi
# api 컨테이너에서 "db"라는 이름으로 접속 가능
```

### 컨테이너 안의 localhost

컨테이너의 `localhost`는 **그 컨테이너 자신**이다. 앱 컨테이너에서 `localhost:5432`로 DB를 찾으면 실패한다. 같은 네트워크의 컨테이너 이름(`db:5432`)을 쓴다. 호스트의 서비스에 접속해야 하면 `host.docker.internal`(리눅스에서는 `--add-host=host.docker.internal:host-gateway` 필요)을 쓴다.

### 포트 공개

```bash
-p 8080:3000              # 모든 인터페이스(0.0.0.0)에 공개
-p 127.0.0.1:8080:3000    # 호스트 내부에서만 (Nginx 뒤에 둘 때)
```

**중요한 함정**: Docker는 포트 공개를 위해 iptables 규칙을 직접 추가하므로, **ufw/firewalld 규칙을 우회**할 수 있다. 방화벽에서 막았다고 생각한 포트가 외부에 열려 있을 수 있다. 외부에 열 필요가 없는 포트는 `127.0.0.1:`로 바인딩한다.

앱은 컨테이너 안에서 `0.0.0.0`으로 바인딩해야 한다(2강). `127.0.0.1`로 띄우면 포트 매핑이 되어 있어도 접속되지 않는다.

## 7. Docker Compose

여러 컨테이너를 하나의 파일로 정의한다. 파일명은 `compose.yaml`(또는 `docker-compose.yml`).

```yaml
services:
  app:
    image: registry.example.com/myapp:${APP_TAG:-latest}
    build: .
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    env_file: .env
    environment:
      DATABASE_URL: postgres://app:${DB_PASSWORD}@db:5432/app
      REDIS_URL: redis://redis:6379
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 15s
      timeout: 3s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "1.0"

  db:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: app
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 10s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
```

```bash
docker compose up -d
docker compose ps
docker compose logs -f app
docker compose pull && docker compose up -d     # 이미지 갱신 배포
docker compose down                             # 컨테이너·네트워크 삭제 (볼륨 유지)
docker compose down -v                          # 볼륨까지 삭제 — 데이터 날아감!
docker compose config                           # 변수 치환 결과 확인
```

포인트:

- Compose는 프로젝트마다 기본 네트워크를 만들어 서비스 이름으로 통신하게 한다.
- `depends_on`만으로는 "시작 순서"만 보장한다. **"준비 완료"를 기다리려면 `condition: service_healthy`와** healthcheck가 필요하다. 그래도 앱 자체에 DB 재연결 로직을 넣는 것이 정석이다.
- 재시작 정책: `no`, `on-failure`, `always`, `unless-stopped`. 서버 재부팅 후 자동 기동되려면 Docker 데몬이 enable 되어 있어야 한다(`systemctl enable docker`).
- 인수인계 없이 받은 서버라면 `docker inspect`의 `Config.Labels`에 있는 `com.docker.compose.project.working_dir`로 **원래 compose 파일 위치**를 찾을 수 있다.

## 8. 로그와 리소스

기본 로그 드라이버(json-file)는 **무한히 쌓인다.** `/etc/docker/daemon.json`에서 제한한다.

```json
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" }
}
```

변경 후 `systemctl restart docker`이 필요하며, **새로 만든 컨테이너부터** 적용된다.

메모리 제한을 넘으면 컨테이너가 강제 종료되고 종료 코드 137이 남는다.

```bash
docker inspect app --format '{{.State.ExitCode}} OOM={{.State.OOMKilled}}'
```

| 종료 코드 | 의미 |
|---|---|
| 0 | 정상 종료 |
| 1 | 앱 에러 |
| 137 | SIGKILL (OOM 또는 강제 종료) |
| 143 | SIGTERM으로 정상 종료 |
| 126/127 | 실행 권한 없음 / 명령을 찾을 수 없음 |

## 9. 폐쇄망 운영

### 이미지 반입

```bash
# 외부망
docker pull --platform linux/amd64 postgres:16
docker save postgres:16 myapp:1.4.2 | gzip > images.tar.gz
sha256sum images.tar.gz > images.tar.gz.sha256

# 폐쇄망
sha256sum -c images.tar.gz.sha256
docker load < images.tar.gz
```

- 외부망 PC가 Apple Silicon(arm64)이면 **`--platform linux/amd64`를 명시**하지 않으면 서버에서 `exec format error`가 난다. 빌드 시에도 `docker buildx build --platform linux/amd64`.
- `docker save`는 **이미지 이름**으로 저장해야 태그가 보존된다. 이미지 ID로 저장하면 load 후 `<none>`이 된다.
- Docker 엔진 자체도 RPM/DEB 또는 정적 바이너리로 반입한다.

### 사설 레지스트리

서버가 여러 대면 사내 레지스트리를 둔다. Harbor는 웹 UI, 권한 관리, 취약점 스캔, 복제를 제공한다. 간단히는 `registry:2` 이미지로도 시작할 수 있다.

```bash
docker tag myapp:1.4.2 harbor.corp.local/app/myapp:1.4.2
docker push harbor.corp.local/app/myapp:1.4.2
```

사설 CA 인증서를 쓰는 레지스트리는 `/etc/docker/certs.d/harbor.corp.local/ca.crt`에 CA를 두면 된다. `insecure-registries`로 검증을 끄는 것은 최후의 수단이다.

## 10. 트러블슈팅

```bash
docker ps -a                          # Exited 상태와 종료 코드
docker logs --tail 200 app            # 마지막 로그
docker inspect app                    # 환경변수, 마운트, 네트워크, 재시작 횟수
docker exec -it app sh                # 내부 확인
docker exec app env                   # 실제 주입된 환경 변수
docker exec app cat /etc/resolv.conf  # 내부 DNS
docker run --rm -it --network container:app nicolaka/netshoot   # 네트워크 디버깅 도구 붙이기
docker events                         # 실시간 이벤트 (재시작 반복 감지)
```

| 증상 | 흔한 원인 |
|---|---|
| 바로 Exited | 명령 오류, 필수 환경변수 누락 → `docker logs` |
| 재시작 반복 | 앱 크래시, 헬스체크 실패, OOM |
| 포트 접속 불가 | 앱이 127.0.0.1 바인딩, `-p` 누락 |
| 컨테이너 간 통신 불가 | 다른 네트워크, localhost 사용 |
| 볼륨 쓰기 실패 | UID 불일치, SELinux |
| 디스크 가득 | 로그 무제한, 미사용 이미지·빌드 캐시 (`docker system df`) |

## 11. 보안

- 컨테이너 안에서도 **non-root 사용자**로 실행 (`USER`)
- `docker` 그룹에 속한 사용자는 사실상 root와 같다 (호스트 `/`를 마운트할 수 있음)
- `--privileged`, `/var/run/docker.sock` 마운트는 꼭 필요할 때만
- 비밀번호를 이미지(ENV, COPY)에 넣지 않는다. 빌드 시 비밀은 `RUN --mount=type=secret` 사용
- 베이스 이미지 버전 고정, 정기 재빌드로 보안 패치 반영
- 이미지 취약점 스캔: Trivy (`trivy image myapp:1.4.2`)
- 가능하면 `read_only: true`, `cap_drop: [ALL]`

## 12. 실습 과제

1. 1~3강의 Node 앱을 멀티 스테이지 Dockerfile로 이미지화하고, 단일 스테이지 대비 크기를 비교한다.
2. shell form과 exec form으로 각각 실행한 뒤 `docker stop` 소요 시간을 비교한다.
3. 앱 + Postgres + Redis를 Compose로 구성하고, `db`를 healthcheck 조건으로 기다리게 한다.
4. 앱 컨테이너에서 `localhost`와 `db`로 각각 DB 접속을 시도해 차이를 확인한다.
5. 메모리 제한을 64M로 걸고 메모리를 많이 쓰는 요청으로 OOM(137)을 재현한다.
6. `docker save/load`로 다른 머신(또는 VM)에 이미지를 옮겨 실행한다.
7. 3강의 Nginx를 호스트에 두고 앱 컨테이너는 `127.0.0.1:3000`에만 공개한다.
8. `trivy`로 이미지를 스캔하고 베이스 이미지를 바꿔 취약점 수를 비교한다.

## 13. 핵심 정리

- 컨테이너는 namespace와 cgroup으로 격리된 프로세스
- 태그는 변할 수 있다 → 운영에는 버전/SHA 태그
- 자주 안 바뀌는 레이어를 위에, 멀티 스테이지로 결과물만
- CMD는 exec form으로 → 앱이 SIGTERM을 받는다
- 데이터는 볼륨에, bind mount는 UID를 맞춘다
- 컨테이너의 localhost는 자기 자신 → 서비스 이름으로 통신
- Docker는 방화벽을 우회할 수 있다 → 내부용 포트는 `127.0.0.1:` 바인딩
- 로그 크기 제한은 필수, 137은 OOM 의심
- 폐쇄망 반입은 플랫폼(amd64)과 이름 보존에 주의

## 더 깊이

- 컨테이너가 네임스페이스·cgroup으로 어떻게 만들어지는지 맨손으로 재현해 보려면 [도커의 본질 — 컨테이너를 맨손으로 만들며 이해하기](/posts/docker-deep-dive)
- 컨테이너 안에서 Node 앱을 PM2로 띄울 때의 PID 1과 `pm2-runtime` 함정은 [PM2 완전 정복 6편 — Docker, Nginx, 폐쇄망에서 PM2를 운영하기](/posts/pm2-06-docker-nginx-airgap)
