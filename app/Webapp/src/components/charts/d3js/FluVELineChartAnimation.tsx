import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

interface DataPoint {
  week_start: string;
  week_ending: string;
  Negative_count: number;
  Positive_count: number;
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

export const FluVELineChart = ({
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

    d3.select("body").selectAll(`.tooltip-${id}`).remove();

    const margin = { top: 30, right: 120, bottom: 100, left: 80 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    d3.select(chartRef.current).selectAll("*").remove();

    const svg = d3
      .select(chartRef.current)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("background-color", colors.background)
      .style("transition", "background-color 0.3s ease");

    // 데이터 세그먼트 분할 함수 정의
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

    // 라인 생성기 설정
    const createLine = d3
      .line<DataPoint>()
      .x((d) => xScale(d.week_ending) || 0)
      .y((d) => yScale(d.Negative_count));
    // .curve(d3.curveMonotoneX);

    const positiveLine = d3
      .line<DataPoint>()
      .x((d) => xScale(d.week_ending) || 0)
      .y((d) => yScale(d.Positive_count));
    // .curve(d3.curveMonotoneX);

    const negativeSegments = splitIntoSegments(data, (d) => d.Negative_count);
    const positiveSegments = splitIntoSegments(data, (d) => d.Positive_count);

    // Negative 라인과 점 애니메이션
    negativeSegments.forEach((segment) => {
      const negativePath = g
        .append("path")
        .datum(segment)
        .attr("fill", "none")
        .attr("stroke", colors.lines.negative)
        .attr("stroke-width", 3)
        .attr("class", "negative-line")
        .style("opacity", visibleLines.negative ? 1 : 0)
        .attr("d", createLine);

      const pathLength = negativePath.node()?.getTotalLength() || 0;
      negativePath
        .attr("stroke-dasharray", `${pathLength} ${pathLength}`)
        .attr("stroke-dashoffset", pathLength)
        .transition()
        .duration(1500)
        .ease(d3.easeLinear)
        .attr("stroke-dashoffset", 0);

      // 점 애니메이션
      g.selectAll(`.dot-negative-${segment[0].week_ending}`)
        .data(segment)
        .enter()
        .append("circle")
        .attr("class", "dot-negative")
        .attr("cx", (d) => xScale(d.week_ending) || 0)
        .attr("cy", (d) => yScale(d.Negative_count))
        .attr("r", 0)
        .style("fill", colors.lines.negative)
        .style("opacity", visibleLines.negative ? 1 : 0)
        .transition()
        .duration(1000)
        .delay((d, i) => i * 100)
        .attr("r", 4);
    });

    // Positive 라인과 점 애니메이션
    positiveSegments.forEach((segment) => {
      const positivePath = g
        .append("path")
        .datum(segment)
        .attr("fill", "none")
        .attr("stroke", colors.lines.positive)
        .attr("stroke-width", 3)
        .attr("class", "positive-line")
        .style("opacity", visibleLines.positive ? 1 : 0)
        .attr("d", positiveLine);

      const pathLength = positivePath.node()?.getTotalLength() || 0;
      positivePath
        .attr("stroke-dasharray", `${pathLength} ${pathLength}`)
        .attr("stroke-dashoffset", pathLength)
        .transition()
        .duration(1500)
        .ease(d3.easeLinear)
        .attr("stroke-dashoffset", 0);

      g.selectAll(`.dot-positive-${segment[0].week_ending}`)
        .data(segment)
        .enter()
        .append("circle")
        .attr("class", "dot-positive")
        .attr("cx", (d) => xScale(d.week_ending) || 0)
        .attr("cy", (d) => yScale(d.Positive_count))
        .attr("r", 0)
        .style("fill", colors.lines.positive)
        .style("opacity", visibleLines.positive ? 1 : 0)
        .transition()
        .duration(1000)
        .delay((d, i) => i * 100)
        .attr("r", 4);
    });

    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
      });
    };

    // X축 애니메이션
    const xAxis = g
      .append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .style("opacity", 0);

