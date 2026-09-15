"""Generate NETWORK_DIAGRAM_KR.pdf using only tables and paragraphs (no custom canvas)."""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, KeepTogether
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ── font ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_PATH = os.path.join(SCRIPT_DIR, "..", "_fonts", "NotoSansKR.ttf")
FONT = "NotoKR"
pdfmetrics.registerFont(TTFont(FONT, FONT_PATH))

OUT = os.path.join(SCRIPT_DIR, "..", "docs", "architecture", "NETWORK_DIAGRAM_KR.pdf")

W, H = A4
CONTENT_W = W - 4 * cm  # left+right margin 2cm each

# ── styles ───────────────────────────────────────────────────────────────────
def sty(size=10, color=colors.black, align=TA_LEFT, bold=False, leading=None):
    return ParagraphStyle(
        "s",
        fontName=FONT,
        fontSize=size,
        textColor=color,
        alignment=align,
        leading=leading or size * 1.55,
        wordWrap="CJK",
    )

TITLE  = sty(20, colors.HexColor("#1a3a5c"), TA_CENTER)
HEAD2  = sty(13, colors.HexColor("#1a3a5c"))
BODY   = sty(9.5)
SMALL  = sty(8.5, colors.HexColor("#555555"))
CENTER = sty(9, align=TA_CENTER)

C_BLUE   = colors.HexColor("#dce8f5")
C_BLUE_D = colors.HexColor("#2d5f8a")
C_GREEN  = colors.HexColor("#eafaf1")
C_GREEN_D= colors.HexColor("#1e8449")
C_RED    = colors.HexColor("#fdedec")
C_RED_D  = colors.HexColor("#c0392b")
C_YELLOW = colors.HexColor("#fef9e7")
C_YELLOW_D=colors.HexColor("#d4ac0d")
C_ORANGE = colors.HexColor("#fdf2e9")
C_ORANGE_D=colors.HexColor("#d35400")
C_NAVY   = colors.HexColor("#1a3a5c")
C_WHITE  = colors.white
C_GRID   = colors.HexColor("#c0d0e0")

def P(text, style=None):
    return Paragraph(text, style or BODY)

def node(text, fill=C_BLUE, stroke=C_BLUE_D, text_color=C_NAVY, size=9.5):
    """Single-cell table that looks like a rounded box."""
    s = sty(size, text_color, TA_CENTER)
    t = Table([[P(text, s)]], colWidths=[CONTENT_W * 0.55])
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,-1), fill),
        ("BOX",          (0,0), (-1,-1), 1.5, stroke),
        ("TOPPADDING",   (0,0), (-1,-1), 7),
        ("BOTTOMPADDING",(0,0), (-1,-1), 7),
        ("LEFTPADDING",  (0,0), (-1,-1), 6),
        ("RIGHTPADDING", (0,0), (-1,-1), 6),
    ]))
    return t

def arrow(label="", ok=True):
    """Arrow row: just a centered text arrow."""
    clr = C_GREEN_D if ok else C_RED_D
    s = sty(9, clr, TA_CENTER)
    t = Table([[P(label + "  ▼", s)]], colWidths=[CONTENT_W * 0.55])
    t.setStyle(TableStyle([
        ("TOPPADDING",   (0,0),(-1,-1), 1),
        ("BOTTOMPADDING",(0,0),(-1,-1), 1),
    ]))
    return t

def badge(text, fill, stroke):
    s = sty(9, C_WHITE, TA_CENTER)
    t = Table([[P(text, s)]], colWidths=[CONTENT_W * 0.55])
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(-1,-1), fill),
        ("BOX",          (0,0),(-1,-1), 1.2, stroke),
        ("TOPPADDING",   (0,0),(-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5),
    ]))
    return t

def center_wrap(flowable):
    """Wrap a flowable in a centering table."""
    t = Table([[flowable]], colWidths=[CONTENT_W])
    t.setStyle(TableStyle([
        ("ALIGN",  (0,0),(-1,-1), "CENTER"),
        ("VALIGN", (0,0),(-1,-1), "MIDDLE"),
        ("TOPPADDING",   (0,0),(-1,-1), 0),
        ("BOTTOMPADDING",(0,0),(-1,-1), 0),
        ("LEFTPADDING",  (0,0),(-1,-1), 0),
        ("RIGHTPADDING", (0,0),(-1,-1), 0),
    ]))
    return t

