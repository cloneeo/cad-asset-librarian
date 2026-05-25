import os
import shutil
import threading
from pathlib import Path
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import PlainTextResponse, Response
from pydantic import BaseModel, Field
import io
from PIL import Image
import imagehash
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware

# Import database session and schema models
from .database import SessionLocal, engine, Base, Asset, Category, seed_db_defaults

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="ArchiVault Web Suite API",
    description="FastAPI services for visual CAD asset matching, scale validation, board layout computation, and AutoCAD workflow scripts.",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SHEET_SIZES_MM = {
    "A0": (841, 1189),
    "A1": (594, 841),
    "A2": (420, 594),
    "A3": (297, 420),
    "A4": (210, 297),
    "A5": (148, 210),
    "B0": (1000, 1414),
    "B1": (707, 1000),
    "B2": (500, 707),
    "B3": (353, 500),
    "B4": (250, 353),
    "C0": (917, 1297),
    "C1": (648, 917),
    "C2": (458, 648),
    "C3": (324, 458),
    "C4": (229, 324),
    "LETTER": (216, 279),
    "LEGAL": (216, 356),
    "TABLOID": (279, 432),
    "LEDGER": (432, 279),
    "ANSI_A": (216, 279),
    "ANSI_B": (279, 432),
    "ANSI_C": (432, 559),
    "ANSI_D": (559, 864),
    "ANSI_E": (864, 1118),
    "ARCH_A": (229, 305),
    "ARCH_B": (305, 457),
    "ARCH_C": (457, 610),
    "ARCH_D": (610, 914),
    "ARCH_E": (914, 1219),
    "ARCH_E1": (762, 1067),
}

STANDARD_SCALES = [20, 25, 50, 75, 100, 125, 150, 200, 250, 500]

LAYER_REALIGNMENT_MAP = {
    "WALL": "A-WALL",
    "WALLS": "A-WALL",
    "PARTITION": "A-WALL",
    "DOOR": "A-DOOR",
    "DOORS": "A-DOOR",
    "WINDOW": "A-GLAZ",
    "WINDOWS": "A-GLAZ",
    "GLASS": "A-GLAZ",
    "FURNITURE": "A-FURN",
    "FURN": "A-FURN",
    "CHAIR": "A-FURN",
    "SOFA": "A-FURN",
    "TEXT": "A-ANNO",
    "ANNO": "A-ANNO",
    "DIM": "A-ANNO-DIMS",
    "DIMS": "A-ANNO-DIMS",
    "LIGHT": "A-LITE",
    "LIGHTING": "A-LITE",
    "PLANT": "A-PLNT",
    "TREE": "A-PLNT",
}


@app.on_event("startup")
def startup_seed_database():
    db = SessionLocal()
    try:
        seed_db_defaults(db)
    finally:
        db.close()


def build_cloud_link(file_link: str) -> str:
    if file_link.startswith(("http://", "https://")):
        return file_link

    cloud_base_url = os.getenv("ASSET_CLOUD_BASE_URL", "").rstrip("/")
    if cloud_base_url:
        return f"{cloud_base_url}/{Path(file_link).name}"

    return file_link


def build_render_script(custom_commands: List[str], freeze_layers: Optional[List[str]] = None) -> str:
    script_content = [
        "; ================================================",
        "; CAD-Asset Librarian - Render Optimization Script",
        "; Generated automatically for heavy asset cleanup",
        "; ================================================",
        "",
        "; [Optimization] Audit drawing registry and repair errors",
        "_-AUDIT",
        "_Y",
        "",
        "; [Optimization] Deep purge block, layer, regapp, and orphaned data",
        "_-PURGE",
        "_A",
        "_*",
        "_N",
        "",
    ]

    if freeze_layers:
        for layer_name in freeze_layers:
            cleaned_layer = layer_name.strip()
            if cleaned_layer:
                script_content.extend([
                    f"; [Optimization] Freeze heavy layer: {cleaned_layer}",
                    "_-LAYER",
                    "_F",
                    cleaned_layer,
                    "",
                ])

    if custom_commands:
        script_content.append("; [User Commands] Custom dashboard automation shortcuts")
        for command in custom_commands:
            cleaned_command = command.strip()
            if cleaned_command:
                script_content.append(cleaned_command)
        script_content.append("")

    script_content.append("; [Optimization] Save optimized drawing state")
    script_content.append("_QSAVE")

    return "\n".join(script_content)


