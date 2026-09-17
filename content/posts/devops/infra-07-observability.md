---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 인프라 7강 — 관측성'
date: '2026-09-17'
category: 'devops'
tags: ['Observability', 'Monitoring', 'Prometheus', 'Grafana', 'OpenTelemetry']
description: '로그·메트릭·트레이스 세 신호와 구조화 로그, RED·USE·Golden Signals 방법론, 증상 기반 알림, 분산 트레이싱과 헬스체크 엔드포인트, Docker Compose로 올려 보는 실습용 관측 스택.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 인프라'
seriesOrder: 7

# 📚 SEO용
keywords: ['관측성', 'Observability', '모니터링', '구조화 로그', 'Prometheus', 'Grafana', 'Loki', 'OpenTelemetry', '분산 트레이싱', 'RED', 'USE', 'p95', '카디널리티']
---

# 풀스택 개발자를 위한 인프라 7강 — 관측성

[6강](/posts/infra-06-aws-cloud-basics)에서 클라우드 위에 자원을 올렸다면, 이번 강은 그 위에서 돌아가는 시스템이 지금 어떤 상태이고 왜 그렇게 되었는지를 밖으로 나온 데이터만으로 설명하는 방법을 다룬다.

## 1. 모니터링과 관측성

- **모니터링**: 미리 정한 지표를 보고 "문제가 있는가?"를 판단 (알고 있는 문제)
- **관측성**: 외부로 나온 데이터만으로 "왜 이런 일이 일어났는가?"를 설명할 수 있는 시스템의 성질 (모르는 문제)

관측성의 세 가지 신호:

| 신호 | 질문 | 특징 | 도구 예 |
|---|---|---|---|
| **로그** | 무슨 일이 있었나? | 상세, 용량 큼 | Loki, Elasticsearch, CloudWatch Logs |
| **메트릭** | 얼마나, 언제부터? | 숫자 시계열, 저렴, 알림에 적합 | Prometheus, CloudWatch Metrics |
| **트레이스** | 어디서 느려졌나? | 요청 하나의 여정 | Tempo, Jaeger, X-Ray |

일반적 흐름: **메트릭 알림으로 인지 → 대시보드로 범위 파악 → 트레이스로 구간 특정 → 로그로 원인 확인.**

## 2. 로그

### 구조화 로그

```
# 사람만 읽기 좋은 로그
2026-09-17 10:12:03 ERROR 주문 처리 실패 user=42

# 구조화 로그 (JSON)
{"ts":"2026-09-17T10:12:03.120Z","level":"error","msg":"order failed",
 "userId":42,"orderId":"o-981","requestId":"b7f1c2","durationMs":812,"err":"timeout"}
```

JSON 로그는 필드로 검색·집계할 수 있다(`level=error AND durationMs>500`). Node.js에서는 `pino`가 빠르고 널리 쓰인다.

```ts
import pino from "pino";
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: ["req.headers.authorization", "*.password", "*.token"],
});

// 요청마다 requestId를 붙인 자식 로거
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] ?? crypto.randomUUID();
  res.setHeader("x-request-id", req.id);
  req.log = logger.child({ requestId: req.id });
  next();
});
```

### 로그 원칙

- **레벨**: `debug`(개발), `info`(정상 흐름의 주요 사건), `warn`(이상하지만 처리됨), `error`(실패, 조치 필요). 운영 기본은 `info`
- **상관 ID(request ID)**: Nginx → 앱 → 다른 서비스까지 같은 ID를 전달하면 흩어진 로그를 한 요청으로 묶을 수 있다. Nginx에서는 `$request_id`를 헤더로 넘길 수 있다
- **민감 정보 금지**: 비밀번호, 토큰, 주민번호, 카드번호는 마스킹
- **표준 출력으로**: 앱은 stdout에 쓰고, 수집은 플랫폼(journald, Docker, 에이전트)이 맡는다(12-Factor)
- **로그는 비싸다**: 반복 루프 안의 info 로그, 거대한 객체 출력은 비용과 성능 문제

### 수집 구조

```
앱(stdout) → Docker/journald → 수집 에이전트 → 저장소 → 조회 UI
                                  │
                   Grafana Alloy / Fluent Bit / Vector
                                              → Loki → Grafana
                                              → Elasticsearch/OpenSearch → Kibana
```

