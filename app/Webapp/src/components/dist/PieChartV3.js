"use strict";
exports.__esModule = true;
exports.PieChartV3 = void 0;
var react_1 = require("react");
var d3 = require("d3");
var chartStyles = {
    title: {
        fontSize: "20px",
        fontWeight: "bold"
    },
    tooltip: {
        fontSize: "14px",
        padding: "8px",
        borderRadius: "4px",
        border: "1px solid #ddd",
        backgroundColor: "white",
        color: "#333",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
    }
};
exports.PieChartV3 = function (_a) {
    var data = _a.data, _b = _a.width, width = _b === void 0 ? 400 : _b, _c = _a.height, height = _c === void 0 ? 400 : _c, title = _a.title, id = _a.id;
    var chartRef = react_1.useRef(null);
    react_1.useEffect(function () {
        if (!chartRef.current)
            return;
        var margin = { top: 30, right: 30, bottom: 30, left: 30 };
        var radius = Math.min(width, height) / 3;
        var svg = d3
            .select(chartRef.current)
            .attr("viewBox", "0 0 " + width + " " + height)
            .attr("preserveAspectRatio", "xMidYMid meet");
        // Clear existing content
        svg.selectAll("*").remove();
        var g = svg
            .append("g")
            .attr("transform", "translate(" + width / 2 + ", " + height / 2 + ")");
        var color = d3
            .scaleOrdinal()
            .domain(data.map(function (d) { return d.category; }))
            .range(d3.schemeCategory10);
        var arc = d3
            .arc()
            .innerRadius(0)
            .outerRadius(radius * 0.8);
        var arcHover = d3
            .arc()
            .innerRadius(0)
            .outerRadius(radius * 0.85);
        var pie = d3
            .pie()
            .value(function (d) { return d.count; })
            .sort(null);
        var pieData = pie(data);
        var total = d3.sum(data, function (d) { return d.count; });
        // Create tooltip
        var tooltip = d3
            .select("body")
            .append("div")
            .attr("class", "tooltip")
            .style("position", "absolute")
            .style("visibility", "hidden")
            .style("background", chartStyles.tooltip.backgroundColor)
            .style("padding", chartStyles.tooltip.padding)
            .style("border", chartStyles.tooltip.border)
            .style("border-radius", chartStyles.tooltip.borderRadius)
            .style("box-shadow", chartStyles.tooltip.boxShadow)
            .style("font-size", chartStyles.tooltip.fontSize)
            .style("color", chartStyles.tooltip.color)
            .style("pointer-events", "none")
            .style("z-index", "1000");
        // Create and update slices with animation
        var slices = g
            .selectAll(".arc")
            .data(pieData)
            .join(function (enter) {
            return enter
                .append("g")
                .attr("class", "arc")
                .call(function (enter) {
                return enter
                    .append("path")
                    .attr("fill", function (d) { return color(d.data.category); })
                    .attr("stroke", "white")
                    .style("stroke-width", "2px")
                    .style("cursor", "pointer")
                    .style("opacity", 0)
                    .transition()
                    .duration(750)
                    .style("opacity", 1)
                    .attrTween("d", function (d) {
                    var interpolate = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
                    return function (t) {
                        return arc(interpolate(t));
                    };
                });
            });
        }, function (update) {
            return update.call(function (update) {
                return update
                    .select("path")
                    .transition()
                    .duration(750)
                    .attrTween("d", function (d) {
                    var current = this._current || { startAngle: 0, endAngle: 0 };
                    var interpolate = d3.interpolate(current, d);
                    this._current = interpolate(0);
                    return function (t) {
                        return arc(interpolate(t));
                    };
                });
            });
        }, function (exit) {
            return exit.call(function (exit) {
                return exit
                    .select("path")
                    .transition()
                    .duration(750)
                    .style("opacity", 0)
                    .remove();
            });
        });
        // Store the current angles for smooth transitions
        slices.select("path").each(function (d) {
            this._current = d;
        });
        // Add hover interactions
        slices
            .on("mouseover", function (event, d) {
            var percentage = ((d.data.count / total) * 100).toFixed(1);
            d3.select(this)
                .select("path")
                .transition()
                .duration(200)
                .attr("d", arcHover);
            tooltip
                .style("visibility", "visible")
                .html("<div style=\"font-weight: bold\">" + d.data.category + "</div>\n             <div>Count: " + d.data.count.toLocaleString() + "</div>\n             <div>Percentage: " + percentage + "%</div>")
                .style("left", event.pageX + 10 + "px")
                .style("top", event.pageY - 25 + "px");
        })
            .on("mousemove", function (event) {
            tooltip
                .style("left", event.pageX + 10 + "px")
                .style("top", event.pageY - 25 + "px");
        })
            .on("mouseout", function () {
            d3.select(this)
                .select("path")
                .transition()
                .duration(200)
                .attr("d", arc);
            tooltip.style("visibility", "hidden");
        });
        // Add title
        g.append("text")
            .attr("x", 0)
            .attr("y", -radius - 20)
            .attr("text-anchor", "middle")
            .style("font-size", chartStyles.title.fontSize)
            .style("font-weight", chartStyles.title.fontWeight)
            .text(title);
        return function () {
            tooltip.remove();
        };
    }, [data, width, height, title]);
    return (React.createElement("div", { className: "w-full h-full" },
        React.createElement("svg", { ref: chartRef, id: id, className: "w-full h-full" })));
};
exports["default"] = exports.PieChartV3;
