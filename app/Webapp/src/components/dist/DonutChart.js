"use strict";
exports.__esModule = true;
exports.DonutChart = void 0;
var react_1 = require("react");
var d3 = require("d3");
var next_themes_1 = require("next-themes");
var chartStyles = {
    title: {
        fontSize: "20px",
        fontWeight: "bold"
    },
    label: {
        fontSize: "18px"
    },
    tooltip: {
        fontSize: "18px",
        padding: "10px",
        borderRadius: "5px",
        border: "1px solid #ddd"
    }
};
exports.DonutChart = function (_a) {
    var data = _a.data, 
    // title = "Donut Chart",
    _b = _a.title, 
    // title = "Donut Chart",
    title = _b === void 0 ? "" : _b, _c = _a.id, id = _c === void 0 ? "donut-chart" : _c, _d = _a.width, width = _d === void 0 ? 400 : _d, _e = _a.height, height = _e === void 0 ? 400 : _e;
    var chartRef = react_1.useRef(null);
    var theme = next_themes_1.useTheme().theme;
    react_1.useEffect(function () {
        if (!chartRef.current || !data.length)
            return;
        var chartColors = theme === "dark" ? d3.schemeDark2 : d3.schemeCategory10;
        var axisColor = theme === "dark" ? "#ffffff" : "#000000";
        d3.select(chartRef.current).selectAll("*").remove();
        var margin = { top: 40, right: 30, bottom: 40, left: 30 };
        var radius = Math.min(width, height) / 3;
        var svg = d3
            .select(chartRef.current)
            .attr("viewBox", "0 0 " + width + " " + height)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .append("g")
            .attr("transform", "translate(" + width / 2 + ", " + height / 2 + ")");
        var color = d3
            .scaleOrdinal()
            .domain(data.map(function (d) { return d.category; }))
            .range(chartColors);
        var arcGenerator = d3
            .arc()
            .innerRadius(radius * 0.5)
            .outerRadius(radius * 0.8);
        var arcHover = d3
            .arc()
            .innerRadius(radius * 0.45)
            .outerRadius(radius * 0.85);
        var pie = d3
            .pie()
            .sort(null)
            .value(function (d) { return d.count; });
        var tooltip = d3
            .select("body")
            .append("div")
            .attr("class", "tooltip")
            .style("position", "absolute")
            .style("opacity", 0)
            .style("font-size", chartStyles.tooltip.fontSize)
            .style("padding", chartStyles.tooltip.padding)
            .style("border-radius", chartStyles.tooltip.borderRadius)
            .style("border", chartStyles.tooltip.border)
            .style("pointer-events", "none")
            .style("background-color", theme === "dark" ? "#1f2937" : "#ffffff")
            .style("color", theme === "dark" ? "#ffffff" : "#000000")
            .style("z-index", "9999") // 높은 z-index 추가
            .style("box-shadow", "0 2px 4px rgba(0,0,0,0.1)") // 선택적: 시각적 구분을 위한 그림자 추가
            .style("backdrop-filter", "blur(8px)"); // 선택적: 배경 블러 효과 추가
        var total = d3.sum(data, function (d) { return d.count; });
        var arcs = svg
            .selectAll(".arc")
            .data(pie(data))
            .enter()
            .append("g")
            .attr("class", "arc");
        // Smooth entry animation
        arcs
            .append("path")
            .attr("fill", function (d) { return color(d.data.category); })
            .attr("d", arcGenerator)
            .transition()
            .duration(1000)
            .attrTween("d", function (d) {
            var interpolate = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
            return function (t) {
                return arcGenerator(interpolate(t));
            };
        });
        arcs
            .select("path")
            .on("mouseover", function (event, d) {
            var percentage = ((d.data.count / total) * 100).toFixed(1);
            d3.select(this).transition().duration(200).attr("d", arcHover);
            tooltip
                .style("opacity", 1)
                .html("<strong>" + d.data.category + "</strong><br/>\n             Count: " + d.data.count.toLocaleString() + "<br/>\n             Percentage: " + percentage + "%")
                .style("left", event.pageX + 10 + "px")
                .style("top", event.pageY - 25 + "px");
        })
            .on("mousemove", function (event) {
            tooltip
                .transition()
                .duration(100)
                .style("left", event.pageX + 10 + "px")
                .style("top", event.pageY - 25 + "px");
        })
            .on("mouseout", function () {
            d3.select(this).transition().duration(200).attr("d", arcGenerator);
            tooltip.transition().duration(200).style("opacity", 0);
        });
        svg
            .append("text")
            .attr("x", 0)
            .attr("y", -height / 2 + 20)
            .attr("text-anchor", "middle")
            .attr("fill", axisColor)
            .style("font-size", chartStyles.title.fontSize)
            .style("font-weight", chartStyles.title.fontWeight)
            .text(title);
        // Cleanup tooltip on unmount
        return function () {
            tooltip.remove();
        };
    }, [data, theme, title, width, height]);
    return (react_1["default"].createElement("div", { className: "w-full h-full" },
        react_1["default"].createElement("svg", { ref: chartRef, id: id, className: "w-full h-full" })));
};
exports["default"] = exports.DonutChart;