| 저장소 | 특징 |
|---|---|
| Loki | 라벨만 인덱싱, 본문은 압축 저장 → 저렴. Grafana와 궁합 |
| Elasticsearch/OpenSearch | 전문 검색 강력, 자원 소모 큼 |

Loki의 기존 수집기였던 Promtail은 Grafana Alloy로 대체되는 추세이므로 신규 구축은 Alloy를 검토한다.

Loki 조회(LogQL) 예:

```
{service="api"} |= "error"
{service="api"} | json | durationMs > 500
sum by (level) (count_over_time({service="api"} | json [5m]))
```

## 3. 메트릭

### 메트릭 타입 (Prometheus 기준)

| 타입 | 의미 | 예 |
|---|---|---|
| Counter | 증가만 하는 누적값 | 총 요청 수, 에러 수 |
| Gauge | 오르내리는 현재값 | 메모리 사용량, 동시 연결 수 |
| Histogram | 값의 분포를 구간(bucket)별로 집계 | 응답 시간 |
| Summary | 클라이언트에서 계산한 분위수 | (집계가 어려워 histogram 선호) |

**평균 응답 시간은 거짓말을 한다.** 99명이 0.1초, 1명이 10초면 평균은 0.2초지만 그 1명은 매우 불편하다. 그래서 **p95, p99** 같은 분위수를 본다.

### Prometheus 동작 방식

```
[앱 /metrics] [node_exporter :9100] [cAdvisor] [postgres_exporter]
        ▲             ▲                ▲              ▲
        └──────── Prometheus가 주기적으로 긁어감 (pull) ────────┘
                                │
                     ┌──────────┴──────────┐
                  Grafana (시각화)    Alertmanager (알림)
```

- **pull 모델**: 대상이 `/metrics`를 노출하면 Prometheus가 가져간다
- **exporter**: 메트릭을 노출하지 않는 대상을 대신 노출 (node_exporter = 서버 CPU/메모리/디스크, cAdvisor = 컨테이너, 각 DB용 exporter)
- 짧게 끝나는 배치 작업은 Pushgateway로 밀어 넣는다

`prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
scrape_configs:
  - job_name: api
    static_configs:
      - targets: ["api:3000"]
  - job_name: node
    static_configs:
      - targets: ["node-exporter:9100"]
rule_files:
  - /etc/prometheus/alerts.yml
alerting:
  alertmanagers:
    - static_configs:
        - targets: ["alertmanager:9093"]
```

### Node.js 앱 계측

```ts
import client from "prom-client";

client.collectDefaultMetrics();   // 이벤트 루프 지연, 힙, GC 등

const httpDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration",
  labelNames: ["method", "route", "status"],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
});

app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on("finish", () =>
    end({ method: req.method, route: req.route?.path ?? "unknown", status: res.statusCode })
  );
  next();
});

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});
```

`/metrics`는 외부에 공개하지 않는다(내부 네트워크 또는 별도 포트).

### PromQL 기본

```promql
# 초당 요청 수 (5분 기준)
sum(rate(http_request_duration_seconds_count[5m]))

# 에러율
sum(rate(http_request_duration_seconds_count{status=~"5.."}[5m]))
  / sum(rate(http_request_duration_seconds_count[5m]))

# p95 응답 시간 (라우트별)
histogram_quantile(0.95,
  sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))

# 디스크 사용률
1 - node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}
```

Counter는 그 자체보다 `rate()`로 **변화율**을 본다.

### 카디널리티 주의

라벨 값의 조합마다 별도 시계열이 생긴다. `userId`, `requestId`, 원본 URL(`/users/12345`)을 라벨로 쓰면 시계열이 폭발해 Prometheus가 느려지거나 죽는다. 라벨에는 **값의 종류가 한정된 것**(method, route 패턴, status)만 쓴다. 개별 요청 추적은 로그와 트레이스의 몫이다.

## 4. 무엇을 볼 것인가 — 방법론

| 방법론 | 대상 | 지표 |
|---|---|---|
| **RED** | 서비스(요청 처리) | Rate(요청량), Errors(에러), Duration(응답 시간) |
| **USE** | 자원(CPU, 메모리, 디스크, 네트워크) | Utilization(사용률), Saturation(포화: 대기열), Errors |
| **Golden Signals** (Google SRE) | 사용자 관점 | Latency, Traffic, Errors, Saturation |

대시보드 구성 권장:

1. **서비스 개요**: RED + 가용성 (가장 먼저 보는 화면)
2. **인프라**: 서버·컨테이너 USE
3. **의존성**: DB(연결 수, 느린 쿼리, 복제 지연), 캐시(적중률), 외부 API
4. **비즈니스**: 가입, 주문, 결제 성공률 (기술 지표가 정상인데 매출이 떨어지는 경우를 잡는다)

Grafana는 여러 데이터 소스(Prometheus, Loki, Tempo, DB)를 한 화면에 모으고, 메트릭 그래프에서 같은 시간대의 로그로 바로 넘어갈 수 있게 연결할 수 있다.

## 5. 알림

### 좋은 알림의 조건

- **사람의 조치가 필요한 것만** 알린다. 조치할 게 없는 알림은 무시하는 습관을 만든다(알림 피로)
- **원인보다 증상**에 건다: "CPU 90%"보다 "p95 응답 시간 2초 초과", "에러율 5% 초과"
- **지속 시간**을 둔다(`for: 5m`): 순간 스파이크로 깨우지 않는다
- **심각도 구분**: critical(즉시 대응, 전화) / warning(업무 시간 내 확인, 채팅)
- 알림마다 **런북 링크**: 받은 사람이 무엇을 해야 하는지(10강)

### Prometheus 알림 규칙

```yaml
groups:
  - name: api
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_request_duration_seconds_count{status=~"5.."}[5m]))
            / sum(rate(http_request_duration_seconds_count[5m])) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "API 에러율 5% 초과"
          runbook: "https://wiki.example.com/runbooks/api-errors"

      - alert: DiskWillFillIn24h
        expr: predict_linear(node_filesystem_avail_bytes{mountpoint="/"}[6h], 24*3600) < 0
        for: 30m
        labels:
          severity: warning

      - alert: TargetDown
        expr: up == 0
        for: 2m
        labels:
          severity: critical
```

`predict_linear`는 추세로 미래를 예측한다. "디스크 90%"보다 "이 속도면 24시간 뒤 가득 참"이 더 유용하다.

Alertmanager는 알림을 **묶고(grouping), 중복 제거하고, 억제(inhibition)하고, 라우팅**한다(Slack, 메일, PagerDuty 등). 서버 하나가 죽었을 때 그 위의 서비스 알림 수십 개가 쏟아지지 않게 하는 것이 억제의 역할이다.

### 외부 감시

내부 모니터링 시스템이 같이 죽으면 알림도 오지 않는다. 외부에서 헬스체크 URL을 주기적으로 호출하는 **합성 모니터링**(Uptime Kuma, Blackbox exporter, 클라우드 헬스체크)을 별도로 둔다. 폐쇄망이라면 모니터링 서버를 서비스 서버와 **물리적으로 분리**하고, 모니터링 자체의 생존도 확인한다(watchdog 알림).

## 6. 분산 트레이싱

마이크로서비스나 여러 외부 호출이 있으면 "어디서 느린가"를 로그만으로 찾기 어렵다.

```
Trace a1b2 (총 820ms)
└─ GET /orders/9            [api]         820ms
   ├─ SELECT orders         [postgres]     40ms
   ├─ GET /stock            [inventory]   710ms   ← 병목
   │   └─ SELECT stock      [postgres]    690ms   ← 인덱스 없음
   └─ SET cache             [redis]         2ms
```

- **Trace**: 요청 하나의 전체 여정
- **Span**: 그 안의 작업 하나 (시작·종료 시각, 속성)
- **Context propagation**: `traceparent` 헤더(W3C 표준)로 서비스 간 trace ID 전달

### OpenTelemetry

로그·메트릭·트레이스 수집의 **벤더 중립 표준**이다. 앱은 OTel SDK로 계측하고, **OTel Collector**가 받아서 원하는 백엔드(Tempo, Jaeger, Prometheus, Loki, 상용 APM)로 보낸다. 백엔드를 바꿔도 앱 코드는 그대로다.

```ts
// instrumentation.ts — 앱보다 먼저 로드
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

new NodeSDK({
  serviceName: "api",
  traceExporter: new OTLPTraceExporter({ url: "http://otel-collector:4318/v1/traces" }),
  instrumentations: [getNodeAutoInstrumentations()],  // http, express, pg, redis 등 자동
}).start();
```

Next.js는 `instrumentation.ts` 파일로 OTel 등록을 지원한다. 로그에 `traceId`를 함께 남기면 트레이스에서 해당 로그로 바로 이동할 수 있다.

모든 요청을 저장하면 비용이 크므로 **샘플링**(예: 10%, 에러는 전부)을 적용한다.