def normalize_layer_name(layer_name: str) -> str:
    cleaned = "".join(ch for ch in layer_name.upper().strip() if ch.isalnum() or ch in "-_ ")
    tokens = cleaned.replace("-", " ").replace("_", " ").split()
    for token in tokens:
        if token in LAYER_REALIGNMENT_MAP:
            return LAYER_REALIGNMENT_MAP[token]
    return cleaned.replace(" ", "-") or "A-GENM"


def build_workflow_script(custom_commands: List[str], student_layers: List[str], include_qsave: bool) -> str:
    lines = [
        "; ================================================",
        "; ArchiVault Web Suite - Optimize_Project.scr",
        "; Purge, audit, normalize layers, and prepare render-safe DWG files",
        "; ================================================",
        "",
        "; [1] Geometry validation and automatic repair",
        "_AUDIT",
        "_Y",
        "",
        "; [2] High-efficiency deep purge",
        "_-PURGE",
        "_A",
        "_*",
        "_N",
        "",
        "; [3] Standard architectural layer creation",
    ]

    standard_layers = sorted(set(LAYER_REALIGNMENT_MAP.values()))
    layer_colors = {
        "A-WALL": "2",
        "A-DOOR": "4",
        "A-GLAZ": "5",
        "A-FURN": "1",
        "A-ANNO": "3",
        "A-ANNO-DIMS": "6",
        "A-LITE": "30",
        "A-PLNT": "94",
    }
    for layer in standard_layers:
        lines.extend(["_-LAYER", "_M", layer, "_C", layer_colors.get(layer, "7"), layer, ""])

    if student_layers:
        lines.append("; [4] Student layer realignment")
        for original in student_layers:
            cleaned = original.strip()
            if cleaned:
                lines.extend([
                    f"; Map {cleaned} -> {normalize_layer_name(cleaned)}",
                    "_-LAYER",
                    "_R",
                    cleaned,
                    normalize_layer_name(cleaned),
                    "",
                ])

    if custom_commands:
        lines.append("; [5] Custom command injection")
        for command in custom_commands:
            cleaned = command.strip()
            if cleaned:
                lines.append(cleaned)
        lines.append("")

    if include_qsave:
        lines.extend(["; [6] Save optimized project state", "_QSAVE"])

    return "\n".join(lines)


def get_file_metadata(file_path: Path) -> dict:
    file_stat = file_path.stat()
    return {
        "file_name": file_path.name,
        "file_path": str(file_path),
        "file_size_bytes": file_stat.st_size,
        "file_size_mb": round(file_stat.st_size / (1024 * 1024), 2),
        "creation_date": datetime.fromtimestamp(file_stat.st_ctime).isoformat(),
    }


def get_desktop_path() -> Path:
    if os.name == "nt":
        try:
            import ctypes
            from ctypes import wintypes

            desktop_guid = ctypes.c_char_p(b"{B4BFCC3A-DB2C-424C-B029-7FE99A87C641}")
            path_pointer = wintypes.LPWSTR()
            shell32 = ctypes.windll.shell32
            ole32 = ctypes.windll.ole32
            if shell32.SHGetKnownFolderPath(desktop_guid, 0, None, ctypes.byref(path_pointer)) == 0:
                desktop_path = Path(path_pointer.value)
                ole32.CoTaskMemFree(path_pointer)
                if desktop_path.exists():
                    return desktop_path
        except Exception:
            pass

        for env_name in ("OneDrive", "OneDriveConsumer", "USERPROFILE"):
            env_value = os.getenv(env_name)
            if env_value:
                candidate = Path(env_value) / "Desktop"
                if candidate.exists():
                    return candidate

    desktop_path = Path.home() / "Desktop"
    desktop_path.mkdir(parents=True, exist_ok=True)
    return desktop_path


def validate_dwg_path(file_path: str) -> Path:
    resolved_path = Path(file_path).expanduser().resolve()
    if not resolved_path.exists() or not resolved_path.is_file():
        raise HTTPException(status_code=404, detail="Selected DWG file was not found.")
    if resolved_path.suffix.lower() != ".dwg":
        raise HTTPException(status_code=400, detail="Only .dwg files can be optimized.")
    return resolved_path


