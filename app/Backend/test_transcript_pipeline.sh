#!/usr/bin/env zsh
# =============================================================================
# Transcript Analysis Pipeline — Full Test Script
#
# Automates: DB table creation → backend rebuild → analyze → DB verify
#            → history check → DB fallback download → cleanup
#
# Usage:
#   ./test_transcript_pipeline.sh                      # run all steps
#   ./test_transcript_pipeline.sh --skip-rebuild       # skip docker rebuild
#   ./test_transcript_pipeline.sh /path/to/file.xlsx   # use custom test file
#   ./test_transcript_pipeline.sh --skip-rebuild /path/to/file.xlsx
#
# Prerequisites:
#   - Docker containers running (docker compose up -d)
#   - A test xlsx file with [speaker, text] columns
# =============================================================================

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

DB_CONTAINER="prostatecancer-postgres"
BACKEND_CONTAINER="prostatecancer-backend"
DB_USER="prostatecancer_user"
DB_NAME="prostatecancer_db"
API_BASE="http://localhost:8000"
API_KEY="$(docker exec "$BACKEND_CONTAINER" printenv API_KEY 2>/dev/null || echo "default-dev-key")"

# Default test file (override with first non-flag argument)
DEFAULT_TEST_FILE="$SCRIPT_DIR/../../data/From_Luu_Michael/Data_processing_script_for_NLP_input/processed_transcripts_sid-01.xlsx"

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── Counters ─────────────────────────────────────────────────────────────────
PASS=0
FAIL=0

# ── Helper functions ─────────────────────────────────────────────────────────
info()    { echo -e "${CYAN}[INFO]${NC}  $1"; }
ok()      { echo -e "${GREEN}[PASS]${NC}  $1"; PASS=$((PASS + 1)); }
fail()    { echo -e "${RED}[FAIL]${NC}  $1"; FAIL=$((FAIL + 1)); }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
header()  { echo -e "\n${BOLD}══════════════════════════════════════════════════════${NC}"; echo -e "${BOLD}  $1${NC}"; echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"; }

psql_exec() {
    docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A -c "$1" 2>/dev/null
}

# ── Parse arguments ──────────────────────────────────────────────────────────
SKIP_REBUILD=false
TEST_FILE=""

for arg in "$@"; do
    case "$arg" in
        --skip-rebuild) SKIP_REBUILD=true ;;
        --help|-h)
            echo "Usage: $0 [--skip-rebuild] [/path/to/test.xlsx]"
            echo ""
            echo "Options:"
            echo "  --skip-rebuild   Skip docker compose build & restart"
            echo "  /path/to/file    Use a custom xlsx test file"
            echo ""
            echo "Examples:"
            echo "  $0                                    # full pipeline with default file"
            echo "  $0 --skip-rebuild                     # skip rebuild, use default file"
            echo "  $0 /tmp/my_transcript.xlsx            # use custom file"
            echo "  $0 --skip-rebuild /tmp/my_file.xlsx   # skip rebuild + custom file"
            exit 0
            ;;
        *)
            if [ -f "$arg" ]; then
                TEST_FILE="$arg"
            else
                echo -e "${RED}Error: file not found: $arg${NC}"
                exit 1
            fi
            ;;
    esac
done

# Resolve test file
if [ -z "$TEST_FILE" ]; then
    if [ -f "$DEFAULT_TEST_FILE" ]; then
        TEST_FILE="$DEFAULT_TEST_FILE"
    else
        echo -e "${RED}Error: No test file found. Provide a path as argument.${NC}"
        echo "Usage: $0 [--skip-rebuild] /path/to/processed_transcripts_xxx.xlsx"
        exit 1
    fi
fi

info "Test file: $TEST_FILE"

# ── Pre-flight checks ───────────────────────────────────────────────────────
header "Step 0: Pre-flight Checks"

if ! docker info > /dev/null 2>&1; then
    fail "Docker is not running"
    exit 1
fi
ok "Docker is running"

if ! docker ps --format '{{.Names}}' | grep -q "$DB_CONTAINER"; then
    fail "$DB_CONTAINER is not running"
    exit 1
fi
ok "$DB_CONTAINER is running"

if ! docker ps --format '{{.Names}}' | grep -q "$BACKEND_CONTAINER"; then
    fail "$BACKEND_CONTAINER is not running"
    exit 1
