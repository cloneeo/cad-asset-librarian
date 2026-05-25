import { CADAsset, Category, ExternalDWGProvider } from './types';

export const DEFAULTS_CATEGORIES: Category[] = [
  { id: 1, name: 'Architectural Furniture (A-FURN)', color: 'sky' },
  { id: 2, name: 'Doors & Windows (A-DOOR)', color: 'emerald' },
  { id: 3, name: 'Landscape & Figures (A-LNDS)', color: 'amber' },
  { id: 4, name: 'Annotations & Symbols (A-ANNO)', color: 'purple' },
];

export const CAD_ASSETS_DATA: Omit<CADAsset, 'phash'>[] = [
  {
    id: 1,
    name: 'Barcelona Pavilion Chair (Top View)',
    description: 'Classic Mies van der Rohe design lounge chair block in plan view, featuring detailed steel frame and tufted cushion outlines.',
    fileLink: 'arch_barcelona_chair_top.dwg',
    category: 'Architectural Furniture (A-FURN)',
    svgPath: `<g stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round">
      <!-- Main Outer Frame -->
      <rect x="20" y="20" width="60" height="60" rx="4" />
      <!-- Left & Right Armrests / Frame Edges -->
      <line x1="20" y1="26" x2="80" y2="26" opacity="0.4" />
      <!-- Leather Cushion Tufting Grid Lines -->
      <rect x="25" y="28" width="50" height="44" rx="2" stroke-width="1" />
      <!-- Grid subdivisions for standard tufted leather -->
      <line x1="41.5" y1="28" x2="41.5" y2="72" stroke-width="0.8" stroke-dasharray="1,1" />
      <line x1="58.5" y1="28" x2="58.5" y2="72" stroke-width="0.8" stroke-dasharray="1,1" />
      <line x1="25" y1="42.5" x2="75" y2="42.5" stroke-width="0.8" stroke-dasharray="1,1" />
      <line x1="25" y1="57.5" x2="75" y2="57.5" stroke-width="0.8" stroke-dasharray="1,1" />
      <!-- Pull buttons / tufts intersections -->
      <circle cx="41.5" cy="42.5" r="1.5" fill="currentColor" />
      <circle cx="58.5" cy="42.5" r="1.5" fill="currentColor" />
      <circle cx="41.5" cy="57.5" r="1.5" fill="currentColor" />
      <circle cx="58.5" cy="57.5" r="1.5" fill="currentColor" />
      <!-- Subtle Backrest Shadow lip -->
      <path d="M 20 20 L 50 24 L 80 20" stroke-width="1" opacity="0.6" />
    </g>`
  },
  {
    id: 2,
    name: 'Single Interior Door 900mm (Plan View)',
    description: 'Standard 900mm interior single wood door swing block with clear 1/4 circular arc trajectory and frame timber profiles.',
    fileLink: 'arch_door_900_plan.dwg',
    category: 'Doors & Windows (A-DOOR)',
    svgPath: `<g stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round">
      <!-- Left Wall / Door Jamb frame -->
      <rect x="15" y="45" width="10" height="10" fill="none" stroke-width="1" />
      <!-- Right Wall / Door Jamb frame -->
      <rect x="75" y="45" width="10" height="10" fill="none" stroke-width="1" />
      <!-- Door Panel (Thickness 40mm, Open 90deg upwards) -->
      <rect x="15" y="10" width="6" height="35" rx="0.5" />
      <!-- Swing Trajectory Arc (90 Degrees) -->
      <path d="M 21 10 A 35 35 0 0 1 75 45" stroke-dasharray="3,2" />
      <line x1="25" y1="50" x2="75" y2="50" stroke-width="1" stroke-dasharray="4,4" opacity="0.3" />
    </g>`
  },
  {
    id: 3,
    name: 'Double Slide Patio Door 2400mm (Plan View)',
    description: 'Double glazed sliding glass exterior deck door block with nested weatherstripping rails and directional slide arrows.',
    fileLink: 'arch_sliding_patio_2400.dwg',
    category: 'Doors & Windows (A-DOOR)',
    svgPath: `<g stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round">
      <!-- Outer threshold framing -->
      <rect x="15" y="40" width="70" height="20" rx="1" opacity="0.3" />
      <!-- Fixed Left Glass Slider Panel (Slightly offset toward outside) -->
      <rect x="18" y="43" width="36" height="6" rx="0.5" />
      <line x1="18" y1="46" x2="54" y2="46" stroke-width="0.8" />
      <!-- Active Right Glass Sliding Panel (Offset toward inside) -->
      <rect x="46" y="51" width="36" height="6" rx="0.5" />
      <line x1="46" y1="54" x2="82" y2="54" stroke-width="0.8" />
      <!-- Motion Arrows indicators -->
      <path d="M 52 57 L 62 57 M 59 54 L 62 57 L 59 60" stroke-width="1" />
    </g>`
  },
  {
    id: 4,
    name: 'Deciduous Foliage Canopy Tree (Plan View)',
    description: 'Elegant organic-style canopy plant block for exterior site layouts, urban plans, and landscape spatial arrangements.',
    fileLink: 'arch_tree_canopy_plan.dwg',
    category: 'Landscape & Figures (A-LNDS)',
    svgPath: `<g stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round">
      <!-- Trunk core circle -->
      <circle cx="50" cy="50" r="4" fill="currentColor" />
      <!-- Main hand-crafted style branch vectors -->
      <path d="M 50 50 Q 42 38 30 35" />
      <path d="M 50 50 Q 58 40 70 30" />
      <path d="M 50 50 Q 55 65 65 72" />
      <path d="M 50 50 Q 38 58 25 68" />
      <!-- Double Ring Outer Organic Foliage Lines -->
      <path d="M 30 35 C 20 40 15 55 25 68 C 30 75 45 85 65 72 C 75 68 85 50 70 30 C 60 15 40 15 30 35 Z" stroke-width="1.5" />
      <path d="M 34 32 C 24 36 18 52 28 64 C 34 70 48 80 62 68 C 72 64 80 48 66 28 C 56 18 42 16 34 32 Z" stroke-width="1" stroke-dasharray="2,2" opacity="0.6" />
    </g>`
  },
  {
    id: 5,
    name: 'Human Scale Architectural Silhouette (Elevation)',
    description: 'Aesthetic minimalist walking architectural graphic scale figure to establish height reference in perspective section cuts.',
    fileLink: 'arch_human_scale_elevation.dwg',
    category: 'Landscape & Figures (A-LNDS)',
    svgPath: `<g stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round">
      <!-- Head -->
      <circle cx="50" cy="20" r="6" />
      <!-- Neck / Shoulders / Body contour -->
      <path d="M 44 26 C 44 26 40 32 40 42 L 42 62 L 40 85 M 48 62 L 52 85" />
      <!-- Torso and Right Arm gesturing -->
      <path d="M 56 26 C 56 26 60 35 60 52 L 56 70" />
      <!-- Spine reference line -->
      <path d="M 50 26 L 46 60" opacity="0.3" />
      <!-- Soft Ground Line -->
      <line x1="20" y1="85" x2="80" y2="85" stroke-width="1" stroke-dasharray="1,2" opacity="0.7" />
    </g>`
  },
  {
    id: 6,
    name: 'Modernist Architectural North Arrow (Plan)',
    description: 'Precision architectural compass North Arrow indicator matching official drafting layouts with high-contrast shaded quadrant.',
    fileLink: 'arch_north_arrow_minimal.dwg',
    category: 'Annotations & Symbols (A-ANNO)',
    svgPath: `<g stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round">
      <!-- Outer Compass Ring -->
      <circle cx="50" cy="50" r="35" />
      <!-- Arrow Head Triangle pointing North (Up) -->
      <polygon points="50,15 62,48 50,42 38,48" stroke-width="1.5" />
      <!-- Shaded/Filled East (Right) Side of Arrow for standard architectural style -->
      <polygon points="50,15 62,48 50,42" fill="currentColor" opacity="0.8" />
      <!-- North Designator letter "N" -->
      <text x="47" y="11" font-size="9" font-family="monospace" font-weight="bold" fill="currentColor">N</text>
      <!-- Horizontal crosshair alignment wire -->
      <line x1="12" y1="50" x2="88" y2="50" stroke-width="0.8" stroke-dasharray="4,4" opacity="0.4" />
    </g>`
  },
  {
    id: 7,
    name: 'Detail Section Elevation Target Marker',
    description: 'Standard crosshair elevation height target symbol for sections with alternating filled contrast quarter quadrants.',
    fileLink: 'arch_height_benchmark.dwg',
    category: 'Annotations & Symbols (A-ANNO)',
    svgPath: `<g stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round">
      <!-- Core outer alignment ring -->
      <circle cx="50" cy="50" r="23" />
      <!-- Secondary offset ring -->
      <circle cx="50" cy="50" r="28" stroke-width="0.8" opacity="0.4" />
      <!-- Grid crosshairs extended outside -->
      <line x1="15" y1="50" x2="85" y2="50" />
      <line x1="50" y1="15" x2="50" y2="85" />
      <!-- Solid filled alternating slices definition -->
      <!-- Quarter Top-Left -->
      <path d="M 50 50 L 50 27 A 23 23 0 0 0 27 50 Z" fill="currentColor" />
      <!-- Quarter Bottom-Right -->
      <path d="M 50 50 L 50 73 A 23 23 0 0 0 73 50 Z" fill="currentColor" />
    </g>`
  },
  {
    id: 8,
    name: 'Sectional Sofa 3-Seater (Plan View)',
    description: 'Aesthetic residential sectional custom sofa block incorporating deep cushion seam accents and soft armrests outlines.',
    fileLink: 'arch_sofa_3seater_plan.dwg',
    category: 'Architectural Furniture (A-FURN)',
    svgPath: `<g stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round">
      <!-- Couch Outer Envelope Frame -->
      <rect x="15" y="25" width="70" height="50" rx="3" />
      <!-- Backrest bolster lining -->
      <rect x="15" y="25" width="70" height="12" rx="1" fill="none" stroke-width="1" />
      <!-- Left Arm Rest -->
      <rect x="15" y="37" width="8" height="38" rx="1.5" fill="none" />
      <!-- Right Arm Rest -->
      <rect x="77" y="37" width="8" height="38" rx="1.5" fill="none" />
      <!-- 3 Cushions Split Lines layout -->
      <rect x="23" y="37" width="54" height="38" />
      <line x1="41" y1="37" x2="41" y2="75" stroke-width="1" />
      <line x1="59" y1="37" x2="59" y2="75" stroke-width="1" />
      <!-- Center comfort wrinkles detail representation -->
      <path d="M 32 50 Q 32 58 34 50" opacity="0.4" />
      <path d="M 50 50 Q 50 58 52 50" opacity="0.4" />
      <path d="M 68 50 Q 68 58 70 50" opacity="0.4" />
    </g>`
  }
];

