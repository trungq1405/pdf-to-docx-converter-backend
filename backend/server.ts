import express from "express";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import { PDFParse } from "pdf-parse";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup pdfjs worker
// pdfjs.GlobalWorkerOptions.workerSrc = path.join(__dirname, "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = ''; // Disable worker cho Node.js

// Helper function to extract formatted text and generate DOCX paragraphs
async function extractFormattedParagraphs(buffer: Buffer): Promise<Paragraph[]> {
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  const numPages = doc.numPages;
  const paragraphs: Paragraph[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const pageWidth = viewport.width;

    const textContent = await page.getTextContent();
    const items = textContent.items as any[];
    const styles = textContent.styles;

    if (items.length === 0) continue;

    // Group items by Y coordinate (lines)
    const linesMap = new Map<number, any[]>();
    for (const item of items) {
      if (!item.str || item.str.trim() === '') {
        if (!item.str) continue;
      }

      const y = Math.round(item.transform?.[5] || 0); // Y coordinate

      // Find an existing line within a tolerance (e.g., 4 points)
      let foundY = y;
      for (const key of linesMap.keys()) {
        if (Math.abs(key - y) <= 4) {
          foundY = key;
          break;
        }
      }

      if (!linesMap.has(foundY)) {
        linesMap.set(foundY, []);
      }
      linesMap.get(foundY)!.push(item);
    }

    // Sort lines by Y descending (top to bottom)
    const sortedY = Array.from(linesMap.keys()).sort((a, b) => b - a);

    for (const y of sortedY) {
      const lineItems = linesMap.get(y)!;
      // Sort items in the line by X ascending (left to right)
      lineItems.sort((a, b) => (a.transform?.[4] || 0) - (b.transform?.[4] || 0));

      // Calculate line bounds
      const minX = Number(lineItems[0].transform?.[4]) || 0;
      const lastItem = lineItems[lineItems.length - 1];
      const maxX = (Number(lastItem.transform?.[4]) || 0) + (Number(lastItem.width) || 0);
      const lineWidth = Math.max(0, maxX - minX);

      // Determine alignment
      let alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT;
      let indentLeft = 0;

      const centerPoint = minX + (lineWidth / 2);
      const pageCenter = pageWidth / 2;

      // If the text is roughly centered
      if (Math.abs(centerPoint - pageCenter) < 50 && minX > 40 && maxX < pageWidth - 40) {
        alignment = AlignmentType.CENTER;
      }
      // If the text is right-aligned
      else if (pageWidth - maxX < 100 && minX > pageWidth / 2) {
        alignment = AlignmentType.RIGHT;
      }
      // If left aligned but indented
      else if (minX > 60) {
        indentLeft = Math.min(minX * 15, 10000); // docx uses twips (1/20 of a point). Max 10000 twips (~7 inches).
      }

      const runs: TextRun[] = [];
      let lastItemX = -1;
      let lastItemWidth = 0;
      let lastItemStr = "";

      for (const item of lineItems) {
        const fontName = item.fontName || "";
        const style = styles[fontName];
        const isBold = fontName.toLowerCase().includes("bold") || (style && style.fontFamily && style.fontFamily.toLowerCase().includes("bold"));
        const isItalic = fontName.toLowerCase().includes("italic") || fontName.toLowerCase().includes("oblique") || (style && style.fontFamily && style.fontFamily.toLowerCase().includes("italic"));
        const fontSize = Math.max(1, Math.round(Math.abs(item.transform?.[0]) || item.height || 12));

        // Add space if there's a significant visual gap between items
        if (lastItemX !== -1) {
           const gap = (item.transform?.[4] || 0) - (lastItemX + lastItemWidth);
           if (gap > fontSize * 0.25 && !lastItemStr.endsWith(" ") && !item.str.startsWith(" ")) {
               runs.push(new TextRun({ text: " " }));
           }
        }

        const sanitizedText = item.str
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "") // Remove control characters
          .replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD\u10000-\u10FFFF]/g, ""); // Remove invalid XML chars

        if (sanitizedText) {
          runs.push(new TextRun({
            text: sanitizedText,
            bold: isBold,
            italics: isItalic,
            size: fontSize ? fontSize * 2 : 24, // docx uses half-points for font size, default 12pt
            font: "Times New Roman", // Force standard font to prevent XML corruption from weird PDF font names
          }));
        }

        lastItemX = item.transform?.[4] || 0;
        lastItemWidth = item.width || 0;
        lastItemStr = item.str;
      }

      if (runs.length > 0) {
        const paragraphOptions: any = {
            children: runs,
            alignment: alignment,
            spacing: {
                after: 100, // Add a little spacing after each line to prevent them from being too squished
            }
        };
        if (indentLeft > 0 && alignment === AlignmentType.LEFT) {
            paragraphOptions.indent = { left: Math.round(indentLeft) };
        }
        paragraphs.push(new Paragraph(paragraphOptions));
      }
    }

    // Add a page break if not the last page
    if (pageNum < numPages) {
       paragraphs.push(new Paragraph({ children: [new TextRun({ text: "" })], pageBreakBefore: true }));
    }
  }

  if (paragraphs.length === 0) {
    paragraphs.push(new Paragraph({ children: [new TextRun({ text: " " })] }));
  }

  return paragraphs;
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(cors({
    origin: [
      'http://localhost:5173',      // Vite dev
      'http://localhost:3000',      // Backend dev
      'https://trungq1405.github.io', // GitHub Pages frontend
      'https://pdf-to-docx-converter.vercel.app', // Vercel fullstack (nếu dùng)
      '*'                           // Allow all (dev thoải mái, prod có thể giới hạn)
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: true
  }));


  // Serve frontend static files
  app.use(express.static(path.join(__dirname, '../dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });

  const upload = multer({ storage: multer.memoryStorage() });

  // API routes
  // @ts-ignore
  app.post("/api/convert", upload.single("pdf"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // 1. Extract formatted text from PDF
      const paragraphs = await extractFormattedParagraphs(req.file.buffer);

      if (paragraphs.length === 0) {
        return res.status(400).json({ error: "Could not extract text from PDF" });
      }

      // 2. Create DOCX
      const doc = new Document({
        sections: [
          {
            properties: {},
            children: paragraphs,
          },
        ],
      });

      // 3. Generate buffer and send
      const buffer = await Packer.toBuffer(doc);

      const originalName = req.file.originalname.replace(/\.pdf$/i, "").replace(/["\\]/g, "");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

      // Safe filename header - simple ASCII to avoid any browser parsing issues
      res.setHeader("Content-Disposition", `attachment; filename="converted_document.docx"`);
      res.send(buffer);
    } catch (error: any) {
      console.error("Conversion error:", error);
      res.status(500).json({
        error: error.message || "Failed to convert PDF to DOCX",
        details: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
