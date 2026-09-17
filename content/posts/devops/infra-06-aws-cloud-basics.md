---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 인프라 6강 — 클라우드 기초 (AWS)'
date: '2026-09-17'
category: 'devops'
tags: ['AWS', 'Cloud', 'VPC', 'IAM', 'Infra']
description: 'IaaS부터 SaaS까지의 책임 경계, IAM 최소 권한과 역할, VPC의 public/private 라우팅과 보안 그룹, EC2·S3·RDS·ELB·Route 53의 기본기, 그리고 NAT와 데이터 전송에서 새는 비용까지.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 인프라'
seriesOrder: 6

# 📚 SEO용
keywords: ['AWS', '클라우드 기초', 'VPC', 'IAM', 'EC2', 'S3', 'RDS', 'ELB', 'Route 53', '멀티 AZ', '책임 공유 모델', 'Session Manager']
---

# 풀스택 개발자를 위한 인프라 6강 — 클라우드 기초 (AWS)

5강까지는 서버를 직접 준비하고 그 위에 배포 파이프라인을 얹는 과정을 다뤘다. 이번 강에서는 같은 구성 요소를 클라우드 사업자의 관리형 자원으로 옮겼을 때 무엇을 직접 관리하고 무엇을 맡기게 되는지를 AWS를 기준으로 살펴본다.

> AWS를 기준으로 설명하지만, 개념(네트워크 격리, 권한, 컴퓨트, 스토리지, 관리형 DB)은 GCP, Azure, NCP 등 국내외 클라우드에 그대로 대응된다. 서비스 이름과 요금은 바뀔 수 있으므로 공식 문서에서 확인한다.

## 1. 클라우드의 기본 개념

### 서비스 모델

| 모델 | 사용자가 관리하는 것 | 예 |
|---|---|---|
| IaaS | OS 이상 전부 | EC2 |
| PaaS / CaaS | 앱과 데이터 | Elastic Beanstalk, ECS Fargate, Vercel |
| FaaS | 함수 코드 | Lambda |
| SaaS | 사용만 | Gmail, Notion |

위로 갈수록 통제권이 크고 운영 부담도 크다. 아래로 갈수록 편하지만 제약이 많고 단가가 높아질 수 있다.

### 책임 공유 모델

클라우드 사업자는 **클라우드 자체의 보안**(데이터센터, 하드웨어, 가상화)을, 사용자는 **클라우드 안의 보안**(OS 패치, 방화벽 설정, 권한, 데이터 암호화)을 책임진다. S3 버킷을 공개로 열어 데이터가 유출되면 사용자 책임이다.

### 리전과 가용 영역

- **리전(Region)**: 지리적 단위. 서울은 `ap-northeast-2`
- **가용 영역(AZ)**: 리전 안의 물리적으로 분리된 데이터센터 묶음. `ap-northeast-2a`, `2c` 등
- 고가용성의 기본은 **여러 AZ에 분산 배치**하는 것이다

리전 선택 기준: 사용자와의 거리(지연), 데이터 거주 규정, 서비스 제공 여부, 가격.

## 2. IAM — 권한 관리

