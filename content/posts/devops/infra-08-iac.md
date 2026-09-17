---
# 📌 기본 메타데이터
title: '풀스택 개발자를 위한 인프라 8강 — IaC (Infrastructure as Code)'
date: '2026-09-17'
category: 'devops'
tags: ['IaC', 'Terraform', 'Ansible', 'DevOps', 'Automation']
description: 'Terraform의 plan 읽기와 state 보호, 모듈과 환경 분리, CI에서의 실행 방식, Ansible의 멱등성, 두 도구의 역할 분담, 그리고 폐쇄망에서의 IaC 운영.'

# 💬 옵션 필드
draft: false
series: '풀스택 개발자를 위한 인프라'
seriesOrder: 8

# 📚 SEO용
keywords: ['IaC', 'Infrastructure as Code', 'Terraform', 'Ansible', 'terraform plan', 'state', '멱등성', '환경 분리', '폐쇄망', '프로비저닝']
---

# 풀스택 개발자를 위한 인프라 8강 — IaC (Infrastructure as Code)

여기까지 만든 인프라는 대부분 콘솔과 명령어로 손수 만든 것이었다. 이번 강에서는 같은 인프라를 코드로 기술해 몇 번을 실행해도 같은 결과가 나오도록 만드는 방법을 다룬다.

## 1. 왜 코드로 인프라를 관리하는가

6강에서 콘솔을 클릭해 VPC를 만들었다면 이런 질문에 답하기 어렵다.

- 똑같은 환경을 스테이징에 하나 더 만들 수 있는가?
- 누가, 언제, 왜 보안 그룹을 바꿨는가?
- 1년 뒤에 이 설정의 의도를 알 수 있는가?

IaC는 인프라를 **코드로 선언하고 Git으로 관리**한다. 코드 리뷰, 이력 추적, 재현, 자동화가 가능해진다.

### 핵심 개념

- **선언형 vs 명령형**: "t3.small 서버 2대가 있어야 한다"(선언형) vs "서버를 만들어라"(명령형). 선언형은 현재 상태와 비교해 **차이만** 적용한다
- **멱등성(Idempotency)**: 같은 코드를 여러 번 실행해도 결과가 같다. 두 번 실행했다고 서버가 4대가 되면 안 된다
- **불변 인프라(Immutable)**: 서버를 고치지 않고 새로 만들어 교체한다

### 도구 분류

| 영역 | 역할 | 도구 |
|---|---|---|
| **프로비저닝** | 인프라 자원 생성 (VPC, 서버, DB) | Terraform, OpenTofu, Pulumi, CloudFormation, AWS CDK |
| **구성 관리** | 서버 안의 설정 (패키지, 파일, 서비스) | Ansible, Chef, Puppet, Salt |
| **이미지 빌드** | 미리 구성된 서버 이미지 | Packer |

## 2. Terraform

### 구성 요소

| 요소 | 설명 |
|---|---|
| Provider | AWS, GCP, Docker 등 대상 API와 통신하는 플러그인 |
| Resource | 만들고 관리할 자원 |
| Data source | 이미 존재하는 자원 조회 (만들지 않음) |
| Variable | 입력값 |
| Output | 결과값 출력 (다른 모듈이나 사람이 사용) |
| Local | 코드 내부 계산값 |
| State | Terraform이 관리하는 자원의 실제 상태 기록 |
| Module | 재사용 가능한 코드 묶음 |

언어는 HCL(HashiCorp Configuration Language)이다.

> 라이선스 참고: Terraform은 BSL 라이선스로 변경되었고, 이에 대응해 오픈소스 포크인 **OpenTofu**(`tofu` 명령)가 만들어졌다. 문법과 워크플로는 사실상 같으므로 아래 내용은 둘 다에 적용된다.

### 워크플로

```bash
terraform init       # provider 다운로드, backend 초기화
terraform fmt        # 코드 정렬
terraform validate   # 문법 검사
terraform plan       # 무엇이 바뀔지 미리 보기  ← 반드시 읽는다
terraform apply      # 적용
terraform destroy    # 전부 삭제
```

`plan` 출력의 기호:

```
+ create     ~ update in-place     - destroy
-/+ destroy and then create replacement   ← 주의: 교체되면 데이터가 사라질 수 있다
```

### 예시: VPC + 보안 그룹 + EC2

```
infra/
├── versions.tf
├── variables.tf
├── main.tf
├── outputs.tf
└── terraform.tfvars
```

