import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

interface DataPoint {
  week_start: string;
  week_ending: string;
  Negative_count: number;
  Positive_count: number;
  percent_positive: number;
}

interface LineChartProps {
  data: DataPoint[];
  width?: number;
  height?: number;
  title: string;
  id: string;
  selectedDateOnXaxis: DataPoint | null;
  setSelectedDateOnXaxis: (date: DataPoint | null) => void;
  setIndex: (index: number) => void;
  useXAxisDragSelectionStore: any;
  isDarkMode: boolean;
}

const chartStyles = {
  title: {
    fontSize: "18px",
    fontWeight: "bold",
  },
  axisLabel: {
    fontSize: "17px",
  },
  axisText: {
    fontSize: "15px",
  },
  tooltip: {
    fontSize: "12px",
    borderRadius: "4px",
    padding: "8px",
  },
};

export const FluVEDoubleYaxisLineChart = ({
  data,
  width = 800,
  height = 400,
  title,
  id,
  selectedDateOnXaxis,
  setSelectedDateOnXaxis,
  setIndex,
  useXAxisDragSelectionStore,
  isDarkMode,
}: LineChartProps) => {
  const chartRef = useRef<SVGSVGElement | null>(null);

  const [visibleLines, setVisibleLines] = useState({
    negative: true,
    positive: true,
    pos_percentage: true,
  });

  const getColors = (isDarkMode: boolean) => ({
    background: isDarkMode ? "#1F2937" : "white",
    text: isDarkMode ? "#E5E7EB" : "#111827",
    axis: isDarkMode ? "#9CA3AF" : "#6B7280",
    grid: isDarkMode ? "#4B5563" : "#E5E7EB",
    tooltip: {
      background: isDarkMode ? "#374151" : "white",
      border: isDarkMode ? "#4B5563" : "#ccc",
      text: isDarkMode ? "#E5E7EB" : "#111827",
    },
    lines: {
      negative: "#ff6b6b",
      positive: "#4ecdc4",
      pos_percentage: "#ffd93d",
    },
  });

  const colors = getColors(isDarkMode);

  const calculateTooltipPosition = (
    x: number,
    chartRect: DOMRect,
    tooltipWidth: number,
    tooltipHeight: number,
    margin: { left: number; right: number; top: number; bottom: number },
    scrollY: number = window.scrollY
  ) => {
    const chartLeft = chartRect.left + margin.left;
    const chartRight = chartRect.right - margin.right;
    const chartTop = chartRect.top + margin.top + scrollY;
    const chartBottom = chartRect.bottom - margin.bottom + scrollY;

    let xPosition = x + 15;
    let yPosition = chartTop + tooltipHeight;

    if (xPosition + tooltipWidth > chartRight) {
      xPosition = x - tooltipWidth - 15;
    }

    if (xPosition < chartLeft) {
      xPosition = chartLeft;
    }

    if (xPosition + tooltipWidth > chartRight) {
      xPosition = chartRight - tooltipWidth;
    }

    yPosition = chartTop + 50;

    return { x: xPosition, y: yPosition };
  };

  useEffect(() => {
    if (!chartRef.current) return;

    // d3.select("body").selectAll(".tooltip").remove();
    d3.select("body").selectAll(`.tooltip-${id}`).remove();

    const margin = { top: 30, right: 175, bottom: 100, left: 80 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    d3.select(chartRef.current).selectAll("*").remove();

    const svg = d3
      .select(chartRef.current)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("background-color", colors.background);

    svg.on("dblclick", () => {
      useXAxisDragSelectionStore.getState().setDateRange(null, null);
      useXAxisDragSelectionStore.getState().setId(id);
      useXAxisDragSelectionStore.getState().setIsDragging(false);
      useXAxisDragSelectionStore.getState().setIsDoubleClicked(true);
    });

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const xScale = d3
      .scalePoint()
      .domain(data.map((d) => d.week_ending))
      .range([0, innerWidth])
      .padding(0.5);

    const validData = data.filter(
      (d) => d.Negative_count !== -1 || d.Positive_count !== -1
    );

    const yScale = d3
      .scaleLinear()
      .domain([
        0,
        (d3.max(data, (d) =>
          Math.max(
            d.Negative_count === -1 ? 0 : d.Negative_count,
            d.Positive_count === -1 ? 0 : d.Positive_count
          )
        ) as number) * 1.1,
      ])
      .range([innerHeight, 0]);

    const yScalePercentage = d3
      .scaleLinear()
      .domain([0, 100]) // Percentage scale from 0 to 100
      .range([innerHeight, 0]);

    const splitIntoSegments = (
      data: DataPoint[],
      accessor: (d: DataPoint) => number
    ) => {
      const segments: DataPoint[][] = [];
      let currentSegment: DataPoint[] = [];

      data.forEach((point) => {
        if (accessor(point) === -1) {
          if (currentSegment.length > 0) {
            segments.push(currentSegment);
            currentSegment = [];
          }
        } else {
          currentSegment.push(point);
        }
      });

      if (currentSegment.length > 0) {
        segments.push(currentSegment);
      }

      return segments;
    };

    const createLine = d3
      .line<DataPoint>()
      .x((d) => xScale(d.week_ending) || 0)
      .y((d) => yScale(d.Negative_count));

    const negativeSegments = splitIntoSegments(data, (d) => d.Negative_count);
    const positiveSegments = splitIntoSegments(data, (d) => d.Positive_count);

    negativeSegments.forEach((segment) => {
      g.append("path")
        .datum(segment)
        .attr("fill", "none")
        .attr("stroke", colors.lines.negative)
        .attr("stroke-width", 3)
        .attr("class", "negative-line")
        .attr("d", createLine)
        .style("opacity", visibleLines.negative ? 1 : 0);

      g.selectAll(`.dot-negative-${segment[0].week_ending}`)
        .data(segment)
        .enter()
        .append("circle")
        .attr("class", "dot-negative")
        .attr("cx", (d) => xScale(d.week_ending) || 0)
        .attr("cy", (d) => yScale(d.Negative_count))
        .attr("r", 4)
        .style("fill", colors.lines.negative)
        .style("opacity", visibleLines.negative ? 1 : 0);
    });

    const positiveLine = d3
      .line<DataPoint>()
      .x((d) => xScale(d.week_ending) || 0)
      .y((d) => yScale(d.Positive_count));

    positiveSegments.forEach((segment) => {
      // 기존 positive line 코드는 그대로 유지
      g.append("path")
        .datum(segment)
        .attr("fill", "none")
        .attr("stroke", colors.lines.positive)
        .attr("stroke-width", 3)
        .attr("class", "positive-line")
        .attr("d", positiveLine)
        .style("opacity", visibleLines.positive ? 1 : 0);

      // Add percentage line
      const percentageLine = d3
        .line<DataPoint>()
        .x((d) => xScale(d.week_ending) || 0)
        .y((d) => yScalePercentage(d.percent_positive));

      g.append("path")
        .datum(segment)
        .attr("fill", "none")
        .attr("stroke", colors.lines.pos_percentage)
        .attr("stroke-width", 3)
        .attr("class", "percentage-line")
        .attr("d", percentageLine)
        .style("opacity", visibleLines.pos_percentage ? 1 : 0);

      // 기존 positive dots 코드는 그대로 유지
      g.selectAll(`.dot-positive-${segment[0].week_ending}`)
        .data(segment)
        .enter()
        .append("circle")
        .attr("class", "dot-positive")
        .attr("cx", (d) => xScale(d.week_ending) || 0)
        .attr("cy", (d) => yScale(d.Positive_count))
        .attr("r", 4)
        .style("fill", colors.lines.positive)
        .style("opacity", visibleLines.positive ? 1 : 0);

      // Add percentage dots
      g.selectAll(`.dot-percentage-${segment[0].week_ending}`)
        .data(segment)
        .enter()
        .append("circle")
        .attr("class", "dot-percentage")
        .attr("cx", (d) => xScale(d.week_ending) || 0)
        .attr("cy", (d) => yScalePercentage(d.percent_positive))
        .attr("r", 4)
        .style("fill", colors.lines.pos_percentage)
        .style("opacity", visibleLines.pos_percentage ? 1 : 0);
    });

    // const formatDate = (dateStr: string) => {
    //   const date = new Date(dateStr);
    //   return date.toLocaleDateString("en-US", {
    //     year: "numeric",
    //     month: "numeric",
    //     day: "numeric",
    //   });
    // };

    function getISOWeek(date) {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
      const week1 = new Date(d.getFullYear(), 0, 4);
      return (
        1 +
        Math.round(
          ((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
        )
      );
    }

    function formatDate(dateStr) {
      const date = new Date(dateStr);
      const month = date.toLocaleString("en", { month: "short" });
      const day = date.getDate().toString().padStart(2, "0");
      const year = date.getFullYear();
      const weekNum = getISOWeek(date);
      return `${month}-${day}-${year} (${weekNum})`;
    }

    function formatDateWithWeekNumber(dateStr) {
      const date = new Date(dateStr);
      const month = date.toLocaleString("en", { month: "short" });
      const day = date.getDate().toString().padStart(2, "0");
      const year = date.getFullYear();
      const weekNum = getISOWeek(date);
      return [`(${weekNum})`, `${month}-${day}-${year}`];
    }

    const tickInterval = 3;
    // x axis
    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(
        d3
          .axisBottom(xScale)
          .tickFormat((d, i) => (i % tickInterval === 0 ? "" : ""))
      )
      .selectAll("text")
      .style("text-anchor", "middle")
      .each(function (d, i) {
        if (i % tickInterval === 0) {
          const [weekNum, dateStr] = formatDateWithWeekNumber(d.toString());
          const text = d3.select(this);
          text.text("");

          // 주차 추가 - dy 값을 더 작게(더 위로)
          text
            .append("tspan")
            .attr("x", 0)
            .attr("dy", "1em") // -0.5em에서 -1em로 수정
            .text(weekNum);

          // 날짜 추가 - dy 값을 더 크게(더 아래로)
          text
            .append("tspan")
            .attr("x", 0)
            .attr("dy", "1.5em") // 1.2em에서 2em로 수정
            .text(dateStr);
        }
      })
      .style("font-size", chartStyles.axisText.fontSize)
      .style("font-family", "Arial, sans-serif")
      .style("fill", colors.text);

    // Y axis
    // Left Y axis (Count)
    g.append("g")
      .call(d3.axisLeft(yScale).ticks(5))
      .selectAll("text")
      .style("font-size", chartStyles.axisText.fontSize)
      .style("fill", colors.text);

    // Right Y axis (Percentage)
    g.append("g")
      .attr("transform", `translate(${innerWidth},0)`) // 오른쪽에 위치하도록 transform 추가
      .call(d3.axisRight(yScalePercentage).ticks(5)) // axisRight를 사용하여 오른쪽 축 생성
      .selectAll("text")
      .style("font-size", chartStyles.axisText.fontSize)
      .style("fill", colors.text);

    // axis labels
    g.append("text")
      .attr("class", "x-axis-label")
      .attr("text-anchor", "middle")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + margin.bottom - 15)
      .style("font-size", chartStyles.axisLabel.fontSize)
      .style("fill", colors.text)
      .text("Week Ending Date");

    // Left y-axis label (Count)
    g.append("text")
      .attr("class", "y-axis-label-left")
      .attr("text-anchor", "middle")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -margin.left + 30)
      .style("font-size", chartStyles.axisLabel.fontSize)
      .style("fill", colors.text)
      .text("Count of Cases");

    // Right y-axis label (Percentage)
    g.append("text")
      .attr("class", "y-axis-label-right")
      .attr("text-anchor", "middle")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", innerWidth + 50) // 오른쪽에 위치하도록 y 값 조정
      .style("font-size", chartStyles.axisLabel.fontSize)
      .style("fill", colors.text)
      .text("Percentage");

    // Instruction beneath the title
    svg
      .append("text")
      .attr("id", "zoom-instructions")
      .attr("x", width / 2)
      .attr("y", margin.top / 2 + 20) // Adjust the y position to appear below the title
      .attr("text-anchor", "middle")
      .style("font-size", "14px") // Smaller font size for instructions
      .style("fill", colors.text)
      .text("Zoom: Alt/Opt + Click & Drag | Reset: Double Click");

    // legend
    const legend = svg
      .append("g")
      .attr(
        "transform",
        `translate(${width - margin.right + 65},${margin.top + 0})`
      );

    legend
      .append("text")
      .attr("x", 0)
      .attr("y", -15)
      .style("font-size", chartStyles.axisLabel.fontSize)
      .style("font-weight", "bold")
      .style("fill", colors.text)
      // .text("Count Type")
      .text("Series")
      // mouseover to show key
      .on("mouseover", () => {
        console.log("mouseover-count-type", id);
      });

    const legendItems = [
      {
        label: "Negative",
        color: colors.lines.negative,
        class: "negative-line",
      },
      {
        label: "Positive",
        color: colors.lines.positive,
        class: "positive-line",
      },
      {
        label: "Pos_Percentage",
        color: colors.lines.pos_percentage,
        class: "percentage-line",
      },
    ];

    legendItems.forEach((item, i) => {
      const legendGroup = legend
        .append("g")
        .attr("transform", `translate(0,${i * 20 + 5})`)
        .style("cursor", "pointer");

      // Add checkbox
      const checkbox = legendGroup
        .append("rect")
        .attr("x", -5)
        .attr("y", -6)
        .attr("width", 12)
        .attr("height", 12)
        .attr("rx", 2)
        .attr("ry", 2)
        .style("fill", colors.background)
        .style("stroke", colors.text)
        .style("stroke-width", 1);

      // Checkmark
      const checkmark = legendGroup
        .append("path")
        .attr("d", "M-3,-2 L0,4 L8,-4")
        .attr("transform", "translate(0,0)")
        .style("fill", "none")
        .style("stroke", colors.text)
        .style("stroke-width", 2)
        .style(
          "visibility",
          visibleLines[item.label.toLowerCase()] ? "visible" : "hidden"
        );

      legendGroup
        .append("line")
        .attr("x1", 15)
        .attr("x2", 35)
        .attr("stroke", item.color)
        .attr("stroke-width", 2);

      legendGroup
        .append("text")
        .attr("x", 40)
        .attr("y", 4)
        .style("font-size", chartStyles.axisText.fontSize)
        .style("fill", colors.text)
        .text(item.label);

      legendGroup
        .append("rect")
        .attr("x", -5)
        .attr("y", -10)
        .attr("width", 80)
        .attr("height", 20)
        .attr("fill", "transparent")
        .on("click", () => {
          const key = item.label.toLowerCase();
          // percentage를 pos_percentage로 매핑
          const stateKey = key === "pos_percentage" ? "pos_percentage" : key;
          const newVisibility = !visibleLines[stateKey];
          setVisibleLines((prev) => ({
            ...prev,
            [stateKey]: newVisibility,
          }));

          checkmark.style("visibility", newVisibility ? "visible" : "hidden");

          g.selectAll(`.${item.class}`)
            .style("opacity", newVisibility ? 1 : 0)
            .style("pointer-events", newVisibility ? "auto" : "none");
          g.selectAll(`.dot-${key}`)
            .style("opacity", newVisibility ? 1 : 0)
            .style("pointer-events", newVisibility ? "auto" : "none");

          // hover point 표시/숨김 처리
          if (key === "negative") {
            negativePoint.style("display", newVisibility ? "block" : "none");
          } else if (key === "positive") {
            positivePoint.style("display", newVisibility ? "block" : "none");
          }
        })
        .on("mouseover", () => {
          const key = item.label.toLowerCase();

          // all lines are faded out, but hidden lines remain hidden
          g.selectAll(".positive-line, .negative-line").style(
            "opacity",
            function () {
              const lineKey = d3.select(this).classed("positive-line")
                ? "positive"
                : "negative";
              return visibleLines[lineKey] ? 0.2 : 0;
            }
          );

          g.selectAll(".dot-positive, .dot-negative")
            .style("opacity", function () {
              const dotKey = d3.select(this).classed("dot-positive")
                ? "positive"
                : "negative";
              return visibleLines[dotKey] ? 0.2 : 0;
            })
            .attr("r", 4);

          // emphasis on the selected line
          if (visibleLines[key]) {
            g.selectAll(`.${item.class}`)
              .style("opacity", 1)
              .style("stroke-width", 5);
            g.selectAll(`.dot-${key}`).style("opacity", 1).attr("r", 6);
          }

          legendGroup.select("line").style("stroke-width", 3);
          legendGroup.select("text").style("font-weight", "bold");
        })
        .on("mouseout", () => {
          g.selectAll(".positive-line, .negative-line")
            .style("opacity", function () {
              const lineKey = d3.select(this).classed("positive-line")
                ? "positive"
                : "negative";
              return visibleLines[lineKey] ? 1 : 0;
            })
            .style("stroke-width", 3);

          g.selectAll(".dot-positive, .dot-negative")
            .style("opacity", function () {
              const dotKey = d3.select(this).classed("dot-positive")
                ? "positive"
                : "negative";
              return visibleLines[dotKey] ? 1 : 0;
            })
            .attr("r", 4);

          legendGroup.select("line").style("stroke-width", 2);
          legendGroup.select("text").style("font-weight", "normal");
        });
    });

    // Tooltip
    const tooltipDiv = d3
      .select("body")
      .append("div")
      .attr("class", `tooltip-${id}`)
      .attr("data-chart-id", id)
      .style("position", "absolute")
      .style("visibility", "hidden")
      .style("background", colors.tooltip.background)
      .style("border", `1px solid ${colors.tooltip.border}`)
      .style("border-radius", chartStyles.tooltip.borderRadius)
      .style("padding", chartStyles.tooltip.padding)
      .style("font-size", chartStyles.tooltip.fontSize)
      .style("box-shadow", "2px 2px 6px rgba(0, 0, 0, 0.2)")
      .style("color", colors.tooltip.text)
      .style("pointer-events", "none")
      .style("z-index", "9999");

    // Hover effect
    const focus = g.append("g").style("display", "none");
    const selectionGroup = g.append("g").attr("class", "selection-group");
    const brushGroup = g.append("g").attr("class", "brush-group");

    let dragStart = null;
    let isDragging = false;

    const isAltKey = (event) => event.altKey;

    focus
      .append("line")
      .attr("class", "hover-line")
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .style("stroke", isDarkMode ? "#9CA3AF" : "#6B7280")
      .style("stroke-width", "2px")
      .style("stroke-dasharray", "5,5")
      .style("stroke-opacity", "0.8");

    const negativePoint = focus
      .append("circle")
      .attr("r", 4)
      .style("fill", colors.lines.negative);

    const positivePoint = focus
      .append("circle")
      .attr("r", 4)
      .style("fill", colors.lines.positive);

    const updateSelection = () => {
      // console.log("temp-data", data);
      selectionGroup.selectAll("*").remove();

      if (selectedDateOnXaxis) {
        const x = xScale(selectedDateOnXaxis.week_ending) || 0;
        const formattedDate = formatDate(selectedDateOnXaxis.week_ending);

        // find corresponding data from the data using the selectedDateOnXaxis.week_ending
        const tempD = data.find(
          (d) => d.week_ending === selectedDateOnXaxis.week_ending
        );

        console.log("tempD", tempD);

        // const y = yScale(tempD?.Negative_count);

        selectionGroup
          .append("line")
          .attr("x1", x)
          .attr("x2", x)
          .attr("y1", 0)
          .attr("y2", innerHeight)
          .style("stroke", colors.grid)
          .style("stroke-width", "1px")
          .style("stroke-dasharray", "3,3");

        if (tempD?.Negative_count !== -1) {
          selectionGroup
            .append("circle")
            .attr("cx", x)
            .attr("cy", yScale(tempD?.Negative_count))
            .attr("r", 6)
            .style("fill", colors.lines.negative);
        }

        if (tempD?.Positive_count !== -1) {
          selectionGroup
            .append("circle")
            .attr("cx", x)
            .attr("cy", yScale(tempD?.Positive_count))
            .attr("r", 6)
            .style("fill", colors.lines.positive);
        }

        const svgRect = chartRef.current.getBoundingClientRect();

        const tooltipContent = `
  <div style="font-weight: bold; margin-bottom: 5px; font-size: ${
    chartStyles.tooltip.fontSize
  }; color: ${colors.tooltip.text}">
    Week Ending: ${formattedDate}
  </div>
  <div style="color: ${colors.lines.negative}; font-size: ${
          chartStyles.tooltip.fontSize
        }">
    Negative: ${
      tempD?.Negative_count !== -1
        ? tempD?.Negative_count
        : `<span style="font-style: italic; color: ${colors.tooltip.text}">Data not available for this period</span>`
    }
  </div>
  <div style="color: ${colors.lines.positive}; font-size: ${
          chartStyles.tooltip.fontSize
        }">
    Positive: ${
      tempD?.Positive_count !== -1
        ? tempD?.Positive_count
        : `<span style="font-style: italic; color: ${colors.tooltip.text}">Data not available for this period</span>`
    }
  </div>
  <div style="color: ${colors.lines.pos_percentage}; font-size: ${
          chartStyles.tooltip.fontSize
        }">
    Percentage: ${
      tempD?.percent_positive !== -1
        ? tempD?.percent_positive.toFixed(1) + "%"
        : "N/A"
    }
  </div>
      `;

        tooltipDiv.style("visibility", "hidden").html(tooltipContent);

        const tooltipRect = tooltipDiv.node().getBoundingClientRect();

        const { x: tooltipX, y: tooltipY } = calculateTooltipPosition(
          svgRect.left + margin.left + x,
          svgRect,
          tooltipRect.width,
          tooltipRect.height,
          margin,
          window.scrollY
        );

        tooltipDiv
          .style("visibility", "visible")
          .style("left", `${tooltipX}px`)
          .style("top", `${tooltipY}px`);
      } else {
        tooltipDiv.style("visibility", "hidden");
      }
    };

    updateSelection();

    g.append("rect")
      .attr("class", "overlay")
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .style("fill", "none")
      .style("pointer-events", "all")
      .style("cursor", "crosshair")
      .on("mousedown", function (event) {
        if (isAltKey(event)) {
          isDragging = true;
          useXAxisDragSelectionStore.getState().setIsDragging(isDragging);
          useXAxisDragSelectionStore.getState().setIsDoubleClicked(false);
          dragStart = d3.pointer(event, this)[0];
          brushGroup.selectAll("*").remove();
        }
      })
      .on("mouseover", () => {
        focus.style("display", null);
        selectionGroup.style("opacity", 0.3);
      })
      .on("mouseout", () => {
        focus.style("display", "none");
        tooltipDiv.style("visibility", "hidden");
        selectionGroup.style("opacity", 1);
        setSelectedDateOnXaxis(null);
        if (isDragging) {
          isDragging = false;
          useXAxisDragSelectionStore.getState().setIsDragging(isDragging);
          useXAxisDragSelectionStore.getState().setIsDoubleClicked(false);
          dragStart = null;
          brushGroup.selectAll("*").remove();
        }
      })
      .on("mouseup", function () {
        if (isDragging) {
          isDragging = false;
          useXAxisDragSelectionStore.getState().setIsDragging(isDragging);
          useXAxisDragSelectionStore.getState().setIsDoubleClicked(false);
          dragStart = null;
          brushGroup.selectAll("*").remove();
        }
      })
      .on("mousemove", function (event) {
        const mousePos = d3.pointer(event, this);
        const xPos = mousePos[0];

        if (isDragging && isAltKey(event)) {
          const x0 = Math.min(dragStart, xPos);
          const x1 = Math.max(dragStart, xPos);

          const dates = data.map((d) => d.week_ending);
          const points = dates.map((d) => xScale(d) || 0);

          const startIndex = d3.bisect(points, x0) - 1;
          const endIndex = d3.bisect(points, x1) - 1;

          const startDate = dates[Math.max(0, startIndex)];
          const endDate = dates[Math.min(endIndex, dates.length - 1)];

          useXAxisDragSelectionStore
            .getState()
            .setDateRange(startDate, endDate);

          console.log("selectedDateOnXaxis-id", id);
          // save id
          useXAxisDragSelectionStore.getState().setId(id);

          brushGroup.selectAll("*").remove();
          brushGroup
            .append("rect")
            .attr("x", x0)
            .attr("y", 0)
            .attr("width", x1 - x0)
            .attr("height", innerHeight)
            .attr("fill", colors.grid)
            .attr("opacity", 0.3);

          focus.style("display", "none");
          tooltipDiv.style("visibility", "hidden");
          return;
        }

        const dates = data.map((d) => d.week_ending);
        const points = dates.map((d) => xScale(d) || 0);
        const index = d3.bisect(points, xPos) - 1;

        if (xPos >= 0 && xPos <= innerWidth) {
          const d = data[Math.max(0, Math.min(index, data.length - 1))];

          if (d) {
            const x = xScale(d.week_ending) || 0;
            const foundIndex = data.findIndex((item) => item === d);
            setIndex(foundIndex);
            setSelectedDateOnXaxis(d);

            focus.select(".hover-line").attr("x1", x).attr("x2", x);

            if (
              d.Negative_count !== -1 &&
              yScale(d.Negative_count) >= 0 &&
              yScale(d.Negative_count) <= innerHeight
            ) {
              negativePoint
                .style("display", "block")
                .attr("cx", x)
                .attr("cy", yScale(d.Negative_count))
                .attr("r", 6);
            } else {
              negativePoint.style("display", "none");
            }

            if (
              d.Positive_count !== -1 &&
              yScale(d.Positive_count) >= 0 &&
              yScale(d.Positive_count) <= innerHeight
            ) {
              positivePoint
                .style("display", "block")
                .attr("cx", x)
                .attr("cy", yScale(d.Positive_count))
                .attr("r", 6);
            } else {
              positivePoint.style("display", "none");
            }

            const formattedDate = formatDate(d.week_ending);
            const tooltipContent = `
  <div style="font-weight: bold; margin-bottom: 5px; font-size: ${
    chartStyles.tooltip.fontSize
  }; color: ${colors.tooltip.text}">
    Week Ending: ${formattedDate}
  </div>
  <div style="color: ${colors.lines.negative}; font-size: ${
              chartStyles.tooltip.fontSize
            }">
    Negative: ${
      d.Negative_count !== -1
        ? d.Negative_count
        : `<span style="font-style: italic; color: ${colors.tooltip.text}">Data not available for this period</span>`
    }
  </div>
  <div style="color: ${colors.lines.positive}; font-size: ${
              chartStyles.tooltip.fontSize
            }">
    Positive: ${
      d.Positive_count !== -1
        ? d.Positive_count
        : `<span style="font-style: italic; color: ${colors.tooltip.text}">Data not available for this period</span>`
    }
  </div>
  <div style="color: ${colors.lines.pos_percentage}; font-size: ${
              chartStyles.tooltip.fontSize
            }">
    Percentage: ${
      d.percent_positive !== -1 ? d.percent_positive.toFixed(1) + "%" : "N/A"
    }
  </div>
`;

            tooltipDiv.style("visibility", "hidden").html(tooltipContent);

            const tooltipRect = tooltipDiv.node().getBoundingClientRect();
            const svgRect = chartRef.current.getBoundingClientRect();

            const { x: tooltipX, y: tooltipY } = calculateTooltipPosition(
              event.pageX,
              svgRect,
              tooltipRect.width,
              tooltipRect.height,
              margin,
              window.scrollY
            );

            tooltipDiv
              .style("visibility", "visible")
              .style("left", `${tooltipX}px`)
              .style("top", `${tooltipY}px`);
          }
        } else {
          focus.style("display", "none");
          tooltipDiv.style("visibility", "hidden");
          negativePoint.style("display", "none");
          positivePoint.style("display", "none");
        }
      });

    d3.select(chartRef.current)
      .selectAll("circle")
      .each(function () {
        const cx = this.getAttribute("cx");
        const cy = this.getAttribute("cy");
        if (!cx || !cy) {
          d3.select(this).remove(); // remove the circle if cx or cy is missing
        }
      });
  }, [
    data,
    width,
    height,
    title,
    id,
    selectedDateOnXaxis,
    isDarkMode,
    visibleLines,
  ]);

  // useEffect(() => {
  //   const handleKeyDown = (event) => {
  //     if (event.altKey) {
  //       useXAxisDragSelectionStore.getState().setDateRange(null, null);
  //       useXAxisDragSelectionStore.getState().setId(null);
  //       useXAxisDragSelectionStore.getState().setIsDragging(false);
  //       useXAxisDragSelectionStore.getState().setIsDoubleClicked(false);
  //     }
  //   };

  //   window.addEventListener("keydown", handleKeyDown);

  //   return () => {
  //     window.removeEventListener("keydown", handleKeyDown);
  //   };
  // }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.altKey && useXAxisDragSelectionStore.getState().isDragging) {
        // reset the state only when alt key is pressed and dragging is in progress
        useXAxisDragSelectionStore.getState().setDateRange(null, null);
        useXAxisDragSelectionStore.getState().setId(null);
        useXAxisDragSelectionStore.getState().setIsDragging(false);
        useXAxisDragSelectionStore.getState().setIsDoubleClicked(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className={`w-full h-full ${isDarkMode ? "bg-gray-900" : "bg-white"}`}>
      <svg ref={chartRef} id={id} className="w-full h-full" />
    </div>
  );
};

export default FluVEDoubleYaxisLineChart;
