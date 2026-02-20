import { useEffect, useRef } from "react";
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
    backgroundColor: "white",
    border: "1px solid #ccc",
    borderRadius: "4px",
    padding: "8px",
    boxShadow: "2px 2px 6px rgba(0, 0, 0, 0.1)",
  },
};

export const LineChart = ({
  data,
  width = 800,
  height = 400,
  title,
  id,
  selectedDateOnXaxis,
  setSelectedDateOnXaxis,
}: LineChartProps) => {
  const chartRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // 기존 tooltip 제거
    d3.select("body").selectAll(".tooltip").remove();

    const margin = { top: 30, right: 120, bottom: 100, left: 80 }; // 수정된 margin
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Clear previous chart
    d3.select(chartRef.current).selectAll("*").remove();

    const svg = d3
      .select(chartRef.current)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("background-color", "white");

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Create scales
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

    // Split data into segments (handling -1 values)
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

    // Create line generator
    const createLine = d3
      .line<DataPoint>()
      .x((d) => xScale(d.week_ending) || 0)
      .y((d) => yScale(d.Negative_count));

    // Create segments
    const negativeSegments = splitIntoSegments(data, (d) => d.Negative_count);
    const positiveSegments = splitIntoSegments(data, (d) => d.Positive_count);

    // Add lines with dots for negative segments
    negativeSegments.forEach((segment) => {
      // Add line
      g.append("path")
        .datum(segment)
        .attr("fill", "none")
        .attr("stroke", "#ff6b6b")
        .attr("stroke-width", 1.5)
        .attr("class", "negative-line")
        .attr("d", createLine);

      // Add dots
      g.selectAll(`.dot-negative-${segment[0].week_ending}`)
        .data(segment)
        .enter()
        .append("circle")
        .attr("class", "dot-negative")
        .attr("cx", (d) => xScale(d.week_ending) || 0)
        .attr("cy", (d) => yScale(d.Negative_count))
        .attr("r", 4)
        .style("fill", "#ff6b6b");
    });

    const positiveLine = d3
      .line<DataPoint>()
      .x((d) => xScale(d.week_ending) || 0)
      .y((d) => yScale(d.Positive_count));

    // Add lines with dots for positive segments
    positiveSegments.forEach((segment) => {
      // Add line
      g.append("path")
        .datum(segment)
        .attr("fill", "none")
        .attr("stroke", "#4ecdc4")
        .attr("stroke-width", 1.5)
        .attr("class", "positive-line")
        .attr("d", positiveLine);

      // Add dots
      g.selectAll(`.dot-positive-${segment[0].week_ending}`)
        .data(segment)
        .enter()
        .append("circle")
        .attr("class", "dot-positive")
        .attr("cx", (d) => xScale(d.week_ending) || 0)
        .attr("cy", (d) => yScale(d.Positive_count))
        .attr("r", 4)
        .style("fill", "#4ecdc4");
    });

    // Function to format date
    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
      });
    };

    // Add axes
    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).tickFormat((d) => formatDate(d.toString())))
      .selectAll("text")
      .style("text-anchor", "end")
      .attr("dx", "-.8em")
      .attr("dy", ".15em")
      .attr("transform", "rotate(-45)")
      .style("font-size", chartStyles.axisText.fontSize)
      .style("font-family", "Arial, sans-serif");

    g.append("g")
      .call(d3.axisLeft(yScale).ticks(5))
      .selectAll("text")
      .style("font-size", chartStyles.axisText.fontSize);

    // Add x-axis label with adjusted position
    g.append("text")
      .attr("class", "x-axis-label")
      .attr("text-anchor", "middle")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + margin.bottom - 15)
      .style("font-size", chartStyles.axisLabel.fontSize)
      .text("Week Ending Date");

    // Add y-axis label
    g.append("text")
      .attr("class", "y-axis-label")
      .attr("text-anchor", "middle")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -margin.left + 30)
      .style("font-size", chartStyles.axisLabel.fontSize)
      .text("Count of Cases");

    // Add title
    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", margin.top / 2)
      .attr("text-anchor", "middle")
      .style("font-size", chartStyles.title.fontSize)
      .style("font-weight", chartStyles.title.fontWeight)
      .text(title);

    // Add legend
    const legend = svg
      .append("g")
      .attr(
        "transform",
        `translate(${width - margin.right + 20},${margin.top + 10})`
      );

    // Add legend title
    legend
      .append("text")
      .attr("x", 0)
      .attr("y", -15)
      .style("font-size", chartStyles.axisLabel.fontSize)
      .style("font-weight", "bold")
      .text("Count Type");

    // Legend items
    const legendItems = [
      { label: "Negative", color: "#ff6b6b", class: "negative-line" },
      { label: "Positive", color: "#4ecdc4", class: "positive-line" },
    ];

    legendItems.forEach((item, i) => {
      const legendGroup = legend
        .append("g")
        .attr("transform", `translate(0,${i * 20 + 5})`)
        .style("cursor", "pointer");

      // Add line
      legendGroup
        .append("line")
        .attr("x1", 0)
        .attr("x2", 20)
        .attr("stroke", item.color)
        .attr("stroke-width", 2);

      // Add text
      legendGroup
        .append("text")
        .attr("x", 25)
        .attr("y", 4)
        .style("font-size", chartStyles.axisText.fontSize)
        .text(item.label);

      // Add invisible hover area
      legendGroup
        .append("rect")
        .attr("x", -5)
        .attr("y", -10)
        .attr("width", 80)
        .attr("height", 20)
        .attr("fill", "transparent")
        // Add hover effects
        .on("mouseover", () => {
          // Dim all lines
          g.selectAll("path").style("opacity", 0.2);
          g.selectAll("circle").style("opacity", 0.2).attr("r", 4); // 기본 크기로 리셋

          // Highlight selected line and its dots
          g.selectAll(`.${item.class}`)
            .style("opacity", 1)
            .style("stroke-width", 3);
          g.selectAll(`.dot-${item.label.toLowerCase()}`)
            .style("opacity", 1)
            .attr("r", 6); // 선택된 라인의 dots 크기 증가

          // Highlight corresponding dots
          g.selectAll(`.dot-${item.label.toLowerCase()}`)
            .style("opacity", 1)
            .attr("r", 6);

          // Highlight legend item
          legendGroup.select("line").style("stroke-width", 3);
          legendGroup.select("text").style("font-weight", "bold");
        })
        .on("mouseout", () => {
          // Reset all lines
          g.selectAll("path").style("opacity", 1).style("stroke-width", 1.5);

          // Reset all dots
          g.selectAll("circle").style("opacity", 1).attr("r", 4);

          // Reset legend item
          legendGroup.select("line").style("stroke-width", 2);
          legendGroup.select("text").style("font-weight", "normal");
        });
    });

    // Add tooltip
    const tooltipDiv = d3
      .select("body")
      .append("div")
      .attr("class", "tooltip") // class 추가
      .style("position", "absolute")
      .style("visibility", "hidden")
      .style("background", chartStyles.tooltip.backgroundColor)
      .style("border", chartStyles.tooltip.border)
      .style("border-radius", chartStyles.tooltip.borderRadius)
      .style("padding", chartStyles.tooltip.padding)
      .style("font-size", chartStyles.tooltip.fontSize)
      .style("box-shadow", chartStyles.tooltip.boxShadow)
      .style("pointer-events", "none") // 추가: 마우스 이벤트 방지
      .style("z-index", "9999");

    // Add hover effects
    const focus = g.append("g").style("display", "none");

    // 선택된 날짜를 위한 그룹 추가
    const selectionGroup = g.append("g").attr("class", "selection-group");

    // Add vertical line for hover
    focus
      .append("line")
      .attr("class", "hover-line")
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .style("stroke", "#999")
      .style("stroke-width", "1px")
      .style("stroke-dasharray", "3,3");

    // Add hover points
    const negativePoint = focus
      .append("circle")
      .attr("r", 4)
      .style("fill", "#ff6b6b");

    const positivePoint = focus
      .append("circle")
      .attr("r", 4)
      .style("fill", "#4ecdc4");

    const updateSelection = () => {
      selectionGroup.selectAll("*").remove();

      if (selectedDateOnXaxis) {
        const x = xScale(selectedDateOnXaxis.week_ending) || 0;
        const formattedDate = formatDate(selectedDateOnXaxis.week_ending);

        // 선택된 날짜에 수직선 추가
        selectionGroup
          .append("line")
          .attr("x1", x)
          .attr("x2", x)
          .attr("y1", 0)
          .attr("y2", innerHeight)
          .style("stroke", "#999")
          .style("stroke-width", "1px")
          .style("stroke-dasharray", "3,3");

        // 선택된 포인트 표시
        if (selectedDateOnXaxis.Negative_count !== -1) {
          selectionGroup
            .append("circle")
            .attr("cx", x)
            .attr("cy", yScale(selectedDateOnXaxis.Negative_count))
            .attr("r", 6)
            .style("fill", "#ff6b6b");
        }

        if (selectedDateOnXaxis.Positive_count !== -1) {
          selectionGroup
            .append("circle")
            .attr("cx", x)
            .attr("cy", yScale(selectedDateOnXaxis.Positive_count))
            .attr("r", 6)
            .style("fill", "#4ecdc4");
        }

        // Get SVG position
        const svgRect = chartRef.current.getBoundingClientRect();
        // const xPosition = svgRect.left + margin.left + x;
        const xPosition = x;
        // const yPosition = svgRect.top + margin.top;
        const yPosition = svgRect.top + 1.5 * margin.top;

        // tooltip 표시 추가
        const tooltipContent = `
            <div style="font-weight: bold; margin-bottom: 5px; font-size: ${
              chartStyles.tooltip.fontSize
            }">
              Week Ending: ${formattedDate}
            </div>
            <div style="color: #ff6b6b; font-size: ${
              chartStyles.tooltip.fontSize
            }">
              Negative: ${
                selectedDateOnXaxis.Negative_count !== -1
                  ? selectedDateOnXaxis.Negative_count
                  : "<span style='font-style: italic; color: #666;'>Data not available for this period</span>"
              }
            </div>
            <div style="color: #4ecdc4; font-size: ${
              chartStyles.tooltip.fontSize
            }">
              Positive: ${
                selectedDateOnXaxis.Positive_count !== -1
                  ? selectedDateOnXaxis.Positive_count
                  : "<span style='font-style: italic; color: #666;'>Data not available for this period</span>"
              }
            </div>
          `;

        tooltipDiv
          .style("visibility", "visible")
          .style("left", `${xPosition}px`)
          .style("top", `${yPosition + window.pageYOffset}px`)
          .html(tooltipContent);
      } else {
        tooltipDiv.style("visibility", "hidden");
      }
    };

    // 초기 선택 상태 업데이트
    updateSelection();

    // Add overlay rectangle for mouse events
    g.append("rect")
      .attr("class", "overlay")
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .style("fill", "none")
      .style("pointer-events", "all")
      .on("mouseover", () => {
        focus.style("display", null);
        selectionGroup.style("opacity", 0.3); // 이 줄 추가
      })
      .on("mouseout", () => {
        focus.style("display", "none");
        tooltipDiv.style("visibility", "hidden");
        selectionGroup.style("opacity", 1); // 이 줄 추가
        setSelectedDateOnXaxis(null); // 마우스가 차트를 벗어날 때 선택 해제
      })
      .on("mousemove", function (event) {
        const mouse = d3.pointer(event, this);
        const xPos = mouse[0];

        // Find the nearest date
        const dates = data.map((d) => d.week_ending);
        const points = dates.map((d) => xScale(d) || 0);
        const index = d3.bisect(points, xPos) - 1;
        const d = data[Math.max(0, Math.min(index, data.length - 1))];

        if (d) {
          // 현재 마우스 위치의 데이터로 selectedDateOnXaxis 업데이트
          setSelectedDateOnXaxis(d);

          const x = xScale(d.week_ending) || 0;
          const formattedDate = formatDate(d.week_ending);

          // Update vertical line
          focus.select(".hover-line").attr("x1", x).attr("x2", x);

          // Update points
          if (d.Negative_count !== -1) {
            negativePoint
              .style("display", "block")
              .attr("cx", x)
              .attr("cy", yScale(d.Negative_count))
              .attr("r", 6); // hover 시 크기 증가
          } else {
            negativePoint.style("display", "none");
          }

          if (d.Positive_count !== -1) {
            positivePoint
              .style("display", "block")
              .attr("cx", x)
              .attr("cy", yScale(d.Positive_count))
              .attr("r", 6); // hover
          } else {
            positivePoint.style("display", "none");
          }

          // Enhanced tooltip content
          const tooltipContent = `
            <div style="font-weight: bold; margin-bottom: 5px; font-size: ${
              chartStyles.tooltip.fontSize
            }">
              Week Ending: ${formattedDate}
            </div>
            <div style="color: #ff6b6b; font-size: ${
              chartStyles.tooltip.fontSize
            }">
              Negative: ${
                d.Negative_count !== -1
                  ? d.Negative_count
                  : "<span style='font-style: italic; color: #666;'>Data not available for this period</span>"
              }
            </div>
            <div style="color: #4ecdc4; font-size: ${
              chartStyles.tooltip.fontSize
            }">
              Positive: ${
                d.Positive_count !== -1
                  ? d.Positive_count
                  : "<span style='font-style: italic; color: #666;'>Data not available for this period</span>"
              }
            </div>
          `;

          tooltipDiv
            .style("visibility", "visible")
            .style("left", `${event.pageX + 15}px`)
            .style("top", `${event.pageY - 28}px`)
            .html(tooltipContent);
        }
      });
  }, [data, width, height, title, id, selectedDateOnXaxis]); // selectedDateOnXaxis 추가

  return (
    <div className="w-full h-full">
      <svg ref={chartRef} id={id} className="w-full h-full" />
    </div>
  );
};

export default LineChart;
