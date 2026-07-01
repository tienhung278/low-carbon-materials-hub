import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const dataDir = path.join(root, 'backend', 'data');
const legacyRootDataDir = path.join(root, 'data');
const resourcesDir = path.join(root, 'resources');
const textDir = path.join(root, 'artifacts', 'pdf-text');

const schemaVersion = '1.2.0';
const extractorVersion = 'generic-pdf-extractor@1.2.0';
const sha256Pattern = /^[a-f0-9]{64}$/;
const allowedStatuses = new Set(['declared', 'not_declared', 'missing']);
const nullableStringProductFields = [
  'productName',
  'manufacturer',
  'manufacturingLocation',
  'declaredUnit',
];

const errors = [];
const resourcePdfs = new Set((await fs.readdir(resourcesDir)).filter((file) => file.toLowerCase().endsWith('.pdf')));
const dataFiles = await readJsonFiles(dataDir);

if (await exists(legacyRootDataDir)) {
  errors.push('Legacy root data/ directory must be removed; generated EPD JSON belongs in backend/data/.');
}

if (dataFiles.length !== resourcePdfs.size) {
  errors.push(`Expected ${resourcePdfs.size} JSON files, found ${dataFiles.length}`);
}

const seenPdfs = new Set();

for (const file of dataFiles) {
  const fullPath = path.join(dataDir, file);
  let doc;
  try {
    doc = JSON.parse(await fs.readFile(fullPath, 'utf8'));
  } catch (error) {
    errors.push(`${file}: invalid JSON (${error.message})`);
    continue;
  }

  if (doc.schemaVersion !== schemaVersion) errors.push(`${file}: schemaVersion must be ${schemaVersion}`);
  if (!doc.source?.pdf || !resourcePdfs.has(doc.source.pdf)) errors.push(`${file}: source.pdf does not match a PDF in resources`);
  if (doc.source?.pdf) seenPdfs.add(doc.source.pdf);
  if (!doc.source?.extractedText) {
    errors.push(`${file}: source.extractedText is required`);
  } else if (!(await exists(path.join(textDir, doc.source.extractedText)))) {
    errors.push(`${file}: source.extractedText does not match a text artifact`);
  }
  await validateExtractionTracking(file, doc);
  if (!Array.isArray(doc.extractionDiagnostics)) errors.push(`${file}: extractionDiagnostics must be an array`);
  if (!Array.isArray(doc.products) || doc.products.length !== 1) errors.push(`${file}: products must contain exactly one partial product`);

  for (const [productIndex, product] of (doc.products ?? []).entries()) {
    if (!isNonEmptyString(product.id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.id)) {
      errors.push(`${file}: products[${productIndex}].id must be a non-empty slug`);
    }
    for (const field of nullableStringProductFields) {
      if (!(field in product)) errors.push(`${file}: products[${productIndex}] missing ${field}`);
      if (!isStringOrNull(product[field])) errors.push(`${file}: products[${productIndex}].${field} must be string or null`);
    }
    if (product.manufacturer !== null && looksLikeTocNoise(product.manufacturer)) errors.push(`${file}: products[${productIndex}].manufacturer looks like table-of-contents noise: ${product.manufacturer}`);
    if (product.strengthMpa !== null && !Number.isFinite(product.strengthMpa)) errors.push(`${file}: products[${productIndex}].strengthMpa must be finite number or null`);
    if (!('strengthMpa' in product)) errors.push(`${file}: products[${productIndex}] missing strengthMpa`);
    if (!('declaredUnitMassKg' in product)) errors.push(`${file}: products[${productIndex}] missing declaredUnitMassKg`);
    if (product.declaredUnitMassKg !== null && !Number.isFinite(product.declaredUnitMassKg)) errors.push(`${file}: products[${productIndex}].declaredUnitMassKg must be finite number or null`);
    if (!product.scope || typeof product.scope !== 'object' || Array.isArray(product.scope)) {
      errors.push(`${file}: products[${productIndex}].scope must be an object`);
    } else {
      if (!isStringOrNull(product.scope.description)) errors.push(`${file}: products[${productIndex}].scope.description must be string or null`);
      if (!isStringOrNull(product.scope.standard)) errors.push(`${file}: products[${productIndex}].scope.standard must be string or null`);
    }
    if (!Array.isArray(product.carbonStages)) errors.push(`${file}: products[${productIndex}].carbonStages must be an array`);

    for (const [stageIndex, stage] of (product.carbonStages ?? []).entries()) {
      const prefix = `${file}: products[${productIndex}].carbonStages[${stageIndex}]`;
      if (!stage.module) errors.push(`${prefix}: missing module`);
      if (!stage.indicator) errors.push(`${prefix}: missing indicator`);
      if (!stage.unit) errors.push(`${prefix}: missing unit`);
      if (!allowedStatuses.has(stage.status)) errors.push(`${prefix}: invalid status ${stage.status}`);
      if (stage.status === 'declared' && !Number.isFinite(stage.value)) errors.push(`${prefix}: declared stage must have finite numeric value`);
      if (stage.status !== 'declared' && stage.value !== null) errors.push(`${prefix}: ${stage.status} stage must have null value`);
      if (stage.status === 'declared') {
        if (!stage.provenance?.pdf) errors.push(`${prefix}: declared stage missing provenance.pdf`);
        if (!stage.provenance?.tableLabel) errors.push(`${prefix}: declared stage missing provenance.tableLabel`);
        if (!stage.provenance?.quote) errors.push(`${prefix}: declared stage missing provenance.quote`);
      }
      if (stage.status === 'not_declared') {
        if (!stage.provenance?.quote || !/(?:\bND\b|not declared|system boundary|modules declared)/i.test(stage.provenance.quote)) {
          errors.push(`${prefix}: not_declared stage requires explicit ND or system-boundary evidence`);
        }
      }
      if (stage.provenance?.pdf && stage.provenance.pdf !== doc.source?.pdf) errors.push(`${prefix}: provenance.pdf must match source.pdf`);
    }
  }
}