def open_dwg_file_dialog() -> Optional[str]:
    selected_path = {"value": None}
    dialog_error = {"value": None}

    def run_dialog():
        try:
            import tkinter as tk
            from tkinter import filedialog

            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            selected_path["value"] = filedialog.askopenfilename(
                title="Select a DWG file",
                filetypes=[("AutoCAD drawing", "*.dwg"), ("All files", "*.*")],
            )
            root.destroy()
        except Exception as exc:
            dialog_error["value"] = str(exc)

    dialog_thread = threading.Thread(target=run_dialog)
    dialog_thread.start()
    dialog_thread.join()

    if dialog_error["value"]:
        raise HTTPException(
            status_code=503,
            detail=f"Local file dialog is unavailable on this machine: {dialog_error['value']}",
        )
    return selected_path["value"]


def build_render_optimization_script(dwg_path: Path) -> str:
    escaped_path = str(dwg_path).replace("\\", "/")
    return "\n".join([
        "; ================================================",
        "; ArchiVault - Optimize_Render_Project.scr",
        "; One-click render lag prevention for AutoCAD DWG files",
        "; ================================================",
        "",
        "; [0] Open selected drawing",
        "_.OPEN",
        f'"{escaped_path}"',
        "",
        "; [1] Reduce dialog interruptions and command echo noise",
        "_FILEDIA",
        "0",
        "_CMDECHO",
        "0",
        "",
        "; [2] Database recovery to prevent sudden render engine crashes",
        "_AUDIT",
        "_Y",
        "",
        "; [3] Deep polygon, layer, block, regapp, and orphan cleanup",
        "_-PURGE",
        "_A",
        "_*",
        "_N",
        "",
        "; [4] Flatten 3D tracking lines and normalize accidental Z-depth",
        "_UCS",
        "_World",
        "_PLAN",
        "_World",
        "_OSNAPZ",
        "1",
        "_ELEVATION",
        "0",
        "_THICKNESS",
        "0",
        "_SELECT",
        "_ALL",
        "",
        "_FLATTEN",
        "_P",
        "",
        "_N",
        "",
        "; [5] Remove duplicate vectors and regenerate render display cache",
        "_OVERKILL",
        "_ALL",
        "",
        "",
        "_REGENALL",
        "",
        "; [6] Save optimized drawing state",
        "_QSAVE",
        "",
        "; [7] Restore dialogs",
        "_FILEDIA",
        "1",
        "_CMDECHO",
        "1",
        "",
    ])


def choose_printable_orientation(sheet_width: float, sheet_height: float, drawing_width: float, drawing_height: float):
    portrait = {
        "orientation": "portrait",
        "width": sheet_width,
        "height": sheet_height,
        "margin_x": sheet_width - drawing_width,
        "margin_y": sheet_height - drawing_height,
    }
    landscape = {
        "orientation": "landscape",
        "width": sheet_height,
        "height": sheet_width,
        "margin_x": sheet_height - drawing_width,
        "margin_y": sheet_width - drawing_height,
    }
    candidates = [portrait, landscape]
    fitting = [candidate for candidate in candidates if candidate["margin_x"] >= 0 and candidate["margin_y"] >= 0]
    if fitting:
        return max(fitting, key=lambda item: min(item["margin_x"], item["margin_y"]))
    return max(candidates, key=lambda item: min(item["margin_x"], item["margin_y"]))

# Dependency to get db session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "ArchiVault Web Suite API",
        "features": ["Visual Search", "Scale Calculator", "Layout Guide", "Workflow Script Generator"]
    }


class RenderScriptRequest(BaseModel):
    custom_commands: List[str] = []
    freeze_layers: List[str] = []


class ScaleRequest(BaseModel):
    real_world_width_meters: float = Field(gt=0)
    real_world_length_meters: float = Field(gt=0)
    target_sheet_size: str
    scale_factor: int = Field(gt=0)


class LayoutRequest(BaseModel):
    width_mm: float = Field(gt=0)
    height_mm: float = Field(gt=0)


class WorkflowScriptRequest(BaseModel):
    custom_commands: List[str] = []
    student_layers: List[str] = []
    include_qsave: bool = True


class OptimizeRequest(BaseModel):
    dwg_path: str


class AutoCADScriptRequest(BaseModel):
    deep_purge: bool = True
    audit_fix: bool = True
    overkill: bool = True
    close_tiny_gaps: bool = False
    flatten_2d_linework: bool = False
    consolidate_geometry: bool = False
    bind_xrefs: bool = False
    auto_save_close: bool = True
    custom_commands: List[str] = []