export const MOCK_CMD_PRESETS = [
  { 
    id: '1', 
    name: 'AIA Color Layers Standard Init', 
    command: '-LAYER M A-WALL C 2 A-WALL\n-LAYER M A-DOOR C 4 A-DOOR\n-LAYER M A-FURN C 1 A-FURN\n-LAYER M A-ANNO C 3 A-ANNO\n-LAYER S A-WALL', 
    description: 'Creates and colors standard American Institute of Architects (AIA) layers: Yellow for Walls, Cyan for Doors, Red for Furniture, Green for Annotations.', 
    enabled: true 
  },
  { 
    id: '2', 
    name: 'Setup Blank Layout Margins (A2 Metric)', 
    command: 'LIMITS 0,0 594,420\nRECTANG 0,0 594,420\nRECTANG 10,10 584,410\nSTYLE STANDARD Arial 3.5 1 N N N', 
    description: 'Configures drafting bounds for an A2 layout border grid (594mm x 420mm) and applies standard architectural Arial typeface height values.', 
    enabled: true 
  },
  { 
    id: '3', 
    name: 'Architectural Scale & Dimension Style', 
    command: 'DIMSTYLE R STANDARD\nDIMLUNIT 4\nDIMTSZ 1.5\nDIMTXT 2.5\nDIMSCALE 1.0', 
    description: 'Overhaul dimensions for structural plans: swaps standard boring mechanical arrowheads for elegant architectural tick marks (DIMTSZ) and sets architectural fractional readouts.', 
    enabled: false 
  },
  { 
    id: '4', 
    name: 'Draft Layout Title Block Frame', 
    command: 'RECTANG 480,10 584,60\nLINE 480,35 584,35\nTEXT 485,42 3.5 0 PROJECT:_STUDENT_MUSEUM\nTEXT 485,17 3.0 0 SCALE:_1:100__A2_DRAFT', 
    description: 'Draws a customized right-aligned architectural title block template box with dynamic metadata labels.', 
    enabled: false 
  },
];

