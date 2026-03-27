# #!/usr/bin/env python3
# """
# Async database initialization and CSV data migration script
# """
# import os
# import asyncio
# import pandas as pd
# from dotenv import load_dotenv

# from sqlalchemy import select, text
# from sqlalchemy.exc import SQLAlchemyError, IntegrityError
# from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

# from models import Base, Study

# # ---------------------------
# # Helpers
# # ---------------------------

# def normalize_string(value):
#     if pd.isna(value):
#         return None
#     s = str(value).strip()
#     return s if s != "" else None

# def normalize_bool(value):
#     if pd.isna(value):
#         return None
#     s = str(value).strip().lower()
#     if s in {"yes", "y", "true", "1"}:
#         return True
#     if s in {"no", "n", "false", "0"}:
#         return False
#     return None

# def get_field_mappings():
#     return {
#         'covidence_id': 'CovidenceID',
#         'pmid': 'PMID',
#         'study_id': 'Study ID',
#         'title': 'Title',
#         'publication_year': 'publication.year',
#         'study_location_1': 'Study.location.1',
#         'study_location_2': 'Study.location.2',
#         'number_of_samples_sequenced': 'Number.of.samples.sequenced',
#         'repository': 'Repository',
#         'sequence_ids_reported': 'Sequence.IDs.reported',
#         'sequence_id_article_location': 'SequenceID.article.location',
#         'age_reported': 'Age',
#         'gender_reported': 'Gender',
#         'race_ethnicity_nationality_reported': 'Race.Ethnicity.Nationality',
#         'demographic_article_location': 'demographic.article.location',
#         'comorbidities_reported': 'Comorbilities',
#         'inpatient_outpatient_reported': 'Inpatient/Outpatient',
#         'outcomes_reported': 'Outcomes',
#         'severity_reported': 'Severity',
#         'signs_symptoms_reported': 'Signs/Symptoms',
#         'treatment_reported': 'Treatment',
#         'vaccination_status_reported': 'Vaccination status',
#         'clinical_article_location': 'clinical.article.location'
#     }

# def get_field_value(row, csv_column, field_name):
#     value = row.get(csv_column, None)
#     if field_name in ('publication_year', 'number_of_samples_sequenced'):
#         if pd.notna(value) and str(value).strip():
#             s = str(value).strip()
#             try:
#                 return int(float(s)) if '.' in s else int(s)
#             except ValueError:
#                 if field_name == 'publication_year':
#                     print(f"Warning: Could not convert '{s}' to int for {field_name}")
#                 return None
#         return None
#     elif field_name.endswith('_reported'):
#         return normalize_bool(value)
#     else:
#         return normalize_string(value)

# # ---------------------------
# # Async DB init & migration
# # ---------------------------

# async def init_database():
#     load_dotenv()

#     DATABASE_URL = os.getenv("DATABASE_URL")
#     if not DATABASE_URL or "+asyncpg" not in DATABASE_URL:
#         raise ValueError("DATABASE_URL must be postgresql+asyncpg://...")

#     print(f"Connecting to database: {DATABASE_URL.split('@')[0]}@***")

#     engine = create_async_engine(
#         DATABASE_URL,
#         pool_pre_ping=True,
#         pool_size=int(os.getenv("DATABASE_POOL_SIZE", 10)),
#         max_overflow=int(os.getenv("DATABASE_MAX_OVERFLOW", 20)),
#         pool_timeout=int(os.getenv("DATABASE_POOL_TIMEOUT", 30)),
#         pool_recycle=int(os.getenv("DATABASE_POOL_RECYCLE", 1800)),
#         pool_use_lifo=os.getenv("DATABASE_POOL_USE_LIFO", "true").lower() == "true",
#         echo=os.getenv("SQL_ECHO", "false").lower() == "true",
#     )
#     Session = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)

#     # test connection
#     async with engine.connect() as conn:
#         await conn.execute(text("SELECT 1"))
#     print("✅ Database connection successful!")

#     # create tables
#     print("Creating database tables...")
#     async with engine.begin() as conn:
#         await conn.run_sync(Base.metadata.create_all)
#     print("✅ Database tables created successfully!")

#     return engine, Session

# async def migrate_csv_data(csv_file_path: str, Session: async_sessionmaker):
#     if not os.path.exists(csv_file_path):
#         print(f"WARNING: CSV file not found: {csv_file_path}")
#         print("Skipping CSV data migration.")
#         return

