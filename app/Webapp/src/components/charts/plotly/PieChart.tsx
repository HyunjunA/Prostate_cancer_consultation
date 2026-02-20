import dynamic from "next/dynamic";
import React from "react";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const PieChartplotly = () => {
  const data = [
    {
      values: [19, 26, 55],
      labels: ["Residential", "Non-Residential", "Utility"],
      type: "pie",
    },
  ];

  const layout = {
    title: {
      text: "Number of Graphs Made this Week",
    },
    font: {
      family: "Raleway, sans-serif",
    },
    showlegend: true,
    xaxis: {
      tickangle: -45,
    },
    yaxis: {
      zeroline: false,
      gridwidth: 2,
    },
    bargap: 0.05,
    margin: { l: 35, r: 20, b: 80, t: 40 }, // Adjusted bottom margin for rotated labels
  };

  const config = {
    displayModeBar: false,
    responsive: true,
  };

  return (
    <div className="w-full h-[400px]">
      <Plot
        data={data}
        layout={layout}
        config={config}
        useResizeHandler={true}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
};

export default PieChartplotly;
