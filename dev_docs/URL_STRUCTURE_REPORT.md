# Report: Dashboard URL / Query-String Structure (current state)

Verified against the running app (`http://localhost:3001`) and the live code in
`app/Webapp/src/app/page.tsx`. Examples use a real de-identified patient file,
`63514_06262026.csv` (patient `63514`, date `06262026`).

## 1. Routing model

The dashboard is a **single page** (`page.tsx`); the **query string decides the
view**. There are no per-view route files for the main flows. Five query params
are read (`page.tsx:184-289`):

| Param | Meaning | Example value |
|-------|---------|---------------|
| `fileid` | Source filename (full) | `63514_06262026.csv` |
| `patid` | Patient speaker label | `Patient_63514_06262026` |
| `doctorid` | Doctor selector (today: transcript speaker; `auto` = first speaker) | `auto` |
| `visit` | Patient view type | `first` / `followup` / `combined` |
| `mode` | First-visit entry modifier | `survey` |

## 2. View-decision logic (`page.tsx:204-241`)

- `doctorid` present → **Doctor dashboard**
- else `patid` present → **Patient view** (`visit` selects first / followup / combined)
- else → **Landing** (patient selection screen)

## 3. Exact URL per view

| View | URL |
|------|-----|
| Landing (patient picker) | `http://localhost:3001/` |
| Doctor dashboard | `http://localhost:3001/?doctorid=auto` |
| Patient first visit — report | `http://localhost:3001/?fileid=63514_06262026.csv&patid=Patient_63514_06262026&visit=first` |
| Patient first visit — survey | `http://localhost:3001/?fileid=63514_06262026.csv&patid=Patient_63514_06262026&visit=first&mode=survey` |
| Patient follow-up | `http://localhost:3001/?fileid=63514_06262026.csv&patid=Patient_63514_06262026&visit=followup` |
| Combined (first survey → follow-up) | `http://localhost:3001/?fileid=63514_06262026.csv&patid=Patient_63514_06262026&visit=combined&mode=survey` |

## 4. How the URL is assembled (`handlePatientSelect`, `page.tsx:342-354`)

```
stem   = file with .xlsx/.csv removed        → "63514_06262026"
patid  = "Patient_" + stem                    → "Patient_63514_06262026"
fileid = file (unchanged)                     → "63514_06262026.csv"
visit  = "first" | "followup" | "combined"
mode   = "survey"   (only when survey=true, or visit === "combined")
→ /?<params>
```

Doctor link is a fixed literal: `href="/?doctorid=auto"` (`page.tsx:377`).

## 5. Findings

### 5a. Redundant params ("otherwise super dirty" — a collaborator's note)
`fileid` and `patid` carry **the same information twice**:

```
fileid = 63514_06262026.csv        ← patient id + date
patid  = Patient_63514_06262026    ← same id + date, only a "Patient_" prefix added
```

`patid` is fully derivable from `fileid` (and vice-versa). Carrying both — plus
the full filename/prefix — is the redundancy flagged for cleanup.

**Proposed minimization** (follow-on, not yet built): keep only the identifying
parts and reconstruct the filename server/client-side, e.g.

```
before:  /?fileid=63514_06262026.csv&patid=Patient_63514_06262026&visit=first
after:   /?pid=63514&date=06262026&visit=first
```

### 5b. `doctorid` does not scope by physician yet
Only `?doctorid=auto` is actually linked; it auto-detects the first transcript
*speaker*. There is **no per-doctor filtering** — every view returns all patients
globally. The planned Doctor ID work repurposes `doctorid` as a real physician
scoping key (`?doctorid=doctor1` → only that doctor's patients).

## 6. Relationship to planned work (see `DOCTOR_ID_PLAN.md`)

| Item | Status |
|------|--------|
| Doctor ID scoping — `?doctorid=<id>` filters to one doctor's data | **In the Doctor ID plan (this phase)** |
| Query-string minimization — drop `fileid`/`patid` redundancy | Follow-on (separate phase) |
| Link (URL) generation — build the URLs in §3 into a mapping CSV | Follow-on (after Doctor ID ships) |

## 7. Verification basis

- App live at `http://localhost:3001` (webapp container healthy); backend `:18000`
  returns the patient list `["13511_06262026.csv","13535_06262026.csv","13547_06262026.csv","63514_06262026.csv"]`.
- Params and assembly quoted from `app/Webapp/src/app/page.tsx` (lines 184-289 read, 337-355 build, 204-241 view decision, 377 doctor link).
