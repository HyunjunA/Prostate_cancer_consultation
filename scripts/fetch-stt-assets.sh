#!/usr/bin/env bash
#
# Fetch every asset the speech-to-text feature would otherwise pull from a
# third-party origin at runtime, and place it under the webapp's public/ tree
# so the browser only ever talks to the COMPASS server.
#
# Two origins are removed by this script:
#   1. huggingface.co   — the ASR and VAD model weights
#   2. cdn.jsdelivr.net — the ONNX Runtime WASM binaries
#
# The WASM binaries are not downloaded: jsDelivr serves the same files that
# ship inside node_modules/@huggingface/transformers/dist/, so they are copied
# from there. Run `npm install` in app/Webapp first.
#
# Model revisions are pinned. Without a pin, two clinicians onboarding a month
# apart can receive different weights with no change to COMPASS.
#
# Safe to re-run: a file whose size already matches the manifest is skipped.
#
# Usage:
#   bash scripts/fetch-stt-assets.sh            # fetch and verify
#   bash scripts/fetch-stt-assets.sh --verify   # verify only, download nothing

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEBAPP="${REPO_ROOT}/app/Webapp"
MODEL_DIR="${WEBAPP}/public/stt-models"
WASM_DIR="${WEBAPP}/public/stt-wasm"
DIST_DIR="${WEBAPP}/node_modules/@huggingface/transformers/dist"

ASR_REPO="onnx-community/moonshine-base-ONNX"
ASR_REV="b1e9b6aae3c3c7298f10c3798393fdf38e8fbbad"
VAD_REPO="onnx-community/silero-vad"
VAD_REV="e71cae966052b992a7eca6b17738916ce0eca4ec"

VERIFY_ONLY=0
[[ "${1:-}" == "--verify" ]] && VERIFY_ONLY=1

# repo | relative path | expected bytes
#
# Only the files the worker actually requests are listed. Both decoder
# quantisations are required: the worker picks q4 when a WebGPU adapter is
# available and the quantized (q8) build otherwise, and with remote loading
# disabled a missing file is a hard failure rather than a silent fallback.
MANIFEST=(
  "ASR|config.json|922"
  "ASR|generation_config.json|147"
  "ASR|preprocessor_config.json|128"
  "ASR|special_tokens_map.json|3"
  "ASR|tokenizer.json|3761754"
  "ASR|tokenizer_config.json|135735"
  "ASR|onnx/encoder_model.onnx|80818781"
  "ASR|onnx/decoder_model_merged_q4.onnx|72781828"
  "ASR|onnx/decoder_model_merged_quantized.onnx|42498870"
  "VAD|onnx/model.onnx|2243022"
  "VAD|LICENSE|1075"
)

WASM_FILES=(
  "ort-wasm-simd-threaded.jsep.mjs"
  "ort-wasm-simd-threaded.jsep.wasm"
)

file_size() {
  [[ -f "$1" ]] && stat -c%s "$1" || echo 0
}

fail=0
downloaded=0
skipped=0

echo "==> Model weights -> ${MODEL_DIR#"${REPO_ROOT}/"}"

for entry in "${MANIFEST[@]}"; do
  IFS='|' read -r which rel expected <<<"${entry}"

  if [[ "${which}" == "ASR" ]]; then
    repo="${ASR_REPO}"; rev="${ASR_REV}"
  else
    repo="${VAD_REPO}"; rev="${VAD_REV}"
  fi

  dest="${MODEL_DIR}/${repo}/${rel}"
  actual="$(file_size "${dest}")"

  if [[ "${actual}" == "${expected}" ]]; then
    skipped=$((skipped + 1))
    continue
  fi

  if [[ "${VERIFY_ONLY}" == "1" ]]; then
    printf '    MISSING  %s/%s (have %s bytes, want %s)\n' "${repo}" "${rel}" "${actual}" "${expected}"
    fail=$((fail + 1))
    continue
  fi

  printf '    fetch    %s/%s (%s bytes)\n' "${repo}" "${rel}" "${expected}"
  mkdir -p "$(dirname "${dest}")"
  curl -fsSL --retry 3 --retry-delay 2 \
    "https://huggingface.co/${repo}/resolve/${rev}/${rel}" -o "${dest}.part"
  mv "${dest}.part" "${dest}"

  actual="$(file_size "${dest}")"
  if [[ "${actual}" != "${expected}" ]]; then
    printf '    SIZE MISMATCH %s/%s: got %s, expected %s\n' "${repo}" "${rel}" "${actual}" "${expected}"
    printf '      The pinned revision may have been rewritten. Do not ignore this.\n'
    fail=$((fail + 1))
  else
    downloaded=$((downloaded + 1))
  fi
done

echo "==> ONNX Runtime WASM -> ${WASM_DIR#"${REPO_ROOT}/"}"

if [[ ! -d "${DIST_DIR}" ]]; then
  echo "    ERROR: ${DIST_DIR#"${REPO_ROOT}/"} not found. Run 'npm install' in app/Webapp first."
  exit 1
fi

mkdir -p "${WASM_DIR}"
for f in "${WASM_FILES[@]}"; do
  src="${DIST_DIR}/${f}"
  dest="${WASM_DIR}/${f}"

  if [[ ! -f "${src}" ]]; then
    printf '    ERROR: %s missing from the installed package\n' "${f}"
    fail=$((fail + 1))
    continue
  fi

  if [[ "$(file_size "${src}")" == "$(file_size "${dest}")" ]]; then
    skipped=$((skipped + 1))
    continue
  fi

  if [[ "${VERIFY_ONLY}" == "1" ]]; then
    printf '    MISSING  %s\n' "${f}"
    fail=$((fail + 1))
    continue
  fi

  printf '    copy     %s (%s bytes)\n' "${f}" "$(file_size "${src}")"
  cp "${src}" "${dest}"
  downloaded=$((downloaded + 1))
done

total=$(du -sb "${MODEL_DIR}" "${WASM_DIR}" 2>/dev/null | awk '{s+=$1} END {print s}')
echo
printf '==> %s fetched, %s already present, %s problem(s). Total on disk: %s MB\n' \
  "${downloaded}" "${skipped}" "${fail}" "$((total / 1000000))"

if [[ "${fail}" != "0" ]]; then
  echo "    Speech-to-text will NOT work until these are resolved:"
  echo "    the worker sets env.allowRemoteModels = false, so a missing file"
  echo "    raises an error instead of falling back to huggingface.co."
  exit 1
fi

echo "    No third-party origin is contacted at runtime."
