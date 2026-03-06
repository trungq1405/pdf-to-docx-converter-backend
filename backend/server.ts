import express from "express";
import cors from "cors";
import multer from "multer";
import {createRequire} from 'module';
import {Document, Packer, Paragraph, TextRun} from "docx";

// ✅ Import pdf-parse với ESM
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

// ❌ XÓA: const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');
// ❌ XÓA: pdfjsLib.GlobalWorkerOptions.workerSrc = '';

// Helper function - extract text với pdf-parse
async function extractFormattedParagraphs(buffer: Buffer): Promise<Paragraph[]> {
    const data = await pdfParse(buffer);
    const paragraphs: Paragraph[] = [];

    // Tách theo dòng, giữ format cơ bản
    const lines = data.text.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Sanitize text
        const sanitizedText = trimmed
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "")
            .replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD\u10000-\u10FFFF]/g, "");

        if (!sanitizedText) continue;

        paragraphs.push(new Paragraph({
            children: [new TextRun({
                text: sanitizedText,
                font: "Times New Roman",
                size: 24 // 12pt
            })],
            spacing: {after: 100}
        }));
    }

    if (paragraphs.length === 0) {
        paragraphs.push(new Paragraph({children: [new TextRun({text: " "})]}));
    }

    return paragraphs;
}

const app = express();

// CORS middleware
app.options('*', cors());
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: false
}));

app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({extended: true, limit: '50mb'}));

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {fileSize: 50 * 1024 * 1024}
});

// @ts-ignore
app.post("/api/convert", upload.single("pdf"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({error: "No file uploaded"});

        const paragraphs = await extractFormattedParagraphs(req.file.buffer);
        if (paragraphs.length === 0) return res.status(400).json({error: "Could not extract text from PDF"});

        const doc = new Document({sections: [{properties: {}, children: paragraphs}]});
        const buffer = await Packer.toBuffer(doc);

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        res.setHeader("Content-Disposition", `attachment; filename="converted_document.docx"`);
        res.send(buffer);
    } catch (error: any) {
        console.error("Conversion error:", error);
        res.status(500).json({error: error.message || "Failed to convert PDF to DOCX"});
    }
});

app.get('/health', (req, res) => res.json({status: 'OK'}));

// Export cho Vercel serverless
export default app;

// Local dev ONLY
if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, '0.0.0.0', () => console.log('🚀 http://localhost:3000'));
}
