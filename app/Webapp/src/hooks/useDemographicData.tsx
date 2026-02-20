// src/hooks/useDemographicData.ts
import { useState, useEffect } from "react";

// 필요한 타입 정의들을 훅 파일 내부로 이동
export interface ChartData {
  category: string;
  count: number;
  percentage: number;
}

export interface DistributionData {
  title: string;
  data: ChartData[];
}

export const useDemographicData = () => {
  const [genderIdentityData, setGenderIdentityData] =
    useState<DistributionData | null>(null);
  const [legalSexData, setLegalSexData] = useState<DistributionData | null>(
    null
  );
  const [sexualOrientationData, setSexualOrientationData] =
    useState<DistributionData | null>(null);
  const [maritalStatusData, setMaritalStatusData] =
    useState<DistributionData | null>(null);
  const [veteranStatusData, setVeteranStatusData] =
    useState<DistributionData | null>(null);
  const [raceData, setRaceData] = useState<DistributionData | null>(null);
  const [ethnicityData, setEthnicityData] = useState<DistributionData | null>(
    null
  );
  const [languagesData, setLanguagesData] = useState<DistributionData | null>(
    null
  );
  const [needInterpreterData, setNeedInterpreterData] =
    useState<DistributionData | null>(null);
  const [religionData, setReligionData] = useState<DistributionData | null>(
    null
  );
  const [stateData, setStateData] = useState<DistributionData | null>(null);
  const [countryData, setCountryData] = useState<DistributionData | null>(null);
  const [cityData, setCityData] = useState<DistributionData | null>(null);
  const [occupationData, setOccupationData] = useState<DistributionData | null>(
    null
  );
  const [ageData, setAgeData] = useState<number[] | null>(null);
  const [ageMaritalStatusDistribution, setAgeMaritalStatusDistribution] =
    useState<any | null>(null);
  const [raceReligionDistribution, setRaceReligionDistribution] = useState<
    any | null
  >(null);
  const [stateRaceDistribution, setStateRaceDistribution] = useState<
    any | null
  >(null);
  const [veteranGenderDistribution, setVeteranGenderDistribution] = useState<
    any | null
  >(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [
          genderIdentity,
          legalSex,
          sexualOrientation,
          maritalStatus,
          veteranStatus,
          race,
          ethnicity,
          languages,
          needInterpreter,
          religion,
          state,
          country,
          city,
          occupation,
          age,
          ageMaritalStatus,
          raceReligion,
          stateRace,
          veteranGender,
        ] = await Promise.all([
          fetch("/json_data/demo_gender_identity_distribution.json").then(
            (res) => res.json()
          ),
          fetch("/json_data/demo_legal_sex_distribution.json").then((res) =>
            res.json()
          ),
          fetch("/json_data/demo_sexual_orientation_distribution.json").then(
            (res) => res.json()
          ),
          fetch("/json_data/demo_marital_status_distribution.json").then(
            (res) => res.json()
          ),
          fetch("/json_data/demo_veteran_status_distribution.json").then(
            (res) => res.json()
          ),
          fetch("/json_data/demo_race_distribution.json").then((res) =>
            res.json()
          ),
          fetch("/json_data/demo_ethnicity_distribution.json").then((res) =>
            res.json()
          ),
          fetch("/json_data/demo_languages_distribution.json").then((res) =>
            res.json()
          ),
          fetch("/json_data/demo_need_interpreter_distribution.json").then(
            (res) => res.json()
          ),
          fetch("/json_data/demo_religion_distribution.json").then((res) =>
            res.json()
          ),
          fetch("/json_data/demo_state_distribution.json").then((res) =>
            res.json()
          ),
          fetch("/json_data/demo_country_distribution.json").then((res) =>
            res.json()
          ),
          fetch("/json_data/demo_city_distribution.json").then((res) =>
            res.json()
          ),
          fetch("/json_data/demo_occupation_distribution.json").then((res) =>
            res.json()
          ),
          fetch("/json_data/age_distribution.json").then((res) => res.json()),
          fetch("/json_data/age_marital_status_distribution.json").then((res) =>
            res.json()
          ),
          fetch("/json_data/race_religion_distribution.json").then((res) =>
            res.json()
          ),
          fetch("/json_data/state_race_distribution.json").then((res) =>
            res.json()
          ),
          fetch("/json_data/veteran_gender_distribution.json").then((res) =>
            res.json()
          ),
        ]);

        setGenderIdentityData(genderIdentity);
        setLegalSexData(legalSex);
        setSexualOrientationData(sexualOrientation);
        setMaritalStatusData(maritalStatus);
        setVeteranStatusData(veteranStatus);
        setRaceData(race);
        setEthnicityData(ethnicity);
        setLanguagesData(languages);
        setNeedInterpreterData(needInterpreter);
        setReligionData(religion);
        setStateData(state);
        setCountryData(country);
        setCityData(city);
        setOccupationData(occupation);
        setAgeData(age.data);
        setAgeMaritalStatusDistribution(ageMaritalStatus);
        setRaceReligionDistribution(raceReligion);
        setStateRaceDistribution(stateRace);
        setVeteranGenderDistribution(veteranGender);
      } catch (error) {
        console.error("Error loading data:", error);
      }
    };

    loadData();
  }, []);

  return {
    genderIdentityData,
    legalSexData,
    sexualOrientationData,
    maritalStatusData,
    veteranStatusData,
    raceData,
    ethnicityData,
    languagesData,
    needInterpreterData,
    religionData,
    stateData,
    countryData,
    cityData,
    occupationData,
    ageData,
    ageMaritalStatusDistribution,
    raceReligionDistribution,
    stateRaceDistribution,
    veteranGenderDistribution,
  };
};