// Complete python files as string constants to allow seamless UI explorer visualization
export const PYTHON_FILES = {
  'main.py': `import os
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import PlainTextResponse, Response
from pydantic import BaseModel
import io
from PIL import Image
import imagehash
from sqlalchemy.orm import Session

# Import database session and schema models
from .database import SessionLocal, engine, Base, Asset, Category

# Initialize database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Architectural CAD-Asset Librarian API",
    description="Python backend API for Perceptual Hash matching and architectural AutoCAD .scr script generation.",
    version="1.0.0"
)


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
        "service": "Architectural Asset Librarian API",
        "features": ["Visual Search (pHash comparisons)", "Architectural Script Generator (.scr)"]
    }


# Request schema for command script generator
class RenderScriptRequest(BaseModel):
  custom_commands: List[str] = []
  freeze_layers: List[str] = []


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
    Uploads drawing blueprint screenshot, computes its Perceptual Hash (pHash),
    and queries SQL database to return identical matching architectural blocks.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be a valid image sequence.")

    try:
        # Load image into PIL for calculation
        image_bytes = await file.read()
        image = Image.open(io.BytesIO(image_bytes))
        
        # Calculate Perceptual Hash (pHash)
        calculated_hash = imagehash.phash(image, hash_size=8)
        calculated_hash_str = str(calculated_hash)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process image: {str(e)}")

    # Fetch all stored CAD blocks
    assets = db.query(Asset).all()
    
    results = []
    for asset in assets:
        try:
        asset_link = build_cloud_link(asset.file_link)
        if not asset_link.lower().endswith((".dwg", ".obj")):
          continue

            stored_hash = imagehash.hex_to_hash(asset.phash)
            # Hamming distance calculation
            hamming_dist = calculated_hash - stored_hash
            
            # Convert hamming distance to absolute similarity percentage (max dist 64)
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
            continue

    # Sort items based on closest matches (ascending Hamming distance)
    results.sort(key=lambda x: x["distance"])

    return {
        "uploaded_phash": calculated_hash_str,
      "matches": results[:5],
      "total_matches": len(results)
    }
`,
  'database.py': `from sqlalchemy import create_engine, Column, Integer, String, Text, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship

DATABASE_URL = "sqlite:///./cad_library.db"

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)

    assets = relationship("Asset", back_populates="category")


class Asset(Base):
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(Text, nullable=True)
    file_link = Column(String)  # Local filepath or CDN url
    phash = Column(String, index=True)  # Precomputed 16-hex perceptual hash (e.g., "b38dcd3cc3c0f0f0")
    category_id = Column(Integer, ForeignKey("categories.id"))

    category = relationship("Category", back_populates="assets")


def seed_db_defaults(db_session):
    """
    Seeding utilities to pre-register architectural blocks on SQLite database.
    """
    categories_dict = {
      "Furniture": Category(name="Architectural Furniture (A-FURN)"),
      "DoorsWindows": Category(name="Doors & Windows (A-DOOR)"),
      "Landscape": Category(name="Landscape & Figures (A-LNDS)"),
      "Annotations": Category(name="Annotations & Symbols (A-ANNO)")
    }

    existing_cats = db_session.query(Category).all()
    if not existing_cats:
        for cat in categories_dict.values():
            db_session.add(cat)
        db_session.commit()

    existing_assets = db_session.query(Asset).all()
    if not existing_assets:
        default_assets = [
            Asset(
                name="Barcelona Pavilion Chair (Top View)",
                description="Classic Mies van der Rohe design lounge chair block in plan view.",
                file_link="arch_barcelona_chair_top.dwg",
                phash="3c3c7e7e7e7e3c3c",
                category_id=categories_dict["Furniture"].id
            ),
            Asset(
                name="Single Interior Door 900mm (Plan View)",
                description="Standard interior single wood door swing block with clean 1/4 arc swing.",
                file_link="arch_door_900_plan.dwg",
                phash="f0f0c0c0e0e0f0f0",
                category_id=categories_dict["DoorsWindows"].id
            )
        ]
        for asset in default_assets:
            db_session.add(asset)
        db_session.commit()
`,
  'requirements.txt': `fastapi>=0.100.0
uvicorn>=0.22.0
pydantic>=2.0.0
Pillow>=10.0.0
ImageHash>=4.3.1
SQLAlchemy>=2.0.0
python-multipart>=0.0.6
`
};

