import sys
import os

# Add current directory to Python path to enable package imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import custom data processors
from processors.total_count_processor import TotalCountProcessor
from processors.demo_age_processor import AgeProcessor
from processors.demo_sex_processor import LegalSexProcessor
from processors.diago_disease_processor import DiseaseProcessor
from processors.demo_race_processor import RaceProcessor  

# Define exact file paths for data input
csv_demo = '/Users/choih2/Documents/GitHub/Nuspar_Global_Ingest_System_test_5/Data/Output/All/Demographic/Demographic_combined.csv'
csv_diagnosis = '/Users/choih2/Documents/GitHub/Nuspar_Global_Ingest_System_test_5/Data/Output/All/Diagnosis/Diagnosis_combined.csv'

# Define the directory for saving output JSON files
saving_path = '/Users/choih2/Library/CloudStorage/OneDrive-Cedars-SinaiHealthSystem/FromBox/Flu_VE_dashboard/Flu_VE_dashboard/backend/NUSPAR_Dashboard_DataPipeline/output'


# Process Total Unique Patients Count
total_processor = TotalCountProcessor(csv_demo, saving_path)
total_processor.extract_organization()
total_processor.calculate_unique_patients()
total_distribution = total_processor.generate_distribution()
total_processor.save_json(total_distribution, 'NUSPAR_total_patients_distribution.json')

# Process Age Distribution
age_processor = AgeProcessor(csv_demo, saving_path)
age_processor.extract_organization()
age_processor.calculate_age()
age_distribution = age_processor.generate_distribution()
age_processor.save_json(age_distribution, 'NUSPAR_age_group_distribution.json')

# Process Legal Sex Distribution
sex_processor = LegalSexProcessor(csv_demo, saving_path)
sex_processor.extract_organization()
legal_sex_distribution = sex_processor.generate_distribution()
sex_processor.save_json(legal_sex_distribution, 'NUSPAR_legal_sex_distribution.json')

# Process Disease Distribution
disease_processor = DiseaseProcessor(csv_diagnosis, saving_path)
disease_processor.extract_organization()
disease_processor.map_disease_names()
disease_distribution = disease_processor.generate_distribution()
disease_processor.save_json(disease_distribution, 'NUSPAR_disease_distribution.json')

# Process Race Distribution (additional)
race_processor = RaceProcessor(csv_demo, saving_path)
race_processor.extract_organization()
race_distribution = race_processor.generate_distribution()
race_processor.save_json(race_distribution, 'NUSPAR_race_distribution.json')
