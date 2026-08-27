# 2026-07-02 — Action items

> Real collaborator names are replaced with role labels per repository convention:
> **the manager**, **the transcript / de-identification owner**, **the study team**.

---

## Action items

- Create and store documentation that clearly explains the purpose of every database
  table.
- Produce a PDF, generated from those documents, that accurately reflects the current
  database and the related pipeline.
- Investigate whether any database tables are no longer needed, and deprecate them so
  they are not used in production.
- Verify that all user activity is recorded accurately on the admin page.
- Verify that all data are stored correctly in REDCap.
- Consider adding a page that shows REDCap synchronisation status.
- Tell the team that the **"What to Expect"** text on the survey page is placeholder
  copy and ask for the final wording. Also identify every other dashboard where
  instruction text has not been supplied, mark clearly that the current text is a
  placeholder, and request the final content for each location.
- Using the meeting notes, determine whether the **risk perception** survey was
  separated deliberately or should be merged.
  - **Finding (2026-07-02)**: the first-visit responses were **deliberately
    separated** into `patient_first_visit_responses` —
    `dev_docs/V37_First_Visit_Persistence_Design.md` §1.2 / §3.1: the 14 cognition
    questions are **experimental-arm only**, and a shared table would fill
    control-arm rows with permanent NULLs (extending the shared tables was explicitly
    **rejected**). "Combine" was **raised but never decided** —
    `daily_control_logs/2026-06-18_TASKS.md:14` ("combining the first survey and the
    follow-up???"). → **On hold pending confirmation from the team and the PI.**
- Confirm whether the **transcript owner** can add the transcript completion timestamp
  to the filename.
- Re-confirm from the meeting notes why only one treatment option is selected for the
  three categories.
- Review the sentence-scoring pipeline API call to make sure the correct parameters
  are sent.

---

- Complete today's assigned action items (items 16–22 and related tasks) as time
  allows, giving priority to the upcoming production deployment.
- Schedule a two-hour walkthrough/review session with **the manager** once there is
  enough progress (it does not have to be Thursday or Friday).
- Share implementation progress and use it to schedule that walkthrough.
