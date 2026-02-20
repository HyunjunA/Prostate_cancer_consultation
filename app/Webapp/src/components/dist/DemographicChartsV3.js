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
var card_1 = require("@/components/ui/card");
var BarChart_1 = require("./BarChart");
var PieChartV3_1 = require("./PieChartV3");
var Histogram_1 = require("./Histogram");
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
    react_1.useEffect(function () {
        var loadData = function () { return __awaiter(_this, void 0, void 0, function () {
            var _a, genderIdentity, legalSex, sexualOrientation, maritalStatus, veteranStatus, race, ethnicity, languages, needInterpreter, religion, state, country, city, occupation, age, error_1;
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
                            ])];
                    case 1:
                        _a = _b.sent(), genderIdentity = _a[0], legalSex = _a[1], sexualOrientation = _a[2], maritalStatus = _a[3], veteranStatus = _a[4], race = _a[5], ethnicity = _a[6], languages = _a[7], needInterpreter = _a[8], religion = _a[9], state = _a[10], country = _a[11], city = _a[12], occupation = _a[13], age = _a[14];
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
    return (React.createElement("div", { className: "min-h-screen w-full" },
        React.createElement("div", { className: "w-full px-4 py-8" },
            React.createElement("h1", { className: "text-3xl font-bold mb-8 text-center" }, "Demographic Analysis"),
            React.createElement("div", { className: "w-full space-y-8" },
                ageData && (React.createElement("div", { className: "w-full" },
                    React.createElement("h2", { className: "text-2xl font-bold mb-6 text-center" }, "Age Distribution"),
                    React.createElement("div", { className: "flex justify-center" },
                        React.createElement("div", { className: "w-[80%]" },
                            React.createElement(card_1.Card, { className: "p-4" },
                                React.createElement("div", { className: "flex justify-center" },
                                    React.createElement(Histogram_1.Histogram, { data: ageData, title: "Age Distribution", id: "age-histogram", width: 500, height: 400, bins: 30 }))))))),
                genderIdentityData && (React.createElement("div", { className: "w-full" },
                    React.createElement("h2", { className: "text-2xl font-bold mb-6 text-center" }, genderIdentityData.title),
                    React.createElement("div", { className: "flex justify-center" },
                        React.createElement("div", { className: "w-[80%]" },
                            React.createElement(card_1.Card, { className: "p-4" },
                                React.createElement("div", { className: "flex flex-col md:flex-row justify-center items-center gap-6" },
                                    React.createElement(BarChart_1.BarChart, { data: genderIdentityData.data, title: genderIdentityData.title, id: "gender-identity-bar", width: 500, height: 400 }),
                                    React.createElement(PieChartV3_1.PieChartV3, { data: genderIdentityData.data, title: genderIdentityData.title, id: "gender-identity-pie", width: 500, height: 400 }))))))),
                legalSexData && (React.createElement("div", { className: "w-full" },
                    React.createElement("h2", { className: "text-2xl font-bold mb-6 text-center" }, legalSexData.title),
                    React.createElement("div", { className: "flex justify-center" },
                        React.createElement("div", { className: "w-[80%]" },
                            React.createElement(card_1.Card, { className: "p-4" },
                                React.createElement("div", { className: "flex flex-col md:flex-row justify-center items-center gap-6" },
                                    React.createElement(BarChart_1.BarChart, { data: legalSexData.data, title: legalSexData.title, id: "legal-sex-bar", width: 500, height: 400 }),
                                    React.createElement(PieChartV3_1.PieChartV3, { data: legalSexData.data, title: legalSexData.title, id: "legal-sex-pie", width: 500, height: 400 }))))))),
                raceData && (React.createElement("div", { className: "w-full" },
                    React.createElement("h2", { className: "text-2xl font-bold mb-6 text-center" }, raceData.title),
                    React.createElement("div", { className: "flex justify-center" },
                        React.createElement("div", { className: "w-[80%]" },
                            React.createElement(card_1.Card, { className: "p-4" },
                                React.createElement("div", { className: "flex flex-col md:flex-row justify-center items-center gap-6" },
                                    React.createElement(BarChart_1.BarChart, { data: raceData.data, title: raceData.title, id: "race-bar", width: 500, height: 400 }),
                                    React.createElement(PieChartV3_1.PieChartV3, { data: raceData.data, title: raceData.title, id: "race-pie", width: 500, height: 400 }))))))),
                ethnicityData && (React.createElement("div", { className: "w-full" },
                    React.createElement("h2", { className: "text-2xl font-bold mb-6 text-center" }, ethnicityData.title),
                    React.createElement("div", { className: "flex justify-center" },
                        React.createElement("div", { className: "w-[80%]" },
                            React.createElement(card_1.Card, { className: "p-4" },
                                React.createElement("div", { className: "flex flex-col md:flex-row justify-center items-center gap-6" },
                                    React.createElement(BarChart_1.BarChart, { data: ethnicityData.data, title: ethnicityData.title, id: "ethnicity-bar", width: 500, height: 400 }),
                                    React.createElement(PieChartV3_1.PieChartV3, { data: ethnicityData.data, title: ethnicityData.title, id: "ethnicity-pie", width: 500, height: 400 }))))))),
                religionData && (React.createElement("div", { className: "w-full" },
                    React.createElement("h2", { className: "text-2xl font-bold mb-6 text-center" }, religionData.title),
                    React.createElement("div", { className: "flex justify-center" },
                        React.createElement("div", { className: "w-[80%]" },
                            React.createElement(card_1.Card, { className: "p-4" },
                                React.createElement("div", { className: "flex flex-col md:flex-row justify-center items-center gap-6" },
                                    React.createElement(BarChart_1.BarChart, { data: religionData.data, title: religionData.title, id: "religion-bar", width: 500, height: 400 }),
                                    React.createElement(PieChartV3_1.PieChartV3, { data: religionData.data, title: religionData.title, id: "religion-pie", width: 500, height: 400 }))))))),
                countryData && (React.createElement("div", { className: "w-full" },
                    React.createElement("h2", { className: "text-2xl font-bold mb-6 text-center" }, countryData.title),
                    React.createElement("div", { className: "flex justify-center" },
                        React.createElement("div", { className: "w-[80%]" },
                            React.createElement(card_1.Card, { className: "p-4" },
                                React.createElement("div", { className: "flex flex-col md:flex-row justify-center items-center gap-6" },
                                    React.createElement(BarChart_1.BarChart, { data: countryData.data, title: countryData.title, id: "country-bar", width: 500, height: 400 }),
                                    React.createElement(PieChartV3_1.PieChartV3, { data: countryData.data, title: countryData.title, id: "country-pie", width: 500, height: 400 }))))))),
                cityData && (React.createElement("div", { className: "w-full" },
                    React.createElement("h2", { className: "text-2xl font-bold mb-6 text-center" }, cityData.title),
                    React.createElement("div", { className: "flex justify-center" },
                        React.createElement("div", { className: "w-[80%]" },
                            React.createElement(card_1.Card, { className: "p-4" },
                                React.createElement("div", { className: "flex flex-col md:flex-row justify-center items-center gap-6" },
                                    React.createElement(BarChart_1.BarChart, { data: cityData.data, title: cityData.title, id: "city-bar", width: 500, height: 400 }),
                                    React.createElement(PieChartV3_1.PieChartV3, { data: cityData.data, title: cityData.title, id: "city-pie", width: 500, height: 400 }))))))),
                occupationData && (React.createElement("div", { className: "w-full" },
                    React.createElement("h2", { className: "text-2xl font-bold mb-6 text-center" }, occupationData.title),
                    React.createElement("div", { className: "flex justify-center" },
                        React.createElement("div", { className: "w-[80%]" },
                            React.createElement(card_1.Card, { className: "p-4" },
                                React.createElement("div", { className: "flex flex-col md:flex-row justify-center items-center gap-6" },
                                    React.createElement(BarChart_1.BarChart, { data: occupationData.data, title: occupationData.title, id: "occupation-bar", width: 500, height: 400 }),
                                    React.createElement(PieChartV3_1.PieChartV3, { data: occupationData.data, title: occupationData.title, id: "occupation-pie", width: 500, height: 400 })))))))))));
}
exports["default"] = DemographicCharts;
