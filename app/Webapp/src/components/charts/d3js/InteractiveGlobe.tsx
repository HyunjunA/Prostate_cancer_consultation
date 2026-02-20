// import { useEffect, useRef, useState } from "react";
// import * as d3 from "d3";

// interface ChartData {
//   category: string;
//   count: number;
//   percentage: number;
// }

// interface MapProps {
//   data: ChartData[];
//   width?: number;
//   height?: number;
//   title: string;
//   id: string;
//   isDarkMode?: boolean;
// }

// const chartStyles = {
//   title: {
//     fontSize: "20px",
//     fontWeight: "bold",
//   },
//   axisLabel: {
//     fontSize: "18px",
//   },
//   axisText: {
//     fontSize: "18px",
//   },
//   legend: {
//     fontSize: "16px",
//   },
//   tooltip: {
//     fontSize: "14px",
//     padding: "8px",
//     borderRadius: "4px",
//     border: "1px solid #ddd",
//     backgroundColor: "white",
//     color: "#333",
//     boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
//   },
//   value: {
//     fontSize: "16px",
//   },
// };

// // ISO Country Codes mapping
// const countryNameToCode: { [key: string]: string } = {
//   "United States": "USA",
//   Italy: "ITA",
//   Brazil: "BRA",
//   Bangladesh: "BGD",
//   India: "IND",
//   Japan: "JPN",
//   China: "CHN",
//   France: "FRA",
//   Chile: "CHL",
//   Germany: "DEU",
//   Spain: "ESP",
//   Egypt: "EGY",
//   Kenya: "KEN",
//   Uzbekistan: "UZB",
//   Taiwan: "TWN",
//   Indonesia: "IDN",
//   UK: "GBR",
//   Russia: "RUS",
//   Iran: "IRN",
//   Mexico: "MEX",
//   "Hong Kong": "HKG",
//   "Saudi Arabia": "SAU",
//   Thailand: "THA",
//   "The Netherlands": "NLD",
//   Netherlands: "NLD",
//   Botswana: "BWA",
//   Palestine: "PSE",
//   Iraq: "IRQ",
//   Australia: "AUS",
//   Ethiopia: "ETH",
//   Qatar: "QAT",
//   Canada: "CAN",
//   "South Korea": "KOR",
//   Pakistan: "PAK",
// };

// // Country center coordinates (longitude, latitude)
// const getCountryCoordinates = (countryCode: string): [number, number] => {
//   const coordinates: { [key: string]: [number, number] } = {
//     USA: [-95.7129, 37.0902],
//     ITA: [12.5674, 41.8719],
//     BRA: [-51.9253, -14.235],
//     BGD: [90.3563, 23.685],
//     IND: [78.9629, 20.5937],
//     JPN: [138.2529, 36.2048],
//     CHN: [104.1954, 35.8617],
//     FRA: [2.2137, 46.2276],
//     CHL: [-71.543, -35.6751],
//     DEU: [10.4515, 51.1657],
//     ESP: [-3.7492, 40.4637],
//     EGY: [30.8025, 26.8206],
//     KEN: [37.9062, -0.0236],
//     UZB: [64.5853, 41.3775],
//     TWN: [120.9605, 23.6978],
//     IDN: [113.9213, -0.7893],
//     GBR: [-3.436, 55.3781],
//     RUS: [105.3188, 61.524],
//     IRN: [53.688, 32.4279],
//     MEX: [-102.5528, 23.6345],
//     HKG: [114.1694, 22.3193],
//     SAU: [45.0792, 23.8859],
//     THA: [100.9925, 15.87],
//     NLD: [5.2913, 52.1326],
//     BWA: [24.6849, -22.3285],
//     PSE: [35.2332, 31.9522],
//     IRQ: [43.6793, 33.2232],
//     AUS: [133.7751, -25.2744],
//     ETH: [40.4897, 9.145],
//     QAT: [51.1839, 25.3548],
//     CAN: [-106.3468, 56.1304],
//     KOR: [127.7669, 35.9078],
//     PAK: [69.3451, 30.3753],
//   };
//   return coordinates[countryCode] || [0, 0];
// };

// export const Map = ({
//   data,
//   width = 1000,
//   height = 600,
//   title,
//   id,
//   isDarkMode = false,
// }: MapProps) => {
//   const canvasRef = useRef<HTMLCanvasElement | null>(null);
//   const svgRef = useRef<SVGSVGElement | null>(null);
//   const [worldData, setWorldData] = useState<any>(null);
//   const [loading, setLoading] = useState(true);
//   const [rotation, setRotation] = useState(0);

//   useEffect(() => {
//     // Load world map data
//     const loadWorldData = async () => {
//       try {
//         const response = await fetch(
//           "https://gist.githubusercontent.com/d3indepth/f28e1c3a99ea6d84986f35ac8646fac7/raw/c58cede8dab4673c91a3db702d50f7447b373d98/ne_110m_land.json"
//         );
//         const world = await response.json();
//         setWorldData(world);
//         setLoading(false);
//       } catch (error) {
//         console.error("Failed to load world data:", error);
//         setLoading(false);
//       }
//     };

