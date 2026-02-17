# Pixflow Documentation Index

Last updated: 2026-02-17

This file defines the active documentation set to avoid duplication and drift.

## Command Alias

`docs sync` (and typo `dosc sync`) means:
1. Use this index as the source of truth.
2. Update active docs only (core/supporting, as needed).
3. Do not modify `docs/archive/*` unless explicitly requested.
4. Keep output concise: list updated files + why.
5. Commit only when user explicitly says `go`.

## Core (active, maintain regularly)

1. `README.md` - Product overview, setup, run/build, and key commands.
2. `CLAUDE.md` - Engineering/agent operating guide and architecture notes.
3. `docs/PIXFLOW_AI_VERSIONING_HANDOFF.md` - Canonical project handoff and change history.
4. `docs/PIPELINE.md` - Prompt Factory research/generation pipeline.
5. `docs/SCHEMA.md` - Prompt JSON schema reference.
6. `docs/PIXFLOW_UI_RULES.md` - UI/UX standards and component rules.
7. `docs/CLOUDFLARE_DEPLOY.md` - Frontend deployment guide.
8. `docs/REPO_STRUCTURE.md` - Repository structure and boundaries.

## Supporting (update when relevant)

1. `docs/EXAMPLES.md` - Prompt quality examples.
2. `docs/ops/*` - Telemetry/preflight/runtime operational reports.

## Archived (historical, do not update unless restoring)

1. `docs/archive/PIXFLOW_HANDOFF_FEB2026_FULL.md`
2. `docs/archive/PIXFLOW_AI_VERSIONING_HANDOFF_ARCHIVE_20260209.md`
3. `docs/archive/PIXFLOW_UI_INTERACTION_STANDARDIZATION_PLAN_FEB2026.md`

## De-duplication policy

1. Do not maintain multiple active handoff files.
2. Do not maintain duplicate readmes.
3. If a doc becomes historical, move it to `docs/archive/` and leave a short redirect stub in the old path.
4. For normal sprints, update only the docs that changed due to the feature.