#     print(f"Reading CSV file: {csv_file_path}")
#     df = pd.read_csv(csv_file_path)
#     print(f"✅ Found {len(df)} records in CSV")

#     print("CSV columns:")
#     preview_cols = list(df.columns[:10])
#     for col in preview_cols:
#         print(f"  - {col}")
#     if len(df.columns) > 10:
#         print(f"  ... and {len(df.columns) - 10} more columns")

#     mappings = get_field_mappings()

#     created_count = 0
#     updated_count = 0
#     error_count = 0

#     async with Session() as session:
#         for index, row in df.iterrows():
#             try:
#                 covidence_id = normalize_string(row.get('CovidenceID', None))
#                 existing = None
#                 if covidence_id is not None:
#                     result = await session.execute(
#                         select(Study).where(Study.covidence_id == covidence_id).limit(1)
#                     )
#                     existing = result.scalars().first()

#                 if existing:
#                     for field_name, csv_column in mappings.items():
#                         value = get_field_value(row, csv_column, field_name)
#                         setattr(existing, field_name, value)
#                     updated_count += 1
#                     if updated_count % 50 == 0:
#                         print(f"Updated {updated_count} records...")
#                 else:
#                     study_data = {fn: get_field_value(row, col, fn) for fn, col in mappings.items()}
#                     study_data['covidence_id'] = covidence_id
#                     session.add(Study(**study_data))
#                     created_count += 1
#                     if created_count % 50 == 0:
#                         print(f"Created {created_count} records...")

#                 if (created_count + updated_count) % 200 == 0:
#                     await session.commit()

#             except (IntegrityError, SQLAlchemyError, Exception) as e:
#                 error_count += 1
#                 await session.rollback()
#                 print(f"Error processing row {index}: {str(e)}")
#                 continue

#         await session.commit()

#     print(f"✅ Migration completed! Created: {created_count}, Updated: {updated_count}, Errors: {error_count}")

# async def main():
#     print("🚀 Starting database initialization...")
#     engine, Session = await init_database()
#     await migrate_csv_data("Processed_Data_DB.csv", Session)
#     await engine.dispose()
#     print("✅ Database initialization completed successfully!")

# if __name__ == "__main__":
#     try:
#         asyncio.run(main())
#     except Exception as e:
#         print(f"\n❌ Script failed: {str(e)}")
#         print("\nTroubleshooting steps:")
#         print("1. Make sure PostgreSQL is running")
#         print("2. Check your DATABASE_URL environment variable (must be postgresql+asyncpg://)")
#         print("3. Verify database credentials and permissions")
#         print("4. Ensure the database exists")
#         raise




#!/usr/bin/env python3
"""
Async database initialization and CSV data migration script
For Doctor and Patient Interface tables
"""
import os
import asyncio
import pandas as pd
from datetime import datetime, timezone
from dotenv import load_dotenv

from sqlalchemy import select, text, inspect
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from models import (
    Base,
    DoctorSentenceView,
    DoctorRewriteLog,
    PatientSummary,
    PatientSummaryScoring,
    PatientResponses,
    SentencePrediction,
    TranscriptAnalysisLog,
    UserInteractionLog,
)
# Auth models share the same Base — import so create_all picks them up
from auth.models import AuthUser, AuthAPIKey, PatientAccess  # noqa: F401

# ---------------------------
# Helpers
# ---------------------------

def normalize_string(value):
    """Convert value to string, return None for empty/NaN"""
    if pd.isna(value):
        return None
    s = str(value).strip()
    return s if s != "" else None

def normalize_float(value):
    """Convert value to float, return None for empty/NaN"""
    if pd.isna(value):
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None

def normalize_int(value):
    """Convert value to int, return None for empty/NaN"""
    if pd.isna(value):
        return None
    try:
        # Handle float strings like "3.0"
        return int(float(value))
    except (ValueError, TypeError):
        return None

def normalize_bool(value):
    """Convert value to boolean"""
    if pd.isna(value):
        return False
    if isinstance(value, bool):
        return value
    s = str(value).strip().lower()
    if s in {"yes", "y", "true", "1", "t"}:
        return True
    if s in {"no", "n", "false", "0", "f"}:
        return False
    return False