class LayoutBudgetDrawing(BaseModel):
    label: str = "Drawing View"
    real_width_meters: float = Field(gt=0)
    real_length_meters: float = Field(gt=0)
    scale_factor: int = Field(gt=0)


class LayoutBudgetRequest(BaseModel):
    target_sheet_size: str
    drawings: List[LayoutBudgetDrawing] = Field(min_length=1)
    margin_padding_mm: float = Field(default=20, ge=0)
    gap_mm: float = Field(default=12, ge=0)


def build_legacy_script(custom_commands: List[str], purge_all: bool, audit_fixes: bool, quick_save: bool) -> str:
    script_content = []
    script_content.append("; ================================================")
    script_content.append("; CAD-Asset Librarian - Optimized AutoCAD Script")
    script_content.append("; Generated automatically for CAD pipeline speed")
    script_content.append("; ================================================\n")

    if audit_fixes:
        script_content.append("; [Optimization] Audit drawing registry and repair errors")
        script_content.append("_-AUDIT\n_Y\n")

    script_content.append("; [User Commands] Custom operational routines")
    for cmd in custom_commands:
        cleaned_cmd = cmd.strip()
        if cleaned_cmd:
            script_content.append(cleaned_cmd)
    script_content.append("")

    if purge_all:
        script_content.append("; [Optimization] Deep purge block, layer, regapp, and orphaned data")
        script_content.append("_-PURGE\n_A\n*\n_N\n")

    if quick_save:
        script_content.append("; [Optimization] Save modern file revisions safely")
        script_content.append("_QSAVE\n")

    return "\n".join(script_content)


def build_custom_autocad_script(request: AutoCADScriptRequest) -> str:
    lines = [
        "; ================================================",
        "; ArchiVault Web Suite - Custom AutoCAD Cleanup",
        "; Generated from the interactive optimization checklist",
        "; ================================================",
        "",
    ]

    if request.audit_fix:
        lines.extend([
            "; [1] Audit and Fix Errors",
            "_AUDIT",
            "_Y",
            "",
        ])

    if request.deep_purge:
        lines.extend([
            "; [2] Deep Purge Junk Items",
            "_-PURGE",
            "_A",
            "_*",
            "_N",
            "",
        ])

    if request.flatten_2d_linework:
        lines.extend([
            "; [4] Geometry Flattening Process",
            "_FLATTEN",
            "_ALL",
            "",
            "_N",
            "",
        ])

    if request.overkill or request.consolidate_geometry:
        lines.extend([
            "; [5] Consolidate Geometry / Overkill",
            "_OVERKILL",
            "_ALL",
            "",
            "",
        ])

    if request.bind_xrefs:
        lines.extend([
            "; [6] External Reference Binding",
            "_-XREF",
            "_BIND",
            "*",
            "",
        ])

    if request.close_tiny_gaps:
        lines.extend([
            "; [7] Close Tiny Geometric Gaps",
            "_PEDIT",
            "_M",
            "_ALL",
            "",
            "_Y",
            "_J",
            "0.01",
            "",
        ])

    cleaned_custom_commands = []
    for command in request.custom_commands:
        for line in command.splitlines():
            cleaned_line = line.strip()
            if cleaned_line:
                cleaned_custom_commands.append(cleaned_line)
    if cleaned_custom_commands:
        lines.extend([
            "; Custom injection",
            *cleaned_custom_commands,
            "",
        ])

    if request.auto_save_close:
        lines.extend([
            "; Save and close workspace",
            "_QSAVE",
            "_CLOSE",
            "",
        ])

    if lines[-1] != "":
        lines.append("")

    return "\n".join(lines) + "\n"


