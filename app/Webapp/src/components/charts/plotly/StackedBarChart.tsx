// import React from "react";
// import dynamic from "next/dynamic";

// const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

// interface ZooData {
//   animal: string;
//   sfCount: number;
//   laCount: number;
// }

// interface StackedBarProps {
//   data?: ZooData[];
// }

// const StackedBarChartplotly: React.FC<StackedBarProps> = ({
//   data = [
//     { animal: "giraffes", sfCount: 20, laCount: 12 },
//     { animal: "orangutans", sfCount: 14, laCount: 18 },
//     { animal: "monkeys", sfCount: 23, laCount: 29 },
//   ],
// }) => {
//   const plotData = [
//     {
//       x: data.map((d) => d.animal),
//       y: data.map((d) => d.sfCount),
//       name: "SF Zoo",
//       type: "bar",
//     },
//     {
//       x: data.map((d) => d.animal),
//       y: data.map((d) => d.laCount),
//       name: "LA Zoo",
//       type: "bar",
//     },
//   ];

//   const layout = {
//     barmode: "stack",
//     autosize: true,
//     margin: {
//       l: 40,
//       r: 40,
//       t: 40,
//       b: 40,
//     },
//   };

//   const config = {
//     displayModeBar: false,
//     responsive: true,
//   };

//   return (
//     <div className="w-full h-[400px]">
//       <Plot
//         data={plotData}
//         layout={layout}
//         config={config}
//         useResizeHandler={true}
//         style={{ width: "100%", height: "100%" }}
//       />
//     </div>
//   );
// };

// export default StackedBarChartplotly;

import React from "react";
import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface ZooData {
  animal: string;
  sfCount: number;
  laCount: number;
}

interface StackedBarProps {
  data?: ZooData[];
}

const StackedBarChartplotly: React.FC<StackedBarProps> = ({
  data = [
    { animal: "giraffes", sfCount: 20, laCount: 12 },
    { animal: "orangutans", sfCount: 14, laCount: 18 },
    { animal: "monkeys", sfCount: 23, laCount: 29 },
  ],
}) => {
  const plotData = [
    {
      x: data.map((d) => d.animal),
      y: data.map((d) => d.sfCount),
      name: "SF Zoo",
      type: "bar",
      transforms: [
        {
          type: "aggregate",
          aggregations: [{ target: "y", func: "sum", enabled: true }],
        },
      ],
      // 애니메이션 설정
      opacity: 0.7,
      marker: {
        color: "#1f77b4", // 색상 추가
      },
    },
    {
      x: data.map((d) => d.animal),
      y: data.map((d) => d.laCount),
      name: "LA Zoo",
      type: "bar",
      transforms: [
        {
          type: "aggregate",
          aggregations: [{ target: "y", func: "sum", enabled: true }],
        },
      ],
      // 애니메이션 설정
      opacity: 0.7,
      marker: {
        color: "#ff7f0e", // 색상 추가
      },
    },
  ];

  const layout = {
    barmode: "stack",
    autosize: true,
    margin: {
      l: 40,
      r: 40,
      t: 40,
      b: 40,
    },
    // 애니메이션 설정
    transition: {
      duration: 1000,
      easing: "cubic-in-out",
    },
    // 초기 프레임 설정
    animate: true,
    // 데이터 업데이트시 애니메이션 설정
    updatemenus: [
      {
        type: "buttons",
        showactive: false,
        visible: false,
        buttons: [
          {
            method: "animate",
            args: [
              null,
              {
                mode: "immediate",
                fromcurrent: true,
                frame: { redraw: true, duration: 1000 },
                transition: { duration: 1000 },
              },
            ],
          },
        ],
      },
    ],
    // 초기 프레임 설정
    frames: [
      {
        name: "initial",
        data: plotData.map((trace) => ({
          ...trace,
          y: Array(trace.y.length).fill(0),
        })),
      },
      {
        name: "final",
        data: plotData,
      },
    ],
  };

  const config = {
    displayModeBar: false,
    responsive: true,
  };

  React.useEffect(() => {
    // 컴포넌트가 마운트된 후 애니메이션 시작
    const timer = setTimeout(() => {
      const plotElement = document.querySelector(".js-plotly-plot");
      if (plotElement) {
        // @ts-ignore
        plotElement._fullLayout.animate = true;
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="w-full h-[400px]">
      <Plot
        data={plotData}
        layout={layout}
        config={config}
        useResizeHandler={true}
        style={{ width: "100%", height: "100%" }}
        onInitialized={(figure) => {
          // 초기 렌더링시 애니메이션 시작
          if (figure) {
            const frames = [
              {
                data: plotData.map((trace) => ({
                  ...trace,
                  y: trace.y.map((y) => 0),
                })),
              },
              {
                data: plotData,
              },
            ];

            // @ts-ignore
            Plotly.animate("myDiv", frames, {
              frame: { duration: 1000, redraw: true },
              transition: { duration: 1000, easing: "cubic-in-out" },
              mode: "immediate",
            });
          }
        }}
      />
    </div>
  );
};

export default StackedBarChartplotly;