## 7. 헬스체크 엔드포인트

| 종류 | 질문 | 실패 시 조치 | 확인 내용 |
|---|---|---|---|
| **Liveness** | 프로세스가 살아 있나? | 재시작 | 최소한만 (이벤트 루프 응답) |
| **Readiness** | 요청을 받을 준비가 됐나? | 트래픽에서 제외 | DB·캐시 연결 등 필수 의존성 |

```ts
app.get("/healthz", (_req, res) => res.send("ok"));            // liveness

app.get("/readyz", async (_req, res) => {                        // readiness
  try {
    await db.query("SELECT 1");
    res.json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "not ready" });
  }
});
```

liveness에 DB 검사를 넣으면, DB 장애 시 모든 앱이 무한 재시작하며 상황을 악화시킨다. [9강의 쿠버네티스 probe](/posts/infra-09-kubernetes)가 이 구분을 그대로 사용한다.

## 8. 실습용 스택 (Docker Compose)

```yaml
services:
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./alerts.yml:/etc/prometheus/alerts.yml:ro
      - promdata:/prometheus
    ports: ["127.0.0.1:9090:9090"]

  alertmanager:
    image: prom/alertmanager
    volumes:
      - ./alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro

  grafana:
    image: grafana/grafana
    ports: ["127.0.0.1:3001:3000"]
    volumes:
      - grafanadata:/var/lib/grafana

  loki:
    image: grafana/loki
    command: -config.file=/etc/loki/local-config.yaml

  alloy:
    image: grafana/alloy
    volumes:
      - ./config.alloy:/etc/alloy/config.alloy:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
    command: run /etc/alloy/config.alloy

  node-exporter:
    image: prom/node-exporter
    pid: host
    volumes:
      - /:/host:ro,rslave
    command: --path.rootfs=/host

  cadvisor:
    image: gcr.io/cadvisor/cadvisor
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro

volumes:
  promdata:
  grafanadata:
```

> 실제 운영에서는 이미지 버전을 고정하고, 각 설정 파일은 공식 문서의 예제를 기반으로 작성한다. 폐쇄망이라면 4강의 방식으로 이미지를 반입하고, Grafana 대시보드 JSON도 함께 반입한다.

## 9. 실습 과제

1. 4강 앱에 `pino` 구조화 로그와 request ID를 적용한다.
2. `prom-client`로 `/metrics`를 노출하고 위 스택으로 수집한다.
3. Grafana에서 RED 대시보드(요청 수, 에러율, p95)와 node_exporter 대시보드를 만든다.
4. Loki로 앱 로그를 수집하고, 에러 로그를 `requestId`로 검색한다.
5. 에러율 알림 규칙을 만들고, 일부러 500을 발생시켜 Slack(또는 메일)로 알림이 오는지 확인한다.
6. `predict_linear` 디스크 알림을 만들고 `fallocate`로 큰 파일을 만들어 테스트한다.
7. OpenTelemetry로 트레이스를 켜고 Tempo 또는 Jaeger에서 DB 쿼리 span을 확인한다.
8. `/healthz`와 `/readyz`를 분리 구현하고, DB를 중지했을 때 각각의 응답을 확인한다.

## 10. 핵심 정리

- 로그(무엇), 메트릭(얼마나), 트레이스(어디서)를 함께 쓴다
- 로그는 JSON + request ID + 민감 정보 마스킹, 출력은 stdout
- 응답 시간은 평균이 아니라 p95/p99
- 메트릭 라벨에 고유값(userId 등)을 넣지 않는다
- 서비스는 RED, 자원은 USE
- 알림은 조치가 필요한 증상에만, 지속 시간과 런북을 함께
- 모니터링 시스템 자체도 외부에서 감시
- OpenTelemetry로 계측하면 백엔드를 자유롭게 바꿀 수 있다
- liveness는 가볍게, 의존성 검사는 readiness에

## 더 깊이

- 실제 서비스에 Sentry를 붙여 에러를 추적한 기록은 [Sentry는 어떻게 에러를 잡아내는가 — yoyak 관측 설계 노트](/posts/yoyak-sentry-observability)
- 요청 하나가 캐시·타임아웃·추적을 거치는 과정을 코드 수준에서 따라가려면 [요청 한 건의 일생 5편 — 캐시와 타임아웃, 에러와 추적](/posts/request-lifecycle-05-cache-timeout-observability)
