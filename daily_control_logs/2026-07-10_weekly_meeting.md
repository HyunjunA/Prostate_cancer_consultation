# 2026-07-10 (Fri) — weekly meeting notes and follow-up

> Real names are replaced with role labels per `CLAUDE.md` rule 4:
> **the developer** (me), **the manager**, **the study coordinator**,
> **the NLP team**, **the AI pipeline author**, **the de-identification tool author**,
> **another study team member**, **the lab lead**, **the senior investigator**.

## ✅ Status as of 2026-07-14

> The original meeting notes below are unchanged; this block summarises progress, and
> the checkboxes further down are updated to match.

### ✅ Implemented and verified in this session (2026-07-14)

- **One-way patient UI navigation** — new active `PatientFollowUpReportV38.tsx`: the
  last question of a section shows "Submit & continue to next section" with automatic
  saving, and the back control is gone.
- **The two-level version is preserved** — `PatientFollowUpReportV31Re.tsx` is
  untouched (V38 is the new copy).
- **Risk perception normalised** — `PatientInitialVisitReportV41.tsx` uses the same
  "Submit & continue…" pattern in the combined flow.
- **De-identification prefixes generalised, digits-only parsing** —
  `deidentify_transcript_simple.py` gained the allow-list
  `STUDY_PREFIXES=("SID","DLC")` with fail-closed behaviour, and the mapping CSV's
  `real_sid` preserves the original prefix.
- **De-identification run log** — `data/deid_run_<timestamp>.log` records per-file
  results, SKIPs, and a summary (an extra requirement not in the meeting notes).
- **REDCap record ID alignment** — the production branch was removed, leaving the
  single scheme `record_id == SID`.

### ☑️ Already complete before this session (per the logs and June entries)

- **Survey DB consolidated into one table** — functionally complete (cosmetic tweaks
  on request).
- **Doctor ID hashing** — already implemented in the de-identification script.
- **Five-star rating and the frontend refresh bug** — logged as handled/confirmed.
  ⚠️ However, dropping the `patient_report_page_behavior.rating` column was **not**
  done in this session → **needs checking**.

### ⬜ Outstanding

- 🔴 Settle the side-effect treatment category (one versus three) — waiting on the
  team and on the AI pipeline author's documentation.
- Integrate hashing into the de-identification tool author's process, then hand off to
  the study coordinator.
- 🟡 End-to-end test (empty the DB → REDCap round trip).
- Admin upload page (drag and drop).
- 🟢 Intro walkthrough video (the manager).

---

## 🔴 Priority 1 — settle the side-effect treatment category (the meeting's core open question)

The question: should a side effect show **one** treatment category (surgery) or **all
three** (surgery / radiation / ablation)? Not yet officially settled.

- Why it is a problem: the developer's existing GitHub note said "use surgery only",
  but the AI pipeline's actual output (the deformat/reformat sentences) includes every
  treatment category, so the two do not match. The developer said "I think I
  misunderstood", and the manager provisionally agreed — but nothing was finalised.
- To do:
  - [ ] Find the AI pipeline author's pipeline documentation or video, to see **which
    treatments are used and why**. The video may have been deleted, but a transcript
    or a shared document (SharePoint/OneDrive) probably survives. (A "March 10"
    meeting was suspected but not found → the developer will re-check the meeting
    notes.)
  - [ ] Wait for and chase the team's reply — a confirmation message was sent with no
    response.
  - [ ] Decide how to handle the stochastic output — the pipeline runs GPT-4 at
    temperature ≈ 0.3, so it is non-deterministic: the same side effect comes back as
    surgery, as a different category, or as missing (undetected) between runs.
    - Real case: one patient's ED appeared twice — once as surgery, once as missing,
      both scored 2 → which one to display as representative is genuinely unclear.
  - ⚠️ Concern: a separate summary and sentence per category **triples** the
    information, especially for erectile dysfunction and urinary incontinence.

---

## 🟠 Priority 2 — development work (the developer)

- [x] Simplify patient UI navigation (for older patients) — ✅ 2026-07-14 (V38)
  - Background: most patients are in their 50s to 70s, so a two-level navigation
    (moving between sections and between questions) risks confusing "next section"
    with "next question".
  - Approach: remove the second level — one Next flow. On a section's last question
    the button becomes "Submit & continue to next section", which saves automatically
    and advances. One-way, no back.
  - [x] Normalise the risk perception section to the same pattern for a consistent
    flow. — ✅ 2026-07-14
  - [x] Keep the two-level version as a copy rather than deleting it (it suits younger
    users better). — ✅ 2026-07-14 (V31Re preserved)
