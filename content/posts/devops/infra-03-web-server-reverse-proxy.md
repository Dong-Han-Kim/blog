---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 인프라 3강 — 웹서버와 리버스 프록시'
date: '2026-09-17'
category: 'devops'
tags: ['Nginx', 'Reverse Proxy', 'HTTPS', 'Load Balancing', 'Infra']
description: 'Nginx 설정 구조부터 정적 파일과 SPA, proxy_pass와 X-Forwarded 헤더, location 우선순위, certbot HTTPS, 로드밸런싱, 타임아웃과 속도 제한까지 — 앱 앞에 서는 웹서버 운영의 기본.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 인프라'
seriesOrder: 3

# 📚 SEO용
keywords: ['Nginx', '리버스 프록시', 'proxy_pass', 'X-Forwarded-For', 'HTTPS', 'certbot', '로드밸런싱', 'location 우선순위', '인프라 강의']
---

# 풀스택 개발자를 위한 인프라 3강 — 웹서버와 리버스 프록시

[2강](/posts/infra-02-network-basics)까지로 요청이 서버의 포트에 도달하는 경로를 확인했다. 이번 강의는 그 포트 앞에 서는 웹서버, 즉 리버스 프록시를 다룬다.

## 1. 리버스 프록시가 하는 일

앱 서버(Node.js, Spring 등)를 인터넷에 직접 노출하지 않고 앞에 Nginx 같은 리버스 프록시를 둔다.

```
클라이언트 ──HTTPS──▶ Nginx(:443) ──HTTP──▶ 앱(127.0.0.1:3000)
                         │
                         ├─ 정적 파일 직접 서빙
                         ├─ TLS 종료
                         ├─ 경로별 라우팅 (/api → 백엔드, / → 프론트)
                         ├─ 로드밸런싱
                         ├─ 압축, 캐시 헤더
                         └─ 요청 크기 제한, 속도 제한
```

**TLS 종료(termination)**: 암호화 해제를 프록시가 담당하므로 앱은 HTTP만 다루면 된다. 대신 앱은 원래 요청이 HTTPS였는지를 헤더로 전달받아야 한다.

대안: Apache httpd(전통적), Caddy(HTTPS 자동화가 간편), Traefik(컨테이너 라벨 기반 자동 설정), HAProxy(고성능 L4/L7 로드밸런서).

## 2. Nginx 구조

- **master 프로세스**: 설정을 읽고 worker를 관리
- **worker 프로세스**: 실제 요청 처리. 이벤트 기반이라 적은 프로세스로 많은 연결을 처리

설정 파일 위치:

| 계열 | 메인 설정 | 사이트 설정 |
|---|---|---|
| RHEL | `/etc/nginx/nginx.conf` | `/etc/nginx/conf.d/*.conf` |
| Ubuntu | `/etc/nginx/nginx.conf` | `/etc/nginx/sites-available/` → `sites-enabled/`에 심볼릭 링크 |

설정 구조:

```nginx
user nginx;
worker_processes auto;          # CPU 코어 수만큼

events {
    worker_connections 1024;
}

http {                          # HTTP 전역
    include mime.types;
    sendfile on;

    server {                    # 가상 호스트 (도메인·포트 단위)
        listen 80;
        server_name example.com;

        location / {            # 경로 단위
            ...
        }
    }
}
```

## 3. 정적 파일과 SPA

```nginx
server {
    listen 80;
    server_name app.example.com;
    root /var/www/app/dist;
    index index.html;

    # SPA: 없는 경로는 index.html로 넘겨 클라이언트 라우터가 처리
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 해시가 붙은 빌드 산출물은 길게 캐시
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # index.html은 캐시하지 않음 (배포 즉시 반영)
    location = /index.html {
        add_header Cache-Control "no-cache";
    }
}
```