def flow_diagram(nodes_arrows):
    """Build a centered column of nodes + arrows. nodes_arrows is a list of flowables."""
    rows = [[f] for f in nodes_arrows]
    t = Table(rows, colWidths=[CONTENT_W * 0.55])
    t.setStyle(TableStyle([
        ("ALIGN",        (0,0),(-1,-1), "CENTER"),
        ("VALIGN",       (0,0),(-1,-1), "MIDDLE"),
        ("TOPPADDING",   (0,0),(-1,-1), 0),
        ("BOTTOMPADDING",(0,0),(-1,-1), 0),
        ("LEFTPADDING",  (0,0),(-1,-1), 0),
        ("RIGHTPADDING", (0,0),(-1,-1), 0),
    ]))
    # wrap in centering outer table
    outer = Table([[t]], colWidths=[CONTENT_W])
    outer.setStyle(TableStyle([
        ("ALIGN",  (0,0),(-1,-1), "CENTER"),
        ("VALIGN", (0,0),(-1,-1), "TOP"),
        ("TOPPADDING",   (0,0),(-1,-1), 0),
        ("BOTTOMPADDING",(0,0),(-1,-1), 0),
        ("LEFTPADDING",  (0,0),(-1,-1), 0),
        ("RIGHTPADDING", (0,0),(-1,-1), 0),
    ]))
    return outer