def normalize_timestamp(value):
    """Convert value to datetime with UTC timezone"""
    if pd.isna(value):
        return None
    if isinstance(value, datetime):
        # Add timezone if naive
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    try:
        dt = pd.to_datetime(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except:
        return None

def read_csv_with_encoding(csv_file_path: str) -> pd.DataFrame:
    """Try reading CSV with different encodings"""
    encodings_to_try = ['utf-8', 'cp1252', 'latin-1', 'iso-8859-1', 'utf-16']
    
    for encoding in encodings_to_try:
        try:
            df = pd.read_csv(csv_file_path, encoding=encoding)
            print(f"   ✓ Successfully read with {encoding} encoding")
            return df
        except UnicodeDecodeError:
            continue
        except Exception as e:
            print(f"   ⚠️  Error with {encoding}: {str(e)}")
            continue
    
    raise ValueError(f"Failed to read CSV with any supported encoding")

# ---------------------------
# Schema validation and migration
# ---------------------------

async def check_and_recreate_tables_if_needed(engine):
    """Check if tables need to be recreated due to schema changes"""
    print("\n🔍 Checking database schema...")
    
    async with engine.connect() as conn:
        # Check if tables exist and have correct schema
        def check_table_schema(connection):
            inspector = inspect(connection)
            tables_to_recreate = []
            
            # Check doctor_sentence_view
            if 'doctor_sentence_view' in inspector.get_table_names():
                columns = {col['name'] for col in inspector.get_columns('doctor_sentence_view')}
                if 'sentence' not in columns:
                    print("   ⚠️  Table 'doctor_sentence_view' exists but missing 'sentence' column")
                    tables_to_recreate.append('doctor_sentence_view')
            
            # Check doctor_rewrite_log
            if 'doctor_rewrite_log' in inspector.get_table_names():
                columns = {col['name'] for col in inspector.get_columns('doctor_rewrite_log')}
                if 'original_score' not in columns:
                    print("   ⚠️  Table 'doctor_rewrite_log' exists but missing 'original_score' column")
                    tables_to_recreate.append('doctor_rewrite_log')
            
            return len(tables_to_recreate) == 0, tables_to_recreate
        
        schema_ok, tables_to_recreate = await conn.run_sync(check_table_schema)
        
        if not schema_ok:
            print(f"   🔄 Schema mismatch detected in tables: {tables_to_recreate}")
            print("   🔄 Dropping and recreating ALL tables for consistency...")
            
            # Drop all tables in correct order (respecting foreign keys)
            await conn.execute(text("DROP TABLE IF EXISTS doctor_rewrite_log CASCADE"))
            await conn.execute(text("DROP TABLE IF EXISTS doctor_sentence_view CASCADE"))
            await conn.execute(text("DROP TABLE IF EXISTS patient_responses CASCADE"))
            await conn.execute(text("DROP TABLE IF EXISTS patient_summary_scoring CASCADE"))
            await conn.execute(text("DROP TABLE IF EXISTS patient_summary CASCADE"))
            await conn.commit()
            
            print("   ✅ Old tables dropped successfully")
            return False
        else:
            print("   ✅ Schema is up to date")
            return True

# ---------------------------
# Async DB init
# ---------------------------

async def init_database():
    """Initialize database connection and create tables"""
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

    # Test connection
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    print("✅ Database connection successful!")

    # Check and recreate tables if needed
    await check_and_recreate_tables_if_needed(engine)

    # Add 'role' column to user_interaction_log if it doesn't exist
    async with engine.begin() as conn:
        result = await conn.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'user_interaction_log' AND column_name = 'role'"
        ))
        if result.fetchone() is None:
            await conn.execute(text(
                "ALTER TABLE user_interaction_log "
                "ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'patient'"
            ))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_user_interaction_log_role "
                "ON user_interaction_log (role)"
            ))
            print("   ✅ Added 'role' column to user_interaction_log")

    # Create tables (will only create if they don't exist)
    print("Creating database tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅ Database tables created successfully!")

    return engine, Session

# ---------------------------
# CSV Migration Functions
# ---------------------------

