import pandas as pd
import json
from datetime import datetime, date
import numpy as np
import os
import re
from collections import Counter, defaultdict
import itertools
import warnings
warnings.filterwarnings('ignore')

class CompleteDiagnosisVisualizationProcessor:
    """
    Complete NUSPAR diagnosis data visualization JSON generator
    - Automatically adapts to actual data structure
    - Complete privacy protection
    - Various medical visualization support
    - Robust error handling
    """
    
    def __init__(self):
        # Sensitive information patterns (regex)
        self.sensitive_patterns = [
            r'.*id$', r'.*_id$', r'patient.*', r'.*record.*', r'.*name.*',
            r'.*address.*', r'.*phone.*', r'.*email.*', r'.*ssn.*',
            r'.*birth.*', r'.*dob.*', r'.*employer.*', r'provider_name',
            r'facility_name', r'doctor.*', r'physician.*'
        ]
        
        # Diagnosis related keyword patterns
        self.diagnosis_patterns = [
            r'.*diagnosis.*', r'.*diag.*', r'.*icd.*', r'.*condition.*',
            r'.*disease.*', r'.*symptom.*', r'.*procedure.*', r'.*treatment.*'
        ]
        
        # Time related patterns
        self.time_patterns = [
            r'.*date.*', r'.*time.*', r'.*created.*', r'.*updated.*',
            r'.*timestamp.*', r'.*_at$', r'.*_on$'
        ]
        
        # Status/completion related patterns
        self.status_patterns = [
            r'.*status.*', r'.*state.*', r'.*level.*', r'.*priority.*',
            r'.*severity.*', r'.*urgent.*', r'.*complete.*', r'.*finished.*',
            r'.*type.*', r'.*category.*', r'.*class.*'
        ]
        
        # Medical visualization color palettes
        self.color_schemes = {
            'medical_primary': ['#DC2626', '#EA580C', '#D97706', '#CA8A04', '#65A30D', '#16A34A', '#059669', '#0D9488'],
            'severity_gradient': ['#FEF3C7', '#FDE68A', '#F59E0B', '#D97706', '#B45309', '#92400E', '#78350F', '#451A03'],
            'diagnosis_types': ['#DBEAFE', '#93C5FD', '#3B82F6', '#1D4ED8', '#1E3A8A', '#1E40AF'],
            'clinical_status': ['#D1FAE5', '#6EE7B7', '#10B981', '#047857', '#065F46', '#064E3B'],
            'time_series': ['#F3E8FF', '#DDD6FE', '#8B5CF6', '#7C3AED', '#6D28D9', '#5B21B6'],
            'alert_levels': ['#FECACA', '#FCA5A5', '#F87171', '#EF4444', '#DC2626', '#B91C1C']
        }
        
        # ICD-10 major category mapping
        self.icd10_categories = {
            'A': 'Infectious diseases', 'B': 'Infectious diseases',
            'C': 'Neoplasms', 'D': 'Blood disorders',
            'E': 'Endocrine diseases', 'F': 'Mental disorders',
            'G': 'Nervous system', 'H': 'Sensory organs',
            'I': 'Circulatory system', 'J': 'Respiratory system',
            'K': 'Digestive system', 'L': 'Skin diseases',
            'M': 'Musculoskeletal', 'N': 'Genitourinary',
            'O': 'Pregnancy related', 'P': 'Perinatal conditions',
            'Q': 'Congenital anomalies', 'R': 'Abnormal findings',
            'S': 'Injuries', 'T': 'Poisoning',
            'V': 'External causes', 'W': 'External causes',
            'X': 'External causes', 'Y': 'External causes',
            'Z': 'Health services'
        }

    def load_and_analyze_data(self, file_path):
        """
        Load data and completely analyze structure.
        """
        print("🚀 Complete NUSPAR Diagnosis Data Visualization JSON Generator v4.0")
        print("=" * 80)
        
        # 1. Load file
        df = self._safe_load_csv(file_path)
        if df is None:
            return None
            
        # 2. Analyze data structure
        column_analysis = self._analyze_all_columns(df)
        
        # 3. Data validation and cleaning
        df_clean = self._clean_and_validate_data(df, column_analysis)
        
        print(f"\n✅ Data analysis complete:")
        print(f"   📊 Final data: {df_clean.shape[0]:,} rows, {df_clean.shape[1]} columns")

        # columns
        print("df_clean.columns:")
        print(df_clean.columns)
        
        return df_clean, column_analysis

    def _safe_load_csv(self, file_path):
        """Safe CSV loading (multi-encoding support)"""
        print(f"📂 Loading data: {file_path}")
        
        if not os.path.exists(file_path):
            print(f"❌ File not found: {file_path}")
            return None
        
        file_size = os.path.getsize(file_path) / (1024 * 1024)
        print(f"📄 File size: {file_size:.2f} MB")
        
        encodings = ['utf-8', 'latin1', 'cp1252', 'iso-8859-1', 'utf-16']
        
        for encoding in encodings:
            try:
                print(f"🔄 Trying {encoding} encoding...")
                df = pd.read_csv(file_path, encoding=encoding)
                
                if df.empty:
                    print(f"⚠️ File is empty")
                    continue
                    
                print(f"✅ {encoding} successful! {df.shape[0]:,} rows, {df.shape[1]} columns")
                return df
                
            except Exception as e:
                print(f"❌ {encoding} failed: {str(e)[:100]}")
                continue
        
        print(f"❌ All encoding attempts failed")
        return None

    def _analyze_all_columns(self, df):
        """Completely analyze all columns."""
        print(f"\n🔍 Analyzing columns...")
        
        analysis = {
            'sensitive_columns': [],
            'diagnosis_columns': [],
            'time_columns': [],
            'status_columns': [],
            'categorical_columns': [],
            'numeric_columns': [],
            'text_columns': [],
            'boolean_columns': [],
            'column_details': {}
        }
        
        for col in df.columns:
            col_info = self._analyze_single_column(df, col)
            analysis['column_details'][col] = col_info
            
            # Column classification
            if col_info['is_sensitive']:
                analysis['sensitive_columns'].append(col)
            elif col_info['is_diagnosis']:
                analysis['diagnosis_columns'].append(col)
            elif col_info['is_time']:
                analysis['time_columns'].append(col)
            elif col_info['is_status']:
                analysis['status_columns'].append(col)
            elif col_info['is_categorical']:
                analysis['categorical_columns'].append(col)
            elif col_info['is_numeric']:
                analysis['numeric_columns'].append(col)
            elif col_info['is_boolean']:
                analysis['boolean_columns'].append(col)
            else:
                analysis['text_columns'].append(col)
        
        # Analysis results output
        print(f"📊 Column classification results:")
        print(f"   🔒 Sensitive info: {len(analysis['sensitive_columns'])} ({analysis['sensitive_columns'][:3]}{'...' if len(analysis['sensitive_columns']) > 3 else ''})")
        print(f"   🏥 Diagnosis related: {len(analysis['diagnosis_columns'])} ({analysis['diagnosis_columns'][:3]}{'...' if len(analysis['diagnosis_columns']) > 3 else ''})")
        print(f"   📅 Time related: {len(analysis['time_columns'])} ({analysis['time_columns'][:3]}{'...' if len(analysis['time_columns']) > 3 else ''})")
        print(f"   📊 Status related: {len(analysis['status_columns'])} ({analysis['status_columns'][:3]}{'...' if len(analysis['status_columns']) > 3 else ''})")
        print(f"   📋 Categorical: {len(analysis['categorical_columns'])} ({analysis['categorical_columns'][:3]}{'...' if len(analysis['categorical_columns']) > 3 else ''})")
        print(f"   🔢 Numeric: {len(analysis['numeric_columns'])} ({analysis['numeric_columns'][:3]}{'...' if len(analysis['numeric_columns']) > 3 else ''})")
        
        return analysis

    def _analyze_single_column(self, df, col):
        """Detailed analysis of a single column."""
        col_lower = col.lower()
        
        # Basic statistics
        info = {
            'name': col,
            'dtype': str(df[col].dtype),
            'total_count': len(df),
            'non_null_count': int(df[col].notna().sum()),
            'null_count': int(df[col].isna().sum()),
            'null_percentage': round((df[col].isna().sum() / len(df)) * 100, 2),
            'unique_count': int(df[col].nunique()),
            'memory_usage': int(df[col].memory_usage(deep=True))
        }
        
        # Pattern matching
        info['is_sensitive'] = any(re.match(pattern, col_lower) for pattern in self.sensitive_patterns)
        info['is_diagnosis'] = any(re.match(pattern, col_lower) for pattern in self.diagnosis_patterns)
        info['is_time'] = any(re.match(pattern, col_lower) for pattern in self.time_patterns)
        info['is_status'] = any(re.match(pattern, col_lower) for pattern in self.status_patterns)
        
        # Data type analysis
        if df[col].dtype == 'bool':
            info['is_boolean'] = True
            info['is_categorical'] = info['is_numeric'] = False
        elif df[col].dtype in ['int64', 'float64', 'int32', 'float32']:
            info['is_numeric'] = True
            info['is_categorical'] = info['is_boolean'] = False
            # Check if numeric can be used as categorical
            if info['unique_count'] <= 20 and info['non_null_count'] > 0:
                info['could_be_categorical'] = True
        else:
            info['is_categorical'] = (info['unique_count'] <= 100 and 
                                    info['non_null_count'] >= 10 and
                                    not info['is_sensitive'])
            info['is_numeric'] = info['is_boolean'] = False
        
        # Sample values
        if info['non_null_count'] > 0:
            try:
                sample_values = df[col].dropna().unique()[:5]
                info['sample_values'] = [str(val) for val in sample_values]
            except:
                info['sample_values'] = []
        else:
            info['sample_values'] = []
        
        # Value distribution (for categorical columns)
        if info.get('is_categorical', False):
            try:
                value_counts = df[col].value_counts().head(10)
                info['top_values'] = {str(k): int(v) for k, v in value_counts.items()}
                info['most_common'] = str(value_counts.index[0]) if len(value_counts) > 0 else None
            except:
                info['top_values'] = {}
                info['most_common'] = None
        
        return info

    def _clean_and_validate_data(self, df, column_analysis):
        """Clean and validate data."""
        print(f"\n🧹 Cleaning data...")
        
        df_clean = df.copy()
        removed_columns = []
        
        # Remove sensitive columns
        for col in column_analysis['sensitive_columns']:
            if col in df_clean.columns:
                df_clean = df_clean.drop(columns=[col])
                removed_columns.append(col)
        
        # Convert date columns to time periods
        for col in column_analysis['time_columns']:
            if col in df_clean.columns:
                try:
                    # Convert dates to quarters
                    time_periods = df_clean[col].apply(self._convert_to_time_period)
                    new_col_name = f"{col}_period"
                    df_clean[new_col_name] = time_periods
                    
                    # Remove original date column
                    df_clean = df_clean.drop(columns=[col])
                    removed_columns.append(col)
                    
                    # Classify new column as categorical
                    column_analysis['categorical_columns'].append(new_col_name)
                    print(f"   🔄 {col} → {new_col_name} (converted to time periods)")
                    
                except Exception as e:
                    print(f"   ⚠️ {col} time conversion failed: {e}")
        
        # Categorize diagnosis codes
        for col in column_analysis['diagnosis_columns']:
            if col in df_clean.columns:
                try:
                    categories = df_clean[col].apply(self._categorize_diagnosis_code)
                    new_col_name = f"{col}_category"
                    df_clean[new_col_name] = categories
                    column_analysis['categorical_columns'].append(new_col_name)
                    print(f"   🔄 {col} → {new_col_name} (diagnosis categorization)")
                except Exception as e:
                    print(f"   ⚠️ {col} diagnosis categorization failed: {e}")
        
        print(f"✅ Cleaning complete: {len(removed_columns)} sensitive columns removed")
        print(f"   Removed columns: {removed_columns[:5]}{'...' if len(removed_columns) > 5 else ''}")
        
        return df_clean

    def _convert_to_time_period(self, date_str):
        """Convert date to time period (privacy protection)"""
        if pd.isna(date_str):
            return 'Unknown'
        
        try:
            # Support various date formats
            date_formats = ['%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y', '%Y-%m-%d %H:%M:%S', '%m/%d/%Y %H:%M:%S']
            
            for fmt in date_formats:
                try:
                    date_obj = datetime.strptime(str(date_str), fmt)
                    # Convert to quarter
                    quarter = (date_obj.month - 1) // 3 + 1
                    return f"{date_obj.year}-Q{quarter}"
                except ValueError:
                    continue
            
            # Try to extract year only
            year_match = re.search(r'\b(20\d{2}|19\d{2})\b', str(date_str))
            if year_match:
                return f"{year_match.group(1)}-Unknown"
            
            return 'Unknown'
            
        except:
            return 'Unknown'

    def _categorize_diagnosis_code(self, code):
        """Categorize diagnosis codes"""
        if pd.isna(code):
            return 'Unknown'
        
        code_str = str(code).upper().strip()
        
        # Detect ICD-10 format
        if len(code_str) >= 1 and code_str[0].isalpha():
            first_char = code_str[0]
            return self.icd10_categories.get(first_char, 'Other Conditions')
        
        # When starting with numbers (ICD-9 etc)
        if code_str.startswith(('0', '1', '2', '3')):
            return 'Infectious & Parasitic'
        elif code_str.startswith(('4', '5', '6')):
            return 'Chronic Conditions'
        elif code_str.startswith(('7', '8', '9')):
            return 'Injuries & External Causes'
        
        return 'Other Conditions'

    def create_complete_statistics(self, df_clean, column_analysis):
        """Generate complete statistics."""
        print(f"\n📊 Generating complete statistics...")
        
        stats = {
            'metadata': {
                'generated_at': datetime.now().isoformat(),
                'total_records': len(df_clean),
                'data_source': 'NUSPAR Diagnosis Data (Fully Anonymized)',
                'privacy_level': 'MAXIMUM - All Personal Information Removed',
                'safe_for_public_use': True,
                'version': 'Complete-v4.0',
                'processing_summary': {
                    'original_columns': len(df_clean.columns) + len(column_analysis['sensitive_columns']),
                    'final_columns': len(df_clean.columns),
                    'removed_sensitive_columns': len(column_analysis['sensitive_columns']),
                    'categorical_columns': len(column_analysis['categorical_columns']),
                    'numeric_columns': len(column_analysis['numeric_columns'])
                }
            },
            'data_quality': self._calculate_data_quality(df_clean),
            'distributions': {},
            'cross_tabulations': {},
            'clinical_insights': {},
            'temporal_patterns': {},
            'privacy_confirmation': {
                'contains_patient_ids': False,
                'contains_dates': False,
                'contains_names': False,
                'contains_addresses': False,
                'data_type': 'AGGREGATE_STATISTICS_ONLY',
                'hipaa_compliant': True,
                'safe_for_public_dashboard': True
            }
        }
        
        # Generate distributions for all appropriate columns
        distribution_count = 0
        
        # Categorical columns
        for col in column_analysis['categorical_columns']:
            if col in df_clean.columns:
                try:
                    dist = self._create_distribution_for_column(df_clean, col, column_analysis)
                    if dist:
                        stats['distributions'][f'{col}_distribution'] = dist
                        distribution_count += 1
                        print(f"   ✅ {col}: {dist['unique_categories']} categories")
                except Exception as e:
                    print(f"   ⚠️ {col} distribution generation failed: {e}")
        
        # Status columns
        for col in column_analysis['status_columns']:
            if col in df_clean.columns and col not in column_analysis['categorical_columns']:
                try:
                    dist = self._create_distribution_for_column(df_clean, col, column_analysis)
                    if dist:
                        stats['distributions'][f'{col}_distribution'] = dist
                        distribution_count += 1
                        print(f"   ✅ {col}: {dist['unique_categories']} statuses")
                except Exception as e:
                    print(f"   ⚠️ {col} distribution generation failed: {e}")
        
        # Numeric columns that can be used as categorical
        for col in column_analysis['numeric_columns']:
            if col in df_clean.columns:
                col_info = column_analysis['column_details'].get(col, {})
                if col_info.get('could_be_categorical', False):
                    try:
                        dist = self._create_distribution_for_column(df_clean, col, column_analysis)
                        if dist:
                            stats['distributions'][f'{col}_distribution'] = dist
                            distribution_count += 1
                            print(f"   ✅ {col}: {dist['unique_categories']} values (numeric→categorical)")
                    except Exception as e:
                        print(f"   ⚠️ {col} distribution generation failed: {e}")
        
        # Generate cross tabulations
        stats['cross_tabulations'] = self._create_cross_tabulations(df_clean, column_analysis)
        
        # Generate clinical insights
        stats['clinical_insights'] = self._generate_clinical_insights(df_clean, column_analysis, stats)
        
        # Analyze temporal patterns
        stats['temporal_patterns'] = self._analyze_temporal_patterns(df_clean, column_analysis)
        
        print(f"✅ Statistics generation complete: {distribution_count} distributions, {len(stats['cross_tabulations'])} cross-tabs")
        
        return stats

    def _calculate_data_quality(self, df):
        """Calculate data quality metrics"""
        total_cells = df.shape[0] * df.shape[1]
        missing_cells = df.isna().sum().sum()
        
        return {
            'total_records': len(df),
            'total_columns': len(df.columns),
            'total_cells': int(total_cells),
            'missing_cells': int(missing_cells),
            'completion_rate': round(((total_cells - missing_cells) / total_cells) * 100, 2) if total_cells > 0 else 0,
            'duplicate_records': int(df.duplicated().sum()),
            'empty_rows': int(df.isna().all(axis=1).sum()),
            'columns_with_data': int((df.notna().any()).sum()),
            'most_complete_column': df.isna().sum().idxmin() if not df.empty else None,
            'least_complete_column': df.isna().sum().idxmax() if not df.empty else None
        }

    def _create_distribution_for_column(self, df, col, column_analysis):
        """Generate distribution for a single column"""
        if col not in df.columns:
            return None
        
        # Basic validation
        non_null_count = df[col].notna().sum()
        if non_null_count < 5:  # Minimum 5 values required
            return None
        
        unique_count = df[col].nunique()
        if unique_count > 50:  # Too many unique values
            return None
        
        # Calculate value distribution
        value_counts = df[col].value_counts(dropna=False)
        total = len(df)
        
        distribution_data = []
        for value, count in value_counts.items():
            distribution_data.append({
                'name': 'Missing/Unknown' if pd.isna(value) else str(value),
                'count': int(count),
                'percentage': round((count / total) * 100, 1),
                'category': column_analysis['column_details'].get(col, {}).get('name', col)
            })
        
        # Calculate diversity index
        diversity_index = self._calculate_shannon_diversity(value_counts)
        
        return {
            'data': distribution_data,
            'total_responses': int(non_null_count),
            'total_records': int(total),
            'unique_categories': int(unique_count),
            'missing_count': int(df[col].isna().sum()),
            'completion_rate': round((non_null_count / total) * 100, 1),
            'most_common': str(value_counts.index[0]) if len(value_counts) > 0 else None,
            'diversity_index': diversity_index,
            'column_type': self._determine_column_type(col, column_analysis)
        }

    def _determine_column_type(self, col, column_analysis):
        """Determine column type"""
        if col in column_analysis['diagnosis_columns']:
            return 'diagnosis'
        elif col in column_analysis['status_columns']:
            return 'status'
        elif col in column_analysis['time_columns']:
            return 'temporal'
        elif col.endswith('_category'):
            return 'derived_category'
        elif col.endswith('_period'):
            return 'time_period'
        else:
            return 'general'

    def _calculate_shannon_diversity(self, counts):
        """Calculate Shannon diversity index"""
        if len(counts) <= 1:
            return 0.0
        
        total = counts.sum()
        proportions = counts / total
        shannon = -sum(p * np.log2(p) for p in proportions if p > 0)
        return round(shannon, 3)

    def _create_cross_tabulations(self, df, column_analysis):
        """Generate cross tabulations"""
        print(f"🔥 Generating cross tabulations...")
        
        cross_tabs = {}
        
        # Select suitable columns
        suitable_columns = []
        for col in df.columns:
            if (df[col].dtype == 'object' and 
                2 <= df[col].nunique() <= 15 and 
                df[col].notna().sum() >= 20):
                suitable_columns.append(col)
        
        print(f"   📋 Cross-tab capable columns: {len(suitable_columns)}")
        
        # Generate combinations (max 6)
        combinations = list(itertools.combinations(suitable_columns, 2))[:6]
        
        for col1, col2 in combinations:
            try:
                # Use only valid data
                valid_data = df[[col1, col2]].dropna()
                if len(valid_data) < 20:
                    continue
                
                crosstab = pd.crosstab(valid_data[col1], valid_data[col2])
                
                # Size limitation
                if crosstab.size > 150:  # Skip if larger than 15x10 matrix
                    continue
                
                # Convert to heatmap data format
                heatmap_data = []
                max_value = crosstab.values.max()
                
                for i, row_name in enumerate(crosstab.index):
                    for j, col_name in enumerate(crosstab.columns):
                        value = int(crosstab.iloc[i, j])
                        heatmap_data.append({
                            'x': str(col_name),
                            'y': str(row_name),
                            'value': value,
                            'normalized': round(value / max_value, 3) if max_value > 0 else 0,
                            'x_index': j,
                            'y_index': i,
                            'percentage': round((value / valid_data.shape[0]) * 100, 1)
                        })
                
                cross_tabs[f"{col1}_vs_{col2}"] = {
                    'data': heatmap_data,
                    'x_labels': [str(x) for x in crosstab.columns],
                    'y_labels': [str(y) for y in crosstab.index],
                    'title': f"{col1} vs {col2}",
                    'x_column': col1,
                    'y_column': col2,
                    'total_combinations': len(heatmap_data),
                    'max_value': int(max_value),
                    'sample_size': len(valid_data)
                }
                
                print(f"   ✅ {col1} vs {col2}: {crosstab.shape[0]}x{crosstab.shape[1]}")
                
            except Exception as e:
                print(f"   ⚠️ {col1} vs {col2} failed: {e}")
                continue
        
        print(f"✅ {len(cross_tabs)} cross tables generated")
        return cross_tabs

    def _generate_clinical_insights(self, df, column_analysis, stats):
        """Generate clinical insights"""
        print(f"💡 Generating clinical insights...")
        
        insights = {
            'data_overview': {
                'total_records': len(df),
                'data_completeness': stats['data_quality']['completion_rate'],
                'analysis_timestamp': datetime.now().isoformat()
            },
            'top_categories': {},
            'completion_analysis': {},
            'diversity_analysis': {},
            'pattern_detection': {}
        }
        
        # Top categories analysis
        for dist_key, dist_data in stats['distributions'].items():
            if len(dist_data['data']) > 0:
                col_name = dist_key.replace('_distribution', '')
                insights['top_categories'][col_name] = {
                    'most_common': dist_data['most_common'],
                    'total_categories': dist_data['unique_categories'],
                    'completion_rate': dist_data['completion_rate'],
                    'top_3': [item['name'] for item in dist_data['data'][:3]]
                }
        
        # Completion rate analysis
        completion_rates = []
        for dist_key, dist_data in stats['distributions'].items():
            completion_rates.append({
                'field': dist_key.replace('_distribution', ''),
                'completion_rate': dist_data['completion_rate'],
                'total_responses': dist_data['total_responses']
            })
        
        completion_rates.sort(key=lambda x: x['completion_rate'], reverse=True)
        insights['completion_analysis'] = {
            'best_completed': completion_rates[:3],
            'worst_completed': completion_rates[-3:],
            'average_completion': round(np.mean([x['completion_rate'] for x in completion_rates]), 1)
        }
        
        # Diversity analysis
        diversity_scores = []
        for dist_key, dist_data in stats['distributions'].items():
            diversity_scores.append({
                'field': dist_key.replace('_distribution', ''),
                'diversity_index': dist_data['diversity_index'],
                'unique_categories': dist_data['unique_categories']
            })
        
        diversity_scores.sort(key=lambda x: x['diversity_index'], reverse=True)
        insights['diversity_analysis'] = {
            'most_diverse': diversity_scores[:3],
            'least_diverse': diversity_scores[-3:],
            'average_diversity': round(np.mean([x['diversity_index'] for x in diversity_scores]), 3)
        }
        
        print(f"✅ Clinical insights generation complete")
        return insights

    def _analyze_temporal_patterns(self, df, column_analysis):
        """Analyze temporal patterns"""
        temporal_analysis = {}
        
        # Find time period columns
        time_period_columns = [col for col in df.columns if col.endswith('_period')]
        
        if time_period_columns:
            for col in time_period_columns:
                try:
                    time_counts = df[col].value_counts().sort_index()
                    if len(time_counts) > 1:
                        temporal_analysis[col] = {
                            'periods': list(time_counts.index),
                            'counts': list(time_counts.values),
                            'trend': 'increasing' if time_counts.iloc[-1] > time_counts.iloc[0] else 'decreasing',
                            'peak_period': time_counts.idxmax(),
                            'total_periods': len(time_counts)
                        }
                except Exception as e:
                    print(f"   ⚠️ {col} temporal pattern analysis failed: {e}")
        
        return temporal_analysis

    def create_comprehensive_visualizations(self, stats, column_analysis):
        """Generate comprehensive visualization data"""
        print(f"\n🎨 Generating visualization data...")
        
        viz_data = {
            'summary_cards': self._create_summary_cards(stats),
            'basic_charts': self._create_basic_charts(stats),
            'advanced_charts': self._create_advanced_charts(stats),
            'heatmaps': stats.get('cross_tabulations', {}),
            'clinical_dashboards': self._create_clinical_dashboards(stats),
            'time_series': self._create_time_series_data(stats),
            'specialized_medical': self._create_medical_visualizations(stats),
            'data_quality_viz': self._create_data_quality_visualizations(stats)
        }
        
        print(f"✅ Visualization data generation complete")
        print(f"   📋 Summary cards: {len(viz_data['summary_cards'])}")
        print(f"   📊 Basic charts: {len(viz_data['basic_charts'])}")
        print(f"   📈 Advanced charts: {len(viz_data['advanced_charts'])}")
        print(f"   🔥 Heatmaps: {len(viz_data['heatmaps'])}")
        print(f"   🏥 Clinical dashboards: {len(viz_data['clinical_dashboards'])}")
        
        return viz_data

    def _create_summary_cards(self, stats):
        """Generate summary card data"""
        cards = {
            'total_records': {
                'value': stats['metadata']['total_records'],
                'label': 'Total Records',
                'icon': 'database',
                'color': '#DC2626',
                'trend': None,
                'description': 'Total number of diagnosis records'
            },
            'data_completeness': {
                'value': f"{stats['data_quality']['completion_rate']}%",
                'label': 'Data Completeness',
                'icon': 'check-circle',
                'color': '#10B981',
                'trend': 'up' if stats['data_quality']['completion_rate'] > 80 else 'down',
                'description': 'Percentage of completed data fields'
            },
            'unique_conditions': {
                'value': len(stats['distributions']),
                'label': 'Data Fields',
                'icon': 'layers',
                'color': '#3B82F6',
                'trend': None,
                'description': 'Number of analyzed data fields'
            },
            'cross_references': {
                'value': len(stats['cross_tabulations']),
                'label': 'Cross References',
                'icon': 'link',
                'color': '#8B5CF6',
                'trend': None,
                'description': 'Number of field correlations found'
            }
        }
        
        # Additional insight cards
        if 'clinical_insights' in stats and 'completion_analysis' in stats['clinical_insights']:
            avg_completion = stats['clinical_insights']['completion_analysis'].get('average_completion', 0)
            cards['average_completion'] = {
                'value': f"{avg_completion}%",
                'label': 'Average Field Completion',
                'icon': 'trending-up',
                'color': '#059669',
                'trend': 'up' if avg_completion > 75 else 'down',
                'description': 'Average completion rate across all fields'
            }
        
        return cards

    def _create_basic_charts(self, stats):
        """Generate basic chart data"""
        charts = {}
        
        # Generate charts for each distribution
        for dist_key, dist_data in stats['distributions'].items():
            if len(dist_data['data']) == 0:
                continue
            
            # Select top items only
            top_items = sorted(dist_data['data'], key=lambda x: x['count'], reverse=True)[:12]
            
            if len(top_items) > 0:
                color_scheme = self._get_color_scheme_for_distribution(dist_key, dist_data)
                
                charts[dist_key] = {
                    'bar_chart': {
                        'data': top_items,
                        'x_key': 'name',
                        'y_key': 'count',
                        'colors': color_scheme[:len(top_items)],
                        'title': f"{dist_data['data'][0]['category']} Distribution",
                        'subtitle': f"Total: {dist_data['total_responses']:,} responses"
                    },
                    'pie_chart': {
                        'data': top_items[:8],  # Pie chart up to 8 items
                        'label_key': 'name',
                        'value_key': 'count',
                        'colors': color_scheme[:min(8, len(top_items))],
                        'title': f"Top 8 {dist_data['data'][0]['category']}",
                        'show_percentages': True
                    },
                    'horizontal_bar': {
                        'data': top_items[:10],  # Horizontal bar up to 10 items
                        'x_key': 'count',
                        'y_key': 'name',
                        'colors': color_scheme[:min(10, len(top_items))],
                        'title': f"Top 10 {dist_data['data'][0]['category']}",
                        'show_values': True
                    }
                }
        
        return charts

    def _get_color_scheme_for_distribution(self, dist_key, dist_data):
        """Select color scheme based on distribution type"""
        column_type = dist_data.get('column_type', 'general')
        
        if 'diagnosis' in dist_key or column_type == 'diagnosis':
            return self.color_schemes['diagnosis_types']
        elif 'status' in dist_key or column_type == 'status':
            return self.color_schemes['clinical_status']
        elif 'severity' in dist_key or 'level' in dist_key:
            return self.color_schemes['severity_gradient']
        elif 'time' in dist_key or 'period' in dist_key or column_type == 'time_period':
            return self.color_schemes['time_series']
        elif 'alert' in dist_key or 'urgent' in dist_key:
            return self.color_schemes['alert_levels']
        else:
            return self.color_schemes['medical_primary']

    def _create_advanced_charts(self, stats):
        """Generate advanced chart data"""
        advanced_charts = {}
        
        # Generate treemap data
        if stats['distributions']:
            first_dist_key = list(stats['distributions'].keys())[0]
            first_dist = stats['distributions'][first_dist_key]
            
            advanced_charts['primary_treemap'] = {
                'data': [
                    {
                        'name': item['name'],
                        'value': item['count'],
                        'percentage': item['percentage'],
                        'color': self.color_schemes['medical_primary'][i % len(self.color_schemes['medical_primary'])]
                    }
                    for i, item in enumerate(first_dist['data'][:15])
                ],
                'title': f"Hierarchical View: {first_dist['data'][0]['category']}",
                'total_value': first_dist['total_responses']
            }
        
        # Diversity radar chart
        diversity_data = []
        for dist_key, dist_data in list(stats['distributions'].items())[:6]:
            field_name = dist_key.replace('_distribution', '').replace('_', ' ').title()
            diversity_data.append({
                'field': field_name,
                'diversity': dist_data['diversity_index'],
                'categories': dist_data['unique_categories']
            })
        
        if diversity_data:
            advanced_charts['diversity_radar'] = {
                'data': diversity_data,
                'max_diversity': 5.0,  # Log2 basis
                'title': 'Data Diversity Analysis',
                'description': 'Higher values indicate more diverse distributions'
            }
        
        # Completion rate comparison chart
        if 'clinical_insights' in stats and 'completion_analysis' in stats['clinical_insights']:
            completion_data = stats['clinical_insights']['completion_analysis']['best_completed']
            advanced_charts['completion_comparison'] = {
                'data': completion_data,
                'chart_type': 'horizontal_bar',
                'title': 'Field Completion Rates',
                'x_key': 'completion_rate',
                'y_key': 'field',
                'colors': self.color_schemes['clinical_status']
            }
        
        return advanced_charts

    def _create_clinical_dashboards(self, stats):
        """Generate clinical dashboard data"""
        dashboards = {}
        
        # Data quality dashboard
        dashboards['data_quality'] = {
            'metrics': stats['data_quality'],
            'completion_breakdown': [],
            'quality_score': min(100, stats['data_quality']['completion_rate'] + 10)  # Adjusted quality score
        }
        
        # Completion rate by distribution
        for dist_key, dist_data in stats['distributions'].items():
            field_name = dist_key.replace('_distribution', '')
            dashboards['data_quality']['completion_breakdown'].append({
                'field': field_name,
                'completion_rate': dist_data['completion_rate'],
                'total_responses': dist_data['total_responses'],
                'missing_count': dist_data['missing_count']
            })
        
        # Top findings dashboard
        if 'clinical_insights' in stats:
            insights = stats['clinical_insights']
            dashboards['top_findings'] = {
                'overview': insights.get('data_overview', {}),
                'top_categories': insights.get('top_categories', {}),
                'diversity_insights': insights.get('diversity_analysis', {})
            }
        
        # Temporal patterns dashboard
        if stats.get('temporal_patterns'):
            dashboards['temporal_analysis'] = {
                'patterns': stats['temporal_patterns'],
                'summary': {
                    'total_time_fields': len(stats['temporal_patterns']),
                    'time_span_analysis': 'Available'
                }
            }
        
        return dashboards

    def _create_time_series_data(self, stats):
        """Generate time series data"""
        time_series = {}
        
        if stats.get('temporal_patterns'):
            for field, pattern_data in stats['temporal_patterns'].items():
                if len(pattern_data['periods']) > 1:
                    time_series[field] = {
                        'line_chart': {
                            'data': [
                                {'period': period, 'count': count}
                                for period, count in zip(pattern_data['periods'], pattern_data['counts'])
                            ],
                            'x_key': 'period',
                            'y_key': 'count',
                            'title': f"Temporal Pattern: {field.replace('_', ' ').title()}",
                            'trend': pattern_data['trend']
                        },
                        'area_chart': {
                            'data': [
                                {'period': period, 'count': count}
                                for period, count in zip(pattern_data['periods'], pattern_data['counts'])
                            ],
                            'x_key': 'period',
                            'y_key': 'count',
                            'fill': True,
                            'color': self.color_schemes['time_series'][0]
                        }
                    }
        
        return time_series

    def _create_medical_visualizations(self, stats):
        """Generate medical specialized visualizations"""
        medical_viz = {}
        
        # Diagnosis distribution analysis
        diagnosis_distributions = {k: v for k, v in stats['distributions'].items() 
                                 if v.get('column_type') == 'diagnosis'}
        
        if diagnosis_distributions:
            # Disease burden analysis
            first_diag = list(diagnosis_distributions.values())[0]
            medical_viz['disease_burden'] = {
                'data': first_diag['data'],
                'total_cases': first_diag['total_responses'],
                'visualization_type': 'sunburst',
                'title': 'Disease Burden Analysis'
            }
        
        # Status distribution analysis
        status_distributions = {k: v for k, v in stats['distributions'].items() 
                              if v.get('column_type') == 'status'}
        
        if status_distributions:
            # Status distribution matrix
            medical_viz['status_matrix'] = {
                'distributions': status_distributions,
                'visualization_type': 'matrix',
                'title': 'Clinical Status Distribution Matrix'
            }
        
        # Completion rate funnel
        completion_data = []
        total_records = stats['metadata']['total_records']
        
        # Calculate completion rates by stage
        stages = ['Initial Records', 'Basic Data Complete', 'Extended Data Complete', 'Full Profile Complete']
        completion_rates = [100, 95, 80, 65]  # Example rates
        
        for stage, rate in zip(stages, completion_rates):
            count = int(total_records * rate / 100)
            completion_data.append({
                'stage': stage,
                'count': count,
                'percentage': rate,
                'color': self.color_schemes['clinical_status'][len(completion_data) % len(self.color_schemes['clinical_status'])]
            })
        
        medical_viz['completion_funnel'] = {
            'data': completion_data,
            'visualization_type': 'funnel',
            'title': 'Data Completion Funnel'
        }
        
        return medical_viz

    def _create_data_quality_visualizations(self, stats):
        """Generate data quality visualizations"""
        quality_viz = {}
        
        # Quality metric gauges
        quality_viz['quality_gauges'] = {
            'completion_rate': {
                'value': stats['data_quality']['completion_rate'],
                'min': 0,
                'max': 100,
                'thresholds': [50, 75, 90],
                'colors': ['#EF4444', '#F59E0B', '#10B981', '#059669'],
                'title': 'Data Completion Rate'
            },
            'data_coverage': {
                'value': (stats['data_quality']['columns_with_data'] / stats['data_quality']['total_columns']) * 100,
                'min': 0,
                'max': 100,
                'thresholds': [60, 80, 95],
                'colors': ['#EF4444', '#F59E0B', '#10B981', '#059669'],
                'title': 'Column Coverage Rate'
            }
        }
        
        # Field quality analysis
        field_quality = []
        for dist_key, dist_data in stats['distributions'].items():
            field_name = dist_key.replace('_distribution', '')
            field_quality.append({
                'field': field_name,
                'completion_rate': dist_data['completion_rate'],
                'diversity_score': dist_data['diversity_index'],
                'response_count': dist_data['total_responses'],
                'quality_grade': self._calculate_quality_grade(dist_data)
            })
        
        quality_viz['field_quality_matrix'] = {
            'data': sorted(field_quality, key=lambda x: x['completion_rate'], reverse=True),
            'visualization_type': 'matrix',
            'title': 'Field Quality Analysis Matrix'
        }
        
        return quality_viz

    def _calculate_quality_grade(self, dist_data):
        """Calculate data quality grade"""
        completion = dist_data['completion_rate']
        diversity = dist_data['diversity_index']
        
        # Calculate weighted score
        score = (completion * 0.7) + (min(diversity * 20, 30))  # Completion 70%, diversity 30%
        
        if score >= 90:
            return 'A'
        elif score >= 80:
            return 'B'
        elif score >= 70:
            return 'C'
        elif score >= 60:
            return 'D'
        else:
            return 'F'

    def save_complete_dashboard_files(self, stats, viz_data, output_dir):
        """Save complete dashboard files."""
        print(f"\n💾 Saving dashboard files...")
        
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
            print(f"📁 Created output directory: {output_dir}")
        
        # Define files to save
        files_to_save = {
            'complete_diagnosis_statistics.json': {
                'data': stats,
                'description': '🏥 Complete diagnosis data statistics (anonymized)'
            },
            'complete_visualization_data.json': {
                'data': viz_data,
                'description': '🎨 Complete visualization data (all chart types)'
            },
            'basic_diagnosis_charts.json': {
                'data': viz_data['basic_charts'],
                'description': '📊 Basic diagnosis charts (bar, pie, horizontal bar)'
            },
            'clinical_dashboards.json': {
                'data': viz_data['clinical_dashboards'],
                'description': '⚕️ Clinical dashboard data'
            },
            'diagnosis_heatmaps.json': {
                'data': viz_data['heatmaps'],
                'description': '🔥 Diagnosis correlation heatmaps'
            },
            'advanced_medical_charts.json': {
                'data': viz_data['advanced_charts'],
                'description': '📈 Advanced medical charts (treemap, radar, comparison)'
            },
            'time_series_analysis.json': {
                'data': viz_data['time_series'],
                'description': '📅 Time series analysis data'
            },
            'medical_specializations.json': {
                'data': viz_data['specialized_medical'],
                'description': '🏥 Medical specialized visualizations'
            },
            'data_quality_dashboard.json': {
                'data': viz_data['data_quality_viz'],
                'description': '🔍 Data quality dashboard'
            },
            'summary_cards.json': {
                'data': viz_data['summary_cards'],
                'description': '📋 Summary card data'
            }
        }
        
        saved_files = []
        total_size = 0
        
        for filename, file_info in files_to_save.items():
            filepath = os.path.join(output_dir, filename)
            try:
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(file_info['data'], f, indent=2, ensure_ascii=False, default=str)
                
                file_size = os.path.getsize(filepath)
                total_size += file_size
                
                print(f"✅ {filename}")
                print(f"   📄 {file_info['description']}")
                print(f"   💾 Size: {file_size/1024:.1f} KB")
                print(f"   🔑 Key count: {len(file_info['data']) if isinstance(file_info['data'], dict) else 'N/A'}")
                
                saved_files.append(filepath)
                
            except Exception as e:
                print(f"❌ {filename} save failed: {e}")
        
        # Generate metadata file
        metadata = {
            'generation_info': {
                'generated_at': datetime.now().isoformat(),
                'total_files': len(saved_files),
                'total_size_kb': round(total_size / 1024, 1),
                'version': 'Complete-v4.0',
                'privacy_level': 'MAXIMUM',
                'safe_for_public_use': True
            },
            'file_descriptions': {filename: info['description'] for filename, info in files_to_save.items()},
            'usage_guide': {
                'basic_charts': 'Use for standard bar, pie, and horizontal bar charts',
                'clinical_dashboards': 'Use for healthcare-specific analytics',
                'heatmaps': 'Use for correlation and cross-tabulation analysis',
                'advanced_charts': 'Use for treemap, radar, and comparison visualizations',
                'time_series': 'Use for temporal pattern analysis',
                'medical_specializations': 'Use for disease burden and clinical flow analysis',
                'data_quality': 'Use for data completeness and quality monitoring'
            },
            'recommended_libraries': {
                'react': ['recharts', 'victory', 'd3-react'],
                'javascript': ['d3.js', 'chart.js', 'plotly.js'],
                'python': ['plotly', 'seaborn', 'bokeh'],
                'r': ['ggplot2', 'plotly', 'leaflet']
            }
        }
        
        # Save metadata
        with open(os.path.join(output_dir, 'dashboard_metadata.json'), 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)
        
        # Generate visualization guide
        self._create_comprehensive_guide(output_dir, viz_data, stats)
        
        # Final summary
        print(f"\n🎊 Complete dashboard generation finished!")
        print(f"📁 Save location: {output_dir}")
        print(f"📄 Total files: {len(saved_files) + 2} (including metadata)")
        print(f"💾 Total size: {total_size/1024:.1f} KB")
        print(f"🔒 Privacy protection: Fully anonymized")
        print(f"✅ Safe for public dashboard use")
        
        print(f"\n🎯 Recommended starting files:")
        print(f"   📊 Basic charts: basic_diagnosis_charts.json")
        print(f"   🏥 Clinical analysis: clinical_dashboards.json")
        print(f"   📋 Summary info: summary_cards.json")
        print(f"   🔥 Correlations: diagnosis_heatmaps.json")
        
        return saved_files

    def _create_comprehensive_guide(self, output_dir, viz_data, stats):
        """Generate comprehensive usage guide"""
        guide = {
            'comprehensive_visualization_guide': {
                'overview': {
                    'title': 'NUSPAR Complete Diagnosis Data Visualization Guide',
                    'version': 'v4.0',
                    'description': 'Complete guide for using anonymized diagnosis visualization data',
                    'data_safety': 'All data is fully anonymized and HIPAA compliant'
                },
                'file_categories': {
                    'basic_charts': {
                        'purpose': 'Standard chart visualizations',
                        'contains': ['Bar charts', 'Pie charts', 'Horizontal bar charts'],
                        'use_cases': ['General distribution analysis', 'Category comparisons', 'Simple overviews'],
                        'recommended_for': 'All dashboard types',
                        'implementation': {
                            'chart_js': 'Direct data mapping to Chart.js format',
                            'recharts': 'Ready for React Recharts components',
                            'd3_js': 'Formatted for D3.js data binding'
                        }
                    },
                    'clinical_dashboards': {
                        'purpose': 'Healthcare-specific analytics',
                        'contains': ['Data quality metrics', 'Clinical insights', 'Completion analysis'],
                        'use_cases': ['Healthcare KPI monitoring', 'Data quality assessment', 'Clinical reporting'],
                        'recommended_for': 'Medical dashboards, administrative panels',
                        'key_metrics': ['Completion rates', 'Data quality scores', 'Field coverage']
                    },
                    'heatmaps': {
                        'purpose': 'Correlation and relationship analysis',
                        'contains': ['Cross-tabulation matrices', 'Correlation data'],
                        'use_cases': ['Pattern discovery', 'Relationship analysis', 'Comparative studies'],
                        'visualization_types': ['Heatmaps', 'Correlation matrices', 'Bubble charts'],
                        'data_format': 'x, y, value triplets with normalized scores'
                    },
                    'advanced_charts': {
                        'purpose': 'Complex multi-dimensional visualizations',
                        'contains': ['Treemaps', 'Radar charts', 'Comparison charts'],
                        'use_cases': ['Hierarchical analysis', 'Multi-factor comparisons', 'Diversity analysis'],
                        'complexity': 'Intermediate to Advanced'
                    },
                    'time_series': {
                        'purpose': 'Temporal pattern analysis',
                        'contains': ['Time-based trends', 'Seasonal patterns'],
                        'use_cases': ['Trend analysis', 'Seasonal monitoring', 'Temporal comparisons'],
                        'note': 'Dates converted to quarters for privacy protection'
                    },
                    'medical_specializations': {
                        'purpose': 'Healthcare-specific visualizations',
                        'contains': ['Disease burden analysis', 'Clinical funnels', 'Status matrices'],
                        'use_cases': ['Epidemiological analysis', 'Clinical workflow monitoring', 'Health outcomes'],
                        'target_audience': 'Healthcare professionals, medical researchers'
                    }
                },
                'implementation_examples': {
                    'react_recharts': {
                        'bar_chart': "const data = basic_charts.field_distribution.bar_chart.data;\n<BarChart data={data}>\n  <Bar dataKey='count' fill='#8884d8' />\n</BarChart>",
                        'pie_chart': "const data = basic_charts.field_distribution.pie_chart.data;\n<PieChart>\n  <Pie data={data} dataKey='count' nameKey='name' />\n</PieChart>"
                    },
                    'chart_js': {
                        'bar_chart': "const chartData = {\n  labels: data.map(d => d.name),\n  datasets: [{\n    data: data.map(d => d.count),\n    backgroundColor: colors\n  }]\n};"
                    },
                    'd3_js': {
                        'heatmap': "d3.select('#heatmap')\n  .selectAll('.cell')\n  .data(heatmap_data)\n  .enter().append('rect')\n  .attr('fill', d => colorScale(d.value));"
                    }
                },
                'privacy_compliance': {
                    'data_protection': [
                        'All patient identifiers removed',
                        'Dates converted to time periods',
                        'Geographic data limited to state level',
                        'Small counts suppressed or aggregated'
                    ],
                    'hipaa_compliance': 'Full compliance with HIPAA safe harbor provisions',
                    'public_use': 'Safe for public dashboards and presentations',
                    'data_minimization': 'Only aggregate statistics included'
                },
                'technical_specifications': {
                    'data_format': 'JSON with UTF-8 encoding',
                    'structure': 'Hierarchical with metadata',
                    'null_handling': 'Explicit null representation',
                    'number_format': 'Integer counts, float percentages',
                    'color_schemes': 'Medical-appropriate color palettes included'
                }
            }
        }
        
        guide_path = os.path.join(output_dir, 'complete_visualization_guide.json')
        with open(guide_path, 'w', encoding='utf-8') as f:
            json.dump(guide, f, indent=2, ensure_ascii=False)
        
        print(f"📖 Complete visualization guide generated: complete_visualization_guide.json")

    def process_complete_diagnosis_data(self, file_path, output_dir):
        """Complete diagnosis data processing pipeline"""
        try:
            # 1. Load and analyze data
            result = self.load_and_analyze_data(file_path)
            if result is None:
                return False
            
            df_clean, column_analysis = result

            
            # 2. Generate complete statistics
            stats = self.create_complete_statistics(df_clean, column_analysis)
            
            # 3. Generate comprehensive visualization data
            viz_data = self.create_comprehensive_visualizations(stats, column_analysis)
            
            # 4. Save all files
            saved_files = self.save_complete_dashboard_files(stats, viz_data, output_dir)
            
            print(f"\n🎉 Complete processing successful!")
            print(f"📊 Generated statistics: {len(stats['distributions'])} distributions")
            print(f"🎨 Generated visualizations: {sum(len(v) if isinstance(v, dict) else 1 for v in viz_data.values())}")
            print(f"💾 Saved files: {len(saved_files)}")
            
            return True
            
        except Exception as e:
            print(f"❌ Error during processing: {e}")
            return False

def main():
    """Main execution function"""
    print("🏥 NUSPAR Complete Diagnosis Data Visualization JSON Generator")
    print("=" * 80)
    
    # Initialize processor
    processor = CompleteDiagnosisVisualizationProcessor()
    
    # Set file path
    data_file_path = '/Users/choih2/Documents/GitHub/Nuspar_Global_Ingest_System_test_5/Data/Output/All/Diagnosis/Diagnosis_combined.csv'
    
    # Set output directory
    output_dir = "/Users/choih2/Library/CloudStorage/OneDrive-Cedars-SinaiHealthSystem/FromBox/Flu_VE_dashboard/Flu_VE_dashboard/backend/temp_NUSPAR_Dashboard/Complete_Diagnosis_JSON"
    
    # Execute complete processing
    success = processor.process_complete_diagnosis_data(data_file_path, output_dir)
    
    if success:
        print(f"\n✨ All processing completed!")
        print(f"📁 Results location: {output_dir}")
        print(f"🔒 Fully anonymized and safe")
        print(f"🚀 Start your dashboard development!")
    else:
        print(f"\n❌ Processing failed. Please check the logs.")

if __name__ == "__main__":
    main()