def build_layout_budget(request: LayoutBudgetRequest) -> dict:
    sheet_key = request.target_sheet_size.upper().replace(" ", "_").replace("-", "_")
    if sheet_key not in SHEET_SIZES_MM:
        raise HTTPException(status_code=400, detail=f"Unsupported sheet size. Choose one of {', '.join(sorted(SHEET_SIZES_MM))}.")

    sheet_width, sheet_height = SHEET_SIZES_MM[sheet_key]
    printable_width = sheet_width - (request.margin_padding_mm * 2)
    printable_height = sheet_height - (request.margin_padding_mm * 2)
    if printable_width <= 0 or printable_height <= 0:
        raise HTTPException(status_code=400, detail="Margin padding is larger than the selected sheet.")

    placed_drawings = []
    cursor_x = request.margin_padding_mm
    cursor_y = request.margin_padding_mm
    row_height = 0.0
    max_used_width = request.margin_padding_mm
    overflow_reasons = []

    for index, drawing in enumerate(request.drawings, start=1):
        width_mm = round((drawing.real_width_meters * 1000) / drawing.scale_factor, 2)
        height_mm = round((drawing.real_length_meters * 1000) / drawing.scale_factor, 2)

        if width_mm > printable_width or height_mm > printable_height:
            overflow_reasons.append(f"{drawing.label} exceeds printable boundaries by itself.")

        next_x = cursor_x + width_mm
        if next_x > sheet_width - request.margin_padding_mm and cursor_x > request.margin_padding_mm:
            cursor_x = request.margin_padding_mm
            cursor_y += row_height + request.gap_mm
            row_height = 0.0

        placed = {
            "id": index,
            "label": drawing.label,
            "scale": f"1:{drawing.scale_factor}",
            "real_width_meters": drawing.real_width_meters,
            "real_length_meters": drawing.real_length_meters,
            "width_mm": width_mm,
            "height_mm": height_mm,
            "x": round(cursor_x, 2),
            "y": round(cursor_y, 2),
        }
        placed_drawings.append(placed)
        cursor_x += width_mm + request.gap_mm
        row_height = max(row_height, height_mm)
        max_used_width = max(max_used_width, cursor_x - request.gap_mm)

    used_height = cursor_y + row_height
    fits = not overflow_reasons and max_used_width <= sheet_width - request.margin_padding_mm and used_height <= sheet_height - request.margin_padding_mm
    if not fits and not overflow_reasons:
        overflow_reasons.append("Combined drawing layout exceeds printable sheet boundaries.")

    title_block_height = min(55, max(28, sheet_height * 0.08))
    script_lines = []
    if fits:
        script_lines = [
            "; ================================================",
            "; ArchiVault Layout Budget - Paper Space Boundaries",
            "; Generated from /api/v1/scale/layout-budget",
            "; ================================================",
            "",
            "_RECTANGLE",
            "0,0",
            f"{sheet_width},{sheet_height}",
            "_OFFSET",
            f"{request.margin_padding_mm}",
            "_LAST",
            "",
            f"{request.margin_padding_mm},{request.margin_padding_mm}",
            "",
            "_RECTANGLE",
            f"{request.margin_padding_mm},{request.margin_padding_mm}",
            f"{sheet_width - request.margin_padding_mm},{request.margin_padding_mm + title_block_height}",
            "",
        ]
        for drawing in placed_drawings:
            script_lines.extend([
                f"; View boundary: {drawing['label']}",
                "_RECTANGLE",
                f"{drawing['x']},{drawing['y']}",
                f"{round(drawing['x'] + drawing['width_mm'], 2)},{round(drawing['y'] + drawing['height_mm'], 2)}",
                "",
            ])
        script_lines.append("")

    return {
        "fits": fits,
        "sheet": {
            "name": sheet_key,
            "width_mm": sheet_width,
            "height_mm": sheet_height,
            "printable_width_mm": round(printable_width, 2),
            "printable_height_mm": round(printable_height, 2),
            "margin_padding_mm": request.margin_padding_mm,
        },
        "used_layout_mm": {
            "width": round(max_used_width - request.margin_padding_mm, 2),
            "height": round(used_height - request.margin_padding_mm, 2),
        },
        "remaining_margin_safety_mm": {
            "right": round((sheet_width - request.margin_padding_mm) - max_used_width, 2),
            "bottom": round((sheet_height - request.margin_padding_mm) - used_height, 2),
        },
        "drawings": placed_drawings,
        "overflow_reasons": overflow_reasons,
        "autocad_script": "\n".join(script_lines),
    }


