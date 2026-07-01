import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const resourcesDir = path.join(root, 'resources');
const textDir = path.join(root, 'artifacts', 'pdf-text');
const dataDir = path.join(root, 'backend', 'data');

const SCHEMA_VERSION = '1.2.0';
const EXTRACTOR_VERSION = 'generic-pdf-extractor@1.2.0';
const LIFECYCLE_MODULE_PATTERN = /\b(?:A1-A3|A[1-5]|B[1-7]|C[1-4]|D)\b/g;
const BOUNDARY_MODULES = [
  'A1',
  'A2',
  'A3',
  'A1-A3',
  'A4',
  'A5',
  'B1',
  'B2',
  'B3',
  'B4',
  'B5',
  'B6',
  'B7',
  'C1',
  'C2',
  'C3',
  'C4',
  'D',
];

await fs.rm(dataDir, { recursive: true, force: true });
await fs.mkdir(dataDir, { recursive: true });

const pdfFiles = (await fs.readdir(resourcesDir))
  .filter((file) => file.toLowerCase().endsWith('.pdf'))
  .sort((left, right) => left.localeCompare(right));

const written = [];

for (const pdfFile of pdfFiles) {
  const textFile = pdfFile.replace(/\.pdf$/i, '.txt');
  const pdfPath = path.join(resourcesDir, pdfFile);
  const textPath = path.join(textDir, textFile);
  const pdfBuffer = await fs.readFile(pdfPath);
  let text = '';
  let extractedTextSha256 = null;

  try {
    text = await fs.readFile(textPath, 'utf8');
    extractedTextSha256 = sha256(text);
  } catch {
    text = '';
  }

  const ctx = buildContext(pdfFile, textFile, text, {
    sourcePdfSha256: sha256(pdfBuffer),
    extractedTextSha256,
  });
  const doc = buildDocument(ctx);
  const outPath = path.join(dataDir, `${slug(path.basename(pdfFile, '.pdf'))}.json`);
  await fs.writeFile(outPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  written.push(path.relative(root, outPath));
}

console.log(`Wrote ${written.length} EPD data files`);
for (const file of written) console.log(file);

function buildDocument(ctx) {
  const extractionDiagnostics = [];

  if (ctx.text.trim().length === 0) {
    extractionDiagnostics.push(diagnostic('source.extractedText', 'No extractable text artifact was available for this PDF.'));
  }

  const productName = extractProductName(ctx);
  const manufacturer = extractManufacturer(ctx);
  const manufacturingLocation = extractManufacturingLocation(ctx);
  const declaredUnit = extractDeclaredUnit(ctx);
  const declaredUnitMassKg = extractDeclaredUnitMassKg(ctx);
  const strengthMpa = extractStrengthMpa(ctx, productName.value);
  const scope = extractScope(ctx);
  const standard = extractStandard(ctx);
  const epd = extractEpdMetadata(ctx, scope.value, standard.value);
  const carbonStages = extractCarbonStages(ctx, extractionDiagnostics);

  const id = productName.value ? slug(productName.value) : `${slug(path.basename(ctx.pdfFile, '.pdf'))}-product-1`;
  const confidence = compactRecord({
    productName: productName.confidence,
    manufacturer: manufacturer.confidence,
    manufacturingLocation: manufacturingLocation.confidence,
    declaredUnit: declaredUnit.confidence,
    declaredUnitMassKg: declaredUnitMassKg.confidence,
    strengthMpa: strengthMpa.confidence,
    scopeDescription: scope.confidence,
    scopeStandard: standard.confidence,
  });

  for (const [field, value] of Object.entries({
    productName: productName.value,
    manufacturer: manufacturer.value,
    manufacturingLocation: manufacturingLocation.value,
    declaredUnit: declaredUnit.value,
    declaredUnitMassKg: declaredUnitMassKg.value,
    strengthMpa: strengthMpa.value,
    'scope.description': scope.value,
    'scope.standard': standard.value,
  })) {
    if (value === null) extractionDiagnostics.push(diagnostic(`products[0].${field}`, 'No reliable value found in extractable text.'));
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    schemaShape: {
      products: 'One partial product record per source PDF. Unknown metadata is null.',
      carbonStages: 'Lifecycle module GWP-total entries. Missing and not-declared values are never encoded as zero.',
      provenance: 'Declared carbon values include PDF, page, table or section label, and source excerpt.',
      extraction: 'Extractor version and SHA-256 hashes of the source PDF and extracted text.',
    },
    source: {
      pdf: ctx.pdfFile,
      extractedText: ctx.textFile,
    },
    extraction: {
      extractor: 'scripts/generate-epd-data.mjs',
      extractorVersion: EXTRACTOR_VERSION,
      sourcePdfSha256: ctx.sourcePdfSha256,
      extractedTextSha256: ctx.extractedTextSha256,
    },
    epd,
    extractionDiagnostics,
    products: [
      {
        id,
        productName: productName.value,
        manufacturer: manufacturer.value,
        manufacturingLocation: manufacturingLocation.value,
        strengthMpa: strengthMpa.value,
        declaredUnit: declaredUnit.value,
        declaredUnitMassKg: declaredUnitMassKg.value,
        scope: {
          description: scope.value,
          standard: standard.value,
        },
        confidence,
        carbonStages,
      },
    ],
  };
}

function buildContext(pdfFile, textFile, text, hashes) {
  const rawLines = text.split(/\r?\n/);
  const lines = rawLines.map((line) => normalize(line).trim());
  const pageByLine = [];
  let page = 1;

  for (let i = 0; i < lines.length; i += 1) {
    pageByLine[i] = page;
    const marker = lines[i].match(/^--\s*(\d+)\s+of\s+\d+\s*--$/);
    if (marker) page = Number(marker[1]) + 1;
  }

  return { pdfFile, textFile, text, rawLines, lines, pageByLine, ...hashes };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function extractProductName(ctx) {
  const labelled = firstLabelValue(ctx, [
    /^Product name\s+(.+)$/i,
    /^Product identification\s+(.+)$/i,
    /^Product\s+Identification\s+(.+)$/i,
  ], {
    reject: (value) => isPageReference(value) || isGenericHeading(value) || isFrontMatterBoilerplate(value),
  });
  if (labelled.value) return labelled;

  const epdTitle = findLine(ctx, /\bEPD\s*[-:]\s*([A-Z0-9][A-Z0-9_. /-]{2,})$/i);
  if (epdTitle) {
    const match = epdTitle.text.match(/\bEPD\s*[-:]\s*([A-Z0-9][A-Z0-9_. /-]{2,})$/i);
    const value = cleanCandidate(match?.[1]);
    if (value && !isFrontMatterBoilerplate(value)) return evidenceValue(value, 0.6, epdTitle);
  }

  const detailLine = findLine(ctx, /A detailed breakdown of the functional properties/i);
  if (detailLine) {
    const previous = previousMeaningfulLine(ctx, detailLine.lineNumber - 2);
    if (previous && !isGenericHeading(previous.text)) return evidenceValue(cleanCandidate(previous.text), 0.6, previous);
  }

  const frontMatter = frontMatterProductCandidate(ctx);
  if (frontMatter) return evidenceValue(frontMatter.value, frontMatter.confidence, frontMatter.evidence);

  return nullValue();
}

function extractManufacturer(ctx) {
  const labelled = firstLabelValue(ctx, [
    /^Manufacturer\s+(.+)$/,
    /^Owner of the EPD\s+(.+)$/i,
    /^Owner\s+(.+)$/i,
    /^Declaration Owner\s+(.+)$/i,
    /^EPD Owner\s+(.+)$/i,
  ], {
    reject: (value) => isPageReference(value) || isGenericHeading(value) || /^of the\b/i.test(value) || !isCompanyLikeLine(value),
  });
  if (labelled.value) return labelled;

  const following = firstFollowingValue(ctx, [
    /^Declaration Owner:?$/i,
    /^EPD OWNER$/i,
    /^EPD Owner$/i,
    /^Information about the EPD Owner$/i,
  ], isCompanyLikeLine);
  if (following.value) return following;

  const frontCompany = firstFrontMatterCompany(ctx);
  if (frontCompany.value) return frontCompany;

  return nullValue();
}

function extractManufacturingLocation(ctx) {
  const labelled = firstLabelValue(ctx, [
    /^Place of production\s+(.+)$/i,
    /^Production site\(s\)\s+(.+)$/i,
    /^Production Site\(S\)\s+(.+)$/i,
    /^Production Sites\s+(.+)$/i,
  ], {
    continuation: true,
    reject: (value) => isPageReference(value) || isGenericHeading(value),
  });
  if (labelled.value) return labelled;

  const following = firstFollowingValue(ctx, [/^Production Sites$/i, /^Production site\(s\)$/i], (line) => {
    return !isGenericHeading(line) && !/^Content Declaration$/i.test(line) && !/^Material\b/i.test(line);
  }, { maxLines: 8, joinUntil: /^(Content Declaration|Material\b)/i });
  if (following.value) return following;

  const manufacturedAt = findLine(ctx, /manufactured (?:at|in|by .* in)\s+(.+?)(?:\.|$)/i);
  if (manufacturedAt) {
    const match = manufacturedAt.text.match(/manufactured (?:at|in|by .* in)\s+(.+?)(?:\.|$)/i);
    const value = cleanCandidate(match?.[1]);
    if (value && !/^(?:one site|multiple sites?|five batching plants)$/i.test(value)) {
      return evidenceValue(value, 0.45, manufacturedAt);
    }
  }

  const geographical = firstLabelValue(ctx, [/^Geographical scope\s+(.+)$/i], {
    reject: (value) => isPageReference(value) || /^Australia$/i.test(value),
  });
  if (geographical.value) return evidenceValue(geographical.value, 0.35, geographical.evidence);

  return nullValue();
}

function extractDeclaredUnit(ctx) {
  const labelled = firstLabelValue(ctx, [
    /^Declared Unit is\s+(.+)$/i,
    /^Declared unit\s+(.+)$/i,
    /^Declared Unit\s+(.+)$/i,
  ], {
    continuation: true,
    reject: (value) => isPageReference(value) || /^\d+$/.test(value) || /^(?:and|of)\b/i.test(value) || !/(?:m3|cubic|metre|meter|tonne|kg)/i.test(value),
  });
  if (labelled.value) return labelled;

  const following = firstFollowingValue(ctx, [/^Declared unit$/i, /^Declared Unit$/i], (line) => {
    return /(?:m3|cubic|metre|meter|tonne|kg)/i.test(line);
  }, { maxLines: 3, joinUntil: /^(Mass per declared unit|BIOGENIC|Scope)/i });
  if (following.value) return following;

  const sentence = findLine(ctx, /declared unit (?:adopted )?is\s+(.+?)(?:\.|$)/i);
  if (sentence) {
    const match = sentence.text.match(/declared unit (?:adopted )?is\s+(.+?)(?:\.|$)/i);
    const value = cleanCandidate(match?.[1]);
    if (value && /(?:m3|cubic|metre|meter|tonne|kg)/i.test(value)) {
      return evidenceValue(value, 0.55, sentence);
    }
  }

  const oneDeclaredUnit = findLine(ctx, /one declared unit:\s+(.+?)(?:\s+which|\.|$)/i);
  if (oneDeclaredUnit) {
    const match = oneDeclaredUnit.text.match(/one declared unit:\s+(.+?)(?:\s+which|\.|$)/i);
    const value = cleanCandidate(match?.[1]);
    if (value) return evidenceValue(value, 0.5, oneDeclaredUnit);
  }

  return nullValue();
}

function extractDeclaredUnitMassKg(ctx) {
  const mass = firstNumberFromPatterns(ctx, [
    /^Declared unit mass,?\s*kg\s+(.+)$/i,
    /^Mass per declared unit\s+(.+)$/i,
    /^Density\s+(.+?)\s*kg\/m(?:3|\u00b3)/i,
    /gross weight of this declared material is\s+(.+?)\s+kg per cubic met(?:er|re)/i,
    /conversion factor to mass is equal to the density of the concrete:\s+(.+?)\s*kg\/m(?:3|\u00b3)/i,
  ]);
  return mass.value === null ? nullValue() : mass;
}

function extractStrengthMpa(ctx, productName) {
  const fromProduct = parseStrength(productName);
  if (fromProduct !== null) return { value: fromProduct, confidence: 0.8, evidence: null };

  const labelled = firstNumberFromPatterns(ctx, [
    /^Compressive strength\s+(.+)$/i,
    /^Compressive Strength\s+(.+)$/i,
    /^Strength grade\s+(.+)$/i,
    /characteristic strength of\s+(.+?)\s*MPa/i,
    /^Compressive strength class:\s*([A-Z]?\d{2,3})$/i,
  ], {
    parser: parseStrength,
  });
  if (labelled.value !== null) return labelled;

  const header = findLine(ctx, /Strength\s*\(MPa\)\s+Mix Code/i);
  if (header) {
    const next = nextMeaningfulLine(ctx, header.lineNumber);
    const strength = parseNumber(next?.text.match(/^(\d{2,3}(?:\.\d+)?)/)?.[1]);
    if (strength !== null) return evidenceValue(strength, 0.55, next);
  }

  return nullValue();
}

function extractScope(ctx) {
  const labelled = firstLabelValue(ctx, [
    /^Scope of the EPD\s+(.+)$/i,
    /^Scope\s+(.+)$/i,
  ], {
    continuation: true,
    reject: (value) => isPageReference(value) || !looksLikeLifecycleScope(value) || /^of the\b/i.test(value),
  });
  if (labelled.value) return labelled;

  const following = firstFollowingValue(ctx, [/^Scope$/i, /^Scope of the Environmental Product Declaration$/i], (line) => {
    return /cradle|module|A1|gate|grave|life cycle/i.test(line);
  }, { maxLines: 4 });
  if (following.value) return following;

  const sentence = findLine(ctx, /scope of (?:this EPD|the LCA and EPD) is\s+(.+?)(?:\.|$)/i);
  if (sentence) {
    const match = sentence.text.match(/scope of (?:this EPD|the LCA and EPD) is\s+(.+?)(?:\.|$)/i);
    return evidenceValue(cleanCandidate(match?.[1]), 0.5, sentence);
  }

  return nullValue();
}

function extractStandard(ctx) {
  const labelled = firstLabelValue(ctx, [
    /^Reference standard\s+(.+)$/i,
    /^CEN standard\s+(.+)$/i,
    /^Product Category Rules \(PCR\)\s+(.+)$/i,
  ], {
    continuation: true,
    reject: (value) => isPageReference(value),
  });
  if (labelled.value) return labelled;

  const line = findLine(ctx, /\b(?:EN\s*15804|ISO\s*14025|PCR\s*2019:14)\b/i);
  if (line) {
    const matches = line.text.match(/\b(?:EN\s*15804[^\s,;)]*|ISO\s*14025(?::\d{4})?|PCR\s*2019:14[^,;)]*)/gi);
    if (matches?.length) return evidenceValue(cleanCandidate(matches.join(', ')), 0.45, line);
  }

  return nullValue();
}