- `root`는 경로를 이어 붙이고(`root /var/www` + `/img/a.png`), `alias`는 location 부분을 대체한다. 헷갈리면 `root`를 쓴다.
- 403이 나면 1강의 **상위 디렉터리 x 권한**과 SELinux(`ls -Z`, `restorecon`)를 확인한다. RHEL 계열에서는 SELinux가 Nginx의 파일 접근이나 외부 포트 연결을 막는 경우가 흔하다(`setsebool -P httpd_can_network_connect 1`).

## 4. 리버스 프록시 설정

```nginx
upstream app_backend {
    server 127.0.0.1:3000;
    keepalive 32;                      # 앱과의 연결 재사용
}

server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://app_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 전달 헤더가 필요한 이유

프록시를 거치면 앱이 보는 접속자 IP는 전부 `127.0.0.1`이 되고, 프로토콜은 HTTP가 된다.

| 헤더 | 없으면 생기는 문제 |
|---|---|
| `Host` | 앱이 원래 도메인을 모름 → 절대 URL 생성 오류 |
| `X-Forwarded-For` | 로그·속도 제한에서 모든 사용자가 같은 IP |
| `X-Forwarded-Proto` | 앱이 HTTP로 인식 → 무한 리다이렉트, `Secure` 쿠키 문제 |

앱 쪽에서도 **프록시를 신뢰하도록 설정**해야 한다. Express는 `app.set('trust proxy', 1)`, Spring은 `server.forward-headers-strategy`. 신뢰하지 않을 프록시의 헤더까지 믿으면 IP 위조가 가능하므로 범위를 좁힌다.

### proxy_pass 끝 슬래시 규칙

```nginx
location /api/ {
    proxy_pass http://backend;      # 요청 /api/users → 백엔드 /api/users
}
location /api/ {
    proxy_pass http://backend/;     # 요청 /api/users → 백엔드 /users  (접두사 제거)
}
```

URI 부분(슬래시 포함)이 있으면 location에 매칭된 부분이 그것으로 **치환**된다. 404가 나면 가장 먼저 의심할 곳이다.

### WebSocket

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

location /ws/ {
    proxy_pass http://app_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_read_timeout 3600s;       # 기본 60초면 유휴 연결이 끊김
}
```

LiveKit 같은 실시간 서비스의 시그널링도 WebSocket을 쓰므로 이 설정이 필요하다. 미디어 자체(WebRTC)는 UDP라 HTTP 프록시를 거치지 않는다는 점도 기억한다.

## 5. location 매칭 우선순위

| 문법 | 의미 | 우선순위 |
|---|---|---|
| `location = /path` | 정확히 일치 | 1 (최우선) |
| `location ^~ /path` | 접두사, 일치하면 정규식 검사 생략 | 2 |
| `location ~ regex` / `~* regex` | 정규식 (대소문자 구분/무시), 파일에 적힌 순서대로 | 3 |
| `location /path` | 일반 접두사, 가장 긴 것 | 4 |

동작: 접두사들 중 가장 긴 것을 기억해 두고 → 정규식을 순서대로 검사해 일치하면 그것을 사용 → 없으면 기억해 둔 접두사를 사용한다.

## 6. HTTPS 적용

### Let's Encrypt (인터넷 환경)

```bash
sudo dnf install certbot python3-certbot-nginx   # 또는 apt
sudo certbot --nginx -d example.com -d www.example.com
sudo certbot renew --dry-run                      # 자동 갱신 테스트
systemctl list-timers | grep certbot              # 갱신 타이머 확인
```

인증서 유효기간이 짧으므로(90일 이하) **자동 갱신이 전제**다. 갱신 실패 알림을 반드시 걸어 둔다.

### 수동 설정

```nginx
server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;          # HTTP → HTTPS
}

server {
    listen 443 ssl;
    http2 on;                                       # 구버전은 listen 443 ssl http2;
    server_name example.com;

    ssl_certificate     /etc/nginx/certs/fullchain.pem;   # 중간 인증서 포함
    ssl_certificate_key /etc/nginx/certs/privkey.pem;     # 권한 600
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;

    add_header Strict-Transport-Security "max-age=31536000" always;

    location / {
        proxy_pass http://app_backend;
        # ...전달 헤더
    }
}
```

