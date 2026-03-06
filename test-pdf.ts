import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

async function test() {
  const data = new Uint8Array(fs.readFileSync('package.json')); // just a dummy file, wait, it needs to be a PDF.
  // I don't have a PDF. Let's just write the logic in server.ts and test it.
}
