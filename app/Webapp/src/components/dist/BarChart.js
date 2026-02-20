"use strict";
exports.__esModule = true;
exports.BarChart = void 0;
var react_1 = require("react");
var d3 = require("d3");
var chartStyles = {
    title: {
        fontSize: "20px",
        fontWeight: "bold"
    },
    axisLabel: {
        fontSize: "18px"
    },
    axisText: {
        fontSize: "18px"
    },
    legend: {
        fontSize: "16px"
    },
    tooltip: {
        fontSize: "14px",
        padding: "8px",
        borderRadius: "4px",
        border: "1px solid #ddd",
        backgroundColor: "white",
        color: "#333",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
    },
    value: {
        fontSize: "16px"
    }
};
exports.BarChart = function (_a) {
    var data = _a.data, _b = _a.width, width = _b === void 0 ? 400 : _b, _c = _a.height, height = _c === void 0 ? 400 : _c, title = _a.title, id = _a.id, _d = _a.maxLabelLength, maxLabelLength = _d === void 0 ? 15 : _d;
    var chartRef = react_1.useRef(null);
    var calculateAxisRange = function (data) {
        var maxValue = d3.max(data, function (d) { return d.count; }) || 0;
        var minValue = d3.min(data, function (d) { return d.count; }) || 0;
        return maxValue === minValue
            ? { min: 0, max: maxValue * 1.5 }
            : { min: 0, max: maxValue };
    };
    var calculateSmartLabelPosition = function (d, xScale, yScale, innerWidth, innerHeight) {
        var barX = xScale(d.category) || 0;
        var barY = yScale(d.count);
        var barWidth = xScale.bandwidth();
        var barHeight = innerHeight - yScale(d.count);
        var labelText = d.count.toLocaleString() + " (" + d.percentage.toFixed(1) + "%)";
        var labelWidth = labelText.length * 8;
        var labelHeight = 20;
        var padding = 10;
        var spaceAbove = barY;
        var spaceBelow = innerHeight - (barY + barHeight);
        var spaceRight = innerWidth - (barX + barWidth);
        var spaceLeft = barX;
        var labelX;
        var labelY;
        var anchor;
        var baseline;
        if (spaceAbove >= labelHeight + padding) {
            labelX = barX + barWidth / 2;
            labelY = barY - padding;
            anchor = "middle";
            baseline = "bottom";
        }
        else if (spaceRight >= labelWidth + padding) {
            labelX = barX + barWidth + padding;
            labelY = barY + barHeight / 2;
            anchor = "start";
            baseline = "middle";
        }
        else if (spaceLeft >= labelWidth + padding) {
            labelX = barX - padding;
            labelY = barY + barHeight / 2;
            anchor = "end";
            baseline = "middle";
        }
        else {
            labelX = barX + barWidth / 2;
            labelY = barY - 2;
            anchor = "middle";
            baseline = "bottom";
        }
        return {
            x: labelX,
            y: labelY,
            anchor: anchor,
            baseline: baseline,
            connectorStart: {
                x: barX + barWidth / 2,
                y: barY + barHeight / 2
            },
            connectorEnd: { x: labelX, y: labelY }
        };
    };
    var getContrastColor = function (backgroundColor) {
        var rgb = d3.rgb(backgroundColor);
        var luminance = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
        return luminance > 128 ? "#000000" : "#ffffff";
    };
    react_1.useEffect(function () {
        if (!chartRef.current)
            return;
        var margin = { top: 30, right: 150, bottom: 70, left: 80 };
        var innerWidth = width - margin.left - margin.right;
        var innerHeight = height - margin.top - margin.bottom;
        d3.select(chartRef.current).selectAll("*").remove();
        var svg = d3
            .select(chartRef.current)
            .attr("viewBox", "0 0 " + width + " " + height)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .attr("class", "w-full h-full");
        var g = svg
            .append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
        var x = d3
            .scaleBand()
            .domain(data.map(function (d) { return d.category; }))
            .range([0, innerWidth])
            .padding(0.1);
        var axisRange = calculateAxisRange(data);
        var y = d3
            .scaleLinear()
            .domain([axisRange.min, axisRange.max])
            .range([innerHeight, 0]);
        var colorScale = d3
            .scaleSequential()
            .domain([0, axisRange.max])
            .interpolator(d3.interpolateBlues);
        var xAxis = g
            .append("g")
            .attr("transform", "translate(0," + innerHeight + ")")
            .call(d3.axisBottom(x))
            .selectAll("text")
            .attr("transform", "rotate(-45)")
            .style("text-anchor", "end")
            .style("font-size", chartStyles.axisText.fontSize);
        var yAxis = g
            .append("g")
            .call(d3.axisLeft(y))
            .selectAll("text")
            .style("font-size", chartStyles.axisText.fontSize);
        svg
            .append("text")
            .attr("x", width / 2)
            .attr("y", margin.top / 2)
            .attr("text-anchor", "middle")
            .style("font-size", chartStyles.title.fontSize)
            .style("font-weight", "bold")
            .text(title);
        var labelContainer = g.append("g").attr("class", "label-container");
        // 수정된 부분: 세로 방향 legend 설정
        var legendWidth = 20;
        var legendHeight = 200;
        var legendX = width - margin.right + 40;
        var legendY = margin.top + 10;
        var legend = svg
            .append("g")
            .attr("transform", "translate(" + legendX + "," + legendY + ")");
        var markerContainer = legend
            .append("g")
            .attr("class", "marker-container");
        var legendScale = d3
            .scaleLinear()
            .domain([axisRange.max, 0]) // 도메인 순서 반전
            .range([0, legendHeight]);
        var legendGradient = svg
            .append("defs")
            .append("linearGradient")
            .attr("id", "color-gradient-" + id)
            .attr("x1", "0%")
            .attr("y1", "0%")
            .attr("x2", "0%")
            .attr("y2", "100%"); // y2를 100%로 설정하여 세로 방향 그라데이션
        legendGradient
            .selectAll("stop")
            .data(d3.range(0, 1.1, 0.1))
            .enter()
            .append("stop")
            .attr("offset", function (d) { return d * 100 + "%"; })
            .attr("stop-color", function (d) { return colorScale(axisRange.max * (1 - d)); }); // 색상 순서 반전
        legend
            .append("rect")
            .attr("width", legendWidth)
            .attr("height", legendHeight)
            .style("fill", "url(#color-gradient-" + id + ")");
        legend
            .append("g")
            .attr("transform", "translate(" + legendWidth + ",0)")
            .call(d3.axisRight(legendScale).ticks(5));
        var bars = g
            .selectAll(".bar-group")
            .data(data)
            .enter()
            .append("g")
            .attr("class", "bar-group");
        bars
            .append("rect")
            .attr("x", function (d) { return x(d.category) || 0; })
            .attr("y", innerHeight)
            .attr("width", x.bandwidth())
            .attr("height", 0)
            .attr("fill", function (d) { return colorScale(d.count); })
            .transition()
            .duration(1000)
            .delay(function (_, i) { return i * 100; })
            .attr("y", function (d) { return y(d.count); })
            .attr("height", function (d) { return innerHeight - y(d.count); });
        bars
            .on("mouseover", function (event, d) {
            var bar = d3.select(this).select("rect");
            bar
                .transition()
                .duration(200)
                .attr("filter", "brightness(110%)")
                .attr("stroke", "#333")
                .attr("stroke-width", 2);
            labelContainer.selectAll("*").remove();
            markerContainer.selectAll("*").remove();
            var position = calculateSmartLabelPosition(d, x, y, innerWidth, innerHeight);
            var barColor = colorScale(d.count);
            var labelText = d.count.toLocaleString() + " (" + d.percentage.toFixed(1) + "%)";
            var labelGroup = labelContainer.append("g");
            labelGroup
                .append("rect")
                .attr("x", position.x -
                (position.anchor === "middle"
                    ? 50
                    : position.anchor === "end"
                        ? 100
                        : 0))
                .attr("y", position.y - (position.baseline === "middle" ? 10 : 20))
                .attr("width", 100)
                .attr("height", 20)
                .attr("fill", "white")
                .attr("rx", 4)
                .attr("opacity", 0.9);
            labelGroup
                .append("text")
                .attr("x", position.x)
                .attr("y", position.y)
                .attr("text-anchor", position.anchor)
                .attr("dominant-baseline", position.baseline)
                .style("fill", "#333")
                .style("font-size", chartStyles.value.fontSize)
                .style("font-weight", "bold")
                .text(labelText);
            labelContainer
                .append("path")
                .attr("d", "M" + position.connectorStart.x + "," + position.connectorStart.y + "L" + position.connectorEnd.x + "," + position.connectorEnd.y)
                .attr("stroke", "#666")
                .attr("stroke-width", 1)
                .style("opacity", 0.6);
            // 수정된 부분: 화살표 마커 추가
            var markerY = legendScale(d.count);
            var arrowSize = 6;
            markerContainer
                .append("path")
                .attr("d", "M-10," + markerY + " L0," + markerY + " L-5," + (markerY - arrowSize) + " M0," + markerY + " L-5," + (markerY + arrowSize))
                .style("stroke", "#333")
                .style("stroke-width", 2)
                .style("fill", "none");
        })
            .on("mouseout", function () {
            var bar = d3.select(this).select("rect");
            bar
                .transition()
                .duration(200)
                .attr("filter", null)
                .attr("stroke", "none");
            labelContainer.selectAll("*").remove();
            markerContainer.selectAll("*").remove();
        });
    }, [data, width, height, title, id, maxLabelLength]);
    return (React.createElement("div", { className: "w-full h-full" },
        React.createElement("svg", { ref: chartRef, id: id, className: "w-full h-full" })));
};
exports["default"] = exports.BarChart;