async def migrate_doctor_render(csv_file_path: str, Session: async_sessionmaker):
    """Migrate docter_interface_render.csv"""
    if not os.path.exists(csv_file_path):
        print(f"⚠️  CSV file not found: {csv_file_path}")
        return 0, 0
    
    print(f"\n📊 Processing: {csv_file_path}")
    
    try:
        df = read_csv_with_encoding(csv_file_path)
        df.columns = [col.lower().strip() for col in df.columns]
    except Exception as e:
        print(f"   ❌ Failed to read CSV: {str(e)}")
        return 0, 1
    
    print(f"   Found {len(df)} records")
    print(f"   Columns: {list(df.columns)}")
    
    # Check for sentence/sentences column
    has_sentence = 'sentence' in df.columns
    has_sentences = 'sentences' in df.columns
    print(f"   📌 Has 'sentence' column: {has_sentence}")
    print(f"   📌 Has 'sentences' column: {has_sentences}")
    
    created_count = 0
    error_count = 0
    
    async with Session() as session:
        for index, row in df.iterrows():
            try:
                # Use 'sentences' column (as per CSV)
                sentence_value = normalize_string(row.get('sentences')) or normalize_string(row.get('sentence'))
                
                record = DoctorSentenceView(
                    file=normalize_string(row.get('file')),
                    i=normalize_int(row.get('i')),
                    i2=normalize_int(row.get('i2')),
                    speaker=normalize_string(row.get('speaker')),
                    sentence=sentence_value,
                    score=normalize_float(row.get('score')),
                    class_=normalize_string(row.get('class')),
                    time=normalize_timestamp(row.get('time'))
                )
                session.add(record)
                created_count += 1
                
                if created_count % 100 == 0:
                    await session.commit()
                    print(f"   ✓ Committed {created_count} records...")
                    
            except IntegrityError as e:
                error_count += 1
                await session.rollback()
                print(f"   ⚠️  IntegrityError at row {index}: Primary key conflict")
                continue
            except Exception as e:
                error_count += 1
                await session.rollback()
                print(f"   ⚠️  Error at row {index}: {str(e)}")
                continue
        
        await session.commit()
    
    print(f"   ✅ Created: {created_count}, Errors: {error_count}")
    return created_count, error_count

async def migrate_doctor_rewriting_history(csv_file_path: str, Session: async_sessionmaker):
    """Migrate docter_interface_ai_rewriting_history.csv"""
    if not os.path.exists(csv_file_path):
        print(f"⚠️  CSV file not found: {csv_file_path}")
        return 0, 0
    
    print(f"\n📊 Processing: {csv_file_path}")
    
    try:
        df = read_csv_with_encoding(csv_file_path)
        df.columns = [col.lower().strip() for col in df.columns]
    except Exception as e:
        print(f"   ❌ Failed to read CSV: {str(e)}")
        return 0, 1
    
    print(f"   Found {len(df)} records")
    print(f"   Columns: {list(df.columns)}")
    
    # Debug: Show first 3 rows
    print(f"\n   📋 Sample data (first 3 rows):")
    for idx, row in df.head(3).iterrows():
        print(f"      Row {idx}:")
        print(f"        file: {row.get('file')}")
        print(f"        i: {row.get('i')}")
        print(f"        i2: {row.get('i2')}")
        print(f"        speaker: {row.get('speaker')}")
        print(f"        original_sentence: {row.get('original_sentence')}")
        print(f"        original_score: {row.get('original_score')}")
        print(f"        revised_sentence: {row.get('revised_sentence')}")
        print(f"        score: {row.get('score')}")
        print(f"        class: {row.get('class')}")
        print(f"        selected: {row.get('selected')}")
        print()
    
    created_count = 0
    error_count = 0
    
    async with Session() as session:
        for index, row in df.iterrows():
            try:
                # Time handling with timezone
                time_value = normalize_timestamp(row.get('time'))
                if time_value is None:
                    time_value = datetime.now(timezone.utc)
                
                record = DoctorRewriteLog(
                    file=normalize_string(row.get('file')),
                    i=normalize_int(row.get('i')),
                    i2=normalize_int(row.get('i2')),
                    speaker=normalize_string(row.get('speaker')),
                    time=time_value,
                    original_sentence=normalize_string(row.get('original_sentence')),
                    original_score=normalize_float(row.get('original_score')),
                    revised_sentence=normalize_string(row.get('revised_sentence')),
                    score=normalize_float(row.get('score')),
                    class_=normalize_string(row.get('class')),
                    selected=normalize_bool(row.get('selected'))
                )
                session.add(record)
                created_count += 1
                
                if created_count % 100 == 0:
                    await session.commit()
                    print(f"   ✓ Committed {created_count} records...")
                    
            except IntegrityError as e:
                error_count += 1
                await session.rollback()
                print(f"   ⚠️  IntegrityError at row {index}: Primary key conflict")
                print(f"       Data: file={row.get('file')}, i={row.get('i')}, i2={row.get('i2')}, time={row.get('time')}")
                continue
            except Exception as e:
                error_count += 1
                await session.rollback()
                print(f"   ⚠️  Error at row {index}: {str(e)}")
                print(f"       Data: file={row.get('file')}, i={row.get('i')}, i2={row.get('i2')}")
                continue
        
        await session.commit()
    
    print(f"   ✅ Created: {created_count}, Errors: {error_count}")
    return created_count, error_count

