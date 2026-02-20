"use strict";
exports.__esModule = true;
exports.Histogram = void 0;
var react_1 = require("react");
var d3 = require("d3");
var chartStyles = {
  title: {
    fontSize: "24px",
    fontWeight: "bold",
    fontFamily: "'Helvetica Neue', sans-serif",
  },
  axisLabel: {
    fontSize: "16px",
    fontFamily: "'Helvetica Neue', sans-serif",
  },
  axisText: {
    fontSize: "14px",
    fontFamily: "'Helvetica Neue', sans-serif",
  },
  tooltip: {
    fontSize: "14px",
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid rgba(0,0,0,0.1)",
    backgroundColor: "rgba(255,255,255,0.95)",
    color: "#333",
    boxShadow: "0 4px 6px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.08)",
  },
  value: {
    fontSize: "16px",
    fontWeight: "bold",
  },
};
exports.Histogram = function (_a) {
  var data = _a.data,
    _b = _a.width,
    width = _b === void 0 ? 800 : _b,
    _c = _a.height,
    height = _c === void 0 ? 400 : _c,
    title = _a.title,
    id = _a.id,
    _d = _a.bins,
    bins = _d === void 0 ? 30 : _d,
    _e = _a.colorScheme,
    colorScheme =
      _e === void 0 ? ["#4682B4", "#FF7F50", "#2E8B57", "#9370DB"] : _e;
  var chartRef = react_1.useRef(null);
  react_1.useEffect(
    function () {
      if (!chartRef.current) return;
      var margin = { top: 40, right: 30, bottom: 50, left: 60 };
      var innerWidth = width - margin.left - margin.right;
      var innerHeight = height - margin.top - margin.bottom;
      d3.select(chartRef.current).selectAll("*").remove();
      // Create gradient
      var svg = d3
        .select(chartRef.current)
        .attr("viewBox", "0 0 " + width + " " + height)
        .attr("preserveAspectRatio", "xMidYMid meet");
      // Add gradient definition
      var gradient = svg
        .append("defs")
        .append("linearGradient")
        .attr("id", "bar-gradient-" + id)
        .attr("x1", "0%")
        .attr("y1", "0%")
        .attr("x2", "0%")
        .attr("y2", "100%");
      gradient
        .append("stop")
        .attr("offset", "0%")
        .attr("stop-color", colorScheme[0]);
      gradient
        .append("stop")
        .attr("offset", "100%")
        .attr("stop-color", colorScheme[1]);
      var g = svg
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
      // Add subtle grid background
      var gridOpacity = 0.1;
      g.append("rect")
        .attr("width", innerWidth)
        .attr("height", innerHeight)
        .attr("fill", "#f8f9fa")
        .attr("rx", 8);
      var histogram = d3
        .histogram()
        .domain([1, d3.max(data)])
        .thresholds(bins);
      var bins_data = histogram(data);
      var x = d3
        .scaleLinear()
        .domain([1, d3.max(data) || 100])
        .range([0, innerWidth]);
      var y = d3
        .scaleLinear()
        .domain([
          0,
          d3.max(bins_data, function (d) {
            return d.length;
          }) || 0,
        ])
        .range([innerHeight, 0]);
      // Add grid lines
      g.append("g")
        .attr("class", "grid")
        .attr("opacity", gridOpacity)
        .call(
          d3
            .axisLeft(y)
            .tickSize(-innerWidth)
            .tickFormat(function () {
              return "";
            })
        );
      g.append("g")
        .attr("class", "grid")
        .attr("transform", "translate(0," + innerHeight + ")")
        .attr("opacity", gridOpacity)
        .call(
          d3
            .axisBottom(x)
            .tickSize(-innerHeight)
            .tickFormat(function () {
              return "";
            })
        );
      // Enhanced axes
      var xAxis = g
        .append("g")
        .attr("transform", "translate(0," + innerHeight + ")")
        .call(
          d3
            .axisBottom(x)
            .tickFormat(function (d) {
              return "" + d;
            })
            .tickPadding(8)
        )
        .style("font-size", chartStyles.axisText.fontSize)
        .style("font-family", chartStyles.axisText.fontFamily);
      xAxis
        .append("text")
        .attr("fill", "#666")
        .attr("x", innerWidth / 2)
        .attr("y", margin.bottom - 10)
        .attr("text-anchor", "middle")
        .style("font-size", chartStyles.axisLabel.fontSize)
        .text("Age");
      var yAxis = g
        .append("g")
        .call(d3.axisLeft(y).tickPadding(8))
        .style("font-size", chartStyles.axisText.fontSize)
        .style("font-family", chartStyles.axisText.fontFamily);
      yAxis
        .append("text")
        .attr("fill", "#666")
        .attr("transform", "rotate(-90)")
        .attr("x", -innerHeight / 2)
        .attr("y", -margin.left + 15)
        .attr("text-anchor", "middle")
        .style("font-size", chartStyles.axisLabel.fontSize)
        .text("Frequency");
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
        .style("font-family", chartStyles.tooltip.fontFamily)
        .style("color", chartStyles.tooltip.color)
        .style("pointer-events", "none")
        .style("z-index", "1000");
      // Original animated bars
      var initialY = innerHeight;
      var barTransition = d3.transition().duration(1500).ease(d3.easeCubicOut);
      var bars = g
        .selectAll("rect")
        .data(bins_data)
        .enter()
        .append("rect")
        .attr("x", function (d) {
          return x(d.x0 || 1);
        })
        .attr("y", initialY)
        .attr("width", function (d) {
          return Math.max(0, x(d.x1 || 0) - x(d.x0 || 1) - 1);
        })
        .attr("height", 0)
        .attr("fill", "url(#bar-gradient-" + id + ")")
        .attr("rx", 4)
        .style("transition", "all 0.3s ease");
      // Original bar animation
      bars
        .transition(barTransition)
        .attr("y", function (d) {
          return y(d.length);
        })
        .attr("height", function (d) {
          return innerHeight - y(d.length);
        });
      // Original interactivity
      bars
        .on("mouseover", function (event, d) {
          d3.select(this)
            .transition()
            .duration(300)
            .attr("fill", colorScheme[2]);
          tooltip
            .style("visibility", "visible")
            .html(
              '<div style="font-weight: bold; margin-bottom: 4px;">Age Percentage: ' +
                Math.round(d.x0 || 0) +
                "-" +
                Math.round(d.x1 || 0) +
                '</div>\n             <div>Count: <span style="color: ' +
                colorScheme[2] +
                '">' +
                d.length +
                "</span></div>"
            );
        })
        .on("mousemove", function (event) {
          tooltip
            .style("top", event.pageY - 10 + "px")
            .style("left", event.pageX + 10 + "px");
        })
        .on("mouseout", function () {
          d3.select(this)
            .transition()
            .duration(300)
            .attr("fill", "url(#bar-gradient-" + id + ")");
          tooltip.style("visibility", "hidden");
        });
      // Enhanced title with animation
      var titleElement = svg
        .append("text")
        .attr("class", "title")
        .attr("x", width / 2)
        .attr("y", margin.top / 2)
        .attr("text-anchor", "middle")
        .style("font-size", chartStyles.title.fontSize)
        .style("font-weight", chartStyles.title.fontWeight)
        .style("font-family", chartStyles.title.fontFamily)
        .style("opacity", 0)
        .text(title);
      titleElement
        .transition()
        .duration(1000)
        .style("opacity", 1)
        .style("text-shadow", "2px 2px 4px rgba(0,0,0,0.1)");
      return function () {
        tooltip.remove();
      };
    },
    [data, width, height, title, bins, id, colorScheme]
  );
  return React.createElement(
    "div",
    { className: "w-full h-full" },
    React.createElement("svg", {
      ref: chartRef,
      id: id,
      className: "w-full h-full",
    })
  );
};
exports["default"] = exports.Histogram;