//     loadWorldData();
//   }, []);

//   useEffect(() => {
//     if (!canvasRef.current || !svgRef.current || !worldData || loading) return;

//     // Modern theme colors (same as BarChart)
//     const primaryColor = isDarkMode ? "#6366F1" : "#3B82F6";
//     const secondaryColor = isDarkMode ? "#8B5CF6" : "#60A5FA";
//     const textColor = isDarkMode ? "#E5E7EB" : "#374151";
//     const axisColor = isDarkMode ? "#4B5563" : "#D1D5DB";
//     const backgroundColor = isDarkMode ? "#111827" : "#FFFFFF";

//     // Preprocess data
//     const processedData = data
//       .filter((d) => d.category !== "Unknown" && d.category !== "N/R")
//       .map((d) => ({
//         ...d,
//         category: d.category.trim(),
//         countryCode: countryNameToCode[d.category.trim()],
//       }))
//       .filter((d) => d.countryCode);

//     const maxCount = d3.max(processedData, (d) => d.count) || 0;

//     // Color scale
//     const colorScale = d3
//       .scaleSequential()
//       .domain([0, maxCount])
//       .interpolator(
//         d3.interpolateRgbBasis([
//           isDarkMode ? "#374151" : "#F3F4F6",
//           primaryColor + "80",
//           secondaryColor,
//         ])
//       );

//     const margin = {
//       top: 60,
//       right: 200,
//       bottom: 40,
//       left: 40,
//     };
//     const innerWidth = width - margin.left - margin.right;
//     const innerHeight = height - margin.top - margin.bottom;

//     // Canvas setup for globe
//     const canvas = canvasRef.current;
//     const context = canvas.getContext("2d");
//     if (!context) return;

//     canvas.width = innerWidth;
//     canvas.height = innerHeight;

//     // SVG setup for UI elements
//     const svg = d3
//       .select(svgRef.current)
//       .attr("viewBox", `0 0 ${width} ${height}`)
//       .attr("preserveAspectRatio", "xMidYMid meet")
//       .attr("class", "w-full h-full");

//     svg.selectAll("*").remove();

//     // Background
//     svg
//       .append("rect")
//       .attr("width", width)
//       .attr("height", height)
//       .attr("fill", backgroundColor);

//     // Projection setup
//     const projection = d3
//       .geoOrthographic()
//       .scale(Math.min(innerWidth, innerHeight) / 4)
//       .translate([innerWidth / 2, innerHeight / 2])
//       .rotate([rotation, -30]);

//     const path = d3.geoPath().projection(projection).context(context);

//     // Graticule for grid lines
//     const graticule = d3.geoGraticule();

//     // Draw function
//     const draw = () => {
//       // Clear canvas
//       context.clearRect(0, 0, innerWidth, innerHeight);

//       // Draw graticule (grid)
//       context.beginPath();
//       path(graticule());
//       context.strokeStyle = isDarkMode ? "#4B5563" : "#D1D5DB";
//       context.lineWidth = 0.5;
//       context.stroke();

//       // Draw land
//       context.beginPath();
//       path(worldData);
//       context.fillStyle = isDarkMode ? "#374151" : "#F3F4F6";
//       context.fill();
//       context.strokeStyle = isDarkMode ? "#6B7280" : "#9CA3AF";
//       context.lineWidth = 0.5;
//       context.stroke();

//       // Draw country data points
//       processedData.forEach((d) => {
//         const coords = getCountryCoordinates(d.countryCode);
//         const projected = projection(coords);

//         if (projected) {
//           const [x, y] = projected;
//           const radius = Math.sqrt(d.count) * 2;

//           // Check if point is on visible side of globe
//           const distance = d3.geoDistance(
//             coords,
//             projection.invert([innerWidth / 2, innerHeight / 2]) || [0, 0]
//           );
//           if (distance < Math.PI / 2) {
//             // Draw circle
//             context.beginPath();
//             context.arc(x, y, radius, 0, 2 * Math.PI);
//             context.fillStyle = colorScale(d.count);
//             context.fill();
//             context.strokeStyle = primaryColor;
//             context.lineWidth = 2;
//             context.stroke();

//             // Draw label for larger values
//             if (d.count >= 5) {
//               context.fillStyle = textColor;
//               context.font = "12px sans-serif";
//               context.textAlign = "center";
//               context.fillText(d.count.toString(), x, y - radius - 5);
//             }
//           }
//         }
//       });
//     };

//     // Initial draw
//     draw();

//     // Animation
//     const animate = () => {
//       setRotation((prev) => prev + 0.5);
//     };

//     const interval = setInterval(animate, 100);

//     // Title
//     svg
//       .append("text")
//       .attr("x", width / 2)
//       .attr("y", 30)
//       .attr("text-anchor", "middle")
//       .style("font-size", chartStyles.title.fontSize)
//       .style("font-weight", "bold")
//       .style("fill", textColor)
//       .text(title);

//     // Legend (same style as original bar chart)
//     const legendWidth = 20;
//     const legendHeight = 200;
//     const legendX = width - margin.right + 20;
//     const legendY = margin.top + 50;

//     const defs = svg.append("defs");