function extractEpdMetadata(ctx, scope, standard) {
  const registration = firstLabelValue(ctx, [
    /^EPD Registration(?: Number| no\.?| No\.?)?:?\s+(.+)$/i,
    /^EPD registration number:?\s+(.+)$/i,
  ], {
    reject: (value) => isPageReference(value),
  });

  const programOperator = firstLabelValue(ctx, [
    /^Programme operator:?\s+(.+)$/i,
    /^Program operator\s+(.+)$/i,
    /^Programme Operator\s+(.+)$/i,
  ], {
    reject: (value) => isPageReference(value),
  });

  const publishedDate = firstDateValue(ctx, [
    /^Publication date:?\s+(.+)$/i,
    /^Published:?\s+(.+?)(?:\s+Valid until:.*)?$/i,
    /^Date of Publication(?: \(ISSUE\))?:?\s+(.+)$/i,
    /^Published on\s+(.+?)(?:,|$)/i,
    /^Valid from:?\s+(.+?)\s*\|/i,
  ]);

  const validUntil = firstDateValue(ctx, [
    /^Valid until:?\s+(.+)$/i,
    /^Valid Until\s+(.+)$/i,
    /^Valid To\s+(.+)$/i,
    /^DATE OF VALIDITY\s+(.+)$/i,
    /^Valid from:?.*?\|\s*(.+)$/i,
    /^Published:?.*?Valid until:\s+(.+)$/i,
  ]);

  return {
    id: registration.value ? slug(registration.value) : null,
    registrationNumber: registration.value,
    pdfFile: ctx.pdfFile,
    programOperator: programOperator.value,
    standard,
    scope,
    publishedDate: publishedDate.value,
    validUntil: validUntil.value,
  };
}

