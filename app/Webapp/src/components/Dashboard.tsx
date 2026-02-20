"use client";
import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart } from "./charts/d3js/BarChart";
import { PieChartV3 } from "./charts/d3js/PieChartV3";
import { Histogram } from "./charts/d3js/Histogram";

interface ChartData {
  category: string;
  count: number;
  percentage: number;
}

interface DistributionData {
  title: string;
  data: ChartData[];
}

const Dashboard = () => {
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
      } catch (error) {
        console.error("Error loading data:", error);
      }
    };

    loadData();
  }, []);

  return (
    <div className="w-full p-4">
      <div className="flex flex-col gap-4">
        {/* Age Distribution & Gender Identity */}
        <div className="flex gap-4 h-96">
          <Card className="flex-1 p-4">
            {ageData && (
              <>
                <h3 className="text-lg font-semibold mb-2">Age Distribution</h3>
                <Histogram
                  data={ageData}
                  title="Age Distribution"
                  id="age-histogram"
                  width={400}
                  height={300}
                  bins={30}
                />
              </>
            )}
          </Card>
          <Card className="flex-1 p-4">
            {genderIdentityData && (
              <>
                <h3 className="text-lg font-semibold mb-2">
                  {genderIdentityData.title}
                </h3>
                <PieChartV3
                  data={genderIdentityData.data}
                  title={genderIdentityData.title}
                  id="gender-identity-pie"
                />
              </>
            )}
          </Card>
        </div>

        {/* Legal Sex & Sexual Orientation */}
        <div className="flex gap-4 h-96">
          <Card className="flex-1 p-4">
            {legalSexData && (
              <>
                <h3 className="text-lg font-semibold mb-2">
                  {legalSexData.title}
                </h3>
                <BarChart
                  data={legalSexData.data}
                  title={legalSexData.title}
                  id="legal-sex-bar"
                />
              </>
            )}
          </Card>
          <Card className="flex-1 p-4">
            {sexualOrientationData && (
              <>
                <h3 className="text-lg font-semibold mb-2">
                  {sexualOrientationData.title}
                </h3>
                <PieChartV3
                  data={sexualOrientationData.data}
                  title={sexualOrientationData.title}
                  id="sexual-orientation-pie"
                />
              </>
            )}
          </Card>
        </div>

        {/* Race & Ethnicity */}
        <div className="flex gap-4 h-96">
          <Card className="flex-1 p-4">
            {raceData && (
              <>
                <h3 className="text-lg font-semibold mb-2">{raceData.title}</h3>
                <BarChart
                  data={raceData.data}
                  title={raceData.title}
                  id="race-bar"
                />
              </>
            )}
          </Card>
          <Card className="flex-1 p-4">
            {ethnicityData && (
              <>
                <h3 className="text-lg font-semibold mb-2">
                  {ethnicityData.title}
                </h3>
                <PieChartV3
                  data={ethnicityData.data}
                  title={ethnicityData.title}
                  id="ethnicity-pie"
                />
              </>
            )}
          </Card>
        </div>

        {/* Languages & Need Interpreter */}
        <div className="flex gap-4 h-96">
          <Card className="flex-1 p-4">
            {languagesData && (
              <>
                <h3 className="text-lg font-semibold mb-2">
                  {languagesData.title}
                </h3>
                <BarChart
                  data={languagesData.data}
                  title={languagesData.title}
                  id="languages-bar"
                />
              </>
            )}
          </Card>
          <Card className="flex-1 p-4">
            {needInterpreterData && (
              <>
                <h3 className="text-lg font-semibold mb-2">
                  {needInterpreterData.title}
                </h3>
                <PieChartV3
                  data={needInterpreterData.data}
                  title={needInterpreterData.title}
                  id="need-interpreter-pie"
                />
              </>
            )}
          </Card>
        </div>

        {/* Religion & Marital Status */}
        <div className="flex gap-4 h-96">
          <Card className="flex-1 p-4">
            {religionData && (
              <>
                <h3 className="text-lg font-semibold mb-2">
                  {religionData.title}
                </h3>
                <BarChart
                  data={religionData.data}
                  title={religionData.title}
                  id="religion-bar"
                />
              </>
            )}
          </Card>
          <Card className="flex-1 p-4">
            {maritalStatusData && (
              <>
                <h3 className="text-lg font-semibold mb-2">
                  {maritalStatusData.title}
                </h3>
                <PieChartV3
                  data={maritalStatusData.data}
                  title={maritalStatusData.title}
                  id="marital-status-pie"
                />
              </>
            )}
          </Card>
        </div>

        {/* Veteran Status & Country */}
        <div className="flex gap-4 h-96">
          <Card className="flex-1 p-4">
            {veteranStatusData && (
              <>
                <h3 className="text-lg font-semibold mb-2">
                  {veteranStatusData.title}
                </h3>
                <BarChart
                  data={veteranStatusData.data}
                  title={veteranStatusData.title}
                  id="veteran-status-bar"
                />
              </>
            )}
          </Card>
          <Card className="flex-1 p-4">
            {countryData && (
              <>
                <h3 className="text-lg font-semibold mb-2">
                  {countryData.title}
                </h3>
                <PieChartV3
                  data={countryData.data}
                  title={countryData.title}
                  id="country-pie"
                />
              </>
            )}
          </Card>
        </div>

        {/* State & City */}
        <div className="flex gap-4 h-96">
          <Card className="flex-1 p-4">
            {stateData && (
              <>
                <h3 className="text-lg font-semibold mb-2">
                  {stateData.title}
                </h3>
                <BarChart
                  data={stateData.data}
                  title={stateData.title}
                  id="state-bar"
                />
              </>
            )}
          </Card>
          <Card className="flex-1 p-4">
            {cityData && (
              <>
                <h3 className="text-lg font-semibold mb-2">{cityData.title}</h3>
                <PieChartV3
                  data={cityData.data}
                  title={cityData.title}
                  id="city-pie"
                />
              </>
            )}
          </Card>
        </div>

        {/* Occupation */}
        <div className="flex gap-4 h-96">
          <Card className="flex-1 p-4">
            {occupationData && (
              <>
                <h3 className="text-lg font-semibold mb-2">
                  {occupationData.title}
                </h3>
                <BarChart
                  data={occupationData.data}
                  title={occupationData.title}
                  id="occupation-bar"
                />
              </>
            )}
          </Card>
          <Card className="flex-1 p-4 flex items-center justify-center">
            <div className="text-lg text-gray-500">Additional Chart Space</div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
