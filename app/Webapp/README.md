# Prostate Cancer Consultation Dashboard — Webapp

> Next.js (React) frontend for the Prostate Cancer Consultation Dashboard.  
> Displays physician feedback reports, patient-friendly summaries, and NLP analysis results.

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
