// src/hooks/useNUSPARDemographicData.tsx
import { useState, useEffect } from "react";

export interface ChartData {
  category: string;
  count: number;
  percentage: number;
}

export interface DistributionData {
  title: string;
  data: ChartData[];
}

export interface TotalPatientsData {
  [organization: string]: {
    unique_patients: number;
  };
}

export const useNUSPARDemographicData = () => {
  const [patientData, setPatientData] = useState<any | null>(null);
  const [ageGroupDistribution, setAgeGroupDistribution] =
    useState<DistributionData | null>(null);
  const [diseaseDistribution, setDiseaseDistribution] =
    useState<DistributionData | null>(null);
  const [legalSexDistribution, setLegalSexDistribution] =
    useState<DistributionData | null>(null);
  const [raceDistribution, setRaceDistribution] =
    useState<DistributionData | null>(null);
  const [totalPatientsDistribution, setTotalPatientsDistribution] =
    useState<TotalPatientsData | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        // const data = await fetch("/json_nuspar_related/digo_data.json").then(
        //   (res) => res.json()
        // );

        // console.log("Patient data loaded:", data);
        // setPatientData(data);
        const [
          ageGroupDistribution,
          diseaseDistribution,
          legalSexDistribution,
          raceDistribution,
          totalPatientsDistribution,
        ] = await Promise.all([
          fetch("/json_nuspar_related/NUSPAR_age_group_distribution.json").then(
            (res) => res.json()
          ),
          fetch("/json_nuspar_related/NUSPAR_disease_distribution.json").then(
            (res) => res.json()
          ),
          fetch("/json_nuspar_related/NUSPAR_legal_sex_distribution.json").then(
            (res) => res.json()
          ),
          fetch("/json_nuspar_related/NUSPAR_race_distribution.json").then(
            (res) => res.json()
          ),
          fetch(
            "/json_nuspar_related/NUSPAR_total_patients_distribution.json"
          ).then((res) => res.json()),
        ]);

        setAgeGroupDistribution(ageGroupDistribution);
        setDiseaseDistribution(diseaseDistribution);
        setLegalSexDistribution(legalSexDistribution);
        setRaceDistribution(raceDistribution);
        setTotalPatientsDistribution(totalPatientsDistribution);

        // console.log(
        //   "NUSPAR-Age group distribution loaded:",
        //   ageGroupDistribution
        // );
        // console.log("NUSPAR-Disease distribution loaded:", diseaseDistribution);
        // console.log(
        //   "NUSPAR-Legal sex distribution loaded:",
        //   legalSexDistribution
        // );
        // console.log("NUSPAR-Race distribution loaded:", raceDistribution);
        // console.log("NUSPAR-Total patients distribution loaded:", totalPatientsDistribution);
      } catch (error) {
        console.error("Error loading data:", error);
      }
    };

    loadData();

    // setAgeGroupDistribution(ageGroupDistribution);
    // setDiseaseDistribution(diseaseDistribution);
    // setLegalSexDistribution(legalSexDistribution);
    // setRaceDistribution(raceDistribution);
  }, []);

  return {
    // patientData,
    ageGroupDistribution,
    diseaseDistribution,
    legalSexDistribution,
    raceDistribution,
    totalPatientsDistribution,
  };
};
