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

  const captureChartsAsImages = async () => {
    const chartContainers = document.querySelectorAll(
      '.chart-container, .recharts-wrapper, [id^="chart-"]'
    );
    const chartImages = [];

    for (const container of chartContainers) {
      try {
        // zoom-instructions 요소 숨기기
        const zoomElements = container.querySelectorAll(
          '[id*="zoom-instructions"]'
        );
        const originalDisplayStyles = [];

        zoomElements.forEach((el) => {
          originalDisplayStyles.push(el.style.display);
          el.style.display = "none";
        });

        // 원본 이미지 캡처
        const originalCanvas = await html2canvas(container, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: isDarkMode ? "#1e1e1e" : "#ffffff",
        });

        // 원래 상태로 복원
        zoomElements.forEach((el, index) => {
          el.style.display = originalDisplayStyles[index];
        });

        // 둥근 모서리 적용
        const cornerRadius = 12; // 모서리 반경 크기 (원하는 값으로 조정)

        // 새 캔버스 생성
        const roundedCanvas = document.createElement("canvas");
        roundedCanvas.width = originalCanvas.width;
        roundedCanvas.height = originalCanvas.height;
        const ctx = roundedCanvas.getContext("2d");

        // 둥근 사각형 경로 생성
        ctx.beginPath();
        ctx.moveTo(cornerRadius, 0);
        ctx.lineTo(roundedCanvas.width - cornerRadius, 0);
        ctx.quadraticCurveTo(
          roundedCanvas.width,
          0,
          roundedCanvas.width,
          cornerRadius
        );
        ctx.lineTo(roundedCanvas.width, roundedCanvas.height - cornerRadius);
        ctx.quadraticCurveTo(
          roundedCanvas.width,
          roundedCanvas.height,
          roundedCanvas.width - cornerRadius,
          roundedCanvas.height
        );
        ctx.lineTo(cornerRadius, roundedCanvas.height);
        ctx.quadraticCurveTo(
          0,
          roundedCanvas.height,
          0,
          roundedCanvas.height - cornerRadius
        );
        ctx.lineTo(0, cornerRadius);
        ctx.quadraticCurveTo(0, 0, cornerRadius, 0);
        ctx.closePath();

        // 경로를 클리핑 마스크로 설정
        ctx.clip();

        // 원본 이미지 그리기
        ctx.drawImage(originalCanvas, 0, 0);

        // 최종 이미지 데이터 변환
        const imageData = roundedCanvas.toDataURL("image/png");

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
      // const summary = await generateSummaryWithOpenAI(chartImages);

      const summary = `Generated summary: Based on the provided chart, here are the key findings:

- **Positive vs. Negative Cases:**
  - There is a noticeable spike in positive cases around mid-November 2024, reaching a peak before declining by early December 2024.
  - Negative cases also increase during this period but to a lesser extent compared to positive cases.

- **Percent Positive Comparison:**
  - The percent positive from the researcher's data shows a peak around mid-November 2024, aligning with the spike in positive cases.
  - The CDC data shows a gradual increase in percent positive over time, with a more consistent upward trend extending into early 2025.

- **Discrepancy Observed:**
  - There is a visible discrepancy between the researcher's data and CDC data, particularly around the peak in mid-November 2024, where the researcher's data shows a higher percent positive.
  - The reason for this difference is not clear from the data alone, and further analysis may be required.

- **Overall Trend:**
  - After the initial spike, both positive cases and percent positive rates appear to stabilize, with a slight upward trend in the CDC data continuing into 2025.

These observations should be considered with caution, and additional data may be needed for a comprehensive analysis.`;

      console.log("Generated summary:", summary);

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

        // Clean up the summary text and remove language prefixes
        let cleanText = summaryText;

        // Remove "Summary:" prefix if present
        if (cleanText.startsWith("Summary:")) {
          cleanText = cleanText.substring("Summary:".length).trim();
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

        console.log("Parsed Summary:", parsedSummary);

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

      // Modified function to add a chart with all its related descriptions
      // Optimized to ensure all sections are visible and properly formatted
      // With increased chart height
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

        // Calculate original height based on aspect ratio
        const originalHeight = (chart.height / chart.width) * imgWidth;

        // Increase height by 1.3 times (slightly reduced multiplier for more content space)
        let imgHeight;
        if (isFirstPage) {
          // Limit height for first page to ensure content fits
          imgHeight = Math.min(originalHeight * 1.2, 100); // Reduced multiplier and max height for first page
        } else {
          imgHeight = originalHeight * 1.3;
        }

        // Add chart title with smaller spacing
        pdf.setFontSize(12);
        pdf.setTextColor(...hexToRgb(primaryColor));
        pdf.setFont(headingFont, "bold");
        pdf.text("Data Visualization", margin, currentY);
        currentY += 6; // Reduced spacing from 8

        // Add chart with increased height
        pdf.addImage(chart.data, "PNG", margin, currentY, imgWidth, imgHeight);
        currentY += imgHeight + 8; // Reduced spacing after chart from 10 to 8

        // Smaller bottom margin for more efficient space use
        const pageBottomMargin = isFirstPage ? 15 : 18; // Reduced from 20

        // Add section title for analysis section
        pdf.setFontSize(14);
        pdf.setTextColor(...hexToRgb(accentColor));
        pdf.setFont(headingFont, "bold");
        pdf.text("Analysis Findings", margin, currentY);

        // Add underline
        pdf.setDrawColor(...hexToRgb(accentColor));
        pdf.setLineWidth(0.5);
        const titleWidth = Math.min(
          contentWidth,
          Math.max(
            40,
            (pdf.getStringUnitWidth("Analysis Findings") * 14) /
              pdf.internal.scaleFactor +
              10
          )
        );
        pdf.line(margin, currentY + 2, margin + titleWidth, currentY + 2);

        currentY += 8; // Reduced from 10

        // Calculate approximate total height needed for remaining sections
        let totalSectionHeight = 0;
        for (let i = 0; i < sections.length; i++) {
          const section = sections[i];
          if (!section || !section.title) continue;

          // Calculate more accurately based on actual content
          let sectionHeight = 15; // Base height for title and spacing

          if (section.bullets && section.bullets.length > 0) {
            for (const bullet of section.bullets) {
              if (!bullet || bullet.trim().length === 0) continue;
              const splitText = pdf.splitTextToSize(
                `• ${bullet}`,
                contentWidth - 4
              );
              sectionHeight +=
                splitText.length * (isFirstPage ? 3.5 : 4.5) +
                (isFirstPage ? 1.5 : 2.5);
            }
          } else if (section.text) {
            const splitText = pdf.splitTextToSize(section.text, contentWidth);
            sectionHeight += splitText.length * (isFirstPage ? 3.5 : 4.5);
          }

          // Keep track of total height
          totalSectionHeight += sectionHeight;
        }

        // Check if we need a new page before starting sections
        // Only start a new page if less than 20% of the page height would be used on current page
        const remainingPageHeight = pdfHeight - currentY - pageBottomMargin;
        const thresholdHeight = pdfHeight * 0.2; // 20% of page height

        if (
          remainingPageHeight < thresholdHeight &&
          totalSectionHeight > remainingPageHeight
        ) {
          pdf.addPage();
          addHeader(pdf);
          addFooter(pdf);
          currentY = 30;
        }

        // Add all sections with proper pagination
        for (let i = 0; i < sections.length; i++) {
          const section = sections[i];

          // Skip if section is undefined or doesn't have a title
          if (!section || !section.title) continue;

          // More accurate height calculation for this specific section
          let sectionHeight = 12; // Base height for title

          if (section.bullets && section.bullets.length > 0) {
            for (const bullet of section.bullets) {
              if (!bullet || bullet.trim().length === 0) continue;
              const splitText = pdf.splitTextToSize(
                `• ${bullet}`,
                contentWidth - 4
              );
              sectionHeight +=
                splitText.length * (isFirstPage ? 3.5 : 4.5) +
                (isFirstPage ? 1.5 : 2.5);
            }
          } else if (section.text) {
            const splitText = pdf.splitTextToSize(section.text, contentWidth);
            sectionHeight += splitText.length * (isFirstPage ? 3.5 : 4.5);
          }

          sectionHeight += isFirstPage ? 3 : 6; // Include spacing after section

          // Only start a new page if:
          // 1. The section won't fit on current page AND
          // 2. We've already used at least 70% of page OR section is too large
          const maxY = pdfHeight - pageBottomMargin;
          const pageUsedRatio =
            (currentY - (isFirstPage ? 50 : 30)) /
            (pdfHeight - pageBottomMargin - (isFirstPage ? 50 : 30));

          if (
            currentY + sectionHeight > maxY &&
            (pageUsedRatio > 0.7 || sectionHeight > remainingPageHeight * 0.9)
          ) {
            // Section won't fit and page is mostly used, start a new page
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

          // Add subtle underline for section
          pdf.setDrawColor(200, 200, 200);
          pdf.setLineWidth(0.3);
          const sectionLineWidth = Math.min(
            contentWidth / 2,
            Math.max(
              30,
              (pdf.getStringUnitWidth(section.title) * 12) /
                pdf.internal.scaleFactor +
                5
            )
          );
          pdf.line(
            margin,
            currentY + 2,
            margin + sectionLineWidth,
            currentY + 2
          );

          currentY += 6; // Reduced from 8

          // Add bullet points - more compact if on first page
          pdf.setFontSize(10);
          pdf.setTextColor(...hexToRgb(textColor));
          pdf.setFont(bodyFont, "normal");

          // Use more compact line spacing for first page
          const lineSpacing = isFirstPage ? 3.5 : 4.5; // Reduced from 4/5

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
              // Only add new page if less than 15 pixels remaining or bullet would be split
              if (currentY + splitText.length * lineSpacing > maxY - 5) {
                pdf.addPage();
                addHeader(pdf);
                addFooter(pdf);
                currentY = 30;
              }

              pdf.text(splitText, margin, currentY);
              currentY +=
                splitText.length * lineSpacing + (isFirstPage ? 1.5 : 2.5); // Reduced spacing
            });
          } else if (section.text) {
            // If there are no bullets, but there is text
            const splitText = pdf.splitTextToSize(section.text, contentWidth);

            // Check if we need a new page
            if (currentY + splitText.length * lineSpacing > maxY - 5) {
              pdf.addPage();
              addHeader(pdf);
              addFooter(pdf);
              currentY = 30;
            }

            pdf.text(splitText, margin, currentY);
            currentY += splitText.length * lineSpacing;
          }

          // Add spacing between sections - reduced spacing
          currentY += isFirstPage ? 3 : 6; // Reduced from 5/8
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

      // / FIRST PAGE - 첫 페이지 최적화
      await addLogo(pdf);

      // 제목 추가 - 세로 공간 최적화
      pdf.setFontSize(18);
      pdf.setTextColor(...hexToRgb(primaryColor));
      pdf.setFont(headingFont, "bold");
      pdf.text("Influenza Analysis Report", margin, 38);

      // 부제목 추가 - 간격 최적화
      pdf.setFontSize(11);
      pdf.setTextColor(...hexToRgb(textColor));
      pdf.setFont(headingFont, "normal");
      const today = formatDate(new Date());
      pdf.text(`Report Date: ${today}`, margin, 45);

      // 푸터 추가
      addFooter(pdf);

      // 요약 파싱
      console.log("Summary before parsing:", summary);
      const parsedSummary = parseSummary(summary);
      console.log("Parsed summary:", parsedSummary);

      // 다운로드 버튼 숨기기
      const downloadButtons = document.querySelectorAll("#downloadchart");
      downloadButtons.forEach((btn) => {
        btn.style.display = "none";
      });

      // 차트 이미지 캡처
      const chartImages = await captureChartsAsImages();

      // 다운로드 버튼 다시 표시
      downloadButtons.forEach((btn) => {
        btn.style.display = "block";
      });

      // 차트 섹션 초기화 - 모든 섹션을 첫 번째 차트에 연결
      const chartSections = {
        0: [], // 모든 섹션은 첫 번째 차트에 연결
      };
      // 섹션 존재 확인 및 처리
      if (parsedSummary.sections && parsedSummary.sections.length > 0) {
        console.log("Total sections found:", parsedSummary.sections.length);

        // 섹션 순서 최적화 - 짧은 섹션을 앞으로 배치하여 첫 페이지 공간 활용 최대화
        // (선택 사항 - 원래 순서를 유지하려면 이 단계를 건너뛸 수 있음)
        const sortedSections = [...parsedSummary.sections].sort((a, b) => {
          const aLength = a.bullets ? a.bullets.length : 0;
          const bLength = b.bullets ? b.bullets.length : 0;
          return aLength - bLength; // 글머리 기호가 적은 순서대로 정렬
        });

        // 모든 섹션을 첫 번째 차트에 추가 (정렬된 순서 또는 원래 순서로)
        // 원래 순서를 유지하려면 sortedSections 대신 parsedSummary.sections 사용
        parsedSummary.sections.forEach((section, index) => {
          console.log(`Processing section ${index}:`, section);

          chartSections[0].push({
            title: section.title,
            bullets: section.bullets,
          });
        });
      }

      console.log("Final chart sections assignment:", chartSections);

      // 첫 페이지 콘텐츠 시작 위치 설정 - 로고와 제목 아래
      let currentPosition = 50;

      // 첫 번째 차트 추가 전 페이지 높이 예측
      // 최대한 첫 페이지 공간을 활용하기 위한 사전 조치
      let estimatedTotalHeight = 0;
      if (chartImages.length > 0) {
        // 차트 이미지 높이 예측
        const imgWidth = contentWidth;
        const originalHeight =
          (chartImages[0].height / chartImages[0].width) * imgWidth;
        const imgHeight = Math.min(originalHeight * 1.3, 100); // 높이 제한

        // 차트 제목 + 이미지 + 분석 섹션 제목 + 간격
        estimatedTotalHeight = 5 + imgHeight + 6 + 7; // 차트 제목, 이미지, 섹션 제목 간격

        // 섹션 높이 예측 (간략하게)
        if (chartSections[0] && chartSections[0].length > 0) {
          for (const section of chartSections[0]) {
            // 섹션 제목 + 기본 간격
            estimatedTotalHeight += 15;

            // 글머리 기호 예측
            if (section.bullets && section.bullets.length > 0) {
              // 글머리 기호당 평균 10픽셀로 대략 예측
              estimatedTotalHeight += section.bullets.length * 10;
            }
          }
        }
      }

      // 차트와 섹션 추가
      if (chartImages.length > 0) {
        if (chartSections[0] && chartSections[0].length > 0) {
          // 첫 번째 차트와 모든 섹션 추가 (최적화된 함수 사용)
          currentPosition = addChartWithDescription(
            pdf,
            chartImages[0],
            chartSections[0],
            currentPosition,
            true // 첫 페이지임을 표시
          );
        } else {
          // 섹션 없이 차트만 추가
          const imgWidth = contentWidth;
          const originalHeight =
            (chartImages[0].height / chartImages[0].width) * imgWidth;
          const imgHeight = Math.min(originalHeight * 1.3, 120);

          pdf.setFontSize(12);
          pdf.setTextColor(...hexToRgb(primaryColor));
          pdf.setFont(headingFont, "bold");
          pdf.text("Data Visualization", margin, currentPosition);
          currentPosition += 5;

          pdf.addImage(
            chartImages[0].data,
            "PNG",
            margin,
            currentPosition,
            imgWidth,
            imgHeight
          );
          currentPosition += imgHeight + 10;
        }
      }

      // 추가 차트 처리
      for (let i = 1; i < chartImages.length; i++) {
        // 현재 페이지에 충분한 공간이 없는 경우에만 새 페이지 시작
        if (currentPosition > pdfHeight - 100) {
          // 최소 100픽셀 필요
          pdf.addPage();
          addHeader(pdf);
          addFooter(pdf);
          currentPosition = 30;
        }

        // 추가 차트 추가
        const imgWidth = contentWidth;
        const originalHeight =
          (chartImages[i].height / chartImages[i].width) * imgWidth;
        const imgHeight = originalHeight * 1.3;

        pdf.setFontSize(12);
        pdf.setTextColor(...hexToRgb(primaryColor));
        pdf.setFont(headingFont, "bold");
        pdf.text(`Additional Visualization ${i}`, margin, currentPosition);
        currentPosition += 5;

        pdf.addImage(
          chartImages[i].data,
          "PNG",
          margin,
          currentPosition,
          imgWidth,
          imgHeight
        );
        currentPosition += imgHeight + 10;
      }

      // PDF 저장
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
