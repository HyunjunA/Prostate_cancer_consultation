# 🧩 Concurrent REDCap API Access Management
**Cedars-Sinai Technical Guidance**

---

## 🧭 Overview
This document explains how to safely manage **concurrent (multi-user)** access to a single **REDCap project** via the **REDCap API**, including key technical, operational, and security considerations.

Multiple users and systems can simultaneously connect to the same REDCap instance via API — but concurrency, especially during write operations, introduces **data integrity and security risks** that must be mitigated.

---

##  1. Is Concurrent Access Possible?
Yes.  
REDCap supports **multi-user concurrent API connections**. Each request is handled independently using RESTful HTTP sessions.

- Each user is authenticated via a unique **API Token**.
- Multiple tokens can access the same project simultaneously.
- Parallel **read (GET)** operations are safe.
- Parallel **write (POST/PUT)** operations require caution.

---

##  2. Primary Risk: Concurrent Write Conflicts
REDCap’s API is **not transactional**, meaning it does not fully support **ACID-level concurrency control**.

### 🔸 Example Scenario
1. User A updates record 001 → field “age” = 45  
2. At the same time, User B updates record 001 → field “gender” = Male  
3. Both requests succeed, but the second write may **overwrite** the first, resulting in data loss.

Because REDCap processes each request independently, **last-write-wins** behavior can cause record corruption if two users modify overlapping records.

---

##  3. Recommended Concurrency Management Strategies

| Strategy | Description | Benefit |
|-----------|--------------|----------|
| **1. Record-Level Locking** | Implement a “lock” flag field before modifying a record. Prevent other users from editing until lock is released. | Prevents concurrent overwrites. |
| **2. Full Record Update** | Retrieve the entire record, modify locally, then re-upload the complete record (not partial fields). | Reduces field-level conflicts. |
| **3. Timestamp Validation** | Compare the `last_modified` or custom timestamp before saving. Abort write if mismatch detected. | Detects concurrent changes. |
| **4. Write Queue System** | Queue write operations sequentially (e.g., via Celery, RabbitMQ). | Serializes conflicting writes. |
| **5. Audit Logging** | Log all API calls (record ID, user, timestamp, request type). | Enables traceability & rollback. |
| **6. Token Separation** | Assign unique API tokens per user/process. | Enhances security & accountability. |

---

## 🧠 4. Internal Behavior of REDCap
- REDCap runs on **MySQL (InnoDB)** but **does not expose full DB transaction control** through its API.  
- The official REDCap documentation notes:  
  > “The API is not transactional — concurrent write operations to the same record should be managed by the client application.” *(Vanderbilt REDCap API Docs, v14)*

Therefore, **data consistency must be enforced externally**, at the client level.

---

## 🔒 5. Security Best Practices for Multi-User API Access

| Risk | Description | Mitigation |
|------|--------------|-------------|
| **Token Sharing** | Multiple people using the same API token → no audit trail. | Issue unique tokens per user or process. |
| **Unauthorized Access** | API keys exposed in scripts, notebooks, or code repos. | Store tokens in encrypted secrets vault (Azure Key Vault, AWS Secrets Manager). |
| **PHI Exposure in Logs** | PHI values may appear in debug logs or CSV exports. | Mask or encrypt sensitive fields in logs. |
| **Rate Limiting** | Too many parallel API requests can cause timeouts or throttling. | Apply rate limiting (e.g., 3–5 req/sec per token). |

---

## 🧩 6. Summary Table

| Operation Type | Safe for Concurrency? | Notes |
|----------------|------------------------|--------|
| **Read (GET)** |  Yes | Minimal risk; read-only. |
| **Write (POST/PUT)** |  Yes, but manage concurrency | Risk of overwriting data; use locks or timestamps. |
| **Delete (DELETE)** |  Caution | Should be serialized; no undo. |
| **Token Reuse** |  Not Recommended | Use unique tokens per user. |

---

## 📘 7. Key Takeaways
> - Concurrent **reads** via REDCap API are safe.  
> - Concurrent **writes** can lead to data loss without locking or timestamp validation.  
> - REDCap API **does not provide ACID-level transaction control**.  
> - Always use **unique API tokens**, enable **audit logs**, and implement **record-level locking** or **write queuing** for safety.  

---

## 🧾 Reference
- Vanderbilt University. *REDCap API Documentation v14.*  
- Cedars-Sinai Enterprise Information Services, *AI & Data Security Guidelines (2024).*  
- HIPAA §164.312(b): *Audit Control Requirements.*

---