- [x] Finish the survey DB consolidation — now a single survey table. REDCap mapping:
  (i) shared decision making + decision conflict (16 questions) → one REDCap form,
  (ii) risk perception → a separate form, (iii) patient satisfaction. — ☑️ functionally
  complete
- [ ] Remove the five-star rating field — the 5-point rating in patient behaviour is
  unused → delete it and update the schema.
- [ ] Fix the frontend refresh bug — the DB save is fine but the screen does not update
  (not a backend problem).

---

## 🔑 Priority 3 — de-identification code integration (detail)

Goal: the developer understands the de-identification tool author's process, then
incorporates the hashing code into it as a single flow → ultimately the **study
coordinator runs it on her own computer**, rather than the developer or manager doing
it every time.

- [x] Hash only the numeric (sequential) part of the ID — "we wanna hash just the ID…
  just the sequential part" — ☑️ already implemented
- [x] Strip the SID prefix and any letters before hashing — ✅ 2026-07-14 (SID/DLC
  generalised)
  - Background: the coordinator prefixes filenames with SID (study ID, e.g. SID22) to
    distinguish study ID from patient ID, so the prefix comes off before hashing.
- [x] Align with the REDCap record ID — REDCap record IDs are plain numbers (1, 2, 3…,
  auto-assigned if unset), so the hashing has to line up with those plain numeric IDs.
  — ✅ 2026-07-14 (unified as `record_id == SID`)
- [ ] Integrate hashing into the de-identification tool author's process, then hand off
  to the coordinator.
- ⚠️ Reason: **no PHI may sit on the server**, so de-identification must happen inside
  the clinical-side process.

---

## 🟡 Priority 4 — end-to-end test (goal for the next meeting)

- [ ] Procedure: empty the DB → process the input files → pretend to be two patients
  and two doctors → confirm the round trip through to REDCap storage.
- [ ] ID alignment test: create the patients in REDCap first (getting IDs, e.g. 4, 5,
  6, 7) → craft input files with the matching SID numbers → process → confirm they
  land on the right REDCap records. (The point is to show the coordinator and the team
  that the link genuinely works.)
- [ ] If it succeeds, widen to a joint test with the coordinator and the rest of the
  team.
- [ ] Review how files reach the server — SFTP is awkward because of the jump server →
  hence the admin upload page (drag and drop) idea.

---

## 🟢 Priority 5 — intro video (mainly the manager)

- [ ] The manager: instead of the existing video (far too long, poor quality), record a
  one-minute screen-share walkthrough with narration and propose it to the senior
  investigator and the team.
- [ ] Change requests go through the lab lead — organisational dynamics make it hard to
  push back directly on a senior clinician.

---

# The meeting itself — 2026-07-10 (Fri), in detail

Flow: the developer shared their screen to (1) demo the consolidated survey DB, then
(2) discovered the treatment-category issue, (3) discussed UI and video while the
pipeline was running, and (4) moved on to the end-to-end test and de-identification
plan. The next meeting was moved from Tuesday to Wednesday (7/15) because of a
scheduling conflict, which coincides with the NLP team's return.

---

## 🔴 1. Side-effect treatment category — "one versus all three" (core open question)

**How it came up**

- The developer showed the deformat (reformat) sentences on the dashboard — the
  summary sentences produced by the AI pipeline. Each side effect carries a treatment
  category field.
- Manager: "but you told me we only use surgery?"
- Developer: "that's what my GitHub note says, but looking at these reformat sentences
  they contain every category, not one. If one is correct I'll do that, but the
  sentences themselves carry everything."
- There are three treatments — surgery / radiation / ablation therapy — and both
  recalled three. "So why are we showing only one?"
- Developer: "the 'surgery only' was probably me mis-noting something the lab lead
  mentioned. It doesn't look right. I messaged the team, including the manager, to
  confirm — no reply yet."
- Conclusion: the developer re-checked the AI pipeline and agreed the manager was
  right (all categories), but this is not officially settled.

**Why it cannot simply be changed — two obstacles**

1. **The triplication problem**: a separate summary and sentence per category triples
   the information. The developer expects the worst effect on erectile dysfunction and
   urinary incontinence; the manager pointed out it affects essentially everything
   including life expectancy, since prognosis differs by whether surgery happens.
