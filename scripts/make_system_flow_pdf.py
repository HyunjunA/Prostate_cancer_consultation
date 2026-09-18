"""
COMPASS System Flow PDF
Generates docs/architecture/COMPASS_SYSTEM_FLOW.pdf
Run: .venv/bin/python scripts/make_system_flow_pdf.py
"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ── Font ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(SCRIPT_DIR, "..")
FONT_PATH = os.path.join(REPO, "_fonts", "NotoSansKR.ttf")
pdfmetrics.registerFont(TTFont("F", FONT_PATH))

OUT = os.path.join(REPO, "docs", "architecture", "COMPASS_SYSTEM_FLOW.pdf")
W, H = A4
CW = W - 4 * cm  # usable content width

# ── Color palette ─────────────────────────────────────────────────────────────
C = {
    "navy":    colors.HexColor("#1a3a5c"),
    "white":   colors.white,
    "blue_l":  colors.HexColor("#dce8f5"),
    "blue_d":  colors.HexColor("#2d5f8a"),
    "green_l": colors.HexColor("#eafaf1"),
    "green_d": colors.HexColor("#1e8449"),
    "orange_l":colors.HexColor("#fdf2e9"),
    "orange_d":colors.HexColor("#d35400"),
    "red_l":   colors.HexColor("#fdedec"),
    "red_d":   colors.HexColor("#c0392b"),
    "grey_l":  colors.HexColor("#f8f9fa"),
    "grey_d":  colors.HexColor("#6c757d"),
    "yellow_l":colors.HexColor("#fef9e7"),
    "yellow_d":colors.HexColor("#b7950b"),
    "grid":    colors.HexColor("#c0d0e0"),
    "light":   colors.HexColor("#f5f8fb"),
}

# ── Style helpers ─────────────────────────────────────────────────────────────
def sty(size=9, color=None, align=TA_LEFT, bold=False):
    return ParagraphStyle("s", fontName="F", fontSize=size,
                          textColor=color or C["navy"],
                          alignment=align, leading=size*1.5, wordWrap="CJK")

T  = sty(22, C["navy"], TA_CENTER)
H1 = sty(14, C["navy"])
H2 = sty(11, C["blue_d"])
BD = sty(9)
SM = sty(8, C["grey_d"])
CE = sty(9, align=TA_CENTER)
WH = sty(9, C["white"], TA_CENTER)

def P(text, style=None): return Paragraph(text, style or BD)

# ── Flow-diagram primitives ───────────────────────────────────────────────────
def node(text, fill=None, stroke=None, width=None, size=9):
    fill   = fill   or C["blue_l"]
    stroke = stroke or C["blue_d"]
    width  = width  or CW * 0.62
    st = sty(size, C["navy"], TA_CENTER)
    t = Table([[P(text, st)]], colWidths=[width])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), fill),
        ("BOX",           (0,0),(-1,-1), 1.4, stroke),
        ("TOPPADDING",    (0,0),(-1,-1), 6),
        ("BOTTOMPADDING", (0,0),(-1,-1), 6),
        ("LEFTPADDING",   (0,0),(-1,-1), 6),
        ("RIGHTPADDING",  (0,0),(-1,-1), 6),
    ]))
    return t

def arrow(label="", ok=True, width=None):
    width = width or CW * 0.62
    clr = C["green_d"] if ok else C["red_d"]
    st = sty(8, clr, TA_CENTER)
    txt = (label + "  ▼") if label else "▼"
    t = Table([[P(txt, st)]], colWidths=[width])
    t.setStyle(TableStyle([
        ("TOPPADDING",    (0,0),(-1,-1), 1),
        ("BOTTOMPADDING", (0,0),(-1,-1), 1),
    ]))
    return t

def badge(text, fill, stroke, width=None):
    width = width or CW * 0.62
    t = Table([[P(text, sty(9, C["white"], TA_CENTER))]], colWidths=[width])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), fill),
        ("BOX",           (0,0),(-1,-1), 1.2, stroke),
        ("TOPPADDING",    (0,0),(-1,-1), 5),
        ("BOTTOMPADDING", (0,0),(-1,-1), 5),
    ]))
    return t

def flow(items, width=None):
    """Vertical list of nodes/arrows, centred on the page."""
    width = width or CW * 0.62
    rows = [[it] for it in items]
    inner = Table(rows, colWidths=[width])
    inner.setStyle(TableStyle([
        ("ALIGN",         (0,0),(-1,-1), "CENTER"),
        ("TOPPADDING",    (0,0),(-1,-1), 0),
        ("BOTTOMPADDING", (0,0),(-1,-1), 0),
    ]))
    outer = Table([[inner]], colWidths=[CW])
    outer.setStyle(TableStyle([
        ("ALIGN",         (0,0),(-1,-1), "CENTER"),
        ("TOPPADDING",    (0,0),(-1,-1), 0),
        ("BOTTOMPADDING", (0,0),(-1,-1), 0),
    ]))
    return outer

def two_col(left_items, right_items, left_label="", right_label="", col_w=None):
    """Side-by-side two-column flow."""
    col_w = col_w or CW * 0.46
    def col(items, label):
        rows = []
        if label:
            rows.append([P(f"<b>{label}</b>", sty(8, C["grey_d"], TA_CENTER))])
        for it in items:
            rows.append([it])
        t = Table(rows, colWidths=[col_w])
        t.setStyle(TableStyle([
            ("TOPPADDING",    (0,0),(-1,-1), 0),
            ("BOTTOMPADDING", (0,0),(-1,-1), 0),
            ("ALIGN",         (0,0),(-1,-1), "CENTER"),
        ]))
        return t
    outer = Table([[col(left_items, left_label), col(right_items, right_label)]],
                  colWidths=[col_w + 0.1*cm, col_w + 0.1*cm])
    outer.setStyle(TableStyle([
        ("TOPPADDING",    (0,0),(-1,-1), 0),
        ("BOTTOMPADDING", (0,0),(-1,-1), 0),
        ("LEFTPADDING",   (0,0),(-1,-1), 0),
        ("RIGHTPADDING",  (0,0),(-1,-1), 0),
        ("VALIGN",        (0,0),(-1,-1), "TOP"),
    ]))
    return outer

def section_break(title):
    return [
        PageBreak(),
        Spacer(1, 0.3*cm),
        P(title, H1),
        HRFlowable(width="100%", thickness=1.5, color=C["navy"]),
        Spacer(1, 0.3*cm),
    ]

def db_tag(name):
    """Compact DB table badge inline."""
    return f'<font color="#1e8449"><b>[DB: {name}]</b></font>'

def api_tag(method, path):
    clr = {"GET":"#2980b9","POST":"#27ae60","PUT":"#d35400","DELETE":"#c0392b"}.get(method,"#555")
    return f'<font color="{clr}"><b>{method}</b></font> <font color="#555555">{path}</font>'

def compact_table(data, col_widths, header_bg=None):
    header_bg = header_bg or C["navy"]
    t = Table(data, colWidths=col_widths)
    rows = len(data)
    style = [
        ("BACKGROUND",    (0,0),(-1,0),  header_bg),
        ("TEXTCOLOR",     (0,0),(-1,0),  C["white"]),
        ("FONTNAME",      (0,0),(-1,-1), "F"),
        ("FONTSIZE",      (0,0),(-1,-1), 8),
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
        ("GRID",          (0,0),(-1,-1), 0.4, C["grid"]),
        ("TOPPADDING",    (0,0),(-1,-1), 4),
        ("BOTTOMPADDING", (0,0),(-1,-1), 4),
        ("LEFTPADDING",   (0,0),(-1,-1), 5),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [C["light"], C["white"]]),
    ]
    t.setStyle(TableStyle(style))
    return t

# ══════════════════════════════════════════════════════════════════════════════
# BUILD
# ══════════════════════════════════════════════════════════════════════════════
def build():
    doc = SimpleDocTemplate(
        OUT, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
    )
    s = []  # story

    # ── 1. Cover ──────────────────────────────────────────────────────────────
    s += [
        Spacer(1, 2*cm),
        P("COMPASS", sty(36, C["navy"], TA_CENTER)),
        P("Prostate Cancer Consultation Dashboard", sty(16, C["blue_d"], TA_CENTER)),
        Spacer(1, 0.5*cm),
        P("Complete System Flow Documentation", sty(13, C["grey_d"], TA_CENTER)),
        Spacer(1, 0.3*cm),
        P("Login · Data Pipeline · Surveys · REDCap · DB Schema",
          sty(10, C["grey_d"], TA_CENTER)),
        Spacer(1, 1*cm),
        HRFlowable(width="100%", thickness=2, color=C["navy"]),
        Spacer(1, 0.5*cm),
    ]

    # Info table
    info = [
        ["Server",     "compass (10.177.43.229)  —  EC2 us-west-2"],
        ["Web App",    "https://compass.hlpgonzalezlab.com"],
        ["DB Admin",   "https://compassdb.hlpgonzalezlab.com"],
        ["Branch",     "production/official"],
        ["Created",    "2026-09-18"],
    ]
    it = Table(info, colWidths=[3*cm, 11*cm])
    it.setStyle(TableStyle([
        ("FONTNAME",      (0,0),(-1,-1), "F"),
        ("FONTSIZE",      (0,0),(-1,-1), 9),
        ("TEXTCOLOR",     (0,0),(0,-1),  C["blue_d"]),
        ("FONTNAME",      (0,0),(0,-1),  "F"),
        ("TOPPADDING",    (0,0),(-1,-1), 4),
        ("BOTTOMPADDING", (0,0),(-1,-1), 4),
        ("GRID",          (0,0),(-1,-1), 0.3, C["grid"]),
        ("ROWBACKGROUNDS",(0,0),(-1,-1), [C["light"], C["white"]]),
    ]))
    s += [it, Spacer(1, 1*cm)]

    # Color legend
    legend_data = [
        ["Color", "Meaning"],
        ["🔵 Blue",   "Web / UI (Browser, Next.js, nginx)"],
        ["🟢 Green",  "Backend / Database (FastAPI, PostgreSQL)"],
        ["🟠 Orange", "External services (REDCap, NLP, Azure OpenAI)"],
        ["🔴 Red",    "Auth / Security (JWT, cookies, rate limits)"],
        ["⚫ Grey",   "Behavior tracking / Audit logs"],
    ]
    lt = compact_table(legend_data, [2.5*cm, 11*cm], C["navy"])
    s += [P("Color Legend", H2), Spacer(1,0.1*cm), lt]

    # ── 2. System Architecture Overview ───────────────────────────────────────
    s += section_break("2. System Architecture Overview")

    s += [
        P("Complete service map — from public internet to internal services.", SM),
        Spacer(1, 0.3*cm),
    ]

    s += [KeepTogether(flow([
        node("Internet / Browser", C["blue_l"], C["blue_d"]),
        arrow("HTTPS (port 443)"),
        node("AWS ALB  cbm-public-alb-1  (us-west-2)\ncompass.hlpgonzalezlab.com  /  compassdb.hlpgonzalezlab.com",
             C["yellow_l"], C["yellow_d"]),
        arrow("routes to"),
        node("nginx TLS front door  (Podman, 10.177.43.229)\n"
             ":3000 SSL → Next.js :3000  |  :5432 SSL → pgAdmin4 :5050",
             C["blue_l"], C["blue_d"]),
    ])), Spacer(1, 0.3*cm)]

    s += [two_col(
        left_items=[
            node("Next.js Standalone\n(compass-webapp, :3000)\nPatient / Doctor / Admin UI",
                 C["blue_l"], C["blue_d"], CW*0.46),
            arrow("proxy /api/backend/*", width=CW*0.46),
            node("FastAPI / uvicorn\n(compass-backend, :18001)\nAll business logic + DB",
                 C["green_l"], C["green_d"], CW*0.46),
            arrow(width=CW*0.46),
            node("PostgreSQL 16  (:5432)\n18 tables  |  Redis 7  (:6380)",
                 C["green_l"], C["green_d"], CW*0.46),
        ],
        right_items=[
            node("pgAdmin4\n(compass-pgadmin, :5050)\nDB admin web UI",
                 C["orange_l"], C["orange_d"], CW*0.46),
            arrow(width=CW*0.46),
            node("NLP Gateway  (:18080)\n→ R Classifier  (:8888 Podman)",
                 C["orange_l"], C["orange_d"], CW*0.46),
            arrow(width=CW*0.46),
            node("iREDCap\niredcap.csmc.edu\nSurvey data sync",
                 C["orange_l"], C["orange_d"], CW*0.46),
        ],
        left_label="Web Stack", right_label="External / Support",
    ), Spacer(1, 0.3*cm)]

    # Service table
    svc = [
        ["Service", "Port", "Description"],
        ["compass-webapp",       ":3000 (127.0.0.1)", "Next.js standalone — patient/doctor/admin UI"],
        ["compass-backend",      ":18001 (0.0.0.0)",  "FastAPI/uvicorn — all API endpoints"],
        ["compass-nginx-tls",    ":3000/:5432 (SSL)",  "nginx reverse proxy (Podman, TLS termination)"],
        ["compass-pgadmin",      ":5050 (127.0.0.1)", "pgAdmin4 — DB management web UI"],
        ["compass-nlp-gateway",  ":18080 (0.0.0.0)",  "NLP gateway — routes to R classifier"],
        ["compass-nlp-classifier",":8888 (127.0.0.1)", "R Random Forest classifiers in Podman"],
        ["compass-pipeline-watch","(filesystem)",       "Watches pipeline_drop_dir, triggers NLP+AI"],
    ]
    s += [P("Systemd Services", H2), Spacer(1,0.1*cm),
          compact_table(svc, [3.8*cm, 3.5*cm, 6.7*cm]),
          Spacer(1, 0.3*cm)]

    # ── 3. Admin Login Flow ───────────────────────────────────────────────────
    s += section_break("3. Admin Login Flow")

    s += [KeepTogether(flow([
        node("User opens  https://compass.hlpgonzalezlab.com/",
             C["blue_l"], C["blue_d"]),
        arrow("GET /"),
        node("Next.js Middleware\n"
             "No admin_session cookie?  →  307 Redirect",
             C["red_l"], C["red_d"]),
        arrow("307  →  /admin/login?next=%2F"),
        node("Admin Login Page\n/admin/login",
             C["blue_l"], C["blue_d"]),
        arrow("POST /api/admin-auth/login  {username, password}"),
        node("Next.js Route Handler\napp/api/admin-auth/login/route.ts\n"
             "Forwards to FastAPI  →  verifies credentials",
             C["blue_l"], C["blue_d"]),
        arrow("FastAPI: POST /api/admin-auth/login"),
        node("FastAPI Auth\nauth_user table: scrypt verify\nCheck role = admin OR is_superuser\n"
             "Issue HS256 JWT (JWT_SECRET, exp 3600s)",
             C["green_l"], C["green_d"]),
        arrow("200 OK  {access_token, expires_in}"),
        node("Set-Cookie: admin_session=JWT\n"
             "HttpOnly  Secure  SameSite=Lax  Path=/  MaxAge=3600",
             C["red_l"], C["red_d"]),
        arrow("window.location.assign('/')"),
        node("Middleware: admin_session cookie present\n"
             "Verify HS256 with JWT_SECRET (Web Crypto API)\n"
             "role=admin OR is_superuser=true  →  NextResponse.next()",
             C["red_l"], C["red_d"]),
        badge("✅  Admin sees /  (patient/doctor selection or /admin)", C["green_d"], C["green_d"]),
    ])), Spacer(1, 0.3*cm)]

    s += [P("DB Tables Touched", H2),
          compact_table([
              ["Table", "Operation", "Purpose"],
              ["auth_user", "SELECT", "Lookup user by username, verify scrypt hash, check role"],
          ], [3*cm, 2.5*cm, 8.5*cm]),
          Spacer(1, 0.3*cm),
          P("Note: logout clears the cookie (maxAge=0). No server-side session invalidation.", SM)]

    # ── 4. Patient / Doctor Personal Link ─────────────────────────────────────
    s += section_break("4. Patient / Doctor Personal Link Access")

    s += [
        P("Patients and doctors access the app via unique personal links — no password required. "
          "The link contains AES-SIV hashed tokens (never raw PHI).", BD),
        Spacer(1, 0.2*cm),
        P("<b>Token structure:</b>  "
          "&lt;hashedPatient&gt;_&lt;hashedDoctor&gt;_&lt;hashedDate&gt;.csv", BD),
        P("AES-SIV decryption (DEID_KEY env) → real SID / doctor number / visit week", SM),
        Spacer(1, 0.2*cm),
    ]

    url_data = [
        ["URL Pattern", "View Rendered"],
        ["/?fileid=X&patid=Y&survey=first-visit",  "PatientInitialVisitReportV42  (First Visit)"],
        ["/?fileid=X&patid=Y&survey=follow-up",    "PatientFollowUpReportV38  (Follow-up Surveys)"],
        ["/?fileid=X&doctorid=Y",                  "PhysicianReportsModifiedV41Timothy  (Doctor)"],
        ["/?f=<stem>&view=first-report",           "PatientInitialVisitReportV42  (shortlink)"],
        ["/ (no params, admin cookie present)",     "Patient/Doctor Selection Screen"],
        ["/ (no params, no admin cookie)",          "→ 307 /admin/login  (middleware redirect)"],
    ]
    s += [compact_table(url_data, [7.5*cm, 6.5*cm]), Spacer(1, 0.3*cm)]

    s += [KeepTogether(flow([
        node("Personal Link URL\n/?fileid=X&patid=Y  or  /?fileid=X&doctorid=Y",
             C["blue_l"], C["blue_d"]),
        arrow("Middleware: hasPersonalLink? → NextResponse.next()  (no auth required)"),
        node("page.tsx\nReads searchParams: fileid, patid, doctorid, visit, survey\n"
             "Determines view type: patient / doctor / selection",
             C["blue_l"], C["blue_d"]),
        arrow("X-API-Key injected server-side by /api/backend proxy"),
        node("FastAPI Backend  (:18001)\nAll patient/doctor endpoints require API key\n"
             "PHI audit: every response logged → phi_access_log",
             C["green_l"], C["green_d"]),
    ]))]

    # ── 5. Patient First Visit ────────────────────────────────────────────────
    s += section_break("5. Patient First Visit Flow")

    s += [
        P("Patient opens their personal link for the first visit. "
          "The app loads AI-generated summaries and presents a Risk Perception survey.", BD),
        Spacer(1, 0.2*cm),
    ]

    s += [KeepTogether(flow([
        node("Patient opens first-visit personal link",
             C["blue_l"], C["blue_d"]),
        arrow("GET /api/backend/patient/ai-summary/{file}"),
        node("FastAPI: get_ai_summary()\nReads: transcript_analysis_log + llm_domain_scoring_and_summary\n"
             "Returns: ai_score, reformat_sentence, extracted_estimate per domain",
             C["green_l"], C["green_d"]),
        arrow("GET /api/backend/patient/sentences/{file}"),
        node("FastAPI: get_patient_sentences()\nReads: sentence_prediction\n"
             "Returns: top-N NLP sentences per domain",
             C["green_l"], C["green_d"]),
        arrow("Patient reads summaries for 5 domains  (CP / LE / ED / INC / IUS)"),
        node("Risk Perception 2 Survey (5 domains, slider 0-100)\n"
             "Patient submits answers per domain",
             C["blue_l"], C["blue_d"]),
        arrow("PUT /api/backend/patient/first-visit-answers"),
    ])), Spacer(1, 0.2*cm)]

    s += [two_col(
        left_items=[
            node("Save to DB\npatient_survey_submission_log\nsurvey_type='risk_perception_2'\nextra_data={partial: bool}",
                 C["green_l"], C["green_d"], CW*0.46),
        ],
        right_items=[
            node("REDCap Sync (every domain save)\n"
                 "1. deid: SID_N → record_id 'N'\n"
                 "2. record_exists() check\n"
                 "3. 14 fields mapped\n"
                 "4. POST iredcap.csmc.edu/api/\n"
                 "5. risk_perception_2_complete='2'",
                 C["orange_l"], C["orange_d"], CW*0.46),
        ],
        left_label="DB Write", right_label="REDCap Sync",
    ), Spacer(1, 0.2*cm)]

    s += [flow([
        node("Behavior Tracking\nPOST /api/backend/track/patient-report\n"
             "Events: page_view, topic_open/close, evidence_open/close,\n"
             "summary_open/close, rating_click, session_end",
             C["grey_l"], C["grey_d"]),
        arrow("Writes to: patient_report_page_behavior"),
    ]), Spacer(1, 0.2*cm)]

    fv_db = [
        ["Table", "Operation", "Purpose"],
        ["transcript_analysis_log",        "SELECT", "Find analysis run for this file"],
        ["llm_domain_scoring_and_summary", "SELECT", "AI scores + patient-facing summaries"],
        ["sentence_prediction",            "SELECT", "Top-N NLP sentences per domain"],
        ["patient_summary",                "SELECT", "Parent record existence check"],
        ["patient_survey_submission_log",  "INSERT", "Store Risk Perception 2 answers"],
        ["patient_report_page_behavior",   "INSERT", "UI interaction events"],
        ["phi_access_log",                 "INSERT", "HIPAA audit log for each API call"],
    ]
    s += [P("DB Tables", H2), compact_table(fv_db, [5.5*cm, 2*cm, 6.5*cm])]

    # ── 6. Patient Follow-up Survey Flow ──────────────────────────────────────
    s += section_break("6. Patient Follow-up Survey Flow")

    s += [
        P("4 sequential surveys: SDM (4Q) → DCS (16Q) → Risk Perception (5Q) → Satisfaction (1Q). "
          "Forward-only navigation. Progress saved to DB on every Next click (no REDCap). "
          "Final Submit triggers REDCap sync exactly once per survey.", BD),
        Spacer(1, 0.2*cm),
    ]

    s += [KeepTogether(flow([
        node("Patient opens follow-up personal link",
             C["blue_l"], C["blue_d"]),
        arrow("Session restore: GET /api/backend/surveys/by-speaker/{speaker}"),
        node("Restore previous answers from patient_survey_submission_log\n"
             "partial=True → restore answers only\n"
             "partial=False → restore answers + mark section complete ✓",
             C["green_l"], C["green_d"]),
        arrow("Patient works through survey questions"),
        node("Each 'Next' click  →  Progress Save (no REDCap)\n"
             "POST /api/backend/surveys/progress  (rate: 120/min)\n"
             "→ patient_survey_submission_log  {partial: True}\n"
             "Session interrupted? → answers restored on next visit",
             C["grey_l"], C["grey_d"]),
        arrow("Patient reaches last question → 'Submit & continue'"),
        node("Final Submit  →  POST /api/backend/surveys/submit  (rate: 30/min)\n"
             "→ patient_survey_submission_log  {partial: False}",
             C["green_l"], C["green_d"]),
    ])), Spacer(1, 0.2*cm)]

    s += [two_col(
        left_items=[
            node("DB Write\npatient_survey_submission_log\nsurvey_type: sdm/dcs/risk_perception/satisfaction\nanswers: JSONB\nextra_data: {partial: false}",
                 C["green_l"], C["green_d"], CW*0.46),
        ],
        right_items=[
            node("REDCap Sync\n1. deid → record_id\n2. record_exists() pre-flight\n3. Map fields (see §7)\n4. POST iredcap.csmc.edu\n   overwriteBehavior=normal\n5. <instrument>_complete='2'\n6. Update: redcap_synced,\n   redcap_record_id, redcap_error",
                 C["orange_l"], C["orange_d"], CW*0.46),
        ],
        left_label="On Submit", right_label="On Submit",
    ), Spacer(1, 0.2*cm)]

    s += [flow([
        node("Behavior Tracking\nPOST /api/backend/track/patient-followup\n"
             "Events: page_view, survey_step_view, survey_answer, survey_complete, session_end",
             C["grey_l"], C["grey_d"]),
        arrow("Writes to: patient_followup_survey_page_behavior"),
    ])]

    # ── 7. REDCap Field Mapping ───────────────────────────────────────────────
    s += section_break("7. REDCap Field Mapping")

    s += [
        P("All survey submissions that reach POST /api/surveys/submit trigger REDCap sync "
          "if REDCAP_ENABLED=True. Timeout: 90 seconds per call (iredcap.csmc.edu).", BD),
        Spacer(1, 0.2*cm),
    ]

    rc_overview = [
        ["Survey", "REDCap Instrument", "# Fields", "Value Transform", "Trigger"],
        ["dcs",              "decisional_conflict_survey",   "16", "0-based → 1-based (+1)", "Final Submit"],
        ["sdm",              "shared_decision_making_sdm",   "4",  "yes/no → 1/0; scale text → 1-4", "Final Submit"],
        ["risk_perception",  "risk_perception",              "5",  "Slider 0-100 → int", "Final Submit"],
        ["risk_perception_2","post_risk_perception_2",       "14", "checkbox: field___code=1/0", "Final Submit"],
        ["satisfaction",     "patient_satisfaction",         "1",  "Free text (overwrite)", "Final Submit"],
        ["risk_perception_2","risk_perception_2  (1st visit)","14", "checkbox: field___code=1/0", "Every domain save"],
    ]
    s += [compact_table(rc_overview, [3*cm, 4*cm, 1.5*cm, 3.5*cm, 2*cm]), Spacer(1, 0.3*cm)]

    dcs_data = [["DCS Frontend Key", "REDCap Field", "Transform"]] + \
               [[f"q{i}", f"dcs{i}_v2", "value + 1  (0→1 … 4→5)"] for i in range(1, 9)] + \
               [["q9 … q16", "dcs9_v2 … dcs16_v2", "value + 1"]]
    s += [P("DCS Mapping (16 questions):", H2), compact_table(dcs_data, [4*cm, 4*cm, 6*cm]),
          Spacer(1, 0.2*cm)]

    sdm_data = [
        ["SDM Frontend Key", "REDCap Field",    "Value"],
        ["q1 (options aware)", "sdmp_options",  "yes→1, no→0"],
        ["q2 (pros/cons)",     "sdm_ptos",      "yes→1, no→0"],
        ["q3 (discussed cons)","sdm_cons",      "yes→1, no→0"],
        ["q4 (preference)",    "sdm_pref",      "scale text → 1-4"],
    ]
    s += [P("SDM Mapping:", H2), compact_table(sdm_data, [4*cm, 4*cm, 6*cm]),
          Spacer(1, 0.2*cm)]

    rp_data = [
        ["Risk Perception Frontend Key", "REDCap Field"],
        ["cancerRiskUntreated",          "risk_percep_1_1"],
        ["cancerRiskTreated",            "risk_percept2_2"],
        ["erectileDysfunctionRisk",      "risk_percept_3_3"],
        ["urinaryIncontinenceRisk",      "risk_percept_4_4"],
        ["irritativeUrinaryRisk",        "risk_percep_5_5"],
    ]
    s += [P("Risk Perception Mapping:", H2), compact_table(rp_data, [7*cm, 7*cm])]

    # ── 8. Doctor Dashboard Flow ──────────────────────────────────────────────
    s += section_break("8. Doctor Dashboard Flow")

    s += [KeepTogether(flow([
        node("Doctor opens personal link  /?fileid=X&doctorid=Y",
             C["blue_l"], C["blue_d"]),
        arrow("PhysicianReportsModifiedV41Timothy renders"),
        node("Data Loading (parallel):\n"
             "GET /api/doctor/files  →  patient_summary\n"
             "GET /api/doctor/sentences/{file}/{speaker}  →  sentence_prediction\n"
             "GET /api/doctor/scores/trajectory  →  llm_domain_scoring_and_summary\n"
             "GET /api/doctor/scores/average  →  llm_domain_scoring_and_summary\n"
             "GET /api/doctor/rewrites  →  doctor_rewrite_log",
             C["green_l"], C["green_d"]),
        arrow("Doctor selects a sentence for rewrite"),
    ])), Spacer(1, 0.2*cm)]

    s += [two_col(
        left_items=[
            node("On-the-fly Scoring\nPOST /api/doctor/score-sentence\n→ Azure OpenAI GPT-4o\n(NOT persisted until applied)",
                 C["orange_l"], C["orange_d"], CW*0.46),
            arrow(width=CW*0.46),
            node("AI Rewrite Suggestion\nPOST /api/doctor/ai-rewrite\n→ Azure OpenAI GPT-4o\n(NOT persisted until confirmed)",
                 C["orange_l"], C["orange_d"], CW*0.46),
        ],
        right_items=[
            node("Save Confirmed Rewrite\nPOST /api/doctor/rewrites\n→ doctor_rewrite_log\nComposite PK: (file, i, i2, time)\nFull audit trail preserved",
                 C["green_l"], C["green_d"], CW*0.46),
            Spacer(1, 0.3*cm),
            node("Behavior Tracking\nPOST /api/backend/track/doctor\n→ doctor_behavior\nEvents: patient_select,\nsentence_select, rewrite_apply,\nview_change, session_end",
                 C["grey_l"], C["grey_d"], CW*0.46),
        ],
        left_label="Before Confirm", right_label="After Confirm",
    )]

    dr_db = [
        ["Table", "Operation", "Purpose"],
        ["patient_summary",               "SELECT", "List available patient files"],
        ["sentence_prediction",           "SELECT", "Top-N NLP sentences per domain"],
        ["llm_domain_scoring_and_summary","SELECT", "ai_score, visit week for trajectory chart"],
        ["doctor_rewrite_log",            "SELECT / INSERT", "Rewrite history (audit trail, composite PK)"],
        ["doctor_behavior",               "INSERT", "UI interaction events"],
        ["phi_access_log",                "INSERT", "HIPAA audit for each API call"],
    ]
    s += [Spacer(1, 0.2*cm), P("DB Tables", H2),
          compact_table(dr_db, [5.5*cm, 2.5*cm, 6*cm])]

    # ── 9. Data Pipeline Flow ─────────────────────────────────────────────────
    s += section_break("9. Data Pipeline Flow  (NLP + AI)")

    s += [
        P("The pipeline runs outside the webapp. Admin uploads a de-identified transcript CSV/XLSX. "
          "compass-pipeline-watch detects it and calls the AI repo orchestrator.", BD),
        Spacer(1, 0.2*cm),
    ]

    s += [KeepTogether(flow([
        node("Admin uploads transcript\nPOST /api/admin/upload-transcript\n"
             "(Rate: 10/min, filename must be AES-SIV Base32, max 25 MB)",
             C["blue_l"], C["blue_d"]),
        arrow("→ admin_upload_log  (status: queued)"),
        node("Atomic drop to pipeline_drop_dir\n(<name>.part → <name>.csv/xlsx)",
             C["green_l"], C["green_d"]),
        arrow("compass-pipeline-watch detects file"),
        node("AI repo: main_complete_pipeline_db.py\n"
             "Orchestrates NLP then AI steps",
             C["orange_l"], C["orange_d"]),
    ])), Spacer(1, 0.2*cm)]

    s += [two_col(
        left_items=[
            P("<b>NLP Step  (7 sub-steps via NLP Gateway :18080 → R Classifier :8888)</b>",
              sty(8, C["blue_d"])),
            node("1. raw\nnlp_pipeline_intermediate",   C["blue_l"], C["blue_d"], CW*0.46),
            arrow(width=CW*0.46),
            node("2. filter\nnlp_pipeline_intermediate", C["blue_l"], C["blue_d"], CW*0.46),
            arrow(width=CW*0.46),
            node("3. segment\nnlp_pipeline_intermediate",C["blue_l"], C["blue_d"], CW*0.46),
            arrow(width=CW*0.46),
            node("4. classify (5 RF models)\nnlp_all_predictions\n(all sentences × 5 domains)",
                 C["blue_l"], C["blue_d"], CW*0.46),
            arrow(width=CW*0.46),
            node("5. top-N select\nnlp_pipeline_intermediate",C["blue_l"],C["blue_d"],CW*0.46),
            arrow(width=CW*0.46),
            node("6. context\nsentence_prediction\n(top-N + surrounding context)",
                 C["blue_l"], C["blue_d"], CW*0.46),
            arrow(width=CW*0.46),
            node("7. header\ntranscript_analysis_log  (processed=False)\npatient_summary  (UPSERT)",
                 C["green_l"], C["green_d"], CW*0.46),
        ],
        right_items=[
            P("<b>AI Step  (5 sub-steps via Azure OpenAI GPT-4o)</b>",
              sty(8, C["orange_d"])),
            node("1. Score\nllm_domain_scoring_and_summary\nai_score 0-5 per domain",
                 C["orange_l"], C["orange_d"], CW*0.46),
            arrow(width=CW*0.46),
            node("2. Extract\nllm_domain_scoring_and_summary\nextracted_estimate (e.g. '13 years')",
                 C["orange_l"], C["orange_d"], CW*0.46),
            arrow(width=CW*0.46),
            node("3. Filter / Select\nllm_domain_scoring_and_summary\nBest sentence per domain",
                 C["orange_l"], C["orange_d"], CW*0.46),
            arrow(width=CW*0.46),
            node("4. Reformat\nllm_domain_scoring_and_summary\nreformat_sentence (patient language)",
                 C["orange_l"], C["orange_d"], CW*0.46),
            arrow(width=CW*0.46),
            node("5. Finalize\ntranscript_analysis_log\nprocessed=True, ai_overall_score\nllm_pipeline_intermediate (trace)",
                 C["green_l"], C["green_d"], CW*0.46),
        ],
        left_label="", right_label="",
    )]

    # ── 10. DB Schema Overview ────────────────────────────────────────────────
    s += section_break("10. Database Schema — 18 Tables")

    groups = [
        ("Auth  (2 tables)", C["red_d"], [
            ["Table", "PK", "Key Columns", "Purpose"],
            ["auth_user",    "id", "username, password_hash (scrypt), role, is_superuser", "Admin user accounts"],
            ["auth_api_key", "id", "key_hash, user_id (FK), expires_at, last_used_at",     "API keys for patient/doctor endpoints"],
        ], [3*cm, 1.5*cm, 5.5*cm, 4*cm]),

        ("Pipeline  (7 tables)", C["blue_d"], [
            ["Table", "Purpose"],
            ["transcript_analysis_log",        "One row per pipeline run — metadata, xlsx binary, timing, scores (parent)"],
            ["patient_summary",                "One row per patient file+speaker — FK anchor for surveys"],
            ["sentence_prediction",            "Top-N NLP sentences per domain per run"],
            ["nlp_all_predictions",            "ALL sentences × 5 domain probabilities (full NLP output)"],
            ["nlp_pipeline_intermediate",      "JSONB snapshots of NLP steps (raw/filtered/sentences/top_by_model)"],
            ["llm_domain_scoring_and_summary", "GPT-4o output: ai_score, extracted_estimate, reformat_sentence per domain"],
            ["llm_pipeline_intermediate",      "Per-domain LLM input/output trace (written by AI repo)"],
        ], [5.5*cm, 8.5*cm]),

        ("Survey Submission  (1 table)", C["green_d"], [
            ["Table", "Key Columns", "Purpose"],
            ["patient_survey_submission_log",
             "file, speaker, survey_type, answers (JSONB),\nextra_data {partial: bool}, sid, doctor,\nredcap_synced, redcap_record_id, redcap_error",
             "ALL survey answers (first-visit + follow-up).\nAppend-only. Tracks REDCap sync state."],
        ], [4*cm, 5.5*cm, 4.5*cm]),

        ("Behavior Tracking  (3 tables)", C["grey_d"], [
            ["Table", "Key Events", "Purpose"],
            ["patient_report_page_behavior",          "page_view, topic_open/close, evidence_open, rating_click, session_end", "First-visit UI interactions"],
            ["patient_followup_survey_page_behavior", "survey_step_view, survey_answer, survey_complete, session_end",         "Follow-up survey navigation"],
            ["doctor_behavior",                       "patient_select, sentence_select, rewrite_apply, view_change, session_end", "Doctor dashboard interactions"],
        ], [4*cm, 5.5*cm, 4.5*cm]),

        ("Admin / Audit  (3 tables)", C["orange_d"], [
            ["Table", "Purpose"],
            ["admin_upload_log", "Records each admin transcript upload attempt (queued_filename, status, uploaded_by)"],
            ["session_recording","rrweb session replay chunks — gzipped JSON, tagged by area (patient_first/followup/doctor)"],
            ["phi_access_log",   "HIPAA 164.312(b) audit trail — every request returning patient data (actor, IP, path, status)"],
        ], [4*cm, 10*cm]),
    ]

    for grp_title, hdr_color, grp_data, col_ws in groups:
        s += [P(grp_title, H2), Spacer(1, 0.1*cm)]
        t = Table(grp_data, colWidths=col_ws)
        style = [
            ("BACKGROUND",    (0,0),(-1,0),  hdr_color),
            ("TEXTCOLOR",     (0,0),(-1,0),  C["white"]),
            ("FONTNAME",      (0,0),(-1,-1), "F"),
            ("FONTSIZE",      (0,0),(-1,-1), 8),
            ("VALIGN",        (0,0),(-1,-1), "TOP"),
            ("GRID",          (0,0),(-1,-1), 0.4, C["grid"]),
            ("TOPPADDING",    (0,0),(-1,-1), 4),
            ("BOTTOMPADDING", (0,0),(-1,-1), 4),
            ("LEFTPADDING",   (0,0),(-1,-1), 5),
            ("ROWBACKGROUNDS",(0,1),(-1,-1), [C["light"], C["white"]]),
        ]
        t.setStyle(TableStyle(style))
        s += [t, Spacer(1, 0.3*cm)]

    # ── Build ─────────────────────────────────────────────────────────────────
    doc.build(s)
    print(f"PDF saved: {OUT}  ({os.path.getsize(OUT)//1024} KB)")


if __name__ == "__main__":
    build()
