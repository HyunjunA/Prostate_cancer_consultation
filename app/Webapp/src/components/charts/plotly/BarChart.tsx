import dynamic from "next/dynamic";
import React from "react";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const BarChartplotly = () => {
  const data = [
    {
      x: ["Liam", "Sophie", "Jacob", "Mia", "William", "Olivia"],
      y: [8.0, 8.0, 12.0, 12.0, 13.0, 20.0],
      type: "bar",
      text: [
        "4.17 below the mean",
        "4.17 below the mean",
        "0.17 below the mean",
        "0.17 below the mean",
        "0.83 above the mean",
        "7.83 above the mean",
      ],
      marker: {
        color: "rgb(142,124,195)",
      },
    },
  ];

  const layout = {
    title: {
      text: "Number of Graphs Made this Week",
    },
    font: {
      family: "Raleway, sans-serif",
    },
    showlegend: false,
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

export default BarChartplotly;
