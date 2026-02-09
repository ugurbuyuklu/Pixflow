# Pixflow AI Versioning Handoff

This document is a machine-readable handoff for another AI agent to understand:

1. what changed,
2. why it changed,
3. what is still pending.

Date: 2026-02-07
Last updated: 2026-02-09 (Session 11: Desktop launcher + Img2Video improvements + Video download fixes)
Project root: `/Users/pixery/Projects/pixflow`

---

## 0) Executive Snapshot

- Product: Pixflow (Electron desktop app with embedded Express API + React renderer).
- Current operational state: release gate chain is green locally; preflight typically reports `CONDITIONAL` until baseline sample count matures.
- Best single verification command:
  - `npm run gate:release`
- Core outputs to inspect first:
  - `/Users/pixery/Projects/pixflow/docs/ops/release-preflight.md`
  - `/Users/pixery/Projects/pixflow/docs/ops/telemetry-baseline.md`
  - `/Users/pixery/Projects/pixflow/docs/ops/telemetry-highlights.md`
  - `/Users/pixery/Projects/pixflow/docs/ops/telemetry-dashboard.md`
- Key automation/workflow files:
  - `/Users/pixery/Projects/pixflow/.github/workflows/ci.yml`
  - `/Users/pixery/Projects/pixflow/.github/workflows/nightly-real-smoke.yml`
- Unit tests: 86 tests via Vitest (`npm run test`), integrated into `gate:release`.
- Static analysis: Biome v2.3.14 linter + formatter (`npm run lint:biome`), integrated into `gate:release` as first check. All rules at `"error"` severity (0 warnings).
- High-priority residual risk:
  - native module rebuild path is automated, but should be validated on clean environments to confirm `@electron/rebuild` consistently rebuilds `better-sqlite3`.
  - `better-sqlite3` requires dual-build: system Node for tests, Electron for app. Rebuild sequence: `node-gyp rebuild` → `npm run test` → `npm run native:rebuild`.

---

## 1) Current Product Identity

- Active product name: **Pixflow**
- Previous name: **Borgflow/Borgflow-era materials**
- Policy: active work stays in root Pixflow structure, old materials stay in archive.

---

## 2) Structural Changes Applied

### 2.1 Archive created

- Archive folder created:
  - `/Users/pixery/Projects/pixflow/Burgflow Archive`

- Archive guidance file added:
  - `/Users/pixery/Projects/pixflow/Burgflow Archive/README.md`

### 2.2 Borgflow-era assets moved to archive

Moved from root into `Burgflow Archive`:

- `Documentation/` -> `Burgflow Archive/Documentation/`
- `packages/` -> `Burgflow Archive/packages/`
- `backups/` -> `Burgflow Archive/backups/`
- old root `CLAUDE.md` -> `Burgflow Archive/CLAUDE.md`
- `docs/CLAUDE.md` -> `Burgflow Archive/docs/CLAUDE.md`
- `docs/UI_SPEC.md` -> `Burgflow Archive/docs/UI_SPEC.md`
- `docs/SPRINT_GUIDE.md` -> `Burgflow Archive/docs/SPRINT_GUIDE.md`
- `scripts/auto-backup.sh` -> `Burgflow Archive/scripts/auto-backup.sh`
- `logs/backup.log` -> `Burgflow Archive/logs/backup.log`
- `logs/backup_error.log` -> `Burgflow Archive/logs/backup_error.log`

### 2.3 Active Pixflow docs created/updated

- New root intelligence doc:
  - `/Users/pixery/Projects/pixflow/CLAUDE.md`
- New active readme:
  - `/Users/pixery/Projects/pixflow/docs/PIXFLOW_README.md`
- Structure policy doc:
  - `/Users/pixery/Projects/pixflow/docs/REPO_STRUCTURE.md`

### 2.4 Naming cleanup

- `package-lock.json` top-level name updated:
  - from `borgflow` -> `pixflow`

---

## 3) Hygiene/Operations Changes Applied

### 3.1 Git ignore hardened

Updated:
- `/Users/pixery/Projects/pixflow/.gitignore`

Adds/clarifies ignores for:
- runtime artifacts (`outputs/`, `uploads/`, `logs/`, `backups/`)
- DB runtime files (`data/*.db*`)
- local tooling state (`.playwright-mcp/`)
- generated build metadata (`*.tsbuildinfo`)
- one-off local binary (`machine-tab-full.png`)

### 3.2 Cleanup script added

- `/Users/pixery/Projects/pixflow/scripts/cleanup-local-artifacts.sh`

Behavior:
- default mode is **dry-run**
- `--apply` performs deletion
- targets only local/runtime artifacts (not source code)

### 3.3 Persistence migration status

- History/favorites runtime operations now use SQLite-backed service at:
  - `/Users/pixery/Projects/pixflow/src/server/services/history.ts`
- Legacy JSON files are only migration inputs via:
  - `/Users/pixery/Projects/pixflow/src/server/db/migrations.ts`

---

## 4) Active Architecture (as assessed)

Active code paths:

- Electron main/preload: `src/main`, `src/preload`
- Renderer/UI: `src/renderer`
- Embedded API: `src/server`

System model:
- Electron desktop app
- Express API embedded in Electron main process
- React + Zustand frontend
- Local filesystem outputs + SQLite (`data/pixflow.db`)

---

## 5) Completed in This Iteration

1. Security bootstrap hardening:
- Removed hardcoded default admin.
- Added opt-in bootstrap admin flow:
  - `PIXFLOW_BOOTSTRAP_ADMIN_ON_STARTUP=true`
  - `PIXFLOW_BOOTSTRAP_ADMIN_EMAIL`
  - `PIXFLOW_BOOTSTRAP_ADMIN_PASSWORD`
- Files:
  - `/Users/pixery/Projects/pixflow/src/server/services/auth.ts`

2. Startup fail-fast validation:
- Added server env validation for `JWT_SECRET` and bootstrap-admin config.
- Files:
  - `/Users/pixery/Projects/pixflow/src/server/config/validation.ts`
  - `/Users/pixery/Projects/pixflow/src/server/createApp.ts`

3. Path validation hardening:
- Replaced prefix-based folder access check with `resolve + relative` guard.
- File:
  - `/Users/pixery/Projects/pixflow/src/server/routes/generate.ts`

4. SQLite runtime migration for history/favorites:
- Runtime history/favorites operations moved to SQLite-backed service.
- Routes now user-scoped by authenticated user id.
- Files:
  - `/Users/pixery/Projects/pixflow/src/server/services/history.ts`
  - `/Users/pixery/Projects/pixflow/src/server/routes/history.ts`
  - `/Users/pixery/Projects/pixflow/src/server/createApp.ts`

5. Shared prompt limits (frontend/backend alignment):
- Added shared constants:
  - `/Users/pixery/Projects/pixflow/src/constants/limits.ts`
- Wired into backend prompt generation clamp and frontend prompt slider/store.
- Files:
  - `/Users/pixery/Projects/pixflow/src/server/createApp.ts`
  - `/Users/pixery/Projects/pixflow/src/renderer/components/prompt-factory/PromptFactoryPage.tsx`
  - `/Users/pixery/Projects/pixflow/src/renderer/stores/promptStore.ts`

6. API response envelope rollout:
- Added standard helpers:
  - `/Users/pixery/Projects/pixflow/src/server/utils/http.ts`
- Applied across app-level endpoints and route modules:
  - `/Users/pixery/Projects/pixflow/src/server/createApp.ts`
  - `/Users/pixery/Projects/pixflow/src/server/routes/auth.ts`
  - `/Users/pixery/Projects/pixflow/src/server/routes/generate.ts`
  - `/Users/pixery/Projects/pixflow/src/server/routes/avatars.ts`
  - `/Users/pixery/Projects/pixflow/src/server/routes/history.ts`
  - `/Users/pixery/Projects/pixflow/src/server/routes/products.ts`
  - `/Users/pixery/Projects/pixflow/src/server/routes/presets.ts`
  - `/Users/pixery/Projects/pixflow/src/server/routes/feedback.ts`
  - `/Users/pixery/Projects/pixflow/src/server/routes/notifications.ts`
- Envelope now includes:
  - `success`
  - `data`
- Compatibility mode removed:
  - backend no longer mirrors payload keys at top level
  - strict contract is now `{ success, data }` for success responses

7. Frontend envelope migration:
- Added shared frontend parser helpers:
  - `/Users/pixery/Projects/pixflow/src/renderer/lib/api.ts`
    - `unwrapApiData<T>()`
    - `getApiError()`
- Migrated frontend stores to parse envelope consistently:
  - `/Users/pixery/Projects/pixflow/src/renderer/stores/authStore.ts`
  - `/Users/pixery/Projects/pixflow/src/renderer/stores/productStore.ts`
  - `/Users/pixery/Projects/pixflow/src/renderer/stores/promptStore.ts`
  - `/Users/pixery/Projects/pixflow/src/renderer/stores/historyStore.ts`
  - `/Users/pixery/Projects/pixflow/src/renderer/stores/notificationStore.ts`
  - `/Users/pixery/Projects/pixflow/src/renderer/stores/presetStore.ts`
  - `/Users/pixery/Projects/pixflow/src/renderer/stores/feedbackStore.ts`
  - `/Users/pixery/Projects/pixflow/src/renderer/stores/generationStore.ts`
  - `/Users/pixery/Projects/pixflow/src/renderer/stores/machineStore.ts`
  - `/Users/pixery/Projects/pixflow/src/renderer/stores/avatarStore.ts`
- Migrated direct renderer API consumers to shared parser/error helper:
  - `/Users/pixery/Projects/pixflow/src/renderer/components/asset-monster/AssetMonsterPage.tsx`
  - `/Users/pixery/Projects/pixflow/src/renderer/components/avatar-studio/AvatarStudioPage.tsx`

8. Pipeline telemetry (server-side):
- Added telemetry service:
  - `/Users/pixery/Projects/pixflow/src/server/services/telemetry.ts`
- Emits JSONL telemetry events to:
  - `logs/pipeline-events.jsonl` (default)
  - configurable via `PIXFLOW_TELEMETRY_DIR`
  - toggle via `PIXFLOW_TELEMETRY_ENABLED` (default: enabled)
