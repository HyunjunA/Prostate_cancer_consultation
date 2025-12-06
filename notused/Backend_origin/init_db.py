#!/usr/bin/env python3
"""
Async database initialization and CSV data migration script
"""
import os
import asyncio
import pandas as pd
from dotenv import load_dotenv

from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from models import Base, Study

# ---------------------------
# Helpers
# ---------------------------

def normalize_string(value):
    if pd.isna(value):
        return None
    s = str(value).strip()
    return s if s != "" else None

def normalize_bool(value):
    if pd.isna(value):
        return None
    s = str(value).strip().lower()
    if s in {"yes", "y", "true", "1"}:
        return True
    if s in {"no", "n", "false", "0"}:
        return False
    return None

def get_field_mappings():
    return {
        'covidence_id': 'CovidenceID',
        'pmid': 'PMID',
        'study_id': 'Study ID',
        'title': 'Title',
        'publication_year': 'publication.year',
        'study_location_1': 'Study.location.1',
        'study_location_2': 'Study.location.2',
        'number_of_samples_sequenced': 'Number.of.samples.sequenced',
        'repository': 'Repository',
        'sequence_ids_reported': 'Sequence.IDs.reported',
        'sequence_id_article_location': 'SequenceID.article.location',
        'age_reported': 'Age',
        'gender_reported': 'Gender',
        'race_ethnicity_nationality_reported': 'Race.Ethnicity.Nationality',
        'demographic_article_location': 'demographic.article.location',
        'comorbidities_reported': 'Comorbilities',
        'inpatient_outpatient_reported': 'Inpatient/Outpatient',
        'outcomes_reported': 'Outcomes',
        'severity_reported': 'Severity',
        'signs_symptoms_reported': 'Signs/Symptoms',
        'treatment_reported': 'Treatment',
        'vaccination_status_reported': 'Vaccination status',
        'clinical_article_location': 'clinical.article.location'
    }

def get_field_value(row, csv_column, field_name):
    value = row.get(csv_column, None)
    if field_name in ('publication_year', 'number_of_samples_sequenced'):
        if pd.notna(value) and str(value).strip():
            s = str(value).strip()
            try:
                return int(float(s)) if '.' in s else int(s)
            except ValueError:
                if field_name == 'publication_year':
                    print(f"Warning: Could not convert '{s}' to int for {field_name}")
                return None
        return None
    elif field_name.endswith('_reported'):
        return normalize_bool(value)
    else:
        return normalize_string(value)

# ---------------------------
# Async DB init & migration
# ---------------------------

async def init_database():
    load_dotenv()

    DATABASE_URL = os.getenv("DATABASE_URL")
    if not DATABASE_URL or "+asyncpg" not in DATABASE_URL:
        raise ValueError("DATABASE_URL must be postgresql+asyncpg://...")

    print(f"Connecting to database: {DATABASE_URL.split('@')[0]}@***")

    engine = create_async_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_size=int(os.getenv("DATABASE_POOL_SIZE", 10)),
        max_overflow=int(os.getenv("DATABASE_MAX_OVERFLOW", 20)),
        pool_timeout=int(os.getenv("DATABASE_POOL_TIMEOUT", 30)),
        pool_recycle=int(os.getenv("DATABASE_POOL_RECYCLE", 1800)),
        pool_use_lifo=os.getenv("DATABASE_POOL_USE_LIFO", "true").lower() == "true",
        echo=os.getenv("SQL_ECHO", "false").lower() == "true",
    )
    Session = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)

    # test connection
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    print("✅ Database connection successful!")

    # create tables
    print("Creating database tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅ Database tables created successfully!")

    return engine, Session

async def migrate_csv_data(csv_file_path: str, Session: async_sessionmaker):
    if not os.path.exists(csv_file_path):
        print(f"WARNING: CSV file not found: {csv_file_path}")
        print("Skipping CSV data migration.")
        return

    print(f"Reading CSV file: {csv_file_path}")
    df = pd.read_csv(csv_file_path)
    print(f"✅ Found {len(df)} records in CSV")

    print("CSV columns:")
    preview_cols = list(df.columns[:10])
    for col in preview_cols:
        print(f"  - {col}")
    if len(df.columns) > 10:
        print(f"  ... and {len(df.columns) - 10} more columns")

    mappings = get_field_mappings()

    created_count = 0
    updated_count = 0
    error_count = 0

    async with Session() as session:
        for index, row in df.iterrows():
            try:
                covidence_id = normalize_string(row.get('CovidenceID', None))
                existing = None
                if covidence_id is not None:
                    result = await session.execute(
                        select(Study).where(Study.covidence_id == covidence_id).limit(1)
                    )
                    existing = result.scalars().first()

                if existing:
                    for field_name, csv_column in mappings.items():
                        value = get_field_value(row, csv_column, field_name)
                        setattr(existing, field_name, value)
                    updated_count += 1
                    if updated_count % 50 == 0:
                        print(f"Updated {updated_count} records...")
                else:
                    study_data = {fn: get_field_value(row, col, fn) for fn, col in mappings.items()}
                    study_data['covidence_id'] = covidence_id
                    session.add(Study(**study_data))
                    created_count += 1
                    if created_count % 50 == 0:
                        print(f"Created {created_count} records...")

                if (created_count + updated_count) % 200 == 0:
                    await session.commit()

            except (IntegrityError, SQLAlchemyError, Exception) as e:
                error_count += 1
                await session.rollback()
                print(f"Error processing row {index}: {str(e)}")
                continue

        await session.commit()

    print(f"✅ Migration completed! Created: {created_count}, Updated: {updated_count}, Errors: {error_count}")

async def main():
    print("🚀 Starting database initialization...")
    engine, Session = await init_database()
    await migrate_csv_data("Processed_Data_DB.csv", Session)
    await engine.dispose()
    print("✅ Database initialization completed successfully!")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        print(f"\n❌ Script failed: {str(e)}")
        print("\nTroubleshooting steps:")
        print("1. Make sure PostgreSQL is running")
        print("2. Check your DATABASE_URL environment variable (must be postgresql+asyncpg://)")
        print("3. Verify database credentials and permissions")
        print("4. Ensure the database exists")
        raise