def analyze_asset_bytes(filename: str, data: bytes) -> dict:
    size_mb = len(data) / (1024 * 1024)
    extension = Path(filename).suffix.lower()
    line_count = data.count(b"\n")
    density_score = size_mb

    if extension == ".obj":
        vertex_count = data.count(b"\nv ") + (1 if data.startswith(b"v ") else 0)
        face_count = data.count(b"\nf ") + (1 if data.startswith(b"f ") else 0)
        density_score = size_mb + (vertex_count / 20000) + (face_count / 15000)
    elif extension == ".dwg":
        density_score = size_mb * 1.35 + min(line_count / 20000, 4)
    else:
        density_score = size_mb + min(line_count / 30000, 2)

    if density_score < 6:
        health = "Low-Poly"
        color = "Green"
        required_flags = {"deep_purge": False, "overkill": False}
    elif density_score < 14:
        health = "Medium-Poly"
        color = "Yellow"
        required_flags = {"deep_purge": True, "overkill": False}
    else:
        health = "High-Poly Bloat"
        color = "Red"
        required_flags = {"deep_purge": True, "overkill": True}

    return {
        "file_name": filename,
        "file_size_bytes": len(data),
        "file_size_mb": round(size_mb, 2),
        "extension": extension or "unknown",
        "estimated_density_score": round(density_score, 2),
        "health_status": health,
        "health_color": color,
        "required_optimization_flags": required_flags,
    }


@app.post("/generate-render-script")
def generate_render_script(request: RenderScriptRequest):
    render_script = build_render_script(
        custom_commands=request.custom_commands,
        freeze_layers=request.freeze_layers,
    )

    headers = {
        "Content-Disposition": 'attachment; filename="Optimize_Render.scr"'
    }
    return Response(content=render_script, media_type="text/plain; charset=utf-8", headers=headers)


@app.post("/generate-workflow-script")
def generate_workflow_script(request: WorkflowScriptRequest):
    final_script = build_workflow_script(
        custom_commands=request.custom_commands,
        student_layers=request.student_layers,
        include_qsave=request.include_qsave,
    )
    headers = {
        "Content-Disposition": 'attachment; filename="Optimize_Project.scr"'
    }
    return Response(content=final_script, media_type="text/plain; charset=utf-8", headers=headers)


@app.post("/api/v1/autocad/generate-script")
def generate_custom_autocad_script(request: AutoCADScriptRequest):
    script_content = build_custom_autocad_script(request)
    headers = {
        "Content-Disposition": 'attachment; filename="Custom_ArchiVault_Clean.scr"'
    }
    return Response(content=script_content, media_type="text/plain; charset=utf-8", headers=headers)


@app.post("/api/v1/autocad/save-script")
def save_custom_autocad_script(request: AutoCADScriptRequest):
    desktop_path = get_desktop_path()
    script_path = desktop_path / "Custom_ArchiVault_Clean.scr"
    script_content = build_custom_autocad_script(request)
    script_path.write_text(script_content, encoding="utf-8", newline="\r\n")

    return {
        "status": "success",
        "script_path": str(script_path),
        "file_name": script_path.name,
        "file_type": "AutoCAD Script (.scr)",
        "message": "Script compiled directly to Desktop without using a browser download.",
    }


@app.post("/api/v1/scale/layout-budget")
def compute_layout_budget(request: LayoutBudgetRequest):
    return build_layout_budget(request)


@app.post("/api/v1/assets/analyze-weight")
async def analyze_asset_weight(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="Upload at least one CAD asset file.")

    profiles = []
    for file in files:
        data = await file.read()
        profiles.append(analyze_asset_bytes(file.filename or "unnamed_asset", data))

    worst_rank = {"Green": 0, "Yellow": 1, "Red": 2}
    worst_profile = max(profiles, key=lambda profile: worst_rank[profile["health_color"]])
    auto_flags = {
        "deep_purge": any(profile["required_optimization_flags"]["deep_purge"] for profile in profiles),
        "overkill": any(profile["required_optimization_flags"]["overkill"] for profile in profiles),
    }

    return {
        "status": "success",
        "overall_health_status": worst_profile["health_status"],
        "overall_health_color": worst_profile["health_color"],
        "auto_toggle_flags": auto_flags,
        "profiles": profiles,
    }


@app.post("/api/select-dwg")
def select_dwg():
    selected_file = open_dwg_file_dialog()
    if not selected_file:
        raise HTTPException(status_code=400, detail="No DWG file was selected.")

    dwg_path = validate_dwg_path(selected_file)
    return {
        "status": "selected",
        "metadata": get_file_metadata(dwg_path),
    }