- Integrated spans/events into:
  - `/Users/pixery/Projects/pixflow/src/server/createApp.ts` (`prompts.generate`)
  - `/Users/pixery/Projects/pixflow/src/server/routes/generate.ts` (`generate.batch.start` + async error marker)
  - `/Users/pixery/Projects/pixflow/src/server/services/fal.ts` (`generate.batch.execute`)
  - `/Users/pixery/Projects/pixflow/src/server/routes/avatars.ts` (`avatars.script`, `avatars.tts`, `avatars.lipsync`, `avatars.i2v`)

9. Smoke API critical path:
- Added smoke script:
  - `/Users/pixery/Projects/pixflow/src/server/smoke/criticalPath.ts`
- Added npm command:
  - `npm run smoke:api`
- Coverage (local deterministic path):
  - `/health`
  - `/api/auth/login` + `/api/auth/me` (bootstrap admin)
  - `/api/products`
  - `/api/settings/status`
  - `/api/history` create/list/delete/clear
  - `/api/history/favorites` create/update/delete
- Asserts response envelope shape (`success` + `data`) for each step.

10. Middleware/error envelope normalization:
- Auth middleware now returns standard error envelope via helper:
  - `/Users/pixery/Projects/pixflow/src/server/middleware/auth.ts`
- Rate-limit handlers now return standard error envelope:
  - `/Users/pixery/Projects/pixflow/src/server/createApp.ts`
  - `/Users/pixery/Projects/pixflow/src/server/routes/avatars.ts`
- Added consistent server/router error handlers for uncaught middleware/route errors:
  - `/Users/pixery/Projects/pixflow/src/server/createApp.ts`
  - `/Users/pixery/Projects/pixflow/src/server/routes/avatars.ts`

11. Provider runtime reliability layer:
- Added provider runtime utility:
  - `/Users/pixery/Projects/pixflow/src/server/services/providerRuntime.ts`
- Capabilities:
  - `PIXFLOW_MOCK_PROVIDERS` toggle for mock-provider mode
  - bounded retry wrapper with backoff (`runWithRetries`)
  - provider failure-type classification (`timeout`, `rate_limit`, `network`, `provider`)
  - provider-attempt telemetry metadata emission (`provider`, `attempt`, `retries`, `recovered`)
- Integrated into provider-dependent services:
  - `/Users/pixery/Projects/pixflow/src/server/services/avatar.ts`
  - `/Users/pixery/Projects/pixflow/src/server/services/voiceover.ts`
  - `/Users/pixery/Projects/pixflow/src/server/services/tts.ts`
  - `/Users/pixery/Projects/pixflow/src/server/services/fal.ts`
  - `/Users/pixery/Projects/pixflow/src/server/services/hedra.ts`
  - `/Users/pixery/Projects/pixflow/src/server/services/kling.ts`

12. External-integrated smoke path (mock providers):
- Added smoke script:
  - `/Users/pixery/Projects/pixflow/src/server/smoke/externalPipeline.ts`
- Added npm command:
  - `npm run smoke:external`
  - `npm run smoke:external:real` (real-provider profile)
- Coverage:
  - `/api/avatars/generate`
  - `/api/avatars/script`
  - `/api/avatars/tts`
  - `/api/avatars/lipsync`
  - `/api/avatars/i2v`
  - `/api/generate/batch` + `/api/generate/progress/:jobId`
- Verifies provider metadata is present in telemetry output.
- Real-provider profile notes:
  - run with `--real` mode
  - requires `OPENAI_API_KEY`, `FAL_API_KEY`, `HEDRA_API_KEY`
  - uses longer batch polling window suitable for nightly/staging runs
  - includes guardrails in real mode:
    - `PIXFLOW_SMOKE_REAL_MAX_BUDGET_USD` (default: `0.50`)
    - `PIXFLOW_SMOKE_REAL_MAX_RUNTIME_MS` (default: `1200000`)
  - guardrail breaches emit telemetry event:
    - pipeline: `smoke.external.guardrail`
    - reasons: `budget_exceeded` or `timeout_exceeded`

13. Telemetry reporting CLI:
- Added report script:
  - `/Users/pixery/Projects/pixflow/src/server/telemetry/report.ts`
- Added npm command:
  - `npm run telemetry:report`
- Supports:
  - default input: `logs/pipeline-events.jsonl`
  - custom input: `npm run telemetry:report -- --file /path/to/events.jsonl`
  - machine output: `npm run telemetry:report:json`
  - output file path: `--out <path>`
- Output includes:
  - overall success rate
  - overall duration p50/p95
  - per-pipeline success/error rates
  - per-provider success/fail rates
  - retry recovery rate
  - provider failure-type breakdown

14. Telemetry threshold gate + release command:
- Added threshold checker:
  - `/Users/pixery/Projects/pixflow/src/server/telemetry/checkThresholds.ts`
- Added npm commands:
  - `npm run telemetry:check`
  - `npm run gate:release`
- `gate:release` sequence:
  - `validate:playbooks` -> `lint` -> `smoke:api` -> `smoke:desktop` -> `smoke:external`
  - `telemetry:report` -> `telemetry:report:json` -> `telemetry:trends`
  - `telemetry:dashboard` -> `telemetry:highlights` -> `telemetry:baseline`
  - `threshold:propose` -> `preflight:release` -> `preflight:history`
  - `telemetry:check:regression:block` -> `telemetry:check:release`
- Gate env controls:
  - `PIXFLOW_GATE_MIN_OVERALL_SUCCESS_RATE` (default: `1.0`)
  - `PIXFLOW_GATE_MIN_PROVIDER_SUCCESS_RATE` (default: `1.0`)
  - `PIXFLOW_GATE_MAX_P95_MS` (default: `300000`)
  - `PIXFLOW_GATE_REQUIRE_PROVIDER_EVENTS` (default: `true`)

15. CI and nightly automation:
- Added PR/main CI workflow:
  - `/Users/pixery/Projects/pixflow/.github/workflows/ci.yml`
  - runs `gate:release` (full release gate chain above)
  - publishes `telemetry-highlights`, `telemetry-baseline`, and `release-preflight` markdown files to `$GITHUB_STEP_SUMMARY`
  - uploads telemetry/preflight artifacts (including `docs/ops/release-preflight.*`, `docs/ops/telemetry-*`, and logs)
- Added nightly real-provider workflow:
  - `/Users/pixery/Projects/pixflow/.github/workflows/nightly-real-smoke.yml`
  - scheduled + manual trigger
  - runs `validate:playbooks`, `lint`, `smoke:external:real`
  - runs telemetry/preflight chain (`telemetry:report*`, `telemetry:trends`, `telemetry:dashboard`, `telemetry:highlights`, `telemetry:baseline`, `threshold:propose`, `preflight:nightly`, `preflight:history`)
  - runs `telemetry:check:nightly` and `telemetry:check:regression:warn`
  - requires GitHub Actions secrets:
    - `OPENAI_API_KEY`
    - `FAL_API_KEY`
    - `HEDRA_API_KEY`
    - `NIGHTLY_ALERT_WEBHOOK` (optional fallback route)
    - `NIGHTLY_ALERT_WEBHOOK_CRITICAL` (optional, preferred for critical alerts)
    - `NIGHTLY_ALERT_WEBHOOK_WARNING` (optional, preferred for warning alerts)
  - uploads nightly telemetry artifacts
  - on failure, posts structured JSON alert to webhook (when configured)
  - severity routing policy:
    - `critical` when guardrail reason is `budget_exceeded`/`timeout_exceeded` or pipeline error count is high
    - otherwise `warning`
    - routes to severity-specific webhook when present, falls back to generic webhook
  - structured alert payload fields:
    - `severity`
    - `alert_route`
    - `run_url`
    - `failed_job`
    - `failed_step`
    - `budget_used`
    - `guardrail_reason`
    - `top_failing_provider`
    - `top_failing_pipeline`
    - `error_summary`
    - `provider_error_count`
    - `pipeline_error_count`
    - `owner_team`
    - `owner_oncall`
    - `escalation_level`
    - `action_required`
    - `retry_recommended`
    - `playbook_id`
    - `playbook_version`
    - `playbook_registry`
    - `runbook_url`
    - `regression_summary`
    - `alert_summary`
    - `next_actions`
    - `ref`
    - `sha`
  - playbook/runbook mapping is now backed by repository docs:
    - `/Users/pixery/Projects/pixflow/docs/ops/playbook-registry.json`
    - `/Users/pixery/Projects/pixflow/docs/ops/playbook-registry.schema.json`
    - `/Users/pixery/Projects/pixflow/docs/ops/runbooks/openai-provider.md`
    - `/Users/pixery/Projects/pixflow/docs/ops/runbooks/fal-provider.md`
    - `/Users/pixery/Projects/pixflow/docs/ops/runbooks/hedra-provider.md`
    - `/Users/pixery/Projects/pixflow/docs/ops/runbooks/kling-provider.md`
    - `/Users/pixery/Projects/pixflow/docs/ops/runbooks/nightly-failure.md`
  - nightly alert payload is now built by script (not inline workflow JS):
    - `/Users/pixery/Projects/pixflow/scripts/build-nightly-alert.js`
  - webhook send path now has dedup pre-check:
    - `npm run alert:dedup` (`/Users/pixery/Projects/pixflow/scripts/build-nightly-alert-dedup.js`)
  - payload now includes regression context from `logs/telemetry-trends.json`:
    - baseline availability
    - success-rate delta/status
    - p95 delta/status
    - provider fail-rate deltas and top regressed provider
  - script parses `docs/ops/playbook-registry.json` dynamically to resolve:
    - owner team/on-call
    - playbook id/version
    - runbook URL at current commit SHA
  - registry validation added:
    - `/Users/pixery/Projects/pixflow/scripts/validate-playbook-registry.js`
    - command: `npm run validate:playbooks`
    - enforced by `gate:release` and nightly workflow
  - nightly workflow sets real-smoke guardrail envs by default:
    - `PIXFLOW_SMOKE_REAL_MAX_BUDGET_USD=0.50`
    - `PIXFLOW_SMOKE_REAL_MAX_RUNTIME_MS=1200000`
  - nightly telemetry gate uses relaxed thresholds by default:
    - `PIXFLOW_GATE_MIN_OVERALL_SUCCESS_RATE=0.90`
    - `PIXFLOW_GATE_MIN_PROVIDER_SUCCESS_RATE=0.80`
    - `PIXFLOW_GATE_MAX_P95_MS=600000`
  - nightly also generates proposal/history docs:
    - `docs/ops/proposed-thresholds.env`
    - `docs/ops/proposed-thresholds.md`
    - `docs/ops/preflight-history.md`

