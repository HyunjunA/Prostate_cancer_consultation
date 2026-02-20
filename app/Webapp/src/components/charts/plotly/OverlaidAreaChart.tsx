import React from "react";
import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface OverlaidAreaChartProps {
  title?: string;
}

const OverlaidAreaChart: React.FC<OverlaidAreaChartProps> = ({
  title = "Overlaid Chart Without Boundary Lines",
}) => {
  const trace1 = {
    x: [1, 2, 3, 4],
    y: [0, 2, 3, 5],
    fill: "tozeroy",
    type: "scatter",
    mode: "none",
  };

  const trace2 = {
    x: [1, 2, 3, 4],
    y: [3, 5, 1, 7],
    fill: "tonexty",
    type: "scatter",
    mode: "none",
  };

  const layout = {
    title: {
      text: title,
    },
    autosize: true,
    margin: {
      l: 50,
      r: 50,
      b: 50,
      t: 50,
      pad: 4,
    },
  };

  const config = {
    displayModeBar: false,
    responsive: true,
  };

  return (
    <div className="w-full h-[400px]">
      <Plot
        data={[trace1, trace2]}
        layout={layout}
        config={config}
        useResizeHandler={true}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
};

export default OverlaidAreaChart;
