import React, { useMemo } from "react";
import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface GaussianLinesProps {
  startValue?: number;
  stopValue?: number;
  pointNum?: number;
  traceNum?: number;
  height?: string;
}

const GaussianLines: React.FC<GaussianLinesProps> = ({
  startValue = 0,
  stopValue = 1,
  pointNum = 5000,
  traceNum = 10,
  height = "600px",
}) => {
  // Gaussian random number generator
  const gaussianRand = () => {
    let rand = 0;
    for (let i = 0; i < 6; i++) {
      rand += Math.random();
    }
    return rand / 6 - 0.5;
  };

  // Generate plot data using useMemo to avoid unnecessary recalculations
  const plotData = useMemo(() => {
    const step = (stopValue - startValue) / (pointNum - 1);
    const data = [];

    for (let j = 0; j < traceNum; j++) {
      const X = [];
      const Y = [];

      for (let i = 0; i < pointNum; i++) {
        X.push(startValue + step * i);
        Y.push(gaussianRand() * 8 + j * 5);
      }

      data.push({
        type: "scattergl",
        mode: "lines",
        x: X,
        y: Y,
        hoverinfo: "none",
        line: {
          width: 1,
          color: `hsl(${(j * 360) / traceNum}, 70%, 50%)`, // Different color for each line
        },
      });
    }

    return data;
  }, [startValue, stopValue, pointNum, traceNum]);

  const layout = {
    showlegend: false,
    autosize: true,
    margin: {
      l: 40,
      r: 40,
      t: 40,
      b: 40,
    },
    xaxis: {
      showgrid: false,
      zeroline: false,
    },
    yaxis: {
      showgrid: false,
      zeroline: false,
    },
    plot_bgcolor: "white",
    paper_bgcolor: "white",
  };

  const config = {
    displayModeBar: false,
    responsive: true,
  };

  return (
    <div className={`w-full h-[${height}]`}>
      <Plot
        data={plotData}
        layout={layout}
        config={config}
        useResizeHandler={true}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
};

export default GaussianLines;