`versions.tf`:

```hcl
terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"     # 사용 시점의 메이저 버전을 확인해 고정
    }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = var.project, Env = var.env, ManagedBy = "terraform" }
  }
}
```

`variables.tf`:

```hcl
variable "region" {
  type    = string
  default = "ap-northeast-2"
}
variable "project" {
  type = string
}
variable "env" {
  type = string
}
variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}
variable "instance_type" {
  type    = string
  default = "t3.small"
}
```

`main.tf`:

```hcl
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs  = slice(data.aws_availability_zones.available.names, 0, 2)
  name = "${var.project}-${var.env}"
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  tags = { Name = local.name }
}

resource "aws_subnet" "public" {
  count                   = length(local.azs)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index + 1)    # 10.0.1.0/24, 10.0.2.0/24
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true
  tags = { Name = "${local.name}-public-${count.index}" }
}

resource "aws_subnet" "private" {
  count             = length(local.azs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 11)        # 10.0.11.0/24, ...
  availability_zone = local.azs[count.index]
  tags = { Name = "${local.name}-private-${count.index}" }
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main.id
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "app" {
  name   = "${local.name}-app"
  vpc_id = aws_vpc.main.id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
}

resource "aws_instance" "app" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public[0].id
  vpc_security_group_ids = [aws_security_group.app.id]
  user_data              = file("${path.module}/user_data.sh")
  tags = { Name = "${local.name}-app" }
}
```

`outputs.tf`:

```hcl
output "app_public_ip" { value = aws_instance.app.public_ip }
output "vpc_id"        { value = aws_vpc.main.id }
```

`terraform.tfvars`:

```hcl
project = "blog"
env     = "dev"
```

자원 간 참조(`aws_vpc.main.id`)로 **의존 관계가 자동으로 계산**되어, 생성·삭제 순서를 직접 지정할 필요가 없다. `count`와 `for_each`로 반복을 표현한다. 항목이 추가·삭제될 가능성이 있으면 인덱스가 밀리지 않는 `for_each`(키 기반)가 안전하다.

## 3. State — 가장 중요한 개념

`terraform.tfstate`는 "코드의 자원 ↔ 실제 클라우드 자원 ID"의 매핑이다. 이것이 없으면 Terraform은 이미 만든 자원을 모르고 또 만들려 한다.

주의:

- **state에는 비밀이 평문으로 들어갈 수 있다** (DB 비밀번호 등). Git에 커밋하지 않는다 (`.gitignore`에 `*.tfstate*`, `.terraform/`)
- 여러 사람이 로컬 state를 쓰면 충돌한다 → **원격 backend + 잠금**

```hcl
terraform {
  backend "s3" {
    bucket       = "mycorp-tfstate"
    key          = "blog/dev/terraform.tfstate"
    region       = "ap-northeast-2"
    encrypt      = true
    use_lockfile = true     # S3 자체 잠금 (Terraform 1.10+). 과거의 DynamoDB 잠금 방식은 대체되는 추세
  }
}
```

state 버킷은 버전 관리와 암호화를 켜고 접근 권한을 엄격히 제한한다. 이 버킷 자체는 보통 별도 코드나 수동으로 한 번 만든다(닭과 달걀 문제).

State 관련 명령:

```bash
terraform state list                     # 관리 중인 자원 목록
terraform state show aws_instance.app
terraform import aws_s3_bucket.logs my-existing-bucket   # 기존 자원을 관리 대상으로
terraform plan -refresh-only             # 실제 상태와의 차이(drift) 확인
```

Terraform 1.5 이상은 코드에 `import` 블록을 선언하는 방식도 지원한다. 리소스 이름을 바꿀 때는 `moved` 블록을 써서 삭제 후 재생성을 막는다.

```hcl
moved {
  from = aws_instance.web
  to   = aws_instance.app
}
```

### Drift

누군가 콘솔에서 직접 설정을 바꾸면 코드와 실제가 어긋난다(drift). 다음 `apply`가 그 변경을 되돌려 버린다. 원칙은 **"Terraform으로 관리하는 자원은 콘솔에서 바꾸지 않는다."** 긴급 수정을 했다면 반드시 코드에 반영한다.

### 사고 방지

```hcl
resource "aws_db_instance" "main" {
  # ...
  deletion_protection = true
  lifecycle {
    prevent_destroy = true       # destroy 계획이 나오면 에러
  }
}
```

## 4. 모듈과 환경 분리

