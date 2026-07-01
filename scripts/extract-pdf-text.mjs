import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { PDFParse } from 'pdf-parse';

const root = process.cwd();
const resourcesDir = path.join(root, 'resources');
const outputDir = path.join(root, 'artifacts', 'pdf-text');

await fs.mkdir(outputDir, { recursive: true });

const files = (await fs.readdir(resourcesDir))
  .filter((file) => file.toLowerCase().endsWith('.pdf'))
  .sort((a, b) => a.localeCompare(b));

for (const file of files) {
  const pdfPath = path.join(resourcesDir, file);
  const buffer = await fs.readFile(pdfPath);
  const parser = new PDFParse({ data: buffer });
  const parsed = await parser.getText();
  await parser.destroy();
  const baseName = file.replace(/\.pdf$/i, '.txt');
  const outPath = path.join(outputDir, baseName);
  await fs.writeFile(outPath, parsed.text, 'utf8');
  console.log(`${file}: ${parsed.total} pages -> ${path.relative(root, outPath)}`);
}
