# Prostate Cancer Consultation Dashboard

A research platform that analyzes physician-patient prostate cancer consultations to improve risk communication and shared decision-making.

Developed at Cedars-Sinai Medical Center as part of the R01 Prostate Cancer Communication Study.

---

## Quick Start — Native Deployment (recommended)

PostgreSQL / Redis / Backend run natively on the host; only NLP-classifiers and the webapp run in Docker.

```bash
bash scripts/setup-native-mac.sh                      # one-time native deps
cp app/Backend/.env.native.example app/Backend/.env.native   # then edit secrets
bash scripts/init-db-native.sh                        # one-time DB bootstrap
bash scripts/run-native.sh                            # start everything
```

After startup:
- Dashboard:  http://localhost:3001
- API docs:   http://localhost:8000/docs

**Full walkthrough**: [`docs/setup/DEPLOYMENT_NATIVE.md`](docs/setup/DEPLOYMENT_NATIVE.md) — covers prerequisites, the NLP OCI archive, the standalone pipeline runner (`scripts/run-pipeline-standalone.py`), DB verification helpers, and troubleshooting.

For the alternate full-Docker mode, see [`docs/setup/DEPLOYMENT_DOCKER.md`](docs/setup/DEPLOYMENT_DOCKER.md).

---

## Documentation

All detailed documentation lives under [`docs/`](docs/).

| Area | Folder |
|---|---|
| Setup / deployment | [`docs/setup/`](docs/setup/) |
| Architecture, ERD, DB schema | [`docs/architecture/`](docs/architecture/) |
| Feature specs (patient, doctor, REDCap) | [`docs/features/`](docs/features/) |
| ML / NLP pipeline | [`docs/ml-pipeline/`](docs/ml-pipeline/) |
| Security & PHI compliance | [`docs/security/`](docs/security/) |
| Top-level index | [`docs/INDEX.md`](docs/INDEX.md) |

---

## License

Part of an active research study at Cedars-Sinai Medical Center. Contact the research team for access and usage terms.