function extractCarbonStages(ctx, diagnostics) {
  const stages = new Map();

  for (let i = 0; i < ctx.lines.length; i += 1) {
    const line = lineAt(ctx, i);
    if (!line || !isGwpTotalRow(line.text)) continue;

    const tokens = valueTokens(line.text);
    if (tokens.length < 2) continue;

    const modules = findNearbyModuleHeader(ctx, i, tokens.length);

    if (!modules) {
      diagnostics.push(diagnostic('products[0].carbonStages', `Skipped GWP-total row without a matching module header near line ${line.lineNumber}.`));
      continue;
    }

    for (let index = 0; index < modules.length; index += 1) {
      const module = modules[index];
      if (stages.has(module)) continue;

      const token = tokens[index];
      const tableLabel = nearestTableLabel(ctx, i);

      if (token.toUpperCase() === 'ND') {
        stages.set(module, stage({
          pdf: ctx.pdfFile,
          module,
          value: null,
          status: 'not_declared',
          page: line.page,
          tableLabel,
          quote: line.text,
          confidence: 0.86,
        }));
        continue;
      }

      const value = parseNumber(token);
      if (value === null) continue;

      stages.set(module, stage({
        pdf: ctx.pdfFile,
        module,
        value,
        status: 'declared',
        page: line.page,
        tableLabel,
        quote: line.text,
        confidence: 0.9,
      }));
    }
  }

  addA1A3SummaryStage(ctx, stages);
  addExplicitNotDeclaredStages(ctx, stages);

  if (stages.size === 0) {
    diagnostics.push(diagnostic('products[0].carbonStages', 'No reliable GWP-total table or A1-A3 summary row was found in extractable text.'));
  }

  return [...stages.values()].sort((left, right) => moduleSortKey(left.module) - moduleSortKey(right.module));
}

