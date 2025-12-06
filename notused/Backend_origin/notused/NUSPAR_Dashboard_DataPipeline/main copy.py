# Example Python Script to illustrate data processing pipeline
# for demographic and diagnosis data in the NUSPAR Dashboard project.

# 1. Import Python libraries and custom classes
import sys
import os

# Add current directory to Python path for custom imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import custom processors (these handle specific data processing tasks)
from processors.demo_age_processor import AgeProcessor
from processors.demo_sex_processor import LegalSexProcessor
from processors.diago_disease_processor import DiseaseProcessor
from processors.demo_race_processor import RaceProcessor

# 2. Define input and output paths (replace with actual file paths)
csv_demo = 'path/to/Demographic_combined.csv'        # Your demographic data CSV file
csv_diagnosis = 'path/to/Diagnosis_combined.csv'     # Your diagnosis data CSV file
saving_path = './output'                             # Folder to save processed JSON data

# 3. Process and save Age Distribution data
age_processor = AgeProcessor(csv_demo, saving_path)
age_processor.extract_organization()                 # Extract organizations from patient IDs
age_processor.calculate_age()                        # Calculate age from date of birth
age_dist = age_processor.generate_distribution()     # Generate distribution data
age_processor.save_json(age_dist, 'age_distribution.json') # Save data to JSON

# 4. Process and save Legal Sex Distribution data
sex_processor = LegalSexProcessor(csv_demo, saving_path)
sex_processor.extract_organization()                 # Extract organizations from patient IDs
sex_dist = sex_processor.generate_distribution()     # Generate legal sex distribution
sex_processor.save_json(sex_dist, 'legal_sex_distribution.json') # Save data to JSON

# 5. Process and save Disease Distribution data
disease_processor = DiseaseProcessor(csv_diagnosis, saving_path)
disease_processor.extract_organization()             # Extract organizations from patient IDs
disease_processor.map_disease_names()                # Map disease codes to readable names
disease_dist = disease_processor.generate_distribution() # Generate disease distribution
disease_processor.save_json(disease_dist, 'disease_distribution.json') # Save data to JSON

# 6. Process and save Race Distribution data (additional example)
race_processor = RaceProcessor(csv_demo, saving_path)
race_processor.extract_organization()                # Extract organizations from patient IDs
race_dist = race_processor.generate_distribution()   # Generate race distribution
race_processor.save_json(race_dist, 'race_distribution.json') # Save data to JSON

# Note: This script demonstrates a clear, organized way of handling
# data processing pipelines with custom classes and structured methods.
# Replace the placeholder paths with actual file locations.
