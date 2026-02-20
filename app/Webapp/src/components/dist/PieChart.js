"use strict";
exports.__esModule = true;
exports.PieChart = void 0;
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
exports.PieChart = function (_a) {
    var data = _a.data, _b = _a.width, width = _b === void 0 ? 400 : _b, _c = _a.height, height = _c === void 0 ? 400 : _c, title = _a.title, id = _a.id;
    var chartRef = react_1.useRef(null);
    react_1.useEffect(function () {
        if (!chartRef.current)
            return;
        var margin = { top: 40, right: 120, bottom: 40, left: 120 };
        var innerWidth = width - margin.left - margin.right;
        var innerHeight = height - margin.top - margin.bottom;
        var radius = Math.min(innerWidth, innerHeight) / 2;
        d3.select(chartRef.current).selectAll("*").remove();
        var svg = d3
            .select(chartRef.current)
            .attr("width", width)
            .attr("height", height);
        var g = svg
            .append("g")
            .attr("transform", "translate(" + width / 2 + "," + height / 2 + ")");
        // Legend container
        var legendG = svg
            .append("g")
            .attr("class", "legend")
            .attr("transform", "translate(" + (width - margin.right + 40) + ", " + (margin.top + 10) + ")");
        var color = d3
            .scaleOrdinal()
            .domain(data.map(function (d) { return d.category; }))
            .range(d3.schemeCategory10);
        var pie = d3
            .pie()
            .value(function (d) { return d.count; })
            .sortValues(null);
        var arc = d3
            .arc()
            .innerRadius(radius * 0.5)
            .outerRadius(radius * 0.8);
        var labelArc = d3
            .arc()
            .innerRadius(radius * 0.9)
            .outerRadius(radius * 0.9);
        var pieData = pie(data);
        // Create legend
        var legend = legendG
            .selectAll(".legend")
            .data(data)
            .enter()
            .append("g")
            .attr("class", "legend-item")
            .attr("transform", function (d, i) { return "translate(0," + i * 25 + ")"; });
        legend
            .append("rect")
            .attr("width", 18)
            .attr("height", 18)
            .style("fill", function (d) { return color(d.category); });
        legend
            .append("text")
            .attr("x", 24)
            .attr("y", 9)
            .attr("dy", ".35em")
            .style("font-size", chartStyles.legend.fontSize)
            .style("text-shadow", "1px 1px 2px rgba(0,0,0,0.1)")
            .text(function (d) { return d.category + " (" + d.percentage.toFixed(1) + "%)"; });
        var slices = g
            .selectAll(".arc")
            .data(pieData)
            .enter()
            .append("g")
            .attr("class", "arc");
        slices
            .append("path")
            .attr("d", arc)
            .attr("fill", function (d) { return color(d.data.category); })
            .attr("stroke", "white")
            .style("stroke-width", "2px")
            .style("transition", "opacity 0.2s");
        var labelContainer = g
            .append("g")
            .attr("class", "label-container")
            .style("opacity", 0);
        var createTooltip = function () {
            var tooltip = g
                .append("g")
                .attr("class", "tooltip")
                .style("opacity", 0)
                .style("pointer-events", "none");
            tooltip
                .append("rect")
                .attr("rx", chartStyles.tooltip.borderRadius)
                .attr("ry", chartStyles.tooltip.borderRadius)
                .style("fill", chartStyles.tooltip.backgroundColor)
                .style("stroke", chartStyles.tooltip.border)
                .style("box-shadow", chartStyles.tooltip.boxShadow);
            tooltip
                .append("text")
                .style("font-size", chartStyles.tooltip.fontSize)
                .style("fill", chartStyles.tooltip.color);
            return tooltip;
        };
        var tooltip = createTooltip();
        slices
            .append("path")
            .attr("d", arc)
            .attr("fill", "transparent")
            .style("cursor", "pointer")
            .on("mouseover", function (event, d) {
            var slice = d3.select(this.parentNode).select("path");
            slice.style("opacity", 0.7);
            labelContainer.selectAll("*").remove();
            var pos = labelArc.centroid(d);
            var midAngle = d.startAngle + (d.endAngle - d.startAngle) / 2;
            var x = pos[0];
            var y = pos[1];
            var offset = midAngle < Math.PI ? 20 : -20;
            labelContainer
                .append("polyline")
                .attr("points", arc.centroid(d) + "," + x + "," + y + "," + (x + offset) + "," + y)
                .style("fill", "none")
                .style("stroke", "#666")
                .style("stroke-width", "1px");
            var labelText = labelContainer
                .append("text")
                .attr("transform", "translate(" + (x + (midAngle < Math.PI ? 25 : -25)) + "," + y + ")")
                .attr("dy", "0.35em")
                .attr("text-anchor", midAngle < Math.PI ? "start" : "end")
                .style("font-size", chartStyles.value.fontSize)
                .style("font-weight", "bold")
                .style("text-shadow", "1px 1px 2px rgba(0,0,0,0.1)")
                .style("fill", "#333");
            labelText
                .append("tspan")
                .attr("x", 0)
                .text(d.data.category + " (" + d.data.count.toLocaleString() + " - " + d.data.percentage.toFixed(1) + "%)");
            labelContainer.transition().duration(200).style("opacity", 1);
            var tooltipText = tooltip.select("text");
            tooltipText.text(d.data.category + ": " + d.data.count.toLocaleString() + " (" + d.data.percentage.toFixed(1) + "%)");
            var bbox = tooltipText.node().getBBox();
            var padding = parseFloat(chartStyles.tooltip.padding);
            tooltip
                .select("rect")
                .attr("width", bbox.width + padding * 2)
                .attr("height", bbox.height + padding * 2)
                .attr("x", bbox.x - padding)
                .attr("y", bbox.y - padding);
            tooltip
                .attr("transform", "translate(" + (x + offset * 1.5) + "," + (y - 30) + ")")
                .transition()
                .duration(200)
                .style("opacity", 1);
        })
            .on("mouseout", function () {
            var slice = d3.select(this.parentNode).select("path");
            slice.style("opacity", 1);
            labelContainer.transition().duration(200).style("opacity", 0);
            tooltip.transition().duration(200).style("opacity", 0);
        });
        svg
            .append("text")
            .attr("class", "title")
            .attr("x", width / 2)
            .attr("y", margin.top / 2)
            .attr("text-anchor", "middle")
            .style("font-size", chartStyles.title.fontSize)
            .style("font-weight", chartStyles.title.fontWeight)
            .style("text-shadow", "2px 2px 4px rgba(0,0,0,0.1)")
            .text(title);
    }, [data, width, height, title]);
    return React.createElement("svg", { ref: chartRef, id: id });
};
