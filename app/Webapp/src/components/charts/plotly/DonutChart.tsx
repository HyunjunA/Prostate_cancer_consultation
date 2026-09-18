import dynamic from "next/dynamic";
import React from "react";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const DonutChartPlotly = () => {
  const data = [
    {
      values: [19, 26, 55],
      labels: ["Residential", "Non-Residential", "Utility"],
      type: "pie",
      hole: 0.4, // creates the donut shape; 0.4 is the inner hole size (0–1)
      textinfo: "label+percent", // display label and percent
      textposition: "outside", // position text outside the chart
      automargin: true,
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
    legend: {
      orientation: "h", // arrange legend horizontally
      yanchor: "bottom", // anchor legend at bottom
      y: -0.2, // y position of the legend
      xanchor: "center", // center the legend horizontally
      x: 0.5, // x position of the legend
    },
    annotations: [
      {
        // Add center text (optional)
        text: "Total",
        showarrow: false,
        font: {
          size: 20,
        },
      },
    ],
    margin: {
      l: 20,
      r: 20,
      b: 80,
      t: 40,
    },
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

export default DonutChartPlotly;
