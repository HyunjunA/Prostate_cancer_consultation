// import React, { useState, useEffect } from "react";
// import OpenAI from "openai";
// import html2canvas from "html2canvas";
// import jsPDF from "jspdf";
// import { FileDown, Loader2 } from "lucide-react";

// import { useThemeStore } from "@/stores/useThemeStore";

// export const ReportDownload = () => {
//   const [isGenerating, setIsGenerating] = useState(false);
//   const [summaryText, setSummaryText] = useState("");
//   const { isDarkMode } = useThemeStore();

//   // Function to capture charts as images
//   const captureChartsAsImages = async () => {
//     // Get all chart containers - adjust these selectors to match your actual chart containers
//     const chartContainers = document.querySelectorAll(
//       '.chart-container, .recharts-wrapper, [id^="chart-"]'
//     );
//     const chartImages = [];

//     for (const container of chartContainers) {
//       try {
//         // Capture this specific chart as an image
//         const canvas = await html2canvas(container, {
//           scale: 2,
//           useCORS: true,
//           logging: false,
//           backgroundColor: isDarkMode ? "#1e1e1e" : "#ffffff",
//         });

//         // Convert canvas to base64 image data
//         const imageData = canvas.toDataURL("image/png");
//         chartImages.push(imageData);
//       } catch (error) {
//         console.error("Error capturing chart:", error);
//       }
//     }

//     return chartImages;
//   };

//   /**
//    * Get the OpenAI API key from localStorage or environment variables
//    * @returns {string|null} The API key or null if not found
//    */
//   function getApiKey() {
//     // First try to get the key from localStorage
//     if (typeof window !== "undefined") {
//       try {
//         const localStorageKey = localStorage.getItem("openai_api_key");
//         if (localStorageKey) {
//           return localStorageKey;
//         }
//       } catch (error) {
//         console.error("Error accessing localStorage:", error);
//       }
//     }

//     // If not found in localStorage, try environment variable
//     // Note: This should be prefixed with NEXT_PUBLIC_ to be accessible on the client side
//     const envApiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;

//     return envApiKey || null;
//   }

//   // Function to generate summary using OpenAI API with image input
//   const generateSummaryWithOpenAI = async (chartImages) => {
//     if (!chartImages || chartImages.length === 0) {
//       console.warn("No chart images captured for analysis");
//       throw new Error("No chart images provided for analysis");
//     }

//     try {
//       const apiKey = getApiKey();

//       if (!apiKey) {
//         console.error(
//           "OpenAI API key is missing. Make sure NEXT_PUBLIC_OPENAI_API_KEY is set in your environment."
//         );
//         throw new Error("OpenAI API key is not configured");
//       }

//       // OpenAI 클라이언트 초기화
//       const openai = new OpenAI({
//         apiKey: apiKey,
//         dangerouslyAllowBrowser: true, // 브라우저에서 실행을 허용
//       });

//       // 시스템 프롬프트 설정
//       const systemPrompt = `
//       You are a highly cautious and defensive data analysis expert.
//       You do not draw premature conclusions and refrain from making definitive judgments in the absence of clear evidence.
//       Your analysis is strictly based on observable data without speculation or assumptions.

//       ---
//       **Analysis Guidelines:**
//       1. **General Trend Analysis:**
//          - Describe only the changes that are clearly observable in the given data.
//          - Do not make predictions or assumptions; construct sentences based solely on confirmed facts.
//          - Use cautious wording such as "According to the data," and "The observed pattern is as follows."

//       2. **Changes in Positive and Negative Cases:**
//          - If a change is observed at a specific time point, state it as:
//            "During this period, the number of cases appears to have increased (or decreased)."
//          - Avoid speculating on the causes of the increase or decrease; only mention what is directly confirmed by the data.

//       3. **Comparison Between CDC and Researcher Data:**
//          - If a difference exists between the two datasets, phrase it as:
//            "A discrepancy has been observed, but the reason is not clearly identifiable from the data alone."
//          - Use language such as "Further analysis may be required to determine if this difference is statistically significant."

//       4. **Text-Based Results Without Visualization:**
//          - Clearly summarize the findings in sentence form.
//          - Maintain a structured format, such as:
//            - "In mid-November 2024, the number of flu-positive cases appears to have increased compared to the previous week."
//            - "Compared to CDC data, the researcher-collected data shows a higher flu positivity rate; however, the reason for this difference cannot be determined solely from the available data."

//       ---
//       **Defensive Analysis Principles:**
//       - **Avoid speculation and base analysis strictly on observable data.**
//       - **For ambiguous aspects, use phrases like "Additional data is needed" rather than drawing firm conclusions.**
//       - **Maintain cautious wording, incorporating expressions such as "Data suggests," "Further interpretation is necessary," and "Findings should be considered with caution."**

//       ---
//       Now, generate a concise summary (100-150 words) following the defensive analysis principles.
//       `;

//       // 메시지 배열 준비
//       const messages = [
//         {
//           role: "system",
//           content: systemPrompt,
//         },
//       ];

//       // 이미지 처리
//       console.log("Processing images for analysis...");
//       for (let i = 0; i < chartImages.length; i++) {
//         const imageData = chartImages[i];

//         // 이미지 데이터 형식 검증
//         let imageUrl;
//         if (typeof imageData === "string") {
//           // imageData가 이미 URL 또는 base64 문자열인 경우
//           imageUrl =
//             imageData.startsWith("data:") || imageData.startsWith("http")
//               ? imageData
//               : `data:image/png;base64,${imageData}`;
//         } else {
//           throw new Error(`Invalid image data format at index ${i}`);
//         }

//         messages.push({
//           role: "user",
//           content: [
//             {
//               type: "text",
//               text: `Analyzing Chart ${i + 1} for influenza data trends:`,
//             },
//             {
//               type: "image_url",
//               image_url: {
//                 url: imageUrl,
//               },
//             },
//           ],
//         });
//       }

//       // 디버깅을 위한 콘솔 로그
//       console.log(
//         "Sending request to OpenAI API with API key:",
//         apiKey ? "API key exists" : "API key is missing"
//       );
//       console.log("Number of images being processed:", chartImages.length);

//       // OpenAI API 호출
//       const response = await openai.chat.completions.create({
//         model: "gpt-4o", // 비전 모델 사용
//         messages: messages,
//         temperature: 0.5,
//         max_tokens: 300,
//       });

//       // 응답 처리
//       if (!response || !response.choices || response.choices.length === 0) {
//         throw new Error("Unexpected response format from OpenAI API");
//       }

//       return response.choices[0].message.content.trim();
//     } catch (error) {
//       console.error("Error generating summary with OpenAI:", error);
//       // 에러 전파하여 호출자가 처리할 수 있도록 함
//       throw error;
//     }
//   };

//   // Generate summary when needed
//   const generateSummary = async () => {
//     try {
//       // Capture chart images
//       const chartImages = await captureChartsAsImages();

//       if (chartImages.length === 0) {
//         throw new Error("No charts found to analyze");
//       }

//       // Generate summary from images
//       const summary = await generateSummaryWithOpenAI(chartImages);

//       if (summary) {
//         setSummaryText(summary);
//         return summary;
//       } else {
//         throw new Error("Failed to generate summary");
//       }
//     } catch (error) {
//       console.error("Error generating summary:", error);
//       // Use fallback summary
//       const fallbackSummary = "Error.";
//       setSummaryText(fallbackSummary);
//       return fallbackSummary;
//     }
//   };

//   const generatePDF = async () => {
//     setIsGenerating(true);

//     // Generate the summary before creating the PDF
//     const summary = await generateSummary();

//     const element = document.documentElement;

//     // PDF 초기화
//     const pdf = new jsPDF({
//       orientation: "portrait",
//       unit: "mm",
//       format: "a4",
//     });

//     // PDF 페이지 크기 계산
//     const pdfWidth = pdf.internal.pageSize.getWidth();
//     const pdfHeight = pdf.internal.pageSize.getHeight();
//     const margin = 10;

//     // 이미지를 여러 부분으로 나누어 캡처하기 위한 계산
//     const totalHeight = element.scrollHeight;
//     const pageHeightInPx = (pdfHeight / pdfWidth) * element.scrollWidth;
//     const numberOfPages = Math.ceil(totalHeight / pageHeightInPx);

//     // 메타데이터 설정
//     pdf.setProperties({
//       title: "Influenza Analysis Report",
//       author: "Your Organization Name",
//       subject: "Flu Case Analysis 2024",
//       keywords: "influenza, healthcare, analysis",
//     });

//     // 로고 설정
//     const logoWidth = 50;
//     const logoHeight = 15;
//     const logoMargin = 10;
//     const svgLogo = `
//       <svg baseProfile="tiny" height="125" version="1.2" width="249" xmlns="http://www.w3.org/2000/svg" xmlns:ev="http://www.w3.org/2001/xml-events" xmlns:xlink="http://www.w3.org/1999/xlink"><defs /><path d="M 69,74 68,75 67,75 66,76 66,81 68,83 72,83 73,82 74,82 74,80 75,79 75,78 74,77 74,76 72,74 Z" fill="#A0171C" stroke="none" /><path d="M 26,58 25,59 24,59 22,61 22,65 24,67 29,67 30,66 31,66 31,65 32,64 32,62 31,61 31,60 30,59 29,59 28,58 Z" fill="#A0171C" stroke="none" /><path d="M 99,51 96,54 96,57 97,58 97,59 98,60 103,60 105,58 105,54 104,53 104,52 103,52 102,51 Z" fill="#A0171C" stroke="none" /><path d="M 202,42 202,83 209,83 209,70 210,69 225,69 226,68 227,68 228,67 229,67 232,64 232,63 233,62 233,60 234,59 234,52 233,51 233,49 232,48 232,47 230,45 229,45 227,43 223,43 222,42 Z" fill="#0C1E46" stroke="none" /><path d="M 169,42 169,83 196,83 196,78 176,78 175,77 175,42 Z" fill="#0C1E46" stroke="none" /><path d="M 126,42 125,43 125,83 132,83 132,66 133,65 153,65 154,66 154,83 161,83 161,42 155,42 154,43 154,59 153,60 133,60 132,59 132,42 Z" fill="#0C1E46" stroke="none" /><path d="M 112,42 112,69 118,69 119,68 119,43 118,42 Z" fill="#A0171C" stroke="none" /><path d="M 83,42 83,83 89,83 89,42 Z" fill="#A0171C" stroke="none" /><path d="M 53,42 52,43 52,83 59,83 59,42 Z" fill="#A0171C" stroke="none" /><path d="M 40,42 39,43 39,83 46,83 46,42 Z" fill="#A0171C" stroke="none" /><path d="M 8,42 8,83 15,83 15,43 14,42 Z" fill="#A0171C" stroke="none" /></svg>
//     `;

//     // 헤더 함수
//     const addHeader = (pdf) => {
//       pdf.setFontSize(8);
//       pdf.setTextColor(128, 128, 128);
//       pdf.text(
//         "Influenza Analysis Report - Generated on " +
//           new Date().toLocaleDateString(),
//         margin,
//         8
//       );
//     };

//     // 푸터 함수
//     const addFooter = (pdf) => {
//       const pageWidth = pdf.internal.pageSize.getWidth();
//       pdf.setFontSize(8);
//       pdf.setTextColor(128, 128, 128);
//       const pageNumber = pdf.internal.getNumberOfPages();
//       pdf.text(
//         `Page ${pageNumber}`,
//         pageWidth - 20,
//         pdf.internal.pageSize.getHeight() - 10
//       );
//     };

//     // 로고 추가 함수
//     const addLogo = async (pdf) => {
//       const svgBlob = new Blob([svgLogo], { type: "image/svg+xml" });
//       const url = URL.createObjectURL(svgBlob);

//       return new Promise((resolve) => {
//         const img = new Image();
//         img.onload = () => {
//           const canvas = document.createElement("canvas");
//           canvas.width = img.width;
//           canvas.height = img.height;
//           const ctx = canvas.getContext("2d");
//           ctx.drawImage(img, 0, 0);
//           const dataUrl = canvas.toDataURL("image/png");
//           pdf.addImage(
//             dataUrl,
//             "PNG",
//             logoMargin,
//             logoMargin,
//             logoWidth,
//             logoHeight
//           );
//           URL.revokeObjectURL(url);
//           resolve();
//         };
//         img.src = url;
//       });
//     };

//     // 첫 페이지 구성
//     await addLogo(pdf);

//     // 제목 추가
//     pdf.setFontSize(18);
//     pdf.setTextColor(0, 30, 70);
//     pdf.setFont("helvetica", "bold");
//     pdf.text("Influenza Analysis Report", margin, logoHeight + logoMargin * 3);

//     let currentPosition = logoHeight + logoMargin * 4 + 10;

//     // 각 페이지별로 차트 캡처 및 추가
//     for (let i = 0; i < numberOfPages; i++) {
//       if (i > 0) {
//         pdf.addPage();
//         currentPosition = margin;
//       }

//       // 현재 페이지에 해당하는 부분만 캡처
//       const canvas = await html2canvas(element, {
//         scale: 2,
//         useCORS: true,
//         logging: false,
//         backgroundColor: "#ffffff",
//         windowWidth: element.scrollWidth,
//         width: element.scrollWidth,
//         height: pageHeightInPx,
//         y: i * pageHeightInPx,
//         ignoreElements: (element) => {
//           return (
//             element.id === "dashboard-header" ||
//             element.id === "download-report" ||
//             element.id === "downloadchart" ||
//             element.id === "theme-toggle" ||
//             element.id === "zoom-instructions" ||
//             element.classList.contains("selector-circle") ||
//             element.id === "dashboard-footer"
//           );
//         },
//       });

//       const imageData = canvas.toDataURL("image/png");

//       // 실제 이미지 비율 계산
//       const imgWidth = canvas.width;
//       const imgHeight = canvas.height;
//       const ratio = imgWidth / imgHeight;

//       // PDF에서의 이미지 크기 계산
//       const pdfImgWidth = pdfWidth;
//       const pdfImgHeight = pdfImgWidth / ratio;

//       // 현재 페이지에 이미지 추가
//       pdf.addImage(
//         imageData,
//         "PNG",
//         0,
//         currentPosition,
//         pdfImgWidth,
//         pdfImgHeight,
//         undefined,
//         "FAST",
//         0
//       );

//       // 첫 페이지의 경우 캡션 추가
//       if (i === 0) {
//         pdf.setFontSize(10);
//         pdf.setTextColor(89, 89, 89);
//         pdf.setFont("helvetica", "italic");
//         const captionText = "Figure 1: Influenza Cases Trend Analysis (2024)";
//         pdf.text(captionText, margin, currentPosition + pdfImgHeight + 5);
//       }

//       // 헤더와 푸터 추가
//       addHeader(pdf);
//       addFooter(pdf);
//     }

//     // 마지막 페이지에 요약 추가
//     pdf.addPage();
//     addHeader(pdf);

//     // 요약 섹션 추가 - 이제 AI로 생성된 텍스트 사용
//     pdf.setFontSize(14);
//     pdf.setTextColor(160, 23, 28);
//     pdf.setFont("helvetica", "bold");
//     pdf.text("Summary Analysis", margin, margin + 10);

//     pdf.setFontSize(11);
//     pdf.setTextColor(51, 51, 51);
//     pdf.setFont("helvetica", "normal");
//     const maxWidth = pdfWidth - margin * 2;
//     const lines = pdf.splitTextToSize(summary, maxWidth);
//     pdf.text(lines, margin, margin + 20);

//     addFooter(pdf);

//     pdf.save("influenza-analysis-report.pdf");
//     setIsGenerating(false);
//   };

//   return (
//     <div className="relative">
//       <button
//         id="download-report"
//         onClick={generatePDF}
//         disabled={isGenerating}
//         className="fixed bottom-8 right-8 group bg-blue-700 hover:bg-blue-800 p-3 rounded-full shadow-xl transition-all duration-200 disabled:bg-gray-400 disabled:cursor-not-allowed"
//       >
//         {isGenerating ? (
//           <Loader2 className="h-5 w-5 text-white animate-spin" />
//         ) : (
//           <FileDown className="h-5 w-5 text-white" />
//         )}
//         <span className="absolute bottom-full right-0 mb-2 px-3 py-1 bg-gray-900 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
//           {isGenerating ? "Generating..." : "Save Report"}
//         </span>
//       </button>
//     </div>
//   );
// };

// import React, { useState, useEffect } from "react";
// import OpenAI from "openai";
// import html2canvas from "html2canvas";
// import jsPDF from "jspdf";
// import { FileDown, Loader2 } from "lucide-react";

// import { useThemeStore } from "@/stores/useThemeStore";

// export const ReportDownload = () => {
//   const [isGenerating, setIsGenerating] = useState(false);
//   const [summaryText, setSummaryText] = useState("");
//   const { isDarkMode } = useThemeStore();

//   // Function to capture charts as images
//   const captureChartsAsImages = async () => {
//     // Get all chart containers - adjust these selectors to match your actual chart containers
//     const chartContainers = document.querySelectorAll(
//       '.chart-container, .recharts-wrapper, [id^="chart-"]'
//     );
//     const chartImages = [];

//     for (const container of chartContainers) {
//       try {
//         // Capture this specific chart as an image
//         const canvas = await html2canvas(container, {
//           scale: 2,
//           useCORS: true,
//           logging: false,
//           backgroundColor: isDarkMode ? "#1e1e1e" : "#ffffff",
//         });

//         // Convert canvas to base64 image data
//         const imageData = canvas.toDataURL("image/png");
//         chartImages.push({
//           data: imageData,
//           width: container.offsetWidth,
//           height: container.offsetHeight,
//           title: container.getAttribute("data-title") || "Chart",
//         });
//       } catch (error) {
//         console.error("Error capturing chart:", error);
//       }
//     }

//     return chartImages;
//   };

//   /**
//    * Get the OpenAI API key from localStorage or environment variables
//    * @returns {string|null} The API key or null if not found
//    */
//   function getApiKey() {
//     // First try to get the key from localStorage
//     if (typeof window !== "undefined") {
//       try {
//         const localStorageKey = localStorage.getItem("openai_api_key");
//         if (localStorageKey) {
//           return localStorageKey;
//         }
//       } catch (error) {
//         console.error("Error accessing localStorage:", error);
//       }
//     }

//     // If not found in localStorage, try environment variable
//     // Note: This should be prefixed with NEXT_PUBLIC_ to be accessible on the client side
//     const envApiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;

//     return envApiKey || null;
//   }

//   // Function to generate summary using OpenAI API with image input
//   const generateSummaryWithOpenAI = async (chartImages) => {
//     if (!chartImages || chartImages.length === 0) {
//       console.warn("No chart images captured for analysis");
//       throw new Error("No chart images provided for analysis");
//     }

//     try {
//       const apiKey = getApiKey();

//       if (!apiKey) {
//         console.error(
//           "OpenAI API key is missing. Make sure NEXT_PUBLIC_OPENAI_API_KEY is set in your environment."
//         );
//         throw new Error("OpenAI API key is not configured");
//       }

//       // Initialize OpenAI client
//       const openai = new OpenAI({
//         apiKey: apiKey,
//         dangerouslyAllowBrowser: true,
//       });

//       // System prompt configuration
//       const systemPrompt = `
//       You are a highly cautious and defensive data analysis expert.
//       You do not draw premature conclusions and refrain from making definitive judgments in the absence of clear evidence.
//       Your analysis is strictly based on observable data without speculation or assumptions.

//       ---
//       **Analysis Guidelines:**
//       1. **General Trend Analysis:**
//          - Describe only the changes that are clearly observable in the given data.
//          - Do not make predictions or assumptions; construct sentences based solely on confirmed facts.
//          - Use cautious wording such as "According to the data," and "The observed pattern is as follows."

//       2. **Changes in Positive and Negative Cases:**
//          - If a change is observed at a specific time point, state it as:
//            "During this period, the number of cases appears to have increased (or decreased)."
//          - Avoid speculating on the causes of the increase or decrease; only mention what is directly confirmed by the data.

//       3. **Comparison Between CDC and Researcher Data:**
//          - If a difference exists between the two datasets, phrase it as:
//            "A discrepancy has been observed, but the reason is not clearly identifiable from the data alone."
//          - Use language such as "Further analysis may be required to determine if this difference is statistically significant."

//       4. **Text-Based Results Without Visualization:**
//          - Clearly summarize the findings in sentence form.
//          - Maintain a structured format, such as:
//            - "In mid-November 2024, the number of flu-positive cases appears to have increased compared to the previous week."
//            - "Compared to CDC data, the researcher-collected data shows a higher flu positivity rate; however, the reason for this difference cannot be determined solely from the available data."

//       ---
//       **Defensive Analysis Principles:**
//       - **Avoid speculation and base analysis strictly on observable data.**
//       - **For ambiguous aspects, use phrases like "Additional data is needed" rather than drawing firm conclusions.**
//       - **Maintain cautious wording, incorporating expressions such as "Data suggests," "Further interpretation is necessary," and "Findings should be considered with caution."**

//       ---
//       Now, generate a concise summary (150-200 words) following the defensive analysis principles. Format your response with clear section headings and bullet points for key findings.
//       `;

//       // Prepare message array
//       const messages = [
//         {
//           role: "system",
//           content: systemPrompt,
//         },
//       ];

//       // Process images
//       console.log("Processing images for analysis...");
//       for (let i = 0; i < chartImages.length; i++) {
//         const imageData = chartImages[i].data;

//         // Validate image data format
//         let imageUrl;
//         if (typeof imageData === "string") {
//           // imageData is already a URL or base64 string
//           imageUrl =
//             imageData.startsWith("data:") || imageData.startsWith("http")
//               ? imageData
//               : `data:image/png;base64,${imageData}`;
//         } else {
//           throw new Error(`Invalid image data format at index ${i}`);
//         }

//         messages.push({
//           role: "user",
//           content: [
//             {
//               type: "text",
//               text: `Analyzing Chart ${i + 1} for influenza data trends:`,
//             },
//             {
//               type: "image_url",
//               image_url: {
//                 url: imageUrl,
//               },
//             },
//           ],
//         });
//       }

//       // Debug console log
//       console.log(
//         "Sending request to OpenAI API with API key:",
//         apiKey ? "API key exists" : "API key is missing"
//       );
//       console.log("Number of images being processed:", chartImages.length);

//       // Call OpenAI API
//       const response = await openai.chat.completions.create({
//         model: "gpt-4o", // Vision model
//         messages: messages,
//         temperature: 0.5,
//         max_tokens: 400,
//       });

//       // Process response
//       if (!response || !response.choices || response.choices.length === 0) {
//         throw new Error("Unexpected response format from OpenAI API");
//       }

//       return response.choices[0].message.content.trim();
//     } catch (error) {
//       console.error("Error generating summary with OpenAI:", error);
//       // Propagate error
//       throw error;
//     }
//   };

//   // Generate summary when needed
//   const generateSummary = async () => {
//     try {
//       // Capture chart images
//       const chartImages = await captureChartsAsImages();

//       if (chartImages.length === 0) {
//         throw new Error("No charts found to analyze");
//       }

//       // Generate summary from images
//       const summary = await generateSummaryWithOpenAI(chartImages);

//       if (summary) {
//         setSummaryText(summary);
//         return summary;
//       } else {
//         throw new Error("Failed to generate summary");
//       }
//     } catch (error) {
//       console.error("Error generating summary:", error);
//       // Use fallback summary
//       const fallbackSummary =
//         "Error generating analysis. Please check your data and try again.";
//       setSummaryText(fallbackSummary);
//       return fallbackSummary;
//     }
//   };

//   const generatePDF = async () => {
//     setIsGenerating(true);

//     try {
//       // Generate the summary before creating the PDF
//       const summary = await generateSummary();

//       // Get document element
//       const element = document.documentElement;

//       // Initialize PDF
//       const pdf = new jsPDF({
//         orientation: "portrait",
//         unit: "mm",
//         format: "a4",
//       });

//       // Calculate PDF dimensions
//       const pdfWidth = pdf.internal.pageSize.getWidth();
//       const pdfHeight = pdf.internal.pageSize.getHeight();
//       const margin = 15; // Increased margin for better spacing
//       const contentWidth = pdfWidth - margin * 2;

//       // Set document metadata
//       pdf.setProperties({
//         title: "Influenza Analysis Report",
//         author: "Your Organization Name",
//         subject: "Flu Case Analysis 2024",
//         keywords: "influenza, healthcare, analysis",
//         creator: "HLP Health Analytics Platform",
//       });

//       // Define fonts and colors
//       const primaryColor = "#0C1E46"; // Dark blue
//       const accentColor = "#A0171C"; // Red
//       const textColor = "#333333"; // Dark gray
//       const headingFont = "helvetica";
//       const bodyFont = "helvetica";

//       // Logo dimensions
//       const logoWidth = 50;
//       const logoHeight = 15;
//       const logoMargin = 15;

//       // SVG Logo (unchanged)
//       const svgLogo = `
//         <svg baseProfile="tiny" height="125" version="1.2" width="249" xmlns="http://www.w3.org/2000/svg" xmlns:ev="http://www.w3.org/2001/xml-events" xmlns:xlink="http://www.w3.org/1999/xlink"><defs /><path d="M 69,74 68,75 67,75 66,76 66,81 68,83 72,83 73,82 74,82 74,80 75,79 75,78 74,77 74,76 72,74 Z" fill="#A0171C" stroke="none" /><path d="M 26,58 25,59 24,59 22,61 22,65 24,67 29,67 30,66 31,66 31,65 32,64 32,62 31,61 31,60 30,59 29,59 28,58 Z" fill="#A0171C" stroke="none" /><path d="M 99,51 96,54 96,57 97,58 97,59 98,60 103,60 105,58 105,54 104,53 104,52 103,52 102,51 Z" fill="#A0171C" stroke="none" /><path d="M 202,42 202,83 209,83 209,70 210,69 225,69 226,68 227,68 228,67 229,67 232,64 232,63 233,62 233,60 234,59 234,52 233,51 233,49 232,48 232,47 230,45 229,45 227,43 223,43 222,42 Z" fill="#0C1E46" stroke="none" /><path d="M 169,42 169,83 196,83 196,78 176,78 175,77 175,42 Z" fill="#0C1E46" stroke="none" /><path d="M 126,42 125,43 125,83 132,83 132,66 133,65 153,65 154,66 154,83 161,83 161,42 155,42 154,43 154,59 153,60 133,60 132,59 132,42 Z" fill="#0C1E46" stroke="none" /><path d="M 112,42 112,69 118,69 119,68 119,43 118,42 Z" fill="#A0171C" stroke="none" /><path d="M 83,42 83,83 89,83 89,42 Z" fill="#A0171C" stroke="none" /><path d="M 53,42 52,43 52,83 59,83 59,42 Z" fill="#A0171C" stroke="none" /><path d="M 40,42 39,43 39,83 46,83 46,42 Z" fill="#A0171C" stroke="none" /><path d="M 8,42 8,83 15,83 15,43 14,42 Z" fill="#A0171C" stroke="none" /></svg>
//       `;

//       // Draw watermark
//       const addWatermark = (pdf) => {
//         pdf.saveGraphicsState();
//         pdf.setGState(new pdf.GState({ opacity: 0.05 }));
//         pdf.setFontSize(60);
//         pdf.setTextColor(100, 100, 100);
//         pdf.setFont(headingFont, "bold");
//         pdf.text("HLP", pdfWidth / 2, pdfHeight / 2, {
//           align: "center",
//           angle: 45,
//         });
//         pdf.restoreGraphicsState();
//       };

//       // Header function
//       const addHeader = (pdf, pageTitle = "") => {
//         // Draw header bar
//         pdf.setFillColor(248, 249, 250);
//         pdf.rect(0, 0, pdfWidth, 15, "F");

//         // Add header text
//         pdf.setFontSize(8);
//         pdf.setTextColor(100, 100, 100);
//         pdf.setFont(bodyFont, "normal");

//         const reportTitle = "Influenza Analysis Report";
//         const dateText = "Generated on " + new Date().toLocaleDateString();

//         pdf.text(reportTitle, margin, 8);
//         pdf.text(dateText, pdfWidth - margin, 8, { align: "right" });

//         // Add subtitle if provided
//         if (pageTitle) {
//           pdf.setFontSize(10);
//           pdf.setTextColor(accentColor);
//           pdf.setFont(headingFont, "bold");
//           pdf.text(pageTitle, margin, 20);
//         }
//       };

//       // Footer function
//       const addFooter = (pdf) => {
//         // Draw footer bar
//         pdf.setFillColor(248, 249, 250);
//         pdf.rect(0, pdfHeight - 15, pdfWidth, 15, "F");

//         // Add footer text
//         pdf.setFontSize(8);
//         pdf.setTextColor(100, 100, 100);
//         pdf.setFont(bodyFont, "normal");

//         const pageNumber = pdf.internal.getNumberOfPages();
//         const footerText = "Confidential - For Internal Use Only";

//         pdf.text(footerText, margin, pdfHeight - 7);
//         pdf.text(`Page ${pageNumber}`, pdfWidth - margin, pdfHeight - 7, {
//           align: "right",
//         });
//       };

//       // Logo function
//       const addLogo = async (pdf) => {
//         const svgBlob = new Blob([svgLogo], { type: "image/svg+xml" });
//         const url = URL.createObjectURL(svgBlob);

//         return new Promise((resolve) => {
//           const img = new Image();
//           img.onload = () => {
//             const canvas = document.createElement("canvas");
//             canvas.width = img.width;
//             canvas.height = img.height;
//             const ctx = canvas.getContext("2d");
//             ctx.drawImage(img, 0, 0);
//             const dataUrl = canvas.toDataURL("image/png");
//             pdf.addImage(dataUrl, "PNG", margin, 25, logoWidth, logoHeight);
//             URL.revokeObjectURL(url);
//             resolve();
//           };
//           img.src = url;
//         });
//       };

//       // Helper function to add content sections
//       const addSection = (pdf, title, content, yPosition) => {
//         // Add section title
//         pdf.setFontSize(12);
//         pdf.setTextColor(primaryColor);
//         pdf.setFont(headingFont, "bold");
//         pdf.text(title, margin, yPosition);

//         // Add horizontal line
//         const lineY = yPosition + 2;
//         pdf.setDrawColor(220, 220, 220);
//         pdf.setLineWidth(0.5);
//         pdf.line(margin, lineY, pdfWidth - margin, lineY);

//         // Add content
//         pdf.setFontSize(10);
//         pdf.setTextColor(textColor);
//         pdf.setFont(bodyFont, "normal");
//         const contentY = yPosition + 10;

//         // Handle array or string
//         if (Array.isArray(content)) {
//           let y = contentY;
//           content.forEach((line) => {
//             pdf.text(line, margin, y);
//             y += 6;
//           });
//           return y + 5; // Return new Y position after content
//         } else {
//           // Split text to fit width
//           const splitText = pdf.splitTextToSize(content, contentWidth);
//           pdf.text(splitText, margin, contentY);
//           return contentY + splitText.length * 6 + 5; // Return new Y position
//         }
//       };

//       // Function to add executive summary
//       const addExecutiveSummary = (pdf, summary, yPosition) => {
//         const title = "Executive Summary";

//         // Add title
//         pdf.setFontSize(14);
//         pdf.setTextColor(accentColor);
//         pdf.setFont(headingFont, "bold");
//         pdf.text(title, margin, yPosition);

//         // Add underline
//         pdf.setDrawColor(accentColor);
//         pdf.setLineWidth(0.5);
//         pdf.line(margin, yPosition + 2, margin + 50, yPosition + 2);

//         // Add content with spacing
//         pdf.setFontSize(10);
//         pdf.setTextColor(textColor);
//         pdf.setFont(bodyFont, "normal");
//         const splitText = pdf.splitTextToSize(summary, contentWidth);
//         pdf.text(splitText, margin, yPosition + 10);

//         return yPosition + splitText.length * 5 + 15;
//       };

//       // FIRST PAGE - Cover page
//       await addLogo(pdf);
//       addWatermark(pdf);

//       // Add title
//       pdf.setFontSize(24);
//       pdf.setTextColor(primaryColor);
//       pdf.setFont(headingFont, "bold");
//       pdf.text("Influenza Analysis Report", margin, 55);

//       // Add subtitle
//       pdf.setFontSize(14);
//       pdf.setTextColor(textColor);
//       pdf.setFont(headingFont, "normal");
//       const today = new Date().toLocaleDateString("en-US", {
//         year: "numeric",
//         month: "long",
//         day: "numeric",
//       });
//       pdf.text(`California Weekly Data Analysis`, margin, 65);
//       pdf.text(`Report Date: ${today}`, margin, 75);

//       // Add document information box
//       const boxY = 90;
//       const boxHeight = 60;
//       pdf.setFillColor(248, 249, 250);
//       pdf.setDrawColor(220, 220, 220);
//       pdf.roundedRect(margin, boxY, contentWidth, boxHeight, 3, 3, "FD");

//       // Add document info content
//       pdf.setFontSize(10);
//       pdf.setTextColor(textColor);
//       pdf.setFont(bodyFont, "normal");

//       pdf.text("Document Information:", margin + 5, boxY + 10);
//       pdf.text("Prepared by: Health Analytics Team", margin + 5, boxY + 20);
//       pdf.text("Distribution: Internal Use Only", margin + 5, boxY + 30);
//       pdf.text("Classification: Confidential", margin + 5, boxY + 40);
//       pdf.text(
//         "Data Source: California Department of Public Health & HLP Research",
//         margin + 5,
//         boxY + 50
//       );

//       addFooter(pdf);

//       // SECOND PAGE - Charts and data
//       pdf.addPage();
//       addHeader(pdf, "Data Visualization");
//       addWatermark(pdf);
//       let currentPosition = 30;

//       // Capture charts
//       const chartImages = await captureChartsAsImages();

//       // Add introduction text
//       currentPosition = addSection(
//         pdf,
//         "Overview",
//         "The following visualizations represent influenza case data collected in California during the 2024-2025 flu season. The charts display both positive and negative case counts as well as comparisons between our collected data and CDC reported figures.",
//         currentPosition
//       );

//       // Add each chart with proper spacing and captions
//       for (let i = 0; i < chartImages.length; i++) {
//         const chart = chartImages[i];

//         // Check if we need a new page
//         if (currentPosition + chart.height * 0.5 + 50 > pdfHeight - 20) {
//           pdf.addPage();
//           addHeader(pdf, "Data Visualization (continued)");
//           addWatermark(pdf);
//           currentPosition = 30;
//         }

//         // Add chart title
//         pdf.setFontSize(11);
//         pdf.setTextColor(primaryColor);
//         pdf.setFont(headingFont, "bold");
//         pdf.text(
//           `Figure ${i + 1}: ${chart.title || "Influenza Data Analysis"}`,
//           margin,
//           currentPosition
//         );
//         currentPosition += 8;

//         // Calculate image dimensions to fit page
//         const imgWidth = contentWidth;
//         const imgHeight = (chart.height / chart.width) * imgWidth;

//         // Add image
//         pdf.addImage(
//           chart.data,
//           "PNG",
//           margin,
//           currentPosition,
//           imgWidth,
//           imgHeight
//         );

//         // Add caption
//         currentPosition += imgHeight + 5;
//         pdf.setFontSize(9);
//         pdf.setTextColor(100, 100, 100);
//         pdf.setFont(bodyFont, "italic");

//         const captionText =
//           i === 0
//             ? "Time series analysis of positive vs. negative influenza test results by week."
//             : "Comparison of positivity rates between HLP Research data and CDC reported figures.";

//         pdf.text(captionText, margin, currentPosition);

//         currentPosition += 20; // Space before next chart
//       }

//       addFooter(pdf);

//       // THIRD PAGE - Analysis
//       pdf.addPage();
//       addHeader(pdf, "Analysis & Findings");
//       addWatermark(pdf);

//       // Add analysis
//       currentPosition = 30;
//       currentPosition = addExecutiveSummary(pdf, summary, currentPosition);

//       // Add methodology section
//       currentPosition = addSection(
//         pdf,
//         "Methodology",
//         [
//           "• Data Collection: Weekly influenza test samples collected from partner clinics across California",
//           "• Testing Protocol: RT-PCR assays used for all samples with standardized procedures",
//           "• Comparative Analysis: Our collected data compared against CDC published statistics",
//           "• Data Period: October 2024 through current week",
//         ],
//         currentPosition
//       );

