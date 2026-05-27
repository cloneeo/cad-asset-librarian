from sqlalchemy import create_engine, Column, DateTime, Float, Integer, String, Text, ForeignKey
from datetime import datetime
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
    file_link = Column(String)  # Local filepath or CDN url (e.g., ./blocks/screw.dwg)
    phash = Column(String, index=True)  # Precomputed 16-hex perceptual hash (e.g., "b38dcd3cc3c0f0f0")
    category_id = Column(Integer, ForeignKey("categories.id"))

    category = relationship("Category", back_populates="assets")


class WorkflowLog(Base):
    __tablename__ = "workflow_logs"

    id = Column(Integer, primary_key=True, index=True)
    action_type = Column(String, index=True)
    file_path = Column(String, nullable=True)
    result_summary = Column(Text)
    warnings_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class AutoCADFileHealthCheck(Base):
    __tablename__ = "autocad_file_health_checks"

    id = Column(Integer, primary_key=True, index=True)
    file_name = Column(String, index=True)
    file_path = Column(String, nullable=True)
    file_type = Column(String)
    file_size_mb = Column(Float, default=0)
    layer_count = Column(Integer, default=0)
    block_count = Column(Integer, default=0)
    hatch_count = Column(Integer, default=0)
    xref_count = Column(Integer, default=0)
    raster_detected = Column(Integer, default=0)
    annotation_detected = Column(Integer, default=0)
    objects3d_detected = Column(Integer, default=0)
    entity_count = Column(Integer, default=0)
    health_score = Column(Integer, default=0)
    health_status = Column(String)
    recommendations = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


class BubbleSpace(Base):
    __tablename__ = "bubble_spaces"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    area_sqm = Column(Integer, default=0)
    zone_type = Column(String, default="Public")


class BubbleAdjacency(Base):
    __tablename__ = "bubble_adjacencies"
    id = Column(Integer, primary_key=True, index=True)
    from_space = Column(String, index=True)
    to_space = Column(String, index=True)
    relationship = Column(String, default="Neutral")


class StairCalculation(Base):
    __tablename__ = "stair_calculations"
    id = Column(Integer, primary_key=True, index=True)
    stair_type = Column(String)
    result_summary = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


class VentilationRoom(Base):
    __tablename__ = "ventilation_rooms"
    id = Column(Integer, primary_key=True, index=True)
    room_name = Column(String)
    result_summary = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


class MaterialQuantity(Base):
    __tablename__ = "material_quantities"
    id = Column(Integer, primary_key=True, index=True)
    category = Column(String)
    quantity_summary = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


class MaterialPrice(Base):
    __tablename__ = "material_prices"
    id = Column(Integer, primary_key=True, index=True)
    material_name = Column(String, index=True)
    category = Column(String)
    unit = Column(String)
    price_php = Column(Integer, default=0)
    source = Column(String, default="Sample data")
    location = Column(String, default="Philippines")
    last_updated = Column(DateTime, default=datetime.utcnow)


class MaterialCostEstimate(Base):
    __tablename__ = "material_cost_estimates"
    id = Column(Integer, primary_key=True, index=True)
    estimate_summary = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


class BatchPlotExport(Base):
    __tablename__ = "batch_plot_exports"
    id = Column(Integer, primary_key=True, index=True)
    dwg_folder = Column(String)
    output_folder = Column(String)
    result_summary = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


class RenderAsset(Base):
    __tablename__ = "render_assets"
    id = Column(Integer, primary_key=True, index=True)
    asset_name = Column(String, index=True)
    category = Column(String)
    file_path = Column(String)
    file_size_mb = Column(Integer, default=0)
    compatibility = Column(String)
    preview_thumbnail_path = Column(String, nullable=True)
    date_added = Column(DateTime, default=datetime.utcnow)
    last_used = Column(DateTime, nullable=True)
    favorite_status = Column(Integer, default=0)


class RenderAssetTag(Base):
    __tablename__ = "render_asset_tags"
    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("render_assets.id"))
    tag = Column(String, index=True)


class RenderCollection(Base):
    __tablename__ = "render_collections"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class RenderCollectionItem(Base):
    __tablename__ = "render_collection_items"
    id = Column(Integer, primary_key=True, index=True)
    collection_id = Column(Integer, ForeignKey("render_collections.id"))
    asset_id = Column(Integer, ForeignKey("render_assets.id"))


class RenderProjectCheck(Base):
    __tablename__ = "render_project_checks"
    id = Column(Integer, primary_key=True, index=True)
    result_summary = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


class ScaleRecommendation(Base):
    __tablename__ = "scale_recommendations"
    id = Column(Integer, primary_key=True, index=True)
    drawing_type = Column(String, index=True)
    sheet_size = Column(String)
    real_width = Column(Integer, default=0)
    real_height = Column(Integer, default=0)
    selected_scale = Column(Integer, default=100)
    recommended_scale = Column(Integer, default=100)
    fit_status = Column(String)
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


