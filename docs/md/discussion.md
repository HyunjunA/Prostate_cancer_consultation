# System Integration Technical Questions

## 1. Raw Transcripts - 데이터 소스

### 1.1 데이터 수집 및 형식

- Raw transcripts는 어떤 시스템에서 생성되나요?
- 실시간 스트리밍인가요, 배치 처리인가요?
- 데이터 형식은? (JSON, TXT, CSV, XML?)
- 파일 크기 및 일일 처리량은?
- 오디오 파일도 함께 저장되나요?
- 메타데이터가 포함되나요? (타임스탬프, 화자 정보 등)

### 1.2 데이터 저장소

- Raw transcripts가 현재 어디에 저장되어 있나요?
  - 로컬 파일 시스템? NAS? 클라우드 스토리지 (S3, Azure Blob)?
  - 데이터베이스에 저장되나요?
- REDCap을 사용 중인가요?
- Epic EHR 시스템과 연동되나요?
- 데이터 보관 정책은? (보관 기간, 아카이빙, 삭제)

### 1.3 데이터 접근 및 권한

- 누가 raw transcripts에 접근할 수 있나요?
- 인증 방식은? (Active Directory, SSO, OAuth?)
- RBAC가 구현되어 있나요? 어떤 역할들이 있나요?
- PHI 데이터 접근 시 특별한 승인이 필요한가요?
- 접근 로그가 자동으로 기록되나요?
- API를 통한 접근인가요? API 키 관리는?

## 2. Data Processing Server - 처리 인프라

### 2.1 서버 아키텍처

- 현재 구축되어 있나요, 새로 만들어야 하나요?
- 온프레미스인가요, 클라우드인가요? (AWS, Azure, GCP?)
- 컴퓨팅 리소스 요구사항은? (CPU, RAM, GPU 필요 여부)
- Docker 컨테이너를 사용하나요?
- Kubernetes가 필요한가요?

### 2.2 AI 모델

**Sentence Classifier:**

- Input data
  - 이 모델을 위한 Input data를 어디서 어떻게 가져오나요?
  - 예를 들어 API call 을 하여 Input data를 가져오거나, 동일 서버내의 폴더내에 저장된 파일 읽기 등을 통해 가져오나.
- Output data

  - 모델의 Output data는 어디에 저장되나요?
  - 예를 들어 동일 서버내의 폴더내에 저장된 파일로 저장하거나, API call을 통해 다른 DB나 시스템으로 전송하나요? 만약 redcap에 저장된다면 redcap API를 사용하는데 이는 안전한가?

**AI Scoring:**

- Input data
  - 이 모델을 위한 Input data를 어디서 어떻게 가져오나요?
  - 예를 들어 API call 을 하여 Input data를 가져오거나, 동일 서버내의 폴더내에 저장된 파일 읽기 등을 통해 가져오나.
- Output data

  - 모델의 Output data는 어디에 저장되나요?
  - 예를 들어 동일 서버내의 폴더내에 저장된 파일로 저장하거나, API call을 통해 다른 DB나 시스템으로 전송하나요? 만약 redcap에 저장된다면 redcap API를 사용하는데 이는 안전한가?

**AI Summary (Rewriting):**

- Input data
  - 이 모델을 위한 Input data를 어디서 어떻게 가져오나요?
  - 예를 들어 API call 을 하여 Input data를 가져오거나, 동일 서버내의 폴더내에 저장된 파일 읽기 등을 통해 가져오나.
- Output data

  - 모델의 Output data는 어디에 저장되나요?
  - 예를 들어 동일 서버내의 폴더내에 저장된 파일로 저장하거나, API call을 통해 다른 DB나 시스템으로 전송하나요? 만약 redcap에 저장된다면 redcap API를 사용하는데 이는 안전한가?

### 2.3 처리 파이프라인

- 세 가지 처리(분류, 점수, 요약)는 순차적.
- 워크플로우 오케스트레이션 도구를 사용하나요? (Airflow, Prefect?)
- 메시지 큐를 사용하나요? (RabbitMQ, Kafka, SQS?)
- 에러 발생 시 재시도 정책은?
- 처리 상태를 어떻게 추적하나요?
- 예상 처리 시간은? (transcript 하나당)

## 3. Processed Data - 중간 저장소

- 이를 어디에 저장하나?
- 이 서버를 누가 관리하나?

