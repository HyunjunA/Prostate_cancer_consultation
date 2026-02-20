// src/components/DemographicCharts.tsx
"use client";
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
exports.__esModule = true;
var react_1 = require("react");
var useDemographicData_1 = require("../hooks/useDemographicData");
var useFluVEData_1 = require("../hooks/useFluVEData");
var useXAxisSelectionStore_1 = require("../stores/useXAxisSelectionStore");
var useXAxisDragSelectionStore_1 = require("../stores/useXAxisDragSelectionStore");
var useCircleIndexStore_1 = require("../stores/useCircleIndexStore");
var useChartSelection_1 = require("../hooks/useChartSelection");
var ChartCard_1 = require("./ChartCard");
var FluVEDashboardHeader_1 = require("./FluVEDashboardHeader");
var ChartSettings_1 = require("./ChartSettings");
// chart using d3js imports
// import { FluVELineChart } from "./charts/d3js/FluVELineChart";
var FluVELineChartV3_1 = require("./charts/d3js/FluVELineChartV3");
// import { FluVELineChart } from "./charts/d3js/FluVELineChartV5";
// import { FluVELineChart } from "./charts/d3js/FluVELineChartV7";
// import { LineChartXaxisSelector } from "./charts/d3js/LineChartXaxisSelector";
var FluVELineChartXaxisSelectorV3_1 = require("./charts/d3js/FluVELineChartXaxisSelectorV3");
var BarChart_1 = require("./charts/d3js/BarChart");
var PieChartV3_1 = require("./charts/d3js/PieChartV3");
var Histogram_1 = require("./charts/d3js/Histogram");
var DonutChart_1 = require("./charts/d3js/DonutChart");
var StackedBarChart_1 = require("./charts/d3js/StackedBarChart");
var chartOptions_1 = require("../config/chartOptions");
// chart using plotly imports
// charts using plotly
// import ScatterPlot from "./charts/plotly/ScatterPlot";
// // import LineChart from "./charts/plotly/LineChart";
// import BarChartplotly from "./charts/plotly/BarChart";
// import PieChartplotly from "./charts/plotly/PieChart";
// import DonutChartPlotly from "./charts/plotly/DonutChart";
// import VotingScatter from "./charts/plotly/VotingScatter";
// import StackedBarChartplotly from "./charts/plotly/StackedBarChart";
// import OverlaidAreaChart from "./charts/plotly/OverlaidAreaChart";
// import SankeyDiagram from "./charts/plotly/SankeyDiagram";
// import DataTable from "./charts/plotly/DataTable";
// import CSVDataTable from "./charts/plotly/CSVDataTable";
// import GaussianLines from "./charts/plotly/GaussianLines";
var ReportDownload_1 = require("./ReportDownload");
function FluVECharts(isDarkMode) {
    var _a, _b, _c;
    console.log("FluVECharts isDarkMode", isDarkMode.isDarkMode);
    var _d = useDemographicData_1.useDemographicData(), genderIdentityData = _d.genderIdentityData, legalSexData = _d.legalSexData, sexualOrientationData = _d.sexualOrientationData, maritalStatusData = _d.maritalStatusData, veteranStatusData = _d.veteranStatusData, raceData = _d.raceData, ethnicityData = _d.ethnicityData, languagesData = _d.languagesData, needInterpreterData = _d.needInterpreterData, religionData = _d.religionData, stateData = _d.stateData, countryData = _d.countryData, cityData = _d.cityData, occupationData = _d.occupationData, ageData = _d.ageData, ageMaritalStatusDistribution = _d.ageMaritalStatusDistribution, raceReligionDistribution = _d.raceReligionDistribution, stateRaceDistribution = _d.stateRaceDistribution, veteranGenderDistribution = _d.veteranGenderDistribution;
    console.log("genderIdentityData", genderIdentityData);
    var _e = useFluVEData_1.useFluVEData(), fluData = _e.fluData, isLoading = _e.isLoading, error = _e.error;
    // useXAxisDragSelectionStore state
    var _f = useXAxisDragSelectionStore_1.useXAxisDragSelectionStore(), startDate = _f.startDate, endDate = _f.endDate, isDragging = _f.isDragging, isDoubleClicked = _f.isDoubleClicked;
    console.log("start and end date and isDragging, isDoubleClicked", {
        startDate: startDate,
        endDate: endDate,
        isDragging: isDragging,
        isDoubleClicked: isDoubleClicked
    });
    // please edit the fluDate to make it have data between startDate and endDate
    // make copy of fluData
    // 데이터 구조를 유지하면서 복사
    var processedFluData = __assign({}, fluData);
    if (startDate && endDate && (fluData === null || fluData === void 0 ? void 0 : fluData.data)) {
        processedFluData = __assign(__assign({}, fluData), { data: fluData.data.filter(function (d) {
                return d.week_ending >= startDate && d.week_ending <= endDate;
            }) });
    }
    console.log("777-processedFluData", processedFluData);
    // 이제 안전하게 length를 체크할 수 있습니다
    console.log("777-processedFluData.data.length", (_a = processedFluData === null || processedFluData === void 0 ? void 0 : processedFluData.data) === null || _a === void 0 ? void 0 : _a.length);
    // show startDate, endDate, isDragging, processedFluData in console as one object
    console.log("777-test", {
        startDate: startDate,
        endDate: endDate,
        isDragging: isDragging,
        processedFluData: processedFluData
    });
    var _g = useXAxisSelectionStore_1.useXAxisSelectionStore(), selectedDateOnXaxis = _g.selectedDateOnXaxis, setSelectedDateOnXaxis = _g.setSelectedDateOnXaxis;
    var _h = useCircleIndexStore_1.useCircleIndexStore(), 
    // The original moveCircle function from the API, renamed as moveCircleInStore
    // Function that changes the index based on left/right direction and data length
    moveCircleInStore = _h.moveCircle, 
    // The current selected index value stored in the store
    // -1 is initial value, can have values between 0 ~ (data.length-1)
    index = _h.index, 
    // Function that can directly set the index
    // Call with setIndex(newIndex) to change the index value
    setIndex = _h.setIndex;
    // const { currentIndexFluVELineChart, setCurrentIndexFluVELineChart } =
    //   useFluVELineChartIndexStore();
    react_1.useEffect(function () {
        console.log("selectedDateOnXaxis", selectedDateOnXaxis);
    }, [selectedDateOnXaxis]);
    // useEffect(() => {
    //   console.log("currentIndexFluVELineChart", currentIndexFluVELineChart);
    // }, [currentIndexFluVELineChart]);
    var _j = react_1.useState(0.5), markerPos = _j[0], setMarkerPos = _j[1];
    console.log("fluData", fluData);
    console.log("ageData", ageData);
    console.log("stateRaceDistribution", stateRaceDistribution);
    var _k = useChartSelection_1.useChartSelection(), selectedCharts = _k.selectedCharts, isSettingsOpen = _k.isSettingsOpen, setIsSettingsOpen = _k.setIsSettingsOpen, toggleChart = _k.toggleChart;
    return (react_1["default"].createElement("div", { className: "min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 transition-all duration-500" },
        react_1["default"].createElement(FluVEDashboardHeader_1.FluVEDashboardHeader, { isSettingsOpen: isSettingsOpen, setIsSettingsOpen: setIsSettingsOpen }),
        react_1["default"].createElement("div", { className: "max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8" },
            react_1["default"].createElement(ChartSettings_1.ChartSettings, { ageData: ageData, isSettingsOpen: isSettingsOpen, selectedCharts: selectedCharts, toggleChart: toggleChart }),
            react_1["default"].createElement("div", { className: "grid gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 auto-rows-max animate-fade-in" },
                fluData && (react_1["default"].createElement("div", { className: "col-span-full flex justify-center transform transition-all duration-300 " },
                    react_1["default"].createElement("div", { className: "w-full max-w-7xl" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: fluData.title },
                            react_1["default"].createElement(FluVELineChartXaxisSelectorV3_1.FluVELineChartXaxisSelector, { title: "", selectedDateOnXaxis: selectedDateOnXaxis, setSelectedDateOnXaxis: setSelectedDateOnXaxis, moveCircleInStore: moveCircleInStore, index: index, setIndex: setIndex, useCircleIndexStore: useCircleIndexStore_1.useCircleIndexStore, data: isDoubleClicked
                                    ? fluData.data // isDoubleClicked가 true일 경우 원본 데이터만 사용
                                    : startDate &&
                                        endDate &&
                                        isDragging === false &&
                                        ((_b = processedFluData === null || processedFluData === void 0 ? void 0 : processedFluData.data) === null || _b === void 0 ? void 0 : _b.length) >= 2
                                        ? processedFluData.data
                                        : fluData.data, id: "flu-ve-line-chart", width: 1600, height: 150, markerPos: markerPos, setMarkerPos: setMarkerPos, isDarkMode: isDarkMode.isDarkMode }),
                            react_1["default"].createElement(FluVELineChartV3_1.FluVELineChart, { title: fluData.title, data: isDoubleClicked
                                    ? fluData.data // isDoubleClicked가 true일 경우 원본 데이터만 사용
                                    : startDate &&
                                        endDate &&
                                        isDragging === false &&
                                        ((_c = processedFluData === null || processedFluData === void 0 ? void 0 : processedFluData.data) === null || _c === void 0 ? void 0 : _c.length) >= 2
                                        ? processedFluData.data
                                        : fluData.data, id: "flu-ve-line-chart", width: 1600, height: 800, selectedDateOnXaxis: selectedDateOnXaxis, setSelectedDateOnXaxis: setSelectedDateOnXaxis, setIndex: setIndex, useXAxisDragSelectionStore: useXAxisDragSelectionStore_1.useXAxisDragSelectionStore, isDarkMode: isDarkMode.isDarkMode }))))),
                selectedCharts.has(chartOptions_1.CHART_IDS.AGE) && ageData && (react_1["default"].createElement("div", { className: "xl:col-span-1 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                    react_1["default"].createElement(ChartCard_1.ChartCard, { title: "Age Distribution" },
                        react_1["default"].createElement(Histogram_1.Histogram, { data: ageData, id: "age-histogram", width: 400, height: 300, bins: 50 })))),
                selectedCharts.has(chartOptions_1.CHART_IDS.GENDER) && genderIdentityData && (react_1["default"].createElement(react_1["default"].Fragment, null,
                    react_1["default"].createElement("div", { className: "transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: genderIdentityData.title },
                            react_1["default"].createElement(BarChart_1.BarChart, { data: genderIdentityData.data, id: "gender-identity-bar", width: 400, height: 300 }))),
                    react_1["default"].createElement("div", { className: "transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: genderIdentityData.title + " " },
                            react_1["default"].createElement(DonutChart_1.DonutChart, { data: genderIdentityData.data, id: "gender-identity-donut", width: 400, height: 300, isDarkMode: isDarkMode.isDarkMode }))))),
                selectedCharts.has(chartOptions_1.CHART_IDS.LEGAL_SEX) && legalSexData && (react_1["default"].createElement(react_1["default"].Fragment, null,
                    react_1["default"].createElement("div", { className: "transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: legalSexData.title },
                            react_1["default"].createElement(BarChart_1.BarChart, { data: legalSexData.data, id: "legal-sex-bar", width: 400, height: 300 }))),
                    react_1["default"].createElement("div", { className: "transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: legalSexData.title + " " },
                            react_1["default"].createElement(PieChartV3_1.PieChartV3, { data: legalSexData.data, id: "legal-sex-pie", width: 400, height: 300, isDarkMode: isDarkMode.isDarkMode }))))),
                selectedCharts.has(chartOptions_1.CHART_IDS.SEXUAL_ORIENTATION) &&
                    sexualOrientationData && (react_1["default"].createElement(react_1["default"].Fragment, null,
                    react_1["default"].createElement("div", { className: "transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: sexualOrientationData.title },
                            react_1["default"].createElement(BarChart_1.BarChart, { data: sexualOrientationData.data, id: "sexual-orientation-bar", width: 400, height: 300 }))),
                    react_1["default"].createElement("div", { className: "transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: sexualOrientationData.title + " " },
                            react_1["default"].createElement(PieChartV3_1.PieChartV3, { data: sexualOrientationData.data, id: "sexual-orientation-pie", width: 400, height: 300, isDarkMode: isDarkMode.isDarkMode }))))),
                selectedCharts.has(chartOptions_1.CHART_IDS.RACE) && raceData && (react_1["default"].createElement(react_1["default"].Fragment, null,
                    react_1["default"].createElement("div", { className: "xl:col-span-2 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: raceData.title },
                            react_1["default"].createElement(BarChart_1.BarChart, { data: raceData.data, id: "race-bar", width: 800, height: 300 }))),
                    react_1["default"].createElement("div", { className: "xl:col-span-1 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: raceData.title + " " },
                            react_1["default"].createElement(PieChartV3_1.PieChartV3, { data: raceData.data, id: "race-pie", width: 400, height: 300, isDarkMode: isDarkMode.isDarkMode }))))),
                selectedCharts.has(chartOptions_1.CHART_IDS.ETHNICITY) && ethnicityData && (react_1["default"].createElement(react_1["default"].Fragment, null,
                    react_1["default"].createElement("div", { className: "transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: ethnicityData.title },
                            react_1["default"].createElement(BarChart_1.BarChart, { data: ethnicityData.data, id: "ethnicity-bar", width: 400, height: 300 }))),
                    react_1["default"].createElement("div", { className: "transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: ethnicityData.title + " " },
                            react_1["default"].createElement(PieChartV3_1.PieChartV3, { data: ethnicityData.data, id: "ethnicity-pie", width: 400, height: 300, isDarkMode: isDarkMode.isDarkMode }))))),
                selectedCharts.has(chartOptions_1.CHART_IDS.LANGUAGES) && languagesData && (react_1["default"].createElement(react_1["default"].Fragment, null,
                    react_1["default"].createElement("div", { className: "xl:col-span-2 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: languagesData.title },
                            react_1["default"].createElement(BarChart_1.BarChart, { data: languagesData.data, id: "languages-bar", width: 800, height: 300 }))),
                    react_1["default"].createElement("div", { className: "xl:col-span-1 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: languagesData.title + " " },
                            react_1["default"].createElement(PieChartV3_1.PieChartV3, { data: languagesData.data, id: "languages-pie", width: 400, height: 300, isDarkMode: isDarkMode.isDarkMode }))))),
                selectedCharts.has(chartOptions_1.CHART_IDS.INTERPRETER) && needInterpreterData && (react_1["default"].createElement(react_1["default"].Fragment, null,
                    react_1["default"].createElement("div", { className: "transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: needInterpreterData.title },
                            react_1["default"].createElement(BarChart_1.BarChart, { data: needInterpreterData.data, id: "need-interpreter-bar", width: 400, height: 300 }))),
                    react_1["default"].createElement("div", { className: "transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: needInterpreterData.title + " " },
                            react_1["default"].createElement(PieChartV3_1.PieChartV3, { data: needInterpreterData.data, id: "need-interpreter-pie", width: 400, height: 300, isDarkMode: isDarkMode.isDarkMode }))))),
                selectedCharts.has(chartOptions_1.CHART_IDS.RELIGION) && religionData && (react_1["default"].createElement(react_1["default"].Fragment, null,
                    react_1["default"].createElement("div", { className: "xl:col-span-2 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: religionData.title },
                            react_1["default"].createElement(BarChart_1.BarChart, { data: religionData.data, id: "religion-bar", width: 800, height: 300 }))),
                    react_1["default"].createElement("div", { className: "xl:col-span-1 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: religionData.title + " " },
                            react_1["default"].createElement(PieChartV3_1.PieChartV3, { data: religionData.data, id: "religion-pie", width: 400, height: 300, isDarkMode: isDarkMode.isDarkMode }))))),
                selectedCharts.has(chartOptions_1.CHART_IDS.MARITAL) && maritalStatusData && (react_1["default"].createElement(react_1["default"].Fragment, null,
                    react_1["default"].createElement("div", { className: "transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: maritalStatusData.title },
                            react_1["default"].createElement(BarChart_1.BarChart, { data: maritalStatusData.data, id: "marital-status-bar", width: 400, height: 300 }))),
                    react_1["default"].createElement("div", { className: "transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: maritalStatusData.title + " " },
                            react_1["default"].createElement(PieChartV3_1.PieChartV3, { data: maritalStatusData.data, id: "marital-status-pie", width: 400, height: 300, isDarkMode: isDarkMode.isDarkMode }))))),
                selectedCharts.has(chartOptions_1.CHART_IDS.VETERAN) && veteranStatusData && (react_1["default"].createElement(react_1["default"].Fragment, null,
                    react_1["default"].createElement("div", { className: "transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: veteranStatusData.title },
                            react_1["default"].createElement(BarChart_1.BarChart, { data: veteranStatusData.data, id: "veteran-status-bar", width: 400, height: 300 }))),
                    react_1["default"].createElement("div", { className: "transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: "" + veteranStatusData.title },
                            react_1["default"].createElement(PieChartV3_1.PieChartV3, { data: veteranStatusData.data, id: "veteran-status-pie", width: 400, height: 300, isDarkMode: isDarkMode.isDarkMode }))))),
                selectedCharts.has(chartOptions_1.CHART_IDS.COUNTRY) && countryData && (react_1["default"].createElement(react_1["default"].Fragment, null,
                    react_1["default"].createElement("div", { className: "xl:col-span-2 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: countryData.title },
                            react_1["default"].createElement(BarChart_1.BarChart, { data: countryData.data, id: "country-bar", width: 800, height: 300 }))),
                    react_1["default"].createElement("div", { className: "xl:col-span-1 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: "" + countryData.title },
                            react_1["default"].createElement(PieChartV3_1.PieChartV3, { data: countryData.data, id: "country-pie", width: 400, height: 300, isDarkMode: isDarkMode.isDarkMode }))))),
                selectedCharts.has(chartOptions_1.CHART_IDS.STATE) && stateData && (react_1["default"].createElement(react_1["default"].Fragment, null,
                    react_1["default"].createElement("div", { className: "xl:col-span-2 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: stateData.title },
                            react_1["default"].createElement(BarChart_1.BarChart, { data: stateData.data, id: "state-bar", width: 800, height: 300 }))),
                    react_1["default"].createElement("div", { className: "xl:col-span-1 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: stateData.title + " " },
                            react_1["default"].createElement(PieChartV3_1.PieChartV3, { data: stateData.data, id: "state-pie", width: 400, height: 300, isDarkMode: isDarkMode.isDarkMode }))))),
                selectedCharts.has(chartOptions_1.CHART_IDS.CITY) && cityData && (react_1["default"].createElement(react_1["default"].Fragment, null,
                    react_1["default"].createElement("div", { className: "xl:col-span-2 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: cityData.title },
                            react_1["default"].createElement(BarChart_1.BarChart, { data: cityData.data, id: "city-bar", width: 800, height: 300 }))),
                    react_1["default"].createElement("div", { className: "xl:col-span-1 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: cityData.title + " " },
                            react_1["default"].createElement(PieChartV3_1.PieChartV3, { data: cityData.data, id: "city-pie", width: 400, height: 300, isDarkMode: isDarkMode.isDarkMode }))))),
                selectedCharts.has(chartOptions_1.CHART_IDS.OCCUPATION) && occupationData && (react_1["default"].createElement(react_1["default"].Fragment, null,
                    react_1["default"].createElement("div", { className: "xl:col-span-2 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: occupationData.title },
                            react_1["default"].createElement(BarChart_1.BarChart, { data: occupationData.data, id: "occupation-bar", width: 800, height: 300 }))),
                    react_1["default"].createElement("div", { className: "xl:col-span-1 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                        react_1["default"].createElement(ChartCard_1.ChartCard, { title: "" + occupationData.title },
                            react_1["default"].createElement(PieChartV3_1.PieChartV3, { data: occupationData.data, id: "occupation-pie", width: 400, height: 300, isDarkMode: isDarkMode.isDarkMode }))))),
                selectedCharts.has(chartOptions_1.CHART_IDS.AGE_MARITAL) &&
                    ageMaritalStatusDistribution && (react_1["default"].createElement("div", { className: "xl:col-span-3 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                    react_1["default"].createElement(ChartCard_1.ChartCard, { title: "Age and Marital Status Distribution" },
                        react_1["default"].createElement(StackedBarChart_1.StackedBarChart, { data: ageMaritalStatusDistribution, id: "age-marital-status-chart", categoryField: "age_group", width: 1000, height: 400 })))),
                selectedCharts.has(chartOptions_1.CHART_IDS.RACE_RELIGION) &&
                    raceReligionDistribution && (react_1["default"].createElement("div", { className: "xl:col-span-3 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                    react_1["default"].createElement(ChartCard_1.ChartCard, { title: "Race and Religion Distribution" },
                        react_1["default"].createElement(StackedBarChart_1.StackedBarChart, { data: raceReligionDistribution, id: "race-religion-chart", categoryField: "race", width: 1000, height: 400 })))),
                selectedCharts.has(chartOptions_1.CHART_IDS.STATE_RACE) &&
                    stateRaceDistribution && (react_1["default"].createElement("div", { className: "xl:col-span-3 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                    react_1["default"].createElement(ChartCard_1.ChartCard, { title: "State and Race Distribution" },
                        react_1["default"].createElement(StackedBarChart_1.StackedBarChart, { data: stateRaceDistribution, id: "state-race-chart", categoryField: "state", width: 1000, height: 400 })))),
                selectedCharts.has(chartOptions_1.CHART_IDS.VETERAN_GENDER) &&
                    veteranGenderDistribution && (react_1["default"].createElement("div", { className: "xl:col-span-3 transform transition-all duration-300 ease-in-out hover:scale-[1.02] hover:z-10" },
                    react_1["default"].createElement(ChartCard_1.ChartCard, { title: "Veteran and Gender Distribution" },
                        react_1["default"].createElement(StackedBarChart_1.StackedBarChart, { data: veteranGenderDistribution, id: "veteran-gender-chart", categoryField: "demo_legal_sex", width: 1000, height: 400 })))))),
        react_1["default"].createElement(ReportDownload_1.ReportDownload, null)));
}
exports["default"] = FluVECharts;
