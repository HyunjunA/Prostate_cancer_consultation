# Component Tree + State Map

## 1. Component Hierarchy & View Routing

```mermaid
graph TD
    RootLayout["RootLayout (layout.tsx)"]
    PostHog["PostHogProvider"]
    Home["Home (page.tsx)"]

    RootLayout --> PostHog --> Home

    Home -->|"currentView = selection"| Selection["SelectionScreen"]
    Home -->|"currentView = doctor"| Doctor["PhysicianReportsModifiedV41Timothy"]
    Home -->|"currentView = patient<br/>visitType = first"| PatientFirst["PatientInitialVisitReportV33"]
    Home -->|"currentView = patient<br/>visitType = followup"| PatientFollowUp["PatientFollowUpReportV31Re"]
    Home -->|"isDevMode = true"| DevAPI["APITestDashboard"]
    Home --> Footer["DashboardFooter"]
    Home --> ThemeToggle["ThemeToggle"]

    style Home fill:#4f46e5,color:#fff
    style Doctor fill:#0891b2,color:#fff
    style PatientFirst fill:#059669,color:#fff
    style PatientFollowUp fill:#059669,color:#fff
    style Selection fill:#6b7280,color:#fff
```

## 2. Global State (Zustand Stores)

```mermaid
graph LR
    subgraph Zustand["Zustand Global Stores"]
        PID["usePatientId<br/>─────────<br/>patientId: string"]
        FID["useFileId<br/>─────────<br/>fileId: string"]
        DID["useDoctorId<br/>─────────<br/>doctorId: string"]
        Theme["useThemeStore<br/>─────────<br/>isDarkMode: boolean"]
        WinSize["useWindowSizeStore<br/>─────────<br/>width, height: number"]
        Filter["useFilterStore<br/>─────────<br/>region, age, gender"]
        Circle["useCircleIndexStore<br/>─────────<br/>index: number"]
        XAxis["useXAxisSelectionStore<br/>─────────<br/>selectedDateOnXaxis"]
        XDrag["useXAxisDragSelectionStore<br/>─────────<br/>startDate, endDate"]
    end

    URL["URL Params<br/>(fileid, patid, doctorid, visit)"] -->|init| PID
    URL -->|init| FID
    URL -->|init| DID
    LS["localStorage"] <-->|persist| PID
    LS <-->|persist| FID
    LS <-->|persist| DID
    LS <-->|persist| Circle

    style Zustand fill:#fef3c7,stroke:#f59e0b
    style URL fill:#e0e7ff,stroke:#6366f1
```

## 3. Doctor View — Component Tree & State

```mermaid
graph TD
    Doctor["PhysicianReportsModifiedV41Timothy<br/>─────────────────────<br/>LOCAL STATE:<br/>patients, selectedPatient<br/>selectedSpeaker, currentView<br/>selectedTopic, selectedSuggestion<br/>selectedSentenceIdx, newSentence<br/>showRewrite, search, scoreBand<br/>saveStatus, rescoring"]

    Doctor -->|"currentView = dashboard"| DashView["DashboardViewV2<br/>─────────<br/>Patient list + search<br/>Score trajectory LineChart<br/>Summary cards (Google Scholar style)"]
    Doctor -->|"currentView = grid"| GridView["GridView<br/>─────────<br/>Topics table with scores<br/>Sentence details<br/>Improvement suggestions"]
    Doctor -->|"currentView = detail"| DetailView["TopicDetailView<br/>─────────<br/>All-patient trajectory chart<br/>(current=red, others=gray)"]

    DetailView --> Scoring["ConsultationScoringV7Timothy7<br/>─────────<br/>Score display per class<br/>Rubric hover tooltips<br/>allRubricLevels prop"]
    DetailView --> Rewrite["Rewrite Panel<br/>─────────<br/>Toggle show/hide<br/>AI Rewrite generation<br/>Save & Score re-scoring"]
    DetailView --> History["HistoryModal<br/>─────────<br/>Revision history<br/>Score change trajectory"]

    DoctorHook["useDoctorData()<br/>─────────<br/>files, sentences<br/>rewrites*, rewriteHistory<br/>scoreAverage, scoreSummary<br/>classDistribution*<br/>aiRewrite, aiRewriteLoading<br/>improvementSuggestions*<br/>trajectoryData, rewriteStats<br/>loading, error"]

    DoctorHook -.->|provides data| Doctor

    style Doctor fill:#0891b2,color:#fff
    style DoctorHook fill:#ecfeff,stroke:#0891b2
    style DashView fill:#cffafe
    style GridView fill:#cffafe
    style DetailView fill:#cffafe
```

## 4. Patient First Visit — Component Tree & State

```mermaid
graph TD
    PFirst["PatientInitialVisitReportV33<br/>─────────────────────<br/>LOCAL STATE:<br/>consultationSummary: ClassSummary[]<br/>loading: boolean<br/>expandedTopics: Set<br/>ratingsProgress: Map"]

    PFirst --> TopicCards["Topic Summary Cards<br/>(per class: CP, LE, ED, IUS, IS)<br/>─────────<br/>AI summary text<br/>Star ratings (1-5)<br/>Collapsible evidence sentences"]

    PatientHook["usePatientData()<br/>─────────<br/>files, summaries*<br/>summaryDetail<br/>scoring*, responses*<br/>loading, error"]

    PatientHook -.->|provides data| PFirst

    PFirst -.->|"fetchSummaryDetail()"| API1["GET /api/patient/summaries/:file/:speaker"]
    PFirst -.->|"updateSingleClassScore()"| API2["PUT /api/patient/scoring"]

    style PFirst fill:#059669,color:#fff
    style PatientHook fill:#ecfdf5,stroke:#059669
    style TopicCards fill:#d1fae5
```