### 3.1 데이터 스키마

- 그 위에서 각 모델별 output data를 어떻게 저장하나요?
- Redcap에 저장하나요?
- 아니면 별도의 데이터베이스에 저장하나요?

  - DB에 저장시에 Processed data의 스키마 필요.
  - 어떤 필드들이 포함되나요?
  - Transcript ID
  - 분류 결과
  - 점수 (전체, 항목별)
  - 요약/재작성 텍스트
  - 메타데이터
  - 문장 단위 분석 결과는 어떻게 저장하나요?

### 3.2 저장 위치

- Raw data와 같은 데이터베이스인가요, 별도인가요?
- 파일 시스템에도 저장하나요?
- 인덱싱 전략은?
- 백업 주기 및 방식은?

## 4. Database/File System - 영구 저장소

### 4.1 데이터베이스

- 현재 사용 중인 데이터베이스가 있나요?
- 데이터베이스 타입은? (PostgreSQL, MySQL, MongoDB 등)
- 새로 구축해야 하나요?
- 스키마 마이그레이션 도구를 사용하나요?
- Read replica나 샤딩이 필요한가요?

### 4.2 HIPAA 규정 준수

- 저장 시 암호화(encryption at rest)가 구현되어 있나요?
- 전송 중 암호화(TLS/SSL)는?
- 키 관리 시스템은? (AWS KMS, Azure Key Vault?)
- 접근 로그가 기록되나요?
- BAA가 체결되어 있나요?

### 4.3 백업 및 복구

- 백업 주기는? (실시간, 일일, 주간?)
- RTO/RPO 목표는?
- DR 사이트가 있나요?

### 4.4 파일 시스템

- 파일 시스템도 병행 사용하나요?
- 어떤 데이터를 파일로, 어떤 데이터를 DB에 저장하나요?
- 클라우드 스토리지를 사용하나요? (S3, Azure Blob?)
- 파일 명명 규칙 및 디렉토리 구조가 있나요?

## 5. Dashboard - 프론트엔드 통합

### 5.1 데이터 접근

- Dashboard가 데이터베이스에 직접 연결되나요?
- REST API를 사용하나요? GraphQL?
- API 스펙 문서가 있나요?
- 실시간 업데이트가 필요한가요? (WebSocket, SSE?)

### 5.2 인증 및 권한

- 사용자 인증 방식은? (SSO, JWT?)
- 어떤 사용자 역할이 있나요? (임상의, 연구자, 관리자 등)
- MFA가 필요한가요?
- 세션 타임아웃 설정은?

### 5.3 기능 요구사항

- 기본 기능은? (리스트, 상세, 검색, 필터링, 통계, 리포트)
- Passive Engagement Tracking이 포함되나요?
- PostHog 통합 계획이 있나요?
- 어떤 이벤트를 추적하나요?
- 모바일/태블릿 지원이 필요한가요?

## 6. 시스템 통합 - 전체 연결

### 6.1 데이터 흐름

- 각 단계 간 데이터 전송 방식은?
  - API 호출? 메시지 큐? 직접 DB 접근?
- 이벤트 기반 아키텍처인가요?
- 처리 완료 알림은 어떻게 받나요?
- 동기 vs 비동기 처리 전략은?

### 6.2 모니터링

- 중앙 집중식 로깅이 있나요? (ELK, Splunk?)
- 메트릭 수집 도구는? (Prometheus, Grafana, Datadog?)
- Distributed tracing을 사용하나요?
- 알람 시스템 및 채널은? (이메일, Slack, PagerDuty?)
- Health check 엔드포인트가 있나요?

## 7. 보안 및 규정 준수

### 7.1 PHI 보호

- 어떤 데이터가 PHI인가요?
- De-identification 프로세스가 있나요?
- 18개 HIPAA identifiers를 체크하나요?
- PHI 접근이 모두 로깅되나요?

### 7.2 네트워크 보안

- 네트워크 세그멘테이션이 되어 있나요?
- 방화벽 규칙이 정의되어 있나요?
- VPN 접근이 필요한가요?
- IDS/IPS 시스템이 있나요?

### 7.3 어플리케이션 보안

- 입력 검증이 되어 있나요? (SQL Injection, XSS 방지)
- API rate limiting이 있나요?
- 시크릿 관리는? (환경 변수, Vault?)
- 의존성 스캔을 정기적으로 하나요?