export const EXTERNAL_DWG_PROVIDERS: ExternalDWGProvider[] = [
  {
    name: 'CAD-Blocks.com',
    url: 'https://cad-blocks.com',
    description: 'Clean hand-vetted architectural DWG drawings of furniture, transport, people, plants, and construction detailing.',
    searchUrl: (query: string) => `https://cad-blocks.com/index.php?do=search&subaction=search&story=${encodeURIComponent(query)}`,
    isPopular: true
  },
  {
    name: 'DWGmodels.com',
    url: 'https://dwgmodels.com',
    description: 'Popular catalog of free CAD blocks containing modern interior furniture layouts, doors, windows, and scale figures.',
    searchUrl: (query: string) => `https://dwgmodels.com/index.php?do=search&subaction=search&story=${encodeURIComponent(query)}`,
    isPopular: true
  },
  {
    name: 'CADdetails.com',
    url: 'https://www.caddetails.com',
    description: 'High-quality professional 2D drawing elevations, details, and 3D BIM models representing real building product manufacturer dimensions.',
    searchUrl: (query: string) => `https://www.caddetails.com/Search?q=${encodeURIComponent(query)}`,
    isPopular: false
  },
  {
    name: 'CADblocksfree.com',
    url: 'https://www.cadblocksfree.com',
    description: 'Global hosting community supporting thousands of free 2D and 3D architectural dwg files sorted cleanly into standard layering.',
    searchUrl: (query: string) => `https://www.cadblocksfree.com/en/search/blocks/html/?SearchForm%5Bkeywords%5D=${encodeURIComponent(query)}`,
    isPopular: false
  },
  {
    name: 'Draftsperson.net',
    url: 'https://www.draftsperson.net',
    description: 'Vintage drafting repository hosting standard structural symbols, technical general notes, detailed layout files, and tutorial scripts.',
    searchUrl: (query: string) => `https://www.google.com/search?q=site:draftsperson.net+${encodeURIComponent(query)}`,
    isPopular: false
  }
];

