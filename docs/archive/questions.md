# 🧭 System Integration Technical Questions

_(Cedars-Sinai Dashboard Web App — Full Stack Development Checklist)_

---

## 1. Raw Transcripts – Data Source

### 1.1 Data Collection & Format

- Where are raw transcripts generated?
- Real-time streaming or batch upload?
- File format? (JSON, TXT, CSV, XML?)
- File size and daily volume?
- Are audio files stored alongside text?
- Is metadata included (timestamps, speaker tags, etc.)?

### 1.2 Data Storage

- Where are raw transcripts stored?
  - Local filesystem, NAS, or cloud (S3, Azure Blob)?
  - Database storage?
- Using REDCap?
- Integrated with Epic EHR?
- Retention and deletion policy?

### 1.3 Data Access & Permissions

- Who has access to raw transcripts?
- Authentication? (Active Directory, SSO, OAuth)
- RBAC implemented?
- Is PHI access separately approved?
- Audit logging in place?
- API-based access? How is the API key managed?

---

## 2. Data Processing Server

### 2.1 Architecture

- Existing or new infrastructure?
- On-prem or cloud (AWS, Azure, GCP)?
- Compute requirements (CPU, RAM, GPU)?
- Using Docker containers?
- Kubernetes orchestration needed?

### 2.2 AI Models

#### Sentence Classifier

- **Input:** Where/how are transcripts retrieved (API or local file)?
- **Output:** Where is classification data stored (local, DB, or REDCap API)?
  - If REDCap API used, is it HIPAA compliant?

#### AI Scoring

- **Input:** Where/how are inputs fetched?
- **Output:** Where is scoring data saved (file or DB)?
  - If uploaded to REDCap, how is data encryption and transfer secured?

#### AI Summary (Rewriter)

- **Input:** How is model input retrieved?
- **Output:** Where are summaries stored? (local file, DB, or API upload)

### 2.3 Pipeline

- Sequential workflow for three models?
- Orchestrator tool used? (Airflow, Prefect)
- Message queue? (RabbitMQ, Kafka)
- Error retry mechanism?
- How is job status tracked?
- Average processing time per transcript?

---

## 3. Processed Data

### 3.1 Schema

- Where is processed data stored?
- Separate DB or same as raw data?
- Schema definition:
  - Transcript ID
  - Classification results
  - Scores (overall and per category)
  - Summaries/rewrite text
  - Metadata
  - Sentence-level analysis results

### 3.2 Storage

- Stored in DB or file system?
- Indexing strategy?
- Backup frequency?
- Who manages the processed data server?

---

## 4. Database / File System

### 4.1 Database

- Existing DB? Type? (PostgreSQL, MySQL, MongoDB)
- Need new schema? Migration tools?
- Backup/replica configuration?

### 4.2 HIPAA Compliance

- Encryption at rest?
- TLS/SSL for transit?
- Key management (Azure Key Vault, AWS KMS)?
- Access logs?
- Signed BAA?

### 4.3 File System

- Using both DB and file storage?
- What data goes where?
- Cloud storage used (S3, Azure Blob)?
- Naming convention and directory structure?

---

## 5. Dashboard Integration

### 5.1 Data Access

- Direct DB connection or REST/GraphQL API?
- Real-time updates? (WebSocket, SSE)
- API spec documentation available?

### 5.2 Authentication & Roles

- Auth mechanism (SSO, JWT)?
- Role types (Clinician, Researcher, Admin)?
- MFA required?
- Session timeout settings?

### 5.3 Functional Requirements

- Core features: list, detail view, search, filters, analytics
- Passive Engagement Tracking?
- PostHog or telemetry integration?
- Mobile/tablet support?

---

## 6. System Integration

### 6.1 Data Flow

- Inter-system communication (API, queue, DB)?
- Event-driven?
- Completion notifications?
- Sync vs async?

### 6.2 Monitoring

- Centralized logging (ELK, Splunk)?
- Metrics (Prometheus, Grafana)?
- Tracing tools?
- Alerting channels (Slack, PagerDuty)?
- Health check endpoints?

---

## 7. Security & Compliance

### 7.1 PHI Protection

- What data qualifies as PHI?
- De-identification pipeline?
- 18 HIPAA identifiers validated?
- Full audit logs for PHI access?

### 7.2 Network Security

- Network segmentation?
- Firewall rules?
- VPN-only access?
- IDS/IPS enabled?

### 7.3 App Security

- Input validation (XSS, SQLi)?
- API rate limiting?
- Secret management (Vault)?
- Dependency scanning schedule?

---

## 8. Development & Deployment

### 8.1 Tech Stack

- Backend (Python/FastAPI, Node/Express)?
- Frontend (React, Vue)?
- ML/AI stack (PyTorch, TensorFlow, HuggingFace)?

### 8.2 CI/CD

- Tool (GitHub Actions, Jenkins)?
- Auto deploy or manual approval?
- Deployment strategy (Rolling, Blue-Green)?
- Environments (Dev, Staging, Prod)?

### 8.3 Infrastructure as Code

- Terraform, CloudFormation used?
- Diagram of infrastructure available?

---

## 9. Team & Communication

### 9.1 Roles

- Michael: ?
- Ivan/Dongfang: ?
- Clinical Team: ?
- Responsibilities clearly defined?

### 9.2 Communication

- Weekly meetings?
- Tools (Slack, Teams)?
- Issue tracking (Jira, GitHub)?
- Documentation (Confluence, Notion)?

---

## 10. Timeline

- Overall project timeline?
- Key milestones?
- MVP scope?
- Feature breakdown by phase?

---

## 🔎 Critical Immediate Questions

1. Where and how are raw transcripts stored and accessed?
2. What database exists, or must be built?
3. Who owns each component (roles/responsibilities)?
4. PHI compliance requirements and constraints?
5. Tech stack to be finalized?
6. Project timeline & MVP boundaries?

---

## ⚠️ Security Note: CSV Storage of Processed Data

> ❌ **CSV files are plaintext and lack encryption, access control, and audit trails**, violating HIPAA technical safeguard requirements — including:
>
> - 🔒 Encryption
> - 🔐 Access control
> - 🧾 Audit logging
> - 🧠 Data integrity protection

---

## 💡 Prototype Suggestion

- Consider using **fake PHI data** to test full pipeline and dashboard integration before production deployment.
- This allows compliance testing without real patient data.

---

## 🔗 Reference

PPT Link: [System Diagram & Architecture](https://cedarssinai-my.sharepoint.com/:p:/g/personal/dongfang_xu_cshs_org/ESVT3cOytfNFnLXl3QaDHvUBNaGj78N89Y9hC3CXjqIrbg?e=okMnnR)

---
