// src/constants/chartOptions.ts

export const CHART_IDS = {
  AGE: "age",
  GENDER: "gender",
  LEGAL_SEX: "legal-sex",
  SEXUAL_ORIENTATION: "sexual-orientation",
  RACE: "race",
  ETHNICITY: "ethnicity",
  LANGUAGES: "languages",
  INTERPRETER: "interpreter",
  RELIGION: "religion",
  MARITAL: "marital",
  VETERAN: "veteran",
  COUNTRY: "country",
  STATE: "state",
  CITY: "city",
  OCCUPATION: "occupation",
  AGE_MARITAL: "age-marital",
  RACE_RELIGION: "race-religion",
  STATE_RACE: "state-race",
  VETERAN_GENDER: "veteran-gender",

  // institutions
  ALL_INSTITUTIONS: "all-institutions",
  ALL: "all", // all combined data
  CEDARS: "cedars-sinai",
  OREGON: "oregon-health-science-university",
  STANFORD: "stanford-health-care",
} as const;

// Define ChartId type as a union type of values of CHART_IDS
export type ChartId = (typeof CHART_IDS)[keyof typeof CHART_IDS];

// Define ChartOption interface
export interface ChartOption {
  id: ChartId;
  label: string;
  category: "demographic" | "geographic" | "bivariate" | "institutions";
  width?: "normal" | "wide"; //
}

// Define chartOptions array
export const chartOptions: ChartOption[] = [
  { id: CHART_IDS.AGE, label: "Age Distribution", category: "demographic" },
  { id: CHART_IDS.GENDER, label: "Gender Identity", category: "demographic" },
  { id: CHART_IDS.LEGAL_SEX, label: "Legal Sex", category: "demographic" },
  {
    id: CHART_IDS.SEXUAL_ORIENTATION,
    label: "Sexual Orientation",
    category: "demographic",
  },
  { id: CHART_IDS.RACE, label: "Race", category: "demographic", width: "wide" },
  { id: CHART_IDS.ETHNICITY, label: "Ethnicity", category: "demographic" },
  {
    id: CHART_IDS.LANGUAGES,
    label: "Languages",
    category: "demographic",
    width: "wide",
  },
  {
    id: CHART_IDS.INTERPRETER,
    label: "Need Interpreter",
    category: "demographic",
  },
  {
    id: CHART_IDS.RELIGION,
    label: "Religion",
    category: "demographic",
    width: "wide",
  },
  { id: CHART_IDS.MARITAL, label: "Marital Status", category: "demographic" },
  { id: CHART_IDS.VETERAN, label: "Veteran Status", category: "demographic" },
  {
    id: CHART_IDS.COUNTRY,
    label: "Country",
    category: "geographic",
    width: "wide",
  },
  {
    id: CHART_IDS.STATE,
    label: "State",
    category: "geographic",
    width: "wide",
  },
  { id: CHART_IDS.CITY, label: "City", category: "geographic", width: "wide" },
  {
    id: CHART_IDS.OCCUPATION,
    label: "Occupation",
    category: "demographic",
    width: "wide",
  },
  {
    id: CHART_IDS.AGE_MARITAL,
    label: "Age and Marital Status",
    category: "bivariate",
    width: "wide",
  },
  {
    id: CHART_IDS.RACE_RELIGION,
    label: "Race and Religion",
    category: "bivariate",
    width: "wide",
  },
  {
    id: CHART_IDS.STATE_RACE,
    label: "State and Race",
    category: "bivariate",
    width: "wide",
  },
  {
    id: CHART_IDS.VETERAN_GENDER,
    label: "Veteran and Gender",
    category: "bivariate",
    width: "wide",
  },
  // institutions
  {
    // all charts in institutions category
    id: CHART_IDS.ALL_INSTITUTIONS,
    label: "All Institutions",
    category: "institutions",
    width: "wide",
  },

  // {
  //   // all combined data
  //   id: CHART_IDS.ALL,
  //   label: "Total Combined Data",
  //   category: "institutions",
  //   width: "wide",
  // },
  {
    id: CHART_IDS.CEDARS,
    label: "Cedars-Sinai",
    category: "institutions",
    width: "wide",
  },
  {
    id: CHART_IDS.OREGON,
    label: "Oregon Health Science University",
    category: "institutions",
    width: "wide",
  },
  {
    id: CHART_IDS.STANFORD,
    label: "Stanford Health Care",
    category: "institutions",
    width: "wide",
  },
];

// utility functions
export const getChartOption = (id: ChartId): ChartOption | undefined => {
  return chartOptions.find((option) => option.id === id);
};

export const getChartWidth = (id: ChartId): number => {
  const option = getChartOption(id);
  return option?.width === "wide" ? 800 : 400;
};

export const getCategoryCharts = (
  category: ChartOption["category"]
): ChartOption[] => {
  return chartOptions.filter((option) => option.category === category);
};

// Define chartGroups object
export const chartGroups = {
  demographic: getCategoryCharts("demographic"),
  geographic: getCategoryCharts("geographic"),
  bivariate: getCategoryCharts("bivariate"),
  institutions: getCategoryCharts("institutions"),
};