### 모듈

```
modules/
└── network/
    ├── main.tf
    ├── variables.tf
    └── outputs.tf
envs/
├── dev/
│   ├── main.tf        # module "network" { source = "../../modules/network" ... }
│   └── backend.tf     # key = "blog/dev/..."
└── prod/
    ├── main.tf
    └── backend.tf     # key = "blog/prod/..."
```

```hcl
module "network" {
  source   = "../../modules/network"
  name     = "blog-prod"
  vpc_cidr = "10.1.0.0/16"
}

# 모듈의 output 사용
resource "aws_instance" "app" {
  subnet_id = module.network.private_subnet_ids[0]
}
```

검증된 공개 모듈(예: `terraform-aws-modules/vpc/aws`)을 활용하면 작성량이 크게 줄어든다. 단, 버전을 고정한다.

### 환경 분리 방식

| 방식 | 장점 | 단점 |
|---|---|---|
| 디렉터리 분리 (`envs/dev`, `envs/prod`) | state가 완전히 분리, 명확 | 코드 중복 (모듈로 완화) |
| workspace | 코드 하나 | 실수로 다른 환경에 적용하기 쉬움 |

운영 환경 보호를 위해 **디렉터리 분리 + 환경별 권한 분리**가 일반적으로 안전하다. 규모가 커지면 state를 네트워크, 데이터, 앱처럼 **변경 주기와 위험도별로 쪼갠다.** 하나의 거대한 state는 plan이 느리고 사고 범위가 크다.

## 5. CI에서의 Terraform

```
PR 생성 → fmt/validate → plan 실행 → plan 결과를 PR 코멘트로 → 리뷰
병합    → (승인) → apply
```

- plan 결과를 사람이 읽고 승인하는 것이 핵심 안전장치
- 클라우드 인증은 5강의 OIDC 역할 사용
- 정책 검사: `tflint`, 보안 스캔 `trivy config` / `checkov` (예: "S3 공개 금지", "암호화 필수")
- Atlantis, HCP Terraform 같은 도구가 이 흐름을 제공한다

## 6. Ansible

서버 **안**의 설정을 코드로 관리한다.

### 특징

- **에이전트리스**: 대상 서버에 SSH와 Python만 있으면 된다
- **YAML**로 작성
- 대부분의 모듈이 멱등하다
- 폐쇄망·온프레미스에서 특히 유용하다 (에이전트 설치·외부 통신 불필요)

### 인벤토리

`inventory/prod.ini`:

```ini
[web]
web1 ansible_host=10.0.11.21
web2 ansible_host=10.0.11.22

[db]
db1 ansible_host=10.0.21.10

[all:vars]
ansible_user=deploy
ansible_become=true
```

```bash
ansible all -i inventory/prod.ini -m ping              # 연결 확인
ansible web -i inventory/prod.ini -a "uptime"          # 임시 명령
```

### 플레이북

`site.yml`:

```yaml
- name: Web servers
  hosts: web
  vars:
    app_port: 3000
    server_name: app.example.com
  tasks:
    - name: Install nginx
      ansible.builtin.package:
        name: nginx
        state: present

    - name: Deploy nginx site config
      ansible.builtin.template:
        src: templates/app.conf.j2
        dest: /etc/nginx/conf.d/app.conf
        mode: "0644"
      # validate는 명령 안의 %s를 "아직 설치 전인 임시 파일" 경로로 치환해 검사하는 기능이다.
      # 그런데 conf.d 조각 파일은 http 블록이 없어 단독으로 nginx -t를 통과할 수 없으므로
      # 여기서는 쓸 수 없다. %s 없이 `nginx -t -c /etc/nginx/nginx.conf`라고 적으면
      # 새 파일이 아니라 "지금 설치돼 있는 설정"을 검사해 항상 통과한다 — 방어선이 되지 못한다.
      # 실제 방어는 아래 handler에서 reload 직전에 건다.
      notify: Reload nginx

    - name: Ensure nginx is running
      ansible.builtin.service:
        name: nginx
        state: started
        enabled: true

    - name: Create deploy directory
      ansible.builtin.file:
        path: /opt/myapp
        state: directory
        owner: deploy
        group: deploy
        mode: "0755"

  handlers:
    # 검사와 reload를 한 덩어리로 묶는다. nginx -t가 실패하면 reload까지 가지 않는다.
    - name: Reload nginx
      ansible.builtin.shell: nginx -t && systemctl reload nginx
      changed_when: true
```

