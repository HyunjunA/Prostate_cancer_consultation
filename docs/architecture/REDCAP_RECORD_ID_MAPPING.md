# REDCap record_id — record_id is the study SID

How a survey submission is attributed to a REDCap record. Korean mirror:
`REDCAP_RECORD_ID_MAPPING_KR.md`. Source of truth: `app/Backend/redcap_mapping.py`, `deid.py`.

## The scheme — `record_id == SID`
A consultation transcript carries a **study SID** (e.g. `SID_22`). The REDCap `record_id`
for that patient **is** the SID: the coordinator names each REDCap record after the study SID
when registering the patient. A submission is therefore attributed straight to the record
whose `record_id` equals the SID — there is no separate id and no mapping table.

## Flow at sync time
```
Coordinator (REDCap):
  register patient → create a record whose record_id is the study SID (e.g. "SID_22")
        ▼
Backend (runtime):
  1. survey submitted → un-hash the de-identified speaker → SID
     (deid.unhash_patient_sid, e.g. "Patient_13511_… → SID_22")
  2. record_id = resolve_record_id(SID)      ← returns the SID unchanged
  3. if record_id is None (speaker had no parseable SID) → DO NOT push; store the row as
     pending (redcap_synced=false, redcap_error="No study SID for speaker …")
  4. else push the answers to REDCap under that record_id; store it in redcap_record_id
```
- The DB `sid` column and `redcap_record_id` both hold `SID_<n>` (they are the same value).
- REDCap records are pre-created as empty SID-keyed shells:
  `scripts/seed_redcap_record_ids.py` (bulk, from `data/input` filenames) or
  `scripts/create_redcap_records.py` (a one-off list of record_ids). Both import
  `record_id`-only rows with `overwriteBehavior=normal` + `forceAutoNumber=false`, so REDCap
  keeps the SID verbatim and existing fields are never cleared.

## Notes
- `unhash_patient_sid` derives the SID from the hashed speaker; the record_id is that SID.
- The integrity checker (`integrity_checks.py` C2, `/admin/tracking/data-integrity`) reconciles
  each synced row against its stored `redcap_record_id`.

## Key files
- `app/Backend/redcap_mapping.py` — `resolve_record_id` (returns the SID).
- `app/Backend/deid.py` — `unhash_patient_sid` (speaker → SID).
- `app/Backend/routes_surveys.py`, `routes_patient.py` — resolve at sync time.
- `app/Backend/scripts/seed_redcap_record_ids.py` / `create_redcap_records.py` — pre-create
  the empty SID-keyed records.