**HSTS**는 브라우저가 이 도메인을 HTTPS로만 접속하게 강제한다. 한 번 적용하면 max-age 동안 되돌리기 어려우므로 HTTPS가 안정화된 뒤 켠다.

### 폐쇄망

외부 CA를 쓸 수 없으므로 사내 CA에서 발급받거나, 자체 CA를 만들어 클라이언트에 배포한다. 인증서 만료일을 스크립트로 점검해 알림을 보내는 체계가 특히 중요하다.

```bash
openssl x509 -enddate -noout -in /etc/nginx/certs/fullchain.pem
```

## 7. 로드밸런싱

```nginx
upstream app_backend {
    least_conn;                                   # 분배 방식
    server 10.0.1.11:3000 max_fails=3 fail_timeout=30s;
    server 10.0.1.12:3000 max_fails=3 fail_timeout=30s;
    server 10.0.1.13:3000 backup;                 # 나머지가 모두 죽었을 때만
    keepalive 32;
}
```

| 방식 | 동작 | 적합한 경우 |
|---|---|---|
| round robin (기본) | 순서대로 | 요청 처리 시간이 비슷할 때 |
| `least_conn` | 연결 수가 적은 쪽 | 처리 시간이 들쭉날쭉할 때 |
| `ip_hash` / `hash $key` | 같은 키는 같은 서버 | 세션이 서버 메모리에 있을 때 (임시방편) |
| `weight=N` | 가중치 | 서버 사양이 다를 때 |

- 오픈소스 Nginx의 헬스체크는 **수동**(passive)이다. 실제 요청이 실패하면 잠시 제외한다. 주기적으로 `/health`를 찔러보는 **능동(active)** 헬스체크는 상용 Nginx Plus, HAProxy, 클라우드 로드밸런서, 쿠버네티스가 제공한다.
- **세션 고정(sticky)** 에 의존하기보다, 세션을 Redis나 JWT로 옮겨 앱을 **무상태(stateless)** 로 만드는 것이 확장의 기본이다.

### L4 vs L7

| | L4 | L7 |
|---|---|---|
| 판단 기준 | IP, 포트 | URL, 헤더, 쿠키 |
| 성능 | 빠름 | 상대적으로 무거움 |
| TLS | 통과(passthrough) 가능 | 종료 후 내용 확인 |
| 예 | Nginx `stream`, NLB, HAProxy TCP 모드 | Nginx `http`, ALB |

Nginx도 `stream` 블록으로 DB 같은 TCP 트래픽을 L4 프록시할 수 있다.

## 8. 타임아웃, 크기 제한, 성능

```nginx
client_max_body_size 50m;      # 기본 1m → 업로드 시 413
proxy_connect_timeout 5s;
proxy_read_timeout 60s;        # 앱 응답 대기. 초과 시 504
proxy_send_timeout 60s;

gzip on;
gzip_types text/css application/javascript application/json image/svg+xml;
gzip_min_length 1024;
```

504가 난다고 타임아웃부터 늘리는 것은 증상 완화다. 오래 걸리는 작업은 **비동기 작업 + 상태 조회** 구조로 바꾸는 것이 근본 해결이다(10강).

## 9. 보안 기본

```nginx
server_tokens off;                                # 버전 노출 숨김

# 속도 제한: IP당 초당 10요청, 버스트 20
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
server {
    location /api/login {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://app_backend;
    }
    location ~ /\.(git|env) {                     # 민감 파일 차단
        deny all;
    }
}

add_header X-Content-Type-Options nosniff always;
add_header X-Frame-Options DENY always;

# 관리자 경로 IP 제한
location /admin/ {
    allow 10.0.0.0/8;
    deny all;
    proxy_pass http://app_backend;
}
```

## 10. 운영 명령과 로그