async def migrate_patient_class_summary(csv_file_path: str, Session: async_sessionmaker):
    """Migrate Patient_interface_class_summary.csv"""
    if not os.path.exists(csv_file_path):
        print(f"⚠️  CSV file not found: {csv_file_path}")
        return 0, 0
    
    print(f"\n📊 Processing: {csv_file_path}")
    
    try:
        df = read_csv_with_encoding(csv_file_path)
        df.columns = [col.lower().strip() for col in df.columns]
    except Exception as e:
        print(f"   ❌ Failed to read CSV: {str(e)}")
        return 0, 1
    
    print(f"   Found {len(df)} records")
    print(f"   Columns: {list(df.columns)}")
    
    created_count = 0
    error_count = 0
    
    async with Session() as session:
        for index, row in df.iterrows():
            try:
                record = PatientSummary(
                    file=normalize_string(row.get('file')),
                    speaker=normalize_string(row.get('speaker')),
                    entire_summary=normalize_string(row.get('entire_summary')),
                    class_1=normalize_string(row.get('class_1')),
                    summary_class_1=normalize_string(row.get('summary_class_1')),
                    class_2=normalize_string(row.get('class_2')),
                    summary_class_2=normalize_string(row.get('summary_class_2')),
                    class_3=normalize_string(row.get('class_3')),
                    summary_class_3=normalize_string(row.get('summary_class_3')),
                    class_4=normalize_string(row.get('class_4')),
                    summary_class_4=normalize_string(row.get('summary_class_4')),
                    class_5=normalize_string(row.get('class_5')),
                    summary_class_5=normalize_string(row.get('summary_class_5'))
                )
                session.add(record)
                created_count += 1
                
                if created_count % 100 == 0:
                    await session.commit()
                    print(f"   ✓ Committed {created_count} records...")
                    
            except IntegrityError as e:
                error_count += 1
                await session.rollback()
                print(f"   ⚠️  IntegrityError at row {index}: Primary key conflict")
                continue
            except Exception as e:
                error_count += 1
                await session.rollback()
                print(f"   ⚠️  Error at row {index}: {str(e)}")
                continue
        
        await session.commit()
    
    print(f"   ✅ Created: {created_count}, Errors: {error_count}")
    return created_count, error_count

async def migrate_patient_class_summary_scoring(csv_file_path: str, Session: async_sessionmaker):
    """Migrate Patient_interface_class_summary_scoring.csv"""
    if not os.path.exists(csv_file_path):
        print(f"⚠️  CSV file not found: {csv_file_path}")
        return 0, 0
    
    print(f"\n📊 Processing: {csv_file_path}")
    
    try:
        df = read_csv_with_encoding(csv_file_path)
        df.columns = [col.lower().strip() for col in df.columns]
    except Exception as e:
        print(f"   ❌ Failed to read CSV: {str(e)}")
        return 0, 1
    
    print(f"   Found {len(df)} records")
    print(f"   Columns: {list(df.columns)}")
    
    created_count = 0
    error_count = 0
    
    async with Session() as session:
        for index, row in df.iterrows():
            try:
                record = PatientSummaryScoring(
                    file=normalize_string(row.get('file')),
                    speaker=normalize_string(row.get('speaker')),
                    class_1_patient_scoring=normalize_int(row.get('class_1_patient_scoring')),
                    class_2_patient_scoring=normalize_int(row.get('class_2_patient_scoring')),
                    class_3_patient_scoring=normalize_int(row.get('class_3_patient_scoring')),
                    class_4_patient_scoring=normalize_int(row.get('class_4_patient_scoring')),
                    class_5_patient_scoring=normalize_int(row.get('class_5_patient_scoring'))
                )
                session.add(record)
                created_count += 1
                
                if created_count % 100 == 0:
                    await session.commit()
                    print(f"   ✓ Committed {created_count} records...")
                    
            except IntegrityError as e:
                error_count += 1
                await session.rollback()
                print(f"   ⚠️  IntegrityError at row {index}: Primary key conflict")
                continue
            except Exception as e:
                error_count += 1
                await session.rollback()
                print(f"   ⚠️  Error at row {index}: {str(e)}")
                continue
        
        await session.commit()
    
    print(f"   ✅ Created: {created_count}, Errors: {error_count}")
    return created_count, error_count

