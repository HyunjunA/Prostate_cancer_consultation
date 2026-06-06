# Issue + Fix Plan — First-Visit "Factors" Multi-Select Saves Only One Value to REDCap

**Status:** Root cause identified. **Code change (Step 2) is implemented** — the
sync now emits every selected factor as a REDCap checkbox option. **Blocked on the
REDCap schema change (Step 1) before this can be deployed:** the target fields are
still `radio`, which rejects the `field___<code>` import format. **DB is already
correct — only the REDCap mirror is affected.**

---

## Symptom

On the patient first-visit page, the per-domain question

> "Based on the AI summary and/or what you remember from your consultation, what
> factors were considered by your doctor in making this estimate?
> **(select all that apply)**"

is a **multi-select** (checkbox) question. When the patient selects several
factors, **only one** of them ends up in REDCap.

Affected domains: **le, ed, inc, ius** (cp does not have a factors question).

---

## Where the data is preserved vs. collapsed

| Stage | Location | factors handling | OK? |
|---|---|---|---|
| 1. Frontend UI | `app/Webapp/src/components/PatientInitialVisitReportV40.tsx` | `string[]` state, accumulates every selection (`[...edFactors, factor]`) | ✅ all kept |
| 2. Backend receive | `app/Backend/routes_patient.py:127` | `factors: Optional[List[str]]` — full list received | ✅ all kept |
| 3. DB persistence | `app/Backend/models.py:224` (`factors`/`value` JSONB) + `routes_patient.py:1326` (`record.value = a.value`) | full list stored as JSONB array | ✅ **all kept** |
| 4. REDCap sync | `app/Backend/routes_patient.py:1237-1242` (`_fv_answer_to_redcap`) | **only `value[0]`** mapped to a single field | ❌ **collapses to one** |

**The database already stores every selected factor.** The loss happens only when
mirroring to REDCap.

---

## Root cause (exact)

`app/Backend/routes_patient.py:1237-1242`:

```python
if field == "factors":
    # UI multi-select -> single REDCap radio: send the first selection.
    if not isinstance(value, list) or not value:
        return None
    code = _FV_FACTOR_CODES.get(question_id, {}).get(value[0])   # <-- value[0]: first only
    return (redcap_field, code) if code else None
```

The mapping target fields (`routes_patient.py:1135-1150`):

```
le_factors  -> le_2_rp_v2
ed_factors  -> ed_3_rp_v2
inc_factors -> ui_3_rp_v2
ius_factors -> il_3_rp_v2
```

