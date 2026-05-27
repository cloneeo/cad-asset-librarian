# ArchiVault Web Suite

Minimal full-stack framework for architecture students working with CAD assets, sheet-scale validation, presentation-board layout, and AutoCAD workflow automation.

## Stack

- Frontend: Vite, React, TypeScript, Tailwind CSS, lucide-react
- Backend: FastAPI, SQLite, SQLAlchemy
- Image engine: Pillow and ImageHash pHash matching

## Backend Routes

- `POST /search` uploads a screenshot, computes a 64-bit perceptual hash, and returns closest local `.dwg` or `.obj` matches from SQLite.
- `POST /compute-scale` validates real-world dimensions against A0-A3 printable sheet boundaries and recommends safer scales when needed.
- `POST /compute-layout` returns golden-ratio and rule-of-thirds presentation-board zones.
- `POST /generate-workflow-script` streams `Optimize_Project.scr` with audit, deep purge, layer realignment, custom commands, and quick save.
- `POST /api/v1/autocad/generate-script` streams a checklist-driven `Custom_ArchiVault_Clean.scr` file attachment.
- `POST /api/v1/autocad/save-script` compiles the checklist-driven script directly to the Desktop to avoid browser `.scr` download warnings.
- `POST /api/v1/scale/layout-budget` validates multiple scaled drawing views against common ISO, ANSI, Arch, and office paper sizes, returning coordinate boxes and an AutoCAD paper-space boundary script.
- `POST /api/v1/assets/analyze-weight` inspects uploaded CAD asset profiles and returns Low-Poly, Medium-Poly, or High-Poly Bloat health with optimization flags.

## Run Locally

> [!IMPORTANT]
> ### One-Click Local Launch After Restart
> Open this README in **VS Code Markdown Preview**, then click the launcher below. It starts the full local stack in two separated terminals.
>
> [Launch Full ArchiVault Workspace - Frontend + Backend](./run_archivault.bat)
>
> The launcher starts:
> - FastAPI at `http://localhost:8080` with `.venv` activated
> - Vite at `http://localhost:3000` by calling `node node_modules\vite\bin\vite.js` directly
>
> After both terminals finish starting, open the local website:
>
> [Open ArchiVault Local App](http://localhost:3000)
>
> If this is the first run after downloading/restarting and `node_modules` is missing, the launcher will run `npm install` first. When that install window finishes, close it and click the launcher again.

First-time dependency setup:

```bash
$env:ComSpec='C:\Windows\System32\cmd.exe'
$env:npm_config_script_shell='C:\Windows\System32\cmd.exe'
& "C:\Program Files\nodejs\node.exe" "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" install
pip install -r python_backend/requirements.txt
```

Manual fallback:

```powershell
.\run_archivault.bat
```

Windows PowerShell note: if `npm install` says scripts are disabled or opens a Jupyter error, use the full Node command above. It forces npm scripts to run through Windows `cmd.exe`, bypassing the blocked `npm.ps1` wrapper and the broken Jupyter shell setting.

After restarting your laptop, repeat the same flow: open this README preview, click the launcher, then open `http://localhost:3000`.

The frontend expects the API at `http://localhost:8080`. Override it with `VITE_API_BASE_URL` if needed.