function addA1A3SummaryStage(ctx, stages) {
  if (stages.has('A1-A3')) return;

  const line = findLine(ctx, /^GWP[-\s]*total,?\s*A1-A3\s*\([^)]*\)\s+(.+)$/i);
  if (!line) return;

  const tokens = valueTokens(line.text);
  const value = parseNumber(tokens.at(-1));
  if (value === null) return;

  stages.set('A1-A3', stage({
    pdf: ctx.pdfFile,
    module: 'A1-A3',
    value,
    status: 'declared',
    page: line.page,
    tableLabel: 'Environmental data summary',
    quote: line.text,
    confidence: 0.72,
  }));
}

function addExplicitNotDeclaredStages(ctx, stages) {
  for (let i = 0; i < ctx.lines.length; i += 1) {
    if (!/Modules declared|Modules Declared/i.test(ctx.lines[i])) continue;

    const modules = findBoundaryModulesNear(ctx, i);
    const statuses = boundaryStatusTokens(ctx, i);

    if (modules.length === 0 || statuses.length < modules.length) continue;

    const evidence = lineAt(ctx, i);
    for (let index = 0; index < modules.length; index += 1) {
      if (statuses[index] !== 'ND' || stages.has(modules[index])) continue;
      stages.set(modules[index], stage({
        pdf: ctx.pdfFile,
        module: modules[index],
        value: null,
        status: 'not_declared',
        page: evidence?.page ?? null,
        tableLabel: 'Modules declared / system boundary',
        quote: boundaryEvidenceQuote(ctx, i),
        confidence: 0.84,
      }));
    }
  }
}

