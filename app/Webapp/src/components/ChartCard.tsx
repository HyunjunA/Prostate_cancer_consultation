import React, { useId } from "react";
import { Download, ImageDown } from "lucide-react";

interface ChartCardProps {
  children: React.ReactNode;
  title?: string;
}

export const ChartCard: React.FC<ChartCardProps> = ({ children, title }) => {
  const uniqueId = useId();
  const chartContainerId = `chart-container-${uniqueId}`;

  const handleDownload = () => {
    const chartContainer = document.getElementById(chartContainerId);
    if (!chartContainer) return;

    import("html2canvas").then((html2canvas) => {
      html2canvas
        .default(chartContainer, {
          scale: 2,
          backgroundColor: null,
          height: chartContainer.scrollHeight,
          width: chartContainer.scrollWidth,
          useCORS: true,
          ignoreElements: (element) => {
            return element.hasAttribute("data-no-download");
          },
        })
        .then((canvas) => {
          canvas.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${title || "chart"}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, "image/png");
        });
    });
  };

  return (
    <div
      id={chartContainerId}
      // className="group bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm
      // rounded-xl border border-gray-100 dark:border-gray-700
      // shadow-sm hover:shadow-xl transition-colors duration-300
      // relative min-w-[300px] min-h-[200px] w-full
      // resize overflow-hidden cursor-move z-0"

      className="group bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm
      rounded-xl border border-gray-100 dark:border-gray-700
      shadow-sm hover:shadow-xl transition-colors duration-300
      relative min-w-[300px] min-h-[200px] w-full
      overflow-hidden cursor-move z-0"
    >
      <div className="px-5 py-4">
        {" "}
        {/* h-full 제거 */}
        {title && (
          <div
            className="border-b border-gray-100 dark:border-gray-700 pb-3 mb-4
            flex items-center justify-between
            group-hover:border-blue-200 dark:group-hover:border-blue-800
            transition-colors duration-300"
          >
            <h3
              className="text-sm font-semibold text-gray-800 dark:text-gray-200
              uppercase tracking-wider
              group-hover:text-blue-600 dark:group-hover:text-blue-400
              transition-colors duration-300"
            >
              {title}
            </h3>
            <button
              id="downloadchart"
              data-no-download="true"
              onClick={handleDownload}
              className="inline-flex items-center px-3 py-1.5 rounded-md
                text-sm font-medium
                text-gray-600 hover:text-blue-600
                dark:text-gray-300 dark:hover:text-blue-400
                bg-white hover:bg-gray-50
                dark:bg-gray-800 dark:hover:bg-gray-700
                border border-gray-200 dark:border-gray-600
                transition-all duration-300
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <ImageDown className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Download Chart</span>
            </button>
          </div>
        )}
        <div className="relative">
          {" "}
          {/* 높이 제한 완전 제거 */}
          <div className="relative">{children}</div>
        </div>
      </div>
    </div>
  );
};

export default ChartCard;
