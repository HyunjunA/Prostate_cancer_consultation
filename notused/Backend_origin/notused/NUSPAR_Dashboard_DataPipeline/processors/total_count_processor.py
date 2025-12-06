from datetime import datetime
import pandas as pd
from .base_processor import BaseProcessor

class TotalCountProcessor(BaseProcessor):
    def calculate_unique_patients(self):
        """Calculate total unique patients using patient_record_id"""
        # Check if patient_record_id column exists
        if 'patient_record_id' not in self.df.columns:
            raise ValueError("'patient_record_id' column not found in DataFrame")
        
        # Remove any rows where patient_record_id is null or empty
        self.df = self.df[self.df['patient_record_id'].notna()]
        
    def generate_distribution(self):
        """Generate unique patients count distribution by organization"""
        # Get total unique patients across all organizations
        total_unique_patients = self.df['patient_record_id'].nunique()
        
        # Initialize distribution with ALL
        distribution = {
            "ALL": {
                "unique_patients": int(total_unique_patients)
            }
        }
        
        # Calculate unique patients per organization
        for org in self.df['organization'].unique():
            if org != 'Unknown' and pd.notna(org):
                org_df = self.df[self.df['organization'] == org]
                org_unique_patients = org_df['patient_record_id'].nunique()
                
                # Add organization entry
                distribution[org] = {
                    "unique_patients": int(org_unique_patients)
                }
        
        return distribution