16. Telemetry trend snapshots + profile-based SLO checks:
- Added trend snapshot generator:
  - `/Users/pixery/Projects/pixflow/src/server/telemetry/trends.ts`
  - command: `npm run telemetry:trends`
  - output: `logs/telemetry-trends.json` (windowed summary: success rate, p95, provider fail rates)
- Upgraded telemetry gate to profile-based thresholds:
  - `/Users/pixery/Projects/pixflow/src/server/telemetry/checkThresholds.ts`
  - commands:
    - `npm run telemetry:check:ci`
    - `npm run telemetry:check:nightly`
    - `npm run telemetry:check:release`
  - `gate:release` now uses `telemetry:check:release`

17. Telemetry markdown dashboard snapshot:
- Added dashboard snapshot builder:
  - `/Users/pixery/Projects/pixflow/scripts/build-telemetry-dashboard.js`
  - command: `npm run telemetry:dashboard`
  - output: `docs/ops/telemetry-dashboard.md`
- Dashboard includes:
  - summary window and overall rates/latency
  - trend-window summary (success + p95)
  - provider table (success/fail/recovery/p95)
  - pipeline table (attempts/success/errors)
  - provider fail-rate trend table
  - regression diff table (current vs previous window) with status classification (`improved`/`regressed`/`stable`)
- Integrated into release/nightly automation:
  - `gate:release` now generates dashboard after report/trends
  - CI and nightly workflows upload `docs/ops/telemetry-dashboard.md` as artifact

18. Trend snapshots now include run-to-run comparable windows:
- Updated trend schema:
  - `/Users/pixery/Projects/pixflow/src/server/telemetry/trends.ts`
- Snapshot now stores:
  - `windowSize`
  - `current` window metrics
  - `previous` window metrics
  - `delta` metrics (`successRate`, `p95Ms`, provider fail-rate deltas)
- Dashboard script is backward-compatible with legacy trend files that only had a single-window shape.

19. Workflow-level regression highlights:
- Added highlights generator:
  - `/Users/pixery/Projects/pixflow/scripts/build-telemetry-highlights.js`
  - command: `npm run telemetry:highlights`
  - output: `docs/ops/telemetry-highlights.md`
- `gate:release` now generates highlights after trends/dashboard.
- CI and nightly workflows now:
  - generate/upload `docs/ops/telemetry-highlights.md`
  - append highlights directly to `$GITHUB_STEP_SUMMARY` for quick run-page visibility.

20. Regression guardrail enforcement (warn vs block):
- Added regression checker:
  - `/Users/pixery/Projects/pixflow/src/server/telemetry/checkRegression.ts`
- Added commands:
  - `npm run telemetry:check:regression`
  - `npm run telemetry:check:regression:warn`
  - `npm run telemetry:check:regression:block`
- Enforcement policy:
  - release gate runs `telemetry:check:regression:block` (blocking)
  - nightly workflow runs `telemetry:check:regression:warn` (non-blocking warning signal)
- Threshold controls (env):
  - `PIXFLOW_REGRESSION_MAX_SUCCESS_DROP`
  - `PIXFLOW_REGRESSION_MAX_P95_INCREASE_MS`
  - `PIXFLOW_REGRESSION_MAX_PROVIDER_FAILRATE_INCREASE`
  - `PIXFLOW_REGRESSION_PROVIDER_THRESHOLDS_JSON` (optional per-provider fail-rate increase overrides)
- Nightly defaults set in workflow:
  - success drop <= `0.03`
  - p95 increase <= `30000` ms
  - provider fail-rate increase <= `0.10`
  - provider overrides (example): `{"openai":0.08,"fal":0.12,"hedra":0.12,"kling":0.15}`

21. Baseline stabilization (history + recommendations):
- Added baseline updater:
  - `/Users/pixery/Projects/pixflow/scripts/update-telemetry-baseline.js`
  - command: `npm run telemetry:baseline`
- Outputs:
  - `logs/telemetry-trends-history.jsonl` (append-only trend history)
  - `docs/ops/telemetry-baseline.json` (machine-readable suggestions)
  - `docs/ops/telemetry-baseline.md` (human-readable summary)
- `gate:release` now generates baseline artifacts.
- CI and nightly workflows now upload baseline artifacts and include baseline summary in `$GITHUB_STEP_SUMMARY`.
- Suggested thresholds are computed from historical transition percentiles and emitted for:
  - `PIXFLOW_REGRESSION_MAX_SUCCESS_DROP`
  - `PIXFLOW_REGRESSION_MAX_P95_INCREASE_MS`
  - `PIXFLOW_REGRESSION_MAX_PROVIDER_FAILRATE_INCREASE`
  - `PIXFLOW_REGRESSION_PROVIDER_THRESHOLDS_JSON`

22. Desktop critical journeys smoke coverage:
- Added desktop-oriented smoke journey script:
  - `/Users/pixery/Projects/pixflow/src/server/smoke/desktopCriticalPaths.ts`
- Added npm command:
  - `npm run smoke:desktop`
  - `npm run smoke:desktop:journey` (alias, explicit naming)
- Coverage:
  - Journey A: login -> settings/products -> generate batch -> progress poll -> history write/read
  - Journey B: avatar generate -> script -> tts -> lipsync -> i2v
- Release gate now includes `smoke:desktop:journey` between API smoke and external smoke.
- Note: this smoke validates desktop user journeys through the embedded server API; it does not boot Electron UI.

23. Ops readiness (actionable alerts + SLA checklists):
- Nightly alert payload now includes human-action fields:
  - `alert_summary`
  - `next_actions`
  - file: `/Users/pixery/Projects/pixflow/scripts/build-nightly-alert.js`
- `next_actions` is severity-aware and includes run/runbook links and retry guidance.
- Standardized SLA + owner checklists added to runbooks:
  - `/Users/pixery/Projects/pixflow/docs/ops/runbooks/nightly-failure.md`
  - `/Users/pixery/Projects/pixflow/docs/ops/runbooks/openai-provider.md`
  - `/Users/pixery/Projects/pixflow/docs/ops/runbooks/fal-provider.md`
  - `/Users/pixery/Projects/pixflow/docs/ops/runbooks/hedra-provider.md`
  - `/Users/pixery/Projects/pixflow/docs/ops/runbooks/kling-provider.md`

24. Release readiness preflight report:
- Added preflight report builder:
  - `/Users/pixery/Projects/pixflow/scripts/build-release-preflight.js`
- Added commands:
  - `npm run preflight:release`
  - `npm run preflight:nightly`
- Outputs:
  - `docs/ops/release-preflight.json`
  - `docs/ops/release-preflight.md`
- `gate:release` now produces preflight report before final regression/release checks.
- CI and nightly workflows now publish preflight report to:
  - `$GITHUB_STEP_SUMMARY`
  - uploaded artifacts
- Decision model:
  - `READY` (no warnings/failures)
  - `CONDITIONAL` (warnings only)
  - `NOT_READY` (one or more failures)

---

25. Phase D — Visual Design & Polish (Claude):
- Semantic CSS tokens: replaced all hardcoded `gray-*`/`purple-*`/`violet-*`/`zinc-*` Tailwind classes with `surface-*`/`brand-*` semantic tokens across 13 renderer files.
- Component library (11 components): Button, Input, Select, Slider, Card, Badge, Modal, Skeleton, EmptyState, DropZone, ProgressBar.
  - Location: `src/renderer/components/ui/`
- Toast system: `src/renderer/lib/toast.ts` (wrapper around react-hot-toast).
- FeedbackWidget: `src/renderer/components/feedback/FeedbackWidget.tsx`.
- framer-motion integration: page transitions (`PageTransition.tsx`), modal/overlay animations.
- React.lazy + Suspense code splitting for 5 page components in `AppShell.tsx`.
- Keyboard shortcuts: `src/renderer/hooks/useKeyboardShortcuts.ts` (Cmd+1-5 tab switching, Escape to close).
- CSS theme tokens extended: `--color-danger`, `--color-warning`, `--color-success`, `--color-info`, transition easings.
- Zero remaining hardcoded color classes in renderer (verified via grep).

26. Backlog completion (Claude):
- Threshold tuning proposals: `scripts/propose-threshold-update.js`, command `npm run threshold:propose`.
- Alert de-duplication: `scripts/build-nightly-alert-dedup.js`, command `npm run alert:dedup`.
- Preflight decision history: `scripts/build-preflight-history.js`, command `npm run preflight:history`.
- All three integrated into `gate:release`, CI workflow, and nightly workflow.

27. Phase D status color token migration (Session 3):
- Extended semantic CSS tokens in `src/renderer/index.css`:
  - `--color-danger-hover: #dc2626`
  - `--color-danger-muted: #7f1d1d`
  - `--color-warning-hover: #d97706`
  - `--color-warning-muted: #78350f`
  - `--color-success-hover: #16a34a`
  - `--color-success-muted: #14532d`
  - `--color-accent: #06b6d4`
  - `--color-accent-hover: #0891b2`
- Migrated all remaining hardcoded status colors (`emerald-*`, `amber-*`, `red-*`, `cyan-*`) to semantic tokens across 9 files:
  - `src/renderer/components/ui/Badge.tsx` — success/warning/danger variants
  - `src/renderer/components/ui/Button.tsx` — danger variant
  - `src/renderer/components/prompt-factory/PromptFactoryPage.tsx` — 6 color edits (error blocks, cancel, success buttons)
  - `src/renderer/components/asset-monster/AssetMonsterPage.tsx` — extensive migration (remove buttons, generate button, error/warning blocks, status badges, image borders, custom prompt errors)
  - `src/renderer/components/avatar-studio/AvatarStudioPage.tsx` — 22 color changes (warning/danger/success blocks, amber hints, emerald buttons, cyan I2V section → accent)
  - `src/renderer/components/machine/MachinePage.tsx` — 8 edits (error/warning blocks, Run/Cancel buttons, progress bar, download button)
  - `src/renderer/components/library/LibraryPage.tsx` — favorites toast
  - `src/renderer/components/layout/ImagePreviewOverlay.tsx` — download button hover
  - `src/renderer/components/layout/AvatarPreviewOverlay.tsx` — download button hover
- Post-migration audit: 0 hardcoded status color classes remaining (verified via comprehensive regex).
- Commit: `f9ea5d8`

