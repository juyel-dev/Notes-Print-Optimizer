#!/usr/bin/env bash
# Resilient production build for CI.
#
# `next build` downloads Google Fonts at build time, so an occasional network
# hiccup fails an otherwise healthy build (seen as sporadic "Build" failures in
# one matrix job while its siblings pass on the same commit). This wrapper:
#   - retries ONLY when the log shows a network-type error (never masks a real
#     compile/type error, which fails immediately),
#   - writes the first error lines as GitHub annotations (::warning:: / ::error::),
#     which are readable through the checks API even when raw logs are not.
#
# Usage: scripts/ci-build.sh          (BUILD_CMD / MAX_ATTEMPTS / RETRY_DELAY override for tests)
set -uo pipefail

BUILD_CMD="${BUILD_CMD:-npm run build}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-3}"
RETRY_DELAY="${RETRY_DELAY:-15}"
LOG="$(mktemp)"
NETWORK_RE='Failed to fetch|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|503 Service|502 Bad Gateway'

attempt=1
while true; do
  echo "::group::build attempt ${attempt}/${MAX_ATTEMPTS}"
  bash -c "$BUILD_CMD" 2>&1 | tee "$LOG"
  status=${PIPESTATUS[0]}
  echo "::endgroup::"
  if [ "$status" -eq 0 ]; then
    [ "$attempt" -gt 1 ] && echo "::warning::Build succeeded on attempt ${attempt} (earlier attempt(s) failed with a network-type error)."
    exit 0
  fi
  summary="$(grep -m3 -E 'Error|error|Failed' "$LOG" | tr '\n' ' ' | cut -c1-400)"
  if grep -qiE "$NETWORK_RE" "$LOG" && [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
    echo "::warning::Build attempt ${attempt} failed with a network-type error, retrying in ${RETRY_DELAY}s: ${summary}"
    attempt=$((attempt + 1)); sleep "$RETRY_DELAY"; continue
  fi
  echo "::error::Build failed (attempt ${attempt}/${MAX_ATTEMPTS}, exit ${status}): ${summary}"
  exit "$status"
done
