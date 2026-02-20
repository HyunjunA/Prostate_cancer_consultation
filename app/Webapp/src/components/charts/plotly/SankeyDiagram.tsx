import React from "react";
import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const SankeyDiagramplotly = () => {
  // 예시 데이터
  const sampleData = {
    type: "sankey",
    domain: {
      x: [0, 1],
      y: [0, 1],
    },
    orientation: "h",
    valueformat: ".0f",
    valuesuffix: "TWh",
    node: {
      pad: 15,
      thickness: 15,
      line: {
        color: "black",
        width: 0.5,
      },
      label: [
        "Agricultural 'waste'",
        "Bio-conversion",
        "Liquid",
        "Losses",
        "Solid",
        "Gas",
        "Biofuel imports",
        "Biomass imports",
        "Coal imports",
        "Coal",
        "Coal reserves",
        "District heating",
        "Industry",
        "Heating and cooling - commercial",
        "Heating and cooling - homes",
        "Electricity grid",
        "Over generation / exports",
        "H2 conversion",
        "Road transport",
        "Agriculture",
        "Rail transport",
        "Lighting & appliances - commercial",
        "Lighting & appliances - homes",
        "Gas imports",
        "Ngas",
        "Gas reserves",
        "Thermal generation",
        "Geothermal",
        "H2",
        "Hydro",
        "International shipping",
        "Domestic aviation",
        "International aviation",
        "National navigation",
        "Marine algae",
        "Nuclear",
        "Oil imports",
        "Oil",
        "Oil reserves",
        "Other waste",
        "Pumped heat",
        "Solar PV",
        "Solar Thermal",
        "Solar",
        "Tidal",
        "UK land based bioenergy",
        "Wave",
        "Wind",
      ],
      color: [
        "#cfa256",
        "#5ba854",
        "#aaaa44",
        "#cd5c5c",
        "#8b4513",
        "#87ceeb",
        "#cfa256",
        "#5ba854",
        "#8b4513",
        "#8b4513",
        "#8b4513",
        "#cd5c5c",
        "#cd5c5c",
        "#cd5c5c",
        "#cd5c5c",
        "#4169e1",
        "#4169e1",
        "#aaaa44",
        "#4169e1",
        "#5ba854",
        "#4169e1",
        "#cd5c5c",
        "#cd5c5c",
        "#87ceeb",
        "#87ceeb",
        "#87ceeb",
        "#cd5c5c",
        "#aa4499",
        "#aaaa44",
        "#4169e1",
        "#cd5c5c",
        "#cd5c5c",
        "#cd5c5c",
        "#cd5c5c",
        "#5ba854",
        "#cd5c5c",
        "#cfa256",
        "#cfa256",
        "#cfa256",
        "#cd5c5c",
        "#cd5c5c",
        "#f4d03f",
        "#f4d03f",
        "#f4d03f",
        "#4169e1",
        "#5ba854",
        "#4169e1",
        "#4169e1",
      ],
    },
    link: {
      source: [
        0, 1, 1, 1, 1, 6, 7, 8, 10, 9, 11, 11, 11, 12, 13, 14, 15, 16, 16, 17,
        17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34,
        35, 36, 37, 38, 39, 40, 41, 42, 43, 44,
      ],
      target: [
        1, 2, 3, 4, 5, 2, 4, 9, 9, 4, 12, 13, 14, 15, 15, 15, 16, 17, 18, 18,
        19, 20, 20, 15, 15, 15, 24, 24, 24, 15, 15, 17, 15, 31, 32, 33, 15, 35,
        36, 37, 37, 39, 40, 41, 42, 43, 44, 45,
      ],
      value: [
        124.729, 0.597, 26.862, 280.322, 81.144, 35, 35, 11.606, 63.965, 75.571,
        10.639, 22.505, 46.184, 104.453, 113.726, 27.14, 342.165, 37.797, 4.412,
        40.858, 56.691, 7.863, 0.129, 11.161, 63.647, 2.136, 39.148, 8.242,
        48.32, 195.633, 95.033, 58.478, 82.66, 23.425, 17.087, 9.452, 19.013,
        13.624, 56.623, 139.683, 0.19, 100, 30.329, 53.911, 56.587, 6.679,
        34.642, 51.838,
      ],
    },
  };

  const layout = {
    title: {
      text: "Energy forecast for 2050<br>Source: Department of Energy & Climate Change, Tom Counsell via <a href='https://bost.ocks.org/mike/sankey/'>Mike Bostock</a>",
    },
    width: 1118,
    height: 772,
    font: {
      size: 10,
    },
    autosize: true,
  };

  const config = {
    displayModeBar: false,
    responsive: true,
  };

  return (
    <div className="w-full h-[800px]">
      <Plot
        data={[sampleData]}
        layout={layout}
        config={config}
        useResizeHandler={true}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
};

export default SankeyDiagramplotly;