function isGwpTotalRow(text) {
  const canonical = text
    .replace(/\s+/g, ' ')
    .replace(/GWP\s*[- ]\s*/i, 'GWP-')
    .trim();

  if (!/\bkg\s+CO2/i.test(canonical) && !/\bkg\s*CO2e/i.test(canonical)) return false;
  if (/GWP[-\s]*(?:fossil|bio|biogenic|luluc|luc|ghg|pack|prod)\b/i.test(canonical)) return false;

  return /^GWP[-\s]*(?:total|tot)\d*\)?\b/i.test(canonical) || /^GWPt\b/i.test(canonical);
}

function findNearbyModuleHeader(ctx, lineIndex, expectedLength) {
  for (let i = lineIndex - 1; i >= Math.max(0, lineIndex - 8); i -= 1) {
    const modules = moduleTokens(ctx.lines[i]);
    if (modules.length === expectedLength) return modules;
  }

  const currentModules = moduleTokens(ctx.lines[lineIndex]);
  if (currentModules.length === expectedLength) return currentModules;

  return null;
}

function findBoundaryModulesNear(ctx, lineIndex) {
  for (let i = lineIndex; i >= Math.max(0, lineIndex - 4); i -= 1) {
    const modules = moduleTokens(ctx.lines[i]);
    if (modules.length >= 5) return modules.slice(0, BOUNDARY_MODULES.length);
  }

  return [];
}

