"use strict";
exports.__esModule = true;
exports.ChartCard = void 0;
var react_1 = require("react");
var lucide_react_1 = require("lucide-react");
exports.ChartCard = function (_a) {
    var children = _a.children, title = _a.title;
    var uniqueId = react_1.useId();
    var chartContainerId = "chart-container-" + uniqueId;
    var handleDownload = function () {
        var chartContainer = document.getElementById(chartContainerId);
        if (!chartContainer)
            return;
        Promise.resolve().then(function () { return require("html2canvas"); }).then(function (html2canvas) {
            html2canvas["default"](chartContainer, {
                scale: 2,
                backgroundColor: null,
                height: chartContainer.scrollHeight,
                width: chartContainer.scrollWidth,
                useCORS: true,
                ignoreElements: function (element) {
                    return element.hasAttribute("data-no-download");
                }
            })
                .then(function (canvas) {
                canvas.toBlob(function (blob) {
                    if (!blob)
                        return;
                    var url = URL.createObjectURL(blob);
                    var a = document.createElement("a");
                    a.href = url;
                    a.download = (title || "chart") + ".png";
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }, "image/png");
            });
        });
    };
    return (react_1["default"].createElement("div", { id: chartContainerId, 
        // className="group bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm
        // rounded-xl border border-gray-100 dark:border-gray-700
        // shadow-sm hover:shadow-xl transition-colors duration-300
        // relative min-w-[300px] min-h-[200px] w-full
        // resize overflow-hidden cursor-move z-0"
        className: "group bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm\n      rounded-xl border border-gray-100 dark:border-gray-700\n      shadow-sm hover:shadow-xl transition-colors duration-300\n      relative min-w-[300px] min-h-[200px] w-full\n      overflow-hidden cursor-move z-0" },
        react_1["default"].createElement("div", { className: "px-5 py-4" },
            " ",
            title && (react_1["default"].createElement("div", { className: "border-b border-gray-100 dark:border-gray-700 pb-3 mb-4\n            flex items-center justify-between\n            group-hover:border-blue-200 dark:group-hover:border-blue-800\n            transition-colors duration-300" },
                react_1["default"].createElement("h3", { className: "text-sm font-semibold text-gray-800 dark:text-gray-200\n              uppercase tracking-wider\n              group-hover:text-blue-600 dark:group-hover:text-blue-400\n              transition-colors duration-300" }, title),
                react_1["default"].createElement("button", { id: "downloadchart", "data-no-download": "true", onClick: handleDownload, className: "inline-flex items-center px-3 py-1.5 rounded-md\n                text-sm font-medium\n                text-gray-600 hover:text-blue-600\n                dark:text-gray-300 dark:hover:text-blue-400\n                bg-white hover:bg-gray-50\n                dark:bg-gray-800 dark:hover:bg-gray-700\n                border border-gray-200 dark:border-gray-600\n                transition-all duration-300\n                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" },
                    react_1["default"].createElement(lucide_react_1.ImageDown, { className: "h-4 w-4 mr-2" }),
                    react_1["default"].createElement("span", { className: "hidden sm:inline" }, "Download Chart")))),
            react_1["default"].createElement("div", { className: "relative" },
                " ",
                react_1["default"].createElement("div", { className: "relative" }, children)))));
};
exports["default"] = exports.ChartCard;