@app.post("/api/upload-dwg")
async def upload_dwg(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".dwg"):
        raise HTTPException(status_code=400, detail="Upload a valid .dwg file.")

    upload_dir = Path.home() / "ArchiVaultUploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    destination = upload_dir / Path(file.filename).name

    with destination.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {
        "status": "uploaded",
        "metadata": get_file_metadata(destination),
    }


@app.post("/api/optimize")
def optimize_rendering(request: OptimizeRequest):
    dwg_path = validate_dwg_path(request.dwg_path)
    desktop_path = get_desktop_path()
    script_path = desktop_path / "Optimize_Render_Project.scr"
    script_content = build_render_optimization_script(dwg_path)
    script_path.write_text(script_content, encoding="utf-8", newline="\r\n")

    return {
        "status": "success",
        "script_path": str(script_path),
        "dwg": get_file_metadata(dwg_path),
        "summary": [
            "Generated Optimize_Render_Project.scr on the user's Desktop.",
            "Injected AUDIT with automatic repair to reduce render crash risk.",
            "Injected deep PURGE for polygon, layer, block, regapp, and orphan cleanup.",
            "Added UCS, OSNAPZ, ELEVATION, THICKNESS, FLATTEN, OVERKILL, and REGENALL steps to reduce 3D tracking-line lag.",
            "Finished with QSAVE so AutoCAD can commit the optimized drawing state.",
        ],
    }


@app.post("/compute-scale")
def compute_scale(request: ScaleRequest):
    sheet_key = request.target_sheet_size.upper()
    if sheet_key not in SHEET_SIZES_MM:
        raise HTTPException(status_code=400, detail=f"Unsupported sheet size. Choose one of {', '.join(SHEET_SIZES_MM)}.")

    drawing_width_mm = (request.real_world_width_meters * 1000) / request.scale_factor
    drawing_length_mm = (request.real_world_length_meters * 1000) / request.scale_factor
    sheet_width, sheet_height = SHEET_SIZES_MM[sheet_key]
    printable_width = sheet_width - 20
    printable_height = sheet_height - 20
    fit = choose_printable_orientation(printable_width, printable_height, drawing_width_mm, drawing_length_mm)
    is_valid = fit["margin_x"] >= 0 and fit["margin_y"] >= 0

    recommendations = []
    if not is_valid:
        for scale in STANDARD_SCALES:
            alt_width = (request.real_world_width_meters * 1000) / scale
            alt_length = (request.real_world_length_meters * 1000) / scale
            alt_fit = choose_printable_orientation(printable_width, printable_height, alt_width, alt_length)
            if alt_fit["margin_x"] >= 0 and alt_fit["margin_y"] >= 0:
                recommendations.append({
                    "scale": f"1:{scale}",
                    "orientation": alt_fit["orientation"],
                    "drawing_width_mm": round(alt_width, 2),
                    "drawing_length_mm": round(alt_length, 2),
                    "minimum_margin_mm": round(min(alt_fit["margin_x"], alt_fit["margin_y"]) / 2, 2),
                })
            if len(recommendations) == 3:
                break

    return {
        "valid": is_valid,
        "sheet_size": sheet_key,
        "scale": f"1:{request.scale_factor}",
        "orientation": fit["orientation"],
        "drawing_dimensions_mm": {
            "width": round(drawing_width_mm, 2),
            "length": round(drawing_length_mm, 2),
        },
        "printable_boundary_mm": {
            "width": printable_width if fit["orientation"] == "portrait" else printable_height,
            "height": printable_height if fit["orientation"] == "portrait" else printable_width,
        },
        "remaining_margin_safety_mm": {
            "horizontal_total": round(fit["margin_x"], 2),
            "vertical_total": round(fit["margin_y"], 2),
            "minimum_edge_margin": round(min(fit["margin_x"], fit["margin_y"]) / 2, 2),
        },
        "recommendations": recommendations,
    }