function moduleTokens(text) {
  return [...normalize(text).replace(/\bA1-3\b/g, 'A1-A3').matchAll(LIFECYCLE_MODULE_PATTERN)].map((match) => match[0]);
}

function boundaryStatusTokens(ctx, lineIndex) {
  const joined = ctx.lines.slice(lineIndex, Math.min(ctx.lines.length, lineIndex + 8)).join(' ');
  return joined
    .replace(/\bN\s+D\b/g, 'ND')
    .match(/\b(?:X|x|ND)\b/g)?.map((token) => token.toUpperCase()) ?? [];
}

function boundaryEvidenceQuote(ctx, lineIndex) {
  return ctx.lines
    .slice(Math.max(0, lineIndex - 1), Math.min(ctx.lines.length, lineIndex + 3))
    .filter(Boolean)
    .join(' ')
    .slice(0, 500);
}

function stage({ pdf, module, value, status, page, tableLabel, quote, confidence }) {
  return {
    module,
    indicator: 'GWP-total',
    unit: 'kg CO2 eq.',
    value,
    status,
    provenance: {
      pdf,
      sourcePage: page,
      tableLabel,
      quote,
    },
    confidence,
  };
}

function nearestTableLabel(ctx, lineIndex) {
  for (let i = lineIndex - 1; i >= Math.max(0, lineIndex - 10); i -= 1) {
    const text = ctx.lines[i];
    if (/^(?:Table|Core|Primary|Environmental impact|Impact category|Abbreviation|CORE ENVIRONMENTAL|PRIMARY ENVIRONMENTAL)/i.test(text)) {
      return text;
    }
  }

  return 'GWP-total row';
}

function firstLabelValue(ctx, patterns, options = {}) {
  for (const pattern of patterns) {
    for (let i = 0; i < ctx.lines.length; i += 1) {
      const text = ctx.lines[i];
      if (!pattern.test(text)) continue;

      const line = lineAt(ctx, i);
      const match = text.match(pattern);
      let value = cleanCandidate(match?.[1]);

      if (options.continuation) {
        value = appendContinuation(ctx, i, value);
      }

      if (value && !options.reject?.(value)) {
        return evidenceValue(value, 0.75, line);
      }
    }
  }

  return nullValue();
}

function firstFollowingValue(ctx, headingPatterns, predicate, options = {}) {
  const maxLines = options.maxLines ?? 5;
  for (const pattern of headingPatterns) {
    const heading = findLine(ctx, pattern);
    if (!heading) continue;

    const parts = [];
    for (let i = heading.lineNumber; i < Math.min(ctx.lines.length, heading.lineNumber + maxLines); i += 1) {
      const text = ctx.lines[i];
      if (!text || /^--\s*\d+\s+of\s+\d+\s*--$/.test(text)) continue;
      if (options.joinUntil?.test(text)) break;
      if (!predicate(text)) {
        if (parts.length > 0) break;
        continue;
      }
      parts.push(text);
      if (!options.joinUntil && parts.length > 0) break;
    }

    const value = cleanCandidate(parts.join(' '));
    if (value) return evidenceValue(value, 0.65, heading);
  }

  return nullValue();
}

function firstNumberFromPatterns(ctx, patterns, options = {}) {
  for (const pattern of patterns) {
    const line = findLine(ctx, pattern);
    if (!line) continue;
    const match = line.text.match(pattern);
    const candidate = match?.[1] ?? line.text;
    const value = options.parser ? options.parser(candidate) : firstNumber(candidate);
    if (value !== null) return evidenceValue(value, 0.78, line);
  }

  return nullValue();
}

function firstDateValue(ctx, patterns) {
  for (const pattern of patterns) {
    const line = findLine(ctx, pattern);
    if (!line) continue;
    const match = line.text.match(pattern);
    const value = cleanDate(match?.[1]);
    if (value) return evidenceValue(value, 0.72, line);
  }

  return nullValue();
}

