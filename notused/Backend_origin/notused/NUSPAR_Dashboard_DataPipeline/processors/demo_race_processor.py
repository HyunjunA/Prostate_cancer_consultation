from .base_processor import BaseProcessor
import pandas as pd

class RaceProcessor(BaseProcessor):
    def generate_distribution(self, race_column='demo_race'):
        distribution = {"ALL": self.get_group_counts(self.df, race_column)}

        for org in self.df['organization'].unique():
            if org != 'Unknown':
                org_df = self.df[self.df['organization'] == org]
                distribution[org] = self.get_group_counts(org_df, race_column)

        return distribution

    def get_group_counts(self, df, column):
        counts = df[column].value_counts()
        total = counts.sum()
        return [
            {
                "category": str(category),
                "count": int(count),
                "percentage": round((count / total * 100), 1) if total else 0
            } for category, count in counts.items() if pd.notna(category)
        ]
