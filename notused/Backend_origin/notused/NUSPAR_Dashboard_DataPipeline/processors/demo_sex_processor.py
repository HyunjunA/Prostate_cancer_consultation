
from .base_processor import BaseProcessor  # Assuming BaseProcessor is in the same directory


class LegalSexProcessor(BaseProcessor):
    def generate_distribution(self, sex_column='demo_legal_sex'):
        distribution = {"ALL": self.get_group_counts(self.df, sex_column)}

        for org in self.df['organization'].unique():
            if org != 'Unknown':
                org_df = self.df[self.df['organization'] == org]
                distribution[org] = self.get_group_counts(org_df, sex_column)

        return distribution

    def get_group_counts(self, df, column):
        counts = df[column].value_counts()
        total = counts.sum()
        return [
            {
                "category": str(category),
                "count": int(count),
                "percentage": round((count / total) * 100, 1) if total else 0
            } for category, count in counts.items()
        ]