2. **Stochastic output**: the pipeline uses the GPT-4 API at temperature ≈ 0.3, so it
   is non-deterministic — the same item comes back as surgery, as another category, or
   as missing between runs.

- Concrete case: one patient had two ED entries — one saying sexual function improves
  after surgery, one describing actual ED risk. One was categorised as surgery, the
  other as missing, both scored 2. "Both exist, so which do we show?" is a genuinely
  open question.
- "Missing" means the AI did not identify a category for that ED item.

**To do**

- [ ] Find the AI pipeline author's documentation. Manager: "that's what he was working
  on right at the end, and he explained in that meeting which ones to use and why. The
  video may be gone, but there will be a transcript or a document — he wrote a great
  many. The answer is probably already there, so go and look."
  - Likely stored on SharePoint rather than OneDrive, though videos are deleted after
    a period.
  - Developer: will re-check the meeting notes afterwards. A "March 10" meeting was
    suspected but not found in the calendar (that day held a different meeting) → the
    date is unconfirmed and the search continues.
- [ ] Chase the unanswered message.

---

## 🟠 2. Survey DB consolidation and REDCap mapping

**Current state (confirmed in the demo)**

- The DB now uses a single survey table. Developer: "cosmetic changes are easy on
  request."
- REDCap mapping:

| Survey section | Questions | → REDCap |
|---|---|---|
| welcome | — | (informational) |
| shared decision making (SDM) | a few | → one REDCap form |
| decision conflict | 16 | (mapped to the same form as SDM) |
| risk perception | 4 | → a separate REDCap form |
| patient satisfaction | — | → patient satisfaction |

- So SDM + decision conflict share one REDCap form, and risk perception has its own.
- ⚠️ Risk perception navigates differently, which is what triggered issue 3 below.

**To do**

- [x] Cosmetic adjustments on request (the functional consolidation is done). —
  ☑️ complete

---

## 🟡 3. Simplifying patient UI navigation (for older patients)

