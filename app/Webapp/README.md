# COMPASS — Webapp

> Next.js (React) frontend for the COMPASS.  
> Displays physician feedback reports, patient-friendly summaries, and NLP analysis results.

---

## ⛔ NOT FOR PRODUCTION — RESEARCH & TESTING USE ONLY

> **THIS IS A RESEARCH PROTOTYPE, NOT A PRODUCTION-GRADE APPLICATION.**
>
> This software is built and maintained **solely for internal testing and academic research** within the R01 Prostate Cancer Communication Study at Cedars-Sinai Medical Center. It is provided **as-is, for evaluation purposes only.**
>
> **⛔ DO NOT deploy or use this software in any production, clinical, diagnostic, or patient-facing care setting — under any circumstances.**
>
> It has **not** undergone the security hardening, data-privacy review, clinical validation, or regulatory clearance (e.g., HIPAA, FDA, IRB-approved clinical deployment) that production or clinical use would require. All outputs — NLP probabilities, AI-generated summaries, risk-communication text, and scores — are **experimental and unvalidated**, and **MUST NOT be used to inform, guide, or replace any real clinical decision, diagnosis, treatment, or patient care.**
>
> Use is restricted to **authorized research-team members operating in a controlled, non-clinical test environment.** Any other use is unauthorized and at the user's sole risk.

---

## Key Features

- **Physician Reports**: Consultation scoring with NLP topic classification results
- **Patient Reports**: Initial visit and follow-up report views
- **Selection Screen**: Patient/doctor ID routing via URL params
- **Admin Tracking**: Usage analytics dashboard
- **API Test Dashboard**: Dev-mode API testing interface
- **Theme Toggle**: Light/dark mode support

## Tech Stack

- **Framework**: Next.js with TypeScript
- **State Management**: Zustand (global stores for patientId, fileId, doctorId, theme, etc.)
- **Styling**: Tailwind CSS
- **Charts**: D3.js
- **Testing**: Jest + Playwright (e2e)

## Getting Started

Install dependencies and run the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Docker

```bash
docker-compose up -d        # Start
docker-compose down          # Stop
```

## Project Structure

```
src/
├── app/          # Next.js app router
├── api/          # API client functions
├── components/   # React components (reports, charts, surveys, UI)
├── hooks/        # Custom React hooks
├── stores/       # Zustand global state stores
├── config/       # Configuration
├── tracking/     # Analytics/tracking utilities
├── lib/          # Shared libraries
└── utils/        # Utility functions
```

## View Routing

| `currentView` | Component |
|----------------|-----------|
| `selection` | `SelectionScreen` |
| `doctor` | `PhysicianReportsModifiedV41Timothy` |
| `patient` (first) | `PatientInitialVisitReportV33` |
| `patient` (followup) | `PatientFollowUpReportV31Re` |

See [COMPONENT_STATE_MAP.md](COMPONENT_STATE_MAP.md) for the full component tree and Zustand store mapping.
