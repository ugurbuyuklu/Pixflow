# Repository Structure (Current)

Last updated: 2026-02-15

This repo is an active web-first Pixflow workspace. Keep a strict split between source-of-truth code and runtime artifacts.

## Active source-of-truth areas

- `src/renderer` - React UI (pages, shared components, stores, hooks)
- `src/server` - Express API (routes, services, db, telemetry, smoke)
- `src/constants` - shared limits and cross-runtime constants
- `scripts` - operational scripts (gate, deploy, telemetry, PGP lock guard)
- `docs` - product/engineering documentation

## Runtime and local artifact areas (not versioned)

- `outputs/` - generated media
- `uploads/` - uploaded input files
- `logs/` - local log artifacts
- `data/*.db*` - sqlite runtime files
- `avatars_generated/` - generated avatar images
- `avatars_uploads/` - uploaded avatar images

## Intentional long-lived asset folders

- `avatars/` - curated avatar gallery used by UI flows
- `exports/` - explicit export artifacts

## Archive boundary

- `Burgflow Archive/` stores historical Borgflow-era materials.
- No new Pixflow development should be added under archive paths.

## Structure hygiene rules

1. One active implementation per feature (no duplicate runtime paths).
2. Keep generated media and sqlite runtime files out of git.
3. Prefer one canonical active doc per topic; mark historical docs clearly.
4. Add new top-level folders only when there is no existing home in `src/`, `docs/`, or `scripts/`.
