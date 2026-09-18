import dynamic from "next/dynamic";
import React from "react";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const ScatterPlot = () => {
  const data = [
    {
      x: [1, 2, 3, 4],
      y: [10, 15, 13, 17],
      mode: "markers",
      type: "scatter",
    },
    {
      x: [2, 3, 4, 5],
      y: [16, 5, 11, 9],
      mode: "lines",
      type: "scatter",
    },
    {
      x: [1, 2, 3, 4],
      y: [12, 9, 15, 12],
      mode: "lines+markers",
      type: "scatter",
    },
  ];

  const layout = {
    autosize: true,
    title: "Scatter Plot",
    xaxis: {
      title: "X Axis",
    },
    yaxis: {
      title: "Y Axis",
    },
    margin: {
      l: 35,
      r: 20,
      b: 35,
      t: 60,
    },
    // height: 400, // fixed height
    // width: 450, // fixed width
  };

  const config = {
    displayModeBar: false,
    displaylogo: false,
    showTips: true,
    responsive: true,
  };

  return (
    <div className="w-full h-[400px]">
      {" "}
      {/* fixed container height */}
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

export default ScatterPlot;