## 5. Patient Follow-Up — Survey Flow & State

```mermaid
graph TD
    PFollow["PatientFollowUpReportV31Re<br/>─────────────────────<br/>LOCAL STATE:<br/>currentStep: SurveyStep<br/>completedSteps: Set<br/>summaryData, apiLoading, apiError<br/>sdm/dcs/risk/satisfactionAnswers<br/>isSubmitting* (per survey)<br/>*Submitted (per survey)"]

    PFollow -->|"step = welcome"| Welcome["Welcome Screen"]
    PFollow -->|"step = sdm"| SDM["SDMSurvey"]
    PFollow -->|"step = dcs"| DCS["DecisionalConflictSurvey"]
    PFollow -->|"step = risk"| Risk["RiskPerceptionSurvey<br/>+ Collapsible AI summaries"]
    PFollow -->|"step = satisfaction"| Sat["PatientSatisfactionSurvey"]
    PFollow -->|"step = completion"| Done["Completion Screen"]

    Welcome --> SDM --> DCS --> Risk --> Sat --> Done

    PFollow -.->|"submitSurvey()"| SurveyAPI["POST /api/surveys/submit"]

    style PFollow fill:#059669,color:#fff
    style Welcome fill:#d1fae5
    style SDM fill:#d1fae5
    style DCS fill:#d1fae5
    style Risk fill:#d1fae5
    style Sat fill:#d1fae5
    style Done fill:#d1fae5
```

## 6. Data Flow — API ↔ Hooks ↔ Components

```mermaid
graph LR
    subgraph Backend["FastAPI Backend :8000"]
        DoctorAPI["/api/doctor/*<br/>files, sentences, rewrites<br/>scores, trajectory, ai-rewrite"]
        PatientAPI["/api/patient/*<br/>files, summaries, scoring"]
        SurveyAPI["/api/surveys/submit"]
    end

    subgraph Hooks["Custom Hooks (State Owners)"]
        UDD["useDoctorData()<br/>15+ useState vars"]
        UPD["usePatientData()<br/>8 useState vars"]
    end

    subgraph Components["UI Components"]
        PhysV41["PhysicianReports<br/>V41Timothy"]
        PatV33["PatientInitialVisit<br/>V33"]
        PatV31["PatientFollowUp<br/>V31Re"]
    end

    DoctorAPI <-->|fetch/mutate| UDD
    PatientAPI <-->|fetch/mutate| UPD
    SurveyAPI <-->|submit| PatV31

    UDD -->|data + methods| PhysV41
    UPD -->|data + methods| PatV33
    UPD -->|data + methods| PatV31

    subgraph Stores["Zustand (Cross-Component)"]
        IDs["patientId / fileId / doctorId"]
    end

    IDs -->|identity| PhysV41
    IDs -->|identity| PatV33
    IDs -->|identity| PatV31

    style Backend fill:#fef2f2,stroke:#ef4444
    style Hooks fill:#ecfeff,stroke:#0891b2
    style Components fill:#f0fdf4,stroke:#22c55e
    style Stores fill:#fef3c7,stroke:#f59e0b
```

## 7. Tracking System

```mermaid
graph TD
    Tracking["useTracking()"]
    Tracking --> Click["useClickPath()<br/>click sequences"]
    Tracking --> Scroll["useScrollDepth()<br/>scroll %"]
    Tracking --> Nav["useNavigationTracking()<br/>page transitions"]
    Tracking --> Cursor["useGlobalCursorProximity()<br/>element proximity"]

    Tracking -->|events| PostHog["PostHog (HIPAA compliant)<br/>─────────<br/>autocapture: off<br/>maskAllInputs: true<br/>dev mode: opted out"]

    Events["Event Types:<br/>page_view, component_view<br/>button_click, navigation<br/>scroll_depth, time_on_component<br/>session_start/end<br/>cursor_proximity"]

    Tracking -.-> Events

    style Tracking fill:#7c3aed,color:#fff
    style PostHog fill:#ede9fe,stroke:#7c3aed
```

## 8. State Ownership Summary

| Layer | Mechanism | Purpose | Persistence |
|-------|-----------|---------|-------------|
| URL Params | `useSearchParams()` | Initial routing (fileid, patid, doctorid, visit) | URL |
| Zustand Stores | `create()` | Cross-component identity & settings | localStorage |
| Custom Hooks | `useState()` x many | API data, loading/error states | Memory only |
| Component State | `useState()` | UI toggles, form inputs, selections | Memory only |
| PostHog | External service | User behavior analytics | Cloud |

## 9. Active Component Versions

| Role | Active Version | File |
|------|---------------|------|
| Doctor Dashboard | `PhysicianReportsModifiedV41Timothy` | `components/PhysicianReportsModifiedV41Timothy.tsx` |
| Patient First Visit | `PatientInitialVisitReportV33` | `components/PatientInitialVisitReportV33.tsx` |
| Patient Follow-Up | `PatientFollowUpReportV31Re` | `components/PatientFollowUpReportV31Re.tsx` |
| Scoring UI | `ConsultationScoringV7Timothy7` | `components/ConsultationScoringV7Timothy7.tsx` |
