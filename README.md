# Prostate Cancer Consultation Dashboard

A research platform that analyzes physician-patient prostate cancer consultations to improve the quality of risk communication and shared decision-making.

Developed at Cedars-Sinai Medical Center as part of the R01 Prostate Cancer Communication Study.

---

## What This System Does

After a prostate cancer consultation, the conversation is transcribed. This system processes the transcript to answer two questions:

1. **For the patient** -- "What did my doctor tell me about my cancer risk and treatment options?"
2. **For the physician** -- "How well did I communicate key risk information across each clinical domain?"

The system identifies clinically relevant sentences using NLP classification (developed by Michael), then uses an AI pipeline (developed by Guillermo) to score the physician's communication specificity and generate patient-friendly summaries of the visit.

---

## Three User Interfaces

**Patient First Visit** -- Patients review plain-language summaries of what their doctor discussed about cancer prognosis, life expectancy, treatment side effects, and other domains. They can also view the relevant conversation excerpts from their visit.

**Patient Follow-Up** -- Patients complete validated clinical surveys (Decisional Conflict Scale, Shared Decision Making, Risk Perception, Satisfaction) to measure decision quality after their consultation.

**Physician Dashboard** -- Physicians review their communication quality scores across patients and domains, track their performance over time, and practice AI-assisted sentence rewriting to improve how they explain risk information.

---

## How It Works

```
Consultation transcript (.xlsx)
        |
        v
NLP Classification (5 Random Forest models)
  -- Classifies each sentence into clinical domains
  -- Selects top sentences per domain
        |
        v
AI Pipeline (Azure OpenAI GPT-4o)
  -- Scores communication specificity (0-5)
  -- Extracts actual risk numbers from the conversation
  -- Generates patient-friendly summaries
        |
        v
Web Dashboard (Patient + Physician views)
```

Five clinical domains are analyzed:
- Cancer Prognosis
- Life Expectancy
- Erectile Dysfunction
- Urinary Incontinence
- Irritative Urinary Symptoms

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js, React, TypeScript |
| Backend | FastAPI (Python), SQLAlchemy |
| NLP Models | R plumber API, Random Forest classifiers |
| AI Pipeline | Azure OpenAI GPT-4o |
| Database | PostgreSQL |
| Cache | Redis |
| Infrastructure | Docker Compose, Nginx, Git LFS |

---

## Deployment

See **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** for step-by-step instructions.

```bash
git clone https://github.com/HyunjunA/Prostate_cancer_consultation.git
git clone -b dev/jun https://github.com/jifa83/AI_physician_patient_communication.git
cd Prostate_cancer_consultation
cp app/Backend/.env.example app/Backend/.env
./run_all.sh
```

After deployment:
- Dashboard: http://localhost:3001
- API Documentation: http://localhost:8000/docs

---

## Documentation

| Document | Description |
|----------|-------------|
| [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) | How to deploy the system |
| [ERD v3](app/Backend/patient_doctor_interface_erd_v3_en.md) | Database schema with examples |
| [docs/](docs/) | Architecture, security, and setup guides |

---

## License

This project is part of an active research study at Cedars-Sinai Medical Center. Contact the research team for access and usage terms.
