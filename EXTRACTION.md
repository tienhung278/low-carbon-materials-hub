# Extraction Notes

## Overall Strategy

I treated the EPD PDFs as evidence, not as a uniform data feed. The goal was not to extract the most numbers possible; it was to extract numbers I could defend. The pipeline processes every `resources/*.pdf`, extracts page-marked text, and generates one JSON file per PDF in `backend/data`. Unknown metadata is kept as `null`, and missing lifecycle data stays missing rather than being inferred.

For carbon values, I focused on `GWP-total` lifecycle modules because those are the values a builder would compare. A value is emitted only when the parser can connect a GWP row to nearby module headers such as `A1-A3`, `A4`, `C1`, or `D`. If that alignment is unclear, the product gets an empty `carbonStages` array instead of a guessed footprint.

## Model And Architecture

I used a deterministic local extractor rather than an LLM or manual per-file configuration. These PDFs vary, but many still expose useful text labels, headings, and tables. A deterministic parser makes the output repeatable, reviewable in code, and cheap to rerun whenever PDFs change.

The architecture is three steps: extract PDF text into `artifacts/pdf-text`, generate JSON into `backend/data`, then validate the generated data. The generator contains reusable heuristics for label/value fields, MPa parsing, declared units, EPD metadata, page-aware provenance, and conservative GWP table parsing. Each JSON includes `extractionDiagnostics` plus source PDF and extracted-text SHA-256 hashes, so stale outputs can be detected.

## Accuracy

Every declared carbon number must include provenance: source PDF, page, table or section label, and the source excerpt. The validator enforces numeric declared values, valid lifecycle statuses, source PDF references, and explicit `ND` or system-boundary evidence before accepting `not_declared` stages. It also verifies there is exactly one JSON per PDF and that each JSON still matches the current PDF/text hashes.

The main risk is table layout. Plain text extraction can flatten wide tables, merge columns, or miss raster-only content. I handled that by preferring false negatives over false confidence: uncertain fields become `null`, ambiguous carbon tables are skipped, and diagnostics explain what was not found. That means the dataset is incomplete in places, but it avoids inventing procurement-relevant numbers.

## Research And Process

I compared the PDFs by structure rather than by supplier name. Some used One Click LCA-style tables, some had GCCA-style declarations, and some had wide product matrices that were not safely recoverable from text alone. That led me away from product-specific hardcoding and toward generic evidence rules.

The key question I kept asking was: "Could I point to the exact PDF text that justifies this field?" If not, the generator leaves the field blank. The next improvement would be a table-structure or OCR layer, but I would still keep the same validation rule: no carbon figure without traceable source evidence.
