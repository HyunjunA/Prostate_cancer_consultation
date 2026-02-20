import React from "react";
import { BarChart } from "../components/charts/d3js/BarChart";
import { PieChartV3 } from "../components/charts/d3js/PieChartV3";
import { Histogram } from "../components/charts/d3js/Histogram";
import { StackedBarChart } from "../components/charts/d3js/StackedBarChart";
import { DemographicState } from "../hooks/useDemographicData";
import { ChartCard } from "../components/ChartCard";

export const renderCharts = (
  selectedCharts: Set<string>,
  data: DemographicState
) => {
  const charts: JSX.Element[] = [];

  // Age Distribution
  if (selectedCharts.has("age") && data.age) {
    charts.push(
      <div
        key="age"
        className="xl:col-span-1 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title="Age Distribution">
          <Histogram
            data={data.age}
            id="age-histogram"
            width={400}
            height={300}
            bins={50}
          />
        </ChartCard>
      </div>
    );
  }

  // Gender Identity
  if (selectedCharts.has("gender") && data.genderIdentity) {
    charts.push(
      <div
        key="gender-bar"
        className="transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={data.genderIdentity.title}>
          <BarChart
            data={data.genderIdentity.data}
            id="gender-identity-bar"
            width={400}
            height={300}
          />
        </ChartCard>
      </div>,
      <div
        key="gender-pie"
        className="transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={`${data.genderIdentity.title} `}>
          <PieChartV3
            data={data.genderIdentity.data}
            id="gender-identity-pie"
            width={400}
            height={300}
          />
        </ChartCard>
      </div>
    );
  }

  // Legal Sex
  if (selectedCharts.has("legal-sex") && data.legalSex) {
    charts.push(
      <div
        key="legal-sex-bar"
        className="transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={data.legalSex.title}>
          <BarChart
            data={data.legalSex.data}
            id="legal-sex-bar"
            width={400}
            height={300}
          />
        </ChartCard>
      </div>,
      <div
        key="legal-sex-pie"
        className="transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={`${data.legalSex.title} `}>
          <PieChartV3
            data={data.legalSex.data}
            id="legal-sex-pie"
            width={400}
            height={300}
          />
        </ChartCard>
      </div>
    );
  }

  // Sexual Orientation
  if (selectedCharts.has("sexual-orientation") && data.sexualOrientation) {
    charts.push(
      <div
        key="sexual-orientation-bar"
        className="transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={data.sexualOrientation.title}>
          <BarChart
            data={data.sexualOrientation.data}
            id="sexual-orientation-bar"
            width={400}
            height={300}
          />
        </ChartCard>
      </div>,
      <div
        key="sexual-orientation-pie"
        className="transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={`${data.sexualOrientation.title} `}>
          <PieChartV3
            data={data.sexualOrientation.data}
            id="sexual-orientation-pie"
            width={400}
            height={300}
          />
        </ChartCard>
      </div>
    );
  }

  // Race
  if (selectedCharts.has("race") && data.race) {
    charts.push(
      <div
        key="race-bar"
        className="xl:col-span-2 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={data.race.title}>
          <BarChart
            data={data.race.data}
            id="race-bar"
            width={800}
            height={300}
          />
        </ChartCard>
      </div>,
      <div
        key="race-pie"
        className="xl:col-span-1 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={`${data.race.title} `}>
          <PieChartV3
            data={data.race.data}
            id="race-pie"
            width={400}
            height={300}
          />
        </ChartCard>
      </div>
    );
  }

  // Ethnicity
  if (selectedCharts.has("ethnicity") && data.ethnicity) {
    charts.push(
      <div
        key="ethnicity-bar"
        className="transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={data.ethnicity.title}>
          <BarChart
            data={data.ethnicity.data}
            id="ethnicity-bar"
            width={400}
            height={300}
          />
        </ChartCard>
      </div>,
      <div
        key="ethnicity-pie"
        className="transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={`${data.ethnicity.title} `}>
          <PieChartV3
            data={data.ethnicity.data}
            id="ethnicity-pie"
            width={400}
            height={300}
          />
        </ChartCard>
      </div>
    );
  }

  // Languages
  if (selectedCharts.has("languages") && data.languages) {
    charts.push(
      <div
        key="languages-bar"
        className="xl:col-span-2 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={data.languages.title}>
          <BarChart
            data={data.languages.data}
            id="languages-bar"
            width={800}
            height={300}
          />
        </ChartCard>
      </div>,
      <div
        key="languages-pie"
        className="xl:col-span-1 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={`${data.languages.title} `}>
          <PieChartV3
            data={data.languages.data}
            id="languages-pie"
            width={400}
            height={300}
          />
        </ChartCard>
      </div>
    );
  }

  // Need Interpreter
  if (selectedCharts.has("interpreter") && data.needInterpreter) {
    charts.push(
      <div
        key="interpreter-bar"
        className="transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={data.needInterpreter.title}>
          <BarChart
            data={data.needInterpreter.data}
            id="need-interpreter-bar"
            width={400}
            height={300}
          />
        </ChartCard>
      </div>,
      <div
        key="interpreter-pie"
        className="transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={`${data.needInterpreter.title} `}>
          <PieChartV3
            data={data.needInterpreter.data}
            id="need-interpreter-pie"
            width={400}
            height={300}
          />
        </ChartCard>
      </div>
    );
  }

  // Religion
  if (selectedCharts.has("religion") && data.religion) {
    charts.push(
      <div
        key="religion-bar"
        className="xl:col-span-2 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={data.religion.title}>
          <BarChart
            data={data.religion.data}
            id="religion-bar"
            width={800}
            height={300}
          />
        </ChartCard>
      </div>,
      <div
        key="religion-pie"
        className="xl:col-span-1 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={`${data.religion.title} `}>
          <PieChartV3
            data={data.religion.data}
            id="religion-pie"
            width={400}
            height={300}
          />
        </ChartCard>
      </div>
    );
  }

  // Marital Status
  if (selectedCharts.has("marital") && data.maritalStatus) {
    charts.push(
      <div
        key="marital-bar"
        className="transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={data.maritalStatus.title}>
          <BarChart
            data={data.maritalStatus.data}
            id="marital-status-bar"
            width={400}
            height={300}
          />
        </ChartCard>
      </div>,
      <div
        key="marital-pie"
        className="transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={`${data.maritalStatus.title} `}>
          <PieChartV3
            data={data.maritalStatus.data}
            id="marital-status-pie"
            width={400}
            height={300}
          />
        </ChartCard>
      </div>
    );
  }

  // Veteran Status
  if (selectedCharts.has("veteran") && data.veteranStatus) {
    charts.push(
      <div
        key="veteran-bar"
        className="transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={data.veteranStatus.title}>
          <BarChart
            data={data.veteranStatus.data}
            id="veteran-status-bar"
            width={400}
            height={300}
          />
        </ChartCard>
      </div>,
      <div
        key="veteran-pie"
        className="transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={`${data.veteranStatus.title}`}>
          <PieChartV3
            data={data.veteranStatus.data}
            id="veteran-status-pie"
            width={400}
            height={300}
          />
        </ChartCard>
      </div>
    );
  }

  // Country
  if (selectedCharts.has("country") && data.country) {
    charts.push(
      <div
        key="country-bar"
        className="xl:col-span-2 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={data.country.title}>
          <BarChart
            data={data.country.data}
            id="country-bar"
            width={800}
            height={300}
          />
        </ChartCard>
      </div>,
      <div
        key="country-pie"
        className="xl:col-span-1 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={`${data.country.title}`}>
          <PieChartV3
            data={data.country.data}
            id="country-pie"
            width={400}
            height={300}
          />
        </ChartCard>
      </div>
    );
  }

  // State
  if (selectedCharts.has("state") && data.state) {
    charts.push(
      <div
        key="state-bar"
        className="xl:col-span-2 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={data.state.title}>
          <BarChart
            data={data.state.data}
            id="state-bar"
            width={800}
            height={300}
          />
        </ChartCard>
      </div>,
      <div
        key="state-pie"
        className="xl:col-span-1 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={`${data.state.title} `}>
          <PieChartV3
            data={data.state.data}
            id="state-pie"
            width={400}
            height={300}
          />
        </ChartCard>
      </div>
    );
  }

  // City
  if (selectedCharts.has("city") && data.city) {
    charts.push(
      <div
        key="city-bar"
        className="xl:col-span-2 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={data.city.title}>
          <BarChart
            data={data.city.data}
            id="city-bar"
            width={800}
            height={300}
          />
        </ChartCard>
      </div>,
      <div
        key="city-pie"
        className="xl:col-span-1 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={`${data.city.title} `}>
          <PieChartV3
            data={data.city.data}
            id="city-pie"
            width={400}
            height={300}
          />
        </ChartCard>
      </div>
    );
  }

  // Occupation
  if (selectedCharts.has("occupation") && data.occupation) {
    charts.push(
      <div
        key="occupation-bar"
        className="xl:col-span-2 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={data.occupation.title}>
          <BarChart
            data={data.occupation.data}
            id="occupation-bar"
            width={800}
            height={300}
          />
        </ChartCard>
      </div>,
      <div
        key="occupation-pie"
        className="xl:col-span-1 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title={`${data.occupation.title}`}>
          <PieChartV3
            data={data.occupation.data}
            id="occupation-pie"
            width={400}
            height={300}
          />
        </ChartCard>
      </div>
    );
  }

  // Bivariate Charts
  // Age and Marital Status Distribution
  if (selectedCharts.has("age-marital") && data.ageMaritalStatus) {
    charts.push(
      <div
        key="age-marital"
        className="xl:col-span-3 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title="Age and Marital Status Distribution">
          <StackedBarChart
            data={data.ageMaritalStatus}
            id="age-marital-status-chart"
            categoryField="age_group"
            width={1000}
            height={400}
          />
        </ChartCard>
      </div>
    );
  }

  // Race and Religion Distribution
  if (selectedCharts.has("race-religion") && data.raceReligion) {
    charts.push(
      <div
        key="race-religion"
        className="xl:col-span-3 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title="Race and Religion Distribution">
          <StackedBarChart
            data={data.raceReligion}
            id="race-religion-chart"
            categoryField="race"
            width={1000}
            height={400}
          />
        </ChartCard>
      </div>
    );
  }

  // State and Race Distribution
  if (selectedCharts.has("state-race") && data.stateRace) {
    charts.push(
      <div
        key="state-race"
        className="xl:col-span-3 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title="State and Race">
          <StackedBarChart
            data={data.stateRace}
            id="state-race-chart"
            categoryField="state"
            width={1000}
            height={400}
          />
        </ChartCard>
      </div>
    );
  }

  // Veteran and Gender Distribution
  if (selectedCharts.has("veteran-gender") && data.veteranGender) {
    charts.push(
      <div
        key="veteran-gender"
        className="xl:col-span-3 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10"
      >
        <ChartCard title="Veteran and Gender">
          <StackedBarChart
            data={data.veteranGender}
            id="veteran-gender"
            categoryField="veteran_status"
            width={1000}
            height={400}
          />
        </ChartCard>
      </div>
    );
  }

  return charts;
};