fi
ok "$BACKEND_CONTAINER is running"

# ── Step 1: Create DB table ─────────────────────────────────────────────────
header "Step 1: Create DB Table (if not exists)"

psql_exec "
CREATE TABLE IF NOT EXISTS transcript_analysis_log (
    id SERIAL PRIMARY KEY,
    patient_id VARCHAR(255) NOT NULL,
    total_sentences INT NOT NULL DEFAULT 0,
    top_n INT NOT NULL DEFAULT 0,
    context_window INT NOT NULL DEFAULT 3,
    model_results TEXT,
    xlsx_data BYTEA,
    source_filename VARCHAR(500),
    analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transcript_log_patient_id ON transcript_analysis_log(patient_id);
CREATE INDEX IF NOT EXISTS idx_transcript_log_analyzed_at ON transcript_analysis_log(analyzed_at);
" > /dev/null 2>&1

# Verify table exists
TABLE_EXISTS=$(psql_exec "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='transcript_analysis_log';")
if [ "$TABLE_EXISTS" = "1" ]; then
    ok "transcript_analysis_log table exists"
else
    fail "Table creation failed"
    exit 1
fi

COL_COUNT=$(psql_exec "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='transcript_analysis_log';")
info "Table has $COL_COUNT columns"

# ── Step 2: Rebuild backend ─────────────────────────────────────────────────
header "Step 2: Rebuild & Restart Backend"

if [ "$SKIP_REBUILD" = true ]; then
    warn "Skipping rebuild (--skip-rebuild flag)"
else
    info "Building backend image..."
    docker compose build backend > /dev/null 2>&1
    ok "Backend image built"

    info "Restarting backend container..."
    docker compose up -d backend > /dev/null 2>&1

    info "Waiting for backend to become healthy (up to 30s)..."
    for i in $(seq 1 30); do
        STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$BACKEND_CONTAINER" 2>/dev/null || echo "unknown")
        if [ "$STATUS" = "healthy" ]; then
            break
        fi
        sleep 1
    done

    STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$BACKEND_CONTAINER" 2>/dev/null || echo "unknown")
    if [ "$STATUS" = "healthy" ]; then
        ok "Backend is healthy"
    else
        fail "Backend did not become healthy (status: $STATUS)"
        warn "Check logs: docker compose logs backend"
        exit 1
    fi
fi

# ── Step 3: Record baseline count ───────────────────────────────────────────
BASELINE_COUNT=$(psql_exec "SELECT COUNT(*) FROM transcript_analysis_log;")
info "Baseline DB rows: $BASELINE_COUNT"

# ── Step 4: Run analysis (top_n=0) ──────────────────────────────────────────
header "Step 3: Run Analysis (top_n=0)"

info "Uploading $TEST_FILE ..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/api/transcript/analyze" \
    -H "X-API-Key: $API_KEY" \
    -F "file=@${TEST_FILE}" \
    -F "top_n=0" \
    -F "context_window=3" 2>&1)

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    PATIENT_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['patient_id'])" 2>/dev/null)
    TOTAL_SENT=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['total_sentences'])" 2>/dev/null)
    ok "Analysis succeeded: patient_id=$PATIENT_ID, total_sentences=$TOTAL_SENT"
else
    fail "Analysis failed (HTTP $HTTP_CODE)"
    echo "$BODY" | head -5
    exit 1
fi

# ── Step 5: Verify DB row ───────────────────────────────────────────────────
header "Step 4: Verify DB Storage"

NEW_COUNT=$(psql_exec "SELECT COUNT(*) FROM transcript_analysis_log;")
EXPECTED=$((BASELINE_COUNT + 1))

if [ "$NEW_COUNT" -ge "$EXPECTED" ]; then
    ok "DB row count: $BASELINE_COUNT → $NEW_COUNT"
else
    fail "Expected $EXPECTED rows, got $NEW_COUNT"
fi

# Show the latest row
info "Latest DB record:"
psql_exec "
SELECT id, patient_id, total_sentences, top_n, context_window,
       source_filename, analyzed_at,
       length(xlsx_data) AS xlsx_bytes,
       length(model_results) AS json_chars
FROM transcript_analysis_log
ORDER BY id DESC LIMIT 1;
" | while IFS='|' read -r id pid ts tn cw fn at xb jc; do
    echo "       id=$id  patient_id=$pid  sentences=$ts  top_n=$tn  window=$cw"
    echo "       file=$fn  xlsx=${xb}B  json=${jc}chars"
    echo "       analyzed_at=$at"
