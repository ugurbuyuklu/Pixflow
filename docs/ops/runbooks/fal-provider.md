# FAL Provider Runbook

## Scope
Use for failures where `top_failing_provider` is `fal`.

## First Checks
1. Validate `FAL_API_KEY` availability and permissions.
2. Inspect `generate.batch.provider` and `avatars.tts.provider` telemetry errors.
3. Verify external queue latency or outage indicators.

## Immediate Mitigation
1. Retry nightly if guardrails allow.
2. Reduce non-essential real-provider runs until stability returns.

## Escalation
1. Owner team: `ai-platform`
2. On-call: `@ai-oncall`

## SLA
1. Critical alerts: acknowledge in 5 minutes, queue-health diagnosis in 15 minutes.
2. Warning alerts: acknowledge in 30 minutes, queue-health diagnosis in 60 minutes.
3. Update cadence: every 30 minutes until stable.

## Owner Checklist
1. Validate FAL provider health and queue latency.
2. Confirm whether failures are isolated to `generate.batch.provider` or cross-pipeline.
3. Apply mitigation (throttle scope, retry once, or temporary mock-only fallback) and log decision.
4. File follow-up task for capacity or timeout tuning if repeated.
