# Handoff

## Goal
Desktop packaging audit is closed; preserve the verified savepoint and publish only on explicit request.

## Done
- Audited frontend, desktop shell, and DWG backend paths end-to-end.
- Added regression smoke coverage for geometry, print, import/save, and DWG online/offline flows.
- Added desktop smoke coverage with temporary mock backend config and documented the workflow.
- Simplified `build_exe.ps1`: routine builds now reuse installed Python packages and the committed icon instead of always running `pip install` and regenerating `assets/drawing_app.ico`.
- Committed the audit/package contour as `eeaf9f8` (`Add regression smokes and harden desktop packaging`).
- Committed repo hygiene cleanup as `c97e3eb` (`Ignore local Claude artifacts and keep agent rules`).
- Restored a clean working tree.
- Verified that the lingering listener on `127.0.0.1:8000` belongs to `C:\my-erp-system\data-ai-service` and left it untouched because it is unrelated to this repo.

## Next Steps
- Push or open a PR only if publication is explicitly requested; current state is a local savepoint on `main`.
- If icon artwork changes are needed later, run `powershell -ExecutionPolicy Bypass -File C:\drawing\build_exe.ps1 -RegenerateIcon` intentionally and review the binary diff before commit.
- Keep using `pwsh -ExecutionPolicy Bypass -File C:\drawing\scripts\desktop-smoke.ps1` after desktop-related edits.

## Key Files
- `C:\drawing\build_exe.ps1`
- `C:\drawing\desktop_app.py`
- `C:\drawing\scripts\regression-smoke.js`
- `C:\drawing\scripts\desktop-smoke.ps1`
- `C:\drawing\README.md`
