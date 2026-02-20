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
// PatientReport.tsx
// Language: TypeScript/React (TailwindCSS for styling)
// NOTE: This file includes explicit "CHANGE" comments to make refactoring easy.
// ✅ TRACKING ADDED: data-track-proximity attributes for cursor proximity tracking
var react_1 = require("react");
var XLSX = require("xlsx");
/* ---------------------------------------------
   SMALL UTILS
---------------------------------------------- */
var cx = function () {
    var classes = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        classes[_i] = arguments[_i];
    }
    return classes.filter(Boolean).join(" ");
};
/* ---------------------------------------------
   CHANGE 4: Reusable Star Rating (Overall + per-topic feedback)
   ✅ TRACKING ADDED: trackingName prop for proximity tracking
---------------------------------------------- */
var StarRating = function (_a) {
    var value = _a.value, onChange = _a.onChange, label = _a.label, isDark = _a.isDark, trackingName = _a.trackingName;
    return (react_1["default"].createElement("div", { className: "flex items-center gap-3" },
        label && (react_1["default"].createElement("span", { className: cx("text-sm font-medium", isDark ? "text-slate-300" : "text-gray-700") }, label)),
        react_1["default"].createElement("div", { className: "flex items-center gap-1" }, [1, 2, 3, 4, 5].map(function (i) { return (react_1["default"].createElement("button", { key: i, type: "button", "aria-label": "Rate " + i, onClick: function () { return onChange(i); }, "data-track-proximity": trackingName ? trackingName + "_Star" + i : undefined, className: cx("w-8 h-8 rounded-full grid place-items-center border transition", isDark
                ? "border-slate-700 hover:bg-slate-800"
                : "border-gray-300 hover:bg-gray-100", value >= i
                ? isDark
                    ? "bg-blue-700 text-blue-100"
                    : "bg-blue-600 text-white"
                : isDark
                    ? "text-slate-400"
                    : "text-gray-500") }, "\u2605")); }))));
};
/* ---------------------------------------------
   MAIN COMPONENT
---------------------------------------------- */
var PatientReport = function (_a) {
    var _b, _c;
    var _d = _a.isDarkMode, isDarkMode = _d === void 0 ? false : _d;
    var _e = react_1.useState(null), patientData = _e[0], setPatientData = _e[1];
    var _f = react_1.useState(true), loading = _f[0], setLoading = _f[1];
    var _g = react_1.useState(null), error = _g[0], setError = _g[1];
    /* ---------------------------------------------
       CHANGE 1: IA Shift — Landing = Overall Summary
       - activeTab === null → landing (Overall Summary only).
       - Selecting a topic hides Overall Summary and shows that topic.
    ---------------------------------------------- */
    var _h = react_1.useState(null), activeTab = _h[0], setActiveTab = _h[1];
    /* ---------------------------------------------
       CHANGE 5: viewMode
       - "topics": landing + selected topic
       - "full": continuous view (Overall + all topics)
    ---------------------------------------------- */
    var _j = react_1.useState("topics"), viewMode = _j[0], setViewMode = _j[1];
    /* ---------------------------------------------
       CHANGE 4 (cont.): Ratings State
    ---------------------------------------------- */
    var _k = react_1.useState({ overall: 0 }), ratings = _k[0], setRatings = _k[1];
    /* ---------------------------------------------
       CHANGE 3: Key Statements default = collapsed
    ---------------------------------------------- */
    var _l = react_1.useState({}), showKeys = _l[0], setShowKeys = _l[1];
    /* ---------------------------------------------
       DATA: Sample + reader
       - Added "overallSummary" for landing card.
    ---------------------------------------------- */
    var generateSamplePatientData = function () {
        return {
            patientName: "Patient A",
            patientId: "P001",
            consultationDate: "September 4, 2025",
            physicianName: "Dr. Smith",
            /* CHANGE 1: New overall summary */
            overallSummary: "You have an intermediate-risk prostate cancer, on the higher end of the scale. Although the 15-year mortality risk (about 12%) is relatively low, your young age and long life expectancy make active treatment advisable. Surgery offers strong local control and future treatment options if needed. There is a 40–50% chance of recovering baseline erectile function, though recovery may take time and supportive therapies are available. Most patients regain bladder control within a year, and only a few require further procedures. Since you currently have minimal urinary symptoms, surgery may help avoid bladder irritation that can occur with radiation.Overall, proactive treatment provides the best long-term outlook.",
            consultationTopics: {
                "Cancer Prognosis": {
                    extractedSentences: [
                        "So 12% risk of death from prostate cancer at 15 years is small in the grand scheme of things",
                        "but it's a little bit too high for doctors, so 1 in 10 chance",
                        "actually 1.2 in 10 chance of dying of prostate cancer is too much",
                        "We would treat with surgery or radiation",
                        "For the majority of these unfavorable risks, I do recommend treatment",
                    ],
                    aiSummary: "Based on your situation, you have a tumor that is considered intermediate-risk, on the higher end. Given your young age, surgery offers good local control and options for future therapy if needed. While the long-term risk is not negligible, planning for the long term helps ensure the best outcomes."
                },
                "Life Expectancy": {
                    extractedSentences: [
                        "like i said, you've got 40 years ahead of you",
                        "so that's a good thing for a patient who has a lot of years ahead of them",
                        "but for a person like you who is young and has, you know, you know, you've got 40 years ahead of you",
                        "but for you, having many years ahead of you, you have an intermediate-risk tumor that's kind of on the high end of the intermediate-risk scale",
                        "but personally, i think, you know, you're a young man, you've got a ton of years ahead of you, surgery gives you good local control, and it gives you the options for salvage therapy if you need it in the future",
                    ],
                    aiSummary: "Your care team emphasized that you have many productive years ahead. This influences planning: there is enough time for cancer to progress if untreated, but also strong capacity to benefit from treatment and recovery."
                },
                "Erectile Dysfunction": {
                    extractedSentences: [
                        "For erectile function, again, I quoted you a 40-50% chance",
                        "of getting to your baseline function",
                        "Surgery gives you good local control",
                        "Recovery may take time",
                        "There are various treatment options available",
                    ],
                    aiSummary: "There is an estimated 40–50% chance of maintaining baseline erectile function. Recovery is gradual, and supportive options are available to help along the way."
                },
                "Urinary Incontinence": {
                    extractedSentences: [
                        "But by a year 90% of men will not need a pad beyond a year",
                        "and only 5% of men would need potentially a surgery",
                        "to correct a lot of leakage",
                        "Temporary incontinence may occur",
                        "Most patients improve over time",
                    ],
                    aiSummary: "Most patients recover bladder control within a year. A small minority need additional procedures; your team will monitor and support recovery."
                },
                "Irritative Urinary Symptoms": {
                    extractedSentences: [
                        "You don't really have many urinary symptoms now",
                        "no urgency, frequency, but those symptoms get worse after radiation",
                        "because the beam hits the bladder and makes the bladder irritable",
                        "Surgery may have fewer such symptoms",
                        "Most symptoms improve over time",
                    ],
                    aiSummary: "You have few urinary symptoms now. Radiation can temporarily irritate the bladder; surgical approaches often have fewer irritative symptoms. Any changes typically improve with healing."
                }
            }
        };
    };
    /* ORIGINAL: Load-from-Excel-first, fallback to sample */
    var loadPatientData = function () { return __awaiter(void 0, void 0, void 0, function () {
        var response, workbook, firstSheetName, worksheet, jsonData, processedData, fileError_1, sampleData, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 5, 6, 7]);
                    setLoading(true);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, window.fs.readFile("nlpextractedsentences_subset.xlsx")];
                case 2:
                    response = _a.sent();
                    workbook = XLSX.read(response, {
                        cellStyles: true,
                        cellFormulas: true,
                        cellDates: true,
                        cellNF: true,
                        sheetStubs: true
                    });
                    firstSheetName = workbook.SheetNames[0];
                    worksheet = workbook.Sheets[firstSheetName];
                    jsonData = XLSX.utils.sheet_to_json(worksheet);
                    processedData = processExcelDataForPatient(jsonData);
                    setPatientData(processedData);
                    return [3 /*break*/, 4];
                case 3:
                    fileError_1 = _a.sent();
                    console.log("Excel file not found. Using sample data.");
                    sampleData = generateSamplePatientData();
                    setPatientData(sampleData);
                    return [3 /*break*/, 4];
                case 4: return [3 /*break*/, 7];
                case 5:
                    err_1 = _a.sent();
                    setError("Error loading consultation data: " + err_1.message);
                    return [3 /*break*/, 7];
                case 6:
                    setLoading(false);
                    return [7 /*endfinally*/];
                case 7: return [2 /*return*/];
            }
        });
    }); };
    /* ORIGINAL: Processing stub (kept) */
    var processExcelDataForPatient = function (rawData) {
        // TODO: Map rawData -> {overallSummary, consultationTopics}
        return generateSamplePatientData();
    };
    react_1.useEffect(function () {
        loadPatientData();
        // Add print styles
        var style = document.createElement("style");
        style.textContent = "\n      @media print {\n        body * {\n          visibility: hidden;\n        }\n        #report-content, #report-content * {\n          visibility: visible;\n        }\n        #report-content {\n          position: absolute;\n          left: 0;\n          top: 0;\n          width: 100%;\n        }\n        .no-print {\n          display: none !important;\n        }\n        button {\n          display: none !important;\n        }\n        @page {\n          size: A4;\n          margin: 1.5cm;\n        }\n        * {\n          -webkit-print-color-adjust: exact !important;\n          print-color-adjust: exact !important;\n        }\n      }\n    ";
        document.head.appendChild(style);
        return function () {
            document.head.removeChild(style);
        };
    }, []);
    /* ORIGINAL: Topic keys + safe current topic pointer */
    var topicKeys = react_1.useMemo(function () { return (patientData ? Object.keys(patientData.consultationTopics) : []); }, [patientData]);
    var currentTopicData = activeTab
        ? (_b = patientData === null || patientData === void 0 ? void 0 : patientData.consultationTopics) === null || _b === void 0 ? void 0 : _b[activeTab] : null;
    /* CHANGE 3: Toggle key-statements visibility per topic */
    var toggleKeyVisibility = function (topic) {
        return setShowKeys(function (s) {
            var _a;
            return (__assign(__assign({}, s), (_a = {}, _a[topic] = !s[topic], _a)));
        });
    };
    /* CHANGE 4: Set per-topic rating */
    var setTopicRating = function (topic, v) {
        return setRatings(function (r) {
            var _a;
            return (__assign(__assign({}, r), (_a = {}, _a[topic] = v, _a)));
        });
    };
    /* PDF Download Handler */
    var handleDownloadPdf = function () { return __awaiter(void 0, void 0, void 0, function () {
        var originalViewMode, originalActiveTab;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    originalViewMode = viewMode;
                    originalActiveTab = activeTab;
                    setViewMode("full");
                    setActiveTab(null);
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 500); })];
                case 1:
                    _a.sent();
                    window.print();
                    setTimeout(function () {
                        setViewMode(originalViewMode);
                        setActiveTab(originalActiveTab);
                    }, 1000);
                    return [2 /*return*/];
            }
        });
    }); };
    /* ---------------------------------------------
       LOADING / ERROR STATES (unchanged styling)
    ---------------------------------------------- */
    if (loading) {
        return (react_1["default"].createElement("div", { className: cx("min-h-screen flex items-center justify-center", isDarkMode ? "bg-slate-950" : "bg-gray-50") },
            react_1["default"].createElement("div", { className: "text-center" },
                react_1["default"].createElement("div", { className: cx("animate-spin rounded-full h-12 w-12 border-b-2 mb-4 mx-auto", isDarkMode ? "border-blue-400" : "border-blue-600") }),
                react_1["default"].createElement("div", { className: cx("text-lg font-medium", isDarkMode ? "text-slate-300" : "text-gray-700") }, "Loading consultation summary..."))));
    }
    if (error) {
        return (react_1["default"].createElement("div", { className: cx("min-h-screen flex items-center justify-center p-8", isDarkMode ? "bg-slate-950" : "bg-gray-50") },
            react_1["default"].createElement("div", { className: cx("max-w-md w-full p-8 rounded-xl shadow-2xl", isDarkMode
                    ? "bg-red-950 border border-red-800"
                    : "bg-white border border-red-200") },
                react_1["default"].createElement("div", { className: "text-center" },
                    react_1["default"].createElement("div", { className: cx("w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center", isDarkMode ? "bg-red-900" : "bg-red-100") },
                        react_1["default"].createElement("svg", { className: cx("w-8 h-8", isDarkMode ? "text-red-400" : "text-red-600"), fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" },
                            react_1["default"].createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" }))),
                    react_1["default"].createElement("h2", { className: cx("text-xl font-semibold mb-2", isDarkMode ? "text-red-100" : "text-red-900") }, "Unable to Load Report"),
                    react_1["default"].createElement("p", { className: cx("mb-6 text-sm", isDarkMode ? "text-red-200" : "text-red-700") }, error),
                    react_1["default"].createElement("button", { onClick: loadPatientData, className: cx("px-6 py-2 rounded-lg text-sm font-medium transition-colors", isDarkMode
                            ? "bg-red-800 text-red-100 hover:bg-red-700"
                            : "bg-red-600 text-white hover:bg-red-700") }, "Try Again")))));
    }
    if (!patientData)
        return null;
    /* ---------------------------------------------
       PAGE SHELL
    ---------------------------------------------- */
    return (react_1["default"].createElement("div", { className: cx("min-h-screen", isDarkMode ? "bg-slate-950" : "bg-gray-50") },
        react_1["default"].createElement("div", { className: "max-w-6xl mx-auto", id: "report-content" },
            react_1["default"].createElement("div", { className: cx(isDarkMode
                    ? "bg-gradient-to-r from-slate-900 to-slate-800 border-b border-slate-700"
                    : "bg-gradient-to-r from-white to-gray-50 border-b border-gray-200", "shadow-lg") },
                react_1["default"].createElement("div", { className: "px-12 py-10" },
                    react_1["default"].createElement("div", { className: "text-center" },
                        react_1["default"].createElement("div", { className: cx("inline-flex items-center justify-center w-16 h-16 rounded-full mb-6", isDarkMode
                                ? "bg-blue-900 border-2 border-blue-700"
                                : "bg-blue-100 border-2 border-blue-300") },
                            react_1["default"].createElement("svg", { className: cx("w-8 h-8", isDarkMode ? "text-blue-400" : "text-blue-600"), fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" },
                                react_1["default"].createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" }))),
                        react_1["default"].createElement("h1", { className: cx("text-4xl font-light mb-3 tracking-wide", isDarkMode ? "text-slate-100" : "text-gray-900") }, "PATIENT CONSULTATION REPORT"),
                        react_1["default"].createElement("div", { className: cx("text-sm font-medium tracking-wider uppercase mb-8", isDarkMode ? "text-slate-400" : "text-gray-500") }, "Prostate Cancer Treatment Discussion Summary"),
                        react_1["default"].createElement("div", { className: "mb-8 no-print" },
                            react_1["default"].createElement("button", { onClick: handleDownloadPdf, "data-track-proximity": "PDFDownload_Button", className: cx("inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all", isDarkMode
                                    ? "bg-blue-700 text-blue-100 hover:bg-blue-600 shadow-lg hover:shadow-xl"
                                    : "bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-xl") },
                                react_1["default"].createElement("svg", { className: "w-5 h-5", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" },
                                    react_1["default"].createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" })),
                                react_1["default"].createElement("span", null, "Print / Save as PDF"))),
                        react_1["default"].createElement("div", { className: "mb-8 no-print" },
                            react_1["default"].createElement("div", { className: cx("inline-flex rounded-lg p-1", isDarkMode ? "bg-slate-800" : "bg-gray-100") },
                                react_1["default"].createElement("button", { onClick: function () { return setViewMode("topics"); }, "data-track-proximity": "ViewMode_Topics", className: cx("px-6 py-2 text-sm font-medium rounded-md transition-colors", viewMode === "topics"
                                        ? isDarkMode
                                            ? "bg-blue-700 text-blue-100"
                                            : "bg-blue-600 text-white"
                                        : isDarkMode
                                            ? "text-slate-400 hover:text-slate-200"
                                            : "text-gray-600 hover:text-gray-800") }, "Summary & Topics"),
                                react_1["default"].createElement("button", { onClick: function () { return setViewMode("full"); }, "data-track-proximity": "ViewMode_Full", className: cx("px-6 py-2 text-sm font-medium rounded-md transition-colors", viewMode === "full"
                                        ? isDarkMode
                                            ? "bg-blue-700 text-blue-100"
                                            : "bg-blue-600 text-white"
                                        : isDarkMode
                                            ? "text-slate-400 hover:text-slate-200"
                                            : "text-gray-600 hover:text-gray-800") }, "Full Report")),
                            react_1["default"].createElement("div", { className: cx("text-xs mt-2 text-center", isDarkMode ? "text-slate-500" : "text-gray-500") }, viewMode === "topics"
                                ? "Start with the overall summary, then explore topics."
                                : "View all topics continuously.")),
                        react_1["default"].createElement("div", { className: cx("grid grid-cols-1 md:grid-cols-3 gap-6 text-center", isDarkMode ? "text-slate-200" : "text-gray-700") },
                            react_1["default"].createElement("div", null,
                                react_1["default"].createElement("div", { className: cx("text-xs font-semibold uppercase tracking-wider mb-1", isDarkMode ? "text-slate-400" : "text-gray-500") }, "Patient"),
                                react_1["default"].createElement("div", { className: "text-lg font-medium" }, patientData.patientName),
                                react_1["default"].createElement("div", { className: cx("text-sm", isDarkMode ? "text-slate-400" : "text-gray-500") },
                                    "ID: ",
                                    patientData.patientId)),
                            react_1["default"].createElement("div", null,
                                react_1["default"].createElement("div", { className: cx("text-xs font-semibold uppercase tracking-wider mb-1", isDarkMode ? "text-slate-400" : "text-gray-500") }, "Consultation Date"),
                                react_1["default"].createElement("div", { className: "text-lg font-medium" }, patientData.consultationDate)),
                            react_1["default"].createElement("div", null,
                                react_1["default"].createElement("div", { className: cx("text-xs font-semibold uppercase tracking-wider mb-1", isDarkMode ? "text-slate-400" : "text-gray-500") }, "Attending Physician"),
                                react_1["default"].createElement("div", { className: "text-lg font-medium" }, patientData.physicianName)))))),
            viewMode === "topics" ? (react_1["default"].createElement("div", { className: cx(isDarkMode ? "bg-slate-900" : "bg-white", "shadow-xl min-h-screen") },
                react_1["default"].createElement("div", { className: "px-6 lg:px-12 py-12 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-10" },
                    react_1["default"].createElement("div", null,
                        activeTab === null && (react_1["default"].createElement("section", { "data-track-proximity": "OverallSummary_Card", className: cx("p-8 rounded-xl mb-10", isDarkMode
                                ? "bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600"
                                : "bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200") },
                            react_1["default"].createElement("div", { className: "flex items-start justify-between gap-4 mb-6" },
                                react_1["default"].createElement("h2", { className: cx("text-2xl font-semibold", isDarkMode ? "text-slate-100" : "text-gray-900") }, "Overall Summary"),
                                react_1["default"].createElement(StarRating, { value: ratings.overall || 0, onChange: function (v) {
                                        return setRatings(function (r) { return (__assign(__assign({}, r), { overall: v })); });
                                    }, label: "Was this helpful?", isDark: isDarkMode, trackingName: "OverallSummary_Rating" })),
                            react_1["default"].createElement("p", { className: cx("text-lg leading-relaxed", isDarkMode ? "text-slate-300" : "text-gray-700") }, patientData.overallSummary))),
                        activeTab !== null && (react_1["default"].createElement("section", null,
                            react_1["default"].createElement("div", { className: "mb-8" },
                                react_1["default"].createElement("div", { className: "flex items-center mb-3" },
                                    react_1["default"].createElement("div", { className: cx("flex items-center justify-center w-14 h-14 rounded-full mr-4", isDarkMode
                                            ? "bg-blue-900 border-2 border-blue-700"
                                            : "bg-blue-100 border-2 border-blue-300") },
                                        react_1["default"].createElement("span", { className: cx("text-xl font-bold", isDarkMode ? "text-blue-300" : "text-blue-700") }, topicKeys.indexOf(activeTab) + 1 || 1)),
                                    react_1["default"].createElement("h3", { className: cx("text-2xl font-semibold tracking-wide", isDarkMode ? "text-slate-100" : "text-gray-900") }, activeTab))),
                            react_1["default"].createElement("div", { "data-track-proximity": "TopicSummary_" + (activeTab === null || activeTab === void 0 ? void 0 : activeTab.replace(/\s+/g, "")), className: cx("p-8 rounded-xl mb-6", isDarkMode
                                    ? "bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600"
                                    : "bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200") },
                                react_1["default"].createElement("div", { className: "flex items-start justify-between gap-4 mb-6" },
                                    react_1["default"].createElement("h4", { className: cx("text-xl font-semibold", isDarkMode ? "text-slate-200" : "text-gray-800") },
                                        "Summary for ",
                                        activeTab),
                                    react_1["default"].createElement(StarRating, { value: ratings[activeTab] || 0, onChange: function (v) { return setTopicRating(activeTab, v); }, label: "Rate clarity", isDark: isDarkMode, trackingName: "TopicRating_" + (activeTab === null || activeTab === void 0 ? void 0 : activeTab.replace(/\s+/g, "")) })),
                                react_1["default"].createElement("p", { className: cx("text-lg leading-relaxed", isDarkMode ? "text-slate-300" : "text-gray-700") }, currentTopicData === null || currentTopicData === void 0 ? void 0 : currentTopicData.aiSummary)),
                            react_1["default"].createElement("div", { className: "mb-8" },
                                react_1["default"].createElement("button", { type: "button", onClick: function () { return toggleKeyVisibility(activeTab); }, "data-track-proximity": "ToggleKeyStatements_" + (activeTab === null || activeTab === void 0 ? void 0 : activeTab.replace(/\s+/g, "")), className: cx("px-4 py-2 rounded-lg text-sm font-medium mb-4", isDarkMode
                                        ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
                                        : "bg-gray-100 text-gray-700 hover:bg-gray-200") }, showKeys[activeTab]
                                    ? "Hide key statements"
                                    : "Show key statements"),
                                showKeys[activeTab] && (react_1["default"].createElement("div", { "data-track-proximity": "KeyStatements_" + (activeTab === null || activeTab === void 0 ? void 0 : activeTab.replace(/\s+/g, "")) },
                                    react_1["default"].createElement("h4", { className: cx("text-lg font-semibold mb-5", isDarkMode ? "text-slate-200" : "text-gray-800") }, "Key Statements from Consultation"),
                                    react_1["default"].createElement("div", { className: "space-y-3" }, (_c = currentTopicData === null || currentTopicData === void 0 ? void 0 : currentTopicData.extractedSentences) === null || _c === void 0 ? void 0 : _c.map(function (sentence, idx) { return (react_1["default"].createElement("div", { key: idx, className: cx("group relative p-4 rounded-lg transition-all duration-200", isDarkMode
                                            ? "bg-slate-800 border border-slate-700 hover:border-blue-600 hover:shadow-lg hover:shadow-blue-900/20"
                                            : "bg-white border border-gray-200 hover:border-blue-400 hover:shadow-md") },
                                        react_1["default"].createElement("div", { className: "flex items-start gap-3" },
                                            react_1["default"].createElement("div", { className: cx("flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold", isDarkMode
                                                    ? "bg-blue-900 text-blue-300 border border-blue-700"
                                                    : "bg-blue-100 text-blue-700 border border-blue-200") }, idx + 1),
                                            react_1["default"].createElement("div", { className: cx("flex-shrink-0 text-2xl leading-none mt-1 opacity-40", isDarkMode
                                                    ? "text-blue-400"
                                                    : "text-blue-500") }, "\""),
                                            react_1["default"].createElement("p", { className: cx("flex-1 text-base leading-relaxed", isDarkMode
                                                    ? "text-slate-300"
                                                    : "text-gray-700") }, sentence)))); })))))))),
                    react_1["default"].createElement("aside", { className: cx("lg:sticky lg:top-6 h-max no-print") },
                        react_1["default"].createElement("div", { className: cx("rounded-2xl p-4", isDarkMode
                                ? "bg-slate-800 border border-slate-700"
                                : "bg-white border border-gray-200 shadow-sm") },
                            react_1["default"].createElement("h3", { className: cx("text-sm font-semibold mb-3", isDarkMode ? "text-slate-200" : "text-gray-800") }, "Navigate"),
                            react_1["default"].createElement("div", { className: "space-y-2" },
                                react_1["default"].createElement("button", { type: "button", onClick: function () { return setActiveTab(null); }, "data-track-proximity": "Nav_OverallSummary", className: cx("w-full text-left px-3 py-2 rounded-lg text-sm font-medium", activeTab === null
                                        ? isDarkMode
                                            ? "bg-blue-700 text-blue-100"
                                            : "bg-blue-600 text-white"
                                        : isDarkMode
                                            ? "text-slate-300 hover:bg-slate-700"
                                            : "text-gray-700 hover:bg-gray-100") }, "Overall Summary"),
                                topicKeys.map(function (topic, idx) { return (react_1["default"].createElement("button", { type: "button", key: topic, onClick: function () { return setActiveTab(topic); }, "data-track-proximity": "Nav_Topic_" + topic.replace(/\s+/g, ""), className: cx("w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2", activeTab === topic
                                        ? isDarkMode
                                            ? "bg-blue-700 text-blue-100"
                                            : "bg-blue-600 text-white"
                                        : isDarkMode
                                            ? "text-slate-300 hover:bg-slate-700"
                                            : "text-gray-700 hover:bg-gray-100") },
                                    react_1["default"].createElement("span", { className: cx("inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold", activeTab === topic
                                            ? isDarkMode
                                                ? "bg-blue-800 text-blue-200"
                                                : "bg-blue-500 text-white"
                                            : isDarkMode
                                                ? "bg-slate-700 text-slate-300"
                                                : "bg-gray-200 text-gray-700") }, idx + 1),
                                    topic)); }))))))) : (
            /* FULL MODE: Continuous reading — Overall at top + all topics,
               and CHANGE 6 applied: Key Statements shown BELOW each topic Summary. */
            react_1["default"].createElement("div", { className: cx(isDarkMode ? "bg-slate-900" : "bg-white", "shadow-xl min-h-screen") },
                react_1["default"].createElement("div", { className: "px-12 py-12" },
                    react_1["default"].createElement("div", { className: "text-center mb-12" },
                        react_1["default"].createElement("h2", { className: cx("text-3xl font-semibold tracking-wide mb-4", isDarkMode ? "text-slate-100" : "text-gray-900") }, "Complete Consultation Summary"),
                        react_1["default"].createElement("div", { className: cx("text-sm font-medium uppercase tracking-wider", isDarkMode ? "text-slate-400" : "text-gray-500") }, "All Discussion Topics")),
                    react_1["default"].createElement("section", { "data-track-proximity": "FullMode_OverallSummary", className: cx("p-8 rounded-xl mb-12", isDarkMode
                            ? "bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600"
                            : "bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200") },
                        react_1["default"].createElement("div", { className: "flex items-start justify-between gap-4 mb-6" },
                            react_1["default"].createElement("h3", { className: cx("text-2xl font-semibold", isDarkMode ? "text-slate-100" : "text-gray-900") }, "Overall Summary"),
                            react_1["default"].createElement(StarRating, { value: ratings.overall || 0, onChange: function (v) { return setRatings(function (r) { return (__assign(__assign({}, r), { overall: v })); }); }, label: "Was this helpful?", isDark: isDarkMode, trackingName: "FullMode_OverallRating" })),
                        react_1["default"].createElement("p", { className: cx("text-lg leading-relaxed", isDarkMode ? "text-slate-300" : "text-gray-700") }, patientData.overallSummary)),
                    react_1["default"].createElement("div", { className: "py-8" },
                        react_1["default"].createElement("div", { className: cx("border-t-2", isDarkMode ? "border-slate-700" : "border-gray-300") })),
                    Object.entries(patientData.consultationTopics).map(function (_a, index) {
                        var topicName = _a[0], topicData = _a[1];
                        return (react_1["default"].createElement("div", { key: topicName, className: "relative", "data-track-proximity": "FullMode_Topic_" + topicName.replace(/\s+/g, "") },
                            react_1["default"].createElement("div", { className: "flex items-center mb-6" },
                                react_1["default"].createElement("div", { className: cx("flex items-center justify-center w-12 h-12 rounded-full mr-6", isDarkMode
                                        ? "bg-blue-900 border-2 border-blue-700"
                                        : "bg-blue-100 border-2 border-blue-300") },
                                    react_1["default"].createElement("span", { className: cx("text-lg font-bold", isDarkMode ? "text-blue-300" : "text-blue-700") }, index + 1)),
                                react_1["default"].createElement("div", null,
                                    react_1["default"].createElement("h2", { className: cx("text-2xl font-semibold tracking-wide", isDarkMode ? "text-slate-100" : "text-gray-900") }, topicName))),
                            react_1["default"].createElement("div", { "data-track-proximity": "FullMode_Summary_" + topicName.replace(/\s+/g, ""), className: cx("p-8 rounded-xl mb-6", isDarkMode
                                    ? "bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600"
                                    : "bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200") },
                                react_1["default"].createElement("div", { className: "flex items-start justify-between gap-4 mb-6" },
                                    react_1["default"].createElement("h3", { className: cx("text-lg font-semibold", isDarkMode ? "text-slate-200" : "text-gray-800") }, "Summary"),
                                    react_1["default"].createElement(StarRating, { value: ratings[topicName] || 0, onChange: function (v) { return setTopicRating(topicName, v); }, label: "Rate clarity", isDark: isDarkMode, trackingName: "FullMode_Rating_" + topicName.replace(/\s+/g, "") })),
                                react_1["default"].createElement("p", { className: cx("text-base leading-relaxed", isDarkMode ? "text-slate-300" : "text-gray-700") }, topicData.aiSummary)),
                            react_1["default"].createElement("div", { className: "mb-12" },
                                react_1["default"].createElement("button", { type: "button", onClick: function () { return toggleKeyVisibility(topicName); }, "data-track-proximity": "FullMode_ToggleKey_" + topicName.replace(/\s+/g, ""), className: cx("px-4 py-2 rounded-lg text-sm font-medium mb-4", isDarkMode
                                        ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
                                        : "bg-gray-100 text-gray-700 hover:bg-gray-200") }, showKeys[topicName]
                                    ? "Hide key statements"
                                    : "Show key statements"),
                                showKeys[topicName] && (react_1["default"].createElement("div", { "data-track-proximity": "FullMode_KeyStatements_" + topicName.replace(/\s+/g, "") },
                                    react_1["default"].createElement("h3", { className: cx("text-lg font-semibold mb-5", isDarkMode ? "text-slate-200" : "text-gray-800") }, "Key Statements from Consultation"),
                                    react_1["default"].createElement("div", { className: "space-y-3" }, topicData.extractedSentences.map(function (sentence, idx) { return (react_1["default"].createElement("div", { key: idx, className: cx("group relative p-4 rounded-lg transition-all duration-200", isDarkMode
                                            ? "bg-slate-800 border border-slate-700 hover:border-blue-600 hover:shadow-lg hover:shadow-blue-900/20"
                                            : "bg-white border border-gray-200 hover:border-blue-400 hover:shadow-md") },
                                        react_1["default"].createElement("div", { className: "flex items-start gap-3" },
                                            react_1["default"].createElement("div", { className: cx("flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold", isDarkMode
                                                    ? "bg-blue-900 text-blue-300 border border-blue-700"
                                                    : "bg-blue-100 text-blue-700 border border-blue-200") }, idx + 1),
                                            react_1["default"].createElement("div", { className: cx("flex-shrink-0 text-2xl leading-none mt-1 opacity-40", isDarkMode
                                                    ? "text-blue-400"
                                                    : "text-blue-500") }, "\""),
                                            react_1["default"].createElement("p", { className: cx("flex-1 text-base leading-relaxed", isDarkMode
                                                    ? "text-slate-300"
                                                    : "text-gray-700") }, sentence)))); }))))),
                            index <
                                Object.keys(patientData.consultationTopics).length -
                                    1 && (react_1["default"].createElement("div", { className: "py-8" },
                                react_1["default"].createElement("div", { className: cx("border-t-2", isDarkMode ? "border-slate-700" : "border-gray-300") })))));
                    })))),
            react_1["default"].createElement("div", { className: cx(isDarkMode
                    ? "bg-gradient-to-r from-slate-900 to-slate-800 border-t border-slate-700"
                    : "bg-gradient-to-r from-gray-100 to-gray-50 border-t border-gray-200", "shadow-lg") }))));
};
exports["default"] = PatientReport;