function frontMatterProductCandidate(ctx) {
  const firstMarker = ctx.lines.findIndex((line) => /^--\s*\d+\s+of\s+\d+\s*--$/.test(line));
  const limit = firstMarker === -1 ? Math.min(40, ctx.lines.length) : firstMarker;
  const candidates = [];

  for (let i = 0; i < limit; i += 1) {
    const text = cleanCandidate(ctx.lines[i]);
    if (!text || isGenericHeading(text) || isFrontMatterBoilerplate(text)) continue;
    candidates.push({ value: text, evidence: lineAt(ctx, i) });
  }

  const productLike = candidates.findLast((candidate) => {
    return /\b(?:concrete|mix|MPa|product|[A-Z]{1,4}\d{2,}[A-Z0-9-]*)\b/i.test(candidate.value);
  });
  if (productLike) return { ...productLike, confidence: 0.42 };

  const codeLike = candidates.findLast((candidate) => /\b[A-Z]{1,4}\d{2,}[A-Z0-9-]*\b/.test(candidate.value));
  return codeLike ? { ...codeLike, confidence: 0.4 } : null;
}

function firstFrontMatterCompany(ctx) {
  const firstMarker = ctx.lines.findIndex((line) => /^--\s*\d+\s+of\s+\d+\s*--$/.test(line));
  const limit = firstMarker === -1 ? Math.min(60, ctx.lines.length) : firstMarker;

  for (let i = 0; i < limit; i += 1) {
    const text = cleanCandidate(ctx.lines[i]);
    if (isCompanyLikeLine(text) && !/program|operator|regional/i.test(text)) {
      return evidenceValue(text, 0.5, lineAt(ctx, i));
    }
  }

  return nullValue();
}

function appendContinuation(ctx, lineIndex, value) {
  let result = value;
  for (let i = lineIndex + 1; i < Math.min(ctx.lines.length, lineIndex + 3); i += 1) {
    const next = ctx.lines[i];
    if (!next || /^--\s*\d+\s+of\s+\d+\s*--$/.test(next)) break;
    if (/^(?:Mass per declared unit|Declared unit mass|BIOGENIC|Scope|Reference|PCR|Product reference|Concrete type|GTIN|NOBB|Website|Contact|Address|Period for data)$/i.test(next)) break;
    if (!shouldContinueValue(result, next)) break;
    result = `${result} ${next}`;
  }

  return cleanCandidate(result);
}