@app.post("/compute-layout")
def compute_layout(request: LayoutRequest):
    width = request.width_mm
    height = request.height_mm
    margin = round(min(width, height) * 0.055, 2)
    gutter = round(min(width, height) * 0.018, 2)
    content_x = margin
    content_y = margin
    content_w = width - (margin * 2)
    content_h = height - (margin * 2)
    title_h = round(content_h * 0.105, 2)
    lower_y = round(content_y + title_h + gutter, 2)
    lower_h = round(content_h - title_h - gutter, 2)
    left_w = round(content_w / 1.618, 2)
    right_w = round(content_w - left_w - gutter, 2)
    right_x = round(content_x + left_w + gutter, 2)
    third_h = round(lower_h / 3, 2)

    zones = [
        {
            "name": "Title Blocks",
            "x": content_x,
            "y": content_y,
            "width": content_w,
            "height": title_h,
        },
        {
            "name": "Primary Elevations",
            "x": content_x,
            "y": lower_y,
            "width": left_w,
            "height": round(third_h * 2 - gutter / 2, 2),
        },
        {
            "name": "Floor Plans",
            "x": content_x,
            "y": round(lower_y + (third_h * 2) + gutter / 2, 2),
            "width": left_w,
            "height": round(third_h - gutter / 2, 2),
        },
        {
            "name": "Render Zones",
            "x": right_x,
            "y": lower_y,
            "width": right_w,
            "height": lower_h,
        },
    ]

    return {
        "board": {"width_mm": width, "height_mm": height},
        "system": {
            "golden_ratio": 1.618,
            "rule_of_thirds_x": [round(width / 3, 2), round((width / 3) * 2, 2)],
            "rule_of_thirds_y": [round(height / 3, 2), round((height / 3) * 2, 2)],
            "margin_mm": margin,
            "gutter_mm": gutter,
        },
        "zones": zones,
    }


@app.post("/generate-script", response_class=PlainTextResponse)
def generate_script(
    commands: List[str] = Form(...),
    purge_all: bool = Form(True),
    audit_fixes: bool = Form(True),
    quick_save: bool = Form(True)
):
    """
    Generates a downloadable AutoCAD plain text .scr script file.
    Combines custom user CAD command routines with critical file optimizations:
    - -PURGE (clean unreferenced blocks, materials, layouts, layers)
    - AUDIT (repair internal inconsistencies and corrupt definitions)
    - QSAVE (commit and save safely)
    """
    final_script = build_legacy_script(commands, purge_all, audit_fixes, quick_save)
    
    # Return as direct downloadable stream
    headers = {
        "Content-Disposition": "attachment; filename=arch_layout_routine.scr"
    }
    return Response(content=final_script, media_type="text/plain; charset=utf-8", headers=headers)


@app.post("/search")
async def search_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Uploads a screenshot, computes its Perceptual Hash (pHash),
    and queries the SQlite database to return the closest 3 CAD asset blocks.
    Uses ImageHash library for state-of-the-art robust, noise-tolerant visual comparison.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be a valid image sequence.")

    try:
        # Load image into PIL for calculation
        image_bytes = await file.read()
        image = Image.open(io.BytesIO(image_bytes))
        
        # Calculate Perceptual Hash (pHash)
        # pHash transforms the image to the frequency domain (DCT), making it highly robust
        # to rotations, contrast scaling, screenshot watermarks, or color modifications.
        calculated_hash = imagehash.phash(image, hash_size=8)
        calculated_hash_str = str(calculated_hash)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process image: {str(e)}")

    # Fetch all stored CAD blocks
    assets = db.query(Asset).all()
    
    results = []
    # Compare with pre-calculated hashes in database using Hamming Distance
    for asset in assets:
        try:
            asset_link = build_cloud_link(asset.file_link)
            if not asset_link.lower().endswith((".dwg", ".obj")):
                continue

            stored_hash = imagehash.hex_to_hash(asset.phash)
            # Hamming distance represents the number of differing bits between the 264-bit matrices
            hamming_dist = calculated_hash - stored_hash
            
            # Convert hamming distance to absolute similarity percentage
            # imagehash.phash is 64-bit (8x8 matrix), so max distance is 64.
            similarity = round((1.0 - (hamming_dist / 64.0)) * 100, 2)
            
            results.append({
                "id": asset.id,
                "name": asset.name,
                "category": asset.category.name if asset.category else "Uncategorized",
                "file_link": asset.file_link,
                "cloud_link": asset_link,
                "description": asset.description,
                "phash": asset.phash,
                "distance": hamming_dist,
                "similarity_score": similarity
            })
        except Exception as hash_err:
            # Fall back to safe matching if hash formatting corrupted
            continue

    # Sort items based on closest matches (ascending Hamming distance / descending similarity)
    results.sort(key=lambda x: x["distance"])

    # Returns the calculated hash and closest matches
    return {
        "uploaded_phash": calculated_hash_str,
        "matches": results[:5],
        "total_matches": len(results)
    }