for (const pdf of resourcePdfs) {
  if (!seenPdfs.has(pdf)) errors.push(`No JSON file references ${pdf}`);
}

if (errors.length > 0) {
  console.error(`EPD data validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Validated ${dataFiles.length} EPD JSON files against ${resourcePdfs.size} source PDFs.`);

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFiles(directory) {
  try {
    return (await fs.readdir(directory))
      .filter((file) => file.toLowerCase().endsWith('.json'))
      .sort();
  } catch (error) {
    errors.push(`backend/data is missing or unreadable: ${error.message}`);
    return [];
  }
}

function looksLikeTocNoise(value) {
  return typeof value !== 'string'
    || value.trim().length === 0
    || /\.{5,}/.test(value)
    || /^and site\b/i.test(value)
    || /\b\.+\s*\d+$/.test(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringOrNull(value) {
  return value === null || typeof value === 'string';
}

async function validateExtractionTracking(file, doc) {
  if (!isRecord(doc.extraction)) {
    errors.push(`${file}: extraction must be an object`);
    return;
  }

  if (doc.extraction.extractor !== 'scripts/generate-epd-data.mjs') {
    errors.push(`${file}: extraction.extractor must be scripts/generate-epd-data.mjs`);
  }

  if (doc.extraction.extractorVersion !== extractorVersion) {
    errors.push(`${file}: extraction.extractorVersion must be ${extractorVersion}`);
  }

  const pdfHash = doc.extraction.sourcePdfSha256;
  if (!sha256Pattern.test(pdfHash)) {
    errors.push(`${file}: extraction.sourcePdfSha256 must be a SHA-256 hex digest`);
  } else if (doc.source?.pdf && resourcePdfs.has(doc.source.pdf)) {
    const expected = sha256(await fs.readFile(path.join(resourcesDir, doc.source.pdf)));
    if (pdfHash !== expected) errors.push(`${file}: extraction.sourcePdfSha256 does not match current source PDF`);
  }

  const textHash = doc.extraction.extractedTextSha256;
  if (!sha256Pattern.test(textHash)) {
    errors.push(`${file}: extraction.extractedTextSha256 must be a SHA-256 hex digest`);
  } else if (doc.source?.extractedText && await exists(path.join(textDir, doc.source.extractedText))) {
    const expected = sha256(await fs.readFile(path.join(textDir, doc.source.extractedText), 'utf8'));
    if (textHash !== expected) errors.push(`${file}: extraction.extractedTextSha256 does not match current extracted text`);
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
