export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_RESUME_CHARS = 45000;
const MAX_PAGES = 20;
const assetBase = new URL('./vendor/pdfjs/', import.meta.url);

async function loadPdfLibrary() {
  const pdf = await import('./vendor/pdfjs/pdf.min.mjs');
  pdf.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', assetBase).href;
  return pdf;
}
function checkText(text) {
  const cleaned = text.replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!cleaned) throw new Error('No readable text was found. For a scanned or image-only PDF, paste your resume text or upload a PDF with selectable text.');
  if (cleaned.length > MAX_RESUME_CHARS) throw new Error('This resume contains too much text. Use a shorter version, up to 45,000 characters.');
  return cleaned;
}
export async function readResume(file, loadPdf = loadPdfLibrary) {
  const extension = file.name.toLowerCase().split('.').pop();
  if (!['pdf', 'txt', 'md'].includes(extension)) throw new Error('Choose a PDF, TXT or Markdown resume.');
  if (extension !== 'pdf') {
    if (file.size > 200000) throw new Error('Use a text resume smaller than 200 KB.');
    return { text: checkText(await file.text()), pages: null };
  }
  if (file.size > MAX_PDF_BYTES) throw new Error('Use a PDF smaller than 10 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!new TextDecoder('latin1').decode(bytes.subarray(0, 1024)).includes('%PDF-')) {
    throw new Error('This file is not a readable PDF. Export the resume as a PDF and try again.');
  }
  const pdf = await loadPdf();
  const task = pdf.getDocument({
    data: bytes,
    cMapUrl: new URL('cmaps/', assetBase).href, cMapPacked: true,
    standardFontDataUrl: new URL('standard_fonts/', assetBase).href,
    wasmUrl: new URL('wasm/', assetBase).href,
    isEvalSupported: false, enableXfa: false, useSystemFonts: false
  });
  let timeout;
  try {
    return await Promise.race([
      (async () => {
        const doc = await task.promise;
        if (doc.numPages > MAX_PAGES) throw new Error('Use a resume PDF with 20 pages or fewer.');
        const pages = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          pages.push(content.items.filter(item => typeof item.str === 'string')
            .map(item => item.str + (item.hasEOL ? '\n' : ' ')).join(''));
          page.cleanup();
          if (pages.join('\n').length > MAX_RESUME_CHARS) throw new Error('This PDF contains too much text. Use a shorter resume.');
        }
        return { text: checkText(pages.join('\n\n')), pages: doc.numPages };
      })(),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('This PDF is taking too long to read. Try a simpler PDF or paste the resume text.')), 30000); })
    ]);
  } catch (error) {
    if (error.name === 'PasswordException') throw new Error('This PDF is password protected. Upload an unlocked copy or paste the resume text.');
    if (error.name === 'InvalidPDFException') throw new Error('This PDF could not be read. Export a fresh PDF or paste the resume text.');
    throw error;
  } finally {
    clearTimeout(timeout);
    await task.destroy();
  }
}