export const GLOBAL_DWG_CATALOG: Omit<CADAsset, 'phash'>[] = [
  {
    id: 101,
    name: 'Ergonomic Office Mesh Chair (Top Plan)',
    description: 'High-back ergonomic lumbar support task chair with rotating armrests, twin casters star base, and visual recline tensioner knobs.',
    fileLink: 'global_off_mesh_chair_plan.dwg',
    category: 'Architectural Furniture (A-FURN)',
    svgPath: `<g stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round">
      <!-- Outer circular seat base contour -->
      <rect x="24" y="24" width="52" height="48" rx="8" />
      <path d="M 28 24 L 50 16 L 72 24" stroke-width="1.8" />
      <!-- Left Armrest -->
      <rect x="18" y="32" width="6" height="32" rx="2" />
      <!-- Right Armrest -->
      <rect x="76" y="32" width="6" height="32" rx="2" />
      <!-- Lumbar mesh tension curve bar -->
      <path d="M 32 16 Q 50 12 68 16" opacity="0.5" stroke-width="1.2" />
      <!-- Swivel caster center guide -->
      <circle cx="50" cy="48" r="3.5" fill="currentColor" />
    </g>`
  },
  {
    id: 102,
    name: 'Modern Master Bed King-Size (Top Plan View)',
    description: 'Luxury master double bed system with wooden floating headboard framing, dual premium comfort pillows, and elegant folded quilt linens blankets.',
    fileLink: 'global_master_bed_king.dwg',
    category: 'Architectural Furniture (A-FURN)',
    svgPath: `<g stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round">
      <!-- Bed Frame Mattress Envelope -->
      <rect x="16" y="16" width="68" height="74" rx="2" />
      <line x1="16" y1="20" x2="84" y2="20" stroke-width="2" />
      <!-- Floating Headboard Panel -->
      <rect x="12" y="12" width="76" height="4" rx="1" fill="currentColor" opacity="0.3" />
      <!-- Pillow Left -->
      <rect x="22" y="24" width="24" height="14" rx="3" />
      <path d="M 24 31 Q 34 33 44 31" opacity="0.5" stroke-width="0.8" />
      <!-- Pillow Right -->
      <rect x="54" y="24" width="24" height="14" rx="3" />
      <path d="M 56 31 Q 66 33 76 31" opacity="0.5" stroke-width="0.8" />
      <!-- Folded Duvet comfort line blanket fold -->
      <path d="M 16 52 C 34 56 66 48 84 52" stroke-width="1.2" />
      <path d="M 16 56 C 34 60 66 52 84 56" opacity="0.4" stroke-width="0.8" stroke-dasharray="2,2" />
    </g>`
  },
  {
    id: 103,
    name: 'Luxury Rectangular Bathtub (Plan View)',
    description: 'Standard 1700mm structural acrylic drop-in bathtub plan showing non-slip base tread mapping, overflow line, and brass corner faucet.',
    fileLink: 'global_bath_tub_dropin.dwg',
    category: 'Architectural Furniture (A-FURN)',
    svgPath: `<g stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round">
      <!-- Outer composite framing -->
      <rect x="15" y="20" width="70" height="60" rx="3" />
      <!-- Inner basin sloped contour curves -->
      <rect x="21" y="26" width="58" height="48" rx="8" />
      <rect x="24" y="29" width="52" height="42" rx="12" stroke-width="0.8" opacity="0.5" />
      <!-- Drain release circle -->
      <circle cx="73" cy="50" r="2.5" />
      <!-- Faucet fixture -->
      <rect x="78" y="47" width="5" height="6" rx="0.5" fill="currentColor" />
      <!-- Water mixer knobs -->
      <circle cx="79.5" cy="42" r="1.2" />
      <circle cx="79.5" cy="58" r="1.2" />
    </g>`
  },
  {
    id: 104,
    name: 'Dual Basin Kitchen Sink (Top Plan)',
    description: 'Stainless steel drop-in kitchen workstation sink unit with parallel double deep washing basins and 360 flexible faucet spray spout spacer.',
    fileLink: 'global_kitchen_sink_dual.dwg',
    category: 'Architectural Furniture (A-FURN)',
    svgPath: `<g stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round">
      <!-- Main Outer steel flange sink frame -->
      <rect x="15" y="22" width="70" height="56" rx="2" />
      <!-- Left Washing Basin -->
      <rect x="19" y="26" width="28" height="48" rx="4" />
      <circle cx="33" cy="50" r="2.5" stroke-width="0.8" opacity="0.6" />
      <!-- Right Washing Basin -->
      <rect x="53" y="26" width="28" height="48" rx="4" />
      <circle cx="67" cy="50" r="2.5" stroke-width="0.8" opacity="0.6" />
      <!-- Tall Spout Faucet base and goose-neck assembly -->
      <rect x="47" y="46" width="6" height="8" rx="0.5" />
      <path d="M 47 50 L 39 50" stroke-width="1.8" />
    </g>`
  },
  {
    id: 105,
    name: 'Standard Ceramic Flush Toilet Flush System',
    description: 'Modern low-flow water closet bowl unit showing water supply tank enclosure, seat cover hinge limits, and water siphon rim.',
    fileLink: 'global_wc_toilet_standard.dwg',
    category: 'Architectural Furniture (A-FURN)',
    svgPath: `<g stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round">
      <!-- Ceramic Water Cistern Tank at back -->
      <rect x="30" y="16" width="40" height="18" rx="2" />
      <!-- Dual push flushing button top -->
      <rect x="46" y="20" width="8" height="4" rx="1" stroke-width="0.8" />
      <!-- Bowl projection profile -->
      <path d="M 32 34 C 32 34 28 50 28 66 C 28 80 50 86 50 86 C 50 86 72 80 72 66 C 72 50 68 34 68 34 Z" />
      <!-- Inner water siphon rim edge -->
      <path d="M 35 38 C 35 38 32 50 32 64 C 32 76 50 81 50 81 C 50 81 68 76 68 64 C 68 50 65 38 65 38 Z" stroke-dasharray="2,2" opacity="0.6" />
      <!-- Toilet seat lid hinge markers -->
      <rect x="36" y="31" width="6" height="3" rx="0.5" fill="currentColor" />
      <rect x="58" y="31" width="6" height="3" rx="0.5" fill="currentColor" />
    </g>`
  },
  {
    id: 106,
    name: 'Circular Dining Table with 4 Chairs (Plan)',
    description: 'Classic residential spatial planning dinner layout containing central circular dining table and 4 peripheral cozy cushion slide chairs.',
    fileLink: 'global_dining_table_round4.dwg',
    category: 'Architectural Furniture (A-FURN)',
    svgPath: `<g stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round">
      <!-- Outer main Circular Dining Table -->
      <circle cx="50" cy="50" r="22" stroke-width="2" />
      <circle cx="50" cy="50" r="18" stroke-width="0.8" stroke-dasharray="2,1" opacity="0.4" />
      <!-- Top Chair (Pushed in) -->
      <path d="M 38 20 L 62 20 C 62 20 62 12 50 12 C 38 12 38 20 38 20 Z M 41 20 L 41 24 M 59 20 L 59 24" />
      <!-- Bottom Chair (Pushed in) -->
      <path d="M 38 80 L 62 80 C 62 80 62 88 50 88 C 38 88 38 80 38 80 Z M 41 80 L 41 76 M 59 80 L 59 76" />
      <!-- Left Chair (Pushed in) -->
      <path d="M 20 38 L 20 62 C 20 62 12 62 12 50 C 12 38 20 38 20 38 Z M 20 41 L 24 41 M 20 59 L 24 59" />
      <!-- Right Chair (Pushed in) -->
      <path d="M 80 38 L 80 62 C 80 62 88 62 88 50 C 88 38 80 38 80 38 Z M 80 41 L 76 41 M 80 59 L 76 59" />
    </g>`
  },
  {
    id: 107,
    name: 'Sedan Passenger Vehicle Outline (Top Plan)',
    description: 'Medium luxury sedan passenger automobile top plan wireframe for planning parking stalls, driveway turning radii, and layout elevations.',
    fileLink: 'global_sedan_car_top_plan.dwg',
    category: 'Landscape & Figures (A-LNDS)',
    svgPath: `<g stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round">
      <!-- Outer Chassis Car Envelope bounding -->
      <rect x="22" y="10" width="56" height="80" rx="14" />
      <!-- Windshield front glass -->
      <path d="M 30 36 C 30 36 34 26 50 26 C 66 26 70 36 70 36 Z" fill="none" stroke-width="1.5" />
      <!-- Rear window windshield -->
      <path d="M 31 72 C 31 72 35 78 50 78 C 65 78 69 72 69 72 Z" fill="none" stroke-width="1.5" />
      <!-- Side mirrors Left -->
      <path d="M 22 34 L 16 34 L 16 38 L 22 39" fill="currentColor" />
      <!-- Side mirrors Right -->
      <path d="M 78 34 L 84 34 L 84 38 L 78 39" fill="currentColor" />
      <!-- Hood panel seam lines -->
      <line x1="28" y1="24" x2="32" y2="12" stroke-width="0.8" opacity="0.6" />
      <line x1="72" y1="24" x2="68" y2="12" stroke-width="0.8" opacity="0.6" />
      <line x1="32" y1="12" x2="68" y2="12" stroke-width="0.8" opacity="0.6" />
      <!-- Dynamic dashboard seats wireframe inside -->
      <rect x="30" y="42" width="16" height="14" rx="2" stroke-width="0.8" opacity="0.4" />
      <rect x="54" y="42" width="16" height="14" rx="2" stroke-width="0.8" opacity="0.4" />
      <rect x="30" y="60" width="40" height="12" rx="1" stroke-width="0.8" opacity="0.4" />
    </g>`
  },
  {
    id: 108,
    name: 'Interior Kentia Palm Houseplant (Top Plan)',
    description: 'Beautiful multi-branch feathered leafy palm cluster indoor shrub block to accentuate cozy spatial corners and common lounges.',
    fileLink: 'global_kentia_palm_foliage.dwg',
    category: 'Landscape & Figures (A-LNDS)',
    svgPath: `<g stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round">
      <!-- Plan planter pot container base -->
      <circle cx="50" cy="50" r="12" stroke-width="1" opacity="0.6" />
      <circle cx="50" cy="50" r="10" stroke-width="1" fill="none" opacity="0.4" />
      <!-- Palm leaf 1 radiating outward -->
      <path d="M 50 50 Q 30 40 12 24 C 20 28 32 30 46 44" stroke-width="1.2" />
      <!-- Palm leaf 2 radiating outward -->
      <path d="M 50 50 Q 70 40 88 24 C 80 28 68 30 54 44" stroke-width="1.2" />
      <!-- Palm leaf 3 radiating outward -->
      <path d="M 50 50 Q 34 60 18 80 C 24 72 32 64 48 56" stroke-width="1.2" />
      <!-- Palm leaf 4 radiating outward -->
      <path d="M 50 50 Q 66 60 82 80 C 76 72 68 64 52 56" stroke-width="1.2" />
      <!-- Palm leaf 5 center top feather -->
      <path d="M 50 50 Q 50 28 50 10 C 47 18 47 28 50 50" stroke-width="1.2" />
    </g>`
  },
  {
    id: 109,
    name: 'Minimal Section Handrail Profile (Section Cut)',
    description: 'Wall-mounted wooden standard continuous circular handrail detail in section cut with mechanical metal flange support bracketry.',
    fileLink: 'global_handrail_bracket_sec.dwg',
    category: 'Annotations & Symbols (A-ANNO)',
    svgPath: `<g stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round">
      <!-- Structural Main Concrete Wall face -->
      <line x1="15" y1="10" x2="15" y2="90" stroke-width="2.5" />
      <!-- Tile/Finishing thin layer line -->
      <line x1="18" y1="10" x2="18" y2="90" stroke-dasharray="2,2" opacity="0.5" />
      <!-- Metal circular mounting block attached to wall -->
      <rect x="18" y="44" width="4" height="12" fill="currentColor" />
      <!-- Curved horizontal metal bracket arm -->
      <path d="M 22 50 L 46 50 M 46 50 Q 56 50 56 42 M 56 42 L 56 36" stroke-width="2" />
      <!-- High-resolution circular solid timber rails -->
      <circle cx="56" cy="24" r="12" stroke-width="1.8" />
      <circle cx="56" cy="24" r="1.5" fill="currentColor" />
      <!-- Safety code clearance indicator line -->
      <path d="M 18 24 L 44 24" opacity="0.3" stroke-dasharray="3,3" />
      <text x="21" y="21" font-size="6" font-family="monospace" fill="currentColor" opacity="0.6">50mm Min</text>
    </g>`
  },
  {
    id: 110,
    name: 'Executive Corner Desk with Monitor Layout',
    description: 'Corporate student corner L-shape modular workspace workstation complete with secondary laptop profile, mouse pad, and document organizer.',
    fileLink: 'global_exec_lg_desk_layout.dwg',
    category: 'Architectural Furniture (A-FURN)',
    svgPath: `<g stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round">
      <!-- Modular L-shape main desktop surface -->
      <rect x="15" y="15" width="70" height="70" rx="3" />
      <!-- Cutout inner cavity for chair swivel comfort clearance -->
      <path d="M 40 85 L 40 45 A 5 5 0 0 1 45 40 L 85 40" stroke-width="1.8" fill="none" />
      <!-- Large Dual monitor mount stand desk -->
      <rect x="22" y="20" width="18" height="4" rx="0.5" />
      <rect x="28" y="24" width="6" height="2" />
      <!-- Primary laptop keyboard -->
      <rect x="52" y="20" width="12" height="10" rx="1" />
      <rect x="53" y="25" width="10" height="4" stroke-width="0.8" opacity="0.6" />
      <!-- Standard A4 student documents notebook sheet layout -->
      <rect x="70" y="20" width="10" height="14" rx="0.5" stroke-dasharray="1,1" />
      <!-- Wire grommet holes -->
      <circle cx="18" cy="18" r="1.5" opacity="0.8" />
    </g>`
  }
];