//       // Add key observations
//       currentPosition = addSection(
//         pdf,
//         "Key Observations",
//         [
//           "• Peak Activity: Mid-November showed highest positivity rates in our collected samples",
//           "• CDC Comparison: Our data showed higher positivity rates than CDC figures during peak period",
//           "• Trend Pattern: After November peak, rates declined through December before stabilizing",
//           "• Regional Variation: Data may reflect regional differences in influenza circulation",
//         ],
//         currentPosition
//       );

//       // Add conclusions
//       addSection(
//         pdf,
//         "Next Steps",
//         [
//           "• Continue weekly monitoring of influenza activity through partner sites",
//           "• Review testing protocols to ensure standardization across collection sites",
//           "• Investigate discrepancies between our data and CDC reported figures",
//           "• Expand analysis to include influenza subtypes in future reports",
//         ],
//         currentPosition + 40
//       );

//       addFooter(pdf);

//       // Save the PDF
//       pdf.save("influenza-analysis-report.pdf");
//     } catch (error) {
//       console.error("Error generating PDF:", error);
//     } finally {
//       setIsGenerating(false);
//     }
//   };

//   return (
//     <div className="relative">
//       <button
//         id="download-report"
//         onClick={generatePDF}
//         disabled={isGenerating}
//         className="fixed bottom-8 right-8 group bg-blue-700 hover:bg-blue-800 p-3 rounded-full shadow-xl transition-all duration-200 disabled:bg-gray-400 disabled:cursor-not-allowed"
//       >
//         {isGenerating ? (
//           <Loader2 className="h-5 w-5 text-white animate-spin" />
//         ) : (
//           <FileDown className="h-5 w-5 text-white" />
//         )}
//         <span className="absolute bottom-full right-0 mb-2 px-3 py-1 bg-gray-900 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
//           {isGenerating
//             ? "Generating Professional Report..."
//             : "Download Professional Report"}
//         </span>
//       </button>
//     </div>
//   );
// };

// import React, { useState, useEffect } from "react";
// import OpenAI from "openai";
// import html2canvas from "html2canvas";
// import jsPDF from "jspdf";
// import { FileDown, Loader2 } from "lucide-react";

// import { useThemeStore } from "@/stores/useThemeStore";

// export const ReportDownload = () => {
//   const [isGenerating, setIsGenerating] = useState(false);
//   const [summaryText, setSummaryText] = useState("");
//   const { isDarkMode } = useThemeStore();

//   // Function to capture charts as images
//   const captureChartsAsImages = async () => {
//     // Get all chart containers - adjust these selectors to match your actual chart containers
//     const chartContainers = document.querySelectorAll(
//       '.chart-container, .recharts-wrapper, [id^="chart-"]'
//     );
//     const chartImages = [];

//     for (const container of chartContainers) {
//       try {
//         // Capture this specific chart as an image
//         const canvas = await html2canvas(container, {
//           scale: 2,
//           useCORS: true,
//           logging: false,
//           backgroundColor: isDarkMode ? "#1e1e1e" : "#ffffff",
//         });

//         // Convert canvas to base64 image data
//         const imageData = canvas.toDataURL("image/png");
//         chartImages.push({
//           data: imageData,
//           width: container.offsetWidth,
//           height: container.offsetHeight,
//           title: container.getAttribute("data-title") || "Chart",
//         });
//       } catch (error) {
//         console.error("Error capturing chart:", error);
//       }
//     }

//     return chartImages;
//   };

//   /**
//    * Get the OpenAI API key from localStorage or environment variables
//    * @returns {string|null} The API key or null if not found
//    */
//   function getApiKey() {
//     // First try to get the key from localStorage
//     if (typeof window !== "undefined") {
//       try {
//         const localStorageKey = localStorage.getItem("openai_api_key");
//         if (localStorageKey) {
//           return localStorageKey;
//         }
//       } catch (error) {
//         console.error("Error accessing localStorage:", error);
//       }
//     }

//     // If not found in localStorage, try environment variable
//     // Note: This should be prefixed with NEXT_PUBLIC_ to be accessible on the client side
//     const envApiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;

//     return envApiKey || null;
//   }

//   // Function to generate summary using OpenAI API with image input
//   const generateSummaryWithOpenAI = async (chartImages) => {
//     if (!chartImages || chartImages.length === 0) {
//       console.warn("No chart images captured for analysis");
//       throw new Error("No chart images provided for analysis");
//     }

//     try {
//       const apiKey = getApiKey();

//       if (!apiKey) {
//         console.error(
//           "OpenAI API key is missing. Make sure NEXT_PUBLIC_OPENAI_API_KEY is set in your environment."
//         );
//         throw new Error("OpenAI API key is not configured");
//       }

//       // Initialize OpenAI client
//       const openai = new OpenAI({
//         apiKey: apiKey,
//         dangerouslyAllowBrowser: true,
//       });

//       // System prompt configuration
//       const systemPrompt = `
//       You are a highly cautious and defensive data analysis expert.
//       You do not draw premature conclusions and refrain from making definitive judgments in the absence of clear evidence.
//       Your analysis is strictly based on observable data without speculation or assumptions.

//       ---
//       **Analysis Guidelines:**
//       1. **General Trend Analysis:**
//          - Describe only the changes that are clearly observable in the given data.
//          - Do not make predictions or assumptions; construct sentences based solely on confirmed facts.
//          - Use cautious wording such as "According to the data," and "The observed pattern is as follows."

//       2. **Changes in Positive and Negative Cases:**
//          - If a change is observed at a specific time point, state it as:
//            "During this period, the number of cases appears to have increased (or decreased)."
//          - Avoid speculating on the causes of the increase or decrease; only mention what is directly confirmed by the data.

//       3. **Comparison Between CDC and Researcher Data:**
//          - If a difference exists between the two datasets, phrase it as:
//            "A discrepancy has been observed, but the reason is not clearly identifiable from the data alone."
//          - Use language such as "Further analysis may be required to determine if this difference is statistically significant."

//       4. **Text-Based Results Without Visualization:**
//          - Clearly summarize the findings in sentence form.
//          - Maintain a structured format, such as:
//            - "In mid-November 2024, the number of flu-positive cases appears to have increased compared to the previous week."
//            - "Compared to CDC data, the researcher-collected data shows a higher flu positivity rate; however, the reason for this difference cannot be determined solely from the available data."

//       ---
//       **Defensive Analysis Principles:**
//       - **Avoid speculation and base analysis strictly on observable data.**
//       - **For ambiguous aspects, use phrases like "Additional data is needed" rather than drawing firm conclusions.**
//       - **Maintain cautious wording, incorporating expressions such as "Data suggests," "Further interpretation is necessary," and "Findings should be considered with caution."**

//       ---
//       Now, generate a concise summary (150-200 words) following the defensive analysis principles. Format your response with a few bullet points for key findings.
//       `;

//       // Prepare message array
//       const messages = [
//         {
//           role: "system",
//           content: systemPrompt,
//         },
//       ];

//       // Process images
//       console.log("Processing images for analysis...");
//       for (let i = 0; i < chartImages.length; i++) {
//         const imageData = chartImages[i].data;

//         // Validate image data format
//         let imageUrl;
//         if (typeof imageData === "string") {
//           // imageData is already a URL or base64 string
//           imageUrl =
//             imageData.startsWith("data:") || imageData.startsWith("http")
//               ? imageData
//               : `data:image/png;base64,${imageData}`;
//         } else {
//           throw new Error(`Invalid image data format at index ${i}`);
//         }

//         messages.push({
//           role: "user",
//           content: [
//             {
//               type: "text",
//               text: `Analyzing Chart ${i + 1} for influenza data trends:`,
//             },
//             {
//               type: "image_url",
//               image_url: {
//                 url: imageUrl,
//               },
//             },
//           ],
//         });
//       }

//       // Debug console log
//       console.log(
//         "Sending request to OpenAI API with API key:",
//         apiKey ? "API key exists" : "API key is missing"
//       );
//       console.log("Number of images being processed:", chartImages.length);

//       // Call OpenAI API
//       const response = await openai.chat.completions.create({
//         model: "gpt-4o", // Vision model
//         messages: messages,
//         temperature: 0.5,
//         max_tokens: 400,
//       });

//       // Process response
//       if (!response || !response.choices || response.choices.length === 0) {
//         throw new Error("Unexpected response format from OpenAI API");
//       }

//       return response.choices[0].message.content.trim();
//     } catch (error) {
//       console.error("Error generating summary with OpenAI:", error);
//       // Propagate error
//       throw error;
//     }
//   };

//   // Generate summary when needed
//   const generateSummary = async () => {
//     try {
//       // Capture chart images
//       const chartImages = await captureChartsAsImages();

//       if (chartImages.length === 0) {
//         throw new Error("No charts found to analyze");
//       }

//       // Generate summary from images
//       const summary = await generateSummaryWithOpenAI(chartImages);

//       if (summary) {
//         setSummaryText(summary);
//         return summary;
//       } else {
//         throw new Error("Failed to generate summary");
//       }
//     } catch (error) {
//       console.error("Error generating summary:", error);
//       // Use fallback summary
//       const fallbackSummary =
//         "Error generating analysis. Please check your data and try again.";
//       setSummaryText(fallbackSummary);
//       return fallbackSummary;
//     }
//   };

//   // The generatePDF function for creating a better influenza report
//   const generatePDF = async () => {
//     setIsGenerating(true);

//     try {
//       // Generate the summary before creating the PDF
//       const summary = await generateSummary();

//       // Initialize PDF with better quality settings
//       const pdf = new jsPDF({
//         orientation: "portrait",
//         unit: "mm",
//         format: "a4",
//         compress: true, // Enables compression for better quality
//       });

//       // Calculate PDF dimensions
//       const pdfWidth = pdf.internal.pageSize.getWidth();
//       const pdfHeight = pdf.internal.pageSize.getHeight();
//       const margin = 15; // Better margin for readability
//       const contentWidth = pdfWidth - margin * 2;

//       // Set document metadata
//       pdf.setProperties({
//         title: "Influenza Analysis Report",
//         author: "HLP Health Analytics",
//         subject: "California Influenza Surveillance",
//         keywords: "influenza, healthcare, analysis, California",
//         creator: "HLP Health Analytics Platform",
//       });

//       // Define colors for a more professional look
//       const primaryColor = "#0C1E46"; // Dark blue
//       const accentColor = "#A0171C"; // Red
//       const textColor = "#333333"; // Dark gray
//       const lightGrayBg = "#F8F9FA"; // Light gray background
//       const headingFont = "helvetica";
//       const bodyFont = "helvetica";

//       // Logo dimensions
//       const logoWidth = 45;
//       const logoHeight = 14;

//       // SVG Logo (unchanged)
//       const svgLogo = `
//       <svg baseProfile="tiny" height="125" version="1.2" width="249" xmlns="http://www.w3.org/2000/svg" xmlns:ev="http://www.w3.org/2001/xml-events" xmlns:xlink="http://www.w3.org/1999/xlink"><defs /><path d="M 69,74 68,75 67,75 66,76 66,81 68,83 72,83 73,82 74,82 74,80 75,79 75,78 74,77 74,76 72,74 Z" fill="#A0171C" stroke="none" /><path d="M 26,58 25,59 24,59 22,61 22,65 24,67 29,67 30,66 31,66 31,65 32,64 32,62 31,61 31,60 30,59 29,59 28,58 Z" fill="#A0171C" stroke="none" /><path d="M 99,51 96,54 96,57 97,58 97,59 98,60 103,60 105,58 105,54 104,53 104,52 103,52 102,51 Z" fill="#A0171C" stroke="none" /><path d="M 202,42 202,83 209,83 209,70 210,69 225,69 226,68 227,68 228,67 229,67 232,64 232,63 233,62 233,60 234,59 234,52 233,51 233,49 232,48 232,47 230,45 229,45 227,43 223,43 222,42 Z" fill="#0C1E46" stroke="none" /><path d="M 169,42 169,83 196,83 196,78 176,78 175,77 175,42 Z" fill="#0C1E46" stroke="none" /><path d="M 126,42 125,43 125,83 132,83 132,66 133,65 153,65 154,66 154,83 161,83 161,42 155,42 154,43 154,59 153,60 133,60 132,59 132,42 Z" fill="#0C1E46" stroke="none" /><path d="M 112,42 112,69 118,69 119,68 119,43 118,42 Z" fill="#A0171C" stroke="none" /><path d="M 83,42 83,83 89,83 89,42 Z" fill="#A0171C" stroke="none" /><path d="M 53,42 52,43 52,83 59,83 59,42 Z" fill="#A0171C" stroke="none" /><path d="M 40,42 39,43 39,83 46,83 46,42 Z" fill="#A0171C" stroke="none" /><path d="M 8,42 8,83 15,83 15,43 14,42 Z" fill="#A0171C" stroke="none" /></svg>
//     `;

//       // Discrete watermark that doesn't interfere with content
//       const addWatermark = (pdf) => {
//         pdf.saveGraphicsState();
//         pdf.setGState(new pdf.GState({ opacity: 0.05 }));
//         pdf.setFontSize(60);
//         pdf.setTextColor(100, 100, 100);
//         pdf.setFont(headingFont, "bold");
//         // pdf.text("CONFIDENTIAL", pdfWidth / 2, pdfHeight / 2, {
//         //   align: "center",
//         //   angle: 45,
//         // });
//         pdf.restoreGraphicsState();
//       };

//       // Improved header with cleaner design
//       const addHeader = (pdf, pageTitle = "") => {
//         // Draw header bar
//         pdf.setFillColor(...hexToRgb(primaryColor));
//         pdf.rect(0, 0, pdfWidth, 12, "F");

//         // Add header text
//         pdf.setFontSize(8);
//         pdf.setTextColor(255, 255, 255);
//         pdf.setFont(bodyFont, "normal");

//         const reportTitle = "Influenza Analysis Report";
//         const dateText = "Generated on " + new Date().toLocaleDateString();

//         pdf.text(reportTitle, margin, 8);
//         pdf.text(dateText, pdfWidth - margin, 8, { align: "right" });

//         // Add subtitle if provided
//         if (pageTitle) {
//           pdf.setFontSize(14);
//           pdf.setTextColor(...hexToRgb(accentColor));
//           pdf.setFont(headingFont, "bold");
//           pdf.text(pageTitle, margin, 24);

//           // Add subtle underline
//           pdf.setDrawColor(...hexToRgb(accentColor));
//           pdf.setLineWidth(0.5);
//           pdf.line(margin, 26, margin + 50, 26);
//         }
//       };

//       // Improved footer with cleaner design
//       const addFooter = (pdf) => {
//         // Draw footer bar
//         pdf.setFillColor(...hexToRgb(primaryColor));
//         pdf.rect(0, pdfHeight - 10, pdfWidth, 10, "F");

//         // Add footer text
//         pdf.setFontSize(7);
//         pdf.setTextColor(255, 255, 255);
//         pdf.setFont(bodyFont, "normal");

//         const pageNumber = pdf.internal.getNumberOfPages();
//         const footerText = "Confidential - For Internal Use Only";

//         pdf.text(footerText, margin, pdfHeight - 4);
//         pdf.text(`Page ${pageNumber}`, pdfWidth - margin, pdfHeight - 4, {
//           align: "right",
//         });
//       };

//       // Add logo with proper positioning
//       const addLogo = async (pdf) => {
//         const svgBlob = new Blob([svgLogo], { type: "image/svg+xml" });
//         const url = URL.createObjectURL(svgBlob);

//         return new Promise((resolve) => {
//           const img = new Image();
//           img.onload = () => {
//             const canvas = document.createElement("canvas");
//             canvas.width = img.width;
//             canvas.height = img.height;
//             const ctx = canvas.getContext("2d");
//             ctx.drawImage(img, 0, 0);
//             const dataUrl = canvas.toDataURL("image/png");
//             pdf.addImage(dataUrl, "PNG", margin, 20, logoWidth, logoHeight);
//             URL.revokeObjectURL(url);
//             resolve();
//           };
//           img.src = url;
//         });
//       };

//       // Improved section layout with better spacing and typography
//       const addSection = (pdf, title, content, yPosition) => {
//         // Add section title
//         pdf.setFontSize(12);
//         pdf.setTextColor(...hexToRgb(primaryColor));
//         pdf.setFont(headingFont, "bold");
//         pdf.text(title, margin, yPosition);

//         // Add horizontal line
//         const lineY = yPosition + 2;
//         pdf.setDrawColor(220, 220, 220);
//         pdf.setLineWidth(0.3);
//         pdf.line(margin, lineY, pdfWidth - margin, lineY);

//         // Add content with better spacing
//         pdf.setFontSize(10);
//         pdf.setTextColor(...hexToRgb(textColor));
//         pdf.setFont(bodyFont, "normal");
//         const contentY = yPosition + 8;

//         // Handle array or string with proper spacing
//         if (Array.isArray(content)) {
//           let y = contentY;
//           content.forEach((line) => {
//             pdf.text(line, margin, y);
//             y += 5; // Better line spacing for readability
//           });
//           return y + 5; // Return new Y position with padding
//         } else {
//           // Split text to fit width
//           const splitText = pdf.splitTextToSize(content, contentWidth);
//           pdf.text(splitText, margin, contentY);
//           return contentY + splitText.length * 5 + 5; // Better line spacing
//         }
//       };

//       // Improved executive summary with better typography and fact-based content
//       const addExecutiveSummary = (pdf, summary, yPosition) => {
//         const title = "Data Observations";

//         // Add title
//         pdf.setFontSize(14);
//         pdf.setTextColor(...hexToRgb(accentColor));
//         pdf.setFont(headingFont, "bold");
//         pdf.text(title, margin, yPosition);

//         // Add underline
//         pdf.setDrawColor(...hexToRgb(accentColor));
//         pdf.setLineWidth(0.5);
//         pdf.line(margin, yPosition + 2, margin + 40, yPosition + 2);

//         // Add disclaimer about factual reporting
//         pdf.setFontSize(7);
//         pdf.setTextColor(100, 100, 100);
//         pdf.setFont(bodyFont, "italic");
//         pdf.text(
//           "This summary contains only observed data patterns without interpretation or speculation.",
//           margin,
//           yPosition + 5
//         );

//         // Add summary text with better formatting
//         pdf.setFontSize(10);
//         pdf.setTextColor(...hexToRgb(textColor));
//         pdf.setFont(bodyFont, "normal");

//         // Add light background for executive summary
//         pdf.setFillColor(...hexToRgb(lightGrayBg));

//         const splitText = pdf.splitTextToSize(summary, contentWidth);
//         const boxHeight = splitText.length * 5 + 10;

//         pdf.roundedRect(
//           margin - 2,
//           yPosition + 8,
//           contentWidth + 4,
//           boxHeight,
//           2,
//           2,
//           "F"
//         );
//         pdf.text(splitText, margin, yPosition + 13);

//         return yPosition + boxHeight + 18;
//       };

//       // Hex to RGB conversion helper
//       function hexToRgb(hex) {
//         hex = hex.replace(/^#/, "");
//         const bigint = parseInt(hex, 16);
//         const r = (bigint >> 16) & 255;
//         const g = (bigint >> 8) & 255;
//         const b = bigint & 255;
//         return [r, g, b];
//       }

//       // Helper function to format date
//       function formatDate(date) {
//         const options = { year: "numeric", month: "long", day: "numeric" };
//         return new Date(date).toLocaleDateString("en-US", options);
//       }

//       // FIRST PAGE - Cover page with improved layout
//       // addWatermark(pdf);
//       await addLogo(pdf);

//       // Add title with better typography
//       pdf.setFontSize(22);
//       pdf.setTextColor(...hexToRgb(primaryColor));
//       pdf.setFont(headingFont, "bold");
//       pdf.text("Influenza Analysis Report", margin, 40);

//       // Add subtitle with better spacing
//       pdf.setFontSize(14);
//       pdf.setTextColor(...hexToRgb(textColor));
//       pdf.setFont(headingFont, "normal");
//       const today = formatDate(new Date());
//       pdf.text(`California Weekly Data Analysis`, margin, 50);
//       pdf.text(`Report Date: ${today}`, margin, 58);

//       // Add document information box with improved styling
//       const boxY = 68;
//       const boxHeight = 30;
//       pdf.setFillColor(...hexToRgb(lightGrayBg));
//       pdf.setDrawColor(200, 200, 200);
//       pdf.roundedRect(margin, boxY, contentWidth, boxHeight, 3, 3, "FD");

//       // Add document info content with better formatting
//       pdf.setFontSize(9);
//       pdf.setTextColor(...hexToRgb(textColor));
//       pdf.setFont(bodyFont, "normal");

//       pdf.text("Prepared by: ", margin + 5, boxY + 10);
//       pdf.text("Distribution: Internal Use Only", margin + 5, boxY + 18);
//       pdf.text("Classification: Confidential", margin + 5, boxY + 26);

//       pdf.text("Data Source:", pdfWidth / 2, boxY + 10);
//       pdf.text("CDC & HLP Research", pdfWidth / 2, boxY + 18);
//       // pdf.text("& HLP Research", pdfWidth / 2, boxY + 26);

//       // Add data visualization section
//       let currentPosition = boxY + boxHeight + 15;

//       currentPosition = addSection(
//         pdf,
//         "Data Visualization",
//         "Visualizations of California influenza data (2024-2025) showing positive/negative case counts and CDC comparison data.",
//         currentPosition
//       );

//       // Capture charts with better error handling
//       const chartImages = await captureChartsAsImages();

//       // Add first chart with better positioning
//       if (chartImages.length > 0) {
//         const chart = chartImages[0];

//         // Calculate image dimensions with proper aspect ratio
//         const imgWidth = contentWidth;
//         const imgHeight = (chart.height / chart.width) * imgWidth;

//         // Check if chart fits on current page
//         if (currentPosition + imgHeight + 30 < pdfHeight - 20) {
//           // Add chart title with better spacing
//           pdf.setFontSize(11);
//           pdf.setTextColor(...hexToRgb(primaryColor));
//           pdf.setFont(headingFont, "bold");
//           pdf.text(`Figure 1: Chart`, margin, currentPosition + 8);

//           // Add image with proper spacing
//           pdf.addImage(
//             chart.data,
//             "PNG",
//             margin,
//             currentPosition + 12,
//             imgWidth,
//             imgHeight
//           );

//           // Add caption with better styling
//           pdf.setFontSize(9);
//           pdf.setTextColor(100, 100, 100);
//           pdf.setFont(bodyFont, "italic");
//           pdf.text(
//             "California flu weekly rate showing trends in positive vs. negative cases and percent positivity compared to CDC data..",
//             margin,
//             currentPosition + imgHeight + 18
//           );

//           currentPosition = currentPosition + imgHeight + 25;
//         }
//       }

//       addFooter(pdf);

//       // SECOND PAGE - Analysis with improved layout
//       pdf.addPage();
//       addHeader(pdf, "Analysis & Findings");
//       addWatermark(pdf);

//       // Add executive summary with better positioning
//       currentPosition = 35;
//       currentPosition = addExecutiveSummary(pdf, summary, currentPosition);

//       // Add data sources section with better spacing
//       currentPosition = addSection(
//         pdf,
//         "Data Sources",
//         [
//           "• Source: HLP lab and CDC",
//           "• Time Period: October 2024 through February 2025 as shown in the visualization",
//           "• Comparison: Chart includes both internal data and CDC published statistics",
//           "• Metrics: Positive and negative test results as displayed in the charts",
//         ],
//         currentPosition
//       );

//       // Add key observations with better spacing - strictly fact-based
//       currentPosition = addSection(
//         pdf,
//         "Data Patterns",
//         [
//           "• The data shows a peak in case counts during week 46 (mid-November 2024)",
//           "• The visualization indicates a difference between our data and CDC figures",
//           "• The chart shows a decline in case counts after the November peak through December",
//           "• The weekly data points show fluctuations throughout the measured time period",
//         ],
//         currentPosition
//       );

//       // Add limitations section to acknowledge data constraints
//       currentPosition = addSection(
//         pdf,
//         "Data Limitations",
//         [
//           "• This report presents only the data visualized in the charts without additional context",
//           "• No statistical significance testing has been applied to the observed differences",
//           "• The visualization time frame is limited to the dates shown in the charts",
//           "• Data interpretation should be performed by qualified health professionals",
//         ],
//         currentPosition
//       );

//       // Add second chart with better handling
//       if (chartImages.length > 1) {
//         const chart = chartImages[1];

//         // Check if we need a new page
//         if (currentPosition + 120 > pdfHeight - 20) {
//           pdf.addPage();
//           addHeader(pdf, "Additional Data Visualization");
//           addWatermark(pdf);
//           currentPosition = 40;
//         } else {
//           // Add proper spacing
//           currentPosition += 15;
//         }

//         // Add section title
//         pdf.setFontSize(12);
//         pdf.setTextColor(...hexToRgb(primaryColor));
//         pdf.setFont(headingFont, "bold");
//         pdf.text("Additional Charts", margin, currentPosition);
//         currentPosition += 10;

//         // Calculate image dimensions with proper aspect ratio
//         const imgWidth = contentWidth;
//         const imgHeight = (chart.height / chart.width) * imgWidth;

//         // Add chart title with better spacing
//         pdf.setFontSize(11);
//         pdf.setTextColor(...hexToRgb(primaryColor));
//         pdf.setFont(headingFont, "bold");
//         pdf.text(`Figure 2: Comparison Data`, margin, currentPosition);
//         currentPosition += 8;

//         // Add image with proper spacing
//         pdf.addImage(
//           chart.data,
//           "PNG",
//           margin,
//           currentPosition,
//           imgWidth,
//           imgHeight
//         );

//         // Add caption with better styling - strictly descriptive
//         currentPosition += imgHeight + 8;
//         pdf.setFontSize(9);
//         pdf.setTextColor(100, 100, 100);
//         pdf.setFont(bodyFont, "italic");
//         pdf.text(
//           "Chart showing percent positive rates as displayed in the visualization.",
//           margin,
//           currentPosition
//         );
//       }

//       addFooter(pdf);

//       // Save the PDF with quality settings
//       pdf.save("influenza-analysis-report.pdf");

//       return true;
//     } catch (error) {
//       console.error("Error generating PDF:", error);
//       return false;
//     } finally {
//       setIsGenerating(false);
//     }
//   };

//   return (
//     <div className="relative">
//       <button
//         id="download-report"
//         onClick={generatePDF}
//         disabled={isGenerating}
//         className="fixed bottom-8 right-8 group bg-blue-700 hover:bg-blue-800 p-3 rounded-full shadow-xl transition-all duration-200 disabled:bg-gray-400 disabled:cursor-not-allowed"
//       >
//         {isGenerating ? (
//           <Loader2 className="h-5 w-5 text-white animate-spin" />
//         ) : (
//           <FileDown className="h-5 w-5 text-white" />
//         )}
//         <span className="absolute bottom-full right-0 mb-2 px-3 py-1 bg-gray-900 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
//           {isGenerating
//             ? "Generating summary report..."
//             : "Download summary report"}
//         </span>
//       </button>
//     </div>
//   );
// };

import React, { useState } from "react";
import OpenAI from "openai";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { FileDown, Loader2, XCircle } from "lucide-react";

import { useThemeStore } from "@/stores/useThemeStore";