//     const legend = svg
//       .append("g")
//       .attr("transform", `translate(${legendX},${legendY})`);

//     const legendScale = d3
//       .scaleLinear()
//       .domain([maxCount, 0])
//       .range([0, legendHeight]);

//     // Modern legend gradient
//     const legendGradient = defs
//       .append("linearGradient")
//       .attr("id", `legend-gradient-${id}`)
//       .attr("x1", "0%")
//       .attr("y1", "0%")
//       .attr("x2", "0%")
//       .attr("y2", "100%");

//     legendGradient
//       .append("stop")
//       .attr("offset", "0%")
//       .attr("stop-color", secondaryColor)
//       .attr("stop-opacity", 1);

//     legendGradient
//       .append("stop")
//       .attr("offset", "100%")
//       .attr("stop-color", primaryColor)
//       .attr("stop-opacity", 0.3);

//     legend
//       .append("rect")
//       .attr("width", legendWidth)
//       .attr("height", legendHeight)
//       .attr("rx", 4)
//       .attr("ry", 4)
//       .style("fill", `url(#legend-gradient-${id})`);

//     const legendAxisGroup = legend
//       .append("g")
//       .attr("transform", `translate(${legendWidth},0)`)
//       .call(d3.axisRight(legendScale).ticks(5).tickSizeOuter(0));

//     legendAxisGroup.select(".domain").attr("stroke", axisColor);
//     legendAxisGroup.selectAll(".tick line").attr("stroke", axisColor);
//     legendAxisGroup.selectAll("text").style("fill", textColor);

//     // Legend label
//     legend
//       .append("text")
//       .attr("x", legendWidth / 2)
//       .attr("y", -10)
//       .attr("text-anchor", "middle")
//       .style("font-size", "14px")
//       .style("font-weight", "600")
//       .style("fill", textColor)
//       .text("Studies");

//     return () => {
//       clearInterval(interval);
//     };
//   }, [
//     worldData,
//     data,
//     width,
//     height,
//     title,
//     id,
//     isDarkMode,
//     loading,
//     rotation,
//   ]);

//   // Redraw when rotation changes
//   useEffect(() => {
//     if (!canvasRef.current || !worldData || loading) return;

//     // Modern theme colors
//     const primaryColor = isDarkMode ? "#6366F1" : "#3B82F6";
//     const secondaryColor = isDarkMode ? "#8B5CF6" : "#60A5FA";
//     const textColor = isDarkMode ? "#E5E7EB" : "#374151";

//     // Preprocess data
//     const processedData = data
//       .filter((d) => d.category !== "Unknown" && d.category !== "N/R")
//       .map((d) => ({
//         ...d,
//         category: d.category.trim(),
//         countryCode: countryNameToCode[d.category.trim()],
//       }))
//       .filter((d) => d.countryCode);

//     const maxCount = d3.max(processedData, (d) => d.count) || 0;

//     // Color scale
//     const colorScale = d3
//       .scaleSequential()
//       .domain([0, maxCount])
//       .interpolator(
//         d3.interpolateRgbBasis([
//           isDarkMode ? "#374151" : "#F3F4F6",
//           primaryColor + "80",
//           secondaryColor,
//         ])
//       );

//     const margin = {
//       top: 60,
//       right: 200,
//       bottom: 40,
//       left: 40,
//     };
//     const innerWidth = width - margin.left - margin.right;
//     const innerHeight = height - margin.top - margin.bottom;

//     const canvas = canvasRef.current;
//     const context = canvas.getContext("2d");
//     if (!context) return;

//     // Projection setup
//     const projection = d3
//       .geoOrthographic()
//       .scale(Math.min(innerWidth, innerHeight) / 4)
//       .translate([innerWidth / 2, innerHeight / 2])
//       .rotate([rotation, -30]);

//     const path = d3.geoPath().projection(projection).context(context);

//     const graticule = d3.geoGraticule();

//     // Clear canvas
//     context.clearRect(0, 0, innerWidth, innerHeight);

//     // Draw graticule (grid lines)
//     context.beginPath();
//     path(graticule());
//     context.strokeStyle = isDarkMode ? "#4B5563" : "#D1D5DB";
//     context.lineWidth = 0.5;
//     context.stroke();

//     // Draw land masses
//     context.beginPath();
//     path(worldData);
//     context.fillStyle = isDarkMode ? "#374151" : "#F3F4F6";
//     context.fill();
//     context.strokeStyle = isDarkMode ? "#6B7280" : "#9CA3AF";
//     context.lineWidth = 0.5;
//     context.stroke();

//     // Draw country data points
//     processedData.forEach((d) => {
//       const coords = getCountryCoordinates(d.countryCode);
//       const projected = projection(coords);

//       if (projected) {
//         const [x, y] = projected;
//         const radius = Math.sqrt(d.count) * 3;

//         // Check if point is on visible side of globe
//         const distance = d3.geoDistance(
//           coords,
//           projection.invert([innerWidth / 2, innerHeight / 2]) || [0, 0]
//         );
//         if (distance < Math.PI / 2) {
//           // Draw outer glow
//           context.beginPath();
//           context.arc(x, y, radius + 2, 0, 2 * Math.PI);
//           context.fillStyle = primaryColor + "40";
//           context.fill();