`templates/app.conf.j2` (Jinja2 템플릿):

```nginx
server {
    listen 80;
    server_name {{ server_name }};
    location / {
        proxy_pass http://127.0.0.1:{{ app_port }};
    }
}
```

```bash
ansible-playbook -i inventory/prod.ini site.yml --check --diff   # 미리 보기 (dry-run)
ansible-playbook -i inventory/prod.ini site.yml --limit web1     # 일부만
ansible-playbook -i inventory/prod.ini site.yml
```

- **handler**: 설정이 **바뀌었을 때만** 실행 (불필요한 재시작 방지)
- `shell`/`command` 모듈은 멱등하지 않으므로 `creates`, `changed_when` 등으로 보완하고, 전용 모듈이 있으면 그것을 쓴다

### 역할(Role)과 비밀

```
roles/
├── common/     # 사용자, 시간 동기화, 기본 보안 설정
├── docker/
├── nginx/
└── node_exporter/
```

```yaml
- hosts: web
  roles: [common, docker, nginx, node_exporter]
```

비밀은 **Ansible Vault**로 암호화해 Git에 둔다.

```bash
ansible-vault create group_vars/prod/vault.yml
ansible-playbook site.yml --ask-vault-pass
```

## 7. Terraform과 Ansible의 역할 분담

| 단계 | 도구 |
|---|---|
| VPC, 서브넷, 보안 그룹, 서버, DB 생성 | Terraform |
| 서버 OS 설정, 패키지, 에이전트, 파일 배치 | Ansible (또는 Packer로 이미지에 미리 굽기) |
| 애플리케이션 배포 | CI/CD (5강), 쿠버네티스 (9강) |

컨테이너 중심 환경에서는 서버 안의 설정이 줄어들어 Ansible의 역할이 작아지고, "Terraform + 컨테이너 플랫폼" 조합이 흔하다. 반대로 **온프레미스·폐쇄망**에서는 클라우드 API가 없으므로 Ansible이 중심이 된다.

## 8. 폐쇄망에서의 IaC

- Terraform provider는 외부에서 받아 **provider mirror**(`terraform providers mirror`)로 반입하고, CLI 설정의 `provider_installation`에서 로컬 경로를 지정한다
- Ansible 컬렉션은 `ansible-galaxy collection download`로 받아 반입한다
- 온프레미스 가상화(VMware 등)도 Terraform provider가 있는 경우가 많다
- 최소한 **서버 구축 절차를 Ansible 플레이북으로 문서화**해 두면, 인수인계 없는 복구 상황에서 결정적인 차이를 만든다

## 9. 실습 과제

1. 6강에서 콘솔로 만든 구성을 전부 삭제하고, 같은 구성을 Terraform으로 작성한다.
2. `plan` 결과를 읽고, `instance_type`을 바꿨을 때와 `ami`를 바꿨을 때의 차이(update vs replace)를 비교한다.
3. S3 backend와 잠금을 설정하고, 두 터미널에서 동시에 `apply`해 잠금 동작을 확인한다.
4. 콘솔에서 보안 그룹 규칙을 수동으로 추가한 뒤 `plan -refresh-only`로 drift를 확인한다.
5. 네트워크 부분을 모듈로 분리하고 `envs/dev`, `envs/prod`에서 다른 CIDR로 호출한다.
6. `terraform destroy`로 전부 정리하고 비용이 남는 자원이 없는지 확인한다.
7. 로컬 VM 2대(또는 Terraform으로 만든 EC2)에 Ansible로 Nginx + Docker + node_exporter를 설치하는 플레이북을 작성한다.
8. 같은 플레이북을 두 번 실행해 두 번째에 `changed=0`이 나오는지(멱등성) 확인한다.

## 10. 핵심 정리

- 인프라를 코드로: 리뷰, 이력, 재현, 자동화
- 선언형 + 멱등성이 핵심
- `plan`을 반드시 읽고, replace(`-/+`)는 특히 주의
- state는 원격 backend + 잠금 + 암호화, Git에 커밋 금지
- 관리 대상 자원은 콘솔에서 수정하지 않는다 (drift)
- 중요 자원은 `prevent_destroy`, 이름 변경은 `moved`
- 환경은 디렉터리로 분리, state는 위험도별로 분할
- Terraform은 자원 생성, Ansible은 서버 내부 설정
- 폐쇄망에서는 provider mirror와 Ansible 플레이북이 핵심
