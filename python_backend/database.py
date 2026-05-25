from sqlalchemy import create_engine, Column, Integer, String, Text, ForeignKey
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