//           // Draw main circle
//           context.beginPath();
//           context.arc(x, y, radius, 0, 2 * Math.PI);
//           context.fillStyle = colorScale(d.count);
//           context.fill();
//           context.strokeStyle = primaryColor;
//           context.lineWidth = 2;
//           context.stroke();

//           // Draw label for larger values
//           if (d.count >= 5) {
//             context.fillStyle = textColor;
//             context.font = "bold 12px sans-serif";
//             context.textAlign = "center";
//             context.textBaseline = "middle";

//             // Draw text background
//             const textWidth = context.measureText(d.count.toString()).width;
//             context.fillStyle = isDarkMode ? "#111827CC" : "#FFFFFFCC";
//             context.fillRect(
//               x - textWidth / 2 - 2,
//               y - radius - 15,
//               textWidth + 4,
//               14
//             );

//             // Draw text
//             context.fillStyle = textColor;
//             context.fillText(d.count.toString(), x, y - radius - 8);
//           }
//         }
//       }
//     });
//   }, [worldData, data, width, height, isDarkMode, loading, rotation]);

//   useEffect(() => {
//     if (!canvasRef.current || !svgRef.current || loading) return;

//     // Mouse interaction for canvas
//     const canvas = canvasRef.current;
//     const svg = svgRef.current;

//     // Preprocess data
//     const processedData = data
//       .filter((d) => d.category !== "Unknown" && d.category !== "N/R")
//       .map((d) => ({
//         ...d,
//         category: d.category.trim(),
//         countryCode: countryNameToCode[d.category.trim()],
//       }))
//       .filter((d) => d.countryCode);

//     const margin = {
//       top: 60,
//       right: 200,
//       bottom: 40,
//       left: 40,
//     };
//     const innerWidth = width - margin.left - margin.right;
//     const innerHeight = height - margin.top - margin.bottom;

//     // Projection for mouse interactions
//     const projection = d3
//       .geoOrthographic()
//       .scale(Math.min(innerWidth, innerHeight) / 4)
//       .translate([innerWidth / 2, innerHeight / 2])
//       .rotate([rotation, -30]);

//     // Tooltip
//     const tooltip = d3
//       .select("body")
//       .selectAll(".map-tooltip")
//       .data([null])
//       .join("div")
//       .attr("class", "map-tooltip")
//       .style("position", "absolute")
//       .style("visibility", "hidden")
//       .style("background-color", isDarkMode ? "#374151" : "white")
//       .style("color", isDarkMode ? "#E5E7EB" : "#374151")
//       .style("border", `1px solid ${isDarkMode ? "#4B5563" : "#D1D5DB"}`)
//       .style("border-radius", "4px")
//       .style("padding", "8px")
//       .style("font-size", "14px")
//       .style("box-shadow", "0 2px 4px rgba(0,0,0,0.1)")
//       .style("z-index", "1000")
//       .style("pointer-events", "none");

//     // Mouse move handler
//     const handleMouseMove = (event: MouseEvent) => {
//       const rect = canvas.getBoundingClientRect();
//       const scaleX = innerWidth / rect.width;
//       const scaleY = innerHeight / rect.height;
//       const mouseX = (event.clientX - rect.left) * scaleX;
//       const mouseY = (event.clientY - rect.top) * scaleY;

//       let foundData: any = null;
//       let minDistance = Infinity;

//       processedData.forEach((d) => {
//         const coords = getCountryCoordinates(d.countryCode);
//         const projected = projection(coords);

//         if (projected) {
//           const [x, y] = projected;
//           const distance = Math.sqrt((mouseX - x) ** 2 + (mouseY - y) ** 2);
//           const radius = Math.sqrt(d.count) * 3;

//           if (distance <= radius && distance < minDistance) {
//             minDistance = distance;
//             foundData = d;
//           }
//         }
//       });

//       if (foundData) {
//         tooltip
//           .style("visibility", "visible")
//           .html(
//             `
//             <strong>${foundData.category}</strong><br/>
//             Studies: ${foundData.count.toLocaleString()}<br/>
//             Percentage: ${foundData.percentage.toFixed(1)}%
//           `
//           )
//           .style("left", event.pageX + 10 + "px")
//           .style("top", event.pageY - 10 + "px");

//         canvas.style.cursor = "pointer";
//       } else {
//         tooltip.style("visibility", "hidden");
//         canvas.style.cursor = "default";
//       }
//     };

//     // Mouse leave handler
//     const handleMouseLeave = () => {
//       tooltip.style("visibility", "hidden");
//       canvas.style.cursor = "default";
//     };

//     canvas.addEventListener("mousemove", handleMouseMove);
//     canvas.addEventListener("mouseleave", handleMouseLeave);

//     return () => {
//       canvas.removeEventListener("mousemove", handleMouseMove);
//       canvas.removeEventListener("mouseleave", handleMouseLeave);
//     };
//   }, [worldData, data, width, height, isDarkMode, loading, rotation]);