**The problem (the manager's reasoning)**

- The population is mostly patients in their 50s, 60s, and 70s. "People like my
  parents — they know computers a little, but they get confused."
- The current navigation has two levels at once: question movement (next/back) and
  section movement (continue to next section).
- Risk: answering the first question and pressing "next section", believing the whole
  section is done. "Which one do I press — continue to next section, or next?"
- Trigger: the risk perception section navigates differently, which made the problem
  obvious.

**Agreed design**

- [x] Two levels → one flow: next, next, next from the first question, and on the
  section's last question (roughly 14 in the first section) the button changes to
  "submit & continue to next section", which saves automatically and advances. No back,
  no section jumping. — ✅ 2026-07-14 (V38)
- [x] Normalise risk perception to the same pattern → "then it all flows as one". —
  ✅ 2026-07-14
- [x] Keep the two-level version as a copy rather than deleting it — "for younger users
  the existing one is better; the step display is informative. Don't lose it, make a
  copy." — ✅ 2026-07-14 (V31Re preserved)
- Difficulty: the developer said it is easy to test and not a large job; the manager
  agreed.

---

## 🟢 4. Reconsidering the intro video

**Problems with the existing video (the manager was blunt)**

- The video presented at a meeting the developer attended is "really long and really
  bad".
- Content: it repeats the why and what already covered in the consent form. The frame
  is a close-up of a clinician with no information in it.
- Production: the script was rewritten about ten times over several months and grew far
  too long. It was produced with AI by someone whose expertise lies elsewhere — "not
  her fault, she is very good at her own job". The original request came from the
  senior investigator.

**Alternative (the manager)**

- A one-minute walkthrough: "screen share plus me narrating" — thank you for taking
  part → this section asks about X, N questions → press next for the following section
  → pay attention to the summary → here is what you see when you finish.
- Purpose: not persuasion, but showing what to expect, so that patients in their 60s
  and 70s are more likely to complete it correctly.
- The navigation simplification would be proposed alongside the video.

**Organisational dynamics (why this cannot be raised directly)**

- "It is difficult to tell a physician they are wrong" — seniority and deference.
  "Saying 'this isn't good' about two months of work can read as rude."
- → "The lab lead can do it, I can't. I ask the lab lead to pass the change request on."

**To do**

- [ ] The manager (in the office on Tuesday if possible): pose as a patient, record the
  screen, and produce a prototype walkthrough → propose to the senior investigator and
  the team that something this simple is what is needed.
- [ ] Route the change request through the lab lead.

---

## 🔑 5. De-identification integration and the end-to-end test

### (A) De-identification / hashing

- The coordinator prefixes filenames with SID (study ID, e.g. SID22) to distinguish
  study ID from patient ID.
- The developer's plan:
  - [x] Strip the prefix (SID/DLC) and parse only the digits. — ✅ 2026-07-14
    (allow-list + fail-closed)
  - [x] Handle the doctor ID the same way. — ☑️ already implemented
  - [x] Hash only the sequential (numeric) part of the ID; the SID prefix itself does not
    matter. — ✅ 2026-07-14 (the prefix survives only as a label in the mapping CSV)
- REDCap record IDs are plain numbers (1, 2, 3…, auto-assigned if unset), so the
  hashing has to line up with those.
- ⚠️ Weight warning: processing the input files needs the AI pipeline author's BERT-class
  model, which is larger than the files themselves — "put what he sent in place and see
  how it runs".
- How doctor IDs get assigned is undecided → "I'll propose something and get another
  team member's opinion."
- Ultimate goal, from the manager: "I want to understand the de-identification process
  and integrate your hashing into it, so it can go on the coordinator's computer and she
  does it herself rather than us doing it every time." No PHI on the server.

### (B) End-to-end test procedure

- [ ] Empty the DB — the developer actually dropped the DB and demonstrated re-running
  the pipeline (the NLP classifier had died and had to be restarted).
- [ ] Pretend to be two patients and two doctors → process the files → confirm the round
  trip through to REDCap.
- [ ] ID alignment demo: create the patients in REDCap first (IDs e.g. 3, 4, 5, 7) →
  craft input files with matching SID numbers → process → confirm they land on the
  right REDCap patients → "so the coordinator and the team can see with their own eyes
  that everything is connected".
- [ ] On success, run the end-to-end test jointly with the team. The manager's goal:
  "let's close this chapter this week."

### (C) Getting files onto the server

- Problem: server access goes through a jump server, which makes SFTP awkward.
- [x] Idea: an admin upload page (drag and drop) in the dashboard so the coordinator can
  upload files directly — ✅ implemented, verified, and committed 2026-07-15 (SFTP
  bypassed)
  - `/admin/upload` drag-and-drop page plus the backend endpoint
    (`POST /api/admin/upload-transcript`, superuser). **Dropping an original (SID/DLC)
    file makes the server de-identify it automatically** — the original is deleted
    immediately so no PHI remains, and the real↔hash mapping is displayed on screen
    without being stored server-side. Files that are already de-identified are stored as
    they are. Re-uploading the same name overwrites (a timestamp is impossible because
    the filename is parsed).
  - **This closes the "get the file onto the server" gap**: the upload lands in
    `PIPELINE_DROP_DIR` (`data/input_deid`), where the resident watcher with
    `INPUT_DIR=data/input_deid` picks it up on its 5-second poll → NLP + AI → DB →
    archive. The whole path from upload through server de-identification and pipeline
    processing to the DB runs unattended.
  - E2E verified: two original files (SID 22 and 24) uploaded → processed automatically
    → confirmed in the DB (2 analyses; patient_summary / llm / sentence / nlp all
    populated). The deployment documents (DEPLOYMENT_3PHASE .md/.txt) reflect the new
    flow.
  - Commits: dashboard `435a835` (upload feature and docs), AI repo `86ffeb2`
    (watch `INPUT_DIR` override).
  - ⚠️ PHI trade-off: server-side de-identification was chosen over browser-side, so the
    original briefly reaches the server before being deleted.

---

## 📅 Schedule

- Next meeting: Wednesday 7/15 (moved from Tuesday); the NLP team returns 7/15.
- If our side succeeds, a meeting with the wider team follows on the Thursday or
  Friday — though the team appears to be on leave and has not replied.

---

## 🎯 Top priorities this week

1. Find the AI pipeline author's documentation → settle the treatment category (other
   decisions hang off it).
2. Implement the navigation simplification (easy) and finish the de-identification
   hashing → empty the DB and run the end-to-end round trip → bring the team in on
   success.
3. The manager: prototype the walkthrough video (proposed via the lab lead).

> Note: removing the five-star rating field (an unused field/table, bringing the schema
> up to date) and the frontend refresh bug ("saved correctly in the DB, the screen just
> doesn't update — a refresh shows it, so not the backend") are already handled and
> confirmed.
