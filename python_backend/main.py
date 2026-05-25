import os
import shutil
import threading
import zipfile
import math
from pathlib import Path
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import PlainTextResponse, Response, StreamingResponse
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
    purge_regapps: bool = True
    inject_pdf_plot_macro: bool = False
    normalize_layers: bool = False
    reset_annotation_scales: bool = False
    cleanup_proxy_objects: bool = False
    repair_draw_order: bool = False
    regen_viewports: bool = True
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


class DraftingLayoutRequest(BaseModel):
    total_width_meters: float = Field(gt=0)
    total_length_meters: float = Field(gt=0)
    wall_thickness_mm: float = Field(default=150, gt=0)
    column_width_mm: float = Field(default=300, gt=0)
    column_depth_mm: float = Field(default=300, gt=0)
    grid_spacings: List[float] = Field(min_length=1)


class PD1096ComplianceRequest(BaseModel):
    lot_area_sqm: float = Field(gt=0)
    lot_type: str = Field(pattern="^(inside|corner|through)$")
    zoning: str = Field(pattern="^(r1|r2|r3)$")


class TileEstimateRequest(BaseModel):
    room_width_meters: float = Field(gt=0)
    room_length_meters: float = Field(gt=0)
    tile_size_mm: float = Field(default=600, gt=0)
    wastage_percent: float = Field(default=10, ge=0, le=100)



