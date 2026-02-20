# ⚠️ PHI Data + Azure AI API Usage — Compliance & Security Guidelines

## 🧭 Overview
This document summarizes all compliance and security cautions when handling **PHI (Protected Health Information)** using **Azure AI APIs** within Cedars-Sinai environments, based on the **Artificial Intelligence (AI) Compliance Policy (Effective 2024-09-05)** and **HIPAA regulations**.

---

## 🔹 1. Business Associate Agreement (BAA) Requirement
- HIPAA §164.502(e) mandates that PHI can only be shared with external services if a **Business Associate Agreement (BAA)** is executed.
- A signed **Cedars-Sinai ↔ Microsoft BAA** is **mandatory** before transmitting any PHI to Azure AI.
- Using a public Azure OpenAI endpoint (`api.openai.com`) without BAA = **direct HIPAA violation**.

---

## 🔹 2. Use HIPAA-Covered Region & In-Scope Services
- Azure AI services must operate only within **U.S. HIPAA-covered regions** (e.g., *East US*, *West US 2*).
- Transmitting PHI to non-HIPAA regions or general-purpose cloud endpoints violates Cedars-Sinai’s **data residency** and **privacy** requirements.

---

## 🔹 3. Data Encryption & Access Control
- HIPAA §164.312(a)(2)(iv) requires **encryption both at rest and in transit** (AES-256 & TLS 1.2+).
- CSV or plaintext logs storing PHI constitute a direct violation.
- Enforce **Role-Based Access Control (RBAC)** on all Azure AI resources to restrict user-level access.

---

## 🔹 4. AI System Evaluation Committee Approval
- Cedars-Sinai AI Policy §V.B.3 requires that any **Third-Party AI System** (including Azure AI) be **evaluated and approved** by the **AI System Evaluation Committee** prior to deployment.
- Using Azure AI for PHI processing without this approval breaches internal compliance.

---

## 🔹 5. Disable Data Logging & Model Training
- Azure AI APIs may store request/response logs temporarily.
- Explicitly disable:  
  - `data logging = off`  
  - `training = none`
- If not disabled, PHI could be stored on Microsoft servers → **Cedars-Sinai & HIPAA retention violation**.

---

## 🔹 6. Minimum Necessary Data Principle
- HIPAA’s “Minimum Necessary Standard” requires sending only essential PHI.
- Do **not** send entire transcripts containing names, dates, or identifiers.
- Implement **de-identification** or **masking** before transmission.

---

## 🔹 7. Audit Logging & Monitoring
- HIPAA §164.312(b) mandates an **audit trail** for all PHI access or modification.
- Internal logging must capture every API call (input/output metadata).  
- Relying solely on Azure’s system logs is insufficient.

---

## 🔹 8. Data Retention & Disposal
- Cedars-Sinai AI Policy: PHI retention must be **justified and documented**.
- If Azure retains PHI data post-processing, document the **retention reason, duration, and destruction process**.

---

## 🔹 9. CSV Storage Strictly Prohibited
- CSV files are **plaintext, unencrypted, and lack access control**.
- Violates HIPAA technical safeguards and Cedars-Sinai data protection standards.
- Use **encrypted databases or HIPAA-compliant storage (e.g., Azure SQL, S3-HIPAA)** instead.

---

## 🔹 10. Potential Risks & Consequences

| Category | Impact |
|-----------|---------|
| **Legal** | HIPAA Civil Penalties up to $1.5M per violation; HHS audit/investigation |
| **Institutional** | Cedars-Sinai Compliance or AI Council intervention; disciplinary review |
| **Research (IRB)** | Suspension or revocation of IRB-approved studies |
| **Operational** | Data breach, irrecoverable PHI exposure, system shutdowns |

---

## ✅ Recommended Actions Summary

| Step | Required Action |
|------|------------------|
| 1️⃣ | Verify BAA between Cedars-Sinai and Microsoft applies to your Azure tenant |
| 2️⃣ | Ensure AI resource is deployed in a HIPAA-covered U.S. region |
| 3️⃣ | Encrypt data (AES-256 / TLS 1.2+) and enforce strict RBAC |
| 4️⃣ | Obtain AI System Evaluation Committee approval before PHI use |
| 5️⃣ | Disable Azure data logging and training options |
| 6️⃣ | De-identify or mask PHI before transmission |
| 7️⃣ | Maintain internal audit logs for all API requests |
| 8️⃣ | Document PHI retention and deletion policy |
| 9️⃣ | Avoid CSV/flat file PHI storage |
| 🔟 | Conduct periodic risk assessments and compliance reviews |

---

## 📘 Summary
> **Using Azure AI APIs with PHI requires:**  
> - A signed BAA with Microsoft,  
> - HIPAA-covered configuration,  
> - Encryption, audit logging, and access control,  
> - Internal Cedars-Sinai AI Committee approval, and  
> - Full disabling of data logging/training.  
>  
> Without these controls, the setup violates both HIPAA and Cedars-Sinai AI Policy, exposing the organization to severe regulatory and legal risks.

---
