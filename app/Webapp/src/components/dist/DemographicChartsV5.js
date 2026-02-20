// src/components/DemographicCharts.tsx
"use client";
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
var react_1 = require("react");
var BarChart_1 = require("./BarChart");
var PieChartV3_1 = require("./PieChartV3");
var Histogram_1 = require("./Histogram");
var DonutChart_1 = require("./DonutChart");
var StackedBarChart_1 = require("./StackedBarChart");
function DemographicCharts() {
    var _this = this;
    // 각 데이터셋에 대한 개별 상태 관리
    var _a = react_1.useState(null), genderIdentityData = _a[0], setGenderIdentityData = _a[1];
    var _b = react_1.useState(null), legalSexData = _b[0], setLegalSexData = _b[1];
    var _c = react_1.useState(null), sexualOrientationData = _c[0], setSexualOrientationData = _c[1];
    var _d = react_1.useState(null), maritalStatusData = _d[0], setMaritalStatusData = _d[1];
    var _e = react_1.useState(null), veteranStatusData = _e[0], setVeteranStatusData = _e[1];
    var _f = react_1.useState(null), raceData = _f[0], setRaceData = _f[1];
    var _g = react_1.useState(null), ethnicityData = _g[0], setEthnicityData = _g[1];
    var _h = react_1.useState(null), languagesData = _h[0], setLanguagesData = _h[1];
    var _j = react_1.useState(null), needInterpreterData = _j[0], setNeedInterpreterData = _j[1];
    var _k = react_1.useState(null), religionData = _k[0], setReligionData = _k[1];
    var _l = react_1.useState(null), stateData = _l[0], setStateData = _l[1];
    var _m = react_1.useState(null), countryData = _m[0], setCountryData = _m[1];
    var _o = react_1.useState(null), cityData = _o[0], setCityData = _o[1];
    var _p = react_1.useState(null), occupationData = _p[0], setOccupationData = _p[1];
    var _q = react_1.useState(null), ageData = _q[0], setAgeData = _q[1];
    var _r = react_1.useState(null), age_marital_status_distribution = _r[0], setAgeMaritalStatusDistribution = _r[1];
    react_1.useEffect(function () {
        var loadData = function () { return __awaiter(_this, void 0, void 0, function () {
            var _a, genderIdentity, legalSex, sexualOrientation, maritalStatus, veteranStatus, race, ethnicity, languages, needInterpreter, religion, state, country, city, occupation, age, age_marital_status_distribution_1, error_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, Promise.all([
                                fetch("/json_data/demo_gender_identity_distribution.json").then(function (res) { return res.json(); }),
                                fetch("/json_data/demo_legal_sex_distribution.json").then(function (res) {
                                    return res.json();
                                }),
                                fetch("/json_data/demo_sexual_orientation_distribution.json").then(function (res) { return res.json(); }),
                                fetch("/json_data/demo_marital_status_distribution.json").then(function (res) { return res.json(); }),
                                fetch("/json_data/demo_veteran_status_distribution.json").then(function (res) { return res.json(); }),
                                fetch("/json_data/demo_race_distribution.json").then(function (res) {
                                    return res.json();
                                }),
                                fetch("/json_data/demo_ethnicity_distribution.json").then(function (res) {
                                    return res.json();
                                }),
                                fetch("/json_data/demo_languages_distribution.json").then(function (res) {
                                    return res.json();
                                }),
                                fetch("/json_data/demo_need_interpreter_distribution.json").then(function (res) { return res.json(); }),
                                fetch("/json_data/demo_religion_distribution.json").then(function (res) {
                                    return res.json();
                                }),
                                fetch("/json_data/demo_state_distribution.json").then(function (res) {
                                    return res.json();
                                }),
                                fetch("/json_data/demo_country_distribution.json").then(function (res) {
                                    return res.json();
                                }),
                                fetch("/json_data/demo_city_distribution.json").then(function (res) {
                                    return res.json();
                                }),
                                fetch("/json_data/demo_occupation_distribution.json").then(function (res) {
                                    return res.json();
                                }),
                                fetch("/json_data/age_distribution.json").then(function (res) { return res.json(); }),
                                fetch("/json_data/age_marital_status_distribution.json").then(function (res) {
                                    return res.json();
                                }),
                            ])];
                    case 1:
                        _a = _b.sent(), genderIdentity = _a[0], legalSex = _a[1], sexualOrientation = _a[2], maritalStatus = _a[3], veteranStatus = _a[4], race = _a[5], ethnicity = _a[6], languages = _a[7], needInterpreter = _a[8], religion = _a[9], state = _a[10], country = _a[11], city = _a[12], occupation = _a[13], age = _a[14], age_marital_status_distribution_1 = _a[15];
                        // 각 상태 업데이트
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
                        setAgeMaritalStatusDistribution(age_marital_status_distribution_1);
                        console.log("age_marital_status_distribution", age_marital_status_distribution_1);
                        return [3 /*break*/, 3];
                    case 2:
                        error_1 = _b.sent();
                        console.error("Error loading data:", error_1);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        }); };
        loadData();
    }, []);
    var ChartCard = function (_a) {
        var children = _a.children, title = _a.title;
        return (React.createElement("div", { className: "group bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm\n      rounded-xl border border-gray-100 dark:border-gray-700 \n      shadow-sm hover:shadow-xl transition-colors duration-300 \n      relative overflow-hidden\n      min-w-[300px] min-h-[200px] w-full\n      resize overflow-auto cursor-move\n      absolute inset-0" // absolute positioning 추가
         },
            React.createElement("div", { className: "px-5 py-4 h-full" },
                title && (React.createElement("div", { className: "border-b border-gray-100 dark:border-gray-700 pb-3 mb-4 \n            flex items-center justify-between\n            group-hover:border-blue-200 dark:group-hover:border-blue-800 \n            transition-colors duration-300" },
                    React.createElement("h3", { className: "text-sm font-semibold text-gray-800 dark:text-gray-200 \n              uppercase tracking-wider\n              group-hover:text-blue-600 dark:group-hover:text-blue-400\n              transition-colors duration-300" }, title))),
                React.createElement("div", { className: "h-[calc(100%-2rem)]" }, children))));
    };
    var _s = react_1.useState("all"), activeSection = _s[0], setActiveSection = _s[1];
    return (React.createElement("div", { className: "min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50 \n      dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 \n      transition-all duration-500" },
        React.createElement("div", { className: "max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8" },
            React.createElement("div", { className: "mb-8 bg-white/50 dark:bg-gray-800/50 backdrop-blur-lg \n          rounded-xl p-6 shadow-lg" },
                React.createElement("h1", { className: "text-2xl md:text-3xl font-bold bg-clip-text text-transparent \n            bg-gradient-to-r from-blue-600 to-purple-600 \n            dark:from-blue-400 dark:to-purple-400" }, "Demographics Dashboard"),
                React.createElement("p", { className: "mt-2 text-sm text-gray-600 dark:text-gray-400" }, "Comprehensive view of demographic data and distributions")),
            React.createElement("div", { className: "grid gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 \n          auto-rows-max animate-fade-in" },
                ageData && (React.createElement("div", { className: "xl:col-span-2 transition-all duration-300 ease-in-out hover:z-10" },
                    React.createElement(ChartCard, { title: "Age Distribution" },
                        React.createElement(Histogram_1.Histogram, { data: ageData, id: "age-histogram", width: 400, height: 300, bins: 30 })))),
                genderIdentityData && (React.createElement(React.Fragment, null,
                    React.createElement("div", { className: "transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: genderIdentityData.title },
                            React.createElement(BarChart_1.BarChart, { data: genderIdentityData.data, id: "gender-identity-bar", width: 400, height: 300 }))),
                    React.createElement("div", { className: "transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: genderIdentityData.title + " " },
                            React.createElement(DonutChart_1["default"], { data: genderIdentityData.data, id: "gender-identity-donut", width: 400, height: 300 }))))),
                legalSexData && (React.createElement(React.Fragment, null,
                    React.createElement("div", { className: "transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: legalSexData.title },
                            React.createElement(BarChart_1.BarChart, { data: legalSexData.data, id: "legal-sex-bar", width: 400, height: 300 }))),
                    React.createElement("div", { className: "transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: legalSexData.title + " " },
                            React.createElement(PieChartV3_1.PieChartV3, { data: legalSexData.data, id: "legal-sex-pie", width: 400, height: 300 }))))),
                sexualOrientationData && (React.createElement(React.Fragment, null,
                    React.createElement("div", { className: "transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: sexualOrientationData.title },
                            React.createElement(BarChart_1.BarChart, { data: sexualOrientationData.data, id: "sexual-orientation-bar", width: 400, height: 300 }))),
                    React.createElement("div", { className: "transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: sexualOrientationData.title + " " },
                            React.createElement(PieChartV3_1.PieChartV3, { data: sexualOrientationData.data, id: "sexual-orientation-pie", width: 400, height: 300 }))))),
                raceData && (React.createElement(React.Fragment, null,
                    React.createElement("div", { className: "xl:col-span-2 transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: raceData.title },
                            React.createElement(BarChart_1.BarChart, { data: raceData.data, id: "race-bar", width: 800, height: 300 }))),
                    React.createElement("div", { className: "xl:col-span-1 transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: "" + raceData.title },
                            React.createElement(PieChartV3_1.PieChartV3, { data: raceData.data, id: "race-pie", width: 400, height: 300 }))))),
                ethnicityData && (React.createElement(React.Fragment, null,
                    React.createElement("div", { className: "transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: ethnicityData.title },
                            React.createElement(BarChart_1.BarChart, { data: ethnicityData.data, id: "ethnicity-bar", width: 400, height: 300 }))),
                    React.createElement("div", { className: "transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: "" + ethnicityData.title },
                            React.createElement(PieChartV3_1.PieChartV3, { data: ethnicityData.data, id: "ethnicity-pie", width: 400, height: 300 }))))),
                languagesData && (React.createElement(React.Fragment, null,
                    React.createElement("div", { className: "xl:col-span-2 transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: languagesData.title },
                            React.createElement(BarChart_1.BarChart, { data: languagesData.data, id: "languages-bar", width: 800, height: 300 }))),
                    React.createElement("div", { className: "xl:col-span-1 transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: "" + languagesData.title },
                            React.createElement(PieChartV3_1.PieChartV3, { data: languagesData.data, id: "languages-pie", width: 400, height: 300 }))))),
                needInterpreterData && (React.createElement(React.Fragment, null,
                    React.createElement("div", { className: "transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: needInterpreterData.title },
                            React.createElement(BarChart_1.BarChart, { data: needInterpreterData.data, id: "need-interpreter-bar", width: 400, height: 300 }))),
                    React.createElement("div", { className: "transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: needInterpreterData.title + " " },
                            React.createElement(PieChartV3_1.PieChartV3, { data: needInterpreterData.data, id: "need-interpreter-pie", width: 400, height: 300 }))))),
                religionData && (React.createElement(React.Fragment, null,
                    React.createElement("div", { className: "xl:col-span-2 transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: religionData.title },
                            React.createElement(BarChart_1.BarChart, { data: religionData.data, id: "religion-bar", width: 800, height: 300 }))),
                    React.createElement("div", { className: "xl:col-span-1 transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: religionData.title + " " },
                            React.createElement(PieChartV3_1.PieChartV3, { data: religionData.data, id: "religion-pie", width: 400, height: 300 }))))),
                maritalStatusData && (React.createElement(React.Fragment, null,
                    React.createElement("div", { className: "transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: maritalStatusData.title },
                            React.createElement(BarChart_1.BarChart, { data: maritalStatusData.data, id: "marital-status-bar", width: 400, height: 300 }))),
                    React.createElement("div", { className: "transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: maritalStatusData.title + " " },
                            React.createElement(PieChartV3_1.PieChartV3, { data: maritalStatusData.data, id: "marital-status-pie", width: 400, height: 300 }))))),
                veteranStatusData && (React.createElement(React.Fragment, null,
                    React.createElement("div", { className: "transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: veteranStatusData.title },
                            React.createElement(BarChart_1.BarChart, { data: veteranStatusData.data, id: "veteran-status-bar", width: 400, height: 300 }))),
                    React.createElement("div", { className: "transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: "" + veteranStatusData.title },
                            React.createElement(PieChartV3_1.PieChartV3, { data: veteranStatusData.data, id: "veteran-status-pie", width: 400, height: 300 }))))),
                countryData && (React.createElement(React.Fragment, null,
                    React.createElement("div", { className: "xl:col-span-2 transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: countryData.title },
                            React.createElement(BarChart_1.BarChart, { data: countryData.data, id: "country-bar", width: 800, height: 300 }))),
                    React.createElement("div", { className: "xl:col-span-1 transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: countryData.title + " " },
                            React.createElement(PieChartV3_1.PieChartV3, { data: countryData.data, id: "country-pie", width: 400, height: 300 }))))),
                stateData && (React.createElement(React.Fragment, null,
                    React.createElement("div", { className: "xl:col-span-2 transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: stateData.title },
                            React.createElement(BarChart_1.BarChart, { data: stateData.data, id: "state-bar", width: 800, height: 300 }))),
                    React.createElement("div", { className: "xl:col-span-1 transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: "" + stateData.title },
                            React.createElement(PieChartV3_1.PieChartV3, { data: stateData.data, id: "state-pie", width: 400, height: 300 }))))),
                cityData && (React.createElement(React.Fragment, null,
                    React.createElement("div", { className: "xl:col-span-2 transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: cityData.title },
                            React.createElement(BarChart_1.BarChart, { data: cityData.data, id: "city-bar", width: 800, height: 300 }))),
                    React.createElement("div", { className: "xl:col-span-1 transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: "" + cityData.title },
                            React.createElement(PieChartV3_1.PieChartV3, { data: cityData.data, id: "city-pie", width: 400, height: 300 }))))),
                occupationData && (React.createElement(React.Fragment, null,
                    React.createElement("div", { className: "xl:col-span-2 transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: occupationData.title },
                            React.createElement(BarChart_1.BarChart, { data: occupationData.data, id: "occupation-bar", width: 800, height: 300 }))),
                    React.createElement("div", { className: "xl:col-span-1 transition-all duration-300 ease-in-out hover:z-10" },
                        React.createElement(ChartCard, { title: "" + occupationData.title },
                            React.createElement(PieChartV3_1.PieChartV3, { data: occupationData.data, id: "occupation-pie", width: 400, height: 300 }))))),
                age_marital_status_distribution && (React.createElement("div", { className: "xl:col-span-3 transition-all duration-300 ease-in-out hover:z-10" },
                    React.createElement(ChartCard, { title: "Age and Marital Status Distribution" },
                        React.createElement(StackedBarChart_1.StackedBarChart, { data: age_marital_status_distribution, id: "age-marital-status-chart", width: 1000, height: 400 }))))))));
}
exports["default"] = DemographicCharts;
