#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8000}"

fail() {
    echo "FAIL: $1" >&2
    exit 1
}

check_status_ok() {
    local url="$1"
    local code
    code="$(curl -s -L -o /dev/null -w "%{http_code}" "$url")"
    [[ "$code" == "200" ]] || fail "$url returned HTTP $code"
}

require_match() {
    local content="$1"
    local pattern="$2"
    local label="$3"
    printf '%s' "$content" | rg -q "$pattern" || fail "$label missing pattern: $pattern"
}

check_status_ok "$BASE_URL/"
check_status_ok "$BASE_URL/sl/"

ROOT_HTML="$(curl -s -f -L "$BASE_URL/")"
SL_HTML="$(curl -s -f -L "$BASE_URL/sl/")"

require_match "$ROOT_HTML" "id=\"languageToggle\"" "root language toggle"
require_match "$ROOT_HTML" "id=\"langOptionEn\"" "root EN option"
require_match "$ROOT_HTML" "id=\"langOptionSl\"" "root SL option"
require_match "$ROOT_HTML" "hreflang=\"en\"" "root hreflang EN"
require_match "$ROOT_HTML" "hreflang=\"sl\"" "root hreflang SL"

require_match "$SL_HTML" "id=\"languageToggle\"" "sl language toggle"
require_match "$SL_HTML" "id=\"langOptionEn\"" "sl EN option"
require_match "$SL_HTML" "id=\"langOptionSl\"" "sl SL option"
require_match "$SL_HTML" "hreflang=\"en\"" "sl hreflang EN"
require_match "$SL_HTML" "hreflang=\"sl\"" "sl hreflang SL"

echo "Language smoke test passed for $BASE_URL"
