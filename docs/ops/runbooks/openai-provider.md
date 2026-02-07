# OpenAI Provider Runbook

## Scope
Use for failures where `top_failing_provider` is `openai`.

## First Checks
1. Confirm API key validity and quota for `OPENAI_API_KEY`.
2. Check recent `avatars.script.provider` errors in telemetry.
3. Verify incident status from OpenAI status page.

## Immediate Mitigation
1. Retry the failed nightly job once if not budget-limited.
2. If failures persist, temporarily route script generation to mock mode for non-prod checks.

## Escalation
1. Owner team: `ai-platform`
2. On-call: `@ai-oncall`

## SLA
1. Critical alerts: acknowledge in 5 minutes, provider diagnosis in 15 minutes.
2. Warning alerts: acknowledge in 30 minutes, provider diagnosis in 60 minutes.
3. Update cadence: every 30 minutes until stable.

## Owner Checklist
1. Validate OpenAI status and quota limits.
2. Confirm failure type distribution (timeout, rate_limit, network, provider) from telemetry.
3. Decide retry/fallback action and record in incident notes.
4. Open follow-up task for permanent fix (prompt volume, timeout, or retry tuning).