```bash
sudo nginx -t                    # 문법 검사 (reload 전에 항상)
sudo nginx -T                    # include까지 합친 전체 설정 출력
sudo systemctl reload nginx      # 무중단 설정 반영
tail -f /var/log/nginx/access.log /var/log/nginx/error.log
```

응답 시간을 로그에 남기면 병목 분석이 쉬워진다.

```nginx
log_format timed '$remote_addr "$request" $status $body_bytes_sent '
                 'rt=$request_time urt=$upstream_response_time ua="$http_user_agent"';
access_log /var/log/nginx/access.log timed;
```

`request_time`(전체)과 `upstream_response_time`(앱 처리)의 차이가 크면 네트워크나 클라이언트 쪽, 둘 다 크면 앱 쪽이 느린 것이다.

### 에러별 확인 포인트

| 증상 | error.log 단서 | 확인 |
|---|---|---|
| 502 | `connect() failed (111: Connection refused)` | 앱이 떠 있나, 포트가 맞나 |
| 502 | `(13: Permission denied)` | SELinux |
| 504 | `upstream timed out` | 앱 처리 시간, 타임아웃 |
| 413 | `client intended to send too large body` | `client_max_body_size` |
| 403 | `permission denied` | 파일/디렉터리 권한 |

## 11. 예시: Next.js 서버 배포

```nginx
# 아래 map 블록은 server가 아니라 http 컨텍스트에 있어야 한다(4절 WebSocket 참고).
# 이것이 없으면 $connection_upgrade가 정의되지 않아 nginx -t가
# unknown "connection_upgrade" variable로 실패한다.
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 443 ssl;
    http2 on;
    server_name blog.example.com;
    ssl_certificate     /etc/letsencrypt/live/blog.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/blog.example.com/privkey.pem;

    # 빌드 산출물(해시 파일)은 Nginx가 직접 캐시 헤더와 함께 서빙
    location /_next/static/ {
        alias /opt/blog/.next/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }
}
```

## 12. 실습 과제

1. 1강의 Node 앱 앞에 Nginx를 두고 앱은 `127.0.0.1`에만 바인딩한다.
2. `/api/` 경로를 `proxy_pass` 끝 슬래시 유무로 바꿔 가며 앱이 받는 경로를 로그로 비교한다.
3. `X-Forwarded-For`를 넣기 전후로 앱 로그의 IP를 비교한다.
4. 앱을 중지하고 502, 앱에 `sleep`을 넣고 504를 재현한 뒤 error.log를 읽는다.
5. 앱을 두 개(3000, 3001) 띄워 upstream으로 묶고, 하나를 죽여 트래픽이 넘어가는지 확인한다.
6. 도메인이 있다면 certbot으로 HTTPS를, 없다면 자체 서명 인증서로 HTTPS를 적용한다.
7. `limit_req`를 걸고 반복 요청으로 503(또는 설정한 코드)을 확인한다.

## 13. 핵심 정리

- 앱은 내부에, Nginx가 앞에서 TLS·정적 파일·라우팅·분배를 담당
- `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`를 넘기고 앱에서 프록시를 신뢰하도록 설정
- `proxy_pass`의 끝 슬래시는 경로 치환 여부를 바꾼다
- location 우선순위: `=` → `^~` → 정규식 → 긴 접두사
- 인증서는 fullchain, 자동 갱신과 만료 알림은 필수
- 앱은 무상태로 만들고 로드밸런서로 수평 확장
- `nginx -t` 후 `reload`, 로그에 응답 시간을 남긴다
- 502는 앱 연결, 504는 앱 처리 시간, 413은 크기, 403은 권한

## 더 깊이

- 프록시·로드밸런서·CDN을 네트워크 관점에서 더 파고들려면 [네트워크 10장 — 인프라 구성요소](/posts/network-10-proxy-lb-cdn)
- Node 앱을 PM2로 띄우고 그 앞에 Nginx를 두는 실제 구성은 [PM2 완전 정복 6편 — Docker, Nginx, 폐쇄망에서 PM2를 운영하기](/posts/pm2-06-docker-nginx-airgap)