def create_safety_backup(source_file_path: str, project_name: str = "Default") -> Optional[str]:
    """
    Create a timestamped safety backup of a CAD drawing file.
    
    Args:
        source_file_path: Full path to the source DWG/DWF file
        project_name: Project name for backup folder organization
        
    Returns:
        Path to the backup file if successful, None if file not found
    """
    try:
        source = Path(source_file_path)
        
        # Verify source file exists
        if not source.exists():
            return None
        
        # Create backup directory structure
        backup_dir = source.parent / f"{project_name}_Backups"
        backup_subdir = backup_dir / "01_CAD_Drafts" / "Backups"
        backup_subdir.mkdir(parents=True, exist_ok=True)
        
        # Create timestamped filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M")
        backup_filename = f"{source.stem}_SAFETY_BACKUP_{timestamp}{source.suffix}"
        backup_path = backup_subdir / backup_filename
        
        # Copy file with timestamp
        shutil.copy2(source, backup_path)
        
        return str(backup_path)
    except Exception as e:
        # Gracefully handle backup failures - don't interrupt main workflow
        return None


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

    # Check if any destructive operations are enabled
    destructive_operations = [
        request.audit_fix,
        request.deep_purge,
        request.overkill,
        request.flatten_2d_linework,
        request.bind_xrefs,
        request.purge_regapps,
        request.cleanup_proxy_objects,
        request.repair_draw_order,
    ]
    
    # Inject PRE-FLIGHT SAFETY SAVE before destructive operations
    if any(destructive_operations):
        lines.extend([
            "; ================================================",
            "; [Pre-Flight Safety Save]",
            "; Saving current drawing state before optimization",
            "; ================================================",
            "_QSAVE",
            "",
        ])

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

    if request.purge_regapps:
        lines.extend([
            "; [3] Purge Regapps - Deep Registry Clean",
            "_-PURGE",
            "_R",
            "*",
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

    if request.normalize_layers:
        lines.extend([
            "; [8] Layer State Normalization",
            "_-LAYER",
            "_ON",
            "_*",
            "_THAW",
            "_*",
            "_UNLOCK",
            "_*",
            "",
        ])

    if request.reset_annotation_scales:
        lines.extend([
            "; [9] Annotation Scale Cleanup",
            "_-SCALELISTEDIT",
            "_R",
            "_Y",
            "_E",
            "",
        ])

    if request.cleanup_proxy_objects:
        lines.extend([
            "; [10] Proxy Object Display Stabilization",
            "_PROXYSHOW",
            "1",
            "_PROXYGRAPHICS",
            "1",
            "",
        ])

    if request.repair_draw_order:
        lines.extend([
            "; [11] Draw Order Repair",
            "_DRAWORDER",
            "_ALL",
            "",
            "_F",
            "",
        ])

    if request.regen_viewports:
        lines.extend([
            "; [12] Viewport Regeneration",
            "_REGENALL",
            "",
        ])

    if request.inject_pdf_plot_macro:
        lines.extend([
            "; [13] Quick PDF Plot Macro",
            "_-PLOT",
            "_Y",
            "",
            "DWG To PDF.pc3",
            "ISO full bleed A1 (841.00 x 594.00 MM)",
            "_M",
            "_L",
            "_N",
            "_W",
            "0,0",
            "841,594",
            "_F",
            "_C",
            "_Y",
            "monochrome.ctb",
            "_Y",
            "_A",
            f"{str(get_desktop_path() / 'ArchiVault_Quick_Plot.pdf')}",
            "_N",
            "_Y",
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
    vertex_count = 0
    internal_layers = []

    if extension == ".obj":
        vertex_count = data.count(b"\nv ") + (1 if data.startswith(b"v ") else 0)
        face_count = data.count(b"\nf ") + (1 if data.startswith(b"f ") else 0)
        density_score = size_mb + (vertex_count / 20000) + (face_count / 15000)
        
        # Extract group/object names as "layers" from OBJ
        try:
            text_data = data.decode('utf-8', errors='ignore')
            for line in text_data.split('\n'):
                if line.startswith('g ') or line.startswith('o '):
                    layer_name = line[2:].strip()
                    if layer_name and layer_name not in internal_layers:
                        internal_layers.append(layer_name)
        except:
            pass
    elif extension == ".dwg":
        density_score = size_mb * 1.35 + min(line_count / 20000, 4)
        # Rough estimate: assume 1 entity per ~500 bytes for DWG
        vertex_count = int(len(data) / 500)
    else:
        density_score = size_mb + min(line_count / 30000, 2)
        try:
            text_data = data.decode('utf-8', errors='ignore')
            for line in text_data.split('\n'):
                if any(marker in line.lower() for marker in ['layer', 'group', 'component']):
                    if ':' in line:
                        layer_name = line.split(':')[1].strip()
                        if layer_name and len(layer_name) < 100 and layer_name not in internal_layers:
                            internal_layers.append(layer_name)
        except:
            pass

    if density_score < 6:
        health = "Low-Poly"
        color = "Green"
        status_rating = "Green"
        required_flags = {"deep_purge": False, "overkill": False}
    elif density_score < 14:
        health = "Medium-Poly"
        color = "Yellow"
        status_rating = "Yellow"
        required_flags = {"deep_purge": True, "overkill": False}
    else:
        health = "High-Poly Bloat"
        color = "Red"
        status_rating = "Red"
        required_flags = {"deep_purge": True, "overkill": True}

    return {
        "file_name": filename,
        "file_size_bytes": len(data),
        "file_size_mb": round(size_mb, 2),
        "extension": extension or "unknown",
        "estimated_density_score": round(density_score, 2),
        "vertex_count_estimate": vertex_count,
        "status_rating": status_rating,
        "internal_layers": internal_layers[:20],  # Limit to 20 layers for display
        "health_status": health,
        "health_color": color,
        "required_optimization_flags": required_flags,
    }


def build_floor_plan_layout_script(request: DraftingLayoutRequest) -> str:
    width_mm = round(request.total_width_meters * 1000, 2)
    length_mm = round(request.total_length_meters * 1000, 2)
    wall_offset = round(request.wall_thickness_mm, 2)
    column_half_w = round(request.column_width_mm / 2, 2)
    column_half_d = round(request.column_depth_mm / 2, 2)

    x_axes = [0.0]
    cursor = 0.0
    for spacing in request.grid_spacings:
        if spacing <= 0:
            raise HTTPException(status_code=400, detail="Grid spacings must be positive meter values.")
        cursor += spacing * 1000
        if cursor < width_mm:
            x_axes.append(round(cursor, 2))
    if x_axes[-1] != width_mm:
        x_axes.append(width_mm)

    y_axes = [0.0]
    cursor = 0.0
    for spacing in request.grid_spacings:
        cursor += spacing * 1000
        if cursor < length_mm:
            y_axes.append(round(cursor, 2))
    if y_axes[-1] != length_mm:
        y_axes.append(length_mm)

    lines = [
        "; ================================================",
        "; ArchiVault Floor Plan Lab - Parametric Layout",
        "; Generated from /api/v1/drafting/generate-layout",
        "; ================================================",
        "",
        "; [0] Drafting layer setup",
        "_-LAYER",
        "_M",
        "A-WALL",
        "_C",
        "7",
        "A-WALL",
        "",
        "_-LAYER",
        "_M",
        "A-GRID",
        "_C",
        "8",
        "A-GRID",
        "",
        "_-LAYER",
        "_M",
        "A-COLM",
        "_C",
        "2",
        "A-COLM",
        "",
        "; [1] Building footprint outline",
        "_-LAYER",
        "_S",
        "A-WALL",
        "",
        "_RECTANGLE",
        "0,0",
        f"{width_mm},{length_mm}",
        "_OFFSET",
        f"{wall_offset}",
        "_LAST",
        "",
        f"{wall_offset},{wall_offset}",
        "",
        "; [2] Vertical structural grid axes",
        "_-LAYER",
        "_S",
        "A-GRID",
        "",
    ]

    for x_axis in x_axes:
        lines.extend([
            "_XLINE",
            "_V",
            f"{x_axis},0",
            "",
        ])

    lines.append("; [3] Horizontal structural grid axes")
    for y_axis in y_axes:
        lines.extend([
            "_XLINE",
            "_H",
            f"0,{y_axis}",
            "",
        ])

    lines.extend([
        "; [4] Column placeholders on A-COLM",
        "_-LAYER",
        "_S",
        "A-COLM",
        "",
    ])

    for x_axis in x_axes:
        for y_axis in y_axes:
            x1 = round(x_axis - column_half_w, 2)
            y1 = round(y_axis - column_half_d, 2)
            x2 = round(x_axis + column_half_w, 2)
            y2 = round(y_axis + column_half_d, 2)
            lines.extend([
                "_RECTANG",
                f"{x1},{y1}",
                f"{x2},{y2}",
                "_HATCH",
                "_P",
                "SOLID",
                "_S",
                "_LAST",
                "",
                "",
            ])

    lines.extend([
        "; [5] Regenerate final layout",
        "_REGENALL",
        "",
    ])

    return "\n".join(lines) + "\n"


PD1096_RESIDENTIAL_RULES = {
    "r1": {
        "label": "R-1 Low Density Residential",
        "tosl_percent": {"inside": 50, "corner": 40, "through": 40},
        "setbacks_m": {"front": 4.5, "side": 2.0, "rear": 2.0},
    },
    "r2": {
        "label": "R-2 Medium Density Residential",
        "tosl_percent": {"inside": 40, "corner": 35, "through": 35},
        "setbacks_m": {"front": 3.0, "side": 2.0, "rear": 2.0},
    },
    "r3": {
        "label": "R-3 High Density Residential",
        "tosl_percent": {"inside": 30, "corner": 25, "through": 25},
        "setbacks_m": {"front": 3.0, "side": 2.0, "rear": 2.0},
    },
}


def compute_pd1096_compliance(request: PD1096ComplianceRequest) -> dict:
    zoning_key = request.zoning.lower()
    lot_type_key = request.lot_type.lower()
    rule = PD1096_RESIDENTIAL_RULES[zoning_key]
    tosl_percent = rule["tosl_percent"][lot_type_key]
    open_space_sqm = request.lot_area_sqm * (tosl_percent / 100)
    ambf_sqm = request.lot_area_sqm - open_space_sqm

    setbacks = dict(rule["setbacks_m"])
    if lot_type_key == "corner":
        setbacks["corner_side"] = setbacks["front"]
    if lot_type_key == "through":
        setbacks["secondary_front"] = setbacks["front"]

    return {
        "status": "success",
        "code_reference": "PD 1096 National Building Code of the Philippines - Rule VII/VIII planning aid",
        "input": {
            "lot_area_sqm": request.lot_area_sqm,
            "lot_type": lot_type_key,
            "zoning": zoning_key,
        },
        "zoning_label": rule["label"],
        "tosl": {
            "percentage": tosl_percent,
            "required_open_space_sqm": round(open_space_sqm, 2),
            "formula": f"{request.lot_area_sqm} sqm x {tosl_percent}%",
        },
        "ambf": {
            "allowable_maximum_building_footprint_sqm": round(ambf_sqm, 2),
            "formula": "Lot Area - Required Open Space",
        },
        "setbacks_m": setbacks,
        "notes": [
            "Use this as a studio planning aid before official code review.",
            "Local zoning ordinances, easements, firewalls, and subdivision restrictions can require stricter limits.",
        ],
    }


def build_tile_grid_script(request: TileEstimateRequest) -> tuple[str, dict]:
    room_width_mm = request.room_width_meters * 1000
    room_length_mm = request.room_length_meters * 1000
    tile_area_sqm = (request.tile_size_mm / 1000) ** 2
    room_area_sqm = request.room_width_meters * request.room_length_meters
    raw_tile_count = room_area_sqm / tile_area_sqm
    tiles_with_wastage = raw_tile_count * (1 + (request.wastage_percent / 100))
    tiles_x = int((room_width_mm + request.tile_size_mm - 0.0001) // request.tile_size_mm)
    tiles_y = int((room_length_mm + request.tile_size_mm - 0.0001) // request.tile_size_mm)

    lines = [
        "; ================================================",
        "; ArchiVault Quantity Lab - Tile Grid Array",
        "; Generated from /api/v1/quantity/tile-estimate",
        "; ================================================",
        "",
        "; [0] Layer setup",
        "_-LAYER",
        "_M",
        "A-TILE-GRID",
        "_C",
        "8",
        "A-TILE-GRID",
        "",
        "; [1] Room boundary",
        "_RECTANGLE",
        "0,0",
        f"{round(room_width_mm, 2)},{round(room_length_mm, 2)}",
        "",
        "; [2] Vertical tile joints",
    ]

    for index in range(tiles_x + 1):
        x = min(index * request.tile_size_mm, room_width_mm)
        lines.extend([
            "_LINE",
            f"{round(x, 2)},0",
            f"{round(x, 2)},{round(room_length_mm, 2)}",
            "",
        ])

    lines.append("; [3] Horizontal tile joints")
    for index in range(tiles_y + 1):
        y = min(index * request.tile_size_mm, room_length_mm)
        lines.extend([
            "_LINE",
            f"0,{round(y, 2)}",
            f"{round(room_width_mm, 2)},{round(y, 2)}",
            "",
        ])

    lines.extend([
        "; [4] Regenerate tile layout",
        "_REGENALL",
        "",
    ])

    summary = {
        "room_area_sqm": round(room_area_sqm, 2),
        "tile_area_sqm": round(tile_area_sqm, 4),
        "raw_tiles_required": round(raw_tile_count, 2),
        "recommended_tiles_with_wastage": int(tiles_with_wastage + 0.9999),
        "grid_columns": tiles_x,
        "grid_rows": tiles_y,
        "tile_size_mm": request.tile_size_mm,
        "wastage_percent": request.wastage_percent,
    }
    return "\n".join(lines) + "\n", summary


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
    
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        zip_file.writestr('ArchiVault_Execute.scr', script_content, compress_type=zipfile.ZIP_DEFLATED)
    
    zip_buffer.seek(0)
    headers = {
        "Content-Disposition": 'attachment; filename="ArchiVault_Automation.zip"'
    }
    return StreamingResponse(
        iter([zip_buffer.getvalue()]),
        media_type="application/zip",
        headers=headers
    )


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


@app.post("/api/v1/drafting/generate-layout")
def generate_drafting_layout(request: DraftingLayoutRequest):
    script_content = build_floor_plan_layout_script(request)
    headers = {
        "Content-Disposition": 'attachment; filename="ArchiVault_Floor_Plan_Layout.scr"',
        "X-Content-Type-Options": "nosniff"
    }
    return Response(content=script_content, media_type="text/plain; charset=utf-8", headers=headers)


@app.post("/api/v1/compliance/pd1096")
def compute_pd1096_route(request: PD1096ComplianceRequest):
    return compute_pd1096_compliance(request)


@app.post("/api/v1/quantity/tile-estimate")
def compute_tile_estimate(request: TileEstimateRequest):
    script_content, summary = build_tile_grid_script(request)
    return {
        "status": "success",
        "file_name": "ArchiVault_Tile_Grid.scr",
        "summary": summary,
        "autocad_script": script_content,
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


class EnvironmentalVectorRequest(BaseModel):
    north_angle: float = Field(..., ge=0, le=360, description="North orientation angle in degrees")


@app.post("/api/v1/environmental/export-vector-script")
def export_environmental_vectors(request: EnvironmentalVectorRequest):
    """
    Generate AutoCAD script with environmental vectors (North Arrow, Amihan, Habagat, Morning Sun).
    Returns a ZIP archive containing the .scr file for easy browser download without security warnings.
    """
    north_angle = request.north_angle
    
    # Calculate vector angles relative to rotated north
    amihan_angle = 45  # NE wind, relative to north
    habagat_angle = 225  # SW monsoon, relative to north
    morning_sun_angle = 90  # East, relative to north
    
    # Adjust for site orientation
    amihan_rotated = (amihan_angle + north_angle) % 360
    habagat_rotated = (habagat_angle + north_angle) % 360
    morning_sun_rotated = (morning_sun_angle + north_angle) % 360
    
    # Build AutoCAD script
    script_lines = [
        "\"Environmental Site Analysis Vectors\"",
        ";Generated by ArchiVault - Passive Cooling Design Advisory",
        ";North angle: " + str(north_angle) + " degrees",
        "",
        ";Set drawing units and viewport",
        "_UNITS",
        "4",
        "",
        ";Draw North Arrow at center (0,0,0)",
        ";North arrow polygon - 0.5 unit triangle",
        "_POLYGON",
        "3",
        "0,0",
        "0.35,0.15",
        "-0.35,0.15",
        "",
        ";Rotate north arrow to site orientation",
        "_ROTATE",
        "_PREVIOUS",
        "0,0",
        str(north_angle),
        "",
        ";Add North label",
        "_TEXT",
        "0,0.65",
        "0.25",
        str(north_angle),
        "N",
        "",
        ";Draw Amihan vector (NE wind - CYAN)",
        ";Set color to cyan (color index 5)",
        "_COLOR",
        "5",
        ";Draw dashed line",
        "_LINETYPE",
        "_DASHED",
        "",
        ";Calculate endpoint for Amihan vector (1.2 units in direction)",
        ";Using sine/cosine for trig calculation",
    ]
    
    # Convert angles to radians for trig
    amihan_rad = math.radians(amihan_rotated)
    habagat_rad = math.radians(habagat_rotated)
    morning_sun_rad = math.radians(morning_sun_rotated)
    
    # Amihan endpoint (cyan vector)
    amihan_x = 1.2 * math.cos(amihan_rad)
    amihan_y = 1.2 * math.sin(amihan_rad)
    
    script_lines.extend([
        "_LINE",
        "0,0",
        str(round(amihan_x, 3)) + "," + str(round(amihan_y, 3)),
        "",
        ";Add Amihan label",
        "_TEXT",
        str(round(amihan_x * 0.6, 3)) + "," + str(round(amihan_y * 0.6, 3)),
        "0.2",
        "0",
        "AMIHAN",
        "",
        ";Draw Habagat vector (SW monsoon - GREEN)",
        "_COLOR",
        "3",
        "",
    ])
    
    # Habagat endpoint (green vector)
    habagat_x = 1.2 * math.cos(habagat_rad)
    habagat_y = 1.2 * math.sin(habagat_rad)
    
    script_lines.extend([
        "_LINE",
        "0,0",
        str(round(habagat_x, 3)) + "," + str(round(habagat_y, 3)),
        "",
        ";Add Habagat label",
        "_TEXT",
        str(round(habagat_x * 0.6, 3)) + "," + str(round(habagat_y * 0.6, 3)),
        "0.2",
        "0",
        "HABAGAT",
        "",
        ";Draw Morning Sun vector (EAST - YELLOW)",
        "_COLOR",
        "2",
        "",
    ])
    
    # Morning Sun endpoint (yellow vector)
    morning_sun_x = 1.0 * math.cos(morning_sun_rad)
    morning_sun_y = 1.0 * math.sin(morning_sun_rad)
    
    script_lines.extend([
        "_LINE",
        "0,0",
        str(round(morning_sun_x, 3)) + "," + str(round(morning_sun_y, 3)),
        "",
        ";Add Morning Sun label",
        "_TEXT",
        str(round(morning_sun_x * 0.55, 3)) + "," + str(round(morning_sun_y * 0.55, 3)),
        "0.2",
        "0",
        "MORNING SUN",
        "",
        ";Reset to continuous line and default color",
        "_LINETYPE",
        "_CONTINUOUS",
        "_COLOR",
        "256",
        ";End of script",
    ])
    
    script_content = "\n".join(script_lines)
    
    # Create ZIP archive with the script
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        zip_file.writestr('Environmental_Analysis.scr', script_content)
    
    zip_buffer.seek(0)
    
    return StreamingResponse(
        iter([zip_buffer.getvalue()]),
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=Site_Analysis_Vectors.zip"}
    )


@app.post("/api/v1/environmental/generate-diagram-script")
def generate_environmental_diagram(request: EnvironmentalVectorRequest):
    """
    Enhanced environmental diagram generator with all four vectors:
    - North Arrow (rotated)
    - Amihan (NE wind - Cyan, dynamic)
    - Habagat (SW monsoon - Green, dynamic)
    - Morning Sun (East - Yellow, locked absolute)
    - Afternoon Sun (West - Orange/Red, locked absolute)
    """
    north_angle = request.north_angle

    amihan_angle = 45
    habagat_angle = 225
    morning_sun_angle = 90
    afternoon_sun_angle = 270

    amihan_rotated = (amihan_angle + north_angle) % 360
    habagat_rotated = (habagat_angle + north_angle) % 360

    amihan_rad = math.radians(amihan_rotated)
    habagat_rad = math.radians(habagat_rotated)
    morning_sun_rad = math.radians(morning_sun_angle)
    afternoon_sun_rad = math.radians(afternoon_sun_angle)

    amihan_x = 1.2 * math.cos(amihan_rad)
    amihan_y = 1.2 * math.sin(amihan_rad)
    habagat_x = 1.2 * math.cos(habagat_rad)
    habagat_y = 1.2 * math.sin(habagat_rad)
    morning_sun_x = 1.0 * math.cos(morning_sun_rad)
    morning_sun_y = 1.0 * math.sin(morning_sun_rad)
    afternoon_sun_x = 1.0 * math.cos(afternoon_sun_rad)
    afternoon_sun_y = 1.0 * math.sin(afternoon_sun_rad)

    script_lines = [
        '"Environmental Diagram - Full Analysis"',
        ";Generated by ArchiVault - Complete Passive Design Strategy",
        ";North angle: " + str(north_angle) + " degrees",
        "",
        ";SET DRAWING UNITS",
        "_UNITS",
        "4",
        "",
        ";NORTH ARROW POLYGON",
        "_POLYGON",
        "3",
        "0,0",
        "0.35,0.15",
        "-0.35,0.15",
        "",
        ";ROTATE NORTH ARROW TO SITE ORIENTATION",
        "_ROTATE",
        "_PREVIOUS",
        "0,0",
        str(north_angle),
        "",
        ";NORTH LABEL",
        "_TEXT",
        "0,0.65",
        "0.25",
        str(north_angle),
        "N",
        "",
        ";========== WIND VECTORS ==========",
        ";AMIHAN VECTOR (NE WIND - CYAN DASHED)",
        "_COLOR",
        "5",
        "_LINETYPE",
        "_DASHED",
        "_LINE",
        "0,0",
        str(round(amihan_x, 3)) + "," + str(round(amihan_y, 3)),
        "",
        ";AMIHAN LABEL",
        "_TEXT",
        str(round(amihan_x * 0.6, 3)) + "," + str(round(amihan_y * 0.6, 3)),
        "0.2",
        "0",
        "AMIHAN (Cool NE Wind)",
        "",
        ";HABAGAT VECTOR (SW MONSOON - GREEN DASHED)",
        "_COLOR",
        "3",
        "_LINE",
        "0,0",
        str(round(habagat_x, 3)) + "," + str(round(habagat_y, 3)),
        "",
        ";HABAGAT LABEL",
        "_TEXT",
        str(round(habagat_x * 0.6, 3)) + "," + str(round(habagat_y * 0.6, 3)),
        "0.2",
        "0",
        "HABAGAT (Monsoon SW)",
        "",
        ";========== SOLAR VECTORS (ABSOLUTE LOCK) ==========",
        ";MORNING SUN VECTOR (EAST - YELLOW)",
        "_COLOR",
        "2",
        "_LINETYPE",
        "_CONTINUOUS",
        "_LINE",
        "0,0",
        str(round(morning_sun_x, 3)) + "," + str(round(morning_sun_y, 3)),
        "",
        ";MORNING SUN LABEL",
        "_TEXT",
        str(round(morning_sun_x * 0.55, 3)) + "," + str(round(morning_sun_y * 0.55, 3)),
        "0.2",
        "0",
        "MORNING SUN (Warm Light)",
        "",
        ";AFTERNOON SUN VECTOR (WEST - ORANGE/RED DASHED)",
        "_COLOR",
        "30",
        ";Orange = color index 30 (close approximation)",
        "_LINETYPE",
        "_DASHED",
        "_LINE",
        "0,0",
        str(round(afternoon_sun_x, 3)) + "," + str(round(afternoon_sun_y, 3)),
        "",
        ";AFTERNOON SUN LABEL",
        "_TEXT",
        str(round(afternoon_sun_x * 0.55, 3)) + "," + str(round(afternoon_sun_y * 0.55, 3)),
        "0.2",
        "0",
        "AFTERNOON (Harsh Heat)",
        "",
        ";RESET",
        "_LINETYPE",
        "_CONTINUOUS",
        "_COLOR",
        "256",
    ]

    script_content = "\n".join(script_lines)

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        zip_file.writestr('Environmental_Full_Diagram.scr', script_content)

    zip_buffer.seek(0)

    return StreamingResponse(
        iter([zip_buffer.getvalue()]),
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=Environmental_Full_Diagram.zip"}
    )