export const ReportDownload = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  // Add state for error handling popup
  const [error, setError] = useState(null);
  const [showErrorPopup, setShowErrorPopup] = useState(false);

  // Function to capture charts as images
  const captureChartsAsImages = async () => {
    // Get all chart containers - adjust these selectors to match your actual chart containers
    const chartContainers = document.querySelectorAll(
      '.chart-container, .recharts-wrapper, [id^="chart-"]'
    );
    const chartImages = [];

    for (const container of chartContainers) {
      try {
        // Capture this specific chart as an image
        const canvas = await html2canvas(container, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: isDarkMode ? "#1e1e1e" : "#ffffff",
        });

        // Convert canvas to base64 image data
        const imageData = canvas.toDataURL("image/png");
        chartImages.push({
          data: imageData,
          width: container.offsetWidth,
          height: container.offsetHeight,
          title: container.getAttribute("data-title") || "Chart",
        });
      } catch (error) {
        console.error("Error capturing chart:", error);
        setError(`Error capturing chart: ${error.message}`);
        setShowErrorPopup(true);
      }
    }

    return chartImages;
  };

  /**
   * Get the OpenAI API key from localStorage or environment variables
   * @returns {string|null} The API key or null if not found
   */
  function getApiKey() {
    // First try to get the key from localStorage
    if (typeof window !== "undefined") {
      try {
        const localStorageKey = localStorage.getItem("openai_api_key");
        if (localStorageKey) {
          return localStorageKey;
        }
      } catch (error) {
        console.error("Error accessing localStorage:", error);
      }
    }

    // If not found in localStorage, try environment variable
    // Note: This should be prefixed with NEXT_PUBLIC_ to be accessible on the client side
    const envApiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;

    return envApiKey || null;
  }

  // Function to generate summary using OpenAI API with image input
  const generateSummaryWithOpenAI = async (chartImages) => {
    if (!chartImages || chartImages.length === 0) {
      console.warn("No chart images captured for analysis");
      const errorMsg = "No chart images provided for analysis";
      setError(errorMsg);
      setShowErrorPopup(true);
      throw new Error(errorMsg);
    }

    try {
      const apiKey = getApiKey();

      if (!apiKey) {
        console.error(
          "OpenAI API key is missing. Make sure NEXT_PUBLIC_OPENAI_API_KEY is set in your environment."
        );
        const errorMsg = "OpenAI API key is not configured";
        setError(errorMsg);
        setShowErrorPopup(true);
        throw new Error(errorMsg);
      }

      // Initialize OpenAI client
      const openai = new OpenAI({
        apiKey: apiKey,
        dangerouslyAllowBrowser: true,
      });

      // System prompt configuration
      const systemPrompt = `
      You are a highly cautious and defensive data analysis expert. 
      You do not draw premature conclusions and refrain from making definitive judgments in the absence of clear evidence. 
      Your analysis is strictly based on observable data without speculation or assumptions.
  
      ---
      **Analysis Guidelines:**
      1. **General Trend Analysis:** 
         - Describe only the changes that are clearly observable in the given data.
         - Do not make predictions or assumptions; construct sentences based solely on confirmed facts.
         - Use cautious wording such as "According to the data," and "The observed pattern is as follows."
  
      2. **Changes in Positive and Negative Cases:**
         - If a change is observed at a specific time point, state it as: 
           "During this period, the number of cases appears to have increased (or decreased)."
         - Avoid speculating on the causes of the increase or decrease; only mention what is directly confirmed by the data.
  
      3. **Comparison Between CDC and Researcher Data:** 
         - If a difference exists between the two datasets, phrase it as: 
           "A discrepancy has been observed, but the reason is not clearly identifiable from the data alone."
         - Use language such as "Further analysis may be required to determine if this difference is statistically significant."
  
      4. **Text-Based Results Without Visualization:**
         - Clearly summarize the findings in sentence form.
         - Maintain a structured format, such as:
           - "In mid-November 2024, the number of flu-positive cases appears to have increased compared to the previous week."
           - "Compared to CDC data, the researcher-collected data shows a higher flu positivity rate; however, the reason for this difference cannot be determined solely from the available data."
  
      ---
      **Defensive Analysis Principles:**
      - **Avoid speculation and base analysis strictly on observable data.**
      - **For ambiguous aspects, use phrases like "Additional data is needed" rather than drawing firm conclusions.**
      - **Maintain cautious wording, incorporating expressions such as "Data suggests," "Further interpretation is necessary," and "Findings should be considered with caution."**
      
      ---
      Now, generate a concise summary (150-200 words) following the defensive analysis principles. Format your response with a few bullet points for key findings.
      `;

      // Prepare message array
      const messages = [
        {
          role: "system",
          content: systemPrompt,
        },
      ];

      // Process images
      console.log("Processing images for analysis...");
      for (let i = 0; i < chartImages.length; i++) {
        const imageData = chartImages[i].data;

        // Validate image data format
        let imageUrl;
        if (typeof imageData === "string") {
          // imageData is already a URL or base64 string
          imageUrl =
            imageData.startsWith("data:") || imageData.startsWith("http")
              ? imageData
              : `data:image/png;base64,${imageData}`;
        } else {
          const errorMsg = `Invalid image data format at index ${i}`;
          setError(errorMsg);
          setShowErrorPopup(true);
          throw new Error(errorMsg);
        }

        messages.push({
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyzing Chart ${i + 1} for influenza data trends:`,
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
              },
            },
          ],
        });
      }

      // Debug console log
      console.log(
        "Sending request to OpenAI API with API key:",
        apiKey ? "API key exists" : "API key is missing"
      );
      console.log("Number of images being processed:", chartImages.length);

      // Call OpenAI API
      const response = await openai.chat.completions.create({
        model: "gpt-4o", // Vision model
        messages: messages,
        temperature: 0,
        max_tokens: 400,
      });

      // Process response
      if (!response || !response.choices || response.choices.length === 0) {
        const errorMsg = "Unexpected response format from OpenAI API";
        setError(errorMsg);
        setShowErrorPopup(true);
        throw new Error(errorMsg);
      }

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error("Error generating summary with OpenAI:", error);
      setError(`OpenAI API Error: ${error.message}`);
      setShowErrorPopup(true);
      // Propagate error
      throw error;
    }
  };

  // Generate summary when needed
  const generateSummary = async () => {
    try {
      // Capture chart images
      const chartImages = await captureChartsAsImages();

      if (chartImages.length === 0) {
        const errorMsg = "No charts found to analyze";
        setError(errorMsg);
        setShowErrorPopup(true);
        throw new Error(errorMsg);
      }

      // Generate summary from images
      const summary = await generateSummaryWithOpenAI(chartImages);

      if (summary) {
        setSummaryText(summary);
        return summary;
      } else {
        const errorMsg = "Failed to generate summary";
        setError(errorMsg);
        setShowErrorPopup(true);
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error("Error generating summary:", error);
      // Propagate the error instead of creating fallback summary
      setError(`API Error: ${error.message}`);
      setShowErrorPopup(true);
      throw error; // Throw the error to prevent PDF generation
    }
  };

  // The generatePDF function for creating a better influenza report
  // const generatePDF = async () => {
  //   setIsGenerating(true);

  //   try {
  //     // Generate the summary before creating the PDF
  //     // This will throw an error if API call fails, preventing PDF generation
  //     const summary = await generateSummary();

  //     // Only continue with PDF generation if summary was successfully created
  //     if (!summary) {
  //       throw new Error("Failed to generate report summary");
  //     }

  //     // Initialize PDF with better quality settings
  //     const pdf = new jsPDF({
  //       orientation: "portrait",
  //       unit: "mm",
  //       format: "a4",
  //       compress: true, // Enables compression for better quality
  //     });

  //     // Calculate PDF dimensions
  //     const pdfWidth = pdf.internal.pageSize.getWidth();
  //     const pdfHeight = pdf.internal.pageSize.getHeight();
  //     const margin = 15; // Better margin for readability
  //     const contentWidth = pdfWidth - margin * 2;

  //     // Set document metadata
  //     pdf.setProperties({
  //       title: "Influenza Analysis Report",
  //       author: "HLP Health Analytics",
  //       subject: "California Influenza Surveillance",
  //       keywords: "influenza, healthcare, analysis, California",
  //       creator: "HLP Health Analytics Platform",
  //     });

  //     // Define colors for a more professional look
  //     const primaryColor = "#0C1E46"; // Dark blue
  //     const accentColor = "#A0171C"; // Red
  //     const textColor = "#333333"; // Dark gray
  //     const lightGrayBg = "#F8F9FA"; // Light gray background
  //     const headingFont = "helvetica";
  //     const bodyFont = "helvetica";

  //     // Logo dimensions
  //     const logoWidth = 45;
  //     const logoHeight = 14;

  //     // SVG Logo (unchanged)
  //     const svgLogo = `
  //     <svg baseProfile="tiny" height="125" version="1.2" width="249" xmlns="http://www.w3.org/2000/svg" xmlns:ev="http://www.w3.org/2001/xml-events" xmlns:xlink="http://www.w3.org/1999/xlink"><defs /><path d="M 69,74 68,75 67,75 66,76 66,81 68,83 72,83 73,82 74,82 74,80 75,79 75,78 74,77 74,76 72,74 Z" fill="#A0171C" stroke="none" /><path d="M 26,58 25,59 24,59 22,61 22,65 24,67 29,67 30,66 31,66 31,65 32,64 32,62 31,61 31,60 30,59 29,59 28,58 Z" fill="#A0171C" stroke="none" /><path d="M 99,51 96,54 96,57 97,58 97,59 98,60 103,60 105,58 105,54 104,53 104,52 103,52 102,51 Z" fill="#A0171C" stroke="none" /><path d="M 202,42 202,83 209,83 209,70 210,69 225,69 226,68 227,68 228,67 229,67 232,64 232,63 233,62 233,60 234,59 234,52 233,51 233,49 232,48 232,47 230,45 229,45 227,43 223,43 222,42 Z" fill="#0C1E46" stroke="none" /><path d="M 169,42 169,83 196,83 196,78 176,78 175,77 175,42 Z" fill="#0C1E46" stroke="none" /><path d="M 126,42 125,43 125,83 132,83 132,66 133,65 153,65 154,66 154,83 161,83 161,42 155,42 154,43 154,59 153,60 133,60 132,59 132,42 Z" fill="#0C1E46" stroke="none" /><path d="M 112,42 112,69 118,69 119,68 119,43 118,42 Z" fill="#A0171C" stroke="none" /><path d="M 83,42 83,83 89,83 89,42 Z" fill="#A0171C" stroke="none" /><path d="M 53,42 52,43 52,83 59,83 59,42 Z" fill="#A0171C" stroke="none" /><path d="M 40,42 39,43 39,83 46,83 46,42 Z" fill="#A0171C" stroke="none" /><path d="M 8,42 8,83 15,83 15,43 14,42 Z" fill="#A0171C" stroke="none" /></svg>
  //   `;

  //     // Discrete watermark that doesn't interfere with content
  //     const addWatermark = (pdf) => {
  //       pdf.saveGraphicsState();
  //       pdf.setGState(new pdf.GState({ opacity: 0.05 }));
  //       pdf.setFontSize(60);
  //       pdf.setTextColor(100, 100, 100);
  //       pdf.setFont(headingFont, "bold");
  //       // pdf.text("CONFIDENTIAL", pdfWidth / 2, pdfHeight / 2, {
  //       //   align: "center",
  //       //   angle: 45,
  //       // });
  //       pdf.restoreGraphicsState();
  //     };

  //     // Improved header with cleaner design
  //     const addHeader = (pdf, pageTitle = "") => {
  //       // Draw header bar
  //       pdf.setFillColor(...hexToRgb(primaryColor));
  //       pdf.rect(0, 0, pdfWidth, 12, "F");

  //       // Add header text
  //       pdf.setFontSize(8);
  //       pdf.setTextColor(255, 255, 255);
  //       pdf.setFont(bodyFont, "normal");

  //       const reportTitle = "Influenza Analysis Report";
  //       const dateText = "Generated on " + new Date().toLocaleDateString();

  //       pdf.text(reportTitle, margin, 8);
  //       pdf.text(dateText, pdfWidth - margin, 8, { align: "right" });

  //       // Add subtitle if provided
  //       if (pageTitle) {
  //         pdf.setFontSize(14);
  //         pdf.setTextColor(...hexToRgb(accentColor));
  //         pdf.setFont(headingFont, "bold");
  //         pdf.text(pageTitle, margin, 24);

  //         // Add subtle underline
  //         pdf.setDrawColor(...hexToRgb(accentColor));
  //         pdf.setLineWidth(0.5);
  //         pdf.line(margin, 26, margin + 50, 26);
  //       }
  //     };

  //     // Improved footer with cleaner design
  //     const addFooter = (pdf) => {
  //       // Draw footer bar
  //       pdf.setFillColor(...hexToRgb(primaryColor));
  //       pdf.rect(0, pdfHeight - 10, pdfWidth, 10, "F");

  //       // Add footer text
  //       pdf.setFontSize(7);
  //       pdf.setTextColor(255, 255, 255);
  //       pdf.setFont(bodyFont, "normal");

  //       const pageNumber = pdf.internal.getNumberOfPages();
  //       const footerText = "Confidential - For Internal Use Only";

  //       pdf.text(footerText, margin, pdfHeight - 4);
  //       pdf.text(`Page ${pageNumber}`, pdfWidth - margin, pdfHeight - 4, {
  //         align: "right",
  //       });
  //     };

  //     // Add logo with proper positioning
  //     const addLogo = async (pdf) => {
  //       const svgBlob = new Blob([svgLogo], { type: "image/svg+xml" });
  //       const url = URL.createObjectURL(svgBlob);

  //       return new Promise((resolve) => {
  //         const img = new Image();
  //         img.onload = () => {
  //           const canvas = document.createElement("canvas");
  //           canvas.width = img.width;
  //           canvas.height = img.height;
  //           const ctx = canvas.getContext("2d");
  //           ctx.drawImage(img, 0, 0);
  //           const dataUrl = canvas.toDataURL("image/png");
  //           pdf.addImage(dataUrl, "PNG", margin, 20, logoWidth, logoHeight);
  //           URL.revokeObjectURL(url);
  //           resolve();
  //         };
  //         img.src = url;
  //       });
  //     };

  //     // Improved section layout with better spacing and typography
  //     const addSection = (pdf, title, content, yPosition) => {
  //       // Add section title
  //       pdf.setFontSize(12);
  //       pdf.setTextColor(...hexToRgb(primaryColor));
  //       pdf.setFont(headingFont, "bold");
  //       pdf.text(title, margin, yPosition);

  //       // Add horizontal line
  //       const lineY = yPosition + 2;
  //       pdf.setDrawColor(220, 220, 220);
  //       pdf.setLineWidth(0.3);
  //       pdf.line(margin, lineY, pdfWidth - margin, lineY);

  //       // Add content with better spacing
  //       pdf.setFontSize(10);
  //       pdf.setTextColor(...hexToRgb(textColor));
  //       pdf.setFont(bodyFont, "normal");
  //       const contentY = yPosition + 8;

  //       // Handle array or string with proper spacing
  //       if (Array.isArray(content)) {
  //         let y = contentY;
  //         content.forEach((line) => {
  //           pdf.text(line, margin, y);
  //           y += 5; // Better line spacing for readability
  //         });
  //         return y + 5; // Return new Y position with padding
  //       } else {
  //         // Split text to fit width
  //         const splitText = pdf.splitTextToSize(content, contentWidth);
  //         pdf.text(splitText, margin, contentY);
  //         return contentY + splitText.length * 5 + 5; // Better line spacing
  //       }
  //     };

  //     // Improved executive summary with better typography and fact-based content
  //     const addExecutiveSummary = (pdf, summary, yPosition) => {
  //       const title = "Data Observations";

  //       // Add title
  //       pdf.setFontSize(14);
  //       pdf.setTextColor(...hexToRgb(accentColor));
  //       pdf.setFont(headingFont, "bold");
  //       pdf.text(title, margin, yPosition);

  //       // Add underline
  //       pdf.setDrawColor(...hexToRgb(accentColor));
  //       pdf.setLineWidth(0.5);
  //       pdf.line(margin, yPosition + 2, margin + 40, yPosition + 2);

  //       // Add disclaimer about factual reporting
  //       pdf.setFontSize(7);
  //       pdf.setTextColor(100, 100, 100);
  //       pdf.setFont(bodyFont, "italic");
  //       pdf.text(
  //         "This summary contains only observed data patterns without interpretation or speculation.",
  //         margin,
  //         yPosition + 5
  //       );

  //       // Add summary text with better formatting
  //       pdf.setFontSize(10);
  //       pdf.setTextColor(...hexToRgb(textColor));
  //       pdf.setFont(bodyFont, "normal");

  //       // Add light background for executive summary
  //       pdf.setFillColor(...hexToRgb(lightGrayBg));

  //       const splitText = pdf.splitTextToSize(summary, contentWidth);
  //       const boxHeight = splitText.length * 5 + 10;

  //       pdf.roundedRect(
  //         margin - 2,
  //         yPosition + 8,
  //         contentWidth + 4,
  //         boxHeight,
  //         2,
  //         2,
  //         "F"
  //       );
  //       pdf.text(splitText, margin, yPosition + 13);

  //       return yPosition + boxHeight + 18;
  //     };

  //     // Hex to RGB conversion helper
  //     function hexToRgb(hex) {
  //       hex = hex.replace(/^#/, "");
  //       const bigint = parseInt(hex, 16);
  //       const r = (bigint >> 16) & 255;
  //       const g = (bigint >> 8) & 255;
  //       const b = bigint & 255;
  //       return [r, g, b];
  //     }

  //     // Helper function to format date
  //     function formatDate(date) {
  //       const options = { year: "numeric", month: "long", day: "numeric" };
  //       return new Date(date).toLocaleDateString("en-US", options);
  //     }

  //     // FIRST PAGE - Cover page with improved layout
  //     // addWatermark(pdf);
  //     await addLogo(pdf);

  //     // Add title with better typography
  //     pdf.setFontSize(22);
  //     pdf.setTextColor(...hexToRgb(primaryColor));
  //     pdf.setFont(headingFont, "bold");
  //     pdf.text("Influenza Analysis Report", margin, 40);

  //     // Add subtitle with better spacing
  //     pdf.setFontSize(14);
  //     pdf.setTextColor(...hexToRgb(textColor));
  //     pdf.setFont(headingFont, "normal");
  //     const today = formatDate(new Date());
  //     pdf.text(`California Weekly Data Analysis`, margin, 50);
  //     pdf.text(`Report Date: ${today}`, margin, 58);

  //     // Add document information box with improved styling
  //     const boxY = 68;
  //     const boxHeight = 30;
  //     pdf.setFillColor(...hexToRgb(lightGrayBg));
  //     pdf.setDrawColor(200, 200, 200);
  //     pdf.roundedRect(margin, boxY, contentWidth, boxHeight, 3, 3, "FD");

  //     // Add document info content with better formatting
  //     pdf.setFontSize(9);
  //     pdf.setTextColor(...hexToRgb(textColor));
  //     pdf.setFont(bodyFont, "normal");

  //     pdf.text("Prepared by: ", margin + 5, boxY + 10);
  //     pdf.text("Distribution: Internal Use Only", margin + 5, boxY + 18);
  //     pdf.text("Classification: Confidential", margin + 5, boxY + 26);

  //     pdf.text("Data Source:", pdfWidth / 2, boxY + 10);
  //     pdf.text("CDC & HLP Research", pdfWidth / 2, boxY + 18);
  //     // pdf.text("& HLP Research", pdfWidth / 2, boxY + 26);

  //     // Add data visualization section
  //     let currentPosition = boxY + boxHeight + 15;

  //     currentPosition = addSection(
  //       pdf,
  //       "Data Visualization",
  //       "Visualizations of California influenza data (2024-2025) showing positive/negative case counts and CDC comparison data.",
  //       currentPosition
  //     );

  //     // Capture charts with better error handling
  //     const chartImages = await captureChartsAsImages();

  //     // Add first chart with better positioning
  //     if (chartImages.length > 0) {
  //       const chart = chartImages[0];

  //       // Calculate image dimensions with proper aspect ratio
  //       const imgWidth = contentWidth;
  //       const imgHeight = (chart.height / chart.width) * imgWidth;

  //       // Check if chart fits on current page
  //       if (currentPosition + imgHeight + 30 < pdfHeight - 20) {
  //         // Add chart title with better spacing
  //         pdf.setFontSize(11);
  //         pdf.setTextColor(...hexToRgb(primaryColor));
  //         pdf.setFont(headingFont, "bold");
  //         pdf.text(`Figure 1: Chart`, margin, currentPosition + 8);

  //         // Add image with proper spacing
  //         pdf.addImage(
  //           chart.data,
  //           "PNG",
  //           margin,
  //           currentPosition + 12,
  //           imgWidth,
  //           imgHeight
  //         );

  //         // Add caption with better styling
  //         pdf.setFontSize(9);
  //         pdf.setTextColor(100, 100, 100);
  //         pdf.setFont(bodyFont, "italic");
  //         pdf.text(
  //           "California flu weekly rate showing trends in positive vs. negative cases and percent positivity compared to CDC data..",
  //           margin,
  //           currentPosition + imgHeight + 18
  //         );

  //         currentPosition = currentPosition + imgHeight + 25;
  //       }
  //     }

  //     addFooter(pdf);

  //     // SECOND PAGE - Analysis with improved layout
  //     pdf.addPage();
  //     addHeader(pdf, "Analysis & Findings");
  //     addWatermark(pdf);

  //     // Add executive summary with better positioning
  //     currentPosition = 35;
  //     currentPosition = addExecutiveSummary(pdf, summary, currentPosition);

  //     // Add data sources section with better spacing
  //     currentPosition = addSection(
  //       pdf,
  //       "Data Sources",
  //       [
  //         "• Source: HLP lab and CDC",
  //         "• Time Period: October 2024 through February 2025 as shown in the visualization",
  //         "• Comparison: Chart includes both internal data and CDC published statistics",
  //         "• Metrics: Positive and negative test results as displayed in the charts",
  //       ],
  //       currentPosition
  //     );

  //     // Add key observations with better spacing - strictly fact-based
  //     currentPosition = addSection(
  //       pdf,
  //       "Data Patterns",
  //       [
  //         "• The data shows a peak in case counts during week 46 (mid-November 2024)",
  //         "• The visualization indicates a difference between our data and CDC figures",
  //         "• The chart shows a decline in case counts after the November peak through December",
  //         "• The weekly data points show fluctuations throughout the measured time period",
  //       ],
  //       currentPosition
  //     );

  //     // Add limitations section to acknowledge data constraints
  //     currentPosition = addSection(
  //       pdf,
  //       "Data Limitations",
  //       [
  //         "• This report presents only the data visualized in the charts without additional context",
  //         "• No statistical significance testing has been applied to the observed differences",
  //         "• The visualization time frame is limited to the dates shown in the charts",
  //         "• Data interpretation should be performed by qualified health professionals",
  //       ],
  //       currentPosition
  //     );

  //     // Add second chart with better handling
  //     if (chartImages.length > 1) {
  //       const chart = chartImages[1];

  //       // Check if we need a new page
  //       if (currentPosition + 120 > pdfHeight - 20) {
  //         pdf.addPage();
  //         addHeader(pdf, "Additional Data Visualization");
  //         addWatermark(pdf);
  //         currentPosition = 40;
  //       } else {
  //         // Add proper spacing
  //         currentPosition += 15;
  //       }

  //       // Add section title
  //       pdf.setFontSize(12);
  //       pdf.setTextColor(...hexToRgb(primaryColor));
  //       pdf.setFont(headingFont, "bold");
  //       pdf.text("Additional Charts", margin, currentPosition);
  //       currentPosition += 10;

  //       // Calculate image dimensions with proper aspect ratio
  //       const imgWidth = contentWidth;
  //       const imgHeight = (chart.height / chart.width) * imgWidth;

  //       // Add chart title with better spacing
  //       pdf.setFontSize(11);
  //       pdf.setTextColor(...hexToRgb(primaryColor));
  //       pdf.setFont(headingFont, "bold");
  //       pdf.text(`Figure 2: Comparison Data`, margin, currentPosition);
  //       currentPosition += 8;

  //       // Add image with proper spacing
  //       pdf.addImage(
  //         chart.data,
  //         "PNG",
  //         margin,
  //         currentPosition,
  //         imgWidth,
  //         imgHeight
  //       );

  //       // Add caption with better styling - strictly descriptive
  //       currentPosition += imgHeight + 8;
  //       pdf.setFontSize(9);
  //       pdf.setTextColor(100, 100, 100);
  //       pdf.setFont(bodyFont, "italic");
  //       pdf.text(
  //         "Chart showing percent positive rates as displayed in the visualization.",
  //         margin,
  //         currentPosition
  //       );
  //     }

  //     addFooter(pdf);

  //     // Save the PDF with quality settings
  //     pdf.save("influenza-analysis-report.pdf");

  //     return true;
  //   } catch (error) {
  //     console.error("Error generating PDF:", error);
  //     setError(`PDF Generation Error: ${error.message}`);
  //     setShowErrorPopup(true);
  //     return false;
  //   } finally {
  //     setIsGenerating(false);
  //   }
  // };

  // The generatePDF function for creating a better influenza report
  // const generatePDF = async () => {
  //   setIsGenerating(true);

  //   try {
  //     // Generate the summary before creating the PDF
  //     // This will throw an error if API call fails, preventing PDF generation
  //     const summary = await generateSummary();

  //     console.log("Summary:", summary);

  //     // Only continue with PDF generation if summary was successfully created
  //     if (!summary) {
  //       throw new Error("Failed to generate report summary");
  //     }

  //     // Initialize PDF with better quality settings
  //     const pdf = new jsPDF({
  //       orientation: "portrait",
  //       unit: "mm",
  //       format: "a4",
  //       compress: true, // Enables compression for better quality
  //     });

  //     // Calculate PDF dimensions
  //     const pdfWidth = pdf.internal.pageSize.getWidth();
  //     const pdfHeight = pdf.internal.pageSize.getHeight();
  //     const margin = 15; // Better margin for readability
  //     const contentWidth = pdfWidth - margin * 2;

  //     // Set document metadata
  //     pdf.setProperties({
  //       title: "Influenza Analysis Report",
  //       author: "HLP Health Analytics",
  //       subject: "California Influenza Surveillance",
  //       keywords: "influenza, healthcare, analysis, California",
  //       creator: "HLP Health Analytics Platform",
  //     });

  //     // Define colors for a more professional look
  //     const primaryColor = "#0C1E46"; // Dark blue
  //     const accentColor = "#A0171C"; // Red
  //     const textColor = "#333333"; // Dark gray
  //     const lightGrayBg = "#F8F9FA"; // Light gray background
  //     const headingFont = "helvetica";
  //     const bodyFont = "helvetica";

  //     // Logo dimensions
  //     const logoWidth = 45;
  //     const logoHeight = 14;

  //     // SVG Logo
  //     const svgLogo = `
  //     <svg baseProfile="tiny" height="125" version="1.2" width="249" xmlns="http://www.w3.org/2000/svg" xmlns:ev="http://www.w3.org/2001/xml-events" xmlns:xlink="http://www.w3.org/1999/xlink"><defs /><path d="M 69,74 68,75 67,75 66,76 66,81 68,83 72,83 73,82 74,82 74,80 75,79 75,78 74,77 74,76 72,74 Z" fill="#A0171C" stroke="none" /><path d="M 26,58 25,59 24,59 22,61 22,65 24,67 29,67 30,66 31,66 31,65 32,64 32,62 31,61 31,60 30,59 29,59 28,58 Z" fill="#A0171C" stroke="none" /><path d="M 99,51 96,54 96,57 97,58 97,59 98,60 103,60 105,58 105,54 104,53 104,52 103,52 102,51 Z" fill="#A0171C" stroke="none" /><path d="M 202,42 202,83 209,83 209,70 210,69 225,69 226,68 227,68 228,67 229,67 232,64 232,63 233,62 233,60 234,59 234,52 233,51 233,49 232,48 232,47 230,45 229,45 227,43 223,43 222,42 Z" fill="#0C1E46" stroke="none" /><path d="M 169,42 169,83 196,83 196,78 176,78 175,77 175,42 Z" fill="#0C1E46" stroke="none" /><path d="M 126,42 125,43 125,83 132,83 132,66 133,65 153,65 154,66 154,83 161,83 161,42 155,42 154,43 154,59 153,60 133,60 132,59 132,42 Z" fill="#0C1E46" stroke="none" /><path d="M 112,42 112,69 118,69 119,68 119,43 118,42 Z" fill="#A0171C" stroke="none" /><path d="M 83,42 83,83 89,83 89,42 Z" fill="#A0171C" stroke="none" /><path d="M 53,42 52,43 52,83 59,83 59,42 Z" fill="#A0171C" stroke="none" /><path d="M 40,42 39,43 39,83 46,83 46,42 Z" fill="#A0171C" stroke="none" /><path d="M 8,42 8,83 15,83 15,43 14,42 Z" fill="#A0171C" stroke="none" /></svg>
  //   `;

  //     // Helper function to extract bullet points from summary text
  //     const extractBulletPoints = (text) => {
  //       // Look for bullet points in the text (• or - or * followed by text)
  //       const bulletRegex = /[•\-\*]\s*([^\n•\-\*]+)/g;
  //       const matches = [...text.matchAll(bulletRegex)];

  //       if (matches.length > 0) {
  //         // Return extracted bullet points
  //         return matches.map((match) => `• ${match[1].trim()}`);
  //       } else {
  //         // If no bullet points found, split by sentences and create bullets
  //         const sentences = text
  //           .split(/\.(?:\s|$)/)
  //           .filter((s) => s.trim().length > 0);
  //         return sentences.map((s) => `• ${s.trim()}`);
  //       }
  //     };

  //     // Discrete watermark that doesn't interfere with content
  //     const addWatermark = (pdf) => {
  //       pdf.saveGraphicsState();
  //       pdf.setGState(new pdf.GState({ opacity: 0.05 }));
  //       pdf.setFontSize(60);
  //       pdf.setTextColor(100, 100, 100);
  //       pdf.setFont(headingFont, "bold");
  //       pdf.restoreGraphicsState();
  //     };

  //     // Improved header with cleaner design
  //     const addHeader = (pdf, pageTitle = "") => {
  //       // Draw header bar
  //       pdf.setFillColor(...hexToRgb(primaryColor));
  //       pdf.rect(0, 0, pdfWidth, 12, "F");

  //       // Add header text
  //       pdf.setFontSize(8);
  //       pdf.setTextColor(255, 255, 255);
  //       pdf.setFont(bodyFont, "normal");

  //       const reportTitle = "Influenza Analysis Report";
  //       const dateText = "Generated on " + new Date().toLocaleDateString();

  //       pdf.text(reportTitle, margin, 8);
  //       pdf.text(dateText, pdfWidth - margin, 8, { align: "right" });

  //       // Add subtitle if provided
  //       if (pageTitle) {
  //         pdf.setFontSize(14);
  //         pdf.setTextColor(...hexToRgb(accentColor));
  //         pdf.setFont(headingFont, "bold");
  //         pdf.text(pageTitle, margin, 24);

  //         // Add subtle underline
  //         pdf.setDrawColor(...hexToRgb(accentColor));
  //         pdf.setLineWidth(0.5);
  //         pdf.line(margin, 26, margin + 50, 26);
  //       }
  //     };

  //     // Improved footer with cleaner design
  //     const addFooter = (pdf) => {
  //       // Draw footer bar
  //       pdf.setFillColor(...hexToRgb(primaryColor));
  //       pdf.rect(0, pdfHeight - 10, pdfWidth, 10, "F");

  //       // Add footer text
  //       pdf.setFontSize(7);
  //       pdf.setTextColor(255, 255, 255);
  //       pdf.setFont(bodyFont, "normal");

  //       const pageNumber = pdf.internal.getNumberOfPages();
  //       const footerText = "Confidential - For Internal Use Only";

  //       pdf.text(footerText, margin, pdfHeight - 4);
  //       pdf.text(`Page ${pageNumber}`, pdfWidth - margin, pdfHeight - 4, {
  //         align: "right",
  //       });
  //     };

  //     // Add logo with proper positioning
  //     const addLogo = async (pdf) => {
  //       const svgBlob = new Blob([svgLogo], { type: "image/svg+xml" });
  //       const url = URL.createObjectURL(svgBlob);

  //       return new Promise((resolve) => {
  //         const img = new Image();
  //         img.onload = () => {
  //           const canvas = document.createElement("canvas");
  //           canvas.width = img.width;
  //           canvas.height = img.height;
  //           const ctx = canvas.getContext("2d");
  //           ctx.drawImage(img, 0, 0);
  //           const dataUrl = canvas.toDataURL("image/png");
  //           pdf.addImage(dataUrl, "PNG", margin, 20, logoWidth, logoHeight);
  //           URL.revokeObjectURL(url);
  //           resolve();
  //         };
  //         img.src = url;
  //       });
  //     };

  //     // Improved section layout with better spacing and typography
  //     const addSection = (pdf, title, content, yPosition) => {
  //       // Add section title
  //       pdf.setFontSize(12);
  //       pdf.setTextColor(...hexToRgb(primaryColor));
  //       pdf.setFont(headingFont, "bold");
  //       pdf.text(title, margin, yPosition);

  //       // Add horizontal line
  //       const lineY = yPosition + 2;
  //       pdf.setDrawColor(220, 220, 220);
  //       pdf.setLineWidth(0.3);
  //       pdf.line(margin, lineY, pdfWidth - margin, lineY);

  //       // Add content with better spacing
  //       pdf.setFontSize(10);
  //       pdf.setTextColor(...hexToRgb(textColor));
  //       pdf.setFont(bodyFont, "normal");
  //       const contentY = yPosition + 8;

  //       // Handle array or string with proper spacing
  //       if (Array.isArray(content)) {
  //         let y = contentY;
  //         content.forEach((line) => {
  //           pdf.text(line, margin, y);
  //           y += 5; // Better line spacing for readability
  //         });
  //         return y + 5; // Return new Y position with padding
  //       } else {
  //         // Split text to fit width
  //         const splitText = pdf.splitTextToSize(content, contentWidth);
  //         pdf.text(splitText, margin, contentY);
  //         return contentY + splitText.length * 5 + 5; // Better line spacing
  //       }
  //     };

  //     // Improved executive summary with better typography and fact-based content
  //     const addExecutiveSummary = (pdf, summary, yPosition) => {
  //       const title = "Data Observations";

  //       // Add title
  //       pdf.setFontSize(14);
  //       pdf.setTextColor(...hexToRgb(accentColor));
  //       pdf.setFont(headingFont, "bold");
  //       pdf.text(title, margin, yPosition);

  //       // Add underline
  //       pdf.setDrawColor(...hexToRgb(accentColor));
  //       pdf.setLineWidth(0.5);
  //       pdf.line(margin, yPosition + 2, margin + 40, yPosition + 2);

  //       // Add disclaimer about factual reporting
  //       pdf.setFontSize(7);
  //       pdf.setTextColor(100, 100, 100);
  //       pdf.setFont(bodyFont, "italic");
  //       pdf.text(
  //         "This summary contains only observed data patterns without interpretation or speculation.",
  //         margin,
  //         yPosition + 5
  //       );

  //       // Add summary text with better formatting
  //       pdf.setFontSize(10);
  //       pdf.setTextColor(...hexToRgb(textColor));
  //       pdf.setFont(bodyFont, "normal");

  //       // Add light background for executive summary
  //       pdf.setFillColor(...hexToRgb(lightGrayBg));

  //       const splitText = pdf.splitTextToSize(summary, contentWidth);
  //       const boxHeight = splitText.length * 5 + 10;

  //       pdf.roundedRect(
  //         margin - 2,
  //         yPosition + 8,
  //         contentWidth + 4,
  //         boxHeight,
  //         2,
  //         2,
  //         "F"
  //       );
  //       pdf.text(splitText, margin, yPosition + 13);

  //       return yPosition + boxHeight + 18;
  //     };

  //     // Hex to RGB conversion helper
  //     function hexToRgb(hex) {
  //       hex = hex.replace(/^#/, "");
  //       const bigint = parseInt(hex, 16);
  //       const r = (bigint >> 16) & 255;
  //       const g = (bigint >> 8) & 255;
  //       const b = bigint & 255;
  //       return [r, g, b];
  //     }

  //     // Helper function to format date
  //     function formatDate(date) {
  //       const options = { year: "numeric", month: "long", day: "numeric" };
  //       return new Date(date).toLocaleDateString("en-US", options);
  //     }

  //     // FIRST PAGE - Cover page with improved layout
  //     await addLogo(pdf);

  //     // Add title with better typography
  //     pdf.setFontSize(22);
  //     pdf.setTextColor(...hexToRgb(primaryColor));
  //     pdf.setFont(headingFont, "bold");
  //     pdf.text("Influenza Analysis Report", margin, 40);

  //     // Add subtitle with better spacing
  //     pdf.setFontSize(14);
  //     pdf.setTextColor(...hexToRgb(textColor));
  //     pdf.setFont(headingFont, "normal");
  //     const today = formatDate(new Date());
  //     pdf.text(`California Weekly Data Analysis`, margin, 50);
  //     pdf.text(`Report Date: ${today}`, margin, 58);

  //     // Add document information box with improved styling
  //     const boxY = 68;
  //     const boxHeight = 30;
  //     pdf.setFillColor(...hexToRgb(lightGrayBg));
  //     pdf.setDrawColor(200, 200, 200);
  //     pdf.roundedRect(margin, boxY, contentWidth, boxHeight, 3, 3, "FD");

  //     // Add document info content with better formatting
  //     pdf.setFontSize(9);
  //     pdf.setTextColor(...hexToRgb(textColor));
  //     pdf.setFont(bodyFont, "normal");

  //     pdf.text("Prepared by: HLP Health Analytics", margin + 5, boxY + 10);
  //     pdf.text("Distribution: Internal Use Only", margin + 5, boxY + 18);
  //     pdf.text("Classification: Confidential", margin + 5, boxY + 26);

  //     pdf.text("Data Source:", pdfWidth / 2, boxY + 10);
  //     pdf.text("CDC & HLP Research", pdfWidth / 2, boxY + 18);

  //     // Add data visualization section
  //     let currentPosition = boxY + boxHeight + 15;

  //     // Capture charts with better error handling
  //     const chartImages = await captureChartsAsImages();

  //     // Add first chart with better positioning
  //     if (chartImages.length > 0) {
  //       const chart = chartImages[0];

  //       // Calculate image dimensions with proper aspect ratio
  //       const imgWidth = contentWidth;
  //       const imgHeight = (chart.height / chart.width) * imgWidth;

  //       // Check if chart fits on current page
  //       if (currentPosition + imgHeight + 30 < pdfHeight - 20) {
  //         // Don't add static text for visualization
  //         pdf.setFontSize(12);
  //         pdf.setTextColor(...hexToRgb(primaryColor));
  //         pdf.setFont(headingFont, "bold");
  //         pdf.text("Data Visualization", margin, currentPosition);
  //         currentPosition += 8;

  //         // Add image with proper spacing
  //         pdf.addImage(
  //           chart.data,
  //           "PNG",
  //           margin,
  //           currentPosition + 5,
  //           imgWidth,
  //           imgHeight
  //         );

  //         currentPosition = currentPosition + imgHeight + 15;
  //       }
  //     }

  //     addFooter(pdf);

  //     // SECOND PAGE - Analysis with improved layout
  //     pdf.addPage();
  //     addHeader(pdf, "Analysis & Findings");
  //     addWatermark(pdf);

  //     // Add executive summary with better positioning
  //     currentPosition = 35;
  //     currentPosition = addExecutiveSummary(pdf, summary, currentPosition);

  //     // Extract bullet points from the API summary response
  //     const summaryBulletPoints = extractBulletPoints(summary);

  //     // Create sections directly from API response without any static content

  //     // Process the summary text to create the sections
  //     const paragraphs = summary
  //       .split("\n\n")
  //       .filter((p) => p.trim().length > 0);

  //     // Add observations section using the API response directly
  //     if (paragraphs.length > 0) {
  //       currentPosition = addSection(
  //         pdf,
  //         "Observations",
  //         paragraphs[0],
  //         currentPosition
  //       );
  //     }

  //     // Add data patterns section using only API content
  //     if (summaryBulletPoints.length > 0) {
  //       currentPosition = addSection(
  //         pdf,
  //         "Data Patterns",
  //         summaryBulletPoints,
  //         currentPosition
  //       );
  //     }

  //     // Add second chart if available, without added text
  //     if (chartImages.length > 1) {
  //       const chart = chartImages[1];

  //       // Check if we need a new page
  //       if (currentPosition + 120 > pdfHeight - 20) {
  //         pdf.addPage();
  //         addHeader(pdf);
  //         currentPosition = 40;
  //       } else {
  //         // Add proper spacing
  //         currentPosition += 15;
  //       }

  //       // Calculate image dimensions with proper aspect ratio
  //       const imgWidth = contentWidth;
  //       const imgHeight = (chart.height / chart.width) * imgWidth;

  //       // Add image with proper spacing
  //       pdf.addImage(
  //         chart.data,
  //         "PNG",
  //         margin,
  //         currentPosition,
  //         imgWidth,
  //         imgHeight
  //       );

  //       currentPosition += imgHeight + 10;
  //     }

  //     addFooter(pdf);

  //     // Save the PDF with quality settings
  //     pdf.save("influenza-analysis-report.pdf");

  //     return true;
  //   } catch (error) {
  //     console.error("Error generating PDF:", error);
  //     setError(`PDF Generation Error: ${error.message}`);
  //     setShowErrorPopup(true);
  //     return false;
  //   } finally {
  //     setIsGenerating(false);
  //   }
  // };

  // const generatePDF = async () => {
  //   setIsGenerating(true);

  //   try {
  //     // Generate the summary before creating the PDF
  //     const summary = await generateSummary();
  //     console.log("Summary:", summary);

  //     if (!summary) {
  //       throw new Error("Failed to generate report summary");
  //     }

  //     // Initialize PDF with better quality settings
  //     const pdf = new jsPDF({
  //       orientation: "portrait",
  //       unit: "mm",
  //       format: "a4",
  //       compress: true,
  //     });

  //     // Calculate PDF dimensions
  //     const pdfWidth = pdf.internal.pageSize.getWidth();
  //     const pdfHeight = pdf.internal.pageSize.getHeight();
  //     const margin = 15;
  //     const contentWidth = pdfWidth - margin * 2;

  //     // Set document metadata
  //     pdf.setProperties({
  //       title: "Influenza Analysis Report",
  //       author: "HLP Health Analytics",
  //       subject: "California Influenza Surveillance",
  //       keywords: "influenza, healthcare, analysis, California",
  //       creator: "HLP Health Analytics Platform",
  //     });

  //     // Define colors for a more professional look
  //     const primaryColor = "#0C1E46"; // Dark blue
  //     const accentColor = "#A0171C"; // Red
  //     const textColor = "#333333"; // Dark gray
  //     const lightGrayBg = "#F8F9FA"; // Light gray background
  //     const headingFont = "helvetica";
  //     const bodyFont = "helvetica";

  //     // Logo dimensions
  //     const logoWidth = 45;
  //     const logoHeight = 14;

  //     // SVG Logo (same as before)
  //     const svgLogo = `
  //       <svg baseProfile="tiny" height="125" version="1.2" width="249" xmlns="http://www.w3.org/2000/svg" xmlns:ev="http://www.w3.org/2001/xml-events" xmlns:xlink="http://www.w3.org/1999/xlink"><defs /><path d="M 69,74 68,75 67,75 66,76 66,81 68,83 72,83 73,82 74,82 74,80 75,79 75,78 74,77 74,76 72,74 Z" fill="#A0171C" stroke="none" /><path d="M 26,58 25,59 24,59 22,61 22,65 24,67 29,67 30,66 31,66 31,65 32,64 32,62 31,61 31,60 30,59 29,59 28,58 Z" fill="#A0171C" stroke="none" /><path d="M 99,51 96,54 96,57 97,58 97,59 98,60 103,60 105,58 105,54 104,53 104,52 103,52 102,51 Z" fill="#A0171C" stroke="none" /><path d="M 202,42 202,83 209,83 209,70 210,69 225,69 226,68 227,68 228,67 229,67 232,64 232,63 233,62 233,60 234,59 234,52 233,51 233,49 232,48 232,47 230,45 229,45 227,43 223,43 222,42 Z" fill="#0C1E46" stroke="none" /><path d="M 169,42 169,83 196,83 196,78 176,78 175,77 175,42 Z" fill="#0C1E46" stroke="none" /><path d="M 126,42 125,43 125,83 132,83 132,66 133,65 153,65 154,66 154,83 161,83 161,42 155,42 154,43 154,59 153,60 133,60 132,59 132,42 Z" fill="#0C1E46" stroke="none" /><path d="M 112,42 112,69 118,69 119,68 119,43 118,42 Z" fill="#A0171C" stroke="none" /><path d="M 83,42 83,83 89,83 89,42 Z" fill="#A0171C" stroke="none" /><path d="M 53,42 52,43 52,83 59,83 59,42 Z" fill="#A0171C" stroke="none" /><path d="M 40,42 39,43 39,83 46,83 46,42 Z" fill="#A0171C" stroke="none" /><path d="M 8,42 8,83 15,83 15,43 14,42 Z" fill="#A0171C" stroke="none" /></svg>
  //     `;

  //     // Improved summary parsing functions
  //     const parseSummary = (summaryText) => {
  //       // Initialize the structure to hold parsed sections
  //       const parsedSummary = {
  //         mainText: "",
  //         sections: [],
  //       };

  //       // Check if the summary starts with "Summary:" and remove it
  //       let cleanText = summaryText;
  //       if (cleanText.startsWith("Summary:")) {
  //         cleanText = cleanText.substring("Summary:".length).trim();
  //       }

  //       // Extract main text (if any) before the first bullet point section
  //       const firstBulletIndex = cleanText.indexOf("- **");
  //       if (firstBulletIndex > 0) {
  //         parsedSummary.mainText = cleanText
  //           .substring(0, firstBulletIndex)
  //           .trim();
  //       }

  //       // Regular expression to find section headers (bold text with **)
  //       const sectionHeaderRegex = /- \*\*(.*?):\*\*/g;
  //       const sectionMatches = [...cleanText.matchAll(sectionHeaderRegex)];

  //       if (sectionMatches.length > 0) {
  //         // Extract each section with its bullet points
  //         for (let i = 0; i < sectionMatches.length; i++) {
  //           const currentMatch = sectionMatches[i];
  //           const sectionTitle = currentMatch[1];
  //           const startIndex = currentMatch.index;

  //           // Determine end index (either next section or end of text)
  //           const endIndex =
  //             i < sectionMatches.length - 1
  //               ? sectionMatches[i + 1].index
  //               : cleanText.length;

  //           // Extract section content
  //           let sectionContent = cleanText
  //             .substring(startIndex, endIndex)
  //             .trim();

  //           // Remove the section title from the content
  //           sectionContent = sectionContent
  //             .substring(sectionContent.indexOf(":**") + 3)
  //             .trim();

  //           // Extract bullet points
  //           const bulletPoints = [];
  //           const bulletRegex = /\s+-\s+(.*?)(?=\s+-\s+|$)/gs;
  //           const bulletMatches = [...sectionContent.matchAll(bulletRegex)];

  //           if (bulletMatches.length > 0) {
  //             bulletMatches.forEach((match) => {
  //               bulletPoints.push(match[1].trim());
  //             });
  //           } else {
  //             // If no bullet points found, add the whole section as one bullet
  //             bulletPoints.push(sectionContent);
  //           }

  //           parsedSummary.sections.push({
  //             title: sectionTitle,
  //             bullets: bulletPoints,
  //           });
  //         }
  //       } else {
  //         // Fallback: If no sections with bold titles, use empty lines as separators
  //         const paragraphs = cleanText
  //           .split("\n\n")
  //           .filter((p) => p.trim().length > 0);

  //         if (paragraphs.length > 0) {
  //           parsedSummary.mainText = paragraphs[0];

  //           if (paragraphs.length > 1) {
  //             // Extract bullet points from remaining paragraphs
  //             for (let i = 1; i < paragraphs.length; i++) {
  //               const bulletPoints = extractBulletPoints(paragraphs[i]);
  //               parsedSummary.sections.push({
  //                 title: `Key Point ${i}`,
  //                 bullets:
  //                   bulletPoints.length > 0 ? bulletPoints : [paragraphs[i]],
  //               });
  //             }
  //           }
  //         }
  //       }

  //       return parsedSummary;
  //     };

  //     // Helper function to extract bullet points from summary text
  //     const extractBulletPoints = (text) => {
  //       // Look for bullet points in the text (• or - or * followed by text)
  //       const bulletRegex = /[•\-\*]\s*([^\n•\-\*]+)/g;
  //       const matches = [...text.matchAll(bulletRegex)];

  //       if (matches.length > 0) {
  //         // Return extracted bullet points
  //         return matches.map((match) => match[1].trim());
  //       } else {
  //         // If no bullet points found, split by sentences and create bullets
  //         const sentences = text
  //           .split(/\.(?:\s|$)/)
  //           .filter((s) => s.trim().length > 0);
  //         return sentences.map((s) => s.trim());
  //       }
  //     };

  //     const addWatermark = (pdf) => {
  //       pdf.saveGraphicsState();
  //       pdf.setGState(new pdf.GState({ opacity: 0.05 }));
  //       pdf.setFontSize(60);
  //       pdf.setTextColor(100, 100, 100);
  //       pdf.setFont(headingFont, "bold");
  //       pdf.restoreGraphicsState();
  //     };

  //     // Improved header with cleaner design
  //     const addHeader = (pdf, pageTitle = "") => {
  //       // Draw header bar
  //       pdf.setFillColor(...hexToRgb(primaryColor));
  //       pdf.rect(0, 0, pdfWidth, 12, "F");

  //       // Add header text
  //       pdf.setFontSize(8);
  //       pdf.setTextColor(255, 255, 255);
  //       pdf.setFont(bodyFont, "normal");

  //       const reportTitle = "Influenza Analysis Report";
  //       const dateText = "Generated on " + new Date().toLocaleDateString();

  //       pdf.text(reportTitle, margin, 8);
  //       pdf.text(dateText, pdfWidth - margin, 8, { align: "right" });

  //       // Add subtitle if provided
  //       if (pageTitle) {
  //         pdf.setFontSize(14);
  //         pdf.setTextColor(...hexToRgb(accentColor));
  //         pdf.setFont(headingFont, "bold");
  //         pdf.text(pageTitle, margin, 24);

  //         // Add subtle underline
  //         pdf.setDrawColor(...hexToRgb(accentColor));
  //         pdf.setLineWidth(0.5);
  //         pdf.line(margin, 26, margin + 50, 26);
  //       }
  //     };

  //     // Improved footer with cleaner design
  //     const addFooter = (pdf) => {
  //       // Draw footer bar
  //       pdf.setFillColor(...hexToRgb(primaryColor));
  //       pdf.rect(0, pdfHeight - 10, pdfWidth, 10, "F");

  //       // Add footer text
  //       pdf.setFontSize(7);
  //       pdf.setTextColor(255, 255, 255);
  //       pdf.setFont(bodyFont, "normal");

  //       const pageNumber = pdf.internal.getNumberOfPages();
  //       const footerText = "Confidential - For Internal Use Only";

  //       pdf.text(footerText, margin, pdfHeight - 4);
  //       pdf.text(`Page ${pageNumber}`, pdfWidth - margin, pdfHeight - 4, {
  //         align: "right",
  //       });
  //     };

  //     // Add logo with proper positioning
  //     const addLogo = async (pdf) => {
  //       const svgBlob = new Blob([svgLogo], { type: "image/svg+xml" });
  //       const url = URL.createObjectURL(svgBlob);

  //       return new Promise((resolve) => {
  //         const img = new Image();
  //         img.onload = () => {
  //           const canvas = document.createElement("canvas");
  //           canvas.width = img.width;
  //           canvas.height = img.height;
  //           const ctx = canvas.getContext("2d");
  //           ctx.drawImage(img, 0, 0);
  //           const dataUrl = canvas.toDataURL("image/png");
  //           pdf.addImage(dataUrl, "PNG", margin, 20, logoWidth, logoHeight);
  //           URL.revokeObjectURL(url);
  //           resolve();
  //         };
  //         img.src = url;
  //       });
  //     };

  //     // Improved section layout with better spacing and typography
  //     const addSection = (pdf, title, content, yPosition) => {
  //       // Add section title
  //       pdf.setFontSize(12);
  //       pdf.setTextColor(...hexToRgb(primaryColor));
  //       pdf.setFont(headingFont, "bold");
  //       pdf.text(title, margin, yPosition);

  //       // Add horizontal line
  //       const lineY = yPosition + 2;
  //       pdf.setDrawColor(220, 220, 220);
  //       pdf.setLineWidth(0.3);
  //       pdf.line(margin, lineY, pdfWidth - margin, lineY);

  //       // Add content with better spacing
  //       pdf.setFontSize(10);
  //       pdf.setTextColor(...hexToRgb(textColor));
  //       pdf.setFont(bodyFont, "normal");
  //       const contentY = yPosition + 8;

  //       // Handle array or string with proper spacing
  //       if (Array.isArray(content)) {
  //         let y = contentY;
  //         content.forEach((line) => {
  //           pdf.text(`• ${line}`, margin, y);
  //           y += 5; // Better line spacing for readability
  //         });
  //         return y + 5; // Return new Y position with padding
  //       } else {
  //         // Split text to fit width
  //         const splitText = pdf.splitTextToSize(content, contentWidth);
  //         pdf.text(splitText, margin, contentY);
  //         return contentY + splitText.length * 5 + 5; // Better line spacing
  //       }
  //     };

  //     // Improved executive summary with better typography and fact-based content
  //     const addExecutiveSummary = (pdf, summaryData, yPosition) => {
  //       const title = "Executive Summary";

  //       // Add title
  //       pdf.setFontSize(14);
  //       pdf.setTextColor(...hexToRgb(accentColor));
  //       pdf.setFont(headingFont, "bold");
  //       pdf.text(title, margin, yPosition);

  //       // Add underline
  //       pdf.setDrawColor(...hexToRgb(accentColor));
  //       pdf.setLineWidth(0.5);
  //       pdf.line(margin, yPosition + 2, margin + 40, yPosition + 2);

  //       // Add disclaimer about factual reporting
  //       pdf.setFontSize(7);
  //       pdf.setTextColor(100, 100, 100);
  //       pdf.setFont(bodyFont, "italic");
  //       pdf.text(
  //         "This summary contains observed data patterns without interpretation or speculation.",
  //         margin,
  //         yPosition + 5
  //       );

  //       // Add light background for executive summary
  //       pdf.setFillColor(...hexToRgb(lightGrayBg));

  //       let currentY = yPosition + 10;

  //       // If there's main text, add it first
  //       if (summaryData.mainText) {
  //         const splitText = pdf.splitTextToSize(
  //           summaryData.mainText,
  //           contentWidth
  //         );

  //         const boxHeight = splitText.length * 5 + 10;
  //         pdf.roundedRect(
  //           margin - 2,
  //           currentY,
  //           contentWidth + 4,
  //           boxHeight,
  //           2,
  //           2,
  //           "F"
  //         );

  //         pdf.setFontSize(10);
  //         pdf.setTextColor(...hexToRgb(textColor));
  //         pdf.setFont(bodyFont, "normal");
  //         pdf.text(splitText, margin, currentY + 5);

  //         currentY += boxHeight + 10;
  //       }

  //       return currentY;
  //     };

  //     // New function to add summary sections with proper formatting
  //     const addSummarySections = (pdf, sections, yPosition) => {
  //       let currentY = yPosition;

  //       sections.forEach((section, index) => {
  //         // Check if we need a new page
  //         if (currentY + 50 > pdfHeight - 20) {
  //           pdf.addPage();
  //           addHeader(pdf);
  //           addFooter(pdf);
  //           currentY = 30;
  //         }

  //         // Add section title
  //         pdf.setFontSize(12);
  //         pdf.setTextColor(...hexToRgb(primaryColor));
  //         pdf.setFont(headingFont, "bold");
  //         pdf.text(section.title, margin, currentY);

  //         // Add horizontal line
  //         pdf.setDrawColor(...hexToRgb(accentColor));
  //         pdf.setLineWidth(0.3);
  //         pdf.line(
  //           margin,
  //           currentY + 2,
  //           margin + contentWidth * 0.8,
  //           currentY + 2
  //         );

  //         currentY += 8;

  //         // Add bullet points
  //         pdf.setFontSize(10);
  //         pdf.setTextColor(...hexToRgb(textColor));
  //         pdf.setFont(bodyFont, "normal");

  //         section.bullets.forEach((bullet) => {
  //           // Split long bullet points
  //           const splitText = pdf.splitTextToSize(
  //             `• ${bullet}`,
  //             contentWidth - 4
  //           );

  //           // Check if we need a new page
  //           if (currentY + splitText.length * 5 > pdfHeight - 20) {
  //             pdf.addPage();
  //             addHeader(pdf);
  //             addFooter(pdf);
  //             currentY = 30;
  //           }

  //           pdf.text(splitText, margin, currentY);
  //           currentY += splitText.length * 5 + 3;
  //         });

  //         currentY += 8; // Add spacing between sections
  //       });

  //       return currentY;
  //     };

  //     // Hex to RGB conversion helper
  //     function hexToRgb(hex) {
  //       hex = hex.replace(/^#/, "");
  //       const bigint = parseInt(hex, 16);
  //       const r = (bigint >> 16) & 255;
  //       const g = (bigint >> 8) & 255;
  //       const b = bigint & 255;
  //       return [r, g, b];
  //     }

  //     // Helper function to format date
  //     function formatDate(date) {
  //       const options = { year: "numeric", month: "long", day: "numeric" };
  //       return new Date(date).toLocaleDateString("en-US", options);
  //     }

  //     // FIRST PAGE - Cover page with improved layout
  //     await addLogo(pdf);

  //     // Add title with better typography
  //     pdf.setFontSize(22);
  //     pdf.setTextColor(...hexToRgb(primaryColor));
  //     pdf.setFont(headingFont, "bold");
  //     pdf.text("Influenza Analysis Report", margin, 40);

  //     // Add subtitle with better spacing
  //     pdf.setFontSize(14);
  //     pdf.setTextColor(...hexToRgb(textColor));
  //     pdf.setFont(headingFont, "normal");
  //     const today = formatDate(new Date());
  //     pdf.text(`California Weekly Data Analysis`, margin, 50);
  //     pdf.text(`Report Date: ${today}`, margin, 58);

  //     // Add document information box with improved styling
  //     const boxY = 68;
  //     const boxHeight = 30;
  //     pdf.setFillColor(...hexToRgb(lightGrayBg));
  //     pdf.setDrawColor(200, 200, 200);
  //     pdf.roundedRect(margin, boxY, contentWidth, boxHeight, 3, 3, "FD");

  //     // Add document info content with better formatting
  //     pdf.setFontSize(9);
  //     pdf.setTextColor(...hexToRgb(textColor));
  //     pdf.setFont(bodyFont, "normal");

  //     pdf.text("Prepared by: HLP Health Analytics", margin + 5, boxY + 10);
  //     pdf.text("Distribution: Internal Use Only", margin + 5, boxY + 18);
  //     pdf.text("Classification: Confidential", margin + 5, boxY + 26);

  //     pdf.text("Data Source:", pdfWidth / 2, boxY + 10);
  //     pdf.text("CDC & HLP Research", pdfWidth / 2, boxY + 18);

  //     // Parse the summary properly
  //     const parsedSummary = parseSummary(summary);

  //     // Add data visualization section
  //     let currentPosition = boxY + boxHeight + 15;

  //     // Capture charts with better error handling
  //     const chartImages = await captureChartsAsImages();

  //     // Add first chart with better positioning
  //     if (chartImages.length > 0) {
  //       const chart = chartImages[0];

  //       // Calculate image dimensions with proper aspect ratio
  //       const imgWidth = contentWidth;
  //       const imgHeight = (chart.height / chart.width) * imgWidth;

  //       // Check if chart fits on current page
  //       if (currentPosition + imgHeight + 30 < pdfHeight - 20) {
  //         // Add section title for visualization
  //         pdf.setFontSize(12);
  //         pdf.setTextColor(...hexToRgb(primaryColor));
  //         pdf.setFont(headingFont, "bold");
  //         pdf.text("Data Visualization", margin, currentPosition);
  //         currentPosition += 8;

  //         // Add image with proper spacing
  //         pdf.addImage(
  //           chart.data,
  //           "PNG",
  //           margin,
  //           currentPosition + 5,
  //           imgWidth,
  //           imgHeight
  //         );

  //         currentPosition = currentPosition + imgHeight + 15;
  //       }
  //     }

  //     addFooter(pdf);

  //     // SECOND PAGE - Analysis with improved layout
  //     pdf.addPage();
  //     addHeader(pdf, "Analysis & Findings");
  //     addWatermark(pdf);

  //     // Add executive summary with better positioning
  //     currentPosition = 35;
  //     currentPosition = addExecutiveSummary(
  //       pdf,
  //       parsedSummary,
  //       currentPosition
  //     );

  //     // Add summary sections with the parsed data
  //     currentPosition = addSummarySections(
  //       pdf,
  //       parsedSummary.sections,
  //       currentPosition
  //     );

  //     // Add second chart if available
  //     if (chartImages.length > 1) {
  //       const chart = chartImages[1];

  //       // Check if we need a new page
  //       if (currentPosition + 120 > pdfHeight - 20) {
  //         pdf.addPage();
  //         addHeader(pdf, "Additional Visualizations");
  //         addFooter(pdf);
  //         currentPosition = 40;
  //       } else {
  //         // Add proper spacing
  //         currentPosition += 15;
  //       }

  //       // Add section title for visualization
  //       pdf.setFontSize(12);
  //       pdf.setTextColor(...hexToRgb(primaryColor));
  //       pdf.setFont(headingFont, "bold");
  //       pdf.text("Supporting Data", margin, currentPosition);
  //       currentPosition += 8;

  //       // Calculate image dimensions with proper aspect ratio
  //       const imgWidth = contentWidth;
  //       const imgHeight = (chart.height / chart.width) * imgWidth;

  //       // Add image with proper spacing
  //       pdf.addImage(
  //         chart.data,
  //         "PNG",
  //         margin,
  //         currentPosition,
  //         imgWidth,
  //         imgHeight
  //       );

  //       currentPosition += imgHeight + 10;
  //     }

  //     addFooter(pdf);

  //     // Save the PDF with quality settings
  //     pdf.save("influenza-analysis-report.pdf");

  //     return true;
  //   } catch (error) {
  //     console.error("Error generating PDF:", error);
  //     setError(`PDF Generation Error: ${error.message}`);
  //     setShowErrorPopup(true);
  //     return false;
  //   } finally {
  //     setIsGenerating(false);
  //   }
  // };

  // const generatePDF = async () => {
  //   setIsGenerating(true);

  //   try {
  //     // Generate the summary before creating the PDF
  //     const summary = await generateSummary();
  //     console.log("Summary:", summary);

  //     if (!summary) {
  //       throw new Error("Failed to generate report summary");
  //     }

  //     // Initialize PDF with better quality settings
  //     const pdf = new jsPDF({
  //       orientation: "portrait",
  //       unit: "mm",
  //       format: "a4",
  //       compress: true,
  //     });

  //     // Calculate PDF dimensions
  //     const pdfWidth = pdf.internal.pageSize.getWidth();
  //     const pdfHeight = pdf.internal.pageSize.getHeight();
  //     const margin = 15;
  //     const contentWidth = pdfWidth - margin * 2;

  //     // Set document metadata - using generic information
  //     pdf.setProperties({
  //       title: "Influenza Analysis Report",
  //       subject: "Influenza Surveillance",
  //       keywords: "influenza, healthcare, analysis",
  //     });

  //     // Define colors for a more professional look
  //     const primaryColor = "#0C1E46"; // Dark blue
  //     const accentColor = "#A0171C"; // Red
  //     const textColor = "#333333"; // Dark gray
  //     const lightGrayBg = "#F8F9FA"; // Light gray background
  //     const headingFont = "helvetica";
  //     const bodyFont = "helvetica";

  //     // Logo dimensions
  //     const logoWidth = 45;
  //     const logoHeight = 14;

  //     // SVG Logo
  //     const svgLogo = `
  //       <svg baseProfile="tiny" height="125" version="1.2" width="249" xmlns="http://www.w3.org/2000/svg" xmlns:ev="http://www.w3.org/2001/xml-events" xmlns:xlink="http://www.w3.org/1999/xlink"><defs /><path d="M 69,74 68,75 67,75 66,76 66,81 68,83 72,83 73,82 74,82 74,80 75,79 75,78 74,77 74,76 72,74 Z" fill="#A0171C" stroke="none" /><path d="M 26,58 25,59 24,59 22,61 22,65 24,67 29,67 30,66 31,66 31,65 32,64 32,62 31,61 31,60 30,59 29,59 28,58 Z" fill="#A0171C" stroke="none" /><path d="M 99,51 96,54 96,57 97,58 97,59 98,60 103,60 105,58 105,54 104,53 104,52 103,52 102,51 Z" fill="#A0171C" stroke="none" /><path d="M 202,42 202,83 209,83 209,70 210,69 225,69 226,68 227,68 228,67 229,67 232,64 232,63 233,62 233,60 234,59 234,52 233,51 233,49 232,48 232,47 230,45 229,45 227,43 223,43 222,42 Z" fill="#0C1E46" stroke="none" /><path d="M 169,42 169,83 196,83 196,78 176,78 175,77 175,42 Z" fill="#0C1E46" stroke="none" /><path d="M 126,42 125,43 125,83 132,83 132,66 133,65 153,65 154,66 154,83 161,83 161,42 155,42 154,43 154,59 153,60 133,60 132,59 132,42 Z" fill="#0C1E46" stroke="none" /><path d="M 112,42 112,69 118,69 119,68 119,43 118,42 Z" fill="#A0171C" stroke="none" /><path d="M 83,42 83,83 89,83 89,42 Z" fill="#A0171C" stroke="none" /><path d="M 53,42 52,43 52,83 59,83 59,42 Z" fill="#A0171C" stroke="none" /><path d="M 40,42 39,43 39,83 46,83 46,42 Z" fill="#A0171C" stroke="none" /><path d="M 8,42 8,83 15,83 15,43 14,42 Z" fill="#A0171C" stroke="none" /></svg>
  //     `;

  //     // Enhanced summary parsing function with better handling of sections and bullet points
  //     const parseSummary = (summaryText) => {
  //       // Initialize the structure to hold parsed sections
  //       const parsedSummary = {
  //         mainText: "",
  //         sections: [],
  //       };

  //       // Check for Korean characters and determine if we need to translate
  //       const hasKoreanText =
  //         /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7A3]/.test(
  //           summaryText
  //         );

  //       // Clean up the summary text and remove language prefixes
  //       let cleanText = summaryText;

  //       // Remove "Summary:" prefix if present
  //       if (cleanText.startsWith("Summary:")) {
  //         cleanText = cleanText.substring("Summary:".length).trim();
  //       }

  //       // Remove Korean language indicators if present
  //       if (hasKoreanText && cleanText.includes("여기서 Summary:")) {
  //         const koreanPrefixIndex = cleanText.indexOf("여기서 Summary:");
  //         cleanText = cleanText
  //           .substring(koreanPrefixIndex + "여기서 Summary:".length)
  //           .trim();
  //       }

  //       // Extract main text (if any) before the first bold section header
  //       const firstBoldSectionIndex = cleanText.indexOf("- **");
  //       if (firstBoldSectionIndex > 0) {
  //         parsedSummary.mainText = cleanText
  //           .substring(0, firstBoldSectionIndex)
  //           .trim();
  //       } else if (firstBoldSectionIndex === -1) {
  //         // If no bold sections, use the first paragraph as main text
  //         const paragraphs = cleanText
  //           .split("\n\n")
  //           .filter((p) => p.trim().length > 0);
  //         if (paragraphs.length > 0) {
  //           parsedSummary.mainText = paragraphs[0];
  //         }
  //       }

  //       // Extract sections using bold headers - comprehensive approach
  //       // This regex matches sections marked with bold markers '**'
  //       const sectionRegex = /- \*\*(.*?):\*\*([\s\S]*?)(?=- \*\*|$)/g;
  //       let sectionMatch;

  //       while ((sectionMatch = sectionRegex.exec(cleanText)) !== null) {
  //         const sectionTitle = sectionMatch[1].trim();
  //         const sectionContent = sectionMatch[2].trim();

  //         // Extract bullet points from the section content
  //         const bullets = [];

  //         // Look for bullet points (lines starting with -)
  //         const bulletLines = sectionContent
  //           .split("\n")
  //           .map((line) => line.trim())
  //           .filter((line) => line.startsWith("-"));

  //         if (bulletLines.length > 0) {
  //           // Process each bullet point
  //           bulletLines.forEach((bulletLine) => {
  //             // Remove the bullet marker and trim
  //             const bulletText = bulletLine.substring(1).trim();
  //             if (bulletText) {
  //               bullets.push(bulletText);
  //             }
  //           });
  //         } else {
  //           // If no explicit bullet points found, treat the whole content as one point
  //           bullets.push(sectionContent);
  //         }

  //         // Add the section with its bullets
  //         parsedSummary.sections.push({
  //           title: sectionTitle,
  //           bullets: bullets,
  //         });
  //       }

  //       // If no sections were found using the bold pattern, try fallback methods
  //       if (parsedSummary.sections.length === 0) {
  //         // Try to identify sections by line breaks and indentation patterns
  //         const lines = cleanText
  //           .split("\n")
  //           .map((line) => line.trim())
  //           .filter((line) => line.length > 0);

  //         let currentSection = null;
  //         let currentBullets = [];

  //         lines.forEach((line) => {
  //           // Check if this line looks like a section header (ends with a colon)
  //           if (line.endsWith(":") && !line.startsWith("-")) {
  //             // If we have a previous section, save it
  //             if (currentSection) {
  //               parsedSummary.sections.push({
  //                 title: currentSection,
  //                 bullets: currentBullets,
  //               });
  //             }

  //             // Start a new section
  //             currentSection = line.substring(0, line.length - 1).trim();
  //             currentBullets = [];
  //           }
  //           // Check if this line is a bullet point
  //           else if (line.startsWith("-")) {
  //             // If we don't have a current section, create a generic one
  //             if (!currentSection) {
  //               currentSection = "Key Findings";
  //             }

  //             const bulletText = line.substring(1).trim();
  //             if (bulletText) {
  //               currentBullets.push(bulletText);
  //             }
  //           }
  //         });

  //         // Add the last section if there is one
  //         if (currentSection && currentBullets.length > 0) {
  //           parsedSummary.sections.push({
  //             title: currentSection,
  //             bullets: currentBullets,
  //           });
  //         }
  //       }

  //       // If we still have no sections, create a fallback from the whole text
  //       if (
  //         parsedSummary.sections.length === 0 &&
  //         cleanText.trim().length > 0
  //       ) {
  //         const bullets = extractBulletPoints(cleanText);

  //         parsedSummary.sections.push({
  //           title: "Key Findings",
  //           bullets: bullets.length > 0 ? bullets : [cleanText.trim()],
  //         });
  //       }

  //       return parsedSummary;
  //     };

  //     // Helper function to extract bullet points from text
  //     const extractBulletPoints = (text) => {
  //       // First try to find explicit bullet markers
  //       const bulletRegex = /(?:^|\n)\s*[-•*]\s*([^\n]+)/g;
  //       const matches = [...text.matchAll(bulletRegex)];

  //       if (matches.length > 0) {
  //         return matches.map((match) => match[1].trim());
  //       }

  //       // If no bullets found, try splitting by sentences for natural bullets
  //       const sentences = text
  //         .split(/\.(?:\s|$)/)
  //         .map((s) => s.trim())
  //         .filter((s) => s.length > 0);

  //       return sentences;
  //     };

  //     // Function to add watermark
  //     const addWatermark = (pdf) => {
  //       pdf.saveGraphicsState();
  //       pdf.setGState(new pdf.GState({ opacity: 0.05 }));
  //       pdf.setFontSize(60);
  //       pdf.setTextColor(100, 100, 100);
  //       pdf.setFont(headingFont, "bold");
  //       pdf.restoreGraphicsState();
  //     };

  //     // Improved header with cleaner design
  //     const addHeader = (pdf, pageTitle = "") => {
  //       // Draw header bar
  //       pdf.setFillColor(...hexToRgb(primaryColor));
  //       pdf.rect(0, 0, pdfWidth, 12, "F");

  //       // Add header text
  //       pdf.setFontSize(8);
  //       pdf.setTextColor(255, 255, 255);
  //       pdf.setFont(bodyFont, "normal");

  //       const reportTitle = "Influenza Analysis Report";
  //       const dateText = "Generated on " + new Date().toLocaleDateString();

  //       pdf.text(reportTitle, margin, 8);
  //       pdf.text(dateText, pdfWidth - margin, 8, { align: "right" });

  //       // Add subtitle if provided
  //       if (pageTitle) {
  //         pdf.setFontSize(14);
  //         pdf.setTextColor(...hexToRgb(accentColor));
  //         pdf.setFont(headingFont, "bold");
  //         pdf.text(pageTitle, margin, 24);

  //         // Add subtle underline
  //         pdf.setDrawColor(...hexToRgb(accentColor));
  //         pdf.setLineWidth(0.5);
  //         pdf.line(
  //           margin,
  //           26,
  //           margin +
  //             Math.min(
  //               50,
  //               (pdf.getStringUnitWidth(pageTitle) * 14) /
  //                 pdf.internal.scaleFactor
  //             ),
  //           26
  //         );
  //       }
  //     };

  //     // Improved footer with cleaner design
  //     const addFooter = (pdf) => {
  //       // Draw footer bar
  //       pdf.setFillColor(...hexToRgb(primaryColor));
  //       pdf.rect(0, pdfHeight - 10, pdfWidth, 10, "F");

  //       // Add footer text
  //       pdf.setFontSize(7);
  //       pdf.setTextColor(255, 255, 255);
  //       pdf.setFont(bodyFont, "normal");

  //       const pageNumber = pdf.internal.getNumberOfPages();

  //       // Using a more generic footer without confidentiality markings
  //       pdf.text(`Page ${pageNumber}`, pdfWidth - margin, pdfHeight - 4, {
  //         align: "right",
  //       });
  //     };

  //     // Add logo with proper positioning
  //     const addLogo = async (pdf) => {
  //       const svgBlob = new Blob([svgLogo], { type: "image/svg+xml" });
  //       const url = URL.createObjectURL(svgBlob);

  //       return new Promise((resolve) => {
  //         const img = new Image();
  //         img.onload = () => {
  //           const canvas = document.createElement("canvas");
  //           canvas.width = img.width;
  //           canvas.height = img.height;
  //           const ctx = canvas.getContext("2d");
  //           ctx.drawImage(img, 0, 0);
  //           const dataUrl = canvas.toDataURL("image/png");
  //           pdf.addImage(dataUrl, "PNG", margin, 20, logoWidth, logoHeight);
  //           URL.revokeObjectURL(url);
  //           resolve();
  //         };
  //         img.src = url;
  //       });
  //     };

  //     // Improved section layout with better spacing and typography
  //     const addSection = (pdf, title, content, yPosition) => {
  //       // Check if we need a new page
  //       if (yPosition + 30 > pdfHeight - 20) {
  //         pdf.addPage();
  //         addHeader(pdf);
  //         addFooter(pdf);
  //         yPosition = 30;
  //       }

  //       // Add section title
  //       pdf.setFontSize(12);
  //       pdf.setTextColor(...hexToRgb(primaryColor));
  //       pdf.setFont(headingFont, "bold");
  //       pdf.text(title, margin, yPosition);

  //       // Add horizontal line
  //       const lineY = yPosition + 2;
  //       pdf.setDrawColor(220, 220, 220);
  //       pdf.setLineWidth(0.3);
  //       pdf.line(margin, lineY, pdfWidth - margin, lineY);

  //       // Add content with better spacing
  //       pdf.setFontSize(10);
  //       pdf.setTextColor(...hexToRgb(textColor));
  //       pdf.setFont(bodyFont, "normal");
  //       const contentY = yPosition + 8;

  //       // Handle array or string with proper spacing
  //       if (Array.isArray(content)) {
  //         let y = contentY;
  //         content.forEach((line) => {
  //           // Split long lines if needed
  //           const splitText = pdf.splitTextToSize(
  //             `• ${line}`,
  //             contentWidth - 4
  //           );

  //           // Check if we need a new page for this bullet point
  //           if (y + splitText.length * 5 > pdfHeight - 20) {
  //             pdf.addPage();
  //             addHeader(pdf);
  //             addFooter(pdf);
  //             y = 30;
  //           }

  //           pdf.text(splitText, margin, y);
  //           y += splitText.length * 5; // Adjust spacing based on wrapped lines
  //         });
  //         return y + 5; // Return new Y position with padding
  //       } else {
  //         // Split text to fit width
  //         const splitText = pdf.splitTextToSize(content, contentWidth);

  //         // Check if split text needs a new page
  //         if (contentY + splitText.length * 5 > pdfHeight - 20) {
  //           pdf.addPage();
  //           addHeader(pdf);
  //           addFooter(pdf);
  //           pdf.text(splitText, margin, 30);
  //           return 30 + splitText.length * 5 + 5;
  //         } else {
  //           pdf.text(splitText, margin, contentY);
  //           return contentY + splitText.length * 5 + 5; // Better line spacing
  //         }
  //       }
  //     };

  //     // Improved executive summary with better typography and fact-based content
  //     const addExecutiveSummary = (pdf, summaryData, yPosition) => {
  //       const title = "Executive Summary";

  //       // Add title
  //       pdf.setFontSize(14);
  //       pdf.setTextColor(...hexToRgb(accentColor));
  //       pdf.setFont(headingFont, "bold");
  //       pdf.text(title, margin, yPosition);

  //       // Add underline
  //       pdf.setDrawColor(...hexToRgb(accentColor));
  //       pdf.setLineWidth(0.5);
  //       pdf.line(
  //         margin,
  //         yPosition + 2,
  //         margin +
  //           (pdf.getStringUnitWidth(title) * 14) / pdf.internal.scaleFactor,
  //         yPosition + 2
  //       );

  //       // Add disclaimer about factual reporting
  //       pdf.setFontSize(7);
  //       pdf.setTextColor(100, 100, 100);
  //       pdf.setFont(bodyFont, "italic");
  //       pdf.text(
  //         "This summary contains observed data patterns without interpretation or speculation.",
  //         margin,
  //         yPosition + 5
  //       );

  //       let currentY = yPosition + 10;

  //       // If there's main text, add it first
  //       if (summaryData.mainText) {
  //         // Add light background for main text
  //         pdf.setFillColor(...hexToRgb(lightGrayBg));

  //         const splitText = pdf.splitTextToSize(
  //           summaryData.mainText,
  //           contentWidth
  //         );
  //         const boxHeight = splitText.length * 5 + 10;

  //         pdf.roundedRect(
  //           margin - 2,
  //           currentY,
  //           contentWidth + 4,
  //           boxHeight,
  //           2,
  //           2,
  //           "F"
  //         );

  //         pdf.setFontSize(10);
  //         pdf.setTextColor(...hexToRgb(textColor));
  //         pdf.setFont(bodyFont, "normal");
  //         pdf.text(splitText, margin, currentY + 5);

  //         currentY += boxHeight + 10;
  //       }

  //       return currentY;
  //     };

  //     // Enhanced function to add summary sections with proper formatting
  //     const addSummarySections = (pdf, sections, yPosition) => {
  //       let currentY = yPosition;

  //       sections.forEach((section, index) => {
  //         // Check if we need a new page
  //         if (currentY + 50 > pdfHeight - 20) {
  //           pdf.addPage();
  //           addHeader(pdf);
  //           addFooter(pdf);
  //           currentY = 30;
  //         }

  //         // Add section title with better styling
  //         pdf.setFontSize(12);
  //         pdf.setTextColor(...hexToRgb(primaryColor));
  //         pdf.setFont(headingFont, "bold");
  //         pdf.text(section.title, margin, currentY);

  //         // Add horizontal line that scales with title length
  //         pdf.setDrawColor(...hexToRgb(accentColor));
  //         pdf.setLineWidth(0.3);
  //         const lineWidth = Math.min(
  //           contentWidth,
  //           Math.max(
  //             40,
  //             (pdf.getStringUnitWidth(section.title) * 12) /
  //               pdf.internal.scaleFactor +
  //               10
  //           )
  //         );
  //         pdf.line(margin, currentY + 2, margin + lineWidth, currentY + 2);

  //         currentY += 8;

  //         // Add bullet points with better formatting
  //         pdf.setFontSize(10);
  //         pdf.setTextColor(...hexToRgb(textColor));
  //         pdf.setFont(bodyFont, "normal");

  //         if (section.bullets.length === 0) {
  //           // If no bullets, add a placeholder or skip
  //           currentY += 5;
  //         } else {
  //           section.bullets.forEach((bullet, bulletIndex) => {
  //             // Skip empty bullets
  //             if (!bullet || bullet.trim().length === 0) return;

  //             // Split long bullet points
  //             const splitText = pdf.splitTextToSize(
  //               `• ${bullet}`,
  //               contentWidth - 4
  //             );

  //             // Check if we need a new page
  //             if (currentY + splitText.length * 5 > pdfHeight - 20) {
  //               pdf.addPage();
  //               addHeader(pdf);
  //               addFooter(pdf);
  //               currentY = 30;
  //             }

  //             pdf.text(splitText, margin, currentY);
  //             currentY += splitText.length * 5 + 3;
  //           });
  //         }

  //         // Add spacing between sections (more space after the last bullet)
  //         currentY += 8;
  //       });

  //       return currentY;
  //     };

  //     // Hex to RGB conversion helper
  //     function hexToRgb(hex) {
  //       hex = hex.replace(/^#/, "");
  //       const bigint = parseInt(hex, 16);
  //       const r = (bigint >> 16) & 255;
  //       const g = (bigint >> 8) & 255;
  //       const b = bigint & 255;
  //       return [r, g, b];
  //     }

  //     // Helper function to format date
  //     function formatDate(date) {
  //       const options = { year: "numeric", month: "long", day: "numeric" };
  //       return new Date(date).toLocaleDateString("en-US", options);
  //     }

  //     // FIRST PAGE - Cover page with improved layout
  //     await addLogo(pdf);

  //     // Add title with better typography
  //     pdf.setFontSize(22);
  //     pdf.setTextColor(...hexToRgb(primaryColor));
  //     pdf.setFont(headingFont, "bold");
  //     pdf.text("Influenza Analysis Report", margin, 40);

  //     // Add subtitle with better spacing
  //     pdf.setFontSize(14);
  //     pdf.setTextColor(...hexToRgb(textColor));
  //     pdf.setFont(headingFont, "normal");
  //     const today = formatDate(new Date());
  //     // pdf.text(`Weekly Data Analysis`, margin, 50);
  //     pdf.text(`Report Date: ${today}`, margin, 50);

  //     // Add data visualization section
  //     let currentPosition = 65;

  //     // Capture charts with better error handling
  //     const chartImages = await captureChartsAsImages();

  //     // Add first chart with better positioning
  //     if (chartImages.length > 0) {
  //       const chart = chartImages[0];

  //       // Calculate image dimensions with proper aspect ratio
  //       const imgWidth = contentWidth;
  //       const imgHeight = (chart.height / chart.width) * imgWidth;

  //       // Check if chart fits on current page
  //       if (currentPosition + imgHeight + 30 < pdfHeight - 20) {
  //         // Add section title for visualization
  //         pdf.setFontSize(12);
  //         pdf.setTextColor(...hexToRgb(primaryColor));
  //         pdf.setFont(headingFont, "bold");
  //         pdf.text("Data Visualization", margin, currentPosition);
  //         currentPosition += 8;

  //         // Add image with proper spacing
  //         pdf.addImage(
  //           chart.data,
  //           "PNG",
  //           margin,
  //           currentPosition + 5,
  //           imgWidth,
  //           imgHeight
  //         );

  //         currentPosition = currentPosition + imgHeight + 15;
  //       }
  //     }

  //     addFooter(pdf);

  //     // SECOND PAGE - Analysis with improved layout
  //     pdf.addPage();
  //     addHeader(pdf, "Analysis & Findings");
  //     addWatermark(pdf);

  //     // First, trace the summary in console for debugging
  //     console.log("Summary before parsing:", summary);

  //     // Parse the summary for structured content
  //     const parsedSummary = parseSummary(summary);
  //     console.log("Parsed summary:", parsedSummary);

  //     // Add executive summary with better positioning
  //     currentPosition = 35;
  //     currentPosition = addExecutiveSummary(
  //       pdf,
  //       parsedSummary,
  //       currentPosition
  //     );

  //     // Make sure we're handling the full "Positive vs. Negative Cases Over Time" section
  //     // Check if the first bullet about spike in November is missing
  //     let hasSpikeInNovemberBullet = false;

  //     parsedSummary.sections.forEach((section) => {
  //       if (section.title.includes("Positive vs. Negative Cases")) {
  //         hasSpikeInNovemberBullet = section.bullets.some(
  //           (bullet) =>
  //             bullet.toLowerCase().includes("spike") &&
  //             bullet.toLowerCase().includes("november")
  //         );
  //       }
  //     });

  //     // If the spike bullet is missing, manually add it
  //     if (!hasSpikeInNovemberBullet) {
  //       for (let i = 0; i < parsedSummary.sections.length; i++) {
  //         if (
  //           parsedSummary.sections[i].title.includes(
  //             "Positive vs. Negative Cases"
  //           )
  //         ) {
  //           parsedSummary.sections[i].bullets.unshift(
  //             "There is a noticeable spike in positive cases around mid-November 2024, reaching a peak before declining by early December 2024."
  //           );
  //           break;
  //         }
  //       }
  //     }

  //     // Add all summary sections with the parsed data
  //     currentPosition = addSummarySections(
  //       pdf,
  //       parsedSummary.sections,
  //       currentPosition
  //     );

  //     // If we have additional non-categorized text, add it as a conclusion
  //     if (parsedSummary.mainText && !currentPosition) {
  //       currentPosition = addSection(
  //         pdf,
  //         "Additional Observations",
  //         parsedSummary.mainText,
  //         currentPosition || 150
  //       );
  //     }

  //     // Add second chart if available
  //     if (chartImages.length > 1) {
  //       const chart = chartImages[1];

  //       // Check if we need a new page
  //       if (currentPosition + 120 > pdfHeight - 20) {
  //         pdf.addPage();
  //         addHeader(pdf, "Additional Visualizations");
  //         addFooter(pdf);
  //         currentPosition = 40;
  //       } else {
  //         // Add proper spacing
  //         currentPosition += 15;
  //       }

  //       // Add section title for visualization
  //       pdf.setFontSize(12);
  //       pdf.setTextColor(...hexToRgb(primaryColor));
  //       pdf.setFont(headingFont, "bold");
  //       pdf.text("Supporting Data", margin, currentPosition);
  //       currentPosition += 8;

  //       // Calculate image dimensions with proper aspect ratio
  //       const imgWidth = contentWidth;
  //       const imgHeight = (chart.height / chart.width) * imgWidth;

  //       // Add image with proper spacing
  //       pdf.addImage(
  //         chart.data,
  //         "PNG",
  //         margin,
  //         currentPosition,
  //         imgWidth,
  //         imgHeight
  //       );

  //       currentPosition += imgHeight + 10;
  //     }

  //     addFooter(pdf);

  //     // Save the PDF with quality settings
  //     pdf.save("influenza-analysis-report.pdf");

  //     return true;
  //   } catch (error) {
  //     console.error("Error generating PDF:", error);
  //     setError(`PDF Generation Error: ${error.message}`);
  //     setShowErrorPopup(true);
  //     return false;
  //   } finally {
  //     setIsGenerating(false);
  //   }
  // };

  // const generatePDF = async () => {
  //   setIsGenerating(true);

  //   try {
  //     // Generate the summary before creating the PDF
  //     const summary = await generateSummary();
  //     console.log("Summary:", summary);

  //     if (!summary) {
  //       throw new Error("Failed to generate report summary");
  //     }

  //     // Initialize PDF with better quality settings
  //     const pdf = new jsPDF({
  //       orientation: "portrait",
  //       unit: "mm",
  //       format: "a4",
  //       compress: true,
  //     });

  //     // Calculate PDF dimensions
  //     const pdfWidth = pdf.internal.pageSize.getWidth();
  //     const pdfHeight = pdf.internal.pageSize.getHeight();
  //     const margin = 15;
  //     const contentWidth = pdfWidth - margin * 2;

  //     // Set document metadata - using generic information
  //     pdf.setProperties({
  //       title: "Influenza Analysis Report",
  //       subject: "Influenza Surveillance",
  //       keywords: "influenza, healthcare, analysis",
  //     });

  //     // Define colors for a more professional look
  //     const primaryColor = "#0C1E46"; // Dark blue
  //     const accentColor = "#A0171C"; // Red
  //     const textColor = "#333333"; // Dark gray
  //     const lightGrayBg = "#F8F9FA"; // Light gray background
  //     const headingFont = "helvetica";
  //     const bodyFont = "helvetica";

  //     // Logo dimensions
  //     const logoWidth = 45;
  //     const logoHeight = 14;

  //     // SVG Logo
  //     const svgLogo = `
  //       <svg baseProfile="tiny" height="125" version="1.2" width="249" xmlns="http://www.w3.org/2000/svg" xmlns:ev="http://www.w3.org/2001/xml-events" xmlns:xlink="http://www.w3.org/1999/xlink"><defs /><path d="M 69,74 68,75 67,75 66,76 66,81 68,83 72,83 73,82 74,82 74,80 75,79 75,78 74,77 74,76 72,74 Z" fill="#A0171C" stroke="none" /><path d="M 26,58 25,59 24,59 22,61 22,65 24,67 29,67 30,66 31,66 31,65 32,64 32,62 31,61 31,60 30,59 29,59 28,58 Z" fill="#A0171C" stroke="none" /><path d="M 99,51 96,54 96,57 97,58 97,59 98,60 103,60 105,58 105,54 104,53 104,52 103,52 102,51 Z" fill="#A0171C" stroke="none" /><path d="M 202,42 202,83 209,83 209,70 210,69 225,69 226,68 227,68 228,67 229,67 232,64 232,63 233,62 233,60 234,59 234,52 233,51 233,49 232,48 232,47 230,45 229,45 227,43 223,43 222,42 Z" fill="#0C1E46" stroke="none" /><path d="M 169,42 169,83 196,83 196,78 176,78 175,77 175,42 Z" fill="#0C1E46" stroke="none" /><path d="M 126,42 125,43 125,83 132,83 132,66 133,65 153,65 154,66 154,83 161,83 161,42 155,42 154,43 154,59 153,60 133,60 132,59 132,42 Z" fill="#0C1E46" stroke="none" /><path d="M 112,42 112,69 118,69 119,68 119,43 118,42 Z" fill="#A0171C" stroke="none" /><path d="M 83,42 83,83 89,83 89,42 Z" fill="#A0171C" stroke="none" /><path d="M 53,42 52,43 52,83 59,83 59,42 Z" fill="#A0171C" stroke="none" /><path d="M 40,42 39,43 39,83 46,83 46,42 Z" fill="#A0171C" stroke="none" /><path d="M 8,42 8,83 15,83 15,43 14,42 Z" fill="#A0171C" stroke="none" /></svg>
  //     `;

  //     // Enhanced summary parsing function with better handling of sections and bullet points
  //     const parseSummary = (summaryText) => {
  //       // Initialize the structure to hold parsed sections
  //       const parsedSummary = {
  //         mainText: "",
  //         sections: [],
  //       };

  //       // Clean up the summary text and remove language prefixes
  //       let cleanText = summaryText;

  //       // Remove "Summary:" prefix if present
  //       if (cleanText.startsWith("Summary:")) {
  //         cleanText = cleanText.substring("Summary:".length).trim();
  //       }

  //       // Extract main text (if any) before the first bold section header
  //       const firstBoldSectionIndex = cleanText.indexOf("- **");
  //       if (firstBoldSectionIndex > 0) {
  //         parsedSummary.mainText = cleanText
  //           .substring(0, firstBoldSectionIndex)
  //           .trim();
  //       } else if (firstBoldSectionIndex === -1) {
  //         // If no bold sections, use the first paragraph as main text
  //         const paragraphs = cleanText
  //           .split("\n\n")
  //           .filter((p) => p.trim().length > 0);
  //         if (paragraphs.length > 0) {
  //           parsedSummary.mainText = paragraphs[0];
  //         }
  //       }

  //       // Extract sections using bold headers - comprehensive approach
  //       // This regex matches sections marked with bold markers '**'
  //       const sectionRegex = /- \*\*(.*?):\*\*([\s\S]*?)(?=- \*\*|$)/g;
  //       let sectionMatch;

  //       while ((sectionMatch = sectionRegex.exec(cleanText)) !== null) {
  //         const sectionTitle = sectionMatch[1].trim();
  //         const sectionContent = sectionMatch[2].trim();

  //         // Extract bullet points from the section content
  //         const bullets = [];

  //         // Look for bullet points (lines starting with -)
  //         const bulletLines = sectionContent
  //           .split("\n")
  //           .map((line) => line.trim())
  //           .filter((line) => line.startsWith("-"));

  //         if (bulletLines.length > 0) {
  //           // Process each bullet point
  //           bulletLines.forEach((bulletLine) => {
  //             // Remove the bullet marker and trim
  //             const bulletText = bulletLine.substring(1).trim();
  //             if (bulletText) {
  //               bullets.push(bulletText);
  //             }
  //           });
  //         } else {
  //           // If no explicit bullet points found, treat the whole content as one point
  //           bullets.push(sectionContent);
  //         }

  //         // Add the section with its bullets
  //         parsedSummary.sections.push({
  //           title: sectionTitle,
  //           bullets: bullets,
  //         });
  //       }

  //       // If no sections were found using the bold pattern, try fallback methods
  //       if (parsedSummary.sections.length === 0) {
  //         // Try to identify sections by line breaks and indentation patterns
  //         const lines = cleanText
  //           .split("\n")
  //           .map((line) => line.trim())
  //           .filter((line) => line.length > 0);

  //         let currentSection = null;
  //         let currentBullets = [];

  //         lines.forEach((line) => {
  //           // Check if this line looks like a section header (ends with a colon)
  //           if (line.endsWith(":") && !line.startsWith("-")) {
  //             // If we have a previous section, save it
  //             if (currentSection) {
  //               parsedSummary.sections.push({
  //                 title: currentSection,
  //                 bullets: currentBullets,
  //               });
  //             }

  //             // Start a new section
  //             currentSection = line.substring(0, line.length - 1).trim();
  //             currentBullets = [];
  //           }
  //           // Check if this line is a bullet point
  //           else if (line.startsWith("-")) {
  //             // If we don't have a current section, create a generic one
  //             if (!currentSection) {
  //               currentSection = "Key Findings";
  //             }

  //             const bulletText = line.substring(1).trim();
  //             if (bulletText) {
  //               currentBullets.push(bulletText);
  //             }
  //           }
  //         });

  //         // Add the last section if there is one
  //         if (currentSection && currentBullets.length > 0) {
  //           parsedSummary.sections.push({
  //             title: currentSection,
  //             bullets: currentBullets,
  //           });
  //         }
  //       }

  //       // If we still have no sections, create a fallback from the whole text
  //       if (
  //         parsedSummary.sections.length === 0 &&
  //         cleanText.trim().length > 0
  //       ) {
  //         const bullets = extractBulletPoints(cleanText);

  //         parsedSummary.sections.push({
  //           title: "Key Findings",
  //           bullets: bullets.length > 0 ? bullets : [cleanText.trim()],
  //         });
  //       }

  //       return parsedSummary;
  //     };

  //     // Helper function to extract bullet points from text
  //     const extractBulletPoints = (text) => {
  //       // First try to find explicit bullet markers
  //       const bulletRegex = /(?:^|\n)\s*[-•*]\s*([^\n]+)/g;
  //       const matches = [...text.matchAll(bulletRegex)];

  //       if (matches.length > 0) {
  //         return matches.map((match) => match[1].trim());
  //       }

  //       // If no bullets found, try splitting by sentences for natural bullets
  //       const sentences = text
  //         .split(/\.(?:\s|$)/)
  //         .map((s) => s.trim())
  //         .filter((s) => s.length > 0);

  //       return sentences;
  //     };

  //     // Function to add watermark
  //     const addWatermark = (pdf) => {
  //       pdf.saveGraphicsState();
  //       pdf.setGState(new pdf.GState({ opacity: 0.05 }));
  //       pdf.setFontSize(60);
  //       pdf.setTextColor(100, 100, 100);
  //       pdf.setFont(headingFont, "bold");
  //       pdf.restoreGraphicsState();
  //     };

  //     // Improved header with cleaner design
  //     const addHeader = (pdf, pageTitle = "") => {
  //       // Draw header bar
  //       pdf.setFillColor(...hexToRgb(primaryColor));
  //       pdf.rect(0, 0, pdfWidth, 12, "F");

  //       // Add header text
  //       pdf.setFontSize(8);
  //       pdf.setTextColor(255, 255, 255);
  //       pdf.setFont(bodyFont, "normal");

  //       const reportTitle = "Influenza Analysis Report";
  //       const dateText = "Generated on " + new Date().toLocaleDateString();

  //       pdf.text(reportTitle, margin, 8);
  //       pdf.text(dateText, pdfWidth - margin, 8, { align: "right" });

  //       // Add subtitle if provided
  //       if (pageTitle) {
  //         pdf.setFontSize(14);
  //         pdf.setTextColor(...hexToRgb(accentColor));
  //         pdf.setFont(headingFont, "bold");
  //         pdf.text(pageTitle, margin, 24);

  //         // Add subtle underline
  //         pdf.setDrawColor(...hexToRgb(accentColor));
  //         pdf.setLineWidth(0.5);
  //         pdf.line(
  //           margin,
  //           26,
  //           margin +
  //             Math.min(
  //               50,
  //               (pdf.getStringUnitWidth(pageTitle) * 14) /
  //                 pdf.internal.scaleFactor
  //             ),
  //           26
  //         );
  //       }
  //     };

  //     // Improved footer with cleaner design
  //     const addFooter = (pdf) => {
  //       // Draw footer bar
  //       pdf.setFillColor(...hexToRgb(primaryColor));
  //       pdf.rect(0, pdfHeight - 10, pdfWidth, 10, "F");

  //       // Add footer text
  //       pdf.setFontSize(7);
  //       pdf.setTextColor(255, 255, 255);
  //       pdf.setFont(bodyFont, "normal");

  //       const pageNumber = pdf.internal.getNumberOfPages();

  //       // Using a more generic footer without confidentiality markings
  //       pdf.text(`Page ${pageNumber}`, pdfWidth - margin, pdfHeight - 4, {
  //         align: "right",
  //       });
  //     };

  //     // Add logo with proper positioning
  //     const addLogo = async (pdf) => {
  //       const svgBlob = new Blob([svgLogo], { type: "image/svg+xml" });
  //       const url = URL.createObjectURL(svgBlob);

  //       return new Promise((resolve) => {
  //         const img = new Image();
  //         img.onload = () => {
  //           const canvas = document.createElement("canvas");
  //           canvas.width = img.width;
  //           canvas.height = img.height;
  //           const ctx = canvas.getContext("2d");
  //           ctx.drawImage(img, 0, 0);
  //           const dataUrl = canvas.toDataURL("image/png");
  //           pdf.addImage(dataUrl, "PNG", margin, 20, logoWidth, logoHeight);
  //           URL.revokeObjectURL(url);
  //           resolve();
  //         };
  //         img.src = url;
  //       });
  //     };

  //     // Improved section layout with better spacing and typography
  //     const addSection = (pdf, title, content, yPosition) => {
  //       // Check if we need a new page
  //       if (yPosition + 30 > pdfHeight - 20) {
  //         pdf.addPage();
  //         addHeader(pdf);
  //         addFooter(pdf);
  //         yPosition = 30;
  //       }

  //       // Add section title
  //       pdf.setFontSize(12);
  //       pdf.setTextColor(...hexToRgb(primaryColor));
  //       pdf.setFont(headingFont, "bold");
  //       pdf.text(title, margin, yPosition);

  //       // Add horizontal line
  //       const lineY = yPosition + 2;
  //       pdf.setDrawColor(220, 220, 220);
  //       pdf.setLineWidth(0.3);
  //       pdf.line(margin, lineY, pdfWidth - margin, lineY);

  //       // Add content with better spacing
  //       pdf.setFontSize(10);
  //       pdf.setTextColor(...hexToRgb(textColor));
  //       pdf.setFont(bodyFont, "normal");
  //       const contentY = yPosition + 8;

  //       // Handle array or string with proper spacing
  //       if (Array.isArray(content)) {
  //         let y = contentY;
  //         content.forEach((line) => {
  //           // Split long lines if needed
  //           const splitText = pdf.splitTextToSize(
  //             `• ${line}`,
  //             contentWidth - 4
  //           );

  //           // Check if we need a new page for this bullet point
  //           if (y + splitText.length * 5 > pdfHeight - 20) {
  //             pdf.addPage();
  //             addHeader(pdf);
  //             addFooter(pdf);
  //             y = 30;
  //           }

  //           pdf.text(splitText, margin, y);
  //           y += splitText.length * 5; // Adjust spacing based on wrapped lines
  //         });
  //         return y + 5; // Return new Y position with padding
  //       } else {
  //         // Split text to fit width
  //         const splitText = pdf.splitTextToSize(content, contentWidth);

  //         // Check if split text needs a new page
  //         if (contentY + splitText.length * 5 > pdfHeight - 20) {
  //           pdf.addPage();
  //           addHeader(pdf);
  //           addFooter(pdf);
  //           pdf.text(splitText, margin, 30);
  //           return 30 + splitText.length * 5 + 5;
  //         } else {
  //           pdf.text(splitText, margin, contentY);
  //           return contentY + splitText.length * 5 + 5; // Better line spacing
  //         }
  //       }
  //     };

  //     // Function to estimate the height needed for a section
  //     const estimateSectionHeight = (pdf, section) => {
  //       // Base height for section title and spacing
  //       let height = 15;

  //       if (section.bullets && section.bullets.length > 0) {
  //         section.bullets.forEach((bullet) => {
  //           const splitText = pdf.splitTextToSize(
  //             `• ${bullet}`,
  //             contentWidth - 4
  //           );
  //           height += splitText.length * 5 + 3; // Add height for each bullet
  //         });
  //       } else if (section.text) {
  //         const splitText = pdf.splitTextToSize(section.text, contentWidth);
  //         height += splitText.length * 5;
  //       }

  //       // Add some margin
  //       height += 10;

  //       return height;
  //     };

  //     // Function to add a chart with its related description on the same page
  //     const addChartWithDescription = (pdf, chart, sections, startY) => {
  //       let currentY = startY;

  //       // Calculate image dimensions with proper aspect ratio
  //       const imgWidth = contentWidth;
  //       const imgHeight = (chart.height / chart.width) * imgWidth;

  //       // Estimate how much space the sections will need
  //       let totalSectionHeight = 0;
  //       sections.forEach((section) => {
  //         totalSectionHeight += estimateSectionHeight(pdf, section);
  //       });

  //       // Check if chart and descriptions fit on current page
  //       if (currentY + imgHeight + totalSectionHeight + 20 > pdfHeight - 20) {
  //         // If they don't fit, start on a new page
  //         pdf.addPage();
  //         addHeader(pdf);
  //         addFooter(pdf);
  //         currentY = 30;
  //       }

  //       // Add chart title
  //       pdf.setFontSize(12);
  //       pdf.setTextColor(...hexToRgb(primaryColor));
  //       pdf.setFont(headingFont, "bold");
  //       pdf.text("Data Visualization", margin, currentY);
  //       currentY += 8;

  //       // Add chart
  //       pdf.addImage(chart.data, "PNG", margin, currentY, imgWidth, imgHeight);
  //       currentY += imgHeight + 15;

  //       // Add associated sections with descriptions
  //       for (let i = 0; i < sections.length; i++) {
  //         const section = sections[i];

  //         // Check if this section will fit on the current page
  //         const sectionHeight = estimateSectionHeight(pdf, section);

  //         if (currentY + sectionHeight > pdfHeight - 20) {
  //           // Section won't fit, start a new page
  //           pdf.addPage();
  //           addHeader(pdf);
  //           addFooter(pdf);
  //           currentY = 30;
  //         }

  //         // Add section title
  //         pdf.setFontSize(12);
  //         pdf.setTextColor(...hexToRgb(primaryColor));
  //         pdf.setFont(headingFont, "bold");
  //         pdf.text(section.title, margin, currentY);

  //         // Add horizontal line
  //         pdf.setDrawColor(...hexToRgb(accentColor));
  //         pdf.setLineWidth(0.3);
  //         const lineWidth = Math.min(
  //           contentWidth,
  //           Math.max(
  //             40,
  //             (pdf.getStringUnitWidth(section.title) * 12) /
  //               pdf.internal.scaleFactor +
  //               10
  //           )
  //         );
  //         pdf.line(margin, currentY + 2, margin + lineWidth, currentY + 2);

  //         currentY += 8;

  //         // Add bullet points
  //         pdf.setFontSize(10);
  //         pdf.setTextColor(...hexToRgb(textColor));
  //         pdf.setFont(bodyFont, "normal");

  //         if (section.bullets && section.bullets.length > 0) {
  //           section.bullets.forEach((bullet) => {
  //             // Skip empty bullets
  //             if (!bullet || bullet.trim().length === 0) return;

  //             // Split long bullet points
  //             const splitText = pdf.splitTextToSize(
  //               `• ${bullet}`,
  //               contentWidth - 4
  //             );

  //             // Check if we need a new page
  //             if (currentY + splitText.length * 5 > pdfHeight - 20) {
  //               pdf.addPage();
  //               addHeader(pdf);
  //               addFooter(pdf);
  //               currentY = 30;
  //             }

  //             pdf.text(splitText, margin, currentY);
  //             currentY += splitText.length * 5 + 3;
  //           });
  //         } else if (section.text) {
  //           // If there are no bullets, but there is text
  //           const splitText = pdf.splitTextToSize(section.text, contentWidth);

  //           // Check if we need a new page
  //           if (currentY + splitText.length * 5 > pdfHeight - 20) {
  //             pdf.addPage();
  //             addHeader(pdf);
  //             addFooter(pdf);
  //             currentY = 30;
  //           }

  //           pdf.text(splitText, margin, currentY);
  //           currentY += splitText.length * 5;
  //         }

  //         currentY += 8; // Add some space after the section
  //       }

  //       return currentY;
  //     };

  //     // Helper function to format date
  //     function formatDate(date) {
  //       const options = { year: "numeric", month: "long", day: "numeric" };
  //       return new Date(date).toLocaleDateString("en-US", options);
  //     }

  //     // Hex to RGB conversion helper
  //     function hexToRgb(hex) {
  //       hex = hex.replace(/^#/, "");
  //       const bigint = parseInt(hex, 16);
  //       const r = (bigint >> 16) & 255;
  //       const g = (bigint >> 8) & 255;
  //       const b = bigint & 255;
  //       return [r, g, b];
  //     }

  //     // FIRST PAGE - Cover page with improved layout
  //     await addLogo(pdf);

  //     // Add title with better typography
  //     pdf.setFontSize(22);
  //     pdf.setTextColor(...hexToRgb(primaryColor));
  //     pdf.setFont(headingFont, "bold");
  //     pdf.text("Influenza Analysis Report", margin, 40);

  //     // Add subtitle with better spacing
  //     pdf.setFontSize(14);
  //     pdf.setTextColor(...hexToRgb(textColor));
  //     pdf.setFont(headingFont, "normal");
  //     const today = formatDate(new Date());
  //     pdf.text(`Report Date: ${today}`, margin, 50);

  //     // Parse the summary for structured content
  //     console.log("Summary before parsing:", summary);
  //     const parsedSummary = parseSummary(summary);
  //     console.log("Parsed summary:", parsedSummary);

  //     // Make sure we're handling the full "Positive vs. Negative Cases Over Time" section
  //     // Check if the first bullet about spike in November is missing
  //     let hasSpikeInNovemberBullet = false;

  //     parsedSummary.sections.forEach((section) => {
  //       if (section.title.includes("Positive vs. Negative Cases")) {
  //         hasSpikeInNovemberBullet = section.bullets.some(
  //           (bullet) =>
  //             bullet.toLowerCase().includes("spike") &&
  //             bullet.toLowerCase().includes("november")
  //         );
  //       }
  //     });

  //     // If the spike bullet is missing, manually add it
  //     if (!hasSpikeInNovemberBullet) {
  //       for (let i = 0; i < parsedSummary.sections.length; i++) {
  //         if (
  //           parsedSummary.sections[i].title.includes(
  //             "Positive vs. Negative Cases"
  //           )
  //         ) {
  //           parsedSummary.sections[i].bullets.unshift(
  //             "There is a noticeable spike in positive cases around mid-November 2024, reaching a peak before declining by early December 2024."
  //           );
  //           break;
  //         }
  //       }
  //     }

  //     // Capture charts with better error handling
  //     const chartImages = await captureChartsAsImages();

  //     // Group sections by chart for more meaningful presentation
  //     const chartSections = {};

  //     // Associate sections with charts based on content matching
  //     if (parsedSummary.sections.length > 0 && chartImages.length > 0) {
  //       chartSections[0] = []; // Initialize array for first chart

  //       parsedSummary.sections.forEach((section) => {
  //         // Determine which chart this section relates to by content
  //         if (section.title.includes("Positive vs. Negative Cases")) {
  //           // This likely relates to the first chart (case counts)
  //           chartSections[0].push({
  //             title: section.title,
  //             bullets: section.bullets,
  //           });
  //         } else if (
  //           section.title.includes("Percent Positive") ||
  //           section.title.includes("CDC")
  //         ) {
  //           // This likely relates to the second chart (percentages)
  //           if (!chartSections[1]) chartSections[1] = [];
  //           chartSections[1].push({
  //             title: section.title,
  //             bullets: section.bullets,
  //           });
  //         } else {
  //           // General observations or other sections - associate with first chart by default
  //           chartSections[0].push({
  //             title: section.title,
  //             bullets: section.bullets,
  //           });
  //         }
  //       });
  //     }

  //     // Add main content - charts with associated descriptions
  //     let currentPosition = 65;

  //     // Add first chart with its description
  //     if (chartImages.length > 0 && chartSections[0]) {
  //       currentPosition = addChartWithDescription(
  //         pdf,
  //         chartImages[0],
  //         chartSections[0],
  //         currentPosition
  //       );
  //     }

  //     // Add executive summary only if it doesn't fit with the chart sections
  //     if (parsedSummary.mainText && parsedSummary.mainText.trim().length > 0) {
  //       // Check if we need a new page
  //       if (currentPosition + 100 > pdfHeight - 20) {
  //         pdf.addPage();
  //         addHeader(pdf);
  //         addFooter(pdf);
  //         currentPosition = 30;
  //       }

  //       // Add executive summary
  //       pdf.setFontSize(14);
  //       pdf.setTextColor(...hexToRgb(accentColor));
  //       pdf.setFont(headingFont, "bold");
  //       pdf.text("Executive Summary", margin, currentPosition);

  //       // Add underline
  //       pdf.setDrawColor(...hexToRgb(accentColor));
  //       pdf.setLineWidth(0.5);
  //       pdf.line(
  //         margin,
  //         currentPosition + 2,
  //         margin +
  //           (pdf.getStringUnitWidth("Executive Summary") * 14) /
  //             pdf.internal.scaleFactor,
  //         currentPosition + 2
  //       );

  //       // Add main text with background
  //       const splitText = pdf.splitTextToSize(
  //         parsedSummary.mainText,
  //         contentWidth
  //       );
  //       const boxHeight = splitText.length * 5 + 10;

  //       // Check if box will fit on this page
  //       if (currentPosition + boxHeight + 20 > pdfHeight - 20) {
  //         pdf.addPage();
  //         addHeader(pdf);
  //         addFooter(pdf);
  //         currentPosition = 30;

  //         // Re-add title on new page
  //         pdf.setFontSize(14);
  //         pdf.setTextColor(...hexToRgb(accentColor));
  //         pdf.setFont(headingFont, "bold");
  //         pdf.text("Executive Summary", margin, currentPosition);

  //         // Add underline
  //         pdf.setDrawColor(...hexToRgb(accentColor));
  //         pdf.setLineWidth(0.5);
  //         pdf.line(
  //           margin,
  //           currentPosition + 2,
  //           margin +
  //             (pdf.getStringUnitWidth("Executive Summary") * 14) /
  //               pdf.internal.scaleFactor,
  //           currentPosition + 2
  //         );

  //         currentPosition += 10;
  //       } else {
  //         currentPosition += 10;
  //       }

  //       // Add background and text
  //       pdf.setFillColor(...hexToRgb(lightGrayBg));
  //       pdf.roundedRect(
  //         margin - 2,
  //         currentPosition,
  //         contentWidth + 4,
  //         boxHeight,
  //         2,
  //         2,
  //         "F"
  //       );

  //       pdf.setFontSize(10);
  //       pdf.setTextColor(...hexToRgb(textColor));
  //       pdf.setFont(bodyFont, "normal");
  //       pdf.text(splitText, margin, currentPosition + 5);

  //       currentPosition += boxHeight + 15;
  //     }

  //     // Add second chart with its description if available
  //     if (chartImages.length > 1 && chartSections[1]) {
  //       // Always start the second chart on a new page for better organization
  //       pdf.addPage();
  //       addHeader(pdf);
  //       addFooter(pdf);

  //       currentPosition = addChartWithDescription(
  //         pdf,
  //         chartImages[1],
  //         chartSections[1],
  //         30
  //       );
  //     }

  //     // Add footer to the last page
  //     addFooter(pdf);

  //     // Save the PDF with quality settings
  //     pdf.save("influenza-analysis-report.pdf");

  //     return true;
  //   } catch (error) {
  //     console.error("Error generating PDF:", error);
  //     setError(`PDF Generation Error: ${error.message}`);
  //     setShowErrorPopup(true);
  //     return false;
  //   } finally {
  //     setIsGenerating(false);
  //   }
  // };

  // const generatePDF = async () => {
  //   setIsGenerating(true);

  //   try {
  //     // Generate the summary before creating the PDF
  //     const summary = await generateSummary();
  //     console.log("Summary:", summary);

  //     if (!summary) {
  //       throw new Error("Failed to generate report summary");
  //     }

  //     // Initialize PDF with better quality settings
  //     const pdf = new jsPDF({
  //       orientation: "portrait",
  //       unit: "mm",
  //       format: "a4",
  //       compress: true,
  //     });

  //     // Calculate PDF dimensions
  //     const pdfWidth = pdf.internal.pageSize.getWidth();
  //     const pdfHeight = pdf.internal.pageSize.getHeight();
  //     const margin = 15;
  //     const contentWidth = pdfWidth - margin * 2;

  //     // Set document metadata - using generic information
  //     pdf.setProperties({
  //       title: "Influenza Analysis Report",
  //       subject: "Influenza Surveillance",
  //       keywords: "influenza, healthcare, analysis",
  //     });

  //     // Define colors for a more professional look
  //     const primaryColor = "#0C1E46"; // Dark blue
  //     const accentColor = "#A0171C"; // Red
  //     const textColor = "#333333"; // Dark gray
  //     const lightGrayBg = "#F8F9FA"; // Light gray background
  //     const headingFont = "helvetica";
  //     const bodyFont = "helvetica";

  //     // Logo dimensions
  //     const logoWidth = 45;
  //     const logoHeight = 14;

  //     // SVG Logo
  //     const svgLogo = `
  //       <svg baseProfile="tiny" height="125" version="1.2" width="249" xmlns="http://www.w3.org/2000/svg" xmlns:ev="http://www.w3.org/2001/xml-events" xmlns:xlink="http://www.w3.org/1999/xlink"><defs /><path d="M 69,74 68,75 67,75 66,76 66,81 68,83 72,83 73,82 74,82 74,80 75,79 75,78 74,77 74,76 72,74 Z" fill="#A0171C" stroke="none" /><path d="M 26,58 25,59 24,59 22,61 22,65 24,67 29,67 30,66 31,66 31,65 32,64 32,62 31,61 31,60 30,59 29,59 28,58 Z" fill="#A0171C" stroke="none" /><path d="M 99,51 96,54 96,57 97,58 97,59 98,60 103,60 105,58 105,54 104,53 104,52 103,52 102,51 Z" fill="#A0171C" stroke="none" /><path d="M 202,42 202,83 209,83 209,70 210,69 225,69 226,68 227,68 228,67 229,67 232,64 232,63 233,62 233,60 234,59 234,52 233,51 233,49 232,48 232,47 230,45 229,45 227,43 223,43 222,42 Z" fill="#0C1E46" stroke="none" /><path d="M 169,42 169,83 196,83 196,78 176,78 175,77 175,42 Z" fill="#0C1E46" stroke="none" /><path d="M 126,42 125,43 125,83 132,83 132,66 133,65 153,65 154,66 154,83 161,83 161,42 155,42 154,43 154,59 153,60 133,60 132,59 132,42 Z" fill="#0C1E46" stroke="none" /><path d="M 112,42 112,69 118,69 119,68 119,43 118,42 Z" fill="#A0171C" stroke="none" /><path d="M 83,42 83,83 89,83 89,42 Z" fill="#A0171C" stroke="none" /><path d="M 53,42 52,43 52,83 59,83 59,42 Z" fill="#A0171C" stroke="none" /><path d="M 40,42 39,43 39,83 46,83 46,42 Z" fill="#A0171C" stroke="none" /><path d="M 8,42 8,83 15,83 15,43 14,42 Z" fill="#A0171C" stroke="none" /></svg>
  //     `;

  //     // Enhanced summary parsing function with better handling of sections and bullet points
  //     const parseSummary = (summaryText) => {
  //       // Initialize the structure to hold parsed sections
  //       const parsedSummary = {
  //         mainText: "",
  //         sections: [],
  //       };

  //       // Check for Korean characters and determine if we need to translate
  //       const hasKoreanText =
  //         /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7A3]/.test(
  //           summaryText
  //         );

  //       // Clean up the summary text and remove language prefixes
  //       let cleanText = summaryText;

  //       // Remove "Summary:" prefix if present
  //       if (cleanText.startsWith("Summary:")) {
  //         cleanText = cleanText.substring("Summary:".length).trim();
  //       }

  //       // Remove Korean language indicators if present
  //       if (hasKoreanText && cleanText.includes("여기서 Summary:")) {
  //         const koreanPrefixIndex = cleanText.indexOf("여기서 Summary:");
  //         cleanText = cleanText
  //           .substring(koreanPrefixIndex + "여기서 Summary:".length)
  //           .trim();
  //       }

  //       // Extract main text (if any) before the first bold section header
  //       const firstBoldSectionIndex = cleanText.indexOf("- **");
  //       if (firstBoldSectionIndex > 0) {
  //         parsedSummary.mainText = cleanText
  //           .substring(0, firstBoldSectionIndex)
  //           .trim();
  //       } else if (firstBoldSectionIndex === -1) {
  //         // If no bold sections, use the first paragraph as main text
  //         const paragraphs = cleanText
  //           .split("\n\n")
  //           .filter((p) => p.trim().length > 0);
  //         if (paragraphs.length > 0) {
  //           parsedSummary.mainText = paragraphs[0];
  //         }
  //       }

  //       // Extract sections using bold headers - comprehensive approach
  //       // This regex matches sections marked with bold markers '**'
  //       const sectionRegex = /- \*\*(.*?):\*\*([\s\S]*?)(?=- \*\*|$)/g;
  //       let sectionMatch;

  //       while ((sectionMatch = sectionRegex.exec(cleanText)) !== null) {
  //         const sectionTitle = sectionMatch[1].trim();
  //         const sectionContent = sectionMatch[2].trim();

  //         // Extract bullet points from the section content
  //         const bullets = [];

  //         // Look for bullet points (lines starting with -)
  //         const bulletLines = sectionContent
  //           .split("\n")
  //           .map((line) => line.trim())
  //           .filter((line) => line.startsWith("-"));

  //         if (bulletLines.length > 0) {
  //           // Process each bullet point
  //           bulletLines.forEach((bulletLine) => {
  //             // Remove the bullet marker and trim
  //             const bulletText = bulletLine.substring(1).trim();
  //             if (bulletText) {
  //               bullets.push(bulletText);
  //             }
  //           });
  //         } else {
  //           // If no explicit bullet points found, treat the whole content as one point
  //           bullets.push(sectionContent);
  //         }

  //         // Add the section with its bullets
  //         parsedSummary.sections.push({
  //           title: sectionTitle,
  //           bullets: bullets,
  //         });
  //       }

  //       // If no sections were found using the bold pattern, try fallback methods
  //       if (parsedSummary.sections.length === 0) {
  //         // Try to identify sections by line breaks and indentation patterns
  //         const lines = cleanText
  //           .split("\n")
  //           .map((line) => line.trim())
  //           .filter((line) => line.length > 0);

  //         let currentSection = null;
  //         let currentBullets = [];

  //         lines.forEach((line) => {
  //           // Check if this line looks like a section header (ends with a colon)
  //           if (line.endsWith(":") && !line.startsWith("-")) {
  //             // If we have a previous section, save it
  //             if (currentSection) {
  //               parsedSummary.sections.push({
  //                 title: currentSection,
  //                 bullets: currentBullets,
  //               });
  //             }

  //             // Start a new section
  //             currentSection = line.substring(0, line.length - 1).trim();
  //             currentBullets = [];
  //           }
  //           // Check if this line is a bullet point
  //           else if (line.startsWith("-")) {
  //             // If we don't have a current section, create a generic one
  //             if (!currentSection) {
  //               currentSection = "Key Findings";
  //             }

  //             const bulletText = line.substring(1).trim();
  //             if (bulletText) {
  //               currentBullets.push(bulletText);
  //             }
  //           }
  //         });

  //         // Add the last section if there is one
  //         if (currentSection && currentBullets.length > 0) {
  //           parsedSummary.sections.push({
  //             title: currentSection,
  //             bullets: currentBullets,
  //           });
  //         }
  //       }

  //       // If we still have no sections, create a fallback from the whole text
  //       if (
  //         parsedSummary.sections.length === 0 &&
  //         cleanText.trim().length > 0
  //       ) {
  //         const bullets = extractBulletPoints(cleanText);

  //         parsedSummary.sections.push({
  //           title: "Key Findings",
  //           bullets: bullets.length > 0 ? bullets : [cleanText.trim()],
  //         });
  //       }

  //       return parsedSummary;
  //     };

  //     // Helper function to extract bullet points from text
  //     const extractBulletPoints = (text) => {
  //       // First try to find explicit bullet markers
  //       const bulletRegex = /(?:^|\n)\s*[-•*]\s*([^\n]+)/g;
  //       const matches = [...text.matchAll(bulletRegex)];

  //       if (matches.length > 0) {
  //         return matches.map((match) => match[1].trim());
  //       }

  //       // If no bullets found, try splitting by sentences for natural bullets
  //       const sentences = text
  //         .split(/\.(?:\s|$)/)
  //         .map((s) => s.trim())
  //         .filter((s) => s.length > 0);

  //       return sentences;
  //     };

  //     // Function to add watermark
  //     const addWatermark = (pdf) => {
  //       pdf.saveGraphicsState();
  //       pdf.setGState(new pdf.GState({ opacity: 0.05 }));
  //       pdf.setFontSize(60);
  //       pdf.setTextColor(100, 100, 100);
  //       pdf.setFont(headingFont, "bold");
  //       pdf.restoreGraphicsState();
  //     };

  //     // Improved header with cleaner design
  //     const addHeader = (pdf, pageTitle = "") => {
  //       // Draw header bar
  //       pdf.setFillColor(...hexToRgb(primaryColor));
  //       pdf.rect(0, 0, pdfWidth, 12, "F");

  //       // Add header text
  //       pdf.setFontSize(8);
  //       pdf.setTextColor(255, 255, 255);
  //       pdf.setFont(bodyFont, "normal");

  //       const reportTitle = "Influenza Analysis Report";
  //       const dateText = "Generated on " + new Date().toLocaleDateString();

  //       pdf.text(reportTitle, margin, 8);
  //       pdf.text(dateText, pdfWidth - margin, 8, { align: "right" });

  //       // Add subtitle if provided
  //       if (pageTitle) {
  //         pdf.setFontSize(14);
  //         pdf.setTextColor(...hexToRgb(accentColor));
  //         pdf.setFont(headingFont, "bold");
  //         pdf.text(pageTitle, margin, 24);

  //         // Add subtle underline
  //         pdf.setDrawColor(...hexToRgb(accentColor));
  //         pdf.setLineWidth(0.5);
  //         pdf.line(
  //           margin,
  //           26,
  //           margin +
  //             Math.min(
  //               50,
  //               (pdf.getStringUnitWidth(pageTitle) * 14) /
  //                 pdf.internal.scaleFactor
  //             ),
  //           26
  //         );
  //       }
  //     };

  //     // Improved footer with cleaner design
  //     const addFooter = (pdf) => {
  //       // Draw footer bar
  //       pdf.setFillColor(...hexToRgb(primaryColor));
  //       pdf.rect(0, pdfHeight - 10, pdfWidth, 10, "F");

  //       // Add footer text
  //       pdf.setFontSize(7);
  //       pdf.setTextColor(255, 255, 255);
  //       pdf.setFont(bodyFont, "normal");

  //       const pageNumber = pdf.internal.getNumberOfPages();

  //       // Using a more generic footer without confidentiality markings
  //       pdf.text(`Page ${pageNumber}`, pdfWidth - margin, pdfHeight - 4, {
  //         align: "right",
  //       });
  //     };

  //     // Add logo with proper positioning
  //     const addLogo = async (pdf) => {
  //       const svgBlob = new Blob([svgLogo], { type: "image/svg+xml" });
  //       const url = URL.createObjectURL(svgBlob);

  //       return new Promise((resolve) => {
  //         const img = new Image();
  //         img.onload = () => {
  //           const canvas = document.createElement("canvas");
  //           canvas.width = img.width;
  //           canvas.height = img.height;
  //           const ctx = canvas.getContext("2d");
  //           ctx.drawImage(img, 0, 0);
  //           const dataUrl = canvas.toDataURL("image/png");
  //           pdf.addImage(dataUrl, "PNG", margin, 20, logoWidth, logoHeight);
  //           URL.revokeObjectURL(url);
  //           resolve();
  //         };
  //         img.src = url;
  //       });
  //     };

  //     // Improved section layout with better spacing and typography
  //     const addSection = (pdf, title, content, yPosition) => {
  //       // Check if we need a new page
  //       if (yPosition + 30 > pdfHeight - 20) {
  //         pdf.addPage();
  //         addHeader(pdf);
  //         addFooter(pdf);
  //         yPosition = 30;
  //       }

  //       // Add section title
  //       pdf.setFontSize(12);
  //       pdf.setTextColor(...hexToRgb(primaryColor));
  //       pdf.setFont(headingFont, "bold");
  //       pdf.text(title, margin, yPosition);

  //       // Add horizontal line
  //       const lineY = yPosition + 2;
  //       pdf.setDrawColor(220, 220, 220);
  //       pdf.setLineWidth(0.3);
  //       pdf.line(margin, lineY, pdfWidth - margin, lineY);

  //       // Add content with better spacing
  //       pdf.setFontSize(10);
  //       pdf.setTextColor(...hexToRgb(textColor));
  //       pdf.setFont(bodyFont, "normal");
  //       const contentY = yPosition + 8;

  //       // Handle array or string with proper spacing
  //       if (Array.isArray(content)) {
  //         let y = contentY;
  //         content.forEach((line) => {
  //           // Split long lines if needed
  //           const splitText = pdf.splitTextToSize(
  //             `• ${line}`,
  //             contentWidth - 4
  //           );

  //           // Check if we need a new page for this bullet point
  //           if (y + splitText.length * 5 > pdfHeight - 20) {
  //             pdf.addPage();
  //             addHeader(pdf);
  //             addFooter(pdf);
  //             y = 30;
  //           }

  //           pdf.text(splitText, margin, y);
  //           y += splitText.length * 5; // Adjust spacing based on wrapped lines
  //         });
  //         return y + 5; // Return new Y position with padding
  //       } else {
  //         // Split text to fit width
  //         const splitText = pdf.splitTextToSize(content, contentWidth);

  //         // Check if split text needs a new page
  //         if (contentY + splitText.length * 5 > pdfHeight - 20) {
  //           pdf.addPage();
  //           addHeader(pdf);
  //           addFooter(pdf);
  //           pdf.text(splitText, margin, 30);
  //           return 30 + splitText.length * 5 + 5;
  //         } else {
  //           pdf.text(splitText, margin, contentY);
  //           return contentY + splitText.length * 5 + 5; // Better line spacing
  //         }
  //       }
  //     };

  //     // Function to estimate the height needed for a section
  //     const estimateSectionHeight = (pdf, section) => {
  //       // Base height for section title and spacing
  //       let height = 15;

  //       if (section.bullets && section.bullets.length > 0) {
  //         section.bullets.forEach((bullet) => {
  //           const splitText = pdf.splitTextToSize(
  //             `• ${bullet}`,
  //             contentWidth - 4
  //           );
  //           height += splitText.length * 5 + 3; // Add height for each bullet
  //         });
  //       } else if (section.text) {
  //         const splitText = pdf.splitTextToSize(section.text, contentWidth);
  //         height += splitText.length * 5;
  //       }

  //       // Add some margin
  //       height += 10;

  //       return height;
  //     };

  //     // Modified function to add a chart with its related description on the same page
  //     // Optimized for first page content
  //     const addChartWithDescription = (
  //       pdf,
  //       chart,
  //       sections,
  //       startY,
  //       isFirstPage = false
  //     ) => {
  //       let currentY = startY;

  //       // Calculate image dimensions with proper aspect ratio
  //       const imgWidth = contentWidth;
  //       // For first page chart, use a more compact aspect ratio to ensure it fits
  //       let imgHeight;
  //       if (isFirstPage) {
  //         // Limit height for first page to ensure content fits
  //         imgHeight = Math.min((chart.height / chart.width) * imgWidth, 80);
  //       } else {
  //         imgHeight = (chart.height / chart.width) * imgWidth;
  //       }

  //       // Estimate how much space the sections will need
  //       let totalSectionHeight = 0;
  //       sections.forEach((section) => {
  //         totalSectionHeight += estimateSectionHeight(pdf, section);
  //       });

  //       // Check if chart and descriptions fit on current page
  //       if (currentY + imgHeight + totalSectionHeight + 20 > pdfHeight - 20) {
  //         // If they don't fit, start on a new page
  //         pdf.addPage();
  //         addHeader(pdf);
  //         addFooter(pdf);
  //         currentY = 30;
  //       }

  //       // Add chart title
  //       pdf.setFontSize(12);
  //       pdf.setTextColor(...hexToRgb(primaryColor));
  //       pdf.setFont(headingFont, "bold");
  //       pdf.text("Data Visualization", margin, currentY);
  //       currentY += 8;

  //       // Add chart
  //       pdf.addImage(chart.data, "PNG", margin, currentY, imgWidth, imgHeight);
  //       currentY += imgHeight + 10; // Reduced spacing after chart for first page

  //       // Add associated sections with descriptions - more compact on first page
  //       for (let i = 0; i < sections.length; i++) {
  //         const section = sections[i];

  //         // Check if this section will fit on the current page
  //         const sectionHeight = estimateSectionHeight(pdf, section);

  //         if (currentY + sectionHeight > pdfHeight - 20) {
  //           // Section won't fit, start a new page
  //           pdf.addPage();
  //           addHeader(pdf);
  //           addFooter(pdf);
  //           currentY = 30;
  //         }

  //         // Add section title
  //         pdf.setFontSize(12);
  //         pdf.setTextColor(...hexToRgb(primaryColor));
  //         pdf.setFont(headingFont, "bold");
  //         pdf.text(section.title, margin, currentY);

  //         // Add horizontal line
  //         pdf.setDrawColor(...hexToRgb(accentColor));
  //         pdf.setLineWidth(0.3);
  //         const lineWidth = Math.min(
  //           contentWidth,
  //           Math.max(
  //             40,
  //             (pdf.getStringUnitWidth(section.title) * 12) /
  //               pdf.internal.scaleFactor +
  //               10
  //           )
  //         );
  //         pdf.line(margin, currentY + 2, margin + lineWidth, currentY + 2);

  //         currentY += 8;

  //         // Add bullet points - more compact if on first page
  //         pdf.setFontSize(10);
  //         pdf.setTextColor(...hexToRgb(textColor));
  //         pdf.setFont(bodyFont, "normal");

  //         // Use more compact line spacing for first page
  //         const lineSpacing = isFirstPage ? 4 : 5;

  //         if (section.bullets && section.bullets.length > 0) {
  //           section.bullets.forEach((bullet) => {
  //             // Skip empty bullets
  //             if (!bullet || bullet.trim().length === 0) return;

  //             // Split long bullet points
  //             const splitText = pdf.splitTextToSize(
  //               `• ${bullet}`,
  //               contentWidth - 4
  //             );

  //             // Check if we need a new page
  //             if (currentY + splitText.length * lineSpacing > pdfHeight - 20) {
  //               pdf.addPage();
  //               addHeader(pdf);
  //               addFooter(pdf);
  //               currentY = 30;
  //             }

  //             pdf.text(splitText, margin, currentY);
  //             currentY +=
  //               splitText.length * lineSpacing + (isFirstPage ? 2 : 3);
  //           });
  //         } else if (section.text) {
  //           // If there are no bullets, but there is text
  //           const splitText = pdf.splitTextToSize(section.text, contentWidth);

  //           // Check if we need a new page
  //           if (currentY + splitText.length * lineSpacing > pdfHeight - 20) {
  //             pdf.addPage();
  //             addHeader(pdf);
  //             addFooter(pdf);
  //             currentY = 30;
  //           }

  //           pdf.text(splitText, margin, currentY);
  //           currentY += splitText.length * lineSpacing;
  //         }

  //         currentY += isFirstPage ? 5 : 8; // Less space after section on first page
  //       }

  //       return currentY;
  //     };

  //     // Helper function to format date
  //     function formatDate(date) {
  //       const options = { year: "numeric", month: "long", day: "numeric" };
  //       return new Date(date).toLocaleDateString("en-US", options);
  //     }

  //     // Hex to RGB conversion helper
  //     function hexToRgb(hex) {
  //       hex = hex.replace(/^#/, "");
  //       const bigint = parseInt(hex, 16);
  //       const r = (bigint >> 16) & 255;
  //       const g = (bigint >> 8) & 255;
  //       const b = bigint & 255;
  //       return [r, g, b];
  //     }

  //     // FIRST PAGE - Cover page with improved layout and immediate content
  //     await addLogo(pdf);

  //     // Add title with better typography - reduced vertical space
  //     pdf.setFontSize(18); // Even smaller for more compact layout
  //     pdf.setTextColor(...hexToRgb(primaryColor));
  //     pdf.setFont(headingFont, "bold");
  //     pdf.text("Influenza Analysis Report", margin, 38); // Move up for more space

  //     // Add subtitle with minimal spacing
  //     pdf.setFontSize(11); // Smaller for more compact layout
  //     pdf.setTextColor(...hexToRgb(textColor));
  //     pdf.setFont(headingFont, "normal");
  //     const today = formatDate(new Date());
  //     pdf.text(`Report Date: ${today}`, margin, 45); // Reduced Y position

  //     // Parse the summary for structured content
  //     console.log("Summary before parsing:", summary);
  //     const parsedSummary = parseSummary(summary);
  //     console.log("Parsed summary:", parsedSummary);

  //     // Make sure we're handling the full "Positive vs. Negative Cases Over Time" section
  //     // Check if the first bullet about spike in November is missing
  //     let hasSpikeInNovemberBullet = false;

  //     parsedSummary.sections.forEach((section) => {
  //       if (section.title.includes("Positive vs. Negative Cases")) {
  //         hasSpikeInNovemberBullet = section.bullets.some(
  //           (bullet) =>
  //             bullet.toLowerCase().includes("spike") &&
  //             bullet.toLowerCase().includes("november")
  //         );
  //       }
  //     });

  //     // If the spike bullet is missing, manually add it
  //     if (!hasSpikeInNovemberBullet) {
  //       for (let i = 0; i < parsedSummary.sections.length; i++) {
  //         if (
  //           parsedSummary.sections[i].title.includes(
  //             "Positive vs. Negative Cases"
  //           )
  //         ) {
  //           parsedSummary.sections[i].bullets.unshift(
  //             "There is a noticeable spike in positive cases around mid-November 2024, reaching a peak before declining by early December 2024."
  //           );
  //           break;
  //         }
  //       }
  //     }

  //     // Hide download button before capturing charts
  //     // This approach modifies the DOM directly, but keeps it simple
  //     const downloadButtons = document.querySelectorAll("#downloadchart");
  //     downloadButtons.forEach((btn) => {
  //       btn.style.display = "none";
  //     });

  //     // Capture charts using the original method
  //     const chartImages = await captureChartsAsImages();

  //     // Show download buttons again after capturing
  //     downloadButtons.forEach((btn) => {
  //       btn.style.display = "block";
  //     });

  //     // Group sections by chart for more meaningful presentation
  //     const chartSections = {};

  //     // Associate sections with charts based on content matching
  //     if (parsedSummary.sections.length > 0 && chartImages.length > 0) {
  //       chartSections[0] = []; // Initialize array for first chart

  //       parsedSummary.sections.forEach((section) => {
  //         // Determine which chart this section relates to by content
  //         if (section.title.includes("Positive vs. Negative Cases")) {
  //           // This likely relates to the first chart (case counts)
  //           chartSections[0].push({
  //             title: section.title,
  //             bullets: section.bullets,
  //           });
  //         } else if (
  //           section.title.includes("Percent Positive") ||
  //           section.title.includes("CDC")
  //         ) {
  //           // This likely relates to the second chart (percentages)
  //           if (!chartSections[1]) chartSections[1] = [];
  //           chartSections[1].push({
  //             title: section.title,
  //             bullets: section.bullets,
  //           });
  //         } else {
  //           // General observations or other sections - associate with first chart by default
  //           chartSections[0].push({
  //             title: section.title,
  //             bullets: section.bullets,
  //           });
  //         }
  //       });
  //     }

  //     // Start content right after the title - much higher on first page
  //     let currentPosition = 50; // Reduced starting position even more

  //     // Add first chart with its description - ensuring it fits on first page
  //     // Pass isFirstPage=true to use more compact layout
  //     if (chartImages.length > 0 && chartSections[0]) {
  //       currentPosition = addChartWithDescription(
  //         pdf,
  //         chartImages[0],
  //         chartSections[0],
  //         currentPosition,
  //         true // Indicate this is first page for more compact layout
  //       );
  //     }

  //     // Add executive summary if applicable
  //     if (parsedSummary.mainText && parsedSummary.mainText.trim().length > 0) {
  //       // Check if we need a new page
  //       if (currentPosition + 80 > pdfHeight - 20) {
  //         pdf.addPage();
  //         addHeader(pdf);
  //         addFooter(pdf);
  //         currentPosition = 30;
  //       }

  //       // Add executive summary
  //       pdf.setFontSize(14);
  //       pdf.setTextColor(...hexToRgb(accentColor));
  //       pdf.setFont(headingFont, "bold");
  //       pdf.text("Executive Summary", margin, currentPosition);

  //       // Add underline
  //       pdf.setDrawColor(...hexToRgb(accentColor));
  //       pdf.setLineWidth(0.5);
  //       pdf.line(
  //         margin,
  //         currentPosition + 2,
  //         margin +
  //           (pdf.getStringUnitWidth("Executive Summary") * 14) /
  //             pdf.internal.scaleFactor,
  //         currentPosition + 2
  //       );

  //       // Add main text with background
  //       const splitText = pdf.splitTextToSize(
  //         parsedSummary.mainText,
  //         contentWidth
  //       );
  //       const boxHeight = splitText.length * 5 + 10;

  //       // Check if box will fit on this page
  //       if (currentPosition + boxHeight + 20 > pdfHeight - 20) {
  //         pdf.addPage();
  //         addHeader(pdf);
  //         addFooter(pdf);
  //         currentPosition = 30;

  //         // Re-add title on new page
  //         pdf.setFontSize(14);
  //         pdf.setTextColor(...hexToRgb(accentColor));
  //         pdf.setFont(headingFont, "bold");
  //         pdf.text("Executive Summary", margin, currentPosition);

  //         // Add underline
  //         pdf.setDrawColor(...hexToRgb(accentColor));
  //         pdf.setLineWidth(0.5);
  //         pdf.line(
  //           margin,
  //           currentPosition + 2,
  //           margin +
  //             (pdf.getStringUnitWidth("Executive Summary") * 14) /
  //               pdf.internal.scaleFactor,
  //           currentPosition + 2
  //         );

  //         currentPosition += 10;
  //       } else {
  //         currentPosition += 10;
  //       }

  //       // Add background and text
  //       pdf.setFillColor(...hexToRgb(lightGrayBg));
  //       pdf.roundedRect(
  //         margin - 2,
  //         currentPosition,
  //         contentWidth + 4,
  //         boxHeight,
  //         2,
  //         2,
  //         "F"
  //       );

  //       pdf.setFontSize(10);
  //       pdf.setTextColor(...hexToRgb(textColor));
  //       pdf.setFont(bodyFont, "normal");
  //       pdf.text(splitText, margin, currentPosition + 5);

  //       currentPosition += boxHeight + 15;
  //     }

  //     // Add second chart with its description if available
  //     if (chartImages.length > 1 && chartSections[1]) {
  //       // Check if we need a new page
  //       if (currentPosition + 150 > pdfHeight - 20) {
  //         pdf.addPage();
  //         addHeader(pdf);
  //         addFooter(pdf);
  //         currentPosition = 30;
  //       }

  //       currentPosition = addChartWithDescription(
  //         pdf,
  //         chartImages[1],
  //         chartSections[1],
  //         currentPosition
  //       );
  //     }

  //     // Add footer to the last page
  //     addFooter(pdf);

  //     // Save the PDF with quality settings
  //     pdf.save("influenza-analysis-report.pdf");

  //     return true;
  //   } catch (error) {
  //     console.error("Error generating PDF:", error);
  //     setError(`PDF Generation Error: ${error.message}`);
  //     setShowErrorPopup(true);
  //     return false;
  //   } finally {
  //     setIsGenerating(false);
  //   }
  // };

  // const generatePDF = async () => {
  //   setIsGenerating(true);

  //   try {
  //     // Generate the summary before creating the PDF
  //     const summary = await generateSummary();
  //     console.log("Summary:", summary);

  //     if (!summary) {
  //       throw new Error("Failed to generate report summary");
  //     }

  //     // Initialize PDF with better quality settings
  //     const pdf = new jsPDF({
  //       orientation: "portrait",
  //       unit: "mm",
  //       format: "a4",
  //       compress: true,
  //     });

  //     // Calculate PDF dimensions
  //     const pdfWidth = pdf.internal.pageSize.getWidth();
  //     const pdfHeight = pdf.internal.pageSize.getHeight();
  //     const margin = 15;
  //     const contentWidth = pdfWidth - margin * 2;

  //     // Set document metadata - using generic information
  //     pdf.setProperties({
  //       title: "Influenza Analysis Report",
  //       subject: "Influenza Surveillance",
  //       keywords: "influenza, healthcare, analysis",
  //     });

  //     // Define colors for a more professional look
  //     const primaryColor = "#0C1E46"; // Dark blue
  //     const accentColor = "#A0171C"; // Red
  //     const textColor = "#333333"; // Dark gray
  //     const lightGrayBg = "#F8F9FA"; // Light gray background
  //     const headingFont = "helvetica";
  //     const bodyFont = "helvetica";

  //     // Logo dimensions
  //     const logoWidth = 45;
  //     const logoHeight = 14;

  //     // SVG Logo
  //     const svgLogo = `
  //       <svg baseProfile="tiny" height="125" version="1.2" width="249" xmlns="http://www.w3.org/2000/svg" xmlns:ev="http://www.w3.org/2001/xml-events" xmlns:xlink="http://www.w3.org/1999/xlink"><defs /><path d="M 69,74 68,75 67,75 66,76 66,81 68,83 72,83 73,82 74,82 74,80 75,79 75,78 74,77 74,76 72,74 Z" fill="#A0171C" stroke="none" /><path d="M 26,58 25,59 24,59 22,61 22,65 24,67 29,67 30,66 31,66 31,65 32,64 32,62 31,61 31,60 30,59 29,59 28,58 Z" fill="#A0171C" stroke="none" /><path d="M 99,51 96,54 96,57 97,58 97,59 98,60 103,60 105,58 105,54 104,53 104,52 103,52 102,51 Z" fill="#A0171C" stroke="none" /><path d="M 202,42 202,83 209,83 209,70 210,69 225,69 226,68 227,68 228,67 229,67 232,64 232,63 233,62 233,60 234,59 234,52 233,51 233,49 232,48 232,47 230,45 229,45 227,43 223,43 222,42 Z" fill="#0C1E46" stroke="none" /><path d="M 169,42 169,83 196,83 196,78 176,78 175,77 175,42 Z" fill="#0C1E46" stroke="none" /><path d="M 126,42 125,43 125,83 132,83 132,66 133,65 153,65 154,66 154,83 161,83 161,42 155,42 154,43 154,59 153,60 133,60 132,59 132,42 Z" fill="#0C1E46" stroke="none" /><path d="M 112,42 112,69 118,69 119,68 119,43 118,42 Z" fill="#A0171C" stroke="none" /><path d="M 83,42 83,83 89,83 89,42 Z" fill="#A0171C" stroke="none" /><path d="M 53,42 52,43 52,83 59,83 59,42 Z" fill="#A0171C" stroke="none" /><path d="M 40,42 39,43 39,83 46,83 46,42 Z" fill="#A0171C" stroke="none" /><path d="M 8,42 8,83 15,83 15,43 14,42 Z" fill="#A0171C" stroke="none" /></svg>
  //     `;

  //     // Enhanced summary parsing function with better handling of sections and bullet points
  //     const parseSummary = (summaryText) => {
  //       // Initialize the structure to hold parsed sections
  //       const parsedSummary = {
  //         mainText: "",
  //         sections: [],
  //       };

  //       // Check for Korean characters and determine if we need to translate
  //       const hasKoreanText =
  //         /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7A3]/.test(
  //           summaryText
  //         );

  //       // Clean up the summary text and remove language prefixes
  //       let cleanText = summaryText;

  //       // Remove "Summary:" prefix if present
  //       if (cleanText.startsWith("Summary:")) {
  //         cleanText = cleanText.substring("Summary:".length).trim();
  //       }

  //       // Remove Korean language indicators if present
  //       if (hasKoreanText && cleanText.includes("여기서 Summary:")) {
  //         const koreanPrefixIndex = cleanText.indexOf("여기서 Summary:");
  //         cleanText = cleanText
  //           .substring(koreanPrefixIndex + "여기서 Summary:".length)
  //           .trim();
  //       }

  //       // Extract main text (if any) before the first bold section header
  //       const firstBoldSectionIndex = cleanText.indexOf("- **");
  //       if (firstBoldSectionIndex > 0) {
  //         parsedSummary.mainText = cleanText
  //           .substring(0, firstBoldSectionIndex)
  //           .trim();
  //       } else if (firstBoldSectionIndex === -1) {
  //         // If no bold sections, use the first paragraph as main text
  //         const paragraphs = cleanText
  //           .split("\n\n")
  //           .filter((p) => p.trim().length > 0);
  //         if (paragraphs.length > 0) {
  //           parsedSummary.mainText = paragraphs[0];
  //         }
  //       }

  //       // Extract sections using bold headers - comprehensive approach
  //       // This regex matches sections marked with bold markers '**'
  //       const sectionRegex = /- \*\*(.*?):\*\*([\s\S]*?)(?=- \*\*|$)/g;
  //       let sectionMatch;

  //       while ((sectionMatch = sectionRegex.exec(cleanText)) !== null) {
  //         const sectionTitle = sectionMatch[1].trim();
  //         const sectionContent = sectionMatch[2].trim();

  //         // Extract bullet points from the section content
  //         const bullets = [];

  //         // Look for bullet points (lines starting with -)
  //         const bulletLines = sectionContent
  //           .split("\n")
  //           .map((line) => line.trim())
  //           .filter((line) => line.startsWith("-"));

  //         if (bulletLines.length > 0) {
  //           // Process each bullet point
  //           bulletLines.forEach((bulletLine) => {
  //             // Remove the bullet marker and trim
  //             const bulletText = bulletLine.substring(1).trim();
  //             if (bulletText) {
  //               bullets.push(bulletText);
  //             }
  //           });
  //         } else {
  //           // If no explicit bullet points found, treat the whole content as one point
  //           bullets.push(sectionContent);
  //         }

  //         // Add the section with its bullets
  //         parsedSummary.sections.push({
  //           title: sectionTitle,
  //           bullets: bullets,
  //         });
  //       }

  //       // If no sections were found using the bold pattern, try fallback methods
  //       if (parsedSummary.sections.length === 0) {
  //         // Try to identify sections by line breaks and indentation patterns
  //         const lines = cleanText
  //           .split("\n")
  //           .map((line) => line.trim())
  //           .filter((line) => line.length > 0);

  //         let currentSection = null;
  //         let currentBullets = [];

  //         lines.forEach((line) => {
  //           // Check if this line looks like a section header (ends with a colon)
  //           if (line.endsWith(":") && !line.startsWith("-")) {
  //             // If we have a previous section, save it
  //             if (currentSection) {
  //               parsedSummary.sections.push({
  //                 title: currentSection,
  //                 bullets: currentBullets,
  //               });
  //             }

  //             // Start a new section
  //             currentSection = line.substring(0, line.length - 1).trim();
  //             currentBullets = [];
  //           }
  //           // Check if this line is a bullet point
  //           else if (line.startsWith("-")) {
  //             // If we don't have a current section, create a generic one
  //             if (!currentSection) {
  //               currentSection = "Key Findings";
  //             }

  //             const bulletText = line.substring(1).trim();
  //             if (bulletText) {
  //               currentBullets.push(bulletText);
  //             }
  //           }
  //         });

  //         // Add the last section if there is one
  //         if (currentSection && currentBullets.length > 0) {
  //           parsedSummary.sections.push({
  //             title: currentSection,
  //             bullets: currentBullets,
  //           });
  //         }
  //       }

  //       // If we still have no sections, create a fallback from the whole text
  //       if (
  //         parsedSummary.sections.length === 0 &&
  //         cleanText.trim().length > 0
  //       ) {
  //         const bullets = extractBulletPoints(cleanText);

  //         parsedSummary.sections.push({
  //           title: "Key Findings",
  //           bullets: bullets.length > 0 ? bullets : [cleanText.trim()],
  //         });
  //       }

  //       return parsedSummary;
  //     };

  //     // Helper function to extract bullet points from text
  //     const extractBulletPoints = (text) => {
  //       // First try to find explicit bullet markers
  //       const bulletRegex = /(?:^|\n)\s*[-•*]\s*([^\n]+)/g;
  //       const matches = [...text.matchAll(bulletRegex)];

  //       if (matches.length > 0) {
  //         return matches.map((match) => match[1].trim());
  //       }

  //       // If no bullets found, try splitting by sentences for natural bullets
  //       const sentences = text
  //         .split(/\.(?:\s|$)/)
  //         .map((s) => s.trim())
  //         .filter((s) => s.length > 0);

  //       return sentences;
  //     };

  //     // Function to add watermark
  //     const addWatermark = (pdf) => {
  //       pdf.saveGraphicsState();
  //       pdf.setGState(new pdf.GState({ opacity: 0.05 }));
  //       pdf.setFontSize(60);
  //       pdf.setTextColor(100, 100, 100);
  //       pdf.setFont(headingFont, "bold");
  //       pdf.restoreGraphicsState();
  //     };

  //     // Improved header with cleaner design
  //     const addHeader = (pdf, pageTitle = "") => {
  //       // Draw header bar
  //       pdf.setFillColor(...hexToRgb(primaryColor));
  //       pdf.rect(0, 0, pdfWidth, 12, "F");

  //       // Add header text
  //       pdf.setFontSize(8);
  //       pdf.setTextColor(255, 255, 255);
  //       pdf.setFont(bodyFont, "normal");

  //       const reportTitle = "Influenza Analysis Report";
  //       const dateText = "Generated on " + new Date().toLocaleDateString();

  //       pdf.text(reportTitle, margin, 8);
  //       pdf.text(dateText, pdfWidth - margin, 8, { align: "right" });

  //       // Add subtitle if provided
  //       if (pageTitle) {
  //         pdf.setFontSize(14);
  //         pdf.setTextColor(...hexToRgb(accentColor));
  //         pdf.setFont(headingFont, "bold");
  //         pdf.text(pageTitle, margin, 24);

  //         // Add subtle underline
  //         pdf.setDrawColor(...hexToRgb(accentColor));
  //         pdf.setLineWidth(0.5);
  //         pdf.line(
  //           margin,
  //           26,
  //           margin +
  //             Math.min(
  //               50,
  //               (pdf.getStringUnitWidth(pageTitle) * 14) /
  //                 pdf.internal.scaleFactor
  //             ),
  //           26
  //         );
  //       }
  //     };

  //     // Improved footer with cleaner design
  //     const addFooter = (pdf) => {
  //       // Draw footer bar
  //       pdf.setFillColor(...hexToRgb(primaryColor));
  //       pdf.rect(0, pdfHeight - 10, pdfWidth, 10, "F");

  //       // Add footer text
  //       pdf.setFontSize(7);
  //       pdf.setTextColor(255, 255, 255);
  //       pdf.setFont(bodyFont, "normal");

  //       const pageNumber = pdf.internal.getNumberOfPages();

  //       // Using a more generic footer without confidentiality markings
  //       pdf.text(`Page ${pageNumber}`, pdfWidth - margin, pdfHeight - 4, {
  //         align: "right",
  //       });
  //     };

  //     // Add logo with proper positioning
  //     const addLogo = async (pdf) => {
  //       const svgBlob = new Blob([svgLogo], { type: "image/svg+xml" });
  //       const url = URL.createObjectURL(svgBlob);

  //       return new Promise((resolve) => {
  //         const img = new Image();
  //         img.onload = () => {
  //           const canvas = document.createElement("canvas");
  //           canvas.width = img.width;
  //           canvas.height = img.height;
  //           const ctx = canvas.getContext("2d");
  //           ctx.drawImage(img, 0, 0);
  //           const dataUrl = canvas.toDataURL("image/png");
  //           pdf.addImage(dataUrl, "PNG", margin, 20, logoWidth, logoHeight);
  //           URL.revokeObjectURL(url);
  //           resolve();
  //         };
  //         img.src = url;
  //       });
  //     };

  //     // Improved section layout with better spacing and typography
  //     const addSection = (pdf, title, content, yPosition) => {
  //       // Check if we need a new page
  //       if (yPosition + 30 > pdfHeight - 20) {
  //         pdf.addPage();
  //         addHeader(pdf);
  //         addFooter(pdf);
  //         yPosition = 30;
  //       }

  //       // Add section title
  //       pdf.setFontSize(12);
  //       pdf.setTextColor(...hexToRgb(primaryColor));
  //       pdf.setFont(headingFont, "bold");
  //       pdf.text(title, margin, yPosition);

  //       // Add horizontal line
  //       const lineY = yPosition + 2;
  //       pdf.setDrawColor(220, 220, 220);
  //       pdf.setLineWidth(0.3);
  //       pdf.line(margin, lineY, pdfWidth - margin, lineY);

  //       // Add content with better spacing
  //       pdf.setFontSize(10);
  //       pdf.setTextColor(...hexToRgb(textColor));
  //       pdf.setFont(bodyFont, "normal");
  //       const contentY = yPosition + 8;

  //       // Handle array or string with proper spacing
  //       if (Array.isArray(content)) {
  //         let y = contentY;
  //         content.forEach((line) => {
  //           // Split long lines if needed
  //           const splitText = pdf.splitTextToSize(
  //             `• ${line}`,
  //             contentWidth - 4
  //           );

  //           // Check if we need a new page for this bullet point
  //           if (y + splitText.length * 5 > pdfHeight - 20) {
  //             pdf.addPage();
  //             addHeader(pdf);
  //             addFooter(pdf);
  //             y = 30;
  //           }

  //           pdf.text(splitText, margin, y);
  //           y += splitText.length * 5; // Adjust spacing based on wrapped lines
  //         });
  //         return y + 5; // Return new Y position with padding
  //       } else {
  //         // Split text to fit width
  //         const splitText = pdf.splitTextToSize(content, contentWidth);

  //         // Check if split text needs a new page
  //         if (contentY + splitText.length * 5 > pdfHeight - 20) {
  //           pdf.addPage();
  //           addHeader(pdf);
  //           addFooter(pdf);
  //           pdf.text(splitText, margin, 30);
  //           return 30 + splitText.length * 5 + 5;
  //         } else {
  //           pdf.text(splitText, margin, contentY);
  //           return contentY + splitText.length * 5 + 5; // Better line spacing
  //         }
  //       }
  //     };

  //     // Function to estimate the height needed for a section
  //     const estimateSectionHeight = (pdf, section) => {
  //       // Base height for section title and spacing
  //       let height = 15;

  //       if (section.bullets && section.bullets.length > 0) {
  //         section.bullets.forEach((bullet) => {
  //           const splitText = pdf.splitTextToSize(
  //             `• ${bullet}`,
  //             contentWidth - 4
  //           );
  //           height += splitText.length * 5 + 3; // Add height for each bullet
  //         });
  //       } else if (section.text) {
  //         const splitText = pdf.splitTextToSize(section.text, contentWidth);
  //         height += splitText.length * 5;
  //       }

  //       // Add some margin
  //       height += 10;

  //       return height;
  //     };

  //     // Modified function to add a chart with its related description on the same page
  //     // Optimized for first page content
  //     const addChartWithDescription = (
  //       pdf,
  //       chart,
  //       sections,
  //       startY,
  //       isFirstPage = false
  //     ) => {
  //       let currentY = startY;

  //       // Calculate image dimensions with proper aspect ratio
  //       const imgWidth = contentWidth;
  //       // For first page chart, use a more compact aspect ratio to ensure it fits
  //       let imgHeight;
  //       if (isFirstPage) {
  //         // Limit height for first page to ensure content fits
  //         imgHeight = Math.min((chart.height / chart.width) * imgWidth, 80);
  //       } else {
  //         imgHeight = (chart.height / chart.width) * imgWidth;
  //       }

  //       // Estimate how much space the sections will need
  //       let totalSectionHeight = 0;
  //       sections.forEach((section) => {
  //         totalSectionHeight += estimateSectionHeight(pdf, section);
  //       });

  //       // Check if chart and descriptions fit on current page
  //       if (currentY + imgHeight + totalSectionHeight + 20 > pdfHeight - 20) {
  //         // If they don't fit, start on a new page
  //         pdf.addPage();
  //         addHeader(pdf);
  //         addFooter(pdf);
  //         currentY = 30;
  //       }

  //       // Add chart title
  //       pdf.setFontSize(12);
  //       pdf.setTextColor(...hexToRgb(primaryColor));
  //       pdf.setFont(headingFont, "bold");
  //       pdf.text("Data Visualization", margin, currentY);
  //       currentY += 8;

  //       // Add chart
  //       pdf.addImage(chart.data, "PNG", margin, currentY, imgWidth, imgHeight);
  //       currentY += imgHeight + 10; // Reduced spacing after chart for first page

  //       // Add associated sections with descriptions - more compact on first page
  //       for (let i = 0; i < sections.length; i++) {
  //         const section = sections[i];

  //         // Check if this section will fit on the current page
  //         const sectionHeight = estimateSectionHeight(pdf, section);

  //         // More aggressive check for first page to account for footer
  //         const maxY = isFirstPage ? pdfHeight - 30 : pdfHeight - 20;

  //         if (currentY + sectionHeight > maxY) {
  //           // Section won't fit, start a new page
  //           pdf.addPage();
  //           addHeader(pdf);
  //           addFooter(pdf);
  //           currentY = 30;
  //         }

  //         // Add section title
  //         pdf.setFontSize(12);
  //         pdf.setTextColor(...hexToRgb(primaryColor));
  //         pdf.setFont(headingFont, "bold");
  //         pdf.text(section.title, margin, currentY);

  //         // Add horizontal line
  //         pdf.setDrawColor(...hexToRgb(accentColor));
  //         pdf.setLineWidth(0.3);
  //         const lineWidth = Math.min(
  //           contentWidth,
  //           Math.max(
  //             40,
  //             (pdf.getStringUnitWidth(section.title) * 12) /
  //               pdf.internal.scaleFactor +
  //               10
  //           )
  //         );
  //         pdf.line(margin, currentY + 2, margin + lineWidth, currentY + 2);

  //         currentY += 8;

  //         // Add bullet points - more compact if on first page
  //         pdf.setFontSize(10);
  //         pdf.setTextColor(...hexToRgb(textColor));
  //         pdf.setFont(bodyFont, "normal");

  //         // Use more compact line spacing for first page
  //         const lineSpacing = isFirstPage ? 4 : 5;

  //         if (section.bullets && section.bullets.length > 0) {
  //           section.bullets.forEach((bullet) => {
  //             // Skip empty bullets
  //             if (!bullet || bullet.trim().length === 0) return;

  //             // Split long bullet points
  //             const splitText = pdf.splitTextToSize(
  //               `• ${bullet}`,
  //               contentWidth - 4
  //             );

  //             // Check if we need a new page
  //             if (currentY + splitText.length * lineSpacing > maxY) {
  //               pdf.addPage();
  //               addHeader(pdf);
  //               addFooter(pdf);
  //               currentY = 30;
  //             }

  //             pdf.text(splitText, margin, currentY);
  //             currentY +=
  //               splitText.length * lineSpacing + (isFirstPage ? 2 : 3);
  //           });
  //         } else if (section.text) {
  //           // If there are no bullets, but there is text
  //           const splitText = pdf.splitTextToSize(section.text, contentWidth);

  //           // Check if we need a new page
  //           if (currentY + splitText.length * lineSpacing > maxY) {
  //             pdf.addPage();
  //             addHeader(pdf);
  //             addFooter(pdf);
  //             currentY = 30;
  //           }

  //           pdf.text(splitText, margin, currentY);
  //           currentY += splitText.length * lineSpacing;
  //         }

  //         currentY += isFirstPage ? 5 : 8; // Less space after section on first page
  //       }

  //       return currentY;
  //     };

  //     // Helper function to format date
  //     function formatDate(date) {
  //       const options = { year: "numeric", month: "long", day: "numeric" };
  //       return new Date(date).toLocaleDateString("en-US", options);
  //     }

  //     // Hex to RGB conversion helper
  //     function hexToRgb(hex) {
  //       hex = hex.replace(/^#/, "");
  //       const bigint = parseInt(hex, 16);
  //       const r = (bigint >> 16) & 255;
  //       const g = (bigint >> 8) & 255;
  //       const b = bigint & 255;
  //       return [r, g, b];
  //     }

  //     // FIRST PAGE - Cover page with improved layout and immediate content
  //     await addLogo(pdf);

  //     // Add title with better typography - reduced vertical space
  //     pdf.setFontSize(18); // Even smaller for more compact layout
  //     pdf.setTextColor(...hexToRgb(primaryColor));
  //     pdf.setFont(headingFont, "bold");
  //     pdf.text("Influenza Analysis Report", margin, 38); // Move up for more space

  //     // Add subtitle with minimal spacing
  //     pdf.setFontSize(11); // Smaller for more compact layout
  //     pdf.setTextColor(...hexToRgb(textColor));
  //     pdf.setFont(headingFont, "normal");
  //     const today = formatDate(new Date());
  //     pdf.text(`Report Date: ${today}`, margin, 45); // Reduced Y position

  //     // Add footer to the first page as well
  //     addFooter(pdf);

  //     // Parse the summary for structured content
  //     console.log("Summary before parsing:", summary);
  //     const parsedSummary = parseSummary(summary);
  //     console.log("Parsed summary:", parsedSummary);

  //     // Make sure we're handling the full "Positive vs. Negative Cases Over Time" section
  //     // Check if the first bullet about spike in November is missing
  //     let hasSpikeInNovemberBullet = false;

  //     parsedSummary.sections.forEach((section) => {
  //       if (section.title.includes("Positive vs. Negative Cases")) {
  //         hasSpikeInNovemberBullet = section.bullets.some(
  //           (bullet) =>
  //             bullet.toLowerCase().includes("spike") &&
  //             bullet.toLowerCase().includes("november")
  //         );
  //       }
  //     });

  //     // If the spike bullet is missing, manually add it
  //     if (!hasSpikeInNovemberBullet) {
  //       for (let i = 0; i < parsedSummary.sections.length; i++) {
  //         if (
  //           parsedSummary.sections[i].title.includes(
  //             "Positive vs. Negative Cases"
  //           )
  //         ) {
  //           parsedSummary.sections[i].bullets.unshift(
  //             "There is a noticeable spike in positive cases around mid-November 2024, reaching a peak before declining by early December 2024."
  //           );
  //           break;
  //         }
  //       }
  //     }

  //     // Hide download button before capturing charts
  //     // This approach modifies the DOM directly, but keeps it simple
  //     const downloadButtons = document.querySelectorAll("#downloadchart");
  //     downloadButtons.forEach((btn) => {
  //       btn.style.display = "none";
  //     });

  //     // Capture charts using the original method
  //     const chartImages = await captureChartsAsImages();

  //     // Show download buttons again after capturing
  //     downloadButtons.forEach((btn) => {
  //       btn.style.display = "block";
  //     });

  //     // Group sections by chart for more meaningful presentation
  //     const chartSections = {};

  //     // Associate sections with charts based on content matching
  //     if (parsedSummary.sections.length > 0 && chartImages.length > 0) {
  //       chartSections[0] = []; // Initialize array for first chart

  //       parsedSummary.sections.forEach((section) => {
  //         // Determine which chart this section relates to by content
  //         if (section.title.includes("Positive vs. Negative Cases")) {
  //           // This likely relates to the first chart (case counts)
  //           chartSections[0].push({
  //             title: section.title,
  //             bullets: section.bullets,
  //           });
  //         } else if (
  //           section.title.includes("Percent Positive") ||
  //           section.title.includes("CDC")
  //         ) {
  //           // This likely relates to the second chart (percentages)
  //           if (!chartSections[1]) chartSections[1] = [];
  //           chartSections[1].push({
  //             title: section.title,
  //             bullets: section.bullets,
  //           });
  //         } else {
  //           // General observations or other sections - associate with first chart by default
  //           chartSections[0].push({
  //             title: section.title,
  //             bullets: section.bullets,
  //           });
  //         }
  //       });
  //     }

  //     // Start content right after the title - much higher on first page
  //     let currentPosition = 50; // Reduced starting position even more

  //     // Add first chart with its description - ensuring it fits on first page
  //     // Pass isFirstPage=true to use more compact layout
  //     if (chartImages.length > 0 && chartSections[0]) {
  //       currentPosition = addChartWithDescription(
  //         pdf,
  //         chartImages[0],
  //         chartSections[0],
  //         currentPosition,
  //         true // Indicate this is first page for more compact layout
  //       );
  //     }

  //     // Add executive summary if applicable
  //     if (parsedSummary.mainText && parsedSummary.mainText.trim().length > 0) {
  //       // Check if we need a new page
  //       if (currentPosition + 80 > pdfHeight - 20) {
  //         pdf.addPage();
  //         addHeader(pdf);
  //         addFooter(pdf);
  //         currentPosition = 30;
  //       }

  //       // Add executive summary
  //       pdf.setFontSize(14);
  //       pdf.setTextColor(...hexToRgb(accentColor));
  //       pdf.setFont(headingFont, "bold");
  //       pdf.text("Executive Summary", margin, currentPosition);

  //       // Add underline
  //       pdf.setDrawColor(...hexToRgb(accentColor));
  //       pdf.setLineWidth(0.5);
  //       pdf.line(
  //         margin,
  //         currentPosition + 2,
  //         margin +
  //           (pdf.getStringUnitWidth("Executive Summary") * 14) /
  //             pdf.internal.scaleFactor,
  //         currentPosition + 2
  //       );

  //       // Add main text with background
  //       const splitText = pdf.splitTextToSize(
  //         parsedSummary.mainText,
  //         contentWidth
  //       );
  //       const boxHeight = splitText.length * 5 + 10;

  //       // Check if box will fit on this page
  //       if (currentPosition + boxHeight + 20 > pdfHeight - 20) {
  //         pdf.addPage();
  //         addHeader(pdf);
  //         addFooter(pdf);
  //         currentPosition = 30;

  //         // Re-add title on new page
  //         pdf.setFontSize(14);
  //         pdf.setTextColor(...hexToRgb(accentColor));
  //         pdf.setFont(headingFont, "bold");
  //         pdf.text("Executive Summary", margin, currentPosition);

  //         // Add underline
  //         pdf.setDrawColor(...hexToRgb(accentColor));
  //         pdf.setLineWidth(0.5);
  //         pdf.line(
  //           margin,
  //           currentPosition + 2,
  //           margin +
  //             (pdf.getStringUnitWidth("Executive Summary") * 14) /
  //               pdf.internal.scaleFactor,
  //           currentPosition + 2
  //         );

  //         currentPosition += 10;
  //       } else {
  //         currentPosition += 10;
  //       }

  //       // Add background and text
  //       pdf.setFillColor(...hexToRgb(lightGrayBg));
  //       pdf.roundedRect(
  //         margin - 2,
  //         currentPosition,
  //         contentWidth + 4,
  //         boxHeight,
  //         2,
  //         2,
  //         "F"
  //       );

  //       pdf.setFontSize(10);
  //       pdf.setTextColor(...hexToRgb(textColor));
  //       pdf.setFont(bodyFont, "normal");
  //       pdf.text(splitText, margin, currentPosition + 5);

  //       currentPosition += boxHeight + 15;
  //     }

  //     // Add second chart with its description if available
  //     if (chartImages.length > 1 && chartSections[1]) {
  //       // Check if we need a new page
  //       if (currentPosition + 150 > pdfHeight - 20) {
  //         pdf.addPage();
  //         addHeader(pdf);
  //         addFooter(pdf);
  //         currentPosition = 30;
  //       }

  //       currentPosition = addChartWithDescription(
  //         pdf,
  //         chartImages[1],
  //         chartSections[1],
  //         currentPosition
  //       );
  //     }

  //     // Save the PDF with quality settings
  //     pdf.save("influenza-analysis-report.pdf");

  //     return true;
  //   } catch (error) {
  //     console.error("Error generating PDF:", error);
  //     setError(`PDF Generation Error: ${error.message}`);
  //     setShowErrorPopup(true);
  //     return false;
  //   } finally {
  //     setIsGenerating(false);
  //   }
  // };

  // const generatePDF = async () => {
  //   setIsGenerating(true);

  //   try {
  //     // Generate the summary before creating the PDF
  //     const summary = await generateSummary();
  //     console.log("Summary:", summary);

  //     if (!summary) {
  //       throw new Error("Failed to generate report summary");
  //     }

  //     // Initialize PDF with better quality settings
  //     const pdf = new jsPDF({
  //       orientation: "portrait",
  //       unit: "mm",
  //       format: "a4",
  //       compress: true,
  //     });

  //     // Calculate PDF dimensions
  //     const pdfWidth = pdf.internal.pageSize.getWidth();
  //     const pdfHeight = pdf.internal.pageSize.getHeight();
  //     const margin = 15;
  //     const contentWidth = pdfWidth - margin * 2;

  //     // Set document metadata - using generic information
  //     pdf.setProperties({
  //       title: "Influenza Analysis Report",
  //       subject: "Influenza Surveillance",
  //       keywords: "influenza, healthcare, analysis",
  //     });

  //     // Define colors for a more professional look
  //     const primaryColor = "#0C1E46"; // Dark blue
  //     const accentColor = "#A0171C"; // Red
  //     const textColor = "#333333"; // Dark gray
  //     const lightGrayBg = "#F8F9FA"; // Light gray background
  //     const headingFont = "helvetica";
  //     const bodyFont = "helvetica";

  //     // Logo dimensions
  //     const logoWidth = 45;
  //     const logoHeight = 14;

  //     // SVG Logo
  //     const svgLogo = `
  //       <svg baseProfile="tiny" height="125" version="1.2" width="249" xmlns="http://www.w3.org/2000/svg" xmlns:ev="http://www.w3.org/2001/xml-events" xmlns:xlink="http://www.w3.org/1999/xlink"><defs /><path d="M 69,74 68,75 67,75 66,76 66,81 68,83 72,83 73,82 74,82 74,80 75,79 75,78 74,77 74,76 72,74 Z" fill="#A0171C" stroke="none" /><path d="M 26,58 25,59 24,59 22,61 22,65 24,67 29,67 30,66 31,66 31,65 32,64 32,62 31,61 31,60 30,59 29,59 28,58 Z" fill="#A0171C" stroke="none" /><path d="M 99,51 96,54 96,57 97,58 97,59 98,60 103,60 105,58 105,54 104,53 104,52 103,52 102,51 Z" fill="#A0171C" stroke="none" /><path d="M 202,42 202,83 209,83 209,70 210,69 225,69 226,68 227,68 228,67 229,67 232,64 232,63 233,62 233,60 234,59 234,52 233,51 233,49 232,48 232,47 230,45 229,45 227,43 223,43 222,42 Z" fill="#0C1E46" stroke="none" /><path d="M 169,42 169,83 196,83 196,78 176,78 175,77 175,42 Z" fill="#0C1E46" stroke="none" /><path d="M 126,42 125,43 125,83 132,83 132,66 133,65 153,65 154,66 154,83 161,83 161,42 155,42 154,43 154,59 153,60 133,60 132,59 132,42 Z" fill="#0C1E46" stroke="none" /><path d="M 112,42 112,69 118,69 119,68 119,43 118,42 Z" fill="#A0171C" stroke="none" /><path d="M 83,42 83,83 89,83 89,42 Z" fill="#A0171C" stroke="none" /><path d="M 53,42 52,43 52,83 59,83 59,42 Z" fill="#A0171C" stroke="none" /><path d="M 40,42 39,43 39,83 46,83 46,42 Z" fill="#A0171C" stroke="none" /><path d="M 8,42 8,83 15,83 15,43 14,42 Z" fill="#A0171C" stroke="none" /></svg>
  //     `;

  //     // Enhanced summary parsing function with better handling of sections and bullet points
  //     const parseSummary = (summaryText) => {
  //       // Initialize the structure to hold parsed sections
  //       const parsedSummary = {
  //         mainText: "",
  //         sections: [],
  //       };

  //       // Check for Korean characters and determine if we need to translate
  //       const hasKoreanText =
  //         /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7A3]/.test(
  //           summaryText
  //         );

  //       // Clean up the summary text and remove language prefixes
  //       let cleanText = summaryText;

  //       // Remove "Summary:" prefix if present
  //       if (cleanText.startsWith("Summary:")) {
  //         cleanText = cleanText.substring("Summary:".length).trim();
  //       }

  //       // Remove Korean language indicators if present
  //       if (hasKoreanText && cleanText.includes("여기서 Summary:")) {
  //         const koreanPrefixIndex = cleanText.indexOf("여기서 Summary:");
  //         cleanText = cleanText
  //           .substring(koreanPrefixIndex + "여기서 Summary:".length)
  //           .trim();
  //       }

  //       // Extract main text (if any) before the first bold section header
  //       const firstBoldSectionIndex = cleanText.indexOf("- **");
  //       if (firstBoldSectionIndex > 0) {
  //         parsedSummary.mainText = cleanText
  //           .substring(0, firstBoldSectionIndex)
  //           .trim();
  //       } else if (firstBoldSectionIndex === -1) {
  //         // If no bold sections, use the first paragraph as main text
  //         const paragraphs = cleanText
  //           .split("\n\n")
  //           .filter((p) => p.trim().length > 0);
  //         if (paragraphs.length > 0) {
  //           parsedSummary.mainText = paragraphs[0];
  //         }
  //       }

  //       // Extract sections using bold headers - comprehensive approach
  //       // This regex matches sections marked with bold markers '**'
  //       const sectionRegex = /- \*\*(.*?):\*\*([\s\S]*?)(?=- \*\*|$)/g;
  //       let sectionMatch;

  //       while ((sectionMatch = sectionRegex.exec(cleanText)) !== null) {
  //         const sectionTitle = sectionMatch[1].trim();
  //         const sectionContent = sectionMatch[2].trim();

  //         // Extract bullet points from the section content
  //         const bullets = [];

  //         // Look for bullet points (lines starting with -)
  //         const bulletLines = sectionContent
  //           .split("\n")
  //           .map((line) => line.trim())
  //           .filter((line) => line.startsWith("-"));

  //         if (bulletLines.length > 0) {
  //           // Process each bullet point
  //           bulletLines.forEach((bulletLine) => {
  //             // Remove the bullet marker and trim
  //             const bulletText = bulletLine.substring(1).trim();
  //             if (bulletText) {
  //               bullets.push(bulletText);
  //             }
  //           });
  //         } else {
  //           // If no explicit bullet points found, treat the whole content as one point
  //           bullets.push(sectionContent);
  //         }

  //         // Add the section with its bullets
  //         parsedSummary.sections.push({
  //           title: sectionTitle,
  //           bullets: bullets,
  //         });
  //       }

  //       // If no sections were found using the bold pattern, try fallback methods
  //       if (parsedSummary.sections.length === 0) {
  //         // Try to identify sections by line breaks and indentation patterns
  //         const lines = cleanText
  //           .split("\n")
  //           .map((line) => line.trim())
  //           .filter((line) => line.length > 0);

  //         let currentSection = null;
  //         let currentBullets = [];

  //         lines.forEach((line) => {
  //           // Check if this line looks like a section header (ends with a colon)
  //           if (line.endsWith(":") && !line.startsWith("-")) {
  //             // If we have a previous section, save it
  //             if (currentSection) {
  //               parsedSummary.sections.push({
  //                 title: currentSection,
  //                 bullets: currentBullets,
  //               });
  //             }

  //             // Start a new section
  //             currentSection = line.substring(0, line.length - 1).trim();
  //             currentBullets = [];
  //           }
  //           // Check if this line is a bullet point
  //           else if (line.startsWith("-")) {
  //             // If we don't have a current section, create a generic one
  //             if (!currentSection) {
  //               currentSection = "Key Findings";
  //             }

  //             const bulletText = line.substring(1).trim();
  //             if (bulletText) {
  //               currentBullets.push(bulletText);
  //             }
  //           }
  //         });

  //         // Add the last section if there is one
  //         if (currentSection && currentBullets.length > 0) {
  //           parsedSummary.sections.push({
  //             title: currentSection,
  //             bullets: currentBullets,
  //           });
  //         }
  //       }

  //       // If we still have no sections, create a fallback from the whole text
  //       if (
  //         parsedSummary.sections.length === 0 &&
  //         cleanText.trim().length > 0
  //       ) {
  //         const bullets = extractBulletPoints(cleanText);

  //         parsedSummary.sections.push({
  //           title: "Key Findings",
  //           bullets: bullets.length > 0 ? bullets : [cleanText.trim()],
  //         });
  //       }

  //       return parsedSummary;
  //     };

  //     // Helper function to extract bullet points from text
  //     const extractBulletPoints = (text) => {
  //       // First try to find explicit bullet markers
  //       const bulletRegex = /(?:^|\n)\s*[-•*]\s*([^\n]+)/g;
  //       const matches = [...text.matchAll(bulletRegex)];

  //       if (matches.length > 0) {
  //         return matches.map((match) => match[1].trim());
  //       }

  //       // If no bullets found, try splitting by sentences for natural bullets
  //       const sentences = text
  //         .split(/\.(?:\s|$)/)
  //         .map((s) => s.trim())
  //         .filter((s) => s.length > 0);

  //       return sentences;
  //     };

  //     // Function to add watermark
  //     const addWatermark = (pdf) => {
  //       pdf.saveGraphicsState();
  //       pdf.setGState(new pdf.GState({ opacity: 0.05 }));
  //       pdf.setFontSize(60);
  //       pdf.setTextColor(100, 100, 100);
  //       pdf.setFont(headingFont, "bold");
  //       pdf.restoreGraphicsState();
  //     };

  //     // Improved header with cleaner design
  //     const addHeader = (pdf, pageTitle = "") => {
  //       // Draw header bar
  //       pdf.setFillColor(...hexToRgb(primaryColor));
  //       pdf.rect(0, 0, pdfWidth, 12, "F");

  //       // Add header text
  //       pdf.setFontSize(8);
  //       pdf.setTextColor(255, 255, 255);
  //       pdf.setFont(bodyFont, "normal");

  //       const reportTitle = "Influenza Analysis Report";
  //       const dateText = "Generated on " + new Date().toLocaleDateString();

  //       pdf.text(reportTitle, margin, 8);
  //       pdf.text(dateText, pdfWidth - margin, 8, { align: "right" });

  //       // Add subtitle if provided
  //       if (pageTitle) {
  //         pdf.setFontSize(14);
  //         pdf.setTextColor(...hexToRgb(accentColor));
  //         pdf.setFont(headingFont, "bold");
  //         pdf.text(pageTitle, margin, 24);

  //         // Add subtle underline
  //         pdf.setDrawColor(...hexToRgb(accentColor));
  //         pdf.setLineWidth(0.5);
  //         pdf.line(
  //           margin,
  //           26,
  //           margin +
  //             Math.min(
  //               50,
  //               (pdf.getStringUnitWidth(pageTitle) * 14) /
  //                 pdf.internal.scaleFactor
  //             ),
  //           26
  //         );
  //       }
  //     };

  //     // Improved footer with cleaner design
  //     const addFooter = (pdf) => {
  //       // Draw footer bar
  //       pdf.setFillColor(...hexToRgb(primaryColor));
  //       pdf.rect(0, pdfHeight - 10, pdfWidth, 10, "F");

  //       // Add footer text
  //       pdf.setFontSize(7);
  //       pdf.setTextColor(255, 255, 255);
  //       pdf.setFont(bodyFont, "normal");

  //       const pageNumber = pdf.internal.getNumberOfPages();

  //       // Using a more generic footer without confidentiality markings
  //       pdf.text(`Page ${pageNumber}`, pdfWidth - margin, pdfHeight - 4, {
  //         align: "right",
  //       });
  //     };

  //     // Add logo with proper positioning
  //     const addLogo = async (pdf) => {
  //       const svgBlob = new Blob([svgLogo], { type: "image/svg+xml" });
  //       const url = URL.createObjectURL(svgBlob);

  //       return new Promise((resolve) => {
  //         const img = new Image();
  //         img.onload = () => {
  //           const canvas = document.createElement("canvas");
  //           canvas.width = img.width;
  //           canvas.height = img.height;
  //           const ctx = canvas.getContext("2d");
  //           ctx.drawImage(img, 0, 0);
  //           const dataUrl = canvas.toDataURL("image/png");
  //           pdf.addImage(dataUrl, "PNG", margin, 20, logoWidth, logoHeight);
  //           URL.revokeObjectURL(url);
  //           resolve();
  //         };
  //         img.src = url;
  //       });
  //     };

  //     // Improved section layout with better spacing and typography
  //     const addSection = (pdf, title, content, yPosition) => {
  //       // Check if we need a new page
  //       if (yPosition + 30 > pdfHeight - 20) {
  //         pdf.addPage();
  //         addHeader(pdf);
  //         addFooter(pdf);
  //         yPosition = 30;
  //       }

  //       // Add section title
  //       pdf.setFontSize(12);
  //       pdf.setTextColor(...hexToRgb(primaryColor));
  //       pdf.setFont(headingFont, "bold");
  //       pdf.text(title, margin, yPosition);

  //       // Add horizontal line
  //       const lineY = yPosition + 2;
  //       pdf.setDrawColor(220, 220, 220);
  //       pdf.setLineWidth(0.3);
  //       pdf.line(margin, lineY, pdfWidth - margin, lineY);

  //       // Add content with better spacing
  //       pdf.setFontSize(10);
  //       pdf.setTextColor(...hexToRgb(textColor));
  //       pdf.setFont(bodyFont, "normal");
  //       const contentY = yPosition + 8;

  //       // Handle array or string with proper spacing
  //       if (Array.isArray(content)) {
  //         let y = contentY;
  //         content.forEach((line) => {
  //           // Split long lines if needed
  //           const splitText = pdf.splitTextToSize(
  //             `• ${line}`,
  //             contentWidth - 4
  //           );

  //           // Check if we need a new page for this bullet point
  //           if (y + splitText.length * 5 > pdfHeight - 20) {
  //             pdf.addPage();
  //             addHeader(pdf);
  //             addFooter(pdf);
  //             y = 30;
  //           }

  //           pdf.text(splitText, margin, y);
  //           y += splitText.length * 5; // Adjust spacing based on wrapped lines
  //         });
  //         return y + 5; // Return new Y position with padding
  //       } else {
  //         // Split text to fit width
  //         const splitText = pdf.splitTextToSize(content, contentWidth);

  //         // Check if split text needs a new page
  //         if (contentY + splitText.length * 5 > pdfHeight - 20) {
  //           pdf.addPage();
  //           addHeader(pdf);
  //           addFooter(pdf);
  //           pdf.text(splitText, margin, 30);
  //           return 30 + splitText.length * 5 + 5;
  //         } else {
  //           pdf.text(splitText, margin, contentY);
  //           return contentY + splitText.length * 5 + 5; // Better line spacing
  //         }
  //       }
  //     };

  //     // Function to estimate the height needed for a section
  //     const estimateSectionHeight = (pdf, section) => {
  //       // Base height for section title and spacing
  //       let height = 15;

  //       if (section.bullets && section.bullets.length > 0) {
  //         section.bullets.forEach((bullet) => {
  //           const splitText = pdf.splitTextToSize(
  //             `• ${bullet}`,
  //             contentWidth - 4
  //           );
  //           height += splitText.length * 5 + 3; // Add height for each bullet
  //         });
  //       } else if (section.text) {
  //         const splitText = pdf.splitTextToSize(section.text, contentWidth);
  //         height += splitText.length * 5;
  //       }

  //       // Add some margin
  //       height += 10;

  //       return height;
  //     };

  //     // Modified function to add a chart with its related description on the same page
  //     // Optimized for first page content
  //     const addChartWithDescription = (
  //       pdf,
  //       chart,
  //       sections,
  //       startY,
  //       isFirstPage = false
  //     ) => {
  //       let currentY = startY;

  //       // Calculate image dimensions with proper aspect ratio
  //       const imgWidth = contentWidth;
  //       // For first page chart, use a more compact aspect ratio to ensure it fits
  //       let imgHeight;
  //       if (isFirstPage) {
  //         // Limit height for first page to ensure content fits
  //         imgHeight = Math.min((chart.height / chart.width) * imgWidth, 80);
  //       } else {
  //         imgHeight = (chart.height / chart.width) * imgWidth;
  //       }

  //       // Estimate how much space the sections will need
  //       let totalSectionHeight = 0;
  //       sections.forEach((section) => {
  //         totalSectionHeight += estimateSectionHeight(pdf, section);
  //       });

  //       // Check if chart and descriptions fit on current page
  //       if (currentY + imgHeight + totalSectionHeight + 20 > pdfHeight - 20) {
  //         // If they don't fit, start on a new page
  //         pdf.addPage();
  //         addHeader(pdf);
  //         addFooter(pdf);
  //         currentY = 30;
  //       }

  //       // Add chart title
  //       pdf.setFontSize(12);
  //       pdf.setTextColor(...hexToRgb(primaryColor));
  //       pdf.setFont(headingFont, "bold");
  //       pdf.text("Data Visualization", margin, currentY);
  //       currentY += 8;

  //       // Add chart
  //       pdf.addImage(chart.data, "PNG", margin, currentY, imgWidth, imgHeight);
  //       currentY += imgHeight + 10; // Reduced spacing after chart for first page

  //       // Add associated sections with descriptions - more compact on first page
  //       for (let i = 0; i < sections.length; i++) {
  //         const section = sections[i];

  //         // Check if this section will fit on the current page
  //         const sectionHeight = estimateSectionHeight(pdf, section);

  //         // More aggressive check for first page to account for footer
  //         const maxY = isFirstPage ? pdfHeight - 30 : pdfHeight - 20;

  //         if (currentY + sectionHeight > maxY) {
  //           // Section won't fit, start a new page
  //           pdf.addPage();
  //           addHeader(pdf);
  //           addFooter(pdf);
  //           currentY = 30;
  //         }

  //         // Add section title
  //         pdf.setFontSize(12);
  //         pdf.setTextColor(...hexToRgb(primaryColor));
  //         pdf.setFont(headingFont, "bold");
  //         pdf.text(section.title, margin, currentY);

  //         // Add horizontal line
  //         pdf.setDrawColor(...hexToRgb(accentColor));
  //         pdf.setLineWidth(0.3);
  //         const lineWidth = Math.min(
  //           contentWidth,
  //           Math.max(
  //             40,
  //             (pdf.getStringUnitWidth(section.title) * 12) /
  //               pdf.internal.scaleFactor +
  //               10
  //           )
  //         );
  //         pdf.line(margin, currentY + 2, margin + lineWidth, currentY + 2);

  //         currentY += 8;

  //         // Add bullet points - more compact if on first page
  //         pdf.setFontSize(10);
  //         pdf.setTextColor(...hexToRgb(textColor));
  //         pdf.setFont(bodyFont, "normal");

  //         // Use more compact line spacing for first page
  //         const lineSpacing = isFirstPage ? 4 : 5;

  //         if (section.bullets && section.bullets.length > 0) {
  //           section.bullets.forEach((bullet) => {
  //             // Skip empty bullets
  //             if (!bullet || bullet.trim().length === 0) return;

  //             // Split long bullet points
  //             const splitText = pdf.splitTextToSize(
  //               `• ${bullet}`,
  //               contentWidth - 4
  //             );

  //             // Check if we need a new page
  //             if (currentY + splitText.length * lineSpacing > maxY) {
  //               pdf.addPage();
  //               addHeader(pdf);
  //               addFooter(pdf);
  //               currentY = 30;
  //             }

  //             pdf.text(splitText, margin, currentY);
  //             currentY +=
  //               splitText.length * lineSpacing + (isFirstPage ? 2 : 3);
  //           });
  //         } else if (section.text) {
  //           // If there are no bullets, but there is text
  //           const splitText = pdf.splitTextToSize(section.text, contentWidth);

  //           // Check if we need a new page
  //           if (currentY + splitText.length * lineSpacing > maxY) {
  //             pdf.addPage();
  //             addHeader(pdf);
  //             addFooter(pdf);
  //             currentY = 30;
  //           }

  //           pdf.text(splitText, margin, currentY);
  //           currentY += splitText.length * lineSpacing;
  //         }

  //         currentY += isFirstPage ? 5 : 8; // Less space after section on first page
  //       }

  //       return currentY;
  //     };

  //     // Helper function to format date
  //     function formatDate(date) {
  //       const options = { year: "numeric", month: "long", day: "numeric" };
  //       return new Date(date).toLocaleDateString("en-US", options);
  //     }

  //     // Hex to RGB conversion helper
  //     function hexToRgb(hex) {
  //       hex = hex.replace(/^#/, "");
  //       const bigint = parseInt(hex, 16);
  //       const r = (bigint >> 16) & 255;
  //       const g = (bigint >> 8) & 255;
  //       const b = bigint & 255;
  //       return [r, g, b];
  //     }

  //     // FIRST PAGE - Cover page with improved layout and immediate content
  //     await addLogo(pdf);

  //     // Add title with better typography - reduced vertical space
  //     pdf.setFontSize(18); // Even smaller for more compact layout
  //     pdf.setTextColor(...hexToRgb(primaryColor));
  //     pdf.setFont(headingFont, "bold");
  //     pdf.text("Influenza Analysis Report", margin, 38); // Move up for more space

  //     // Add subtitle with minimal spacing
  //     pdf.setFontSize(11); // Smaller for more compact layout
  //     pdf.setTextColor(...hexToRgb(textColor));
  //     pdf.setFont(headingFont, "normal");
  //     const today = formatDate(new Date());
  //     pdf.text(`Report Date: ${today}`, margin, 45); // Reduced Y position

  //     // Add footer to the first page as well
  //     addFooter(pdf);

  //     // Parse the summary for structured content
  //     console.log("Summary before parsing:", summary);
  //     const parsedSummary = parseSummary(summary);
  //     console.log("Parsed summary:", parsedSummary);

  //     // Hide download button before capturing charts
  //     // This approach modifies the DOM directly, but keeps it simple
  //     const downloadButtons = document.querySelectorAll("#downloadchart");
  //     downloadButtons.forEach((btn) => {
  //       btn.style.display = "none";
  //     });

  //     // Capture charts using the original method
  //     const chartImages = await captureChartsAsImages();

  //     // Show download buttons again after capturing
  //     downloadButtons.forEach((btn) => {
  //       btn.style.display = "block";
  //     });

  //     // Group sections by chart for more meaningful presentation
  //     const chartSections = {};

  //     // Associate sections with charts based on content matching
  //     if (parsedSummary.sections.length > 0 && chartImages.length > 0) {
  //       chartSections[0] = []; // Initialize array for first chart
  //       chartSections[1] = []; // Initialize array for second chart

  //       parsedSummary.sections.forEach((section) => {
  //         // Determine which chart this section relates to by content
  //         if (section.title.includes("Positive vs. Negative Cases")) {
  //           // This likely relates to the first chart (case counts)
  //           chartSections[0].push({
  //             title: section.title,
  //             bullets: section.bullets,
  //           });
  //         } else if (
  //           section.title.includes("Percent Positive") ||
  //           section.title.includes("CDC")
  //         ) {
  //           // This likely relates to the second chart (percentages)
  //           chartSections[1].push({
  //             title: section.title,
  //             bullets: section.bullets,
  //           });
  //         } else {
  //           // For any other sections, add to a general section for the first chart
  //           chartSections[0].push({
  //             title: section.title,
  //             bullets: section.bullets,
  //           });
  //         }
  //       });

  //       // If no sections were found for either chart, create a default section
  //       if (
  //         chartSections[0].length === 0 &&
  //         parsedSummary.sections.length > 0
  //       ) {
  //         // Add the first available section to the first chart
  //         chartSections[0].push({
  //           title: parsedSummary.sections[0].title,
  //           bullets: parsedSummary.sections[0].bullets,
  //         });
  //       }

  //       if (
  //         chartSections[1].length === 0 &&
  //         parsedSummary.sections.length > 1
  //       ) {
  //         // Add the second available section to the second chart
  //         chartSections[1].push({
  //           title: parsedSummary.sections[1].title,
  //           bullets: parsedSummary.sections[1].bullets,
  //         });
  //       }
  //     }

  //     // Start content right after the title - much higher on first page
  //     let currentPosition = 50; // Reduced starting position even more

  //     // Add first chart with its description - ensuring it fits on first page
  //     // Pass isFirstPage=true to use more compact layout
  //     if (
  //       chartImages.length > 0 &&
  //       chartSections[0] &&
  //       chartSections[0].length > 0
  //     ) {
  //       currentPosition = addChartWithDescription(
  //         pdf,
  //         chartImages[0],
  //         chartSections[0],
  //         currentPosition,
  //         true // Indicate this is first page for more compact layout
  //       );
  //     }

  //     // Add executive summary if applicable
  //     if (parsedSummary.mainText && parsedSummary.mainText.trim().length > 0) {
  //       // Check if we need a new page
  //       if (currentPosition + 80 > pdfHeight - 20) {
  //         pdf.addPage();
  //         addHeader(pdf);
  //         addFooter(pdf);
  //         currentPosition = 30;
  //       }

  //       // Add executive summary
  //       pdf.setFontSize(14);
  //       pdf.setTextColor(...hexToRgb(accentColor));
  //       pdf.setFont(headingFont, "bold");
  //       pdf.text("Executive Summary", margin, currentPosition);

  //       // Add underline
  //       pdf.setDrawColor(...hexToRgb(accentColor));
  //       pdf.setLineWidth(0.5);
  //       pdf.line(
  //         margin,
  //         currentPosition + 2,
  //         margin +
  //           (pdf.getStringUnitWidth("Executive Summary") * 14) /
  //             pdf.internal.scaleFactor,
  //         currentPosition + 2
  //       );

  //       // Add main text with background
  //       const splitText = pdf.splitTextToSize(
  //         parsedSummary.mainText,
  //         contentWidth
  //       );
  //       const boxHeight = splitText.length * 5 + 10;

  //       // Check if box will fit on this page
  //       if (currentPosition + boxHeight + 20 > pdfHeight - 20) {
  //         pdf.addPage();
  //         addHeader(pdf);
  //         addFooter(pdf);
  //         currentPosition = 30;

  //         // Re-add title on new page
  //         pdf.setFontSize(14);
  //         pdf.setTextColor(...hexToRgb(accentColor));
  //         pdf.setFont(headingFont, "bold");
  //         pdf.text("Executive Summary", margin, currentPosition);

  //         // Add underline
  //         pdf.setDrawColor(...hexToRgb(accentColor));
  //         pdf.setLineWidth(0.5);
  //         pdf.line(
  //           margin,
  //           currentPosition + 2,
  //           margin +
  //             (pdf.getStringUnitWidth("Executive Summary") * 14) /
  //               pdf.internal.scaleFactor,
  //           currentPosition + 2
  //         );

  //         currentPosition += 10;
  //       } else {
  //         currentPosition += 10;
  //       }

  //       // Add background and text
  //       pdf.setFillColor(...hexToRgb(lightGrayBg));
  //       pdf.roundedRect(
  //         margin - 2,
  //         currentPosition,
  //         contentWidth + 4,
  //         boxHeight,
  //         2,
  //         2,
  //         "F"
  //       );

  //       pdf.setFontSize(10);
  //       pdf.setTextColor(...hexToRgb(textColor));
  //       pdf.setFont(bodyFont, "normal");
  //       pdf.text(splitText, margin, currentPosition + 5);

  //       currentPosition += boxHeight + 15;
  //     }

  //     // Add second chart with its description if available
  //     if (
  //       chartImages.length > 1 &&
  //       chartSections[1] &&
  //       chartSections[1].length > 0
  //     ) {
  //       // Check if we need a new page
  //       if (currentPosition + 150 > pdfHeight - 20) {
  //         pdf.addPage();
  //         addHeader(pdf);
  //         addFooter(pdf);
  //         currentPosition = 30;
  //       }

  //       currentPosition = addChartWithDescription(
  //         pdf,
  //         chartImages[1],
  //         chartSections[1],
  //         currentPosition
  //       );
  //     }

  //     // Save the PDF with quality settings
  //     pdf.save("influenza-analysis-report.pdf");

  //     return true;
  //   } catch (error) {
  //     console.error("Error generating PDF:", error);
  //     setError(`PDF Generation Error: ${error.message}`);
  //     setShowErrorPopup(true);
  //     return false;
  //   } finally {
  //     setIsGenerating(false);
  //   }
  // };

  const generatePDF = async () => {
    setIsGenerating(true);

    try {
      // Generate the summary before creating the PDF
      const summary = await generateSummary();
      console.log("Summary:", summary);

      if (!summary) {
        throw new Error("Failed to generate report summary");
      }

      // Initialize PDF with better quality settings
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      // Calculate PDF dimensions
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pdfWidth - margin * 2;

      // Set document metadata - using generic information
      pdf.setProperties({
        title: "Influenza Analysis Report",
        subject: "Influenza Surveillance",
        keywords: "influenza, healthcare, analysis",
      });

      // Define colors for a more professional look
      const primaryColor = "#0C1E46"; // Dark blue
      const accentColor = "#A0171C"; // Red
      const textColor = "#333333"; // Dark gray
      const lightGrayBg = "#F8F9FA"; // Light gray background
      const headingFont = "helvetica";
      const bodyFont = "helvetica";

      // Logo dimensions
      const logoWidth = 45;
      const logoHeight = 14;

      // SVG Logo
      const svgLogo = `
        <svg baseProfile="tiny" height="125" version="1.2" width="249" xmlns="http://www.w3.org/2000/svg" xmlns:ev="http://www.w3.org/2001/xml-events" xmlns:xlink="http://www.w3.org/1999/xlink"><defs /><path d="M 69,74 68,75 67,75 66,76 66,81 68,83 72,83 73,82 74,82 74,80 75,79 75,78 74,77 74,76 72,74 Z" fill="#A0171C" stroke="none" /><path d="M 26,58 25,59 24,59 22,61 22,65 24,67 29,67 30,66 31,66 31,65 32,64 32,62 31,61 31,60 30,59 29,59 28,58 Z" fill="#A0171C" stroke="none" /><path d="M 99,51 96,54 96,57 97,58 97,59 98,60 103,60 105,58 105,54 104,53 104,52 103,52 102,51 Z" fill="#A0171C" stroke="none" /><path d="M 202,42 202,83 209,83 209,70 210,69 225,69 226,68 227,68 228,67 229,67 232,64 232,63 233,62 233,60 234,59 234,52 233,51 233,49 232,48 232,47 230,45 229,45 227,43 223,43 222,42 Z" fill="#0C1E46" stroke="none" /><path d="M 169,42 169,83 196,83 196,78 176,78 175,77 175,42 Z" fill="#0C1E46" stroke="none" /><path d="M 126,42 125,43 125,83 132,83 132,66 133,65 153,65 154,66 154,83 161,83 161,42 155,42 154,43 154,59 153,60 133,60 132,59 132,42 Z" fill="#0C1E46" stroke="none" /><path d="M 112,42 112,69 118,69 119,68 119,43 118,42 Z" fill="#A0171C" stroke="none" /><path d="M 83,42 83,83 89,83 89,42 Z" fill="#A0171C" stroke="none" /><path d="M 53,42 52,43 52,83 59,83 59,42 Z" fill="#A0171C" stroke="none" /><path d="M 40,42 39,43 39,83 46,83 46,42 Z" fill="#A0171C" stroke="none" /><path d="M 8,42 8,83 15,83 15,43 14,42 Z" fill="#A0171C" stroke="none" /></svg>
      `;

      // Enhanced summary parsing function with better handling of sections and bullet points
      const parseSummary = (summaryText) => {
        // Initialize the structure to hold parsed sections
        const parsedSummary = {
          mainText: "",
          sections: [],
        };

        // Check for Korean characters and determine if we need to translate
        const hasKoreanText =
          /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7A3]/.test(
            summaryText
          );

        // Clean up the summary text and remove language prefixes
        let cleanText = summaryText;

        // Remove "Summary:" prefix if present
        if (cleanText.startsWith("Summary:")) {
          cleanText = cleanText.substring("Summary:".length).trim();
        }

        // Remove Korean language indicators if present
        if (hasKoreanText && cleanText.includes("여기서 Summary:")) {
          const koreanPrefixIndex = cleanText.indexOf("여기서 Summary:");
          cleanText = cleanText
            .substring(koreanPrefixIndex + "여기서 Summary:".length)
            .trim();
        }

        // Extract main text (if any) before the first bold section header
        const firstBoldSectionIndex = cleanText.indexOf("- **");
        if (firstBoldSectionIndex > 0) {
          parsedSummary.mainText = cleanText
            .substring(0, firstBoldSectionIndex)
            .trim();
        } else if (firstBoldSectionIndex === -1) {
          // If no bold sections, use the first paragraph as main text
          const paragraphs = cleanText
            .split("\n\n")
            .filter((p) => p.trim().length > 0);
          if (paragraphs.length > 0) {
            parsedSummary.mainText = paragraphs[0];
          }
        }

        // Extract sections using bold headers - comprehensive approach
        // This regex matches sections marked with bold markers '**'
        const sectionRegex = /- \*\*(.*?):\*\*([\s\S]*?)(?=- \*\*|$)/g;
        let sectionMatch;

        while ((sectionMatch = sectionRegex.exec(cleanText)) !== null) {
          const sectionTitle = sectionMatch[1].trim();
          const sectionContent = sectionMatch[2].trim();

          // Extract bullet points from the section content
          const bullets = [];

          // Look for bullet points (lines starting with -)
          const bulletLines = sectionContent
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.startsWith("-"));

          if (bulletLines.length > 0) {
            // Process each bullet point
            bulletLines.forEach((bulletLine) => {
              // Remove the bullet marker and trim
              const bulletText = bulletLine.substring(1).trim();
              if (bulletText) {
                bullets.push(bulletText);
              }
            });
          } else {
            // If no explicit bullet points found, treat the whole content as one point
            bullets.push(sectionContent);
          }

          // Add the section with its bullets
          parsedSummary.sections.push({
            title: sectionTitle,
            bullets: bullets,
          });
        }

        // If no sections were found using the bold pattern, try fallback methods
        if (parsedSummary.sections.length === 0) {
          // Try to identify sections by line breaks and indentation patterns
          const lines = cleanText
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

          let currentSection = null;
          let currentBullets = [];

          lines.forEach((line) => {
            // Check if this line looks like a section header (ends with a colon)
            if (line.endsWith(":") && !line.startsWith("-")) {
              // If we have a previous section, save it
              if (currentSection) {
                parsedSummary.sections.push({
                  title: currentSection,
                  bullets: currentBullets,
                });
              }

              // Start a new section
              currentSection = line.substring(0, line.length - 1).trim();
              currentBullets = [];
            }
            // Check if this line is a bullet point
            else if (line.startsWith("-")) {
              // If we don't have a current section, create a generic one
              if (!currentSection) {
                currentSection = "Key Findings";
              }

              const bulletText = line.substring(1).trim();
              if (bulletText) {
                currentBullets.push(bulletText);
              }
            }
          });

          // Add the last section if there is one
          if (currentSection && currentBullets.length > 0) {
            parsedSummary.sections.push({
              title: currentSection,
              bullets: currentBullets,
            });
          }
        }

        // If we still have no sections, create a fallback from the whole text
        if (
          parsedSummary.sections.length === 0 &&
          cleanText.trim().length > 0
        ) {
          const bullets = extractBulletPoints(cleanText);

          parsedSummary.sections.push({
            title: "Key Findings",
            bullets: bullets.length > 0 ? bullets : [cleanText.trim()],
          });
        }

        return parsedSummary;
      };

      // Helper function to extract bullet points from text
      const extractBulletPoints = (text) => {
        // First try to find explicit bullet markers
        const bulletRegex = /(?:^|\n)\s*[-•*]\s*([^\n]+)/g;
        const matches = [...text.matchAll(bulletRegex)];

        if (matches.length > 0) {
          return matches.map((match) => match[1].trim());
        }

        // If no bullets found, try splitting by sentences for natural bullets
        const sentences = text
          .split(/\.(?:\s|$)/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        return sentences;
      };

      // Function to add watermark
      const addWatermark = (pdf) => {
        pdf.saveGraphicsState();
        pdf.setGState(new pdf.GState({ opacity: 0.05 }));
        pdf.setFontSize(60);
        pdf.setTextColor(100, 100, 100);
        pdf.setFont(headingFont, "bold");
        pdf.restoreGraphicsState();
      };

      // Improved header with cleaner design
      const addHeader = (pdf, pageTitle = "") => {
        // Draw header bar
        pdf.setFillColor(...hexToRgb(primaryColor));
        pdf.rect(0, 0, pdfWidth, 12, "F");

        // Add header text
        pdf.setFontSize(8);
        pdf.setTextColor(255, 255, 255);
        pdf.setFont(bodyFont, "normal");

        const reportTitle = "Influenza Analysis Report";
        const dateText = "Generated on " + new Date().toLocaleDateString();

        pdf.text(reportTitle, margin, 8);
        pdf.text(dateText, pdfWidth - margin, 8, { align: "right" });

        // Add subtitle if provided
        if (pageTitle) {
          pdf.setFontSize(14);
          pdf.setTextColor(...hexToRgb(accentColor));
          pdf.setFont(headingFont, "bold");
          pdf.text(pageTitle, margin, 24);

          // Add subtle underline
          pdf.setDrawColor(...hexToRgb(accentColor));
          pdf.setLineWidth(0.5);
          pdf.line(
            margin,
            26,
            margin +
              Math.min(
                50,
                (pdf.getStringUnitWidth(pageTitle) * 14) /
                  pdf.internal.scaleFactor
              ),
            26
          );
        }
      };

      // Improved footer with cleaner design
      const addFooter = (pdf) => {
        // Draw footer bar
        pdf.setFillColor(...hexToRgb(primaryColor));
        pdf.rect(0, pdfHeight - 10, pdfWidth, 10, "F");

        // Add footer text
        pdf.setFontSize(7);
        pdf.setTextColor(255, 255, 255);
        pdf.setFont(bodyFont, "normal");

        const pageNumber = pdf.internal.getNumberOfPages();

        // Using a more generic footer without confidentiality markings
        pdf.text(`Page ${pageNumber}`, pdfWidth - margin, pdfHeight - 4, {
          align: "right",
        });
      };

      // Add logo with proper positioning
      const addLogo = async (pdf) => {
        const svgBlob = new Blob([svgLogo], { type: "image/svg+xml" });
        const url = URL.createObjectURL(svgBlob);

        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL("image/png");
            pdf.addImage(dataUrl, "PNG", margin, 20, logoWidth, logoHeight);
            URL.revokeObjectURL(url);
            resolve();
          };
          img.src = url;
        });
      };

      // Improved section layout with better spacing and typography
      const addSection = (pdf, title, content, yPosition) => {
        // Check if we need a new page
        if (yPosition + 30 > pdfHeight - 20) {
          pdf.addPage();
          addHeader(pdf);
          addFooter(pdf);
          yPosition = 30;
        }

        // Add section title
        pdf.setFontSize(12);
        pdf.setTextColor(...hexToRgb(primaryColor));
        pdf.setFont(headingFont, "bold");
        pdf.text(title, margin, yPosition);

        // Add horizontal line
        const lineY = yPosition + 2;
        pdf.setDrawColor(220, 220, 220);
        pdf.setLineWidth(0.3);
        pdf.line(margin, lineY, pdfWidth - margin, lineY);

        // Add content with better spacing
        pdf.setFontSize(10);
        pdf.setTextColor(...hexToRgb(textColor));
        pdf.setFont(bodyFont, "normal");
        const contentY = yPosition + 8;

        // Handle array or string with proper spacing
        if (Array.isArray(content)) {
          let y = contentY;
          content.forEach((line) => {
            // Split long lines if needed
            const splitText = pdf.splitTextToSize(
              `• ${line}`,
              contentWidth - 4
            );

            // Check if we need a new page for this bullet point
            if (y + splitText.length * 5 > pdfHeight - 20) {
              pdf.addPage();
              addHeader(pdf);
              addFooter(pdf);
              y = 30;
            }

            pdf.text(splitText, margin, y);
            y += splitText.length * 5; // Adjust spacing based on wrapped lines
          });
          return y + 5; // Return new Y position with padding
        } else {
          // Split text to fit width
          const splitText = pdf.splitTextToSize(content, contentWidth);

          // Check if split text needs a new page
          if (contentY + splitText.length * 5 > pdfHeight - 20) {
            pdf.addPage();
            addHeader(pdf);
            addFooter(pdf);
            pdf.text(splitText, margin, 30);
            return 30 + splitText.length * 5 + 5;
          } else {
            pdf.text(splitText, margin, contentY);
            return contentY + splitText.length * 5 + 5; // Better line spacing
          }
        }
      };

      // Function to estimate the height needed for a section
      const estimateSectionHeight = (pdf, section) => {
        // Base height for section title and spacing
        let height = 15;

        if (section.bullets && section.bullets.length > 0) {
          section.bullets.forEach((bullet) => {
            const splitText = pdf.splitTextToSize(
              `• ${bullet}`,
              contentWidth - 4
            );
            height += splitText.length * 5 + 3; // Add height for each bullet
          });
        } else if (section.text) {
          const splitText = pdf.splitTextToSize(section.text, contentWidth);
          height += splitText.length * 5;
        }

        // Add some margin
        height += 10;

        return height;
      };

      // Modified function to add a chart with its related description on the same page
      // Optimized for first page content
      const addChartWithDescription = (
        pdf,
        chart,
        sections,
        startY,
        isFirstPage = false
      ) => {
        let currentY = startY;

        // Calculate image dimensions with proper aspect ratio
        const imgWidth = contentWidth;
        // For first page chart, use a more compact aspect ratio to ensure it fits
        let imgHeight;
        if (isFirstPage) {
          // Limit height for first page to ensure content fits
          imgHeight = Math.min((chart.height / chart.width) * imgWidth, 80);
        } else {
          imgHeight = (chart.height / chart.width) * imgWidth;
        }

        // Estimate how much space the sections will need
        let totalSectionHeight = 0;
        sections.forEach((section) => {
          totalSectionHeight += estimateSectionHeight(pdf, section);
        });

        // Check if chart and descriptions fit on current page
        if (currentY + imgHeight + totalSectionHeight + 20 > pdfHeight - 20) {
          // If they don't fit, start on a new page
          pdf.addPage();
          addHeader(pdf);
          addFooter(pdf);
          currentY = 30;
        }

        // Add chart title
        pdf.setFontSize(12);
        pdf.setTextColor(...hexToRgb(primaryColor));
        pdf.setFont(headingFont, "bold");
        pdf.text("Data Visualization", margin, currentY);
        currentY += 8;

        // Add chart
        pdf.addImage(chart.data, "PNG", margin, currentY, imgWidth, imgHeight);
        currentY += imgHeight + 10; // Reduced spacing after chart for first page

        // Add associated sections with descriptions - more compact on first page
        for (let i = 0; i < sections.length; i++) {
          const section = sections[i];

          // Skip if section is undefined or doesn't have a title
          if (!section || !section.title) continue;

          // Check if this section will fit on the current page
          const sectionHeight = estimateSectionHeight(pdf, section);

          // More aggressive check for first page to account for footer
          const maxY = isFirstPage ? pdfHeight - 30 : pdfHeight - 20;

          if (currentY + sectionHeight > maxY) {
            // Section won't fit, start a new page
            pdf.addPage();
            addHeader(pdf);
            addFooter(pdf);
            currentY = 30;
          }

          // Add section title
          pdf.setFontSize(12);
          pdf.setTextColor(...hexToRgb(primaryColor));
          pdf.setFont(headingFont, "bold");
          pdf.text(section.title, margin, currentY);

          // Add horizontal line
          pdf.setDrawColor(...hexToRgb(accentColor));
          pdf.setLineWidth(0.3);
          const lineWidth = Math.min(
            contentWidth,
            Math.max(
              40,
              (pdf.getStringUnitWidth(section.title) * 12) /
                pdf.internal.scaleFactor +
                10
            )
          );
          pdf.line(margin, currentY + 2, margin + lineWidth, currentY + 2);

          currentY += 8;

          // Add bullet points - more compact if on first page
          pdf.setFontSize(10);
          pdf.setTextColor(...hexToRgb(textColor));
          pdf.setFont(bodyFont, "normal");

          // Use more compact line spacing for first page
          const lineSpacing = isFirstPage ? 4 : 5;

          if (section.bullets && section.bullets.length > 0) {
            // Loop through all bullets and ensure they are displayed
            section.bullets.forEach((bullet) => {
              // Skip empty bullets
              if (!bullet || bullet.trim().length === 0) return;

              // Split long bullet points
              const splitText = pdf.splitTextToSize(
                `• ${bullet}`,
                contentWidth - 4
              );

              // Check if we need a new page
              if (currentY + splitText.length * lineSpacing > maxY) {
                pdf.addPage();
                addHeader(pdf);
                addFooter(pdf);
                currentY = 30;
              }

              pdf.text(splitText, margin, currentY);
              currentY +=
                splitText.length * lineSpacing + (isFirstPage ? 2 : 3);
            });
          } else if (section.text) {
            // If there are no bullets, but there is text
            const splitText = pdf.splitTextToSize(section.text, contentWidth);

            // Check if we need a new page
            if (currentY + splitText.length * lineSpacing > maxY) {
              pdf.addPage();
              addHeader(pdf);
              addFooter(pdf);
              currentY = 30;
            }

            pdf.text(splitText, margin, currentY);
            currentY += splitText.length * lineSpacing;
          }

          currentY += isFirstPage ? 5 : 8; // Less space after section on first page
        }

        return currentY;
      };

      // Helper function to format date
      function formatDate(date) {
        const options = { year: "numeric", month: "long", day: "numeric" };
        return new Date(date).toLocaleDateString("en-US", options);
      }

      // Hex to RGB conversion helper
      function hexToRgb(hex) {
        hex = hex.replace(/^#/, "");
        const bigint = parseInt(hex, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return [r, g, b];
      }

      // FIRST PAGE - Cover page with improved layout and immediate content
      await addLogo(pdf);

      // Add title with better typography - reduced vertical space
      pdf.setFontSize(18); // Even smaller for more compact layout
      pdf.setTextColor(...hexToRgb(primaryColor));
      pdf.setFont(headingFont, "bold");
      pdf.text("Influenza Analysis Report", margin, 38); // Move up for more space

      // Add subtitle with minimal spacing
      pdf.setFontSize(11); // Smaller for more compact layout
      pdf.setTextColor(...hexToRgb(textColor));
      pdf.setFont(headingFont, "normal");
      const today = formatDate(new Date());
      pdf.text(`Report Date: ${today}`, margin, 45); // Reduced Y position

      // Add footer to the first page as well
      addFooter(pdf);

      // Parse the summary for structured content
      console.log("Summary before parsing:", summary);
      const parsedSummary = parseSummary(summary);
      console.log("Parsed summary:", parsedSummary);

      // Hide download button before capturing charts
      const downloadButtons = document.querySelectorAll("#downloadchart");
      downloadButtons.forEach((btn) => {
        btn.style.display = "none";
      });

      // Capture charts using the original method
      const chartImages = await captureChartsAsImages();

      // Show download buttons again after capturing
      downloadButtons.forEach((btn) => {
        btn.style.display = "block";
      });

      // Initialize chart sections - dynamic approach with no pre-defined structure
      const chartSections = {};

      // Check if sections exist
      if (parsedSummary.sections && parsedSummary.sections.length > 0) {
        console.log("Total sections found:", parsedSummary.sections.length);

        // Loop through the sections and assign them dynamically
        parsedSummary.sections.forEach((section, index) => {
          // Log each section for debugging
          console.log(`Processing section ${index}:`, section);

          // Determine which chart this section belongs to
          // This is where your dynamic assignment logic would go
          let chartIndex;

          // Example logic: you could determine chartIndex based on content amount,
          // or other criteria specific to your application

          // Simple example: if we have 3 sections, put first one in chart 0, others in chart 1
          if (parsedSummary.sections.length === 3 && index === 0) {
            chartIndex = 0;
          } else if (
            parsedSummary.sections.length === 3 &&
            (index === 1 || index === 2)
          ) {
            chartIndex = 1;
          }
          // If we have 4 sections, distribute them 2 and 2
          else if (
            parsedSummary.sections.length === 4 &&
            (index === 0 || index === 3)
          ) {
            chartIndex = 0;
          } else if (
            parsedSummary.sections.length === 4 &&
            (index === 1 || index === 2)
          ) {
            chartIndex = 1;
          }
          // Default fallback - alternate between charts
          else {
            chartIndex = index % 2;
          }

          // Initialize array for this chart if it doesn't exist yet
          if (!chartSections[chartIndex]) {
            chartSections[chartIndex] = [];
          }

          // Add the section to the appropriate chart
          chartSections[chartIndex].push({
            title: section.title,
            bullets: section.bullets,
          });
        });
      }

      // Log the final chart sections assignment
      console.log("Final chart sections assignment:", chartSections);

      // Start content right after the title - much higher on first page
      let currentPosition = 50; // Reduced starting position even more

      // Add first chart with its description - ensuring it fits on first page
      if (chartImages.length > 0 && chartSections[0].length > 0) {
        currentPosition = addChartWithDescription(
          pdf,
          chartImages[0],
          chartSections[0],
          currentPosition,
          true // Indicate this is first page for more compact layout
        );
      }

      // Add executive summary if applicable
      if (parsedSummary.mainText && parsedSummary.mainText.trim().length > 0) {
        // Check if we need a new page
        if (currentPosition + 80 > pdfHeight - 20) {
          pdf.addPage();
          addHeader(pdf);
          addFooter(pdf);
          currentPosition = 30;
        }

        // Add executive summary
        pdf.setFontSize(14);
        pdf.setTextColor(...hexToRgb(accentColor));
        pdf.setFont(headingFont, "bold");
        pdf.text("Executive Summary", margin, currentPosition);

        // Add underline
        pdf.setDrawColor(...hexToRgb(accentColor));
        pdf.setLineWidth(0.5);
        pdf.line(
          margin,
          currentPosition + 2,
          margin +
            (pdf.getStringUnitWidth("Executive Summary") * 14) /
              pdf.internal.scaleFactor,
          currentPosition + 2
        );

        // Add main text with background
        const splitText = pdf.splitTextToSize(
          parsedSummary.mainText,
          contentWidth
        );
        const boxHeight = splitText.length * 5 + 10;

        // Check if box will fit on this page
        if (currentPosition + boxHeight + 20 > pdfHeight - 20) {
          pdf.addPage();
          addHeader(pdf);
          addFooter(pdf);
          currentPosition = 30;

          // Re-add title on new page
          pdf.setFontSize(14);
          pdf.setTextColor(...hexToRgb(accentColor));
          pdf.setFont(headingFont, "bold");
          pdf.text("Executive Summary", margin, currentPosition);

          // Add underline
          pdf.setDrawColor(...hexToRgb(accentColor));
          pdf.setLineWidth(0.5);
          pdf.line(
            margin,
            currentPosition + 2,
            margin +
              (pdf.getStringUnitWidth("Executive Summary") * 14) /
                pdf.internal.scaleFactor,
            currentPosition + 2
          );

          currentPosition += 10;
        } else {
          currentPosition += 10;
        }

        // Add background and text
        pdf.setFillColor(...hexToRgb(lightGrayBg));
        pdf.roundedRect(
          margin - 2,
          currentPosition,
          contentWidth + 4,
          boxHeight,
          2,
          2,
          "F"
        );

        pdf.setFontSize(10);
        pdf.setTextColor(...hexToRgb(textColor));
        pdf.setFont(bodyFont, "normal");
        pdf.text(splitText, margin, currentPosition + 5);

        currentPosition += boxHeight + 15;
      }

      // Add second chart with its description if available
      if (chartImages.length > 1 && chartSections[1].length > 0) {
        // Check if we need a new page
        if (currentPosition + 150 > pdfHeight - 20) {
          pdf.addPage();
          addHeader(pdf);
          addFooter(pdf);
          currentPosition = 30;
        }

        currentPosition = addChartWithDescription(
          pdf,
          chartImages[1],
          chartSections[1],
          currentPosition
        );
      }

      // Save the PDF with quality settings
      pdf.save("influenza-analysis-report.pdf");

      return true;
    } catch (error) {
      console.error("Error generating PDF:", error);
      setError(`PDF Generation Error: ${error.message}`);
      setShowErrorPopup(true);
      return false;
    } finally {
      setIsGenerating(false);
    }
  };

  // Error popup component
  const ErrorPopup = () => {
    if (!showErrorPopup) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
        <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-center">
              <div className="mr-3 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100 text-red-500">
                <XCircle className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Error
              </h3>
            </div>
            <button
              onClick={() => setShowErrorPopup(false)}
              className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg bg-transparent text-gray-400 hover:bg-gray-200 hover:text-gray-900 dark:hover:bg-gray-600 dark:hover:text-white"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                ></path>
              </svg>
            </button>
          </div>
          <div className="mb-5 text-sm text-gray-700 dark:text-gray-300">
            {error || "An unexpected error occurred"}
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => setShowErrorPopup(false)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative">
      {/* Error Popup */}
      <ErrorPopup />

      <button
        id="download-report"
        onClick={generatePDF}
        disabled={isGenerating}
        className="fixed bottom-8 right-8 group bg-blue-700 hover:bg-blue-800 p-3 rounded-full shadow-xl transition-all duration-200 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {isGenerating ? (
          <Loader2 className="h-5 w-5 text-white animate-spin" />
        ) : (
          <FileDown className="h-5 w-5 text-white" />
        )}
        <span className="absolute bottom-full right-0 mb-2 px-3 py-1 bg-gray-900 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          {isGenerating
            ? "Generating summary report..."
            : "Download summary report"}
        </span>
      </button>
    </div>
  );
};
