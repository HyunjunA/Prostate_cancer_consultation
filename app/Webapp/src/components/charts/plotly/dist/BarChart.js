"use strict";
exports.__esModule = true;
var react_1 = require("react");
var plotly_js_dist_min_1 = require("plotly.js-dist-min");
var ScatterPlot = function () {
    react_1.useEffect(function () {
        var trace1 = {
            x: [1, 2, 3, 4],
            y: [10, 15, 13, 17],
            mode: "markers",
            type: "scatter"
        };
        var trace2 = {
            x: [2, 3, 4, 5],
            y: [16, 5, 11, 9],
            mode: "lines",
            type: "scatter"
        };
        var trace3 = {
            x: [1, 2, 3, 4],
            y: [12, 9, 15, 12],
            mode: "lines+markers",
            type: "scatter"
        };
        var data = [trace1, trace2, trace3];
        plotly_js_dist_min_1["default"].newPlot("myDiv", data);
    }, []);
    return react_1["default"].createElement("div", { id: "myDiv" });
};
exports["default"] = ScatterPlot;
