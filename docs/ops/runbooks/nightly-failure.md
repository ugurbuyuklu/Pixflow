# Nightly Failure Generic Runbook

## Scope
Use when provider attribution is unknown or mixed.

## First Checks
1. Open nightly workflow run and identify first failed step.
2. Inspect `telemetry-report.txt`, `telemetry-report.json`, and `logs/pipeline-events.jsonl`.
3. Confirm whether guardrail exceeded (`budget_exceeded` or `timeout_exceeded`).

## Immediate Mitigation
1. If guardrail exceeded, reduce run scope or increase limits with approval.
2. If provider errors dominate, handoff to mapped provider runbook.

## Escalation
1. Owner team: `core-platform`
2. On-call: `@core-oncall`

## SLA
1. Critical alerts: acknowledge in 5 minutes, mitigation owner assigned in 15 minutes.
2. Warning alerts: acknowledge in 30 minutes, mitigation owner assigned in 60 minutes.
3. Status updates: post update every 30 minutes until resolved or handed off.

## Owner Checklist
1. Confirm failure class: guardrail, provider outage, or internal regression.
2. Attach telemetry artifacts (`telemetry-report.json`, `telemetry-trends.json`, `nightly-alert.json`) to incident thread.
3. Decide retry policy (retry once, defer, or rollback guardrail scope) and document reason.
4. Link remediation issue with owner and ETA.
