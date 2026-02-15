# Pixflow - Web AI Asset Platform

Last updated: 2026-02-15

Pixflow is a web-first creative production platform for content teams and growth workflows.

## Active categories

1. Prompt Factory
2. Asset Monster
3. Img2Engine
4. Avatar Studio
5. Captions
6. The Machine
7. Lifetime
8. Library
9. Competitor Report

## Runtime architecture

- Frontend: React + Vite SPA (`src/renderer`)
- Backend: Express API (`src/server`)
- Data/runtime outputs:
  - `data/` (sqlite runtime files)
  - `uploads/` (input media)
  - `outputs/` (generated media artifacts)

## Prompt Generation Pipeline lock

PGP is intentionally protected against accidental edits:

- `scripts/pgp-lock-guard.js`
- `docs/ops/pgp-lock.json`

Commands:

```bash
npm run pgp:lock:check
npm run pgp:lock:update
```

`pgp:lock:update` should run only after explicit user approval.

## Legacy archive

Legacy Borgflow materials live under:
- `Burgflow Archive/`

Do not place active Pixflow changes into archive folders.

## Documentation language policy

- Keep all active docs in English.
- If a non-English active doc appears, translate it and treat English as the source of truth.
