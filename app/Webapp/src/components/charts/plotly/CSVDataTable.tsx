import React, { useState, useRef } from "react";
import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface TableProps {
  headerColor?: string;
  rowEvenColor?: string;
  rowOddColor?: string;
  headerFontSize?: number;
  cellFontSize?: number;
  height?: string;
}

const CSVDataTable: React.FC<TableProps> = ({
  headerColor = "grey",
  rowEvenColor = "lightgrey",
  rowOddColor = "white",
  headerFontSize = 12,
  cellFontSize = 11,
  height = "400px",
}) => {
  const [headerValues, setHeaderValues] = useState<string[][]>([]);
  const [cellValues, setCellValues] = useState<(string | number)[][]>([]);
  const [showTable, setShowTable] = useState(false);
  const [error, setError] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processCSV = (text: string) => {
    try {
      // Split the CSV text into rows and clean up empty rows
      const rows = text
        .split("\n")
        .map((row) => row.split(",").map((cell) => cell.trim()))
        .filter((row) => row.length > 0 && row.some((cell) => cell !== ""));

      if (rows.length < 2) {
        throw new Error(
          "CSV file must contain headers and at least one row of data"
        );
      }

      // First row as headers
      const headers = rows[0].map((header) => [`<b>${header}</b>`]);

      // Process the data rows
      const processedRows = rows
        .slice(1)
        .filter((row) => row.length === headers.length);

      if (processedRows.length === 0) {
        throw new Error("No valid data rows found in CSV file");
      }

      // Transpose the data
      const transposedData = Array.from(
        { length: headers.length },
        (_, colIndex) =>
          processedRows.map((row) => {
            const value = row[colIndex] || "";
            return isNaN(Number(value)) ? value : Number(value);
          })
      );

      setHeaderValues(headers);
      setCellValues(transposedData);
      setShowTable(true);
      setError("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error processing CSV file"
      );
      setShowTable(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type !== "text/csv" && !file.name.endsWith(".csv")) {
        setError("Please upload a valid CSV file");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        processCSV(text);
      };
      reader.onerror = () => {
        setError("Error reading file");
      };
      reader.readAsText(file);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      if (file.type !== "text/csv" && !file.name.endsWith(".csv")) {
        setError("Please upload a valid CSV file");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        processCSV(text);
      };
      reader.onerror = () => {
        setError("Error reading file");
      };
      reader.readAsText(file);
    }
  };

  const resetUpload = () => {
    setShowTable(false);
    setHeaderValues([]);
    setCellValues([]);
    setError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

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
    <div className="w-full">
      {!showTable ? (
        <div
          className="w-full min-h-[400px] border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center p-6 cursor-pointer hover:border-gray-400 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".csv"
            className="hidden"
          />
          <div className="text-center space-y-4">
            <div className="text-2xl font-semibold text-gray-700">
              Upload your CSV file
            </div>
            <div className="text-gray-500">
              Drag and drop your file here or click to browse
            </div>
            <div className="text-sm text-gray-400">
              Only CSV files are supported
            </div>
            {error && <div className="text-red-500 text-sm mt-2">{error}</div>}
          </div>
        </div>
      ) : (
        <div className={`w-full h-[${height}]`}>
          <div className="mb-4">
            <button
              className="px-4 py-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
              onClick={resetUpload}
            >
              Upload another file
            </button>
          </div>
          <Plot
            data={data}
            layout={layout}
            config={config}
            useResizeHandler={true}
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      )}
    </div>
  );
};

export default CSVDataTable;
