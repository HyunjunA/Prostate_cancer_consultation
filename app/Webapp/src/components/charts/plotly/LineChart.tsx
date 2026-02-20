import dynamic from "next/dynamic";
import React from "react";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const LineChart = () => {
  const data = [
    {
      x: [1, 2, 3, 4],
      y: [10, 15, 13, 17],
      type: "scatter",
    },
    {
      x: [1, 2, 3, 4],
      y: [16, 5, 11, 9],
      type: "scatter",
    },
  ];

  const layout = {
    // height: 400,
    // width: 450,
    margin: { l: 35, r: 20, b: 35, t: 40 },
    xaxis: { title: "X Axis" },
    yaxis: { title: "Y Axis" },
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

export default LineChart;