    xAxis
      .call(d3.axisBottom(xScale).tickFormat((d) => formatDate(d.toString())))
      .transition()
      .duration(1000)
      .style("opacity", 1);

    xAxis
      .selectAll("text")
      .style("text-anchor", "end")
      .attr("dx", "-.8em")
      .attr("dy", ".15em")
      .attr("transform", "rotate(-45)")
      .style("font-size", chartStyles.axisText.fontSize)
      .style("font-family", "Arial, sans-serif")
      .style("fill", colors.text)
      .style("transition", "fill 0.3s ease");

    // Y축 애니메이션
    const yAxis = g.append("g").style("opacity", 0);

    yAxis
      .call(d3.axisLeft(yScale).ticks(5))
      .transition()
      .duration(1000)
      .style("opacity", 1);

    yAxis
      .selectAll("text")
      .style("font-size", chartStyles.axisText.fontSize)
      .style("fill", colors.text)
      .style("transition", "fill 0.3s ease");

    // 축 레이블
    g.append("text")
      .attr("class", "x-axis-label")
      .attr("text-anchor", "middle")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + margin.bottom - 15)
      .style("font-size", chartStyles.axisLabel.fontSize)
      .style("fill", colors.text)
      .style("opacity", 0)
      .text("Week Ending Date")
      .transition()
      .duration(1000)
      .style("opacity", 1);

    g.append("text")
      .attr("class", "y-axis-label")
      .attr("text-anchor", "middle")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -margin.left + 30)
      .style("font-size", chartStyles.axisLabel.fontSize)
      .style("fill", colors.text)
      .style("opacity", 0)
      .text("Count of Cases")
      .transition()
      .duration(1000)
      .style("opacity", 1);

    // Zoom instructions
    svg
      .append("text")
      .attr("id", "zoom-instructions")
      .attr("x", width / 2)
      .attr("y", margin.top / 2 + 20)
      .attr("text-anchor", "middle")
      .style("font-size", "14px")
      .style("fill", colors.text)
      .style("opacity", 0)
      .text("Zoom: Alt/Opt + Click & Drag | Reset: Double Click")
      .transition()
      .duration(1000)
      .style("opacity", 1);

    // 범례 애니메이션
    const legend = svg
      .append("g")
      .attr(
        "transform",
        `translate(${width - margin.right + 0},${margin.top + 10})`
      )
      .style("opacity", 0);

    legend.transition().duration(1000).style("opacity", 1);

    legend
      .append("text")
      .attr("x", 0)
      .attr("y", -15)
      .style("font-size", chartStyles.axisLabel.fontSize)
      .style("font-weight", "bold")
      .style("fill", colors.text)
      .text("Count Type");

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
    ];

    // 범례 아이템 생성 및 애니메이션
    legendItems.forEach((item, i) => {
      const legendGroup = legend
        .append("g")
        .attr("transform", `translate(0,${i * 20 + 5})`)
        .style("cursor", "pointer")
        .style("opacity", 0);

      legendGroup
        .transition()
        .duration(1000)
        .delay(i * 200)
        .style("opacity", 1);

      // 체크박스
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

      // 체크마크
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

      // 범례 클릭 이벤트 영역
      legendGroup
        .append("rect")
        .attr("x", -5)
        .attr("y", -10)
        .attr("width", 80)
        .attr("height", 20)
        .attr("fill", "transparent")
        .on("click", () => {
          const key = item.label.toLowerCase();
          const newVisibility = !visibleLines[key];
          setVisibleLines((prev) => ({
            ...prev,
            [key]: newVisibility,
          }));

          checkmark.style("visibility", newVisibility ? "visible" : "hidden");

          g.selectAll(`.${item.class}`)
            .transition()
            .duration(300)
            .style("opacity", newVisibility ? 1 : 0);

          g.selectAll(`.dot-${item.label.toLowerCase()}`)
            .transition()
            .duration(300)
            .style("opacity", newVisibility ? 1 : 0);
        })
        .on("mouseover", () => {
          const key = item.label.toLowerCase();

          g.selectAll(".positive-line, .negative-line")
            .transition()
            .duration(300)
            .style("opacity", function () {
              const lineKey = d3.select(this).classed("positive-line")
                ? "positive"
                : "negative";
              return visibleLines[lineKey] ? 0.2 : 0;
            });

          g.selectAll(".dot-positive, .dot-negative")
            .transition()
            .duration(300)
            .style("opacity", function () {
              const dotKey = d3.select(this).classed("dot-positive")
                ? "positive"
                : "negative";
              return visibleLines[dotKey] ? 0.2 : 0;
            })
            .attr("r", 4);

          if (visibleLines[key]) {
            g.selectAll(`.${item.class}`)
              .transition()
              .duration(300)
              .style("opacity", 1)
              .style("stroke-width", 5);

            g.selectAll(`.dot-${key}`)
              .transition()
              .duration(300)
              .style("opacity", 1)
              .attr("r", 6);
          }

          legendGroup.select("line").style("stroke-width", 3);
          legendGroup.select("text").style("font-weight", "bold");
        })
        .on("mouseout", () => {
          g.selectAll(".positive-line, .negative-line")
            .transition()
            .duration(300)
            .style("opacity", function () {
              const lineKey = d3.select(this).classed("positive-line")
                ? "positive"
                : "negative";
              return visibleLines[lineKey] ? 1 : 0;
            })
            .style("stroke-width", 3);

          g.selectAll(".dot-positive, .dot-negative")
            .transition()
            .duration(300)
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

    // 툴팁 설정
    const tooltipDiv = d3
      .select("body")
      .append("div")
      .attr("class", `tooltip-${id}`)
      .attr("data-chart-id", id)
      .style("position", "absolute")
      .style("visibility", "hidden")
      .style("opacity", 0)
      .style("background", colors.tooltip.background)
      .style("border", `1px solid ${colors.tooltip.border}`)
      .style("border-radius", chartStyles.tooltip.borderRadius)
      .style("padding", chartStyles.tooltip.padding)
      .style("font-size", chartStyles.tooltip.fontSize)
      .style("box-shadow", "2px 2px 6px rgba(0, 0, 0, 0.2)")
      .style("color", colors.tooltip.text)
      .style("pointer-events", "none")
      .style("z-index", "9999")
      .style("transition", "opacity 0.3s ease");

    // 호버 효과를 위한 요소들
    const focus = g
      .append("g")
      .style("display", "none")
      .style("opacity", 0)
      .style("transition", "opacity 0.3s ease");

    const selectionGroup = g.append("g").attr("class", "selection-group");
    const brushGroup = g.append("g").attr("class", "brush-group");

    let dragStart = null;
    let isDragging = false;

    const isAltKey = (event: any) => event.altKey;

    focus
      .append("line")
      .attr("class", "hover-line")
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .style("stroke", isDarkMode ? "#9CA3AF" : "#6B7280")
      .style("stroke-width", "2px")
      .style("stroke-dasharray", "5,5")
      .style("stroke-opacity", "0.8")
      .style("transition", "stroke 0.3s ease");

    const negativePoint = focus
      .append("circle")
      .attr("r", 4)
      .style("fill", colors.lines.negative)
      .style("transition", "r 0.3s ease");

    const positivePoint = focus
      .append("circle")
      .attr("r", 4)
      .style("fill", colors.lines.positive)
      .style("transition", "r 0.3s ease");

    const updateSelection = () => {
      selectionGroup.selectAll("*").remove();

      if (selectedDateOnXaxis) {
        const x = xScale(selectedDateOnXaxis.week_ending) || 0;
        const formattedDate = formatDate(selectedDateOnXaxis.week_ending);

        selectionGroup
          .append("line")
          .attr("x1", x)
          .attr("x2", x)
          .attr("y1", 0)
          .attr("y2", innerHeight)
          .style("stroke", colors.grid)
          .style("stroke-width", "1px")
          .style("stroke-dasharray", "3,3")
          .style("opacity", 0)
          .transition()
          .duration(300)
          .style("opacity", 1);

        if (selectedDateOnXaxis.Negative_count !== -1) {
          selectionGroup
            .append("circle")
            .attr("cx", x)
            .attr("cy", yScale(selectedDateOnXaxis.Negative_count))
            .attr("r", 0)
            .style("fill", colors.lines.negative)
            .transition()
            .duration(300)
            .attr("r", 6);
        }

        if (selectedDateOnXaxis.Positive_count !== -1) {
          selectionGroup
            .append("circle")
            .attr("cx", x)
            .attr("cy", yScale(selectedDateOnXaxis.Positive_count))
            .attr("r", 0)
            .style("fill", colors.lines.positive)
            .transition()
            .duration(300)
            .attr("r", 6);
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
              selectedDateOnXaxis.Negative_count !== -1
                ? selectedDateOnXaxis.Negative_count
                : `<span style="font-style: italic; color: ${colors.tooltip.text}">Data not available for this period</span>`
            }
          </div>
          <div style="color: ${colors.lines.positive}; font-size: ${
          chartStyles.tooltip.fontSize
        }">
            Positive: ${
              selectedDateOnXaxis.Positive_count !== -1
                ? selectedDateOnXaxis.Positive_count
                : `<span style="font-style: italic; color: ${colors.tooltip.text}">Data not available for this period</span>`
            }
          </div>
        `;

        tooltipDiv
          .style("visibility", "visible")
          .style("opacity", 0)
          .html(tooltipContent);

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
          .style("left", `${tooltipX}px`)
          .style("top", `${tooltipY}px`)
          .transition()
          .duration(300)
          .style("opacity", 1);
      } else {
        tooltipDiv
          .transition()
          .duration(300)
          .style("opacity", 0)
          .on("end", () => tooltipDiv.style("visibility", "hidden"));
      }
    };

    updateSelection();

    // 오버레이 및 이벤트 처리
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
        focus
          .style("display", null)
          .transition()
          .duration(300)
          .style("opacity", 1);
        selectionGroup.transition().duration(300).style("opacity", 0.3);
      })
      .on("mouseout", () => {
        focus
          .transition()
          .duration(300)
          .style("opacity", 0)
          .on("end", () => focus.style("display", "none"));

        tooltipDiv
          .transition()
          .duration(300)
          .style("opacity", 0)
          .on("end", () => tooltipDiv.style("visibility", "hidden"));

        selectionGroup.transition().duration(300).style("opacity", 1);

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

          useXAxisDragSelectionStore.getState().setId(id);

          brushGroup.selectAll("*").remove();
          brushGroup
            .append("rect")
            .attr("x", x0)
            .attr("y", 0)
            .attr("width", x1 - x0)
            .attr("height", innerHeight)
            .attr("fill", colors.grid)
            .style("opacity", 0)
            .transition()
            .duration(300)
            .style("opacity", 0.3);

          focus.style("display", "none");
          tooltipDiv.style("visibility", "hidden");
          return;
        }

        if (xPos >= 0 && xPos <= innerWidth) {
          const dates = data.map((d) => d.week_ending);
          const points = dates.map((d) => xScale(d) || 0);
          const index = d3.bisect(points, xPos) - 1;

          if (index >= 0 && index < data.length) {
            const d = data[index];
            const foundIndex = data.findIndex((item) => item === d);
            setIndex(foundIndex);
            setSelectedDateOnXaxis(d);

            const x = xScale(d.week_ending) || 0;

            focus
              .select(".hover-line")
              .attr("x1", x)
              .attr("x2", x)
              .transition()
              .duration(100)
              .style("opacity", 1);

            if (
              d.Negative_count !== -1 &&
              yScale(d.Negative_count) >= 0 &&
              yScale(d.Negative_count) <= innerHeight
            ) {
              negativePoint
                .style("display", "block")
                .transition()
                .duration(100)
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
                .transition()
                .duration(100)
                .attr("cx", x)
                .attr("cy", yScale(d.Positive_count))
                .attr("r", 6);
            } else {
              positivePoint.style("display", "none");
            }

            updateSelection();
          }
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

export default FluVELineChart;
