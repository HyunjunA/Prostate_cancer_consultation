"""
STT Feature Report — generates both English and Korean PDF versions.
Usage: .venv/bin/python scripts/make_stt_report_pdf.py
"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(SCRIPT_DIR, "..")
FONT_PATH = os.path.join(REPO, "_fonts", "NotoSansKR.ttf")
pdfmetrics.registerFont(TTFont("KR", FONT_PATH))

OUT_EN = os.path.join(REPO, "docs", "architecture", "STT_FEATURE_REPORT_EN.pdf")
OUT_KR = os.path.join(REPO, "docs", "architecture", "STT_FEATURE_REPORT_KR.pdf")

W, H = A4
CW = W - 4 * cm

# ── Colors ───────────────────────────────────────────────────────────────────
NAVY    = colors.HexColor("#1a3a5c")
WHITE   = colors.white
BLUE_L  = colors.HexColor("#dce8f5")
BLUE_D  = colors.HexColor("#2d5f8a")
GREEN_L = colors.HexColor("#eafaf1")
GREEN_D = colors.HexColor("#1e8449")
RED_L   = colors.HexColor("#fdedec")
RED_D   = colors.HexColor("#c0392b")
ORA_L   = colors.HexColor("#fdf2e9")
ORA_D   = colors.HexColor("#d35400")
YEL_L   = colors.HexColor("#fef9e7")
YEL_D   = colors.HexColor("#b7950b")
GREY_L  = colors.HexColor("#f8f9fa")
GREY_D  = colors.HexColor("#6c757d")
GRID    = colors.HexColor("#c0d0e0")
LIGHT   = colors.HexColor("#f5f8fb")

def make_styles(font):
    def s(size=9, color=NAVY, align=TA_LEFT, leading=None):
        return ParagraphStyle("_", fontName=font, fontSize=size,
                              textColor=color, alignment=align,
                              leading=leading or size * 1.55,
                              wordWrap="CJK" if font == "KR" else "normal")
    return {
        "title": s(22, NAVY, TA_CENTER),
        "sub":   s(11, BLUE_D, TA_CENTER),
        "meta":  s(9,  GREY_D, TA_CENTER),
        "h1":    s(13, NAVY),
        "h2":    s(10, BLUE_D),
        "body":  s(9),
        "sm":    s(8,  GREY_D),
        "code":  s(8,  colors.HexColor("#1a3a5c")),
        "warn":  s(8,  RED_D),
    }

def P(text, st): return Paragraph(text, st)

def make_table(data, widths, hdr_color=NAVY):
    t = Table(data, colWidths=widths)
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,0),  hdr_color),
        ("TEXTCOLOR",     (0,0),(-1,0),  WHITE),
        ("FONTNAME",      (0,0),(-1,-1), data[0][0].__class__.__name__ == "Paragraph"
                                          and data[0][0].style.fontName or "Helvetica"),
        ("FONTSIZE",      (0,0),(-1,-1), 8),
        ("VALIGN",        (0,0),(-1,-1), "TOP"),
        ("GRID",          (0,0),(-1,-1), 0.4, GRID),
        ("TOPPADDING",    (0,0),(-1,-1), 4),
        ("BOTTOMPADDING", (0,0),(-1,-1), 4),
        ("LEFTPADDING",   (0,0),(-1,-1), 6),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [LIGHT, WHITE]),
    ]))
    return t

def base_table(data, widths, hdr_color=NAVY):
    t = Table(data, colWidths=widths)
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,0),  hdr_color),
        ("TEXTCOLOR",     (0,0),(-1,0),  WHITE),
        ("FONTSIZE",      (0,0),(-1,-1), 8),
        ("VALIGN",        (0,0),(-1,-1), "TOP"),
        ("GRID",          (0,0),(-1,-1), 0.4, GRID),
        ("TOPPADDING",    (0,0),(-1,-1), 4),
        ("BOTTOMPADDING", (0,0),(-1,-1), 4),
        ("LEFTPADDING",   (0,0),(-1,-1), 6),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [LIGHT, WHITE]),
    ]))
    return t

def risk_table(rows, font):
    def ps(size, color, align=TA_LEFT):
        return ParagraphStyle("_", fontName=font, fontSize=size,
                              textColor=color, alignment=align,
                              leading=size*1.4,
                              wordWrap="CJK" if font=="KR" else "normal")
    data = [rows[0]]
    for row in rows[1:]:
        data.append([row[0], row[1], row[2]])
    t = Table(data, colWidths=[3.5*cm, 1.5*cm, 9*cm])
    level_map = {
        "HIGH":   (RED_L,  RED_D),
        "MEDIUM": (ORA_L,  ORA_D),
        "LOW":    (YEL_L,  YEL_D),
        "NONE":   (GREEN_L,GREEN_D),
        "높음":   (RED_L,  RED_D),
        "중간":   (ORA_L,  ORA_D),
        "낮음":   (YEL_L,  YEL_D),
        "없음":   (GREEN_L,GREEN_D),
    }
    style = [
        ("BACKGROUND",    (0,0),(-1,0), NAVY),
        ("TEXTCOLOR",     (0,0),(-1,0), WHITE),
        ("FONTSIZE",      (0,0),(-1,-1), 8),
        ("VALIGN",        (0,0),(-1,-1), "TOP"),
        ("GRID",          (0,0),(-1,-1), 0.4, GRID),
        ("TOPPADDING",    (0,0),(-1,-1), 4),
        ("BOTTOMPADDING", (0,0),(-1,-1), 4),
        ("LEFTPADDING",   (0,0),(-1,-1), 5),
        ("ALIGN",         (1,0),(1,-1), "CENTER"),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [LIGHT, WHITE]),
    ]
    for i, row in enumerate(rows[1:], 1):
        lvl = row[1]
        if lvl in level_map:
            bg, fg = level_map[lvl]
            style.append(("BACKGROUND", (1,i),(1,i), bg))
            style.append(("TEXTCOLOR",  (1,i),(1,i), fg))
    t.setStyle(TableStyle(style))
    return t

def sec(title, st):
    return [
        Spacer(1, 0.3*cm),
        P(title, st),
        HRFlowable(width="100%", thickness=1.5, color=NAVY),
        Spacer(1, 0.2*cm),
    ]

# ═════════════════════════════════════════════════════════════════════════════
# ENGLISH VERSION
# ═════════════════════════════════════════════════════════════════════════════
def build_en():
    font = "Helvetica"
    bold = "Helvetica-Bold"

    def st(size=9, color=NAVY, align=TA_LEFT, b=False):
        return ParagraphStyle("_", fontName=bold if b else font,
                              fontSize=size, textColor=color,
                              alignment=align, leading=size*1.55)

    TITLE = st(22, NAVY, TA_CENTER, True)
    SUB   = st(11, BLUE_D, TA_CENTER)
    META  = st(9,  GREY_D, TA_CENTER)
    H1    = st(13, NAVY, b=True)
    H2    = st(10, BLUE_D, b=True)
    BD    = st(9)
    SM    = st(8,  GREY_D)

    def p(text, s=None): return Paragraph(text, s or BD)

    doc = SimpleDocTemplate(OUT_EN, pagesize=A4,
                            leftMargin=2*cm, rightMargin=2*cm,
                            topMargin=2*cm, bottomMargin=2*cm)
    s = []

    # Cover
    s += [
        Spacer(1, 1.5*cm),
        p("COMPASS Dashboard", st(14, GREY_D, TA_CENTER)),
        p("Speech-to-Text (STT) Feature", TITLE),
        p("Technical & Security Report", SUB),
        Spacer(1, 0.4*cm),
        HRFlowable(width="100%", thickness=2, color=NAVY),
        Spacer(1, 0.3*cm),
        p("Code Architecture  ·  Model Licenses  ·  Institutional Security Review", META),
        p("2026-09-25", META),
        Spacer(1, 0.8*cm),
    ]
    s.append(base_table([
        ["Item", "Detail"],
        ["Feature",             "In-browser Speech-to-Text for Re-write Practice"],
        ["STT Model",           "onnx-community/moonshine-base-ONNX  (MIT License)"],
        ["VAD Model",           "onnx-community/silero-vad  (MIT License)"],
        ["Inference Library",   "@huggingface/transformers v3.7.1  (Apache-2.0)"],
        ["Audio exits browser?","NO — transcription only; audio stays in the browser tab"],
        ["BAA required?",       "NO — no PHI transmitted to any third party"],
    ], [4*cm, 10*cm]))

    # 1. Executive Summary
    s += sec("1. Executive Summary", H1)
    s += [
        p("The <b>Speak</b> button in the Re-write Practice panel transcribes spoken "
          "input into the rewrite text box. All processing — Voice Activity Detection (VAD) "
          "and automatic speech recognition (ASR) — runs <b>entirely inside the browser tab</b> "
          "using two ONNX models loaded from Hugging Face on first use and cached locally."),
        Spacer(1, 0.15*cm),
        p("Microphone audio is never transmitted to the backend, to Hugging Face, or to any "
          "third party. Only the recognised text string is appended to the textarea. "
          "This design means <b>no Business Associate Agreement (BAA) is required</b> for "
          "the audio signal itself."),
    ]

    # 2. Code Flow
    s += sec("2. Architecture & Code Flow (9 Steps)", H1)
    s.append(base_table([
        ["Step", "File", "What happens"],
        ["1. Click Speak",       "RewriteVoiceInput.tsx",      "useSpeechToText.start() is called."],
        ["2. Security check",    "useSpeechToText.tsx:52",     "Checks window.isSecureContext (HTTPS required) and navigator.mediaDevices.getUserMedia. Shows 'Voice unavailable' if either fails."],
        ["3. Worker acquire",    "sttWorkerHost.ts:23",        "getSttWorker() returns a shared module-type Web Worker (stt.worker.ts). One worker per page session, ~700 MB RAM resident when models are loaded."],
        ["4. Load models",       "stt.worker.ts:77",           "First click: downloads silero-vad (~2 MB) and moonshine-base-ONNX (~123 MB) from HuggingFace CDN (HTTPS). Stored in Browser Cache API. Subsequent clicks: zero network traffic."],
        ["5. Open microphone",   "useSpeechToText.tsx:151",    "getUserMedia({ audio: { sampleRate:16000, echoCancellation:true, noiseSuppression:true } }). AudioWorklet (vad-processor.js) rechunks audio into 512-sample frames."],
        ["6. VAD scoring",       "stt.worker.ts:131",          "Every 512-sample frame -> Silero VAD returns speech probability. score>0.3=speech start; score<0.1=speech end. 400 ms silence = sentence boundary. Segments <250 ms discarded."],
        ["7. Transcription",     "stt.worker.ts:230",          "Completed audio chunk -> Moonshine ASR returns {text}. Posted back as {type:'text', text}."],
        ["8. Append to textarea","sttConstants.ts",            "appendTranscript() appends text with smart spacing. No server call at this stage."],
        ["9. Stop",              "useSpeechToText.tsx:80",     "stream.getTracks().stop() releases microphone. AudioContext.close(). Worker stays alive (models remain in RAM). {type:'reset'} discards in-flight transcriptions."],
    ], [2.5*cm, 3.5*cm, 8*cm]))

    Spacer(1, 0.2*cm)
    s += [Spacer(1, 0.2*cm), p("Source files:", H2)]
    s.append(base_table([
        ["File", "Role"],
        ["src/lib/sttConstants.ts",          "Master switch (VOICE_INPUT_ENABLED), model IDs, audio tuning, appendTranscript()"],
        ["src/lib/sttWorkerHost.ts",         "Singleton worker — created once, kept alive between dictations"],
        ["src/workers/stt.worker.ts",        "All ML inference: VAD frame scoring, sentence detection, Moonshine transcription"],
        ["src/hooks/useSpeechToText.tsx",    "Browser plumbing: permissions, AudioContext, AudioWorklet, worker messaging"],
        ["src/components/RewriteVoiceInput.tsx","UI: Speak button, status label, warning banner"],
        ["public/vad-processor.js",          "AudioWorklet: 512-sample rechunking + Firefox 16 kHz resampler"],
        ["next.config.js",                   "Webpack: stubs out onnxruntime-node, keeps ORT bundle un-minified"],
    ], [5*cm, 9*cm]))

    # 3. Licenses
    s += sec("3. Models & Licenses", H1)
    s.append(base_table([
        ["Component", "Identifier", "License", "Commercial Use"],
        ["STT model",  "onnx-community/moonshine-base-ONNX", "MIT",         "Free — no restrictions"],
        ["Original STT","UsefulSensors/moonshine-base",       "MIT",         "Free — no restrictions"],
        ["VAD model",  "onnx-community/silero-vad",           "MIT",         "Free — no restrictions"],
        ["Library",    "@huggingface/transformers v3.7.1",    "Apache-2.0",  "Free + patent grant"],
    ], [3.5*cm, 5*cm, 2*cm, 3.5*cm]))
    s += [Spacer(1, 0.15*cm),
          p("<b>Conclusion:</b> MIT and Apache-2.0 are fully permissive licenses. No copyleft, "
            "no usage fees, no attribution requirement beyond retaining license notices. "
            "Suitable for clinical research and commercial institutional deployment.")]

    # 4. Network
    s += sec("4. Network Traffic", H1)
    s.append(base_table([
        ["Event", "Destination", "Protocol", "Size", "Frequency"],
        ["First Speak click\n(model download)", "cdn-lfs.huggingface.co", "HTTPS 443", "~125 MB total", "Once — cached afterwards"],
        ["Subsequent clicks",                  "(none)",                  "—",          "0 bytes",       "Served from browser cache"],
        ["During dictation",                   "(none)",                  "—",          "0 bytes",       "Audio stays in browser"],
        ["Score button click",                 "COMPASS server (:18001)", "HTTPS",      "Text only",     "On doctor request"],
    ], [3*cm, 3.5*cm, 2*cm, 2.5*cm, 3*cm]))
    s += [Spacer(1, 0.1*cm),
          p("Domains to whitelist: huggingface.co · cdn-lfs.huggingface.co · cdn-lfs-us-1.huggingface.co (all port 443 HTTPS)", SM)]

    # 5. Browser
    s += sec("5. Browser Compatibility", H1)
    s.append(base_table([
        ["Browser", "Support", "Notes"],
        ["Chrome / Edge 89+",           "Full",    "WebGPU when available; WASM fallback. Native 16 kHz AudioContext."],
        ["Safari 16.4+",                "Full",    "AudioWorklet stable from Safari 14. 16 kHz context natively."],
        ["Firefox 76+",                 "Partial", "No 16 kHz AudioContext — vad-processor.js resamples. No WebGPU → WASM only (~2x slower)."],
        ["HTTP (non-HTTPS)",            "Blocked", "getUserMedia() unavailable. Code shows 'Voice input needs HTTPS'."],
        ["Internet Explorer / old Edge","None",    "No AudioWorklet, no module Workers."],
    ], [3.5*cm, 2*cm, 8.5*cm]))

    # 6. Security
    s += [PageBreak()]
    s += sec("6. Security & Institutional Review", H1)

    s += [p("<b>6.1  Positive security properties</b>", H2), Spacer(1, 0.1*cm)]
    s.append(base_table([
        ["Property", "Detail"],
        ["Audio never leaves browser",  "Microphone audio stays in the Web Worker. Only plain-text result crosses to the page."],
        ["No third-party audio upload", "No API call to Google, AWS, Azure, or any external speech service."],
        ["Microphone released on Stop", "getTracks().stop() called immediately — browser mic indicator clears."],
        ["No SharedArrayBuffer",        "Not used. COOP/COEP headers are NOT required and NOT set."],
        ["HIPAA/PHI audio safe",        "Audio is PHI (physician voice). Because it never leaves the device, no BAA is needed for the STT feature."],
        ["Session isolation",           "{type:'reset'} clears in-flight transcriptions on Stop. No cross-dictation data bleed."],
    ], [4*cm, 10*cm]))

    s += [Spacer(1, 0.25*cm), p("<b>6.2  Institutional risk table</b>", H2), Spacer(1, 0.1*cm)]
    risk_rows = [
        ["Risk",                                      "Level",  "Details & Mitigation"],
        ["HuggingFace CDN blocked by firewall",       "HIGH",   "Models (~125 MB) downloaded from cdn-lfs.huggingface.co on first use. Button stays in 'Loading...' if blocked.\nMitigation: Whitelist cdn-lfs*.huggingface.co:443 OR host models locally on the COMPASS server."],
        ["WebAssembly blocked by EDR / policy",       "HIGH",   "ONNX Runtime uses WASM as primary compute backend. Enterprise security tools may block .wasm execution.\nMitigation: Allow WebAssembly for compass.hlpgonzalezlab.com in browser policy."],
        ["EDR heuristic alert on large CDN download", "MEDIUM", "~123 MB binary from external CDN triggered by a medical app may flag behavioral detection.\nMitigation: Whitelist CDN domains in EDR policy. One-time event."],
        ["Module-type Web Worker blocked",            "MEDIUM", "Worker created as type:'module'. Enterprise Chrome/Edge policies may restrict this.\nMitigation: Verify COMPASS origin is in allowed worker origins list."],
        ["AudioWorklet CPU spikes",                   "LOW",    "Audio thread runs while microphone is open. May trigger DLP tools monitoring sustained CPU + mic usage.\nMitigation: Acceptable — microphone is user-initiated and released on Stop."],
        ["Browser cache quota (~125 MB)",             "LOW",    "Disk quota policies may evict models after browser close. Requires re-download next session.\nMitigation: Accept periodic re-download, or host models locally."],
        ["SharedArrayBuffer / COOP+COEP",             "NONE",   "Not used. No isolation headers required. App works without cross-origin isolation."],
        ["Audio data to third party",                 "NONE",   "Zero audio bytes leave the browser. Confirmed by code review of stt.worker.ts and useSpeechToText.tsx."],
    ]
    s.append(risk_table(risk_rows, font))

    s += [Spacer(1, 0.25*cm), p("<b>6.3  Memory profile</b>", H2), Spacer(1, 0.1*cm)]
    s.append(base_table([
        ["Metric", "Value", "Notes"],
        ["First download",      "~125 MB", "One-time; cached in Browser Cache API"],
        ["RAM (models loaded)", "~700 MB", "Worker kept alive between dictations to avoid reload delay"],
        ["CPU during dictation","Moderate","AudioWorklet on audio thread + VAD in worker"],
        ["CPU at transcription","High (brief)","Moonshine inference on sentence completion (~1–3 sec)"],
        ["Network after cache", "0 bytes", "Fully offline once models are cached"],
    ], [3.5*cm, 2.5*cm, 8*cm]))

    # 7. Recommendations
    s += sec("7. Recommendations", H1)
    s.append(base_table([
        ["#", "Action", "Priority"],
        ["1", "Whitelist at firewall: huggingface.co, cdn-lfs.huggingface.co, cdn-lfs-us-1.huggingface.co (port 443). Required for first-time model download.", "HIGH"],
        ["2", "Allow WebAssembly in browser policy for compass.hlpgonzalezlab.com. Check Chrome Enterprise WebAssembly policy setting.", "HIGH"],
        ["3", "Host models locally on COMPASS server to eliminate CDN dependency (~125 MB). One-line change in sttConstants.ts.", "MEDIUM"],
        ["4", "Add EDR whitelist entry for COMPASS origin performing large binary downloads from HuggingFace CDN.", "MEDIUM"],
        ["5", "Inform IT: ~700 MB RAM held by browser tab after first Speak click. Expected — not a memory leak.", "LOW"],
        ["6", "Train users: first click may show 'Loading...' for 1–3 min on slow connections. Subsequent sessions are instant.", "LOW"],
    ], [0.7*cm, 12*cm, 1.5*cm]))

    # 8. Summary
    s += sec("8. Summary", H1)
    s += [
        p("The COMPASS STT feature is <b>architecturally sound from a privacy and security "
          "standpoint</b>. Audio never leaves the browser, no PHI is transmitted externally, "
          "and no BAA is required for audio processing. All component licenses (MIT, Apache-2.0) "
          "are fully permissive and appropriate for institutional clinical research use."),
        Spacer(1, 0.1*cm),
        p("The primary operational risks are <b>institutional network and policy controls</b> — "
          "specifically firewall rules blocking HuggingFace CDN and endpoint security restricting "
          "WebAssembly. These are solvable with targeted whitelisting, or by hosting model files "
          "locally on the COMPASS server."),
        Spacer(1, 0.1*cm),
        p("No code changes are required for compliance. The feature is ready for clinical use "
          "in HTTPS-served environments where the above network/policy conditions are met."),
    ]

    doc.build(s)
    print(f"EN PDF: {OUT_EN}  ({os.path.getsize(OUT_EN)//1024} KB)")


# ═════════════════════════════════════════════════════════════════════════════
# KOREAN VERSION
# ═════════════════════════════════════════════════════════════════════════════
def build_kr():
    font = "KR"

    def st(size=9, color=NAVY, align=TA_LEFT):
        return ParagraphStyle("_", fontName=font, fontSize=size,
                              textColor=color, alignment=align,
                              leading=size*1.6, wordWrap="CJK")

    TITLE = st(22, NAVY, TA_CENTER)
    SUB   = st(11, BLUE_D, TA_CENTER)
    META  = st(9,  GREY_D, TA_CENTER)
    H1    = st(13, NAVY)
    H2    = st(10, BLUE_D)
    BD    = st(9)
    SM    = st(8,  GREY_D)

    def p(text, s=None): return Paragraph(text, s or BD)

    def tbl(data, widths, hdr=NAVY):
        t = Table(data, colWidths=widths)
        t.setStyle(TableStyle([
            ("BACKGROUND",    (0,0),(-1,0),  hdr),
            ("TEXTCOLOR",     (0,0),(-1,0),  WHITE),
            ("FONTNAME",      (0,0),(-1,-1), font),
            ("FONTSIZE",      (0,0),(-1,-1), 8),
            ("VALIGN",        (0,0),(-1,-1), "TOP"),
            ("GRID",          (0,0),(-1,-1), 0.4, GRID),
            ("TOPPADDING",    (0,0),(-1,-1), 4),
            ("BOTTOMPADDING", (0,0),(-1,-1), 4),
            ("LEFTPADDING",   (0,0),(-1,-1), 6),
            ("ROWBACKGROUNDS",(0,1),(-1,-1), [LIGHT, WHITE]),
        ]))
        return t

    doc = SimpleDocTemplate(OUT_KR, pagesize=A4,
                            leftMargin=2*cm, rightMargin=2*cm,
                            topMargin=2*cm, bottomMargin=2*cm)
    s = []

    # 표지
    s += [
        Spacer(1, 1.5*cm),
        p("COMPASS 대시보드", st(14, GREY_D, TA_CENTER)),
        p("음성-텍스트 변환 (STT) 기능", TITLE),
        p("기술 및 보안 검토 보고서", SUB),
        Spacer(1, 0.4*cm),
        HRFlowable(width="100%", thickness=2, color=NAVY),
        Spacer(1, 0.3*cm),
        p("코드 구조  ·  모델 라이선스  ·  기관 환경 보안 검토", META),
        p("2026-09-25", META),
        Spacer(1, 0.8*cm),
    ]
    s.append(tbl([
        ["항목", "내용"],
        ["기능",          "Re-write Practice 패널의 브라우저 내 음성-텍스트 변환"],
        ["STT 모델",      "onnx-community/moonshine-base-ONNX  (MIT 라이선스)"],
        ["VAD 모델",      "onnx-community/silero-vad  (MIT 라이선스)"],
        ["추론 라이브러리","@huggingface/transformers v3.7.1  (Apache-2.0)"],
        ["음성 외부 전송?","없음 — 변환된 텍스트만 처리, 음성은 브라우저 탭 내부에 유지"],
        ["BAA 필요?",     "불필요 — 제3자에게 PHI(환자 정보) 전송 없음"],
    ], [4*cm, 10*cm]))

    # 1. 요약
    s += [Spacer(1, 0.3*cm), p("1. 요약", H1),
          HRFlowable(width="100%", thickness=1.5, color=NAVY), Spacer(1, 0.2*cm)]
    s += [
        p("Re-write Practice 패널의 <b>Speak 버튼</b>은 의사가 말한 내용을 텍스트로 변환하여 "
          "입력창에 추가합니다. 음성 활동 감지(VAD)와 자동 음성 인식(ASR)은 모두 "
          "<b>브라우저 탭 내부에서만</b> 실행됩니다. "
          "마이크 음성은 백엔드, Hugging Face, 그 어떤 제3자에게도 전송되지 않습니다."),
        Spacer(1, 0.1*cm),
        p("이 설계 방식 덕분에 음성 신호에 대한 <b>BAA(Business Associate Agreement)가 불필요</b>합니다. "
          "진료 상담 음성은 사용자의 브라우저 세션 외부로 저장되거나 전송되지 않기 때문입니다."),
    ]

    # 2. 코드 흐름
    s += [Spacer(1, 0.3*cm), p("2. 아키텍처 및 코드 흐름 (9단계)", H1),
          HRFlowable(width="100%", thickness=1.5, color=NAVY), Spacer(1, 0.2*cm)]
    s.append(tbl([
        ["단계", "파일", "동작"],
        ["1. Speak 클릭",    "RewriteVoiceInput.tsx",    "useSpeechToText.start() 호출"],
        ["2. 보안 검사",     "useSpeechToText.tsx:52",   "window.isSecureContext(HTTPS 필수) 및 getUserMedia 지원 여부 확인. 미충족 시 'Voice unavailable' 표시"],
        ["3. 워커 획득",     "sttWorkerHost.ts:23",      "module 타입 Web Worker(stt.worker.ts) 반환. 페이지 세션당 하나 생성, 재사용 (~700 MB RAM 유지)"],
        ["4. 모델 로드",     "stt.worker.ts:77",         "첫 클릭: silero-vad(~2 MB)·moonshine-base-ONNX(~123 MB)를 HuggingFace CDN(HTTPS)에서 다운로드. Browser Cache에 저장. 이후 클릭: 네트워크 요청 없음"],
        ["5. 마이크 열기",   "useSpeechToText.tsx:151",  "getUserMedia({sampleRate:16000, echoCancellation:true, noiseSuppression:true}). AudioWorklet(vad-processor.js)이 512샘플 단위로 분할"],
        ["6. VAD 점수화",    "stt.worker.ts:131",        "512샘플 프레임마다 Silero VAD가 음성 확률 계산. >0.3=음성 시작, <0.1=음성 종료. 400ms 묵음=문장 경계. 250ms 미만 잡음 제거"],
        ["7. 전사(ASR)",     "stt.worker.ts:230",        "완성된 음성 청크 → Moonshine ASR → {text} 반환 → {type:'text',text} 메인 스레드 전달"],
        ["8. 텍스트 추가",   "sttConstants.ts",          "appendTranscript()가 기존 내용에 스마트 공백/구두점으로 텍스트 추가. 이 시점 서버 호출 없음"],
        ["9. 중지",          "useSpeechToText.tsx:80",   "getTracks().stop()으로 마이크 즉시 해제. AudioContext.close(). 워커 유지(모델 RAM 상주). {type:'reset'}으로 진행중 전사 폐기"],
    ], [2.5*cm, 3.5*cm, 8*cm]))

    s += [Spacer(1, 0.2*cm), p("소스 파일 목록:", H2)]
    s.append(tbl([
        ["파일", "역할"],
        ["src/lib/sttConstants.ts",           "마스터 스위치, 모델 ID, 오디오 튜닝 파라미터, appendTranscript()"],
        ["src/lib/sttWorkerHost.ts",          "싱글턴 워커 수명주기 — 한 번 생성 후 세션 동안 유지"],
        ["src/workers/stt.worker.ts",         "모든 ML 추론: VAD 프레임 점수화, 문장 감지, Moonshine 전사"],
        ["src/hooks/useSpeechToText.tsx",     "브라우저 연결: 권한, AudioContext, AudioWorklet, 워커 메시지"],
        ["src/components/RewriteVoiceInput.tsx","UI: Speak 버튼, 상태 표시, 경고 배너"],
        ["public/vad-processor.js",           "AudioWorklet: 512샘플 분할 + Firefox 16kHz 리샘플러"],
        ["next.config.js",                    "Webpack: onnxruntime-node 스텁 처리, ORT 번들 비압축 유지"],
    ], [5*cm, 9*cm]))

    # 3. 라이선스
    s += [Spacer(1, 0.3*cm), p("3. 모델 및 라이선스", H1),
          HRFlowable(width="100%", thickness=1.5, color=NAVY), Spacer(1, 0.2*cm)]
    s.append(tbl([
        ["구성 요소", "식별자", "라이선스", "상업적 이용"],
        ["STT 모델",  "onnx-community/moonshine-base-ONNX", "MIT",        "자유 — 제한 없음"],
        ["원본 STT",  "UsefulSensors/moonshine-base",       "MIT",        "자유 — 제한 없음"],
        ["VAD 모델",  "onnx-community/silero-vad",           "MIT",        "자유 — 제한 없음"],
        ["추론 라이브러리","@huggingface/transformers v3.7.1","Apache-2.0","자유 + 특허 권리 포함"],
    ], [3.5*cm, 5*cm, 2*cm, 3.5*cm]))
    s += [Spacer(1, 0.15*cm),
          p("<b>결론:</b> MIT·Apache-2.0은 모두 허용적 라이선스입니다. "
            "카피레프트 없음, 사용료 없음, 임상 연구 및 기관 상업 배포에 법적 제약 없음.")]

    # 4. 네트워크
    s += [Spacer(1, 0.3*cm), p("4. 네트워크 트래픽 분석", H1),
          HRFlowable(width="100%", thickness=1.5, color=NAVY), Spacer(1, 0.2*cm)]
    s.append(tbl([
        ["이벤트", "목적지", "프로토콜", "크기", "빈도"],
        ["첫 Speak 클릭\n(모델 다운로드)", "cdn-lfs.huggingface.co", "HTTPS 443", "~125 MB 합계", "최초 1회\n(이후 캐시 사용)"],
        ["이후 클릭",        "(없음)",                "—",          "0 바이트",   "로컬 캐시 서빙"],
        ["녹음 중",          "(없음)",                "—",          "0 바이트",   "음성은 브라우저 내부"],
        ["Score 버튼 클릭",  "COMPASS 서버 (:18001)", "HTTPS",      "텍스트만",   "의사 요청 시"],
    ], [3*cm, 3.5*cm, 2*cm, 2.5*cm, 3*cm]))
    s += [Spacer(1, 0.1*cm),
          p("허용 필요 도메인: huggingface.co · cdn-lfs.huggingface.co · cdn-lfs-us-1.huggingface.co (포트 443)", SM)]

    # 5. 브라우저 호환성
    s += [Spacer(1, 0.3*cm), p("5. 브라우저 호환성", H1),
          HRFlowable(width="100%", thickness=1.5, color=NAVY), Spacer(1, 0.2*cm)]
    s.append(tbl([
        ["브라우저", "지원", "비고"],
        ["Chrome / Edge 89+",    "완전 지원", "WebGPU 우선, WASM 폴백. 16kHz AudioContext 기본 지원"],
        ["Safari 16.4+",         "완전 지원", "AudioWorklet Safari 14부터 안정. 16kHz 기본 지원"],
        ["Firefox 76+",          "부분 지원", "16kHz AudioContext 불가 — vad-processor.js가 리샘플링. WebGPU 없음 → WASM만 (~2배 느림)"],
        ["HTTP (비HTTPS)",        "차단",      "getUserMedia() 사용 불가. 'Voice input needs HTTPS' 표시"],
        ["Internet Explorer",    "미지원",    "AudioWorklet, 모듈 Worker 없음"],
    ], [3.5*cm, 2*cm, 8.5*cm]))

    # 6. 보안 검토
    s += [PageBreak()]
    s += [Spacer(1, 0.3*cm), p("6. 보안 및 기관 환경 검토", H1),
          HRFlowable(width="100%", thickness=1.5, color=NAVY), Spacer(1, 0.2*cm)]

    s += [p("<b>6.1  긍정적 보안 특성</b>", H2), Spacer(1, 0.1*cm)]
    s.append(tbl([
        ["특성", "상세"],
        ["음성 브라우저 외부 미전송",  "마이크 음성은 Web Worker 내부에서만 처리. 평문 텍스트 결과만 페이지로 전달"],
        ["제3자 음성 업로드 없음",     "Google, AWS, Azure 등 외부 음성 서비스에 대한 API 호출 없음"],
        ["중지 시 마이크 즉시 해제",   "getTracks().stop() 즉시 호출 — 브라우저 마이크 표시기 즉시 해제"],
        ["SharedArrayBuffer 미사용",   "COOP/COEP 격리 헤더 불필요. 현재 설정하지 않음"],
        ["HIPAA/PHI 음성 안전",        "음성은 PHI(의사 목소리). 장치를 벗어나지 않으므로 STT 기능에 BAA 불필요"],
        ["세션 격리",                  "{type:'reset'}으로 중지 시 진행중 전사 폐기. 세션 간 데이터 누출 없음"],
    ], [4*cm, 10*cm]))

    s += [Spacer(1, 0.25*cm), p("<b>6.2  기관 환경 위험 분석</b>", H2), Spacer(1, 0.1*cm)]
    risk_rows_kr = [
        ["위험 요소",                          "수준", "상세 및 대응 방안"],
        ["방화벽의 HuggingFace CDN 차단",       "높음", "첫 사용 시 cdn-lfs.huggingface.co에서 ~125 MB 다운로드. 차단 시 'Loading...' 상태 지속.\n대응: cdn-lfs*.huggingface.co:443 허용목록 추가, 또는 모델을 COMPASS 서버에 로컬 호스팅"],
        ["EDR/보안정책의 WebAssembly 차단",     "높음", "ONNX 런타임은 WASM을 주요 계산 백엔드로 사용. 기업 보안 도구가 .wasm 실행을 차단할 수 있음.\n대응: compass.hlpgonzalezlab.com에 대해 브라우저 정책에서 WebAssembly 허용"],
        ["EDR 휴리스틱 경고 (대용량 CDN 다운로드)","중간","의료 앱에서 외부 CDN의 ~123 MB 바이너리 다운로드가 행동 기반 탐지 규칙을 촉발할 수 있음.\n대응: EDR 정책에서 CDN 도메인 허용목록 추가. 최초 1회 이벤트"],
        ["모듈 타입 Web Worker 정책 차단",      "중간", "워커가 type:'module'로 생성됨. 기업용 Chrome/Edge 정책이 제한할 수 있음.\n대응: COMPASS origin을 허용된 워커 origin 목록에 포함"],
        ["AudioWorklet CPU 스파이크",           "낮음", "마이크 사용 중 오디오 스레드 지속 실행. DLP 도구가 CPU+마이크 사용을 모니터링할 수 있음.\n대응: 허용 가능 — 마이크는 사용자 주도로 열리고 중지 시 즉시 해제됨"],
        ["브라우저 캐시 용량 (~125 MB)",        "낮음", "디스크 쿼터 정책이 브라우저 종료 후 모델을 제거할 수 있어 다음 세션에 재다운로드 필요.\n대응: 재다운로드 허용 또는 모델 로컬 호스팅"],
        ["SharedArrayBuffer / COOP+COEP",       "없음", "사용하지 않음. 격리 헤더 불필요. 크로스-오리진 격리 없이 동작"],
        ["음성 데이터 제3자 전송",               "없음", "0 바이트의 음성이 브라우저를 벗어남. stt.worker.ts·useSpeechToText.tsx 코드 검토로 확인"],
    ]
    s.append(risk_table(risk_rows_kr, font))

    s += [Spacer(1, 0.25*cm), p("<b>6.3  메모리 프로파일</b>", H2), Spacer(1, 0.1*cm)]
    s.append(tbl([
        ["지표", "수치", "비고"],
        ["최초 다운로드",     "~125 MB",   "1회, Browser Cache API에 저장"],
        ["RAM (모델 로드 후)","~700 MB",   "워커 유지 — 재로드 지연 방지 목적"],
        ["CPU (녹음 중)",     "보통",      "오디오 스레드 AudioWorklet + 워커 VAD"],
        ["CPU (전사 시)",     "높음 (순간)","문장 완성 시 Moonshine 추론 (~1–3초)"],
        ["캐시 후 네트워크",  "0 바이트",  "모델 캐시 후 완전 오프라인"],
    ], [3.5*cm, 2.5*cm, 8*cm]))

    # 7. 권장 사항
    s += [Spacer(1, 0.3*cm), p("7. 권장 조치", H1),
          HRFlowable(width="100%", thickness=1.5, color=NAVY), Spacer(1, 0.2*cm)]
    s.append(tbl([
        ["#", "조치 내용", "우선순위"],
        ["1", "방화벽 허용목록 추가: huggingface.co, cdn-lfs.huggingface.co, cdn-lfs-us-1.huggingface.co (포트 443). 첫 번째 모델 다운로드에 필수", "높음"],
        ["2", "브라우저 정책에서 compass.hlpgonzalezlab.com에 대한 WebAssembly 허용. Chrome Enterprise WebAssembly 정책 확인", "높음"],
        ["3", "COMPASS 서버에 모델 로컬 호스팅으로 CDN 의존성 제거 (~125 MB). sttConstants.ts 한 줄 변경", "중간"],
        ["4", "HuggingFace CDN에서 대용량 다운로드를 수행하는 COMPASS origin에 대한 EDR 허용목록 추가", "중간"],
        ["5", "IT 부서에 알림: 첫 Speak 클릭 후 브라우저 탭이 ~700 MB RAM 점유. 정상 동작으로 메모리 누수 아님", "낮음"],
        ["6", "사용자 교육: 첫 클릭 시 느린 연결에서 1–3분 로딩 가능. 이후 세션은 즉시 시작. 실제 진료 전 테스트 권장", "낮음"],
    ], [0.7*cm, 12*cm, 1.5*cm]))

    # 8. 결론
    s += [Spacer(1, 0.3*cm), p("8. 결론", H1),
          HRFlowable(width="100%", thickness=1.5, color=NAVY), Spacer(1, 0.2*cm)]
    s += [
        p("COMPASS STT 기능은 <b>개인정보 보호 및 보안 측면에서 구조적으로 안전</b>합니다. "
          "음성은 브라우저를 벗어나지 않고, 외부로 PHI가 전송되지 않으며, "
          "음성 처리에 대한 BAA가 불필요합니다. "
          "모든 컴포넌트 라이선스(MIT, Apache-2.0)는 임상 연구 및 기관 상업 배포에 "
          "완전히 적합한 허용적 라이선스입니다."),
        Spacer(1, 0.1*cm),
        p("주요 운영 위험은 <b>기관의 네트워크 및 정책 통제</b>에 있습니다 — "
          "구체적으로 HuggingFace CDN을 차단하는 방화벽 규칙과 "
          "WebAssembly를 제한하는 엔드포인트 보안 정책입니다. "
          "이는 특정 도메인 허용목록 추가 또는 모델 파일 로컬 호스팅으로 해결 가능합니다."),
        Spacer(1, 0.1*cm),
        p("컴플라이언스를 위한 코드 변경은 필요하지 않습니다. "
          "위 네트워크·정책 조건이 충족된 HTTPS 환경에서 즉시 임상 사용이 가능합니다."),
    ]

    doc.build(s)
    print(f"KR PDF: {OUT_KR}  ({os.path.getsize(OUT_KR)//1024} KB)")


if __name__ == "__main__":
    build_en()
    build_kr()
    print("Done.")