async def migrate_patient_questions_responses(csv_file_path: str, Session: async_sessionmaker):
    """Migrate Patient_interface_questions_responses.csv"""
    if not os.path.exists(csv_file_path):
        print(f"⚠️  CSV file not found: {csv_file_path}")
        return 0, 0
    
    print(f"\n📊 Processing: {csv_file_path}")
    
    try:
        df = read_csv_with_encoding(csv_file_path)
        df.columns = [col.lower().strip() for col in df.columns]
    except Exception as e:
        print(f"   ❌ Failed to read CSV: {str(e)}")
        return 0, 1
    
    print(f"   Found {len(df)} records")
    print(f"   Columns: {list(df.columns)}")
    
    created_count = 0
    error_count = 0
    
    async with Session() as session:
        for index, row in df.iterrows():
            try:
                record = PatientResponses(
                    file=normalize_string(row.get('file')),
                    speaker=normalize_string(row.get('speaker')),
                    answer_1=normalize_string(row.get('answer_1')),
                    answer_2=normalize_string(row.get('answer_2')),
                    answer_3=normalize_string(row.get('answer_3')),
                    answer_4=normalize_string(row.get('answer_4')),
                    answer_5=normalize_string(row.get('answer_5'))
                )
                session.add(record)
                created_count += 1
                
                if created_count % 100 == 0:
                    await session.commit()
                    print(f"   ✓ Committed {created_count} records...")
                    
            except IntegrityError as e:
                error_count += 1
                await session.rollback()
                print(f"   ⚠️  IntegrityError at row {index}: Primary key conflict")
                continue
            except Exception as e:
                error_count += 1
                await session.rollback()
                print(f"   ⚠️  Error at row {index}: {str(e)}")
                continue
        
        await session.commit()
    
    print(f"   ✅ Created: {created_count}, Errors: {error_count}")
    return created_count, error_count

async def migrate_transcript_analysis_log(csv_file_path: str, Session: async_sessionmaker):
    """Migrate transcript_analysis_log.csv (pipeline analysis run records)"""
    if not os.path.exists(csv_file_path):
        print(f"⚠️  CSV file not found: {csv_file_path}")
        return 0, 0

    print(f"\n📊 Processing: {csv_file_path}")

    try:
        df = read_csv_with_encoding(csv_file_path)
        df.columns = [col.lower().strip() for col in df.columns]
    except Exception as e:
        print(f"   ❌ Failed to read CSV: {str(e)}")
        return 0, 1

    print(f"   Found {len(df)} records")
    print(f"   Columns: {list(df.columns)}")

    created_count = 0
    error_count = 0

    async with Session() as session:
        for index, row in df.iterrows():
            try:
                record = TranscriptAnalysisLog(
                    patient_id=normalize_string(row.get('patient_id')),
                    total_sentences=normalize_int(row.get('total_sentences')) or 0,
                    top_n=normalize_int(row.get('top_n')) or 10,
                    context_window=normalize_int(row.get('context_window')) or 3,
                    source_filename=normalize_string(row.get('source_filename')),
                    analyzed_at=normalize_timestamp(row.get('analyzed_at')),
                )
                session.add(record)
                await session.flush()  # get auto-generated id
                created_count += 1

            except IntegrityError as e:
                error_count += 1
                await session.rollback()
                print(f"   ⚠️  IntegrityError at row {index}: {str(e)}")
                continue
            except Exception as e:
                error_count += 1
                await session.rollback()
                print(f"   ⚠️  Error at row {index}: {str(e)}")
                continue

        await session.commit()

    print(f"   ✅ Created: {created_count}, Errors: {error_count}")
    return created_count, error_count