These REDCap fields are **single-choice radio buttons** ("most influential
factor"), so the code intentionally sends only the first selection
(`value[0]`). This is a **type mismatch**, not an accidental bug:

- Dashboard UI question type: **multi-select / checkbox** ("select all that apply").
- REDCap field type: **single radio** (one value only).

### Live REDCap verification (Metadata Export API)

Confirmed against the live project (`https://iredcap.csmc.edu/api/`):

```
le_2_rp_v2  ->  type=radio
ed_3_rp_v2  ->  type=radio
ui_3_rp_v2  ->  type=radio
il_3_rp_v2  ->  type=radio
```

A REDCap **radio** field physically stores one value. Multiple selections cannot
be saved until the field is a **checkbox** (which REDCap stores as
`fieldname___<code> = 1`, one column per selected option).

> **Shared-field caveat:** these same `*_rp_v2` fields are also written by the
> `risk_perception_2` survey path (`app/Backend/routes_surveys.py:180-195`), where
> they are used as single radios. Converting them to checkbox affects that path
> too (see Option A below).

---

## Fix plan

The DB side needs no change. The REDCap side cannot store multiple values until a
REDCap **checkbox** field exists. Pick one REDCap approach, then apply the
matching code change.

### Step 1 — REDCap schema (must happen first; done in REDCap, not in code)

**Option A — convert the existing `*_rp_v2` fields radio → checkbox**
- In REDCap Online Designer (instrument `post_risk_perception_2`), change each of
  `le_2_rp_v2`, `ed_3_rp_v2`, `ui_3_rp_v2`, `il_3_rp_v2` Field Type from
  *Multiple Choice – Radio Buttons* to *Checkboxes (Multiple Answers)* (keep the
  same choices).
- ⚠️ Side effects: (1) existing radio responses do **not** auto-migrate to the
  `___<code>` columns — back up first; (2) the `risk_perception_2` write path
  (`routes_surveys.py`) must also switch to checkbox format; (3) production
  projects require Draft Mode → Submit Changes for Review.

**Option B — add new dedicated checkbox fields (recommended)**
- Add new REDCap checkbox fields, e.g. `le_factors_cb`, `ed_factors_cb`,
  `inc_factors_cb`, `ius_factors_cb` (Field Type = Checkboxes, same factor
  choices).
- Keep the existing `*_rp_v2` radios untouched for `risk_perception_2`.
- No data migration, no impact on the other survey.

### Step 2 — code change ✅ IMPLEMENTED (deploy only after Step 1)

> **Done** in `routes_patient.py`: `_fv_answer_to_redcap` now returns a
> `List[Tuple[str, str]]` and a factors answer emits one `{field}___{code} = "1"`
> pair per selected factor; `_sync_first_visit_answers_to_redcap` iterates them
> into the REDCap record. Unit + integration tests updated (38 passing).
> **Not deployable until Step 1 (REDCap fields → checkbox) is done** — a radio
> field rejects the `field___<code>` format and the import would fail.

Change `_fv_answer_to_redcap` so a factors answer returns **one
`{field}___{code} = "1"` entry per selected factor**, and the caller
(`_sync_first_visit_answers_to_redcap`, `routes_patient.py:1259-1263`) merges all
of them into the REDCap record. Sketch:

```python
# _FV_QUESTION_TO_REDCAP_FIELD points at the CHECKBOX field name from Step 1
if field == "factors":
    if not isinstance(value, list) or not value:
        return None
    codes = [_FV_FACTOR_CODES.get(question_id, {}).get(v) for v in value]
    # REDCap checkbox import format: one field per selected option set to "1"
    return [(f"{redcap_field}___{c}", "1") for c in codes if c]   # returns a LIST now
```

The caller currently expects a single `(field, value)` tuple; it must be updated
to accept a list of pairs and add each to the outgoing `fields` dict.

> ⚠️ Do **not** ship the Step 2 code while the REDCap field is still `radio` —
> sending `field___code` to a radio field makes the REDCap import reject the
> record, which would break even the single-value write that works today.

### Step 3 — verify

- Re-run the Metadata Export API to confirm `type=checkbox` (see below).
- Submit a multi-factor answer; confirm REDCap shows every selected factor and the
  DB still has the full list.
- Validate the `risk_perception_2` path is unaffected (Option B) or correctly
  updated (Option A).

---

## How to inspect REDCap field types (Metadata Export API)

Read-only; safe. From `app/Backend/`:

```bash
URL=$(grep -E "^REDCAP_API_URL=" .env | cut -d= -f2-)
TOK=$(grep -E "^REDCAP_API_TOKEN=" .env | cut -d= -f2-)

curl -s -X POST "$URL" \
  --data-urlencode "token=$TOK" \
  --data "content=metadata&format=json" \
  --data "fields[0]=le_2_rp_v2" --data "fields[1]=ed_3_rp_v2" \
  --data "fields[2]=ui_3_rp_v2" --data "fields[3]=il_3_rp_v2" \
  | python3 -c "import sys,json; [print(f['field_name'],'->',f['field_type']) for f in json.load(sys.stdin)]"
```

Key request params: `content=metadata` (Data Dictionary), `format=json|csv`,
optional `fields[]` filter (omit for all fields), `forms[]` filter by instrument.
Key response keys per field: `field_name`, `field_type` (`radio`/`checkbox`/`text`
/…), `form_name`, `field_label`, `select_choices_or_calculations`.

---

## References

- Root-cause line: `app/Backend/routes_patient.py:1241` (`value[0]`)
- factors mapping + codes: `app/Backend/routes_patient.py:1135-1213`
- REDCap sync caller: `app/Backend/routes_patient.py:1247-1295`
- First-visit answer upsert (DB, stores full list): `app/Backend/routes_patient.py:1298-1329`
- Shared `*_rp_v2` usage (other survey): `app/Backend/routes_surveys.py:180-195`
- Frontend factors state: `app/Webapp/src/components/PatientInitialVisitReportV40.tsx`
- Related: [`Frontend_REDCap_Field_Mapping.md`](Frontend_REDCap_Field_Mapping.md),
  [`REDCap_Instruments_Fields_Documentation.md`](REDCap_Instruments_Fields_Documentation.md)
