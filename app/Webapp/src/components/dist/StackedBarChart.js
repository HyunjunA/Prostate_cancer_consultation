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
exports.__esModule = true;
exports.StackedBarChart = void 0;
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
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        position: "fixed",
        pointerEvents: "none",
        zIndex: 9999
    },
    axisLabel: {
        fontSize: "14px",
        fontWeight: "bold",
        color: "#666"
    }
};
var calculateTooltipPosition = function (elementRect, tooltipElement, scrollLeft, scrollTop) {
    var viewportWidth = window.innerWidth;
    var viewportHeight = window.innerHeight;
    var tooltipWidth = tooltipElement.offsetWidth;
    var tooltipHeight = tooltipElement.offsetHeight;
    var tooltipX = elementRect.left + elementRect.width / 2;
    var tooltipY = elementRect.top - 10;
    var transform = "translate(-50%, -100%)";
    // Check if tooltip would go above viewport
    if (tooltipY - tooltipHeight < 0) {
        tooltipY = elementRect.bottom + 10;
        transform = "translate(-50%, 0)";
    }
    // Check left and right boundaries
    var tooltipLeft = tooltipX - tooltipWidth / 2;
    var tooltipRight = tooltipX + tooltipWidth / 2;
    if (tooltipLeft < 0) {
        tooltipX = tooltipWidth / 2;
    }
    else if (tooltipRight > viewportWidth) {
        tooltipX = viewportWidth - tooltipWidth / 2;
    }
    return {
        left: tooltipX + scrollLeft + "px",
        top: tooltipY + scrollTop + "px",
        transform: transform
    };
};
exports.StackedBarChart = function (_a) {
    var data = _a.data, _b = _a.width, width = _b === void 0 ? 600 : _b, _c = _a.height, height = _c === void 0 ? 400 : _c, title = _a.title, id = _a.id;
    var chartRef = react_1.useRef(null);
    var tooltipRef = react_1.useRef(null);
    react_1.useEffect(function () {
        if (!chartRef.current)
            return;
        // Create tooltip div if it doesn't exist
        if (!tooltipRef.current) {
            tooltipRef.current = document.createElement("div");
            tooltipRef.current.className = "tooltip";
            Object.assign(tooltipRef.current.style, __assign(__assign({}, chartStyles.tooltip), { visibility: "hidden" }));
            document.body.appendChild(tooltipRef.current);
        }
        // Margins and dimensions
        var margin = { top: 50, right: 100, bottom: 60, left: 70 };
        var innerWidth = width - margin.left - margin.right;
        var innerHeight = height - margin.top - margin.bottom;
        // Animation duration
        var animationDuration = 800;
        var animationDelay = 100;
        // Clear previous chart
        d3.select(chartRef.current).selectAll("*").remove();
        // Set up SVG container
        var svg = d3
            .select(chartRef.current)
            .attr("viewBox", "0 0 " + width + " " + height)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
        // Process data keys for stacking
        var keys = Object.keys(data[0]).filter(function (key) { return key !== "age_group"; });
        // Set up color scale
        var color = d3
            .scaleOrdinal()
            .domain(keys)
            .range(d3.schemeTableau10);
        // Set up X scale
        var xScale = d3
            .scaleBand()
            .domain(data.map(function (d) { return d.age_group; }))
            .range([0, innerWidth])
            .padding(0.2);
        // Set up Y scale
        var yScale = d3
            .scaleLinear()
            .domain([
            0,
            d3.max(data, function (d) { return keys.reduce(function (sum, key) { return sum + d[key]; }, 0); }),
        ])
            .range([innerHeight, 0]);
        // Stack data
        var stackedData = d3.stack().keys(keys)(data);
        // Add X axis with animation
        var xAxis = svg
            .append("g")
            .attr("transform", "translate(0," + innerHeight + ")")
            .style("opacity", 0);
        xAxis
            .call(d3.axisBottom(xScale))
            .transition()
            .duration(animationDuration)
            .style("opacity", 1)
            .selectAll("text")
            .style("text-anchor", "middle")
            .style("font-size", chartStyles.axisLabel.fontSize);
        // Add Y axis with animation
        var yAxis = svg.append("g").style("opacity", 0);
        yAxis
            .call(d3.axisLeft(yScale).ticks(5))
            .transition()
            .duration(animationDuration)
            .style("opacity", 1)
            .selectAll("text")
            .style("font-size", chartStyles.axisLabel.fontSize);
        // Add X axis label with animation
        svg
            .append("text")
            .attr("x", innerWidth / 2)
            .attr("y", innerHeight + 40)
            .attr("text-anchor", "middle")
            .style("font-size", chartStyles.axisLabel.fontSize)
            .style("font-weight", chartStyles.axisLabel.fontWeight)
            .style("opacity", 0)
            .text("Age Groups")
            .transition()
            .duration(animationDuration)
            .style("opacity", 1);
        // Add Y axis label with animation
        svg
            .append("text")
            .attr("x", -innerHeight / 2)
            .attr("y", -50)
            .attr("transform", "rotate(-90)")
            .attr("text-anchor", "middle")
            .style("font-size", chartStyles.axisLabel.fontSize)
            .style("font-weight", chartStyles.axisLabel.fontWeight)
            .style("opacity", 0)
            .text("Count of Individuals")
            .transition()
            .duration(animationDuration)
            .style("opacity", 1);
        // Create the bars with animation
        var layers = svg
            .selectAll("g.layer")
            .data(stackedData)
            .join("g")
            .attr("fill", function (d) { return color(d.key); })
            .attr("class", "layer");
        layers
            .selectAll("rect")
            .data(function (d) { return d; })
            .join("rect")
            .attr("x", function (d) { return xScale(d.data.age_group); })
            .attr("width", xScale.bandwidth())
            .attr("y", innerHeight)
            .attr("height", 0)
            .style("cursor", "pointer")
            .transition()
            .duration(animationDuration)
            .delay(function (_, i) { return i * animationDelay; })
            .ease(d3.easeCubicOut)
            .attr("y", function (d) { return yScale(d[1]); })
            .attr("height", function (d) { return yScale(d[0]) - yScale(d[1]); });
        // Add hover effects after animation
        layers
            .selectAll("rect")
            .on("mouseover", function (event, d) {
            var category = d3.select(this.parentNode).datum().key;
            var count = d[1] - d[0];
            d3.select(this).transition().duration(200).style("opacity", 0.7);
            if (tooltipRef.current) {
                tooltipRef.current.innerHTML = "\n            <div style=\"font-weight: bold\">" + category + "</div>\n            <div>Count: " + count + "</div>\n          ";
                var elementRect = this.getBoundingClientRect();
                var scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
                var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                var position = calculateTooltipPosition(elementRect, tooltipRef.current, scrollLeft, scrollTop);
                Object.assign(tooltipRef.current.style, {
                    visibility: "visible",
                    left: position.left,
                    top: position.top,
                    transform: position.transform
                });
            }
        })
            .on("mousemove", function (event) {
            if (tooltipRef.current) {
                var elementRect = this.getBoundingClientRect();
                var scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
                var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                var position = calculateTooltipPosition(elementRect, tooltipRef.current, scrollLeft, scrollTop);
                Object.assign(tooltipRef.current.style, {
                    left: position.left,
                    top: position.top,
                    transform: position.transform
                });
            }
        })
            .on("mouseout", function () {
            d3.select(this).transition().duration(200).style("opacity", 1);
            if (tooltipRef.current) {
                tooltipRef.current.style.visibility = "hidden";
            }
        });
        // Add title with animation
        svg
            .append("text")
            .attr("x", innerWidth / 2)
            .attr("y", -20)
            .attr("text-anchor", "middle")
            .style("font-size", chartStyles.title.fontSize)
            .style("font-weight", chartStyles.title.fontWeight)
            .style("opacity", 0)
            .text(title)
            .transition()
            .duration(animationDuration)
            .style("opacity", 1);
        // Add legend with animation
        var legend = svg
            .append("g")
            .attr("transform", "translate(" + (innerWidth + 20) + ", 0)")
            .style("opacity", 0);
        keys.forEach(function (key, i) {
            legend
                .append("rect")
                .attr("x", 0)
                .attr("y", i * 20)
                .attr("width", 15)
                .attr("height", 15)
                .attr("fill", color(key));
            legend
                .append("text")
                .attr("x", 20)
                .attr("y", i * 20 + 12)
                .text(key)
                .style("font-size", chartStyles.axisLabel.fontSize)
                .style("alignment-baseline", "middle");
        });
        // Animate legend
        legend
            .transition()
            .duration(animationDuration)
            .delay(animationDuration / 2)
            .style("opacity", 1);
        // Cleanup on unmount
        return function () {
            if (tooltipRef.current && tooltipRef.current.parentNode) {
                tooltipRef.current.parentNode.removeChild(tooltipRef.current);
                tooltipRef.current = null;
            }
        };
    }, [data, width, height, title]);
    return (react_1["default"].createElement("div", { className: "w-full h-full" },
        react_1["default"].createElement("svg", { ref: chartRef, id: id, className: "w-full h-full" })));
};
exports["default"] = exports.StackedBarChart;