function shouldContinueValue(current, next) {
  if (!current) return true;
  if (current.endsWith(',') || current.endsWith('-')) return true;
  if (/\b(?:and|with|the|of|to|at|in|modules?)$/i.test(current)) return true;
  if (/^[a-z(]/.test(next)) return true;
  return false;
}

function findLine(ctx, pattern) {
  for (let i = 0; i < ctx.lines.length; i += 1) {
    const text = ctx.lines[i];
    if (pattern.test(text)) return lineAt(ctx, i);
  }

  return null;
}

function lineAt(ctx, index) {
  if (index < 0 || index >= ctx.lines.length) return null;
  return {
    text: ctx.lines[index],
    lineNumber: index + 1,
    page: ctx.pageByLine[index] ?? null,
  };
}

function previousMeaningfulLine(ctx, startIndex) {
  for (let i = startIndex; i >= 0; i -= 1) {
    const line = lineAt(ctx, i);
    if (line?.text && !/^--\s*\d+\s+of\s+\d+\s*--$/.test(line.text)) return line;
  }

  return null;
}

function nextMeaningfulLine(ctx, startIndex) {
  for (let i = startIndex; i < ctx.lines.length; i += 1) {
    const line = lineAt(ctx, i);
    if (line?.text && !/^--\s*\d+\s+of\s+\d+\s*--$/.test(line.text)) return line;
  }

  return null;
}

function valueTokens(text) {
  return normalize(text)
    .replace(/CO\s*2\s*eq\.?/gi, 'CO2eq')
    .replace(/CO2\s*eq\.?/gi, 'CO2eq')
    .replace(/CO2e/gi, 'CO2e')
    .replace(/\bN\s+D\b/g, 'ND')
    .split(/\s+/)
    .map((token) => token.replace(/[;:()[\],]+$/g, '').replace(/^[;:()[\],]+/g, ''))
    .filter((token) => token.toUpperCase() === 'ND' || /^[-+]?\d+(?:[.,]\d+)?(?:E[-+]?\d+)?$/i.test(token));
}

function firstNumber(value) {
  const token = normalize(String(value ?? '')).match(/[-+]?\d[\d\s,.]*(?:E[-+]?\d+)?/i)?.[0];
  return parseNumber(token);
}

function parseStrength(value) {
  if (!value) return null;
  const text = normalize(String(value));
  const mpa = text.match(/\b(\d{2,3}(?:[.,]\d+)?)\s*MPa\b/i);
  if (mpa) return parseNumber(mpa[1]);
  const nClass = text.match(/\b[NS](\d{2,3})\b/i);
  if (nClass) return parseNumber(nClass[1]);
  const bare = text.match(/^\s*(\d{2,3}(?:[.,]\d+)?)\s*$/);
  if (bare) return parseNumber(bare[1]);
  return null;
}

function parseNumber(token) {
  if (token == null || token === '') return null;
  const compact = normalize(String(token))
    .replace(/\s+(?=\d)/g, '')
    .replace(/(?<=\d)\s+/g, '')
    .trim();
  const decimalNormalized = /^\d{1,3}(,\d{3})+(?:\.\d+)?$/.test(compact)
    ? compact.replace(/,/g, '')
    : compact.replace(/,/g, '.');
  const normalized = decimalNormalized.replace(/[^\d.+\-Ee]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanDate(value) {
  const text = cleanCandidate(value);
  if (!text) return null;
  const date = text.match(/\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{1,2}\.\d{1,2}\.\d{4}/)?.[0];
  return date ?? null;
}

function cleanCandidate(value) {
  const cleaned = normalize(value ?? '')
    .replace(/^\s*[-:|]+\s*/, '')
    .replace(/\s*[-:|]+\s*$/, '')
    .trim();
  return cleaned.length > 0 && cleaned !== '-' ? cleaned : null;
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/CO[\u00c2\u00e2\u201a\u0082]+/g, 'CO2')
    .replace(/\u00e2\u201a\u201a/g, '2')
    .replace(/\u00c2\u00ae/g, '')
    .replace(/\u00ae/g, '')
    .replace(/\u00c2/g, '')
    .replace(/\u00e2\u20ac[\u201c\u201d\u2018\u2019\u2010-\u2015\u0452\u02c6]/g, '-')
    .replace(/\u00e2\u02c6\u2019/g, '-')
    .replace(/[\u2010-\u2015\u2212\u2011]/g, '-')
    .replace(/\u00e2\u20ac[\u2122\u02dc]/g, "'")
    .replace(/\u00e2\u20ac[\u0153\ufffd]/g, '"')
    .replace(/\u00a0/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ');
}

function isPageReference(value) {
  return /^\d+$/.test(value.trim()) || /\.{5,}/.test(value) || /\bpage\s+\d+$/i.test(value);
}

function isGenericHeading(value) {
  return /^(?:environmental product declaration|product identification|product information|declared unit|scope|manufacturer and site|and site|and supplier|lca information|contents|table of contents|references|introduction|general information|about|life cycle|product environmental performance)$/i.test(value.trim());
}

function isFrontMatterBoilerplate(value) {
  return /^(?:in accordance|programme|program|regional|valid|publication|date|version|geographical|an EPD|this EPD|may be|to find|subject to|requirements of|licensee|www\.|environmental product declaration)/i.test(value)
    || /^EPD of\b/i.test(value)
    || /\bwww\.|\.com\b|\.com\.au\b/i.test(value);
}

function isCompanyLikeLine(value) {
  return /\b(?:Pty\.?\s*Ltd|Ltd|Limited|Concrete|Materials|Cement|Group|Corporation|Company|Holdings|Australia)\b/i.test(value)
    && !/environmental product declaration|programme|program|regional|valid|publication|date|scope|requirements|primary data|secondary/i.test(value);
}

function looksLikeLifecycleScope(value) {
  return /cradle|module|A1|gate|grave|life cycle|lifecycle|C1|C4|D\b/i.test(value);
}

function nullValue() {
  return { value: null, confidence: undefined, evidence: null };
}

function evidenceValue(value, confidence, evidence) {
  return { value: value ?? null, confidence, evidence };
}

function diagnostic(pathName, message) {
  return { path: pathName, message };
}

function compactRecord(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null));
}

function moduleSortKey(module) {
  const index = BOUNDARY_MODULES.indexOf(module);
  return index === -1 ? BOUNDARY_MODULES.length + module.charCodeAt(0) : index;
}

function slug(value) {
  const result = normalize(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return result || 'unknown';
}
