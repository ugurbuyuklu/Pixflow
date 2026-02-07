# Hedra Provider Runbook

## Scope
Use for failures where `top_failing_provider` is `hedra`.

## First Checks
1. Validate `HEDRA_API_KEY` configuration.
2. Inspect `avatars.lipsync.provider` errors and timeout patterns.
3. Check for media upload/download failures in logs.

## Immediate Mitigation
1. Retry nightly run once for transient provider/network failures.
2. If reproducible, disable real lipsync checks temporarily and keep mock profile active.

## Escalation
1. Owner team: `video-platform`
2. On-call: `@video-oncall`

## SLA
1. Critical alerts: acknowledge in 5 minutes, upload/lipsync diagnosis in 15 minutes.
2. Warning alerts: acknowledge in 30 minutes, upload/lipsync diagnosis in 60 minutes.
3. Update cadence: every 30 minutes until stable.

## Owner Checklist
1. Validate Hedra API health and request success rates.
2. Confirm whether failures are upload-side, processing-side, or download-side.
3. Execute mitigation (single retry or temporary real-check disable) and document rationale.
4. Open remediation task with evidence links from telemetry and artifacts.