# ── build ─────────────────────────────────────────────────────────────────────
def build():
    doc = SimpleDocTemplate(
        OUT, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
    )
    story = []

    # ── 표지 ─────────────────────────────────────────────────────────────────
    story += [
        P("COMPASS 프로덕션 서버 네트워크 현황", TITLE),
        P("compass.hlpgonzalezlab.com  /  compassdb.hlpgonzalezlab.com",
          sty(9.5, colors.HexColor("#555555"), TA_CENTER)),
        P("작성일: 2026-09-15", sty(9, colors.HexColor("#888888"), TA_CENTER)),
        Spacer(1, 0.3*cm),
        HRFlowable(width="100%", thickness=1.5, color=C_NAVY),
        Spacer(1, 0.4*cm),
    ]

    # ── 1. 요약 표 ───────────────────────────────────────────────────────────
    story.append(P("1. 한 눈에 보는 현재 상태", HEAD2))
    story.append(Spacer(1, 0.2*cm))

    sum_data = [
        ["도메인", "포트", "이전", "현재", "비고"],
        ["compass.hlpgonzalezlab.com",  ":3000", "502 ✕", "200 ✅", "오늘 해결"],
        ["compassdb.hlpgonzalezlab.com",":5432", "502 ✕", "502 ✕", "구조 문제"],
    ]
    sum_t = Table(sum_data, colWidths=[5.5*cm, 2*cm, 1.8*cm, 1.8*cm, 2.4*cm])
    sum_t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,0),  C_NAVY),
        ("TEXTCOLOR",     (0,0),(-1,0),  C_WHITE),
        ("FONTNAME",      (0,0),(-1,-1), FONT),
        ("FONTSIZE",      (0,0),(-1,-1), 9),
        ("ALIGN",         (0,0),(-1,-1), "CENTER"),
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [colors.HexColor("#f5f8fb"), C_WHITE]),
        ("GRID",          (0,0),(-1,-1), 0.5, C_GRID),
        ("TOPPADDING",    (0,0),(-1,-1), 6),
        ("BOTTOMPADDING", (0,0),(-1,-1), 6),
        ("TEXTCOLOR",     (3,1),(3,1),   C_GREEN_D),
        ("TEXTCOLOR",     (3,2),(3,2),   C_RED_D),
    ]))
    story += [sum_t, Spacer(1, 0.5*cm)]

    # ── 2. 502란? ────────────────────────────────────────────────────────────
    story.append(P("2. 502 오류란 무엇인가?", HEAD2))
    story.append(Spacer(1, 0.15*cm))
    story.append(P(
        "502 Bad Gateway는 <b>중간 전달자(ALB)가 실제 서버에 연결하지 못했을 때</b> "
        "브라우저에 돌아오는 오류입니다. 서버가 꺼진 것이 아니라, ALB와 서버 사이의 연결이 "
        "실패한 것입니다."))
    story.append(Spacer(1, 0.1*cm))
    story.append(P(
        "비유: 식당에 간판과 정문이 있는데, 손님이 들어오면 주방으로 가는 통로가 막혀 있어서 "
        "\"연결 실패\" 안내만 보게 되는 상황입니다.", SMALL))
    story.append(Spacer(1, 0.5*cm))

    # ── 3. compass 해결됨 ────────────────────────────────────────────────────
    story.append(P("3. compass.hlpgonzalezlab.com — 502 → 200 해결 완료", HEAD2))
    story.append(Spacer(1, 0.15*cm))
    story.append(P(
        "<b>원인:</b> ALB가 HTTPS로 요청을 보내는데, 웹앱은 평문 HTTP만 알고 "
        "루프백(127.0.0.1)에만 열려 있어 ALB가 접근하면 거절당했습니다."))
    story.append(P(
        "<b>해결:</b> nginx를 TLS 통역사로 사설 IP(:3000)에 추가해 "
        "ALB ↔ 웹앱 사이를 연결했습니다."))
    story.append(Spacer(1, 0.3*cm))

    # 흐름도
    diag1 = flow_diagram([
        node("인터넷 사용자 / 브라우저",        C_BLUE,   C_BLUE_D),
        arrow("HTTPS 요청"),
        node("AWS ALB  (cbm-public-alb-1)",     C_YELLOW, C_YELLOW_D),
        arrow("HTTPS → :3000"),
        node("nginx TLS 통역사  ★ 오늘 추가",  C_GREEN,  C_GREEN_D),
        arrow("평문 HTTP → 127.0.0.1:3000"),
        node("Next.js 웹앱  (4주째 정상 가동)", C_GREEN,  C_GREEN_D),
        badge("✅  502 → 200  해결 완료",        C_GREEN_D, colors.HexColor("#155724")),
    ])
    story += [KeepTogether(diag1), Spacer(1, 0.3*cm)]

    # before/after 표
    ba = [
        ["구분", "이전 (502)", "현재 (200 ✅)"],
        ["웹앱 바인딩",  "127.0.0.1:3000만",    "nginx가 10.177.43.229:3000 수신"],
        ["프로토콜",     "HTTP만",               "nginx가 HTTPS ↔ HTTP 변환"],
        ["ALB 헬스체크", "응답 없음 → 502",     "200 OK 즉시 응답"],
    ]
    ba_t = Table(ba, colWidths=[3.5*cm, 5*cm, 5.5*cm])
    ba_t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,0),  C_NAVY),
        ("TEXTCOLOR",     (0,0),(-1,0),  C_WHITE),
        ("FONTNAME",      (0,0),(-1,-1), FONT),
        ("FONTSIZE",      (0,0),(-1,-1), 8.5),
        ("ALIGN",         (0,0),(-1,-1), "CENTER"),
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [colors.HexColor("#f5f8fb"), C_WHITE]),
        ("GRID",          (0,0),(-1,-1), 0.5, C_GRID),
        ("TOPPADDING",    (0,0),(-1,-1), 5),
        ("BOTTOMPADDING", (0,0),(-1,-1), 5),
    ]))
    story += [ba_t, Spacer(1, 0.6*cm)]

    # ── 4. compassdb 미해결 ──────────────────────────────────────────────────
    story.append(P("4. compassdb.hlpgonzalezlab.com — 502 미해결 (구조적 문제)", HEAD2))
    story.append(Spacer(1, 0.15*cm))
    story.append(P(
        "ALB는 <b>HTTP/HTTPS 웹 언어</b>로 요청을 보냅니다. "
        "그런데 포트 5432의 PostgreSQL은 <b>데이터베이스 전용 언어</b>만 사용합니다. "
        "서로 다른 언어라 어떻게 연결해도 대화가 성립하지 않습니다."))
    story.append(Spacer(1, 0.3*cm))

    diag2 = flow_diagram([
        node("인터넷 사용자 / 브라우저",          C_BLUE,  C_BLUE_D),
        arrow("HTTPS 요청"),
        node("AWS ALB  (cbm-public-alb-1)",       C_YELLOW,C_YELLOW_D),
        arrow("HTTPS → :5432  (웹 언어)", ok=False),
        node("PostgreSQL  (데이터베이스 언어만 사용)", C_RED, C_RED_D,
             text_color=colors.HexColor("#922b21")),
        badge("✕  언어 불일치 → 대화 불가 → 502", C_RED_D, colors.HexColor("#922b21")),
    ])
    story += [KeepTogether(diag2), Spacer(1, 0.5*cm)]

    # ── 5. compassdb 해결 방법 ───────────────────────────────────────────────
    story.append(P("5. compassdb를 해결하려면?", HEAD2))
    story.append(Spacer(1, 0.15*cm))
    story.append(P(
        "5432 포트에 <b>웹 기반 DB 관리 화면(pgAdmin 등)을 nginx 뒤에 설치</b>하면 "
        "ALB가 정상 응답을 받을 수 있습니다. "
        "단, 아래 두 가지를 먼저 확인해야 합니다."))
    story.append(Spacer(1, 0.25*cm))

    diag3 = flow_diagram([
        node("인터넷 사용자 / 브라우저",          C_BLUE,   C_BLUE_D),
        arrow("HTTPS 요청"),
        node("AWS ALB",                           C_YELLOW, C_YELLOW_D),
        arrow("HTTPS → :5432"),
        node("nginx TLS 통역사  ← 추가 필요",    C_ORANGE, C_ORANGE_D),
        arrow("HTTP"),
        node("pgAdmin / DB 관리 화면  ← 설치 필요", C_ORANGE, C_ORANGE_D),
        arrow("DB 쿼리"),
        node("PostgreSQL  (정상 가동 중)",        C_GREEN,  C_GREEN_D),
        badge("⚠  가능하나 보안 검토 필요",       C_ORANGE_D, colors.HexColor("#a04000")),
    ])
    story += [KeepTogether(diag3), Spacer(1, 0.3*cm)]

    check_data = [
        ["확인 항목", "이유"],
        ["이 도메인으로 무엇을 보여주려 했는가?",
         "DB 관리 화면인지 다른 의도인지 담당자 확인 필요"],
        ["공개 인터넷에 DB 관리 화면을 노출해도 되는가?",
         "환자 데이터가 든 DB라 보안 검토 필수"],
    ]
    ct = Table(check_data, colWidths=[5.5*cm, 8.5*cm])
    ct.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,0),  colors.HexColor("#7d6608")),
        ("TEXTCOLOR",     (0,0),(-1,0),  C_WHITE),
        ("FONTNAME",      (0,0),(-1,-1), FONT),
        ("FONTSIZE",      (0,0),(-1,-1), 8.5),
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [C_YELLOW, C_WHITE]),
        ("GRID",          (0,0),(-1,-1), 0.5, C_GRID),
        ("TOPPADDING",    (0,0),(-1,-1), 6),
        ("BOTTOMPADDING", (0,0),(-1,-1), 6),
        ("LEFTPADDING",   (0,0),(-1,-1), 6),
    ]))
    story += [ct, Spacer(1, 0.6*cm)]

    # ── 6. 오늘 완료한 작업 ──────────────────────────────────────────────────
    story += [
        HRFlowable(width="100%", thickness=1, color=C_GRID),
        Spacer(1, 0.3*cm),
        P("6. 오늘(2026-09-15) 완료한 전체 작업", HEAD2),
        Spacer(1, 0.15*cm),
    ]

    done_data = [
        ["작업 내용", "결과"],
        ["production/official 브랜치 pull (43커밋 반영)",      "완료 ✅"],
        ["백엔드 재시작 — 보안 수정 코드 반영 (jwt_auth.py)", "완료 ✅"],
        ["JWT_SECRET 교체 — 위조 토큰 차단 확인 (HTTP 401)",  "완료 ✅"],
        ["환자 실명 파일 권한 축소 (chmod 600, 15개 파일)",    "완료 ✅"],
        ["nginx TLS 통역사 기동 (podman)",                     "완료 ✅"],
        ["compass.hlpgonzalezlab.com  502 → 200",              "완료 ✅"],
        ["재부팅 후 자동 복구 systemd 등록",                   "완료 ✅"],
        ["compassdb.hlpgonzalezlab.com 502 해결",               "대기 — 의도 확인 필요"],
        ["관리자 비밀번호 교체 (admin1234567)",                 "대기 — 요청 시 진행"],
    ]
    dt = Table(done_data, colWidths=[10.5*cm, 3.5*cm])
    dt.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,0),  C_NAVY),
        ("TEXTCOLOR",     (0,0),(-1,0),  C_WHITE),
        ("FONTNAME",      (0,0),(-1,-1), FONT),
        ("FONTSIZE",      (0,0),(-1,-1), 9),
        ("ALIGN",         (1,0),(1,-1),  "CENTER"),
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [colors.HexColor("#f5f8fb"), C_WHITE]),
        ("GRID",          (0,0),(-1,-1), 0.5, C_GRID),
        ("TOPPADDING",    (0,0),(-1,-1), 5),
        ("BOTTOMPADDING", (0,0),(-1,-1), 5),
        ("LEFTPADDING",   (0,0),(-1,-1), 5),
        ("TEXTCOLOR",     (1,1),(1,7),   C_GREEN_D),
        ("TEXTCOLOR",     (1,8),(1,9),   C_ORANGE_D),
    ]))
    story.append(dt)

    doc.build(story)
    print(f"PDF 저장 완료: {OUT}")


if __name__ == "__main__":
    build()
