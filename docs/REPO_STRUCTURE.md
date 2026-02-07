# Repository Structure (Target)

This project is currently in active UI/UX iteration. To keep development fast, treat the repository with a strict split between source code and runtime output.

## Source of truth (active)

- `src/main` - Electron main process
- `src/preload` - Electron preload bridge
- `src/renderer` - React UI
- `src/server` - Express API used by the app
- `docs` - Product and engineering documentation
- `scripts` - Utility and maintenance scripts

## Runtime/local artifacts (not versioned)

- `outputs/` - generated images/audio/video
- `uploads/` - temporary uploaded files
- `logs/` - local logs
- `backups/` - local backups
- `data/*.db*` - SQLite runtime files

## Legacy/unclear ownership zones

- `packages/server`
- `packages/web`
- `Documentation`

These should be either:

1. migrated into active folders, or
2. moved to an explicit `legacy/` folder, or
3. removed if no longer needed.

Do not keep duplicate app implementations indefinitely.

## Cleanup policy

- Keep runtime directories out of git.
- Prefer one canonical document per topic.
- Avoid committing generated media.
- Any large binary assets should be intentional and live under a single documented folder.
