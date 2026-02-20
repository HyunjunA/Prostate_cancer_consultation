import dynamic from "next/dynamic";
import React from "react";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const DonutChartPlotly = () => {
  const data = [
    {
      values: [19, 26, 55],
      labels: ["Residential", "Non-Residential", "Utility"],
      type: "pie",
      hole: 0.4, // 이 속성이 도넛 차트를 만듭니다. 0.4는 중앙 구멍의 크기 (0-1 사이 값)
      textinfo: "label+percent", // 라벨과 퍼센트를 표시
      textposition: "outside", // 텍스트를 차트 바깥에 위치
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
      orientation: "h", // 범례를 수평으로 배치
      yanchor: "bottom", // 범례를 아래쪽에 고정
      y: -0.2, // 범례의 y 위치
      xanchor: "center", // 범례를 중앙에 배치
      x: 0.5, // 범례의 x 위치
    },
    annotations: [
      {
        // 중앙에 텍스트 추가 (선택사항)
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
