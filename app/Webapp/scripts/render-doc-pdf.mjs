#!/usr/bin/env node
//
// render-doc-pdf.mjs — Markdown (with ```mermaid fences) → PDF.
//
// The repo had no Markdown→PDF pipeline: pandoc, mmdc, wkhtmltopdf and a
// system Chrome are all absent on the deployment hosts. WeasyPrint is present
// but does not execute JavaScript, and Mermaid diagrams only exist after JS
// runs. Playwright's bundled Chromium is already installed here for the e2e
// suite, so it does the rendering and prints the PDF.
//
// Usage (from app/Webapp/):
//   node scripts/render-doc-pdf.mjs ../../docs/architecture/WEBAPP_ARCHITECTURE.md
//   node scripts/render-doc-pdf.mjs <input.md> [output.pdf]
//
// Exits non-zero if any Mermaid diagram fails to render, so a PDF with silently
// missing diagrams is never produced.

import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { chromium } from "playwright";

const MERMAID_CDN = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";

// Printable area of A4 minus the page margins below, in CSS px (1mm = 3.7795px).
const MM = 3.7795;
const PRINT_W_PX = Math.floor((210 - 28) * MM);
const PRINT_H_PX = Math.floor((297 - 40) * MM);

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Inline spans: `code`, **bold**, *italic*, [text](href). Code wins over the rest. */
function inline(text) {
  const codes = [];
  let out = escapeHtml(text).replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = out
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
}