async def migrate_sentence_prediction(csv_file_path: str, Session: async_sessionmaker):
    """Migrate sentence_prediction.csv (pipeline per-sentence NLP scores)"""
    if not os.path.exists(csv_file_path):
        print(f"⚠️  CSV file not found: {csv_file_path}")
        return 0, 0

    print(f"\n📊 Processing: {csv_file_path}")

    try:
        df = read_csv_with_encoding(csv_file_path)
        df.columns = [col.lower().strip() for col in df.columns]
    except Exception as e:
        print(f"   ❌ Failed to read CSV: {str(e)}")
        return 0, 1

    print(f"   Found {len(df)} records")
    print(f"   Columns: {list(df.columns)}")

    # We need analysis_id FK. Look up existing analysis runs by patient_id.
    # If transcript_analysis_log was loaded first, we can match by patient_id.
    analysis_id_cache: dict[str, int] = {}

    async with Session() as session:
        result = await session.execute(
            select(TranscriptAnalysisLog.id, TranscriptAnalysisLog.patient_id)
        )
        for row_id, pid in result.all():
            analysis_id_cache[pid] = row_id

    if not analysis_id_cache:
        print("   ⚠️  No transcript_analysis_log records found. Load transcript_analysis_log.csv first.")
        print("   ⚠️  Skipping sentence_prediction migration.")
        return 0, 0

    print(f"   📌 Found {len(analysis_id_cache)} analysis runs: {list(analysis_id_cache.keys())}")

    created_count = 0
    error_count = 0

    async with Session() as session:
        for index, row in df.iterrows():
            try:
                patient_id = normalize_string(row.get('patient_id'))
                analysis_id = analysis_id_cache.get(patient_id)

                if analysis_id is None:
                    error_count += 1
                    if error_count <= 3:
                        print(f"   ⚠️  No analysis_id for patient '{patient_id}' at row {index}")
                    continue

                record = SentencePrediction(
                    analysis_id=analysis_id,
                    patient_id=patient_id,
                    model=normalize_string(row.get('model')),
                    sentence_index=normalize_int(row.get('sentence_index')) or 0,
                    utterance_index=normalize_int(row.get('utterance_index')) or 0,
                    sentence_in_utterance=normalize_int(row.get('sentence_in_utterance')) or 0,
                    speaker=normalize_string(row.get('speaker')),
                    sentence_text=normalize_string(row.get('sentence_text')),
                    pred_score=normalize_float(row.get('pred_score')) or 0.0,
                    context=normalize_string(row.get('context')),
                )
                session.add(record)
                created_count += 1

                if created_count % 100 == 0:
                    await session.commit()
                    print(f"   ✓ Committed {created_count} records...")

            except IntegrityError as e:
                error_count += 1
                await session.rollback()
                print(f"   ⚠️  IntegrityError at row {index}")
                continue
            except Exception as e:
                error_count += 1
                await session.rollback()
                print(f"   ⚠️  Error at row {index}: {str(e)}")
                continue

        await session.commit()

    print(f"   ✅ Created: {created_count}, Errors: {error_count}")
    return created_count, error_count

# ---------------------------
# Main Migration
# ---------------------------

async def migrate_all_csv_files(data_dir: str, Session: async_sessionmaker):
    """Migrate all CSV files from the fake_csv_files directory"""

    print("\n" + "="*60)
    print("🚀 Starting CSV Data Migration")
    print("="*60)

    total_created = 0
    total_errors = 0

    # Define CSV files and their migration functions
    # NOTE: transcript_analysis_log must come BEFORE sentence_prediction (FK dependency)
    migrations = [
        ("docter_interface_render_processed.csv", migrate_doctor_render),
        ("docter_interface_ai_rewriting_history.csv", migrate_doctor_rewriting_history),
        ("Patient_interface_class_summary.csv", migrate_patient_class_summary),
        ("Patient_interface_class_summary_scoring.csv", migrate_patient_class_summary_scoring),
        ("Patient_interface_questions_responses.csv", migrate_patient_questions_responses),
        ("transcript_analysis_log.csv", migrate_transcript_analysis_log),
        ("sentence_prediction.csv", migrate_sentence_prediction),
    ]
    
    for csv_filename, migration_func in migrations:
        csv_path = os.path.join(data_dir, csv_filename)
        created, errors = await migration_func(csv_path, Session)
        total_created += created
        total_errors += errors
    
    print("\n" + "="*60)
    print("📈 Migration Summary")
    print("="*60)
    print(f"✅ Total records created: {total_created}")
    print(f"⚠️  Total errors: {total_errors}")
    print("="*60 + "\n")