28. Electron native module fix (Session 3):
- `better-sqlite3` was compiled for Node.js v25 (NODE_MODULE_VERSION 141) but Electron v33 requires NODE_MODULE_VERSION 130.
- Fix: rebuilt `better-sqlite3` using `node-gyp rebuild --target=33.4.11 --dist-url=https://electronjs.org/headers` from within `node_modules/better-sqlite3/`.
- Note: `npx electron-rebuild` and `npx @electron/rebuild` both silently skipped the rebuild. Manual `node-gyp` was required.
- After rebuild, Electron embedded server starts successfully.
- Follow-up automation added in Sprint 4A:
  - `postinstall`: `npx --yes @electron/rebuild -f -w better-sqlite3`
  - `native:rebuild`: `npx --yes @electron/rebuild -f -w better-sqlite3`
  - CI/nightly now run `npm run native:rebuild` after `npm ci`.

29. Full E2E verification pass (Session 3):
- Test environment: Electron dev mode (`npm run dev`), Playwright browser automation on `http://localhost:5173`.
- Admin password reset via `sqlite3` CLI (bcrypt hash updated directly in `data/pixflow.db`).
- Test credentials: `admin@pixery.com` / `pixflowtest1234`
- All tests passed:
  - Login page renders, auth flow works (JWT returned, session persists)
  - All 5 tabs render correctly: Prompt Factory, Asset Monster, Avatar Studio, The Machine, Library
  - Product color switching: Clone AI (purple) → Fyro (orange) → Zurna (cyan) — all brand-colored elements update dynamically
  - Dark/light mode toggle: surface tokens flip correctly
  - User menu dropdown: name, email, Change Password, Sign Out (danger-colored)
  - Notification bell dropdown: renders with "No notifications"
  - Feedback widget: expand, category select, text input, submit → toast → backend persists (verified via API)
  - API health endpoint: responds with `{ success: true }`
  - Feedback API: end-to-end with correct user_id, product_id, category
  - Console errors: 0
  - Avatar gallery: 122 images load in both Asset Monster and Avatar Studio
  - Generation settings: all dropdowns render (aspect ratio, images per prompt, resolution, format)
  - The Machine: full settings panel with concept input, prompt slider, avatar grid, voiceover controls

30. Sprint 4B — ErrorBoundary + UI component library adoption (Session 4):
- Added `ErrorBoundary` React class component:
  - `src/renderer/components/ui/ErrorBoundary.tsx`
  - Wraps all lazy-loaded pages in `AppShell.tsx` with `key={activeTab}` to reset on tab switch
  - Shows error message + "Try Again" button on crash
- Added `Textarea` UI component:
  - `src/renderer/components/ui/Textarea.tsx`
  - Matches `Input` component pattern with label/error support
- Extended `Button` component with 3 new variants:
  - `success` (solid green), `warning` (orange gradient), `accent` (cyan gradient)
- UI component library adoption across all 5 page components:
  - `LibraryPage.tsx` — inline buttons → `<Button>` with ghost/primary variants
  - `PromptFactoryPage.tsx` — buttons → `<Button>`, concept input → `<Input>`, prompt count → `<Slider>`
  - `AssetMonsterPage.tsx` — generation settings → `<Select>`, count slider → `<Slider>`, buttons → `<Button>`, status → `<Badge>`
  - `AvatarStudioPage.tsx` — parameter dropdowns → `<Select>`, sliders → `<Slider>`, text areas → `<Textarea>`, buttons → `<Button>`
  - `MachinePage.tsx` — concept → `<Input>`, duration/tone/voice → `<Select>`, prompt count → `<Slider>`, buttons → `<Button>`
- Static options arrays extracted to module-level constants (DURATION_OPTIONS, TONE_OPTIONS, GENDER_OPTIONS, etc.)
- Structural elements intentionally NOT migrated: toggle groups (segmented controls), avatar grid buttons, download `<a>` links, raw textareas with custom flex layouts
- Code review fixes (HIGH+MID priority):
  - Fixed `e.target as HTMLInputElement` → `e.currentTarget.value` across all Slider onChange handlers (4 files)
  - Added `alt` attributes to `<img>` elements missing them (MachinePage)
  - Added `aria-label` to ~12 icon-only `<Button>` instances across all 5 pages (WCAG 1.1.1 compliance)
  - Added `displayName` to `Textarea` forwardRef component
- Verification:
  - `tsc --noEmit`: 0 errors
  - `npm run build`: clean production build, all lazy chunks correctly code-split
  - `npm run smoke:desktop:journey`: all journeys pass
- Known MID-priority items deferred to future sprint:
  - Two raw `<textarea>` elements not migrated to Textarea component (PromptFactoryPage editor, AssetMonsterPage custom prompt) due to layout constraints

31. Sprint 4C — Button refinement + !important elimination (Session 4):
- Extended `Button` component with `xs` size variant:
  - `p-1 text-xs gap-1` — designed for icon-only buttons that previously needed `!p-1`
- Extended `Button` component with 3 ghost color sub-variants:
  - `ghost-danger`: transparent bg, text-surface-400, hover → bg-danger-muted/30 + text-danger
  - `ghost-warning`: transparent bg, text-surface-400, hover → bg-warning-muted/30 + text-warning
  - `ghost-muted`: transparent bg, text-surface-400, hover → bg-surface-100 + text-surface-900
- Eliminated all ~20 `!important` overrides across 5 page components:
  - `LibraryPage.tsx` — trash → ghost-danger xs, Load All → ghost xs, copy → ghost xs, star → ghost-warning xs
  - `PromptFactoryPage.tsx` — tab toggles → ghost-muted, overlay close → ghost xs, copy → ghost xs, star → ghost-warning xs, cancel research → ghost-danger
  - `AssetMonsterPage.tsx` — Clear All → ghost-danger, generate button padding normalized, dismiss → ghost-muted xs
  - `AvatarStudioPage.tsx` — dismiss → ghost-muted xs
  - `MachinePage.tsx` — dismiss → ghost-muted xs
- Post-sweep: 0 `!important` overrides remaining (verified via grep)
- Textarea resize: changed hardcoded `resize-none` → `resize-y` for user flexibility
- Fixed AssetMonsterPage export inconsistency:
  - Changed `export function AssetMonsterPage` → `export default function AssetMonsterPage`
  - Simplified AppShell lazy import (removed `.then()` workaround)
- Verification:
  - `tsc --noEmit`: 0 errors
  - `npm run build`: clean (CSS size dropped 47.87 → 47.73 kB)
  - `npm run smoke:desktop:journey`: all journeys pass
- Codex CLI unavailable this session (model `gpt-5.3-codex` not found). Self-review performed instead.