done

# ── Step 6: Run second analysis (top_n=5) ───────────────────────────────────
header "Step 5: Run Second Analysis (top_n=5, history test)"

RESPONSE2=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/api/transcript/analyze" \
    -H "X-API-Key: $API_KEY" \
    -F "file=@${TEST_FILE}" \
    -F "top_n=5" \
    -F "context_window=3" 2>&1)

HTTP_CODE2=$(echo "$RESPONSE2" | tail -1)
if [ "$HTTP_CODE2" = "200" ]; then
    ok "Second analysis succeeded (top_n=5)"
else
    fail "Second analysis failed (HTTP $HTTP_CODE2)"
fi

# ── Step 7: Check history endpoint ──────────────────────────────────────────
header "Step 6: Verify History Endpoint"

HISTORY=$(curl -s "$API_BASE/api/transcript/history/$PATIENT_ID" \
    -H "X-API-Key: $API_KEY" 2>&1)

HISTORY_TOTAL=$(echo "$HISTORY" | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])" 2>/dev/null)
HISTORY_ITEMS=$(echo "$HISTORY" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['items']))" 2>/dev/null)

if [ "$HISTORY_ITEMS" -ge 2 ]; then
    ok "History has $HISTORY_TOTAL entries (showing $HISTORY_ITEMS)"
else
    fail "Expected >= 2 history entries, got $HISTORY_ITEMS"
fi

info "History entries:"
echo "$HISTORY" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for item in data['items']:
    print(f\"       id={item['id']}  top_n={item['top_n']}  window={item['context_window']}  has_xlsx={item['has_xlsx']}  at={item['analyzed_at']}\")
" 2>/dev/null

# ── Step 8: Test DB fallback download ────────────────────────────────────────
header "Step 7: Test DB Fallback Download"

# Delete file from disk inside container
CONTAINER_FILE="/app/uploads/${PATIENT_ID}_predictions.xlsx"
docker exec "$BACKEND_CONTAINER" rm -f "$CONTAINER_FILE" 2>/dev/null
FILE_EXISTS=$(docker exec "$BACKEND_CONTAINER" test -f "$CONTAINER_FILE" && echo "yes" || echo "no")

if [ "$FILE_EXISTS" = "no" ]; then
    ok "Deleted $CONTAINER_FILE from container disk"
else
    warn "File still exists on disk — fallback won't be triggered"
fi

# Try downloading (should come from DB)
TMPFILE=$(mktemp /tmp/transcript_test_XXXXXX.xlsx)
DL_CODE=$(curl -s -o "$TMPFILE" -w "%{http_code}" \
    "$API_BASE/api/transcript/download/$PATIENT_ID" \
    -H "X-API-Key: $API_KEY" 2>&1)

DL_SIZE=$(wc -c < "$TMPFILE" | tr -d ' ')
rm -f "$TMPFILE"

if [ "$DL_CODE" = "200" ] && [ "$DL_SIZE" -gt 0 ]; then
    ok "DB fallback download succeeded (HTTP $DL_CODE, $DL_SIZE bytes)"
else
    fail "DB fallback download failed (HTTP $DL_CODE, $DL_SIZE bytes)"
fi

# ── Step 9: Cleanup test data (optional) ─────────────────────────────────────
header "Step 8: Cleanup"

# Count rows we created in this test run
TEST_ROWS=$((NEW_COUNT - BASELINE_COUNT + 1))  # +1 for the second analysis
info "This test created ~$TEST_ROWS rows for patient_id=$PATIENT_ID"
echo ""
echo -e "  ${YELLOW}To keep test data:${NC} do nothing"
echo -e "  ${YELLOW}To delete test data:${NC}"
echo "    docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME \\"
echo "      -c \"DELETE FROM transcript_analysis_log WHERE patient_id='$PATIENT_ID';\""
echo ""

# ── Summary ──────────────────────────────────────────────────────────────────
header "Results"

TOTAL=$((PASS + FAIL))
if [ "$FAIL" -eq 0 ]; then
    echo -e "  ${GREEN}All $PASS/$TOTAL tests passed${NC}"
    echo ""
    exit 0
else
    echo -e "  ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC} (out of $TOTAL)"
    echo ""
    exit 1
fi
