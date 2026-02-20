import React from "react";
import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface VotingData {
  country: string;
  votingPop: number;
  regVoters: number;
}

interface VotingScatterProps {
  data?: VotingData[];
}

const VotingScatter: React.FC<VotingScatterProps> = ({
  data = [
    { country: "Switzerland (2011)", votingPop: 40, regVoters: 49.1 },
    { country: "Chile (2013)", votingPop: 45.7, regVoters: 42 },
    { country: "Japan (2014)", votingPop: 52, regVoters: 52.7 },
    { country: "United States (2012)", votingPop: 53.6, regVoters: 84.3 },
    { country: "Slovenia (2014)", votingPop: 54.1, regVoters: 51.7 },
    { country: "Canada (2011)", votingPop: 54.2, regVoters: 61.1 },
    { country: "Poland (2010)", votingPop: 54.5, regVoters: 55.3 },
    { country: "Estonia (2015)", votingPop: 54.7, regVoters: 64.2 },
    { country: "Luxembourg (2013)", votingPop: 55.1, regVoters: 91.1 },
    { country: "Portugal (2011)", votingPop: 56.6, regVoters: 58.9 },
  ],
}) => {
  const plotData = [
    {
      type: "scatter",
      x: data.map((d) => d.votingPop),
      y: data.map((d) => d.country),
      mode: "markers",
      name: "Percent of estimated voting age population",
      marker: {
        color: "rgba(156, 165, 196, 0.95)",
        line: {
          color: "rgba(156, 165, 196, 1.0)",
          width: 1,
        },
        symbol: "circle",
        size: 16,
      },
    },
    {
      x: data.map((d) => d.regVoters),
      y: data.map((d) => d.country),
      mode: "markers",
      name: "Percent of estimated registered voters",
      marker: {
        color: "rgba(204, 204, 204, 0.95)",
        line: {
          color: "rgba(217, 217, 217, 1.0)",
          width: 1,
        },
        symbol: "circle",
        size: 16,
      },
    },
  ];

  const layout = {
    title: {
      text: "Votes cast for ten lowest voting age population in OECD countries",
      font: {
        color: "rgb(204, 204, 204)",
      },
    },
    xaxis: {
      showgrid: false,
      showline: true,
      linecolor: "rgb(102, 102, 102)",
      tickfont: {
        color: "rgb(102, 102, 102)",
      },
      tickmode: "linear",
      dtick: 10,
      ticks: "outside",
      tickcolor: "rgb(102, 102, 102)",
    },
    margin: {
      l: 140,
      r: 40,
      b: 50,
      t: 80,
    },
    legend: {
      font: {
        size: 10,
      },
      yanchor: "middle",
      xanchor: "right",
    },
    paper_bgcolor: "rgb(254, 247, 234)",
    plot_bgcolor: "rgb(254, 247, 234)",
    hovermode: "closest",
    autosize: true,
    height: 600, // 필요한 경우 더 큰 값으로 조정
  };

  const config = {
    displayModeBar: false,
    responsive: true,
  };

  return (
    <div className="w-full h-[400px] overflow-auto">
      <Plot
        data={plotData}
        layout={layout}
        config={config}
        useResizeHandler={true}
        style={{ width: "100%", minHeight: "100%" }}
      />
    </div>
  );
};

export default VotingScatter;