//   if (loading) {
//     return (
//       <div className="w-full h-full flex items-center justify-center">
//         <div
//           className={`text-lg ${isDarkMode ? "text-white" : "text-gray-900"}`}
//         >
//           Loading world map...
//         </div>
//       </div>
//     );
//   }

//   const margin = {
//     top: 60,
//     right: 200,
//     bottom: 40,
//     left: 40,
//   };

//   return (
//     <div className="w-full h-full relative">
//       <svg
//         ref={svgRef}
//         className="absolute inset-0 w-full h-full"
//         style={{ zIndex: 2 }}
//       />
//       <canvas
//         ref={canvasRef}
//         className="absolute"
//         style={{
//           left: margin.left,
//           top: margin.top,
//           zIndex: 1,
//           width: width - margin.left - margin.right,
//           height: height - margin.top - margin.bottom,
//         }}
//       />
//     </div>
//   );
// };

// export default Map;

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

interface ChartData {
  category: string;
  count: number;
  percentage: number;
}

interface MapProps {
  data: ChartData[];
  width?: number;
  height?: number;
  title: string;
  id: string;
  isDarkMode?: boolean;
}

const chartStyles = {
  title: {
    fontSize: "20px",
    fontWeight: "bold",
  },
  axisLabel: {
    fontSize: "18px",
  },
  axisText: {
    fontSize: "18px",
  },
  legend: {
    fontSize: "16px",
  },
  tooltip: {
    fontSize: "14px",
    padding: "8px",
    borderRadius: "4px",
    border: "1px solid #ddd",
    backgroundColor: "white",
    color: "#333",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  value: {
    fontSize: "16px",
  },
};

// ISO Country Codes mapping
const countryNameToCode: { [key: string]: string } = {
  "United States": "USA",
  Italy: "ITA",
  Brazil: "BRA",
  Bangladesh: "BGD",
  India: "IND",
  Japan: "JPN",
  China: "CHN",
  France: "FRA",
  Chile: "CHL",
  Germany: "DEU",
  Spain: "ESP",
  Egypt: "EGY",
  Kenya: "KEN",
  Uzbekistan: "UZB",
  Taiwan: "TWN",
  Indonesia: "IDN",
  UK: "GBR",
  Russia: "RUS",
  Iran: "IRN",
  Mexico: "MEX",
  "Hong Kong": "HKG",
  "Saudi Arabia": "SAU",
  Thailand: "THA",
  "The Netherlands": "NLD",
  Netherlands: "NLD",
  Botswana: "BWA",
  Palestine: "PSE",
  Iraq: "IRQ",
  Australia: "AUS",
  Ethiopia: "ETH",
  Qatar: "QAT",
  Canada: "CAN",
  "South Korea": "KOR",
  Pakistan: "PAK",
};

// Country center coordinates (longitude, latitude)
const getCountryCoordinates = (countryCode: string): [number, number] => {
  const coordinates: { [key: string]: [number, number] } = {
    USA: [-95.7129, 37.0902],
    ITA: [12.5674, 41.8719],
    BRA: [-51.9253, -14.235],
    BGD: [90.3563, 23.685],
    IND: [78.9629, 20.5937],
    JPN: [138.2529, 36.2048],
    CHN: [104.1954, 35.8617],
    FRA: [2.2137, 46.2276],
    CHL: [-71.543, -35.6751],
    DEU: [10.4515, 51.1657],
    ESP: [-3.7492, 40.4637],
    EGY: [30.8025, 26.8206],
    KEN: [37.9062, -0.0236],
    UZB: [64.5853, 41.3775],
    TWN: [120.9605, 23.6978],
    IDN: [113.9213, -0.7893],
    GBR: [-3.436, 55.3781],
    RUS: [105.3188, 61.524],
    IRN: [53.688, 32.4279],
    MEX: [-102.5528, 23.6345],
    HKG: [114.1694, 22.3193],
    SAU: [45.0792, 23.8859],
    THA: [100.9925, 15.87],
    NLD: [5.2913, 52.1326],
    BWA: [24.6849, -22.3285],
    PSE: [35.2332, 31.9522],
    IRQ: [43.6793, 33.2232],
    AUS: [133.7751, -25.2744],
    ETH: [40.4897, 9.145],
    QAT: [51.1839, 25.3548],
    CAN: [-106.3468, 56.1304],
    KOR: [127.7669, 35.9078],
    PAK: [69.3451, 30.3753],
  };
  return coordinates[countryCode] || [0, 0];
};

export const InteractiveGlobe = ({
  data,
  width = 1000,
  height = 600,
  title,
  id,
  isDarkMode = false,
}: MapProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [worldData, setWorldData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [rotation, setRotation] = useState([0, -30]);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState([0, 0]);
  const [zoom, setZoom] = useState(1);
  const [selectedCountry, setSelectedCountry] = useState<ChartData | null>(
    null
  );
  const [hoveredCountry, setHoveredCountry] = useState<ChartData | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load world map data
  useEffect(() => {
    const loadWorldData = async () => {
      try {
        const response = await fetch(
          "https://gist.githubusercontent.com/d3indepth/f28e1c3a99ea6d84986f35ac8646fac7/raw/c58cede8dab4673c91a3db702d50f7447b373d98/ne_110m_land.json"
        );
        const world = await response.json();
        setWorldData(world);
        setLoading(false);
      } catch (error) {
        console.error("Failed to load world data:", error);
        setLoading(false);
      }
    };

    loadWorldData();
  }, []);

  // Main drawing effect
  useEffect(() => {
    if (!canvasRef.current || !svgRef.current || !worldData || loading) return;

    // Modern theme colors (same as BarChart)
    const primaryColor = isDarkMode ? "#6366F1" : "#3B82F6";
    const secondaryColor = isDarkMode ? "#8B5CF6" : "#60A5FA";
    const textColor = isDarkMode ? "#E5E7EB" : "#374151";
    const axisColor = isDarkMode ? "#4B5563" : "#D1D5DB";
    const backgroundColor = isDarkMode ? "#111827" : "#FFFFFF";

    // Preprocess data
    const processedData = data
      .filter((d) => d.category !== "Unknown" && d.category !== "N/R")
      .map((d) => ({
        ...d,
        category: d.category.trim(),
        countryCode: countryNameToCode[d.category.trim()],
      }))
      .filter((d) => d.countryCode);

    const maxCount = d3.max(processedData, (d) => d.count) || 0;

    // Color scale
    const colorScale = d3
      .scaleSequential()
      .domain([0, maxCount])
      .interpolator(
        d3.interpolateRgbBasis([
          isDarkMode ? "#374151" : "#F3F4F6",
          primaryColor + "80",
          secondaryColor,
        ])
      );

    const margin = {
      top: 60,
      right: 200,
      bottom: 40,
      left: 40,
    };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Canvas setup
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;

    canvas.width = innerWidth;
    canvas.height = innerHeight;

    // SVG setup for UI elements
    const svg = d3
      .select(svgRef.current)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .attr("class", "w-full h-full");

    svg.selectAll("*").remove();

    // Background
    svg
      .append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", backgroundColor);

    // Projection setup
    const baseScale = Math.min(innerWidth, innerHeight) / 4;
    const projection = d3
      .geoOrthographic()
      .scale(baseScale * zoom)
      .translate([innerWidth / 2, innerHeight / 2])
      .rotate(rotation);

    const path = d3.geoPath().projection(projection).context(context);

    const graticule = d3.geoGraticule();

    // Draw function
    const draw = () => {
      // Clear canvas
      context.clearRect(0, 0, innerWidth, innerHeight);

      // Draw graticule (grid lines)
      context.beginPath();
      path(graticule());
      context.strokeStyle = isDarkMode ? "#4B5563" : "#D1D5DB";
      context.lineWidth = 0.5;
      context.stroke();

      // Draw land masses
      context.beginPath();
      path(worldData);
      context.fillStyle = isDarkMode ? "#374151" : "#F3F4F6";
      context.fill();
      context.strokeStyle = isDarkMode ? "#6B7280" : "#9CA3AF";
      context.lineWidth = 0.5;
      context.stroke();

      // Draw country data points
      processedData.forEach((d) => {
        const coords = getCountryCoordinates(d.countryCode);
        const projected = projection(coords);

        if (projected) {
          const [x, y] = projected;
          const radius = Math.sqrt(d.count) * 3;

          // Check if point is on visible side of globe
          const distance = d3.geoDistance(
            coords,
            projection.invert([innerWidth / 2, innerHeight / 2]) || [0, 0]
          );
          if (distance < Math.PI / 2) {
            // Draw outer glow
            context.beginPath();
            context.arc(x, y, radius + 2, 0, 2 * Math.PI);
            context.fillStyle = primaryColor + "40";
            context.fill();

            // Draw main circle
            context.beginPath();
            context.arc(x, y, radius, 0, 2 * Math.PI);
            context.fillStyle = colorScale(d.count);
            context.fill();
            context.strokeStyle = primaryColor;
            context.lineWidth = 2;
            context.stroke();

            // Draw label for larger values
            if (d.count >= 5) {
              context.fillStyle = textColor;
              context.font = "bold 12px sans-serif";
              context.textAlign = "center";
              context.textBaseline = "middle";

              // Draw text background
              const textWidth = context.measureText(d.count.toString()).width;
              context.fillStyle = isDarkMode ? "#111827CC" : "#FFFFFFCC";
              context.fillRect(
                x - textWidth / 2 - 2,
                y - radius - 15,
                textWidth + 4,
                14
              );

              // Draw text
              context.fillStyle = textColor;
              context.fillText(d.count.toString(), x, y - radius - 8);
            }
          }
        }
      });
    };

    // Draw initially and whenever rotation changes
    draw();

    // Title
    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", 30)
      .attr("text-anchor", "middle")
      .style("font-size", chartStyles.title.fontSize)
      .style("font-weight", "bold")
      .style("fill", textColor)
      .text(title);

    // Create defs for gradients
    const defs = svg.append("defs");

    // Legend (same style as original bar chart)
    const legendWidth = 20;
    const legendHeight = 200;
    const legendX = width - margin.right + 20;
    const legendY = margin.top + 50;

    const legend = svg
      .append("g")
      .attr("transform", `translate(${legendX},${legendY})`);

    const markerContainer = legend
      .append("g")
      .attr("class", "marker-container");

    const legendScale = d3
      .scaleLinear()
      .domain([maxCount, 0])
      .range([0, legendHeight]);

    // Modern legend gradient
    const legendGradient = defs
      .append("linearGradient")
      .attr("id", `legend-gradient-${id}`)
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "0%")
      .attr("y2", "100%");

    legendGradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", secondaryColor)
      .attr("stop-opacity", 1);

    legendGradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", primaryColor)
      .attr("stop-opacity", 0.3);

    legend
      .append("rect")
      .attr("width", legendWidth)
      .attr("height", legendHeight)
      .attr("rx", 4)
      .attr("ry", 4)
      .style("fill", `url(#legend-gradient-${id})`);

    const legendAxisGroup = legend
      .append("g")
      .attr("transform", `translate(${legendWidth},0)`)
      .call(d3.axisRight(legendScale).ticks(5).tickSizeOuter(0));

    legendAxisGroup.select(".domain").attr("stroke", axisColor);
    legendAxisGroup.selectAll(".tick line").attr("stroke", axisColor);
    legendAxisGroup.selectAll("text").style("fill", textColor);

    // Legend label
    legend
      .append("text")
      .attr("x", legendWidth / 2)
      .attr("y", -10)
      .attr("text-anchor", "middle")
      .style("font-size", "14px")
      .style("font-weight", "600")
      .style("fill", textColor);
    // .text("Studies");
  }, [
    worldData,
    data,
    width,
    height,
    title,
    id,
    isDarkMode,
    loading,
    rotation,
    zoom,
  ]);

  // Separate effect for legend marker updates (to avoid redrawing entire globe)
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const markerContainer = svg.select(".marker-container");

    if (markerContainer.empty()) return;

    // Modern theme colors
    const primaryColor = isDarkMode ? "#6366F1" : "#3B82F6";

    const processedData = data
      .filter((d) => d.category !== "Unknown" && d.category !== "N/R")
      .map((d) => ({
        ...d,
        category: d.category.trim(),
        countryCode: countryNameToCode[d.category.trim()],
      }))
      .filter((d) => d.countryCode);

    const maxCount = d3.max(processedData, (d) => d.count) || 0;
    const legendHeight = 200;

    const legendScale = d3
      .scaleLinear()
      .domain([maxCount, 0])
      .range([0, legendHeight]);

    // Clear previous marker
    markerContainer.selectAll("*").remove();

    // Draw marker for selected country
    if (selectedCountry) {
      const markerY = legendScale(selectedCountry.count);
      const arrowSize = 6;

      markerContainer
        .append("path")
        .attr(
          "d",
          `M-10,${markerY} L0,${markerY} L-5,${
            markerY - arrowSize
          } M0,${markerY} L-5,${markerY + arrowSize}`
        )
        .style("stroke", primaryColor)
        .style("stroke-width", 3)
        .style("fill", "none");
    }
  }, [selectedCountry, isDarkMode, data]);

  // Mouse interactions effect
  useEffect(() => {
    if (!canvasRef.current || loading) return;

    const canvas = canvasRef.current;

    // Preprocess data
    const processedData = data
      .filter((d) => d.category !== "Unknown" && d.category !== "N/R")
      .map((d) => ({
        ...d,
        category: d.category.trim(),
        countryCode: countryNameToCode[d.category.trim()],
      }))
      .filter((d) => d.countryCode);

    const margin = {
      top: 60,
      right: 200,
      bottom: 40,
      left: 40,
    };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Projection for mouse interactions
    const baseScale = Math.min(innerWidth, innerHeight) / 4;
    const projection = d3
      .geoOrthographic()
      .scale(baseScale * zoom)
      .translate([innerWidth / 2, innerHeight / 2])
      .rotate(rotation);

    // Tooltip
    let tooltip = d3.select("body").select(".map-tooltip");
    if (tooltip.empty()) {
      tooltip = d3
        .select("body")
        .append("div")
        .attr("class", "map-tooltip")
        .style("position", "absolute")
        .style("visibility", "hidden")
        .style("background-color", isDarkMode ? "#374151" : "white")
        .style("color", isDarkMode ? "#E5E7EB" : "#374151")
        .style("border", `1px solid ${isDarkMode ? "#4B5563" : "#D1D5DB"}`)
        .style("border-radius", "4px")
        .style("padding", "8px")
        .style("font-size", "14px")
        .style("box-shadow", "0 2px 4px rgba(0,0,0,0.1)")
        .style("z-index", "1000")
        .style("pointer-events", "none");
    }

    // Mouse event handlers - clean implementation
    const onMouseDown = (event: MouseEvent) => {
      setIsDragging(true);
      const rect = canvas.getBoundingClientRect();
      setLastMousePos([event.clientX - rect.left, event.clientY - rect.top]);
      canvas.style.cursor = "grabbing";
    };

    const onMouseUp = () => {
      setIsDragging(false);
      canvas.style.cursor = "grab";
    };

    const onMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = innerWidth / rect.width;
      const scaleY = innerHeight / rect.height;
      const mouseX = (event.clientX - rect.left) * scaleX;
      const mouseY = (event.clientY - rect.top) * scaleY;

      if (isDragging) {
        // Handle rotation during drag
        const currentMousePos = [
          event.clientX - rect.left,
          event.clientY - rect.top,
        ];
        const deltaX = (currentMousePos[0] - lastMousePos[0]) * scaleX;
        const deltaY = (currentMousePos[1] - lastMousePos[1]) * scaleY;

        setRotation((prev) => [
          prev[0] + deltaX * 0.5,
          Math.max(-90, Math.min(90, prev[1] - deltaY * 0.5)),
        ]);

        setLastMousePos(currentMousePos);

        // Clear tooltip and selection during drag
        tooltip.style("visibility", "hidden");
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
        }
        setSelectedCountry(null);
      } else {
        // Clear previous timeout
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
        }

        // Handle hover with debouncing
        hoverTimeoutRef.current = setTimeout(() => {
          let foundData: any = null;
          let minDistance = Infinity;

          processedData.forEach((d) => {
            const coords = getCountryCoordinates(d.countryCode);
            const projected = projection(coords);

            if (projected) {
              const [x, y] = projected;
              const distance = Math.sqrt((mouseX - x) ** 2 + (mouseY - y) ** 2);
              const radius = Math.sqrt(d.count) * 3;

              // Check if point is on visible side and within radius
              const geoDistance = d3.geoDistance(
                coords,
                projection.invert([innerWidth / 2, innerHeight / 2]) || [0, 0]
              );
              if (
                distance <= radius &&
                distance < minDistance &&
                geoDistance < Math.PI / 2
              ) {
                minDistance = distance;
                foundData = d;
              }
            }
          });

          if (foundData) {
            tooltip
              .style("visibility", "visible")
              .html(
                `
                <strong>${foundData.category}</strong><br/>
                Studies: ${foundData.count.toLocaleString()}<br/>
                Percentage: ${foundData.percentage.toFixed(1)}%
              `
              )
              .style("left", event.pageX + 15 + "px")
              .style("top", event.pageY - 35 + "px");

            setSelectedCountry(foundData);
            canvas.style.cursor = "pointer";
          } else {
            tooltip.style("visibility", "hidden");
            setSelectedCountry(null);
            canvas.style.cursor = "grab";
          }
        }, 50); // 50ms debounce
      }
    };

    const onMouseLeave = () => {
      // Clear any pending hover timeout
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }

      setIsDragging(false);
      tooltip.style("visibility", "hidden");
      setSelectedCountry(null);
      canvas.style.cursor = "grab";
    };

    // Add event listeners
    canvas.style.cursor = "grab";
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);

    return () => {
      // Clear timeout on cleanup
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }

      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [
    worldData,
    data,
    width,
    height,
    isDarkMode,
    loading,
    rotation,
    isDragging,
    lastMousePos,
    zoom,
    selectedCountry,
  ]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div
          className={`text-lg ${isDarkMode ? "text-white" : "text-gray-900"}`}
        >
          Loading world map...
        </div>
      </div>
    );
  }

  const margin = {
    top: 60,
    right: 200,
    bottom: 40,
    left: 40,
  };

  // Zoom control functions
  const handleZoomIn = () => {
    setZoom((prev) => Math.min(3, prev * 1.2));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(0.5, prev * 0.8));
  };

  return (
    <div className="w-full h-full relative">
      <svg
        ref={svgRef}
        className="absolute inset-0 w-full h-full"
        style={{ zIndex: 2 }}
      />
      <canvas
        ref={canvasRef}
        className="absolute"
        style={{
          left: margin.left,
          top: margin.top,
          zIndex: 1,
          width: width - margin.left - margin.right,
          height: height - margin.top - margin.bottom,
        }}
      />

      {/* Zoom Control Buttons */}
      <div
        className="absolute top-20 left-6 flex flex-col gap-2"
        style={{ zIndex: 3 }}
      >
        <button
          onClick={handleZoomIn}
          disabled={zoom >= 3}
          className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center font-bold text-lg transition-all duration-200 ${
            isDarkMode
              ? "bg-gray-800 border-gray-600 text-white hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-600"
              : "bg-white border-gray-300 text-gray-900 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
          } ${
            zoom >= 3 ? "cursor-not-allowed" : "cursor-pointer hover:scale-105"
          }`}
          title="Zoom In"
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          disabled={zoom <= 0.5}
          className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center font-bold text-lg transition-all duration-200 ${
            isDarkMode
              ? "bg-gray-800 border-gray-600 text-white hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-600"
              : "bg-white border-gray-300 text-gray-900 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
          } ${
            zoom <= 0.5
              ? "cursor-not-allowed"
              : "cursor-pointer hover:scale-105"
          }`}
          title="Zoom Out"
        >
          −
        </button>

        {/* Zoom Level Indicator */}
        <div
          className={`mt-2 text-xs text-center px-2 py-1 rounded ${
            isDarkMode ? "text-gray-300" : "text-gray-600"
          }`}
        >
          {(zoom * 100).toFixed(0)}%
        </div>
      </div>
    </div>
  );
};

export default InteractiveGlobe;
