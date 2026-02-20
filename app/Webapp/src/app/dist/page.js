"use client";
"use strict";
exports.__esModule = true;
// import DemographicCharts from "../components/DemographicCharts";
// import DemographicCharts from "@/components/DemographicChartsV3";
// import DemographicCharts from "@/components/DemographicChartsV5";
// import DemographicCharts from "@/components/DemographicChartsV7";
// main ()
// import DemographicCharts from "@/components/DemographicChartsV9";
// import DemographicCharts from "@/components/DemographicChartsV11";
// refactoring the main component to divide the code as logical components, hooks, utils, config, api, ui components
var react_1 = require("react");
// PatientReport v5 - Modified version based on Graciela's feedback
// import PatientReport from "@/components/PatientReportModified";
// import PatientReport from "@/components/PatientReportModifiedV3";
// import PatientReport from "@/components/PatientReportModifiedV5";
var PatientReportModifiedV5up_1 = require("@/components/PatientReportModifiedV5up");
var ThemeToggle_1 = require("@/components/ThemeToggle");
var DashboardFooter_1 = require("@/components/DashboardFooter");
var useWindowSizeStore_1 = require("@/stores/useWindowSizeStore");
var useThemeStore_1 = require("@/stores/useThemeStore");
var hooks_1 = require("@/tracking/hooks");
function Home() {
    // const handleFilterChange = (
    //   section: string,
    //   id: string,
    //   checked: boolean
    // ) => {
    //   console.log(`${section} - ${id}: ${checked}`);
    //   // 필터 변경 처리 로직
    // };
    var _a = useWindowSizeStore_1.useWindowSizeStore(), width = _a.width, height = _a.height, setWindowSize = _a.setWindowSize;
    var isDarkMode = useThemeStore_1.useThemeStore().isDarkMode;
    react_1.useEffect(function () {
        // 윈도우 크기 변화를 감지하는 핸들러
        var handleResize = function () {
            setWindowSize(window.innerWidth, window.innerHeight);
            console.log("Window size changed:", {
                width: window.innerWidth,
                height: window.innerHeight
            });
        };
        // 이벤트 리스너 등록
        window.addEventListener("resize", handleResize);
        // 컴포넌트 언마운트 시 이벤트 리스너 제거
        return function () {
            window.removeEventListener("resize", handleResize);
        };
    }, []);
    // User behavior Tracking hook
    hooks_1.useTracking();
    return (React.createElement("div", { className: "flex min-h-screen " + (isDarkMode ? "dark bg-gray-900 text-white" : "bg-white text-black") },
        React.createElement("div", { className: "flex-1" },
            React.createElement("div", { className: "fixed bottom-8 left-4 right-4 flex justify-between items-center " },
                React.createElement(ThemeToggle_1["default"], null)),
            React.createElement(PatientReportModifiedV5up_1["default"], { isDarkMode: isDarkMode }),
            React.createElement(DashboardFooter_1.DashboardFooter, null)))
    // <Dashboard />
    // <h1 className="text-2xl ">Hello world!</h1>
    // <h1 className="text-3xl font-bold underline">Hello, Next.js!</h1>
    );
}
exports["default"] = Home;
