import { cp, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const source = new URL('node_modules/pdfjs-dist/', root);
const target = new URL('public/vendor/pdfjs/', root);
await mkdir(target, { recursive: true });
for (const file of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  await cp(new URL('build/' + file, source), new URL(file, target));
}
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp(new URL(folder, source), new URL(folder, target), { recursive: true });
}
await cp(new URL('LICENSE', source), new URL('LICENSE', target));
console.log('PDF support is ready.');
