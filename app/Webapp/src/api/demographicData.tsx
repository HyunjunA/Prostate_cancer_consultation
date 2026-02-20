// This is demo code to show how to fetch data.
// The below json file locations will be replaced with actual API endpoints.

// api/demographicData.ts

interface EndpointConfig {
  [key: string]: string;
}

export const endpoints: EndpointConfig = {
  genderIdentity: "/json_data/demo_gender_identity_distribution.json",
  legalSex: "/json_data/demo_legal_sex_distribution.json",
  sexualOrientation: "/json_data/demo_sexual_orientation_distribution.json",
  maritalStatus: "/json_data/demo_marital_status_distribution.json",
  veteranStatus: "/json_data/demo_veteran_status_distribution.json",
  race: "/json_data/demo_race_distribution.json",
  ethnicity: "/json_data/demo_ethnicity_distribution.json",
  languages: "/json_data/demo_languages_distribution.json",
  needInterpreter: "/json_data/demo_need_interpreter_distribution.json",
  religion: "/json_data/demo_religion_distribution.json",
  state: "/json_data/demo_state_distribution.json",
  country: "/json_data/demo_country_distribution.json",
  city: "/json_data/demo_city_distribution.json",
  occupation: "/json_data/demo_occupation_distribution.json",
  age: "/json_data/age_distribution.json",
  ageMaritalStatus: "/json_data/age_marital_status_distribution.json",
  raceReligion: "/json_data/race_religion_distribution.json",
  stateRace: "/json_data/state_race_distribution.json",
  veteranGender: "/json_data/veteran_gender_distribution.json",
};

export const fetchDemographicData = async () => {
  try {
    const responses = await Promise.all(
      Object.entries(endpoints).map(async ([key, url]) => {
        try {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const data = await response.json();
          return [key, data];
        } catch (error) {
          console.error(`Error fetching ${key}:`, error);
          return [key, null]; // Return null for failed requests
        }
      })
    );

    return Object.fromEntries(responses);
  } catch (error) {
    console.error("Error in fetchDemographicData:", error);
    throw new Error("Failed to fetch demographic data");
  }
};

// Optional: Add response type definitions
export interface ChartData {
  category: string;
  count: number;
  percentage: number;
}

export interface DistributionData {
  title: string;
  data: ChartData[];
}

export interface DemographicResponse {
  genderIdentity: DistributionData | null;
  legalSex: DistributionData | null;
  sexualOrientation: DistributionData | null;
  maritalStatus: DistributionData | null;
  veteranStatus: DistributionData | null;
  race: DistributionData | null;
  ethnicity: DistributionData | null;
  languages: DistributionData | null;
  needInterpreter: DistributionData | null;
  religion: DistributionData | null;
  state: DistributionData | null;
  country: DistributionData | null;
  city: DistributionData | null;
  occupation: DistributionData | null;
  age: number[] | null;
  ageMaritalStatus: any | null; // Define specific type if known
  raceReligion: any | null; // Define specific type if known
  stateRace: any | null; // Define specific type if known
  veteranGender: any | null; // Define specific type if known
}
