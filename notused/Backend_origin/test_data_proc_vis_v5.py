import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime
import os
import json

if __name__ == '__main__':
    # Create output directories
    output_dir = "outputs"
    json_dir = os.path.join(output_dir, "json_data")
    image_dir = os.path.join(output_dir, "images")
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(json_dir, exist_ok=True)
    os.makedirs(image_dir, exist_ok=True)



    # Load CSV file
    csv_file = [f for f in os.listdir('Redcap_csv')][0]
    df = pd.read_csv(f'Redcap_csv/{csv_file}')

    # Drop rows with null demo_subject_id
    df = df.dropna(subset=['demo_subject_id'])

    # Define categorical columns
    categorical_columns = {
        'demo_gender_identity': 'Gender Identity Distribution',
        'demo_legal_sex': 'Legal Sex Distribution',
        'demo_sexual_orientation': 'Sexual Orientation Distribution',
        'demo_marital_status': 'Marital Status Distribution',
        'demo_veteran_status': 'Veteran Status Distribution',
        'demo_race': 'Race Distribution',
        'demo_ethnicity': 'Ethnicity Distribution',
        'demo_languages': 'Languages Distribution',
        'demo_need_interpreter': 'Need for Interpreter Distribution',
        'demo_religion': 'Religion Distribution',
        'demo_state': 'State Distribution',
        'demo_country': 'Country Distribution',
        'demo_city': 'City Distribution',
        'demo_occupation': 'Occupation Distribution'
    }

    # Fill NA with 'Unknown' for categorical columns
    for column in categorical_columns.keys():
        df[column] = df[column].fillna('Unknown')

    def save_json_data(column, title, value_counts, percentages):
        """
        Save distribution data to JSON
        """
        json_data = {
            'title': title,
            'data': [
                {
                    'category': str(category),
                    'count': int(count),
                    'percentage': float(percentage)
                }
                for category, count, percentage in zip(value_counts.index, value_counts.values, percentages)
            ]
        }
        with open(f'{json_dir}/{column}_distribution.json', 'w', encoding='utf-8') as f:
            json.dump(json_data, f, ensure_ascii=False, indent=2)

    def save_image_data(column, title, value_counts, percentages, rotation=45, figsize=(15, 6)):
        """
        Save visualization images to image directory
        """
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=figsize)
        fig.suptitle(title, fontsize=16, y=1.05)

        # Count plot
        sns.barplot(x=value_counts.index, y=value_counts.values, ax=ax1)
        ax1.set_xticklabels(ax1.get_xticklabels(), rotation=rotation)
        ax1.set_title('Count Distribution')
        ax1.set_ylabel('Count')

        # Pie chart
        wedges, texts, autotexts = ax2.pie(percentages, 
                                        labels=value_counts.index,
                                        autopct='%1.1f%%',
                                        textprops={'fontsize': 8})
        ax2.set_title('Percentage Distribution')

        # Add legend for complex pie charts
        if len(value_counts) > 5:
            ax2.legend(wedges, value_counts.index,
                    title="Categories",
                    loc="center left",
                    bbox_to_anchor=(1, 0, 0.5, 1))

        plt.tight_layout()
        plt.savefig(f'{image_dir}/{column}_distribution.png', bbox_inches='tight')
        plt.close()

    def create_distribution_plots(df, column, title, rotation=45, figsize=(15, 6), top_n=None):
        """
        Save both JSON data and image data for given column
        """
        # Prepare data
        if top_n:
            value_counts = df[column].value_counts().head(top_n)
            other_count = df[column].value_counts()[top_n:].sum()
            if other_count > 0:
                value_counts['Others'] = other_count
        else:
            value_counts = df[column].value_counts()
        
        # Calculate percentages
        total = value_counts.sum()
        percentages = value_counts / total * 100

        # Save data
        save_json_data(column, title, value_counts, percentages)
        save_image_data(column, title, value_counts, percentages, rotation, figsize)

    # Create visualizations for categorical variables (excluding city and occupation)
    for column, title in categorical_columns.items():
        if column not in ['demo_city', 'demo_occupation']:
            create_distribution_plots(df, column, title)

    # Process city and occupation (top 20 only)
    create_distribution_plots(df, 'demo_city', 'City Distribution', top_n=20, figsize=(20, 8))
    create_distribution_plots(df, 'demo_occupation', 'Occupation Distribution', top_n=20, figsize=(20, 8))

    # Process age data
    df['demo_dob'] = pd.to_datetime(df['demo_dob'], format='mixed', errors='coerce').dt.strftime('%Y-%m-%d')

    def calculate_age(birth_date):
        """
        Calculate age from birth date
        """
        if pd.isnull(birth_date):
            return None
        birth_date = datetime.strptime(birth_date, '%Y-%m-%d')
        today = datetime.today()
        age = today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))
        return age

    df['demo_age'] = df['demo_dob'].apply(calculate_age)

    # Save age distribution data
    age_data = df['demo_age'].dropna().tolist()
    age_json = {
        'title': 'Age Distribution',
        'data': [float(age) for age in age_data]
    }
    with open(f'{json_dir}/age_distribution.json', 'w') as f:
        json.dump(age_json, f, indent=2)

    def save_age_plots():
        """
        Save age distribution visualizations
        """
        # Histogram and KDE
        plt.figure(figsize=(12, 8))
        sns.histplot(data=df, x='demo_age', bins=30, stat='density', alpha=0.5)
        sns.kdeplot(data=df, x='demo_age', color='red', linewidth=2)
        plt.title('Age Distribution with Density Estimation')
        plt.xlabel('Age')
        plt.ylabel('Density')
        plt.savefig(f'{image_dir}/age_distribution_histogram_kde.png')
        plt.close()

        # Violin plot
        plt.figure(figsize=(10, 6))
        sns.violinplot(data=df, y='demo_age', orient='v')
        plt.title('Age Distribution (Violin Plot)')
        plt.ylabel('Age')
        plt.savefig(f'{image_dir}/age_distribution_violin.png')
        plt.close()

        # Box and strip plot
        plt.figure(figsize=(10, 6))
        sns.boxplot(data=df, y='demo_age', color='lightgray')
        sns.stripplot(data=df, y='demo_age', color='blue', alpha=0.3, size=4)
        plt.title('Age Distribution (Box Plot with Strip Plot)')
        plt.ylabel('Age')
        plt.savefig(f'{image_dir}/age_distribution_box_strip.png')
        plt.close()

        # KDE with rug plot
        plt.figure(figsize=(12, 6))
        sns.kdeplot(data=df, x='demo_age', fill=True)
        sns.rugplot(data=df, x='demo_age', alpha=0.2)
        plt.title('Age Distribution with Rug Plot')
        plt.xlabel('Age')
        plt.ylabel('Density')
        plt.savefig(f'{image_dir}/age_distribution_kde_rug.png')
        plt.close()

    save_age_plots()

    # Drop unnecessary columns
    df = df.drop(['patient_record_id', 'redcap_event_name', 'redcap_repeat_instrument', 
                'redcap_repeat_instance', 'demo_subject_id', 'demo_preferred_phone', 
                'demo_address', 'demo_zip', 'demographics_complete'], axis=1)

    # Process age and marital status distribution
    age_bins = pd.cut(df['demo_age'], bins=[20, 40, 60, 80, 100], labels=["20-40", "40-60", "60-80", "80-100"])
    age_marital_count = df.groupby([age_bins, 'demo_marital_status']).size().unstack().fillna(0)

    stacked_bar_data = [
        {
            "age_group": age_group,
            **{marital_status: int(count) for marital_status, count in counts.items()}
        }
        for age_group, counts in age_marital_count.iterrows()
    ]

    with open(f'{json_dir}/age_marital_status_distribution.json', 'w') as f:
        json.dump(stacked_bar_data, f, indent=2)

    # Process veteran and gender distribution
    veteran_gender_count = df.groupby(['demo_legal_sex', 'demo_veteran_status']).size().unstack().fillna(0)

    veteran_gender_data = [
        {
            "demo_legal_sex": gender,
            **{veteran_status: int(count) for veteran_status, count in counts.items()}
        }
        for gender, counts in veteran_gender_count.iterrows()
    ]

    with open(f'{json_dir}/veteran_gender_distribution.json', 'w') as f:
        json.dump(veteran_gender_data, f, indent=2)

    # Process race and religion distribution
    race_religion_count = df.groupby(['demo_race', 'demo_religion']).size().unstack().fillna(0)

    race_religion_data = [
        {
            "race": race,
            **{religion: int(count) for religion, count in counts.items()}
        }
        for race, counts in race_religion_count.iterrows()
    ]

    with open(f'{json_dir}/race_religion_distribution.json', 'w') as f:
        json.dump(race_religion_data, f, indent=2)

    # Process state and race distribution
    state_race_count = df.groupby(['demo_state', 'demo_race']).size().unstack().fillna(0)

    state_race_data = [
        {
            "state": state,
            **{race: int(count) for race, count in counts.items()}
        }
        for state, counts in state_race_count.iterrows()
    ]

    with open(f'{json_dir}/state_race_distribution.json', 'w') as f:
        json.dump(state_race_data, f, indent=2)

    # Save processed dataframe
    df.to_csv(f'{output_dir}/processed_NUSPARV12-Demographic_DATA_2024-11-11_1357.csv', index=False)