## 8. 개발 및 배포

### 8.1 기술 스택

- 백엔드 언어/프레임워크는? (Python/FastAPI, Node.js/Express 등)
- 프론트엔드는? (React, Vue.js 등)
- 팀이 익숙한 기술이 있나요?
- ML/AI 프레임워크는? (PyTorch, TensorFlow, Hugging Face?)

### 8.2 개발 환경

- Git 저장소는 어디에? (GitHub, GitLab?)
- Branching 전략은? (Git Flow, GitHub Flow?)
- Code review 프로세스가 있나요?
- Linting/formatting 도구를 사용하나요?
- 테스트 커버리지 목표는?

### 8.3 CI/CD

- CI/CD 도구는? (GitHub Actions, GitLab CI, Jenkins?)
- 자동 배포가 되나요, 수동 승인이 필요한가요?
- 배포 전략은? (Rolling, Blue-green, Canary?)
- 몇 개의 환경이 있나요? (Dev, Staging, Prod)

### 8.4 Infrastructure as Code

- IaC를 사용하나요? (Terraform, CloudFormation?)
- 인프라 아키텍처 다이어그램이 있나요?
- State 관리는 어떻게 하나요?

### 8.5 배포 계획

- 단계별 배포 계획이 있나요?
- 어떤 순서로 배포하나요?
- 기존 데이터 마이그레이션이 필요한가요?
- UAT를 수행하나요?
- 롤백 계획이 있나요?

## 9. 협업 및 커뮤니케이션

### 9.1 팀 구조

- 팀 멤버 및 역할은?
  - Michael: 역할?
  - Ivan/Dongfang: 역할?
  - 임상 팀: 역할?
- 책임 분담이 명확한가요?

### 9.2 커뮤니케이션

- 정기 미팅이 있나요?
- 커뮤니케이션 도구는? (Slack, Teams?)
- 이슈 트래킹 도구는? (Jira, Linear, GitHub Issues?)
- 문서는 어디에 저장하나요? (Confluence, Notion, Wiki?)

## 10. 타임라인

- 전체 프로젝트 타임라인이 있나요?
- 주요 마일스톤은?
- MVP 범위는?
- Phase별 기능 구분이 있나요?

---

## 최우선 질문 (즉시 확인 필요)

1. **Raw transcripts 저장 위치 및 접근 방법**
2. **현재 데이터베이스 유무 및 종류**
3. **팀 역할 및 책임 분담**
4. **PHI 규정 준수 요구사항**
5. **사용할 기술 스택**
6. **프로젝트 타임라인 및 MVP 범위**

## Main questions

0. 테스트 용의 것들이 준비되어 있나? 예를 들어 fake data, server 등
1. Where should the REDCap be located in the diagram?​
2. 전체적으로 환자 관련 데이터, 의사 관련 데이터, AI에 의해 생성되는 데이터, 어디에 각각 저장되는지
3. AI model들의 각 input/output data
4. web app에서 어떤 저장소로 부터 어떠한 data를 가져오고 또는 어떤 저장소로 데이터를 저장하는지

### processed data를 csv로 저장하여 서버에 저장하는 방안은?

- CSV 파일은 암호화·접근통제·감사로그가 불가능한 평문 구조로, HIPAA(미국) 등에서 요구하는 보호조치를 충족하지 못해 가능성이 있어 위험한 방법. .

- This method constitutes a serious violation of HIPAA’s technical safeguard requirements, including 🔒 encryption, 🔐 access control, 🧾 audit logging, and 🧠 data integrity protection.

## 보안관련

1. **데이터 암호화**: 저장 및 전송 중 데이터 암호화가 이루어지고 있나요?
2. **접근 제어**: 데이터에 대한 접근 권한은 어떻게 관리되나요?
3. **감사 로그**: 데이터 접근 및 변경에 대한 감사 로그가 기록되나요?

- Redcap API를 사용하여 데이터 저장시 문제는?
-

## 아이디어

- 모든 데이터들을 일단 그냥 Fake로 만들어 prototype 버전의 전체 pipeline 및 webapp 구축은???

# PPT

- https://cedarssinai-my.sharepoint.com/:p:/g/personal/dongfang_xu_cshs_org/ESVT3cOytfNFnLXl3QaDHvUBNaGj78N89Y9hC3CXjqIrbg?e=okMnnR
