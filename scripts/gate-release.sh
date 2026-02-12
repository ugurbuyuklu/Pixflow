#!/usr/bin/env bash
set -euo pipefail

GATE_LOG_DIR="${PIXFLOW_GATE_LOG_DIR:-logs/gate-run}"
EVENTS_FILE="${GATE_LOG_DIR}/pipeline-events.jsonl"

mkdir -p "$GATE_LOG_DIR"
rm -f "$EVENTS_FILE"
export PIXFLOW_TELEMETRY_DIR="$GATE_LOG_DIR"

run_step() {
  local name="$1"
  shift
  echo ""
  echo "==> ${name}"
  "$@"
}

run_step "Lint (Biome)" npm run lint:biome
run_step "Validate Playbooks" npm run validate:playbooks
run_step "Typecheck" npm run lint
run_step "Unit Tests" npm run test
run_step "API Smoke" npm run smoke:api
run_step "Desktop Journey Smoke" npm run smoke:desktop:journey
run_step "External Smoke (Mock)" npm run smoke:external
run_step "Desktop Build" npm run build

run_step "Telemetry Report (TXT)" npm run telemetry:report -- --file "$EVENTS_FILE" --out telemetry-report.txt
run_step "Telemetry Report (JSON)" npm run telemetry:report:json -- --file "$EVENTS_FILE" --out telemetry-report.json
run_step "Telemetry Trends" npm run telemetry:trends -- --file "$EVENTS_FILE" --out logs/telemetry-trends.json
run_step "Telemetry Dashboard" npm run telemetry:dashboard -- --report telemetry-report.json --trends logs/telemetry-trends.json --out docs/ops/telemetry-dashboard.md
run_step "Telemetry Highlights" npm run telemetry:highlights -- --trends logs/telemetry-trends.json --out docs/ops/telemetry-highlights.md
run_step "Telemetry Baseline" npm run telemetry:baseline -- --trends logs/telemetry-trends.json --history logs/telemetry-trends-history.jsonl --out-json docs/ops/telemetry-baseline.json --out-md docs/ops/telemetry-baseline.md
run_step "Threshold Proposals" npm run threshold:propose -- --baseline docs/ops/telemetry-baseline.json --out-env docs/ops/proposed-thresholds.env --out-md docs/ops/proposed-thresholds.md
run_step "Release Preflight" npm run preflight:release -- --report telemetry-report.json --trends logs/telemetry-trends.json --baseline docs/ops/telemetry-baseline.json --registry docs/ops/playbook-registry.json --out-json docs/ops/release-preflight.json --out-md docs/ops/release-preflight.md
run_step "Preflight History" npm run preflight:history -- --preflight docs/ops/release-preflight.json --history logs/preflight-history.jsonl --out docs/ops/preflight-history.md
run_step "Frontend Perf Gate" npm run telemetry:check:frontend:release -- --file "$EVENTS_FILE"

REGRESSION_MODE="${PIXFLOW_REGRESSION_MODE:-}"
if [[ -z "$REGRESSION_MODE" ]]; then
  if [[ -f "docs/ops/telemetry-baseline.json" ]]; then
    BASELINE_READY="$(node -e "const fs=require('node:fs');try{const o=JSON.parse(fs.readFileSync('docs/ops/telemetry-baseline.json','utf8'));process.stdout.write(o.readyForEnforcementTuning?'1':'0')}catch{process.stdout.write('0')}")"
  else
    BASELINE_READY="0"
  fi
  if [[ "$BASELINE_READY" == "1" ]]; then
    REGRESSION_MODE="block"
  else
    REGRESSION_MODE="warn"
  fi
fi
echo "Regression mode: ${REGRESSION_MODE}"
run_step "Regression Gate" npm run telemetry:check:regression -- --mode "$REGRESSION_MODE" --file logs/telemetry-trends.json --out-json docs/ops/regression-gate.json --out-md docs/ops/regression-gate.md
run_step "Release Gate" npm run telemetry:check:release -- --file "$EVENTS_FILE"

echo ""
echo "Release gate passed."