# ---------------------------
# Single CSV Migration (for CLI --file usage)
# ---------------------------

# Map CSV filenames to their migration functions
CSV_MIGRATION_MAP = {
    "docter_interface_render_processed.csv": migrate_doctor_render,
    "docter_interface_render.csv": migrate_doctor_render,
    "docter_interface_ai_rewriting_history.csv": migrate_doctor_rewriting_history,
    "Patient_interface_class_summary.csv": migrate_patient_class_summary,
    "patient_interface_class_summary.csv": migrate_patient_class_summary,
    "Patient_interface_class_summary_scoring.csv": migrate_patient_class_summary_scoring,
    "patient_interface_class_summary_scoring.csv": migrate_patient_class_summary_scoring,
    "Patient_interface_questions_responses.csv": migrate_patient_questions_responses,
    "patient_interface_questions_responses.csv": migrate_patient_questions_responses,
    "transcript_analysis_log.csv": migrate_transcript_analysis_log,
    "sentence_prediction.csv": migrate_sentence_prediction,
}

async def migrate_single_csv(csv_path: str, Session: async_sessionmaker):
    """Migrate a single CSV file by matching its filename to a migration function."""
    filename = os.path.basename(csv_path).lower()

    # Find matching migration function
    migration_func = None
    for known_name, func in CSV_MIGRATION_MAP.items():
        if filename == known_name.lower():
            migration_func = func
            break

    if migration_func is None:
        print(f"❌ Unknown CSV file: {filename}")
        print(f"   Supported files: {', '.join(set(CSV_MIGRATION_MAP.keys()))}")
        return

    created, errors = await migration_func(csv_path, Session)
    print(f"\n📈 Result: Created={created}, Errors={errors}")

# ---------------------------
# Main
# ---------------------------

async def main():
    """Main execution function.

    Usage:
        python init_db.py                              # Full init + all CSVs
        python init_db.py --data-dir /path/to/csvs     # Full init with custom CSV dir
        python init_db.py --file path/to/specific.csv  # Load a single CSV only
        python init_db.py --skip-init --file ...       # Skip table creation, just load CSV
    """
    import argparse
    parser = argparse.ArgumentParser(description="Database initialization and CSV migration")
    parser.add_argument(
        "--data-dir",
        type=str,
        default=None,
        help="CSV data directory (default: CSV_DATA_DIR env or 'fake_csv_files')",
    )
    parser.add_argument(
        "--file",
        type=str,
        default=None,
        help="Load a single CSV file instead of all files",
    )
    parser.add_argument(
        "--skip-init",
        action="store_true",
        help="Skip database table creation (use when tables already exist)",
    )
    args = parser.parse_args()

    print("\n" + "="*60)
    print("🚀 Database Initialization Script")
    print("="*60 + "\n")

    # Initialize database
    engine, Session = await init_database()

    if args.file:
        # Single CSV mode
        csv_path = args.file
        if not os.path.exists(csv_path):
            print(f"❌ File not found: {csv_path}")
        else:
            await migrate_single_csv(csv_path, Session)
    else:
        # Full migration mode
        data_dir = args.data_dir or os.getenv("CSV_DATA_DIR", "fake_csv_files")
        await migrate_all_csv_files(data_dir, Session)

    # Cleanup
    await engine.dispose()

    print("\n" + "="*60)
    print("✅ Database initialization completed successfully!")
    print("="*60 + "\n")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        print(f"\n❌ Script failed: {str(e)}")
        print("\n" + "="*60)
        print("🔧 Troubleshooting steps:")
        print("="*60)
        print("1. Make sure PostgreSQL is running")
        print("2. Check your DATABASE_URL environment variable")
        print("   (must be postgresql+asyncpg://...)")
        print("3. Verify database credentials and permissions")
        print("4. Ensure the database exists")
        print("5. Check that CSV files exist in 'fake_csv_files' directory")
        print("6. Check CSV file encoding (script supports UTF-8, CP1252, Latin-1)")
        print("="*60 + "\n")
        raise