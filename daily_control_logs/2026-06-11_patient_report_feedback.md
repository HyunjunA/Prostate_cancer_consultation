# 2026-06-11 — Patient report feedback (reviewer)

> Verbatim feedback from the reviewer on the patient reports / AI pipeline output.

Hi team,

These patient reports look great!  Very exciting to see this in action. 

A few observations on the patient reports: 
In situations where the scores are “0” (meaning the doctor did not discuss the topic), we should not have any sentences illustrating the estimate.  These sentences are unrelated to the topic; that’s why the AI output notes that it wasn’t discussed. 
In some situations, the AI output for the treatment-specific side effects did not note which treatment the estimate was referring to.  I’m not sure if there needs to be a tweak to the prompt to ensure that the treatment type is mentioned in each sentence for the side effects domains.   For the AI pipeline validation, we’re going to be running 50 consults through the system, so we’ll see how often this situation comes up.  I realize you don’t want to make a lot of edits at this point but I think we need to see if this threat to the viability of the system is worth addressing.
I think in the output we might need to indicate somehow that “surgery” means “radical prostatectomy”.  HIFU is technically also surgery. 

I think we need to address #1 above.  #2 and #3 we can discuss whether it’s worth it.  

Best,
— reviewer

---

## Things to check / address (from the email above)

- [x] **#1 — DONE (UI level).** When a domain score is `0` (the doctor did not discuss the topic), the patient report must **not** include any sentence illustrating the estimate. **Resolved in the patient report UI** (`app/Webapp/src/components/PatientInitialVisitReportV40.tsx`): when `ai_score === 0`, the "View relevant sentences from your visit" toggle is disabled (greyed, non-clickable) and replaced with the note *"This topic was not discussed in your visit."* — the example sentences are never rendered. Applied **per sub-domain** (a treatment with score 0 is disabled independently) and for single-domain cards. The AI summary already states it wasn't discussed (reformat text e.g. *"Your doctor did not mention the risk of …"*), so it stays visible. Scope agreed with the requester: **suppressing the sentences in the patient-facing report is sufficient.** Note: the underlying pipeline (selection/reformat) still stores `source_sentence`/`source_context` on score-0 rows — not changed here; can be revisited during the 50-consult validation if a data-level cleanup is wanted.
- [ ] **#2 — Discuss (worth it?).** For the **treatment-specific side-effect domains** (ED, continence, irritative urinary symptoms), the AI output sometimes does **not** say **which treatment** the estimate refers to. → Consider a **prompt tweak** so each side-effect sentence names the treatment type. Observe how often this comes up during the **50-consult AI pipeline validation** before deciding whether to change anything.
- [ ] **#3 — Discuss (worth it?).** In the output, indicate that **"surgery" means "radical prostatectomy"** (HIFU is technically also surgery). → Decide whether/how to disambiguate the treatment label.

**Priority:** #1 is required → **DONE (UI level, 2026-06-11)**. #2 and #3 are open for discussion on whether they're worth addressing now (observe during the 50-consult validation).
