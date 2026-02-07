# Kling Provider Runbook

## Scope
Use for failures where `top_failing_provider` is `kling`.

## First Checks
1. Validate `FAL_API_KEY` and model availability for Kling endpoint.
2. Inspect `avatars.i2v.provider` telemetry errors.
3. Check output download failures and size-limit violations.

## Immediate Mitigation
1. Retry nightly run once when error type is transient.
2. If failures persist, isolate i2v checks and proceed with remaining pipeline validation.

## Escalation
1. Owner team: `video-platform`
2. On-call: `@video-oncall`

## SLA
1. Critical alerts: acknowledge in 5 minutes, endpoint diagnosis in 15 minutes.
2. Warning alerts: acknowledge in 30 minutes, endpoint diagnosis in 60 minutes.
3. Update cadence: every 30 minutes until stable.

## Owner Checklist
1. Validate Kling endpoint availability and model compatibility.
2. Verify whether failures are generation-side or output retrieval-side.
3. Execute mitigation (single retry, isolate i2v checks, or fallback profile) and record decision.
4. Open follow-up issue with failure signatures and impacted runs.
