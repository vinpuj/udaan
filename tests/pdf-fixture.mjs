// Minimal selectable-text PDFs for parser tests; never shipped as user content.
export function makePdf(pages) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count ' + pages.length + ' /Kids [' + pages.map((_, i) => (4 + i * 2) + ' 0 R').join(' ') + '] >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  for (const [index, lines] of pages.entries()) {
    const contentId = 5 + index * 2;
    const stream = 'BT /F1 12 Tf 50 750 Td ' + lines.map((line, i) =>
      (i ? '0 -20 Td ' : '') + '(' + line.replace(/[\\()]/g, '\\$&') + ') Tj').join('\n') + ' ET';
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + contentId + ' 0 R >>');
    objects.push('<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream');
  }
  let pdf = '%PDF-1.4\n', offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += (index + 1) + ' 0 obj\n' + object + '\nendobj\n'; });
  const xref = Buffer.byteLength(pdf);
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  pdf += offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  return new Uint8Array(Buffer.from(pdf));
}
