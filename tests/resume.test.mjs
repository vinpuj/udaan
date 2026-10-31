import test from 'node:test';
import assert from 'node:assert/strict';
import { readResume, MAX_PDF_BYTES } from '../public/resume.mjs';
import { makePdf } from './pdf-fixture.mjs';
const pdfLibrary = () => import('pdfjs-dist/legacy/build/pdf.mjs');

test('a real two-page PDF yields readable resume text from both pages', async () => {
  const file = new File([makePdf([
    ['Resume upload check', 'Skills: Excel, SQL and communication'],
    ['Experience: Prepared weekly reports', 'Education: Bachelor of Commerce']
  ])], 'resume.PDF', { type: 'application/pdf' });
  const result = await readResume(file, pdfLibrary);
  assert.equal(result.pages, 2);
  for (const text of ['Resume upload check', 'Skills: Excel', 'Prepared weekly reports', 'Bachelor of Commerce']) assert.ok(result.text.includes(text));
  assert.ok(result.text.indexOf('Skills') < result.text.indexOf('Experience'));
});
test('empty/scanned PDFs fail with useful guidance instead of an empty resume', async () => {
  await assert.rejects(readResume(new File([makePdf([[]])], 'scanned.pdf'), pdfLibrary), /scanned or image-only/);
});
test('PDF validation rejects invalid files, oversized uploads and excessive pages', async () => {
  await assert.rejects(readResume(new File(['This is not a PDF'], 'bad.pdf')), /not a readable PDF/);
  await assert.rejects(readResume({ name: 'large.pdf', size: MAX_PDF_BYTES + 1 }), /10 MB/);
  await assert.rejects(readResume(new File([makePdf(Array.from({ length: 21 }, () => ['Page']))], 'long.pdf'), pdfLibrary), /20 pages/);
  await assert.rejects(readResume(new File(['image'], 'resume.png')), /PDF, TXT or Markdown/);
});
test('existing text and Markdown resume imports remain supported', async () => {
  const result = await readResume(new File(['My experience\n\nSkills: Excel'], 'resume.md'));
  assert.equal(result.text, 'My experience\n\nSkills: Excel');
  assert.equal(result.pages, null);
});
