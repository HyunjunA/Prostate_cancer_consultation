from .base_processor import BaseProcessor  # Assuming BaseProcessor is in the same directory


class DiseaseProcessor(BaseProcessor):
    disease_class_mapping = {
        10: "Acromegaly",
        20: "Cushing Disease",
        30: "Prolactinoma",
        40: "TSHoma",
        45: "LH/FSH-oma",
        50: "Non-Functioning Adenoma"
    }

    def map_disease_names(self, disease_column='diagnosis_disease_class'):
        self.df['disease_name'] = self.df[disease_column].map(self.disease_class_mapping)

    def generate_distribution(self):
        diseases = list(self.disease_class_mapping.values())
        distribution = {"ALL": self.get_group_counts(self.df, 'disease_name', diseases)}

        for org in self.df['organization'].unique():
            if org != 'Unknown':
                org_df = self.df[self.df['organization'] == org]
                distribution[org] = self.get_group_counts(org_df, 'disease_name', diseases)

        return distribution

    def get_group_counts(self, df, column, categories):
        counts = df[column].value_counts()
        total = counts.sum()
        return [
            {
                "category": category,
                "count": int(counts.get(category, 0)),
                "percentage": round((counts.get(category, 0) / total) * 100, 1) if total else 0
            } for category in categories
        ]