class BuildingCodeCheck(Base):
    __tablename__ = "building_code_checks"
    id = Column(Integer, primary_key=True, index=True)
    lot_area_sqm = Column(Float, default=0)
    lot_type = Column(String, default="Inside")
    zoning = Column(String, default="R1")
    result_summary = Column(Text)
    warnings_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class TileGridEstimate(Base):
    __tablename__ = "tile_grid_estimates"
    id = Column(Integer, primary_key=True, index=True)
    room_shape = Column(String, default="Rectangle")
    tile_pattern = Column(String, default="Straight grid")
    tile_summary = Column(Text)
    material_summary = Column(Text)
    warnings_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class MaterialCostItem(Base):
    __tablename__ = "material_cost_items"
    id = Column(Integer, primary_key=True, index=True)
    material_name = Column(String, index=True)
    unit = Column(String)
    price_php = Column(Float, default=0)
    source = Column(String, default="Manual estimate")
    location = Column(String, default="Philippines")
    last_updated = Column(DateTime, default=datetime.utcnow)


def seed_db_defaults(db_session):
    """
    Utility seed function to bootstrap categories and standard precomputed CAD assets 
    into the database upon initial startup.
    """
    # 1. Create default categories
    categories_dict = {
        "Furniture": Category(name="Architectural Furniture (A-FURN)"),
        "DoorsWindows": Category(name="Doors & Windows (A-DOOR)"),
        "Landscape": Category(name="Landscape & Figures (A-LNDS)"),
        "Annotations": Category(name="Annotations & Symbols (A-ANNO)")
    }

    # Query existing before creating
    existing_cats = db_session.query(Category).all()
    if not existing_cats:
        for cat in categories_dict.values():
            db_session.add(cat)
        db_session.commit()
    else:
        # Load existing into our mapping dictionary
        for c in existing_cats:
            for key, val in categories_dict.items():
                if val.name == c.name:
                    categories_dict[key] = c

    # 2. Check and seed CAD Assets if base table empty
    existing_assets = db_session.query(Asset).all()
    if not existing_assets:
        default_assets = [
            # Furniture
            Asset(
                name="Barcelona Pavilion Chair (Top View)",
                description="Classic Mies van der Rohe design lounge chair block in plan view, featuring detailed steel frame and tufted cushion outlines.",
                file_link="arch_barcelona_chair_top.dwg",
                phash="3c3c7e7e7e7e3c3c",
                category_id=categories_dict["Furniture"].id
            ),
            Asset(
                name="Sectional Sofa 3-Seater (Plan View)",
                description="Aesthetic residential sectional custom sofa block incorporating deep cushion seam accents and soft armrests outlines.",
                file_link="arch_sofa_3seater_plan.dwg",
                phash="ffe7e7e7e7e7e7ff",
                category_id=categories_dict["Furniture"].id
            ),
            # Doors
            Asset(
                name="Single Interior Door 900mm (Plan View)",
                description="Standard 900mm interior single wood door swing block with clear 1/4 circular arc trajectory and frame timber profiles.",
                file_link="arch_door_900_plan.dwg",
                phash="f0f0c0c0e0e0f0f0",
                category_id=categories_dict["DoorsWindows"].id
            ),
            Asset(
                name="Double Slide Patio Door 2400mm (Plan View)",
                description="Double glazed sliding glass exterior deck door block with nested weatherstripping rails and directional slide arrows.",
                file_link="arch_sliding_patio_2400.dwg",
                phash="ff00ff00ff00ff00",
                category_id=categories_dict["DoorsWindows"].id
            ),
            # Landscape
            Asset(
                name="Deciduous Foliage Canopy Tree (Plan View)",
                description="Elegant organic-style canopy plant block for exterior site layouts, urban plans, and landscape spatial arrangements.",
                file_link="arch_tree_canopy_plan.dwg",
                phash="3c7ebdffff7e3c00",
                category_id=categories_dict["Landscape"].id
            ),
            Asset(
                name="Human Scale Architectural Silhouette (Elevation)",
                description="Aesthetic minimalist walking architectural graphic scale figure to establish height reference in perspective section cuts.",
                file_link="arch_human_scale_elevation.dwg",
                phash="1c3c3c7e7e3c1c1c",
                category_id=categories_dict["Landscape"].id
            ),
            # Annotations
            Asset(
                name="Modernist Architectural North Arrow (Plan)",
                description="Precision architectural compass North Arrow indicator matching official drafting layouts with high-contrast shaded quadrant.",
                file_link="arch_north_arrow_minimal.dwg",
                phash="183c7effffff3c18",
                category_id=categories_dict["Annotations"].id
            ),
            Asset(
                name="Detail Section Elevation Target Marker",
                description="Standard crosshair elevation height target symbol for sections with alternating filled contrast quarter quadrants.",
                file_link="arch_height_benchmark.dwg",
                phash="aa55aa55aa55aa55",
                category_id=categories_dict["Annotations"].id
            )
        ]
        for asset in default_assets:
            db_session.add(asset)
        db_session.commit()
        print("Database seed completed successfully with standard architectural companion components.")
