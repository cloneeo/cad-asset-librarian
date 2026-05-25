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
- `POST /api/v1/autocad/generate-script` generates a checklist-driven AutoCAD script and returns it as a ZIP archive (`ArchiVault_Automation.zip` containing `ArchiVault_Execute.scr`) to bypass browser security warnings for `.scr` files.
- `POST /api/v1/autocad/save-script` compiles the checklist-driven script directly to the Desktop to avoid browser `.scr` download warnings.
- `POST /api/v1/scale/layout-budget` validates multiple scaled drawing views against common ISO, ANSI, Arch, and office paper sizes, returning coordinate boxes and an AutoCAD paper-space boundary script.
- `POST /api/v1/assets/analyze-weight` inspects uploaded CAD asset profiles and returns Low-Poly, Medium-Poly, or High-Poly Bloat health with optimization flags.
- `POST /api/v1/drafting/generate-layout` streams `ArchiVault_Floor_Plan_Layout.scr` for parametric floor-plan grids, wall outlines, and A-COLM column placeholders.
- `POST /api/v1/environmental/export-vector-script` generates a trigonometric North Arrow and colored wind/sun vector diagram (Amihan in cyan, Habagat in green, Morning Sun in yellow) based on site orientation angle. Returns as a ZIP archive (`Site_Analysis_Vectors.zip`) containing the AutoCAD script for seamless browser download.

## Run Locally

> [!IMPORTANT]
> ### ArchiVault Workspace Launch
> Open this README in VS Code Markdown Preview, then use the launcher below to start the full local stack in two separated terminals.
>
> [🚀 Click here to Launch Full Workspace (Frontend + Backend)](./run_archivault.bat)
>
> The launcher starts:
> - FastAPI at `http://localhost:8080` with `.venv` activated
> - Vite at `http://localhost:3000` by calling `node node_modules\vite\bin\vite.js` directly

First-time dependency setup:

```bash
npm install
pip install -r python_backend/requirements.txt
```

Manual fallback:

```powershell
.\run_archivault.bat
```

The frontend expects the API at `http://localhost:8080`. Override it with `VITE_API_BASE_URL` if needed.
