import React from "react";
import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface TableProps {
  headerValues?: string[][];
  cellValues?: (string | number)[][];
  headerColor?: string;
  rowEvenColor?: string;
  rowOddColor?: string;
  headerFontSize?: number;
  cellFontSize?: number;
  height?: string;
}

const DataTable: React.FC<TableProps> = ({
  headerValues = [
    ["<b>EXPENSES</b>"],
    ["<b>Q1</b>"],
    ["<b>Q2</b>"],
    ["<b>Q3</b>"],
    ["<b>Q4</b>"],
  ],
  cellValues = [
    ["Salaries", "Office", "Merchandise", "Legal", "<b>TOTAL</b>"],
    [1200000, 20000, 80000, 2000, 12120000],
    [1300000, 20000, 70000, 2000, 130902000],
    [1300000, 20000, 120000, 2000, 131222000],
    [1400000, 20000, 90000, 2000, 14102000],
  ],
  headerColor = "grey",
  rowEvenColor = "lightgrey",
  rowOddColor = "white",
  headerFontSize = 12,
  cellFontSize = 11,
  height = "400px",
}) => {
  const data = [
    {
      type: "table",
      header: {
        values: headerValues,
        align: "center",
        line: { width: 1, color: "black" },
        fill: { color: headerColor },
        font: { family: "Arial", size: headerFontSize, color: "white" },
      },
      cells: {
        values: cellValues,
        align: "center",
        line: { color: "black", width: 1 },
        fill: {
          color: Array(cellValues.length).fill([
            rowOddColor,
            rowEvenColor,
            rowOddColor,
            rowEvenColor,
            rowOddColor,
          ]),
        },
        font: { family: "Arial", size: cellFontSize, color: ["black"] },
      },
    },
  ];

  const layout = {
    autosize: true,
    margin: {
      l: 20,
      r: 20,
      t: 20,
      b: 20,
    },
  };

  const config = {
    displayModeBar: false,
    responsive: true,
  };

  return (
    <div className={`w-full h-[${height}]`}>
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

export default DataTable;
