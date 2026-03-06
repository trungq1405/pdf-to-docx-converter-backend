import express from "express";
import cors from "cors";
import multer from "multer";
import { extractText, getDocumentProxy } from "unpdf";
import { Document, Packer, Paragraph, TextRun } from "docx";

// ✅ KHÔNG CẦN worker, KHÔNG CẦN canvas

async function extractFormattedParagraphs(buffer: Buffer): Promise<Paragraph[]> {
    // unpdf - serverless native, zero deps
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: false });

    const paragraphs: Paragraph[] = [];
    const pages = Array.isArray(text) ? text : [text];

    for (let i = 0; i < pages.length; i++) {
        const lines = pages[i].split('\n');

        for (const line of lines) {
            const sanitized = line.trim()
                .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "")
                .replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD\u10000-\u10FFFF]/g, "");

            if (!sanitized) continue;

            paragraphs.push(new Paragraph({
                children: [new TextRun({
                    text: sanitized,
                    font: "Times New Roman",
                    size: 24
                })],
                spacing: { after: 100 }
            }));
        }

        // Page break giữa các trang
        if (i < pages.length - 1) {
            paragraphs.push(new Paragraph({
                children: [new TextRun({ text: "" })],
                pageBreakBefore: true
            }));
        }
    }

    if (paragraphs.length === 0) {
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: " " })] }));
    }

    return paragraphs;
}

const app = express();

app.options('*', cors());
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'], credentials: false }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// @ts-ignore
app.post("/api/convert", upload.single("pdf"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });
        const paragraphs = await extractFormattedParagraphs(req.file.buffer);
        const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
        const buffer = await Packer.toBuffer(doc);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        res.setHeader("Content-Disposition", `attachment; filename="converted_document.docx"`);
        res.send(buffer);
    } catch (error: any) {
        console.error("Conversion error:", error);
        res.status(500).json({ error: error.message || "Failed to convert PDF to DOCX" });
    }
});

app.get('/health', (req, res) => res.json({ status: 'OK' }));

export default app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, '0.0.0.0', () => console.log('🚀 http://localhost:3000'));
}