| 구성 | 설명 |
|---|---|
| 루트 계정 | 모든 권한. **일상 작업에 쓰지 않는다.** MFA 설정 후 봉인 |
| 사용자 (User) | 사람. 가능하면 IAM Identity Center(SSO)로 대체 |
| 그룹 (Group) | 사용자 묶음에 정책 부여 |
| 역할 (Role) | **임시 자격 증명**을 받는 신원. EC2, Lambda, CI(OIDC)가 맡음 |
| 정책 (Policy) | 무엇을 허용/거부하는지 적은 JSON |

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::my-app-uploads/*"
    }
  ]
}
```

원칙:

- **최소 권한**: `"Action": "*"`, `"Resource": "*"`를 피한다
- **장기 액세스 키 지양**: EC2에는 인스턴스 역할, CI에는 OIDC 역할
- 명시적 `Deny`는 어떤 `Allow`보다 우선한다
- 액세스 키를 Git에 커밋하면 수분 안에 자동화된 공격에 악용될 수 있다

## 3. VPC — 네트워크

VPC는 클라우드 안의 **나만의 사설 네트워크**다. 2강의 개념이 그대로 쓰인다.

```
VPC 10.0.0.0/16  (ap-northeast-2)
├─ AZ-a
│   ├─ Public subnet  10.0.1.0/24   ← ALB, NAT GW, (Bastion)
│   ├─ Private subnet 10.0.11.0/24  ← 앱 서버
│   └─ DB subnet      10.0.21.0/24  ← RDS
└─ AZ-c
    ├─ Public subnet  10.0.2.0/24
    ├─ Private subnet 10.0.12.0/24
    └─ DB subnet      10.0.22.0/24

Internet Gateway ─ Public 라우팅: 0.0.0.0/0 → IGW
NAT Gateway      ─ Private 라우팅: 0.0.0.0/0 → NAT GW  (나가기만 가능)
```

| 구성 요소 | 역할 |
|---|---|
| 서브넷 | VPC 대역을 AZ별로 나눈 것. 하나의 서브넷은 하나의 AZ에 속함 |
| 라우팅 테이블 | 서브넷의 트래픽이 어디로 갈지 결정 |
| Internet Gateway (IGW) | VPC와 인터넷 연결. 양방향 |
| NAT Gateway | private 서브넷이 **밖으로만** 나가게 (패키지 설치, 외부 API) |
| VPC Endpoint | 인터넷을 거치지 않고 S3 등 AWS 서비스에 접근 |

**public 서브넷**이란 라우팅 테이블에 IGW 경로가 있는 서브넷을 말한다. 이름이 아니라 라우팅이 결정한다.

VPC 대역을 정할 때는 **사내망, 다른 VPC, Docker 대역과 겹치지 않게** 한다. 나중에 VPN이나 피어링으로 연결할 때 겹치면 고치기 매우 어렵다.

### 보안 그룹 vs 네트워크 ACL

| | Security Group | Network ACL |
|---|---|---|
| 적용 단위 | 인스턴스(ENI) | 서브넷 |
| 규칙 | 허용만 | 허용·거부 |
| 상태 | **Stateful** (응답은 자동 허용) | Stateless (응답 방향도 규칙 필요) |
| 주 용도 | 기본 방화벽 | 추가 방어선 |

보안 그룹은 IP 대신 **다른 보안 그룹을 출발지로** 지정할 수 있다. 예: DB 보안 그룹의 5432 인바운드를 "앱 보안 그룹"에서만 허용. 서버가 늘거나 IP가 바뀌어도 규칙을 고칠 필요가 없다.

```
ALB-SG   : 443  ← 0.0.0.0/0
App-SG   : 3000 ← ALB-SG
DB-SG    : 5432 ← App-SG
```

## 4. EC2 — 가상 서버

- **인스턴스 타입**: `t`(버스터블, 소규모), `m`(범용), `c`(컴퓨팅), `r`(메모리). 뒤의 `g`는 ARM(Graviton) — 가격 대비 성능이 좋지만 이미지 아키텍처를 맞춰야 한다(4강)
- **AMI**: OS 이미지
- **EBS**: 네트워크 블록 디스크. 인스턴스를 종료해도 남길 수 있고 스냅샷으로 백업
- **인스턴스 스토어**: 로컬 디스크. 중지 시 데이터 소멸
- **키 페어**: SSH 접속용
- **User data**: 첫 부팅 시 실행할 스크립트 (패키지 설치, 초기 설정)
- **탄력적 IP**: 고정 공인 IP (사용하지 않고 붙들고만 있어도 과금)

### 접속 방식

| 방식 | 특징 |
|---|---|
| 공인 IP + SSH (22 개방) | 간단하지만 22 포트가 노출됨. 최소한 내 IP로 제한 |
| Bastion 호스트 | public의 점프 서버를 통해 private 접속 |
| **SSM Session Manager** | 포트 개방 없이 IAM 권한으로 접속, 로그 기록. 권장 |

### 확장

- **Auto Scaling Group**: 인스턴스 수를 자동 조절, 죽은 인스턴스 교체
- **Launch Template**: 어떤 인스턴스를 만들지 정의

서버를 "고치는" 대상이 아니라 **언제든 교체되는 대상**으로 다루는 사고방식(cattle, not pets)이 핵심이다.

## 5. S3 — 오브젝트 스토리지

- **버킷**(전역 고유 이름) 안에 **객체**(키-값)를 저장. 디렉터리처럼 보이지만 실제로는 키 접두사
- 사실상 무제한 용량, 높은 내구성
- **퍼블릭 액세스 차단**을 기본으로 유지
- **Presigned URL**: 서버가 서명한 임시 URL로 클라이언트가 직접 업로드/다운로드 → 앱 서버가 대용량 파일을 중계하지 않아도 됨
- **버전 관리**: 실수로 삭제·덮어쓰기 대비
- **수명 주기 정책**: 오래된 객체를 저렴한 클래스(IA, Glacier)로 이동하거나 삭제
- **정적 웹 호스팅 + CloudFront(CDN)**: SPA 배포에 적합. CloudFront OAC로 버킷을 비공개로 유지

MinIO는 S3 API와 호환되는 오브젝트 스토리지라, 온프레미스·폐쇄망에서 같은 SDK 코드로 S3처럼 쓸 수 있다.

```ts
// presigned URL 발급 (AWS SDK v3)
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({ region: "ap-northeast-2" });
const url = await getSignedUrl(
  s3,
  new PutObjectCommand({ Bucket: "my-app-uploads", Key: `u/${userId}/${fileId}` }),
  { expiresIn: 300 }
);
```

## 6. RDS — 관리형 데이터베이스

사업자가 설치, 패치, 백업, 장애 조치를 대신한다. 사용자는 스키마, 쿼리, 파라미터에 집중한다.

| 기능 | 목적 |
|---|---|
| **Multi-AZ** | 다른 AZ에 동기 대기 인스턴스 → 장애 시 자동 전환. **가용성** |
| **Read Replica** | 비동기 복제본 → 읽기 분산. **성능** (복제 지연 존재) |
| 자동 백업 + PITR | 보존 기간 내 특정 시점으로 복구 |
| 스냅샷 | 수동 백업 |
| 파라미터 그룹 | DB 설정 |

- DB는 **private(DB) 서브넷**에, 공개 접근 비활성화
- Aurora는 AWS의 고성능 호환 엔진(MySQL/PostgreSQL 호환)
- 장애 조치 시 엔드포인트의 DNS가 바뀌므로, 앱은 **DNS 캐시를 오래 잡지 않고 재연결**할 수 있어야 한다
- Lambda처럼 인스턴스가 많이 뜨는 환경에서는 커넥션 폭증을 막기 위해 RDS Proxy 같은 풀러를 둔다(10강)

## 7. 로드밸런서 (ELB)

| 종류 | 계층 | 특징 |
|---|---|---|
| ALB | L7 | 경로·호스트 기반 라우팅, HTTPS 종료, WebSocket |
| NLB | L4 | 초고성능, 고정 IP, TCP/UDP |

구성: **리스너**(443) → **규칙**(`/api/*`) → **대상 그룹**(EC2, IP, 컨테이너) + **헬스체크**.

- 인증서는 **ACM**에서 무료 발급·자동 갱신 (ALB, CloudFront에 연결)
- ALB는 `X-Forwarded-For`, `X-Forwarded-Proto`를 붙여 준다 → 3강의 프록시 신뢰 설정 필요
- ALB를 여러 AZ의 public 서브넷에 두고, 대상은 private 서브넷에 둔다

## 8. Route 53 — DNS

- 호스팅 영역에 레코드 등록 (2강의 A, CNAME 등)
- **Alias 레코드**: 루트 도메인을 ALB/CloudFront에 연결 가능
- 라우팅 정책: 단순, 가중치(카나리), 지연 시간 기반, 장애 조치(헬스체크 연동)

## 9. 그 밖에 자주 쓰는 서비스

| 서비스 | 용도 |
|---|---|
| ECR | 컨테이너 레지스트리 |
| ECS (+ Fargate) | 컨테이너 실행. Fargate는 서버 관리 없이 실행 |
| EKS | 관리형 쿠버네티스 |
| Lambda | 함수 실행. 이벤트 기반, 사용한 만큼 과금 |
| CloudWatch | 로그, 메트릭, 알람 |
| Secrets Manager / Parameter Store | 비밀·설정 저장 |
| SQS / SNS / EventBridge | 큐, 알림, 이벤트 버스 |
| ElastiCache | 관리형 Redis/Valkey |
| CloudTrail | API 호출 감사 로그 (누가 무엇을 바꿨나) |

### 컨테이너 실행 선택지

| 선택지 | 운영 부담 | 적합 |
|---|---|---|
| EC2 + Docker Compose | 높음 (OS 관리) | 소규모, 학습 |
| ECS Fargate | 낮음 | 대부분의 컨테이너 서비스 |
| EKS | 높음 (쿠버네티스 지식 필요) | 대규모, 멀티 클라우드, 복잡한 워크로드 |
| App Runner, Vercel 등 PaaS | 매우 낮음 | 빠른 출시 |

## 10. 대표 아키텍처

```
사용자
  │
Route 53 ──▶ CloudFront ──▶ S3 (정적 파일)
  │
  └──▶ ALB (public, 2 AZ, ACM 인증서)
          │
          ▼
       ECS Fargate / EC2 ASG (private, 2 AZ)  ── NAT GW ──▶ 외부 API
          │         │
          ▼         ▼
    RDS Multi-AZ   ElastiCache      (DB subnet)
          │
     S3 (업로드, VPC Endpoint 경유)

로그/메트릭 → CloudWatch   비밀 → Secrets Manager   감사 → CloudTrail
```

## 11. 비용

클라우드 비용은 "서버 대수"보다 **숨은 항목**에서 불어난다.

| 항목 | 주의점 |
|---|---|
| 컴퓨트 | 켜 둔 시간만큼. 개발 환경은 업무 시간 외 중지 |
| **NAT Gateway** | 시간당 요금 + 처리 데이터 요금. 학습용 계정의 흔한 과금 원인 |
| 데이터 전송 | 인터넷으로 나가는 트래픽, AZ 간 트래픽 |
| EBS·스냅샷 | 인스턴스를 지워도 남아 과금 |
| 미사용 리소스 | 탄력적 IP, 로드밸런서, 공인 IPv4 주소 |
| 로그 | CloudWatch 로그 수집·보관량 |

절약 수단: 예약 인스턴스/Savings Plans(장기 약정), Spot 인스턴스(중단 가능 작업), ARM 인스턴스, 적정 사이징.

**반드시 할 것**: 계정 생성 직후 **Budgets 알림**을 설정한다. 모든 리소스에 `Project`, `Env`, `Owner` 태그를 붙여 비용을 추적한다. 실습이 끝나면 리소스를 삭제한다(8강의 Terraform을 쓰면 `destroy` 한 번으로 정리된다).

## 12. 실습 과제

> 실습 전에 Budgets 알림(예: 월 $10)을 먼저 설정한다.

1. 루트 계정에 MFA를 걸고, 관리용 IAM 사용자(또는 Identity Center)를 만든다.
2. 콘솔에서 VPC를 직접 만든다: public/private 서브넷 각 2개(2 AZ), IGW, 라우팅 테이블.
3. private 서브넷에 EC2를 띄우고 SSM Session Manager로 접속한다(인스턴스 역할 필요).
4. ALB를 public에 만들고 EC2의 앱(4강 이미지)을 대상 그룹으로 연결한다.
5. 보안 그룹을 ALB-SG → App-SG 참조 방식으로 구성하고, EC2에 직접 접속이 안 되는지 확인한다.
6. S3 버킷을 비공개로 만들고 presigned URL로 파일을 업로드한다.
7. (선택) RDS를 DB 서브넷에 만들고 앱에서 연결한다. 실습 후 즉시 삭제한다.
8. NAT Gateway의 요금 구조를 확인하고, 실습이 끝나면 전부 삭제한다.

## 13. 핵심 정리

- 책임 공유: 클라우드 안의 설정과 데이터는 사용자 책임
- 고가용성의 기본은 멀티 AZ
- 루트 계정 봉인, 최소 권한, 장기 키 대신 역할
- public/private은 라우팅이 결정, private은 NAT로 나가기만
- 보안 그룹은 stateful이며 다른 보안 그룹을 참조해 계층 구성
- 서버 직접 SSH보다 Session Manager
- S3는 비공개 + presigned URL, RDS는 private + Multi-AZ
- 비용은 NAT, 데이터 전송, 방치된 리소스에서 샌다 → 예산 알림과 태그