/** True when a line opens a new block, so paragraph/list continuation must stop. */
const isBlockStart = (line) =>
  /^(#{1,6}\s|```|>|---+\s*$|\s*(?:[-*]|\d+\.)\s|\s*\|)/.test(line);

const cells = (row) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

/**
 * Markdown → HTML for the subset used in docs/architecture: headings, tables,
 * lists, blockquotes, rules, fenced code and ```mermaid blocks. Deliberately
 * small — a full CommonMark parser is not worth a new dependency here.
 */
function markdownToHtml(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let diagrams = 0;
  let i = 0;
  let listTag = null;

  const closeList = () => {
    if (listTag) {
      html.push(`</${listTag}>`);
      listTag = null;
    }
  };
  const openList = (tag) => {
    if (listTag !== tag) {
      closeList();
      html.push(`<${tag}>`);
      listTag = tag;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced blocks.
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      closeList();
      const lang = fence[1];
      const body = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++; // closing fence
      if (lang === "mermaid") {
        diagrams++;
        html.push(`<div class="diagram"><pre class="mermaid">${escapeHtml(body.join("\n"))}</pre></div>`);
      } else {
        html.push(`<pre class="code"><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      }
      continue;
    }

    // Table: header row followed by a |---|---| separator.
    if (/^\s*\|/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || "")) {
      closeList();
      const head = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) body.push(cells(lines[i++]));
      html.push(
        "<table><thead><tr>" +
          head.map((c) => `<th>${inline(c)}</th>`).join("") +
          "</tr></thead><tbody>" +
          body
            .map((r) => "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>")
            .join("") +
          "</tbody></table>",
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      html.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
      i++;
      continue;
    }

    if (/^---+\s*$/.test(line)) {
      closeList();
      html.push("<hr/>");
      i++;
      continue;
    }

    // List items, with lazy continuation: a wrapped item keeps its following
    // indented/plain lines inside the same <li> instead of dropping out of the
    // list as a stray paragraph.
    const item = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
    if (item) {
      openList(/^\s*\d+\./.test(line) ? "ol" : "ul");
      const parts = [item[1]];
      i++;
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
        parts.push(lines[i].trim());
        i++;
      }
      html.push(`<li>${inline(parts.join(" "))}</li>`);
      continue;
    }

    // Blockquote: consecutive "> " lines are one quote, not one box per line.
    if (/^>\s?/.test(line)) {
      closeList();
      const quoted = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      html.push(`<blockquote>${inline(quoted.join(" "))}</blockquote>`);
      continue;
    }

    if (!line.trim()) {
      closeList();
      i++;
      continue;
    }

    // Paragraph: absorb following non-blank, non-block lines.
    closeList();
    const para = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      para.push(lines[i++]);
    }
    html.push(`<p>${inline(para.join(" "))}</p>`);
  }
  closeList();
  return { body: html.join("\n"), diagrams };
}

// Noto Sans CJK is present on the deployment host; without an explicit CJK
// family Chromium renders the Korean mirror documents as tofu boxes.
const CSS = `
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Noto Sans", "Noto Sans CJK KR", "Noto Sans KR", "DejaVu Sans", sans-serif;
    font-size: 10.5pt; line-height: 1.55; color: #16202c; margin: 0;
  }
  h1 { font-size: 20pt; margin: 0 0 4mm; border-bottom: 2px solid #2f5d9e; padding-bottom: 2mm; }
  h2 { font-size: 14pt; margin: 8mm 0 3mm; color: #1f4a86; border-bottom: 1px solid #d6dee8; padding-bottom: 1mm; }
  h3 { font-size: 11.5pt; margin: 6mm 0 2mm; color: #24425f; }
  h4 { font-size: 10.5pt; margin: 4mm 0 2mm; color: #24425f; }
  p { margin: 0 0 3mm; }
  ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
  li { margin: 0 0 1mm; }
  code { font-family: "DejaVu Sans Mono", monospace; font-size: 9pt; background: #eef2f7; padding: 0 1mm; border-radius: 2px; }
  pre.code { background: #f6f8fa; border: 1px solid #dde3ea; border-radius: 3px; padding: 3mm; overflow: hidden; page-break-inside: avoid; }
  pre.code code { background: none; padding: 0; font-size: 8.5pt; line-height: 1.4; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 4mm; font-size: 9pt; page-break-inside: avoid; }
  th, td { border: 1px solid #cfd8e3; padding: 1.4mm 2mm; text-align: left; vertical-align: top; }
  th { background: #eef3f9; font-weight: 600; }
  blockquote { margin: 0 0 3mm; padding: 2mm 3mm; border-left: 3px solid #9db6d6; background: #f4f7fb; color: #35485c; }
  hr { border: none; border-top: 1px solid #dde3ea; margin: 6mm 0; }
  .diagram { page-break-inside: avoid; margin: 0 0 5mm; text-align: center; }
  .diagram svg { max-width: 100% !important; height: auto !important; }
`;

async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input) {
    console.error("usage: node scripts/render-doc-pdf.mjs <input.md> [output.pdf]");
    process.exit(2);
  }
  const inPath = resolve(input);
  const outPath = resolve(output || inPath.replace(/\.md$/i, ".pdf"));

  const { body, diagrams } = markdownToHtml(await readFile(inPath, "utf8"));
  console.log(`[render] ${basename(inPath)} — ${diagrams} mermaid diagram(s)`);

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.on("console", (m) => {
      if (m.type() === "error") console.error("  [page]", m.text());
    });
    await page.setContent(html, { waitUntil: "load" });

    if (diagrams > 0) {
      // Fail loudly rather than emit a PDF with holes where diagrams belong.
      await page.addScriptTag({ url: MERMAID_CDN }).catch(() => {
        throw new Error(`could not load Mermaid from ${MERMAID_CDN} (offline?)`);
      });
      await page.evaluate(async () => {
        // eslint-disable-next-line no-undef
        window.mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          flowchart: { htmlLabels: true, useMaxWidth: true },
        });
        // eslint-disable-next-line no-undef
        await window.mermaid.run({ querySelector: "pre.mermaid" });
      });
      // Fit every diagram inside one printable page. `page-break-inside: avoid`
      // moves a too-tall diagram to the next page but does not shrink it, so
      // anything past the page bottom is silently clipped. Scale by viewBox
      // aspect ratio instead.
      const rendered = await page.evaluate(({ maxW, maxH }) => {
        const svgs = document.querySelectorAll(".diagram svg");
        svgs.forEach((svg) => {
          const vb = (svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
          const [, , vbW, vbH] = vb;
          if (!vbW || !vbH) return;
          const width = Math.min(maxW, (maxH * vbW) / vbH);
          svg.style.width = `${width}px`;
          svg.style.maxWidth = `${width}px`;
          svg.style.height = "auto";
        });
        return svgs.length;
      }, { maxW: PRINT_W_PX, maxH: PRINT_H_PX });
      if (rendered !== diagrams) {
        throw new Error(`only ${rendered}/${diagrams} Mermaid diagrams rendered`);
      }
      console.log(`[render] ${rendered}/${diagrams} diagrams rendered`);
    }

    await page.emulateMedia({ media: "print" });
    await page.pdf({
      path: outPath,
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate:
        '<div style="width:100%;font-size:7pt;color:#7c8794;padding:0 14mm;text-align:right;">' +
        '<span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
    });
  } finally {
    await browser.close();
  }
  console.log(`[render] wrote ${outPath}`);
}

main().catch((err) => {
  console.error(`[render] FAILED: ${err.message}`);
  process.exit(1);
});