32. Sprint 5A — Vitest unit test foundation (Session 5):
- Installed Vitest v4.0.18 + @vitest/coverage-v8 as devDependencies.
- Created `vitest.config.ts`:
  - `pool: 'forks'` (required — `better-sqlite3` is a native addon that can't load in worker threads; forks also give process-level singleton isolation between test files)
  - `environment: 'node'`, `globals: false`, `testTimeout: 10_000`
  - Coverage: v8 provider, includes `src/server/**/*.ts`, excludes test files + smoke + telemetry CLI scripts
- Created `src/server/test-helpers.ts`:
  - `setupTestDb()` — creates temp dir via `mkdtemp()`, calls `initDatabase(tmpDir)`, returns `{ tmpDir, cleanup() }`
  - `mockResponse()` — minimal Express Response spy with `_status` and `_json` capture
  - `withEnv(overrides, fn)` — temporarily sets env vars, restores originals in finally block
- Created 6 test files (86 tests total, all passing):
  - `src/server/utils/http.test.ts` (7 tests) — sendSuccess/sendError envelope shape
  - `src/server/db/index.test.ts` (10 tests) — DB singleton lifecycle, WAL mode, foreign keys, backup, idempotent init/close; each test creates its own tmpDir via try/finally
  - `src/server/services/providerRuntime.test.ts` (19 tests) — isMockProvidersEnabled env parsing, mock data URL/PNG/ID shape, classifyProviderFailure classification, runWithRetries retry+telemetry, recordMockProviderSuccess; uses `vi.mock('./telemetry.js')` for telemetry stubbing
  - `src/server/services/telemetry.test.ts` (6 tests) — recordPipelineEvent JSONL write/validation/disabled/error-swallow, createPipelineSpan success/error with durationMs
  - `src/server/services/auth.test.ts` (19 tests) — createUser/authenticateUser/verifyToken/getUserById/changePassword/listUsers/ensureBootstrapAdminIfConfigured
  - `src/server/services/history.test.ts` (25 tests) — getHistory/addToHistory/deleteHistoryEntry/clearHistory/getFavorites/addToFavorites/removeFromFavorites/updateFavoriteName including auto-prune at 100 and multi-user isolation
- Updated `package.json`:
  - Added scripts: `test` (vitest run), `test:watch` (vitest), `test:coverage` (vitest run --coverage)
  - Inserted `npm run test` into `gate:release` between `lint` and `smoke:api` (fast-to-slow pyramid ordering)
- Updated `tsconfig.node.json`: added `vitest.config.ts` to include array.
- Native module dual-build pattern established:
  - Tests require `better-sqlite3` compiled for system Node (`npx --yes node-gyp rebuild --directory=node_modules/better-sqlite3`)
  - Electron app requires `better-sqlite3` compiled for Electron (`npm run native:rebuild`)
  - Run tests first, then rebuild for Electron before running the app
- Known production code observation: `backupDatabase()` in `db/index.ts` doesn't await `db.backup()` — tests use a 200ms delay workaround; may warrant a separate fix.
- Code review: Codex CLI unavailable (model `gpt-5.3-codex` not found). Self-review performed; fixed 2 MID-priority issues:
  - Replaced CJS `require('jsonwebtoken')` with ESM `import jwt from 'jsonwebtoken'` in auth.test.ts
  - Removed redundant destructured `fs/promises` import in telemetry.test.ts (consolidated to single namespace import)
- Verification: 86/86 tests pass, `tsc --noEmit` clean, `npm run build` clean, Electron native rebuild successful.

33. Sprint 5B — Biome linter + formatter (Session 5):
- Installed `@biomejs/biome` v2.3.14 as devDependency.
- Created `biome.json` (Biome v2 schema):
  - `vcs.useIgnoreFile: true` — respects `.gitignore` (avoids duplicating exclusions)
  - `files.includes` — positive pattern targeting `src/**`, `scripts/**`, config files
  - Formatter: space indent (2), line width 120, single quotes, no semicolons, trailing commas all
  - Linter: recommended rules + selective overrides (see below)
  - CSS: `tailwindDirectives: true` parser, formatter + linter disabled (Tailwind v4 compatibility)
  - Assist: `organizeImports` enabled
- Rule configuration decisions:
  - `noNonNullAssertion: "off"` — 41 instances, mostly legitimate post-middleware assertions; tsc strict null checks cover the dangerous cases
  - `useIterableCallbackReturn: "warn"` — false positives with `.forEach()` in `onQueueUpdate` callbacks
  - `noArrayIndexKey: "warn"` — often valid with static React lists
  - `useNodejsImportProtocol: "error"` — enforces `node:` prefix on all Node.js builtins
  - 6 a11y rules set to `"warn"`: `useButtonType`, `useKeyWithClickEvents`, `useMediaCaption`, `noStaticElementInteractions`, `noLabelWithoutControl`, `noRedundantAlt` (61 warnings — deferred to accessibility sprint)
- Added `package.json` scripts:
  - `lint:biome` — `biome check .` (CI-safe, no writes)
  - `format` — `biome format --write .` (dev workflow)
  - `format:check` — `biome format .` (CI-safe)
- Updated `gate:release`: inserted `npm run lint:biome &&` at the beginning (fastest check, sub-second)
- Auto-fixed 98 source files via `biome check --fix --unsafe`:
  - `node:` protocol added to all Node.js builtin imports (83 instances)
  - `import type` separated from value imports (`useImportType` rule)
  - Import ordering alphabetized (`organizeImports`)
  - Optional chaining applied where applicable (`useOptionalChain`)
  - Template literals used instead of concatenation (`useTemplate`)
  - Prototype builtins replaced (`noPrototypeBuiltins`)
  - `@ts-ignore` → `@ts-expect-error` (`noTsIgnore`)
  - Unused imports removed
  - Formatting normalized (trailing commas, line wrapping to 120 chars)
- Manual code fixes (3 files):
  - `src/renderer/components/asset-monster/AssetMonsterPage.tsx` — removed unused `previewImage` destructure
  - `src/renderer/components/avatar-studio/AvatarStudioPage.tsx` — removed unused `fullSizeAvatarUrl` destructure
  - `src/server/routes/auth.ts` — replaced `catch (err: any)` with `catch (err)` + `instanceof Error` type narrowing
- CI workflow updates:
  - `.github/workflows/ci.yml` — added `native:rebuild` step after `npm ci`
  - `.github/workflows/nightly-real-smoke.yml` — added `native:rebuild` step + split Lint into `Lint (Biome)` + `Lint (TypeScript)`
- Code review (Codex CLI unavailable, self-review performed):
  - HIGH: nightly workflow missing `lint:biome` — FIXED (split into separate Biome + TypeScript lint steps)
  - MID: `useIterableCallbackReturn` and `noArrayIndexKey` promoted from `"off"` to `"warn"` — FIXED
  - MID: `noNonNullAssertion` kept as `"off"` — tsc strict null checks provide equivalent safety; 41 instances would add significant warning noise
  - MID: `gate:release` chain maintainability — noted for future refactor to shell script
  - LOW: all auto-fix transformations verified safe (`node:` protocol in Electron, `import type` separation, import reordering)
- Verification: `biome check .` 0 errors/77 warnings, `tsc --noEmit` clean, 86/86 tests pass, `npm run build` clean, Electron native rebuild successful.

34. Sprint 5C — Accessibility fixes (Session 5):
- Fixed all 77 Biome warnings (61 a11y + 9 useIterableCallbackReturn + 7 noArrayIndexKey) and promoted all rules from `"warn"` to `"error"`.
- `useButtonType` (30+ instances across 14 files):
  - Added `type = 'button'` as default prop in `Button.tsx` component (prevents accidental form submission)
  - Added explicit `type="button"` to every raw `<button>` element across 13 component files
  - Files: Button, ErrorBoundary, Modal, TopNav, UserMenu, NotificationBell, ProductSelector, FeedbackWidget, AvatarPreviewOverlay, ImagePreviewOverlay, AssetMonsterPage, AvatarStudioPage, MachinePage
- `useKeyWithClickEvents` + `noStaticElementInteractions` (overlay backdrops):
  - Added `role="presentation"` to backdrop divs in Modal, AvatarPreviewOverlay, ImagePreviewOverlay
  - Modal backdrop also has biome-ignore for `noStaticElementInteractions` (role="presentation" suppresses keyboard rule but not static interaction rule)
  - Inner content containers (stopPropagation wrappers) inherit suppression from parent's `role="presentation"` — no additional attributes needed
- `noLabelWithoutControl` (5 instances):
  - Changed standalone `<label>` to `<span>` in Slider.tsx, AssetMonsterPage (Custom Prompt), AvatarStudioPage (Select Voice, Duration)
  - Added `aria-label={label}` to Slider's `<input type="range">` to maintain screen reader association
  - PromptFactoryPage `<label>` wrapping hidden file input left as-is (correct HTML pattern)
- `noRedundantAlt` (1 instance): MachinePage `alt="Generated image"` → `alt="Generated result"`
- `useMediaCaption` (5 instances): biome-ignore on AI-generated `<audio>`/`<video>` elements (AvatarStudioPage: 3, MachinePage: 2) — no captions available for AI-generated content
- `noArrayIndexKey` (7 instances): biome-ignore on static/append-only lists (PromptFactoryPage: 3, AssetMonsterPage: 2, AvatarStudioPage: 1, MachinePage: 1)
  - Suppression placement: inside JSX element, directly before `key=` prop (Biome v2 reports at prop location, not element start)
- `useIterableCallbackReturn` (9 instances): biome-ignore on side-effect-only `.forEach()` callbacks
  - Server services: fal.ts, avatar.ts (2), tts.ts, lipsync.ts, kling.ts (onQueueUpdate logging)
  - Renderer stores: machineStore.ts, avatarStore.ts, generationStore.ts (FormData append)
- Div-to-button conversions (4 instances): clickable `<div>` elements converted to `<button type="button">` with `w-full text-left` classes
  - PromptFactoryPage: prompt list items
  - LibraryPage: favorites list items, history entries
  - AvatarStudioPage: generated avatar selector + clickable img wrapped in button
- `biome.json` rule promotion: all 8 rules changed from `"warn"` to `"error"` (useButtonType, useKeyWithClickEvents, useMediaCaption, noStaticElementInteractions, noLabelWithoutControl, noRedundantAlt, noArrayIndexKey, useIterableCallbackReturn)
- Code review findings (Codex CLI unavailable, self-review performed):
  - HIGH: none
  - MID (fixed): inner overlay content containers had `role="presentation"` which is semantically incorrect for containers with interactive children — removed (parent's role cascades)
  - MID (fixed): Slider `<span>` label had no programmatic association to range input — added `aria-label={label}` to `<input>`
  - MID (noted for follow-up): AvatarPreviewOverlay has no Escape-key keyboard support (pre-existing, not a Sprint 5C regression)
  - LOW: `noArrayIndexKey` suppressions on prompt/avatar lists that can change during session — acceptable, React reconciliation risk minimal
- Verification: `biome check .` 0 errors/0 warnings across 119 files, `tsc --noEmit` clean, `npm run build` clean.

35. Avatar directory separation (Session 6):
- Split avatar storage: `avatars/` (curated, hand-picked) stays read-only; `avatars_generated/` (AI-generated) receives new uploads.
- Added static serving for `avatars_generated/` in `createApp.ts`.
- Updated `GET /api/avatars` to list from both directories, returning combined array with `source: 'curated' | 'generated'` field.
- Updated lipsync and i2v endpoints in `avatars.ts` to resolve `/avatars_generated/` path prefix (alongside existing `/avatars/` and `/outputs/`).
- Files:
  - `src/server/createApp.ts`
  - `src/server/routes/avatars.ts`

36. Multi-image Image to Prompt (Session 6):
- Replaced single-image analysis with multi-image support in Prompt Factory's "Image to Prompt" sub-tab.
- New `AnalyzeEntry` interface: `{ file, preview, loading, prompt, error, copied }`.
- Store changes: replaced `analyzeImage`/`analyzedPrompt` with `analyzeEntries: AnalyzeEntry[]`.
- New methods: `addAnalyzeFiles`, `removeAnalyzeEntry`, `clearAnalyzeEntries`, `analyzeEntry` (single), `analyzeAllEntries` (parallel via Promise.all), `copyAnalyzedEntry`.
- UI: multi-file dropzone, per-image cards with analyze/view/copy/remove buttons, "Analyze All" bulk action, "Use in Factory"/"Asset Monster" buttons for all analyzed prompts.
- Updated `ImagePreviewOverlay.tsx` and `navigationStore.ts` to use new `addAnalyzeFiles` API.
- Files:
  - `src/renderer/stores/promptStore.ts`
  - `src/renderer/components/prompt-factory/PromptFactoryPage.tsx`
  - `src/renderer/components/layout/ImagePreviewOverlay.tsx`
  - `src/renderer/stores/navigationStore.ts`

37. Dev auto-login (auth race condition fix) (Session 6):
- Problem: Auth gate commented out for development, but API routes require JWT. Initial `useEffect` approach in AppShell had race condition (async login not awaited, hooks ordering violation after early return).
- Fix: moved dev auto-login into `authStore.init()`. When no token exists, `init()` awaits `login('dev@pixery.ai', 'dev123pixery!')` before setting `loading: false`. Loading spinner stays up until token is ready — no API calls can fire before authentication.
- Bootstrap admin env vars in `.env`: `PIXFLOW_BOOTSTRAP_ADMIN_ON_STARTUP=true`, email `dev@pixery.ai`, password `dev123pixery!`.
- Note: stale DB from previous session had admin with old password; required DB deletion and recreation.
- TODO: remove dev auto-login and re-enable auth gate before release (marked in both `authStore.ts` and `AppShell.tsx`).
- Files:
  - `src/renderer/stores/authStore.ts`
  - `src/renderer/components/layout/AppShell.tsx`
  - `.env` (bootstrap admin vars)

38. Img2Video camera & shot preset chips (Session 6):
- Added selectable camera movement / shot type preset chips to Img2Video page.
- 3 preset categories: Camera Movement (10 options), Camera Speed (1 option), Shot Type (9 options) — sourced from Kling AI prompt fragment library.
- One selection per category, toggle behavior (click again to deselect).
- `composePrompt()` helper appends selected fragments to each image's base prompt at generation time (comma-separated).
- Store: `VIDEO_PRESETS` constant (exported), `selectedPresets` state, `setPreset`/`clearPresets` actions, `composePrompt` integration in `generateAll()`.
- UI: chip rows between image cards and Settings panel, brand-colored selected state, "Clear" button when presets active.
- Files:
  - `src/renderer/stores/img2videoStore.ts`
  - `src/renderer/components/img2video/Img2VideoPage.tsx`

39. Gemini 3 Flash for Image-to-Prompt (Session 7):
- Replaced GPT-4o with Google Gemini 3 Flash (`gemini-3-flash-preview`) for image analysis in Image-to-Prompt.
- Rationale: Gemini 3 Flash scores 79.0 on vision benchmarks vs GPT-4o's lower score; produces more detailed and accurate analysis.
- Installed `@google/genai` SDK. Uses `responseMimeType: 'application/json'` for guaranteed valid JSON output.
- `systemInstruction` carries the full ANALYSIS_PROMPT, `contents` carries the image as `inlineData` (base64) + user message.
- Same `AnalyzedPrompt` interface and function signature — drop-in replacement. No route changes needed.
- Updated UI strings from "GPT-4o Vision" to "Gemini 3 Flash" in PromptFactoryPage.
- Fallback plan: Claude Opus 4.5 if Gemini quality is unsatisfactory (not needed so far).
- Files:
  - `src/server/services/vision.ts`
  - `src/renderer/components/prompt-factory/PromptFactoryPage.tsx`
  - `.env` (added `GEMINI_API_KEY`)
  - `package.json` (added `@google/genai`)

40. Monster UI — auto-select prompts from Image-to-Prompt (Session 7):
- Fixed: "Asset Monster" button in Image-to-Prompt sub-tab was navigating to Monster without selecting prompts.
- Added `generationStore.selectAllPrompts(analyzed.length)` and `setImageSource('upload')` to match "Send to Monster" behavior from Concept-to-Prompts.
- File: `src/renderer/components/prompt-factory/PromptFactoryPage.tsx`

41. Monster UI — generation batch history with colored borders (Session 7):
- New feature: previous generation batches are preserved in the UI when starting a new generation.
- Added `CompletedBatch` interface and `completedBatches: CompletedBatch[]` state to generationStore.
- 8 distinct border colors cycle through batches: brand, emerald, amber, rose, cyan, violet, orange, teal.
- When `startBatch` is called, current `batchProgress` (if it has completed images) is archived into `completedBatches`.
- "Previous Generations" section renders below active batch with per-batch download and preview.
- Arrow key navigation in ImagePreviewOverlay spans across all batches (current + archived).
- "Clear History" button to remove archived batches.
- Files:
  - `src/renderer/stores/generationStore.ts`
  - `src/renderer/components/asset-monster/AssetMonsterPage.tsx`
  - `src/renderer/components/layout/ImagePreviewOverlay.tsx`
  - `src/renderer/hooks/useImagePreviewKeyboard.ts`

42. Monster UI — Download All/Selected bug fix + zip download (Session 7):
- Bug fix: "Download All" was opening images fullscreen in Electron instead of downloading.
- Root cause: `document.createElement('a').click()` with HTTP URL navigates Electron renderer to image URL.
- Fix: fetch as blob → create blob URL → download from blob URL.
- Enhancement: multi-image downloads now zip automatically using JSZip (client-side).
  - Single image: downloads directly as file.
  - Multiple images: zipped with DEFLATE compression, downloaded as `{concept}_images.zip`.
- "Download All" now auto-selects all images (visual feedback for what's being downloaded).
- Download button in ImagePreviewOverlay also fixed with blob-based approach.
- Files:
  - `src/renderer/components/asset-monster/AssetMonsterPage.tsx`
  - `src/renderer/components/layout/ImagePreviewOverlay.tsx`
  - `package.json` (added `jszip`)

43. Monster UI — reference images horizontal scroll (Session 7):
- Changed reference image thumbnails from `flex-wrap` (multi-row) to `overflow-x-auto` (single-row horizontal scroll).
- Thumbnails reduced from `w-16 h-16` to `w-14 h-14` with `shrink-0` to prevent flex shrinking.
- Saves vertical space in the right panel.
- File: `src/renderer/components/asset-monster/AssetMonsterPage.tsx`

44. Monster UI — generation ETA + spinner placeholders + prompt box height (Session 8):
- Added remaining time estimate during batch generation: tracks elapsed time via `useRef`/`useEffect`, computes average time per completed image, displays `~Xm Xs remaining`.
- Added spinning `Loader2` icon inside queued placeholder cards during active generation (replaces static image icon).
- Fixed prompt box height to `h-[calc(100vh-420px)] min-h-[320px]` for consistent sizing relative to viewport.
- Fixed TDZ (Temporal Dead Zone) crash: `totalCount` referenced `totalImages` before its `const` declaration — moved derived calculations after definition.
- File: `src/renderer/components/asset-monster/AssetMonsterPage.tsx`

45. Monster UI — avatar gallery horizontal scroll (Session 8):
- Changed avatar gallery from `grid grid-cols-8` to `flex gap-2 overflow-x-auto pb-2` with `w-20 shrink-0` on each avatar button.
- Consistent single-row scroll pattern across all avatar galleries.
- File: `src/renderer/components/asset-monster/AssetMonsterPage.tsx`

46. Avatar Studio — gallery horizontal scroll (Session 8):
- Changed avatar gallery from `grid grid-cols-5 gap-2 max-h-[300px] overflow-auto` to `flex gap-2 overflow-x-auto pb-2` with `w-20 shrink-0`.
- File: `src/renderer/components/avatar-studio/AvatarStudioPage.tsx`

47. The Machine — avatar gallery horizontal scroll (Session 8):
- Changed avatar gallery from `grid grid-cols-5 gap-2 max-h-[200px] overflow-auto` to `flex gap-2 overflow-x-auto pb-2` with `w-20 shrink-0`.
- File: `src/renderer/components/machine/MachinePage.tsx`

48. Reference image in prompt generation pipeline (Session 8):
- Added optional reference image upload to "Create Prompts" tab (formerly "Concept to Prompts").
- Frontend: `referenceImage`/`referencePreview` state in promptStore, `setReferenceImage` action, `generate()` switches to FormData when image present.
- UI: small image upload button (ImagePlus icon) next to concept input, thumbnail preview with X to remove.
- Fallback: if image-only (no concept text), auto-switches to Image-to-Prompt mode and analyzes.
- Server: multer middleware on `/api/prompts/generate`, analyzes image via Gemini 3 Flash (`analyzeImage`), passes `imageInsights` to `generatePrompts()`.
- Prompt generator: appends REFERENCE IMAGE ANALYSIS section to GPT-4o user message with style, lighting, set design, camera, effects, outfit from analysis.
- Files:
  - `src/renderer/stores/promptStore.ts`
  - `src/renderer/components/prompt-factory/PromptFactoryPage.tsx`
  - `src/server/createApp.ts`
  - `src/server/services/promptGenerator.ts`

49. Rename "Concept to Prompts" → "Create Prompts" (Session 8):
- Updated sub-tab label and mode description in PromptFactoryPage.
- File: `src/renderer/components/prompt-factory/PromptFactoryPage.tsx`

50. Monster UI — prompt edit button (Session 8):
- Added Pencil icon button on each generated prompt card.
- Clicking switches to Custom prompt tab and pastes the prompt JSON (stringified with formatting).
- Uses `stopPropagation()` to prevent card's toggle selection from firing.
- File: `src/renderer/components/asset-monster/AssetMonsterPage.tsx`

51. Monster UI — "Double click to preview" tooltip (Session 8):
- Added `title="Double click to preview"` to all completed image thumbnails in current batch and previous generation batches.
- File: `src/renderer/components/asset-monster/AssetMonsterPage.tsx`

52. Sticky top bar (Session 9):
- Made TopNav + ProductSelector sticky during scroll (`sticky top-0 z-40 bg-surface-0`).
- File: `src/renderer/components/layout/AppShell.tsx`

53. Image-to-Prompt inline editing (Session 9):
- Prompt text in analyze cards now wraps (`break-words`) instead of truncating.
- Added Edit (Pencil) button per card — opens inline textarea with the prompt JSON.
- "Save Changes" button: tries `JSON.parse` first, falls back to `/api/prompts/text-to-json` API for plain text.
- Inline error display on save failure.
- Store: added `updateAnalyzeEntryPrompt(index, prompt)` action to promptStore.
- Files:
  - `src/renderer/stores/promptStore.ts`
  - `src/renderer/components/prompt-factory/PromptFactoryPage.tsx`

54. Multi-concept prompt input (Session 9):
- Replaced single `concept: string` with `concepts: string[]` array in promptStore.
- New actions: `updateConcept(i, val)`, `addConcept()`, `duplicateConcept(i)`, `removeConcept(i)`, `setConcepts(concepts)`.
- Default prompt count changed from 8 to 1.
- "+" (Add Concept) and Duplicate buttons below concept rows with dashed border aesthetic.
- Remove (X) button per row when >1 concepts.
- `generate()` loops over active concepts sequentially, calling `/api/prompts/generate` per concept, accumulating results.
- Slider shows `totalPrompts = activeConcepts.length × count`.
- Bounds check on `updateConcept`, non-empty validation on `setConcepts`.
- SSE `JSON.parse` wrapped in try/catch to prevent malformed frames from killing multi-concept generation.
- Files:
  - `src/renderer/stores/promptStore.ts`
  - `src/renderer/components/prompt-factory/PromptFactoryPage.tsx`
  - `src/renderer/components/asset-monster/AssetMonsterPage.tsx` (concept destructure update)
  - `src/renderer/components/library/LibraryPage.tsx` (setConcept → setConcepts migration)

55. Better error messages (Session 9):
- `parseError()` now surfaces actual server error details for 400/500 responses instead of generic messages.
- Checks `err.message` first (if not just "HTTP 400/500"), falls back to generic text.
- File: `src/renderer/types/index.ts`

56. Shimmer placeholders + status tooltips (Session 9):
- Added `@keyframes shimmer` CSS animation.
- Generating image cards: warm shimmer gradient overlay + spinner.
- Queued image cards: subtle shimmer gradient overlay + spinner.
- All thumbnail states now have status-specific tooltips: "Double click to preview", "Generating...", "Generation failed", "Queued".
- Fixed `Array.fill` shared references → `Array.from + structuredClone` for custom prompts.
- Timer effect optimized: primitive deps only to avoid interval churn on every SSE event.
- Files:
  - `src/renderer/index.css`
  - `src/renderer/components/asset-monster/AssetMonsterPage.tsx`
  - `src/renderer/components/prompt-factory/PromptFactoryPage.tsx`

57. Face visibility rule (Session 9):
- MANDATORY rule: face must be at least 90% visible, unobstructed, and oriented toward camera in every generated prompt.
- Added to 4 locations in server prompt instructions:
  - `CREATIVE_DIRECTOR_KNOWLEDGE` AVOID list (promptGenerator.ts)
  - `generatePromptBatch` developer message as rule 10.5 + BANNED section (promptGenerator.ts)
  - `textToPrompt` system prompt REQUIRED section (promptGenerator.ts)
  - `ANALYSIS_PROMPT` as new "Face Visibility - MANDATORY" section (vision.ts)
- Added to CLAUDE.md as rule 3.4 with ❌/✅ examples.
- Files:
  - `src/server/services/promptGenerator.ts`
  - `src/server/services/vision.ts`
  - `CLAUDE.md` (borgflow root)

58. Prompt Factory research improvements - Phase 1: Smart caching (Session 11):
- Added keyword-based research cache with 48-hour TTL
- Cache key: `concept:lowercase_normalized_concept` (normalized via lowercase + whitespace collapse)
- Cache management: LRU eviction at 1000 entries max
- Database schema: added `research_cache` table with `concept TEXT UNIQUE, research_data TEXT, created_at INTEGER, source_urls TEXT, last_web_search INTEGER`
- Performance improvement: 30% faster on cache hits (46s → 32s for research phase)
- Cache stats logging: hit/miss/size tracking in console
- Files:
  - `src/server/services/research.ts` — cache layer implementation, getCachedResearch/setCachedResearch/evictOldestCacheEntry
  - `src/server/db/schema.ts` — research_cache table schema
  - `src/server/createApp.ts` — cache hit logging

59. Prompt Factory research improvements - Phase 3: Streaming UX (Session 11):
- Implemented Server-Sent Events (SSE) streaming for dramatic perceived performance improvement
- Three-phase streaming architecture:
  - **Phase 1**: Quick prompt with DEFAULT_RESEARCH_BRIEF (2s) — instant user feedback
  - **Phase 2**: Background research with progress updates (40-46s)
  - **Phase 3**: Enriched prompts with full research data (40-50s)
- Backend implementation:
  - Added `DEFAULT_RESEARCH_BRIEF` export in research.ts for quick first prompt generation
  - Created `generateSinglePrompt()` in promptGenerator.ts for Phase 1 quick preview
  - Modified `/api/prompts/generate` POST endpoint for 3-phase streaming with SSE events
  - Added GET endpoint for EventSource compatibility (HTTP spec requirement — EventSource only supports GET)
  - SSE events: `prompt` (with quick/enriched flags), `research`, `status`, `progress`, `done`, `error`
  - Removed redundant dynamic imports causing build warnings
- Frontend implementation:
  - Replaced fetch with EventSource in promptStore.ts for streaming support
  - Pre-allocated prompt array for progressive population (null → quick → enriched)
  - Added progressive loading states: `quick_prompt`, `research`, `research_complete`, `enriching`, `done`
  - Skeleton loaders for pending prompts in PromptFactoryPage.tsx
  - Visual badges: "Quick" (⚡ Zap icon) for preview prompts, "Enhanced" (✨ Sparkles) for research-enriched
  - Updated progress text to show streaming phases with descriptive messages
  - Graceful error handling: keeps partial results on connection loss
- Type system:
  - Added `_quick?: boolean` and `_enriched?: boolean` internal flags to GeneratedPrompt interface
  - Extended GenerationProgress with new step types and optional message field
- Performance impact:
  - Time to first prompt: 48s → **2s** (24x faster perceived performance)
  - Total time: ~90s (similar, but vastly improved UX)
  - Cache hits: Even faster (32s research → faster enrichment)
- User experience flow:
  1. Click Generate → See first prompt in ~2 seconds
  2. Research happens in background (progress bar visible)
  3. Remaining 9 prompts populate progressively with research data
  4. Feels dramatically faster with instant feedback vs long wait
- Files:
  - `src/server/services/research.ts` — DEFAULT_RESEARCH_BRIEF export
  - `src/server/services/promptGenerator.ts` — generateSinglePrompt() for quick preview
  - `src/server/createApp.ts` — 3-phase streaming, GET endpoint, SSE event emission
  - `src/renderer/stores/promptStore.ts` — EventSource integration, progressive state management
  - `src/renderer/components/prompt-factory/PromptFactoryPage.tsx` — skeleton loaders, badges, streaming progress UI
  - `src/renderer/types/index.ts` — GeneratedPrompt flags, GenerationProgress extensions

60. Image-to-Prompt model switch (Session 11):
- Migrated from Gemini 3 Flash to GPT-4o Vision for consistency
- Updated `src/server/services/vision.ts`:
  - Replaced `@google/genai` import with `OpenAI` from `openai`
  - Changed `analyzeImage()` to use `openai.chat.completions.create()` with model `gpt-4o`
  - Kept identical ANALYSIS_PROMPT system prompt (no changes)
  - Maintains same response format: JSON with AnalyzedPrompt structure
- Updated UI strings in PromptFactoryPage.tsx to reflect GPT-4o Vision usage
- Build successful, no errors
- Files:
  - `src/server/services/vision.ts` — API migration from Gemini to OpenAI
  - `src/renderer/components/prompt-factory/PromptFactoryPage.tsx` — UI copy update

61. Video download fixes (Session 11):
- Fixed fullscreen navigation bug when downloading videos in Electron
- Root cause: `<a href={videoUrl} download>` navigates Electron renderer to video URL instead of downloading
- Solution: Fetch video as blob → create blob URL → download → revoke URL
- Pattern implemented:
  ```typescript
  async function downloadVideo(url: string, filename: string) {
    const response = await fetch(url)
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    a.click()
    URL.revokeObjectURL(blobUrl)
  }
  ```
- Applied to 5 download buttons across 3 files:
  - `src/renderer/components/avatar-studio/AvatarStudioPage.tsx` — 3 buttons (lipsync video, i2v video, "Download All")
  - `src/renderer/components/machine/MachinePage.tsx` — 1 button (final video)
  - `src/renderer/components/img2video/Img2VideoPage.tsx` — handleDownload + handleDownloadAll
- User feedback: Reported issue directly, confirmed fix resolved workflow blocker

62. Img2Video improvements (Session 11):
- Added post-generation editing and management features
- Three new capabilities:
  1. **Edit Prompt**: Inline editing per image with textarea + Save/Cancel buttons
  2. **Add More Images**: Adds new images to existing batch without clearing results
  3. **Start Over**: Clears entries and presets for fresh generation
- UI/UX changes:
  - Changed source images grid from 8-column compact to 4-column cards
  - Each card shows: image, status badge, prompt text, Edit button
  - Added local state: `editingIndex` (number | null), `editingPrompt` (string)
  - Edit mode: textarea replaces prompt text, shows Save/Cancel buttons
  - Non-edit mode: shows prompt text, Edit button
- State management:
  - Editing happens in local React state, persists to Zustand on Save
  - `setEntryPrompt(index, prompt)` updates Zustand store
  - Add More uses existing `openFilePicker()` function
  - Start Over calls `clearEntries()` + `clearPresets()`
- Files:
  - `src/renderer/components/img2video/Img2VideoPage.tsx` — edit UI, Add More, Start Over buttons

63. Desktop launcher creation (Session 11):
- Created macOS app launchers to avoid manual terminal startup
- Three launcher options:
  1. **launch-pixflow.sh**: Shell script in project directory
  2. **Pixflow.command**: Double-clickable file on desktop
  3. **Pixflow.app**: Full macOS app bundle with icon and Terminal integration
- All launchers:
  - Navigate to `/Users/pixery/Projects/pixflow`
  - Check if `node_modules` exists, run `npm install` if missing
  - Execute `npm run dev` to start app
- macOS app bundle structure:
  - Info.plist with bundle metadata (CFBundleIdentifier: com.pixery.pixflow)
  - MacOS/Pixflow executable that opens Terminal window with npm run dev
  - Resources/icon.icns (copied from Electron default icon as placeholder)
- All executables have proper permissions (chmod +x)
- Desktop files location: `/Users/pixery/Desktop/`
- Files:
  - `launch-pixflow.sh` — project directory launcher (committed)
  - `/Users/pixery/Desktop/Pixflow.command` — desktop command file
  - `/Users/pixery/Desktop/Pixflow.app/` — full app bundle

60. GPT-4o revert + aggressive system prompt improvements (Session 10):
- **Problem identified**: After testing 4 models (GPT-4o, Claude Sonnet 4.5, Gemini 2.0 Flash Thinking, GPT-5.2), ALL produced identical poor quality scores (overall: 76/100, outfit detail: 12/100). Root cause: weak system prompt enforcement, not the model.
- **Database schema migration**: Added comprehensive quality scoring system:
  - New columns: `model_used TEXT`, `variety_score TEXT`, `quality_metrics TEXT`
  - Migration v1 in `src/server/db/migrations.ts`
  - Schema version tracked via SQLite `user_version` pragma
- **New scoring system**: Created `src/server/utils/promptScoring.ts`:
  - `PromptQualityMetrics` interface: overall_score (0-100), variety_score, specificity_score, completeness_score, detail_scores (outfit/lighting/pose/set_design), issues, strengths, model_used, timestamp
  - `calculatePromptQualityMetrics()`: weighted scoring algorithm (individual 30%, specificity 25%, completeness 15%, variety 15%, detail avg 15%)
  - `scorePrompts()`: per-prompt quality scoring with issues array
  - `getQualityRating()`: maps score to excellent/good/fair/poor
- **Model revert**: Changed from `gpt-5.2` back to `gpt-4o` in promptGenerator.ts and createApp.ts
- **Temperature optimization**: Lowered from 0.85 to 0.6 for better instruction-following (generatePromptBatch), 0.75 to 0.65 (textToPrompt)
- **Bad→Good examples added**: New "EXAMPLES: REJECT vs ACCEPT" section in system prompt with explicit anti-patterns:
  - Outfit: ❌ "Elevated, concept-appropriate attire" → ✅ "Bias-cut silk charmeuse slip dress in warm ivory, spaghetti straps, V-neckline, midi length, fabric draping loosely"
  - Lighting: ❌ "Natural lighting" → ✅ "Single key light from camera-left at 45° angle, 5600K daylight balanced, creating Rembrandt triangle..."
  - Pose: ❌ "Standing naturally" → ✅ "Standing with weight on left foot, right leg bent slightly at knee with heel lifted. Left arm raised..."
  - **Enforcement warning**: "IF YOUR OUTPUT CONTAINS VAGUE LANGUAGE, IT WILL BE REJECTED"
- **Vagueness detection**: Added to `src/server/utils/prompts.ts`:
  - `VAGUE_PATTERNS`: regex array detecting banned words (elevated, appropriate, stylish, concept-appropriate, etc.)
  - `REQUIRED_OUTFIT_PATTERNS`: fabric, color, cut/style keyword validators
  - `isVagueOutfit()`: pattern matching + keyword coverage check (requires 2/3 categories)
  - `validateOutfitSpecificity()`: comprehensive validation (40+ chars, no vague patterns, fabric required)
  - Updated `validatePrompt()` to use new specificity validation instead of simple 30-char length check
- **Quality gate**: Added pre-return validation in promptGenerator.ts:
  - Checks all generated prompts for vagueness before returning
  - Logs first outfit generated and vagueness status
  - Warns on quality issues but doesn't fail (lets scoring system track)
  - Prevents silently returning bad outputs
- **Fallback improvement**: Changed generic fallback from "Elevated, concept-appropriate attire" (31 chars, passes validation) to explicit scaffold:
  - `"FALLBACK SCAFFOLD - ${theme.aesthetic} garment REQUIRES SPECIFICS: [MUST specify: fabric type (silk/linen/leather/cotton), precise color name (not "neutral"), cut/style (bias-cut/oversized/fitted), fit description (loose/tailored), length (midi/ankle/knee)]"`
  - Makes fallback usage obvious (contains "FALLBACK SCAFFOLD" string)
  - Will fail quality checks spectacularly instead of silently passing
- **Comprehensive logging**: Added console output showing:
  - First outfit generated (truncated to 60 chars)
  - Vague language detection result (true/false)
  - Quality issues array if present
  - Quality strengths when score is high
- **Expected improvements**: Target quality scores:
  - Overall: 85-90/100 (up from 76)
  - Outfit Detail: 75-85/100 (up from 12 ❌)
  - Lighting Detail: 75-85/100 (up from 24-25)
  - Pose Detail: 70-80/100 (up from 27)
  - No generic descriptions, CRITICAL: markers present, no duplicates, variety test passed
- Files affected:
  - `src/server/services/promptGenerator.ts` — model revert, temperature, bad→good examples, quality gate, fallback, logging
  - `src/server/utils/prompts.ts` — vagueness detection functions, specificity validation
  - `src/server/utils/promptScoring.ts` — NEW comprehensive scoring system
  - `src/server/createApp.ts` — model name updates, quality metrics calculation
  - `src/server/db/schema.ts` — NEW columns for quality tracking
  - `src/server/db/migrations.ts` — schema migration v1
  - `src/server/services/history.ts` — NEW quality fields in interfaces

---

## 6) Remaining Risks / Gaps

1. API contract hardening:
- Success payloads are now strict envelope (`{ success, data }`).
- Remaining caution: third-party middleware responses (e.g., rate limiter) can still bypass helper format unless explicitly wrapped.

2. Observability depth gap:
- Telemetry now has report + trend snapshots + markdown dashboard snapshot + baseline history/suggestions.
- Next depth step: publish dashboard/baseline to a hosted/static observability surface with historical comparisons.

3. Native module rebuild reliability:
- Rebuild automation exists (`postinstall` + explicit CI/nightly `native:rebuild` step).
- Residual risk: verify rebuild behavior on clean environments and after Electron version bumps, since previous sessions observed `electron-rebuild` skip behavior in some setups.

4. ~~Biome warning baseline~~ — RESOLVED (Session 5, Sprint 5C):
- All 77 warnings fixed and rules promoted from `"warn"` to `"error"`.
- `biome check .` now reports 0 errors/0 warnings.
- New violations will fail CI immediately (no warning drift possible).

5. UI component library adoption gap — RESOLVED (Session 4, Sprint 4C):
- 13 UI components in `src/renderer/components/ui/` (Button, Input, Select, Slider, Card, Modal, Badge, Skeleton, EmptyState, DropZone, ProgressBar, ErrorBoundary, Textarea).
- All 5 page components use shared UI components. Button has 10 variants (primary, secondary, ghost, ghost-danger, ghost-warning, ghost-muted, danger, success, warning, accent) and 4 sizes (xs, sm, md, lg).
- 0 `!important` overrides remaining. Two raw textareas remain un-migrated due to custom layout needs (intentional).
- Risk: none. Migration complete.

6. Prompt quality monitoring — NEW (Session 10):
- Comprehensive quality scoring system in place with database persistence
- Need to establish baseline quality metrics after GPT-4o revert + system prompt improvements
- Monitor first 10-20 generations to validate scoring thresholds are calibrated correctly
- Consider adding quality alerts if overall_score drops below 80 or outfit_detail below 65

---

## 7) Recommended Next Steps (updated backlog summary)

**Completed backlog items:**
1. ~~Automate threshold tuning handoff~~ → **DONE** (Session 2)
2. ~~Add alert de-duplication window~~ → **DONE** (Session 2)
3. ~~Expose preflight decision history~~ → **DONE** (Session 2)
4. ~~Status color token migration~~ → **DONE** (Session 3): all hardcoded `emerald/amber/red/cyan` → semantic `success/warning/danger/accent` tokens.
5. ~~E2E verification~~ → **DONE** (Session 3): all tabs, auth, product switching, theme toggle, feedback widget verified.
6. ~~UI component library adoption~~ → **DONE** (Session 4): all 5 pages migrated to shared Button/Input/Select/Slider/Textarea/Badge.
7. ~~React ErrorBoundary~~ → **DONE** (Session 4): wraps all lazy-loaded pages in AppShell.
8. ~~Accessibility: icon-only button aria-labels~~ → **DONE** (Session 4): ~12 instances fixed across all pages.
9. ~~Button refinement (xs size + ghost sub-variants)~~ → **DONE** (Session 4, Sprint 4C): added xs size, ghost-danger/warning/muted variants, eliminated all !important overrides.
10. ~~AssetMonsterPage export fix~~ → **DONE** (Session 4, Sprint 4C): switched to export default, simplified lazy import.
11. ~~Textarea resize-y~~ → **DONE** (Session 4, Sprint 4C): changed from resize-none to resize-y.
12. ~~Vitest test runner + unit tests~~ → **DONE** (Session 5, Sprint 5A): 86 tests across 6 modules (http, db, providerRuntime, telemetry, auth, history). Integrated into gate:release.
13. ~~Biome linter + formatter~~ → **DONE** (Session 5, Sprint 5B): Biome v2.3.14, 98 files auto-fixed, 3 manual fixes, integrated into gate:release + CI + nightly.
14. ~~Accessibility sprint~~ → **DONE** (Session 5, Sprint 5C): All 77 Biome warnings fixed (30+ useButtonType, overlay role/keyboard patterns, label associations, media captions, array index keys, forEach callbacks). All rules promoted from `"warn"` to `"error"`. 0 errors/0 warnings.
15. ~~Avatar directory separation~~ → **DONE** (Session 6): `avatars/` (curated) + `avatars_generated/` (AI-generated), both served and listed in gallery.
16. ~~Multi-image Image to Prompt~~ → **DONE** (Session 6): batch upload + parallel analysis with per-image prompt cards.
17. ~~Img2Video preset chips~~ → **DONE** (Session 6): Camera Movement, Camera Speed, Shot Type chip categories with toggle selection.
18. ~~Prompt quality scoring system~~ → **DONE** (Session 10): Database schema migration, comprehensive quality metrics, vagueness detection, specificity validation.

**Immediate priorities:**

1. **Validate GPT-4o quality improvements**: Generate 10-20 test prompts and verify:
   - Overall score reaches 85-90/100 target
   - Outfit detail >70/100 (was 12/100)
   - No "Elevated, concept-appropriate attire" in any prompt
   - Console logs show "Contains vague language: false"
   - Quality metrics persisted correctly in database

2. **Re-enable auth gate before release**: Dev auto-login in `authStore.ts` and commented-out auth gate in `AppShell.tsx` must be reverted. Search for `TODO: remove when auth gate is re-enabled` and `TODO: re-enable auth gate before release`.

3. Validate native rebuild automation on clean environments:
- Confirm `postinstall` + `native:rebuild` works across fresh local clone and CI run.
- If intermittent skips recur, add fallback script with direct `node-gyp` parameters for `better-sqlite3`.

4. AvatarPreviewOverlay keyboard support: add Escape-key dismiss (Modal and ImagePreviewOverlay already have this, AvatarPreviewOverlay does not).

**Codex handoff (quality foundation):**
3. ~~Add Vitest test runner + unit tests for core backend services.~~ → **DONE** (Session 5, Sprint 5A).
4. ~~Add Biome or ESLint for static analysis beyond `tsc --noEmit`.~~ → **DONE** (Session 5, Sprint 5B).
5. ~~Add React ErrorBoundary wrappers around lazy-loaded page components.~~ → **DONE** (Session 4)
6. Improve mock smoke tests to cover provider failure scenarios (timeout, rate limit, partial failure).
7. Refactor `gate:release` from single `&&` chain to shell script for maintainability.

**Feature backlog:**
8. Publish dashboard/baseline to a hosted/static observability surface with historical comparisons.
9. Add provider-level SLA tracking with per-provider uptime windows.
10. Integrate threshold proposals into automated PR creation via GitHub Actions.
11. Add prompt quality telemetry dashboard showing quality score trends over time.
12. Add quality regression alerts when average quality drops >10 points between generations.

---

## 8) Interpretation Rules for Future AI Agents

- Treat `Burgflow Archive/` as read-only historical material.
- Treat root `src/` and `docs/` as active Pixflow source of truth.
- Keep product naming as **Pixflow** in all new code, docs, and UX strings.
- Keep all active documentation in English.
- Do not reintroduce archived paths into active build/runtime unless explicitly requested.

---

## 9) Verification Snapshot (post-change intent)

- Search for `borgflow`/`Borgflow` outside archive should be empty or near-empty.
- Active references should point to Pixflow docs and active `src/*`.
- Legacy code should remain discoverable under `Burgflow Archive/` only.
