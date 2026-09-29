import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { QRCodeSVG } from "qrcode.react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Receipt } from "./escpos";

// PDFs and images the app shares (the Android WebView cannot print or
// download): a bill drawn like the printed receipt, report tables, table QRs.
// The built-in PDF fonts have no rupee sign, so "₹" is written "Rs.".

const pdfText = (s: string) => s.replace(/₹\s?/g, "Rs. ");

/** A QR code as an SVG string. */
export function qrSvg(value: string, size = 512) {
  const svg = renderToStaticMarkup(createElement(QRCodeSVG, { value, size, includeMargin: true }));
  return svg.includes("xmlns")
    ? svg
    : svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
}

/** Draws an SVG onto a white canvas; returns the PNG as a data URL. */
export async function svgToPng(svg: string, width: number, height: number): Promise<string> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, width, height);
  g.drawImage(img, 0, 0, width, height);
  return c.toDataURL("image/png");
}

/** A printable table card: outlet name, the QR, the table name. PNG bytes. */
export async function qrCardPng(input: {
  url: string;
  outlet: string;
  table: string;
  note: string;
}): Promise<Uint8Array> {
  const W = 900;
  const H = 1200;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#a81926";
  g.fillRect(0, 0, W, 18);
  g.textAlign = "center";
  g.fillStyle = "#1f1b1a";
  g.font = "800 54px Archivo, Manrope, sans-serif";
  g.fillText(input.outlet, W / 2, 120, W - 80);
  const qr = new Image();
  qr.src = await svgToPng(qrSvg(input.url), 700, 700);
  await qr.decode();
  g.drawImage(qr, (W - 700) / 2, 170, 700, 700);
  g.font = "800 96px Archivo, Manrope, sans-serif";
  g.fillText(input.table, W / 2, 990, W - 80);
  g.fillStyle = "#6b6360";
  g.font = "500 34px Manrope, sans-serif";
  g.fillText(input.note, W / 2, 1060, W - 80);
  g.font = "600 26px Manrope, sans-serif";
  g.fillText("BillerPe", W / 2, 1150);
  return dataUrlBytes(c.toDataURL("image/png"));
}

export const dataUrlBytes = (url: string) =>
  Uint8Array.from(atob(url.split(",")[1] ?? ""), (ch) => ch.charCodeAt(0));

const bytesOf = (doc: jsPDF) => new Uint8Array(doc.output("arraybuffer"));

/** The receipt as a PDF the width of the paper roll, same lines as the print. */
export async function receiptPdf(receipt: Receipt, paper: "58mm" | "80mm"): Promise<Uint8Array> {
  const width = paper === "58mm" ? 58 : 80;
  const margin = 4;
  const printable = ((width - 2 * margin) * 72) / 25.4; // points
  // Courier is 0.6 em wide: fit the paper's columns across the page.
  const base = printable / (receipt.cols * 0.6);
  const mm = (pt: number) => (pt * 25.4) / 72;
  const qrSize = Math.min(34, width - 2 * margin);
  const rowHeight = (r: Receipt["rows"][number]) =>
    r.qr ? qrSize + 2 : mm(base * (r.size === "normal" ? 1.2 : r.size === "tall" ? 1.9 : 2.4));
  const height = margin * 2 + receipt.rows.reduce((a, r) => a + rowHeight(r), 0);

  const doc = new jsPDF({ unit: "mm", format: [width, Math.max(height, 60)], compress: true });
  let y = margin;
  for (const r of receipt.rows) {
    const h = rowHeight(r);
    if (r.qr) {
      const png = await svgToPng(qrSvg(r.qr, 264), 264, 264);
      doc.addImage(png, "PNG", (width - qrSize) / 2, y, qrSize, qrSize);
    } else if (r.text.trim()) {
      // Tall/big lines are printed double size: draw them bigger, trimmed and aligned.
      const size = r.size === "normal" ? base : r.size === "tall" ? base * 1.5 : base * 2;
      doc.setFont("courier", r.bold || r.size !== "normal" ? "bold" : "normal");
      doc.setFontSize(size);
      const text = r.size === "normal" ? r.text : r.text.trim();
      const x =
        r.size === "normal" || r.align === "left"
          ? margin
          : r.align === "right"
            ? width - margin
            : width / 2;
      const align = r.size === "normal" ? "left" : r.align;
      doc.text(text, x, y + h * 0.75, { align, baseline: "alphabetic" });
    }
    y += h;
  }
  return bytesOf(doc);
}

export interface TablePdfInput {
  title: string;
  /** Lines under the title: outlet, period, filters. */
  subtitle: string[];
  summary?: { label: string; value: string }[];
  columns: { label: string; right?: boolean | undefined }[];
  rows: string[][];
  totals?: string[] | undefined;
}

/** A report as an A4 PDF with a table (landscape when it has many columns). */
export function tablePdf(input: TablePdfInput): Uint8Array {
  const wide = input.columns.length > 6;
  const doc = new jsPDF({
    unit: "mm",
    format: "a4",
    orientation: wide ? "landscape" : "portrait",
    compress: true,
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(pdfText(input.title), 14, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  input.subtitle.forEach((l, i) => doc.text(pdfText(l), 14, 22 + i * 4.5));
  let y = 22 + input.subtitle.length * 4.5 + 2;
  if (input.summary?.length) {
    doc.setTextColor(30);
    doc.text(pdfText(input.summary.map((s) => `${s.label}: ${s.value}`).join("    ")), 14, y + 2, {
      maxWidth: doc.internal.pageSize.getWidth() - 28,
    });
    y += 8;
  }
  const right = input.columns.map((c) => Boolean(c.right));
  autoTable(doc, {
    startY: y,
    head: [input.columns.map((c) => pdfText(c.label))],
    body: input.rows.map((r) => r.map(pdfText)),
    ...(input.totals ? { foot: [input.totals.map(pdfText)] } : {}),
    styles: { fontSize: 8.5, cellPadding: 1.8 },
    headStyles: { fillColor: [168, 25, 38] },
    footStyles: { fillColor: [240, 236, 232], textColor: 20, fontStyle: "bold" },
    // Numbers right-aligned in the heading, body and total rows alike.
    didParseCell: (cell) => {
      cell.cell.styles.halign = right[cell.column.index] ? "right" : "left";
    },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text(`BillerPe POS - page ${doc.getNumberOfPages()}`, 14, h - 8);
    },
  });
  return bytesOf(doc);
}
