# De-identification flow analysis — understanding the full requirement (2026-07-16)

> Names are replaced with role labels per repository convention: **the manager**,
> **the study coordinator**, **the AI pipeline author**. Transcript excerpts are
> replaced with placeholders — no PHI appears in this document.

# 1. The requirement, precisely

> (1) Get familiar with the de-identification tool that was sent (PHI_Removal) →
> (2) **merge our hashing into it** so there is one tool → (3) train the coordinator to
> run it **on her own computer, before uploading**
>
> Purpose: **no PHI reaches the server at all**, and the developer stops doing this by
> hand every time.

Original wording:

> "I sent you the de-identification tool, if you have a chance, would you please get
> familiar with it? We will add the hashing there, and train [the coordinator] on how
> to use it before uploading the transcripts"

---

# 2. The full flow, from the coordinator's point of view

```
[coordinator's PC — clinical side]
 1. original "SID 22_doc2.xlsx"  (identifier in the filename, PHI in the body)
 2. run one tool
      remove PHI from the body → "Dr. [Name], on [Date]"
      AES hashing              → filename SID 22 → ZUXVVNRB…
 3. two outputs:
      (a) ZUXVVNRB…_6MIU…_07152026.csv   ← clean file
      (b) deid_mapping.csv                ← real_sid ↔ hash, plus patient/doctor links
                                             ⚠️ never uploaded; stays on her PC

[upload]
 4. only (a) is dropped into /admin/upload
      → already de-identified → the "store as is" path (already exists and works)
      → drop folder → watch → NLP + AI → DB     (the server does no de-identification)

[patient survey]
 5. the coordinator sends the patient the link from (b)
    (?f=ZUXVVNRB…_6MIU…_07152026)
 6. the patient submits → speaker = "Patient_ZUXVVNRB…_6MIU…_07152026"

[REDCap]
 7. the server decodes the hash with DEID_KEY → "SID_22"
 8. record_id == SID → pushed to REDCap record SID_22   ✅ verified 2026-07-16
```

---

# 3. What changes and what does not

| Item | Change |
|---|---|
| **PHI in the transcript body** | ❌ none → ✅ removed **(the key new capability)** |
| **Where de-identification happens** | server → **the coordinator's PC** |
| **Original PHI reaching the server** | yes → **no** |
| **Upload path** | path 2 (server de-identification) → **path 1 (store as is)** — already exists |
| **REDCap linkage** | ✅ **unchanged** — the server restores SID_22 from the hash with DEID_KEY, so it does not matter where de-identification runs |
| **Pipeline code** | ✅ unchanged |

**Answer on REDCap**: it keeps working, with one precondition — **the coordinator's PC
and the server must share the same `DEID_KEY`**. She locks with it, and the server
unlocks with it to restore SID_22 and attach the data to the REDCap record.

> Note: the server holding the key is not a policy violation — the server only ever
> knows `SID_22`, a research pseudonym. The mapping from **SID_22 to a real patient
> name** lives only in REDCap and on the clinical side.

---

# 4. ⚠️ Open questions for the manager

1. **Is everyone aware that PHI leaves for Azure?**
   PHI_Removal stage 2 **sends the original PHI-bearing sentences to Azure OpenAI**.
   Running it on the coordinator's PC changes nothing here — "runs on the clinical
   side" **does not mean** "PHI never leaves". The BAA and abuse monitoring (30-day
   retention by default) need checking. **← the first question to ask.**
2. **⛔ `gpt-5.4` is not deployed → a re-run is mandatory (confirmed by measurement on
   2026-07-16)**
   Testing with gpt-4o as a substitute today showed **real quality problems**:
   - **False negative**: in one file, a `"my regular guy, Dr. [Name], on the 25th"`
     construction had only the date removed, **leaving the name in place** — while the
     same string was caught in another file. LLM non-determinism.
   - **False positive**: `"at 12 months"` → `[Date]`, deleting a clinical follow-up plan.
   → **Request the gpt-5.4 deployment and re-run every file.** Until then the outputs in
   `data/input_phi_removal/` are **test artefacts and must not be uploaded.**
3. **How is `DEID_KEY` delivered to, stored on, and rotated for the coordinator's PC?**
4. **Who owns `deid_mapping.csv`** — what if it is lost? (Not fatal, since the server can
   restore from the key.)
5. **Is deployment realistic?** Her PC would need Python, torch (1–2 GB), a 438 MB model,
   and an Azure key. One-click packaging is required.
6. **Remove path 2 (server-side de-identification), or keep it as a fallback?**

---

# 5. Summary

The flow is understood and **REDCap is unaffected**. The real obstacles are
**"we send PHI to Azure in order to remove PHI"** and **deploying this to a
non-technical user's PC**. Those two are the questions for the manager.

---

## Appendix — what each stage does inside PHI_Removal

### Stage 1 — BERT (local)

**"Select generously the lines that look suspicious"**

- Computes one probability per line; flags anything above 0.005
- Measured: **123 lines → 16** pass (13%)
- **Gives no span** — only "this line looks suspicious"
- No PHI leaves, ~11 seconds, free

### Stage 2 — LLM (Azure)

**"Read those 16 lines closely and pick out the actual PHI characters"**

- Only the flagged lines are sent (⚠️ verbatim)
- Judges whether it is really PHI, and returns **which characters** and **what kind**
- Measured: a "Dr. [Name], on [Date]" construction → Name; Date. Ordinary conversation
  is rejected
- **Does not modify the text** — it only reports spans

### Why two stages

> Sending all 123 lines to an expensive LLM is wasteful → **filter 87% with a cheap
> local model and send only the 16.**

### What each cannot do alone

- **Stage 1**: does not know where the PHI is → cannot redact on its own
- **Stage 2**: does not modify text → **separate substitution code is needed** to apply
  the spans (this is the part we build)

**In one line**: stage 1 is the highlighter (marks generously), stage 2 is the reviewer
(points precisely at the real ones) → **nobody actually erases anything yet.**
