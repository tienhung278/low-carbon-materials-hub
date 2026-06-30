# Full Stack Lead: Take-Home Assessment

**Low Carbon Materials Hub**

This assessment has two parts. Do them in order - Part 2 depends on Part 1.

We care more about how you think and the decisions you make than about completeness or polish. Read the instructions carefully. If something is unclear, ask.

---

## Context

We help the construction industry choose lower-carbon materials. Suppliers publish each product's carbon footprint in **EPDs (Environmental Product Declarations)**: standardised PDFs that vary in format, layout, and what they actually report. You'll build a thin slice of a platform that makes those numbers comparable.

---

## Part 1: Document Extraction

### What to do

You have **20 concrete EPD PDFs**. Your job is to extract the relevant data from each one and produce:

1. **`EXTRACTION.md`** - your written reasoning (detail below).
2. **`/data/*.json`** - one JSON file per EPD, containing the structured data you extracted.

You define the JSON schema. It should capture everything the app in Part 2 will need.

### What to cover in EXTRACTION.md

This is the most important document you will submit. We want to understand how you think, not read a survey of what tools exist. Write about your own choices and the reasoning behind them. Cover:

- **Overall strategy** - how did you approach extracting structured data from these documents?
- **Model and architecture** - what did you use, and why that over the alternatives?
- **Accuracy** - how do you know the extracted data is correct? What could go wrong and how did you handle it?
- **Research and process** - what did you try, what did you question, what did you find? We want to see the thinking, not just the conclusion.

Keep it focused. A sharp 400-word document with clear reasoning is better than 1,500 words covering every option.

---

## Part 2: The App

Build a small **Next.js + Node.js + TypeScript** app using the JSON files from Part 1 as your data source. It should let a non-expert builder:

- Compare concrete products by embodied carbon, across the full life cycle (stage by stage, not just one headline number).
- Filter and compare by compressive strength and manufacturing location.
- Understand where data is missing or not directly comparable i.e. a not-declared stage is not a zero.

Deploy it to **Vercel** and include the live link in your submission.

We are not scoring visual polish. We are scoring whether the interface is honest and helps someone make a decision.

---

## One hard rule (both parts)

Every carbon figure must be traceable to its source EPD. A number with no provenance is worse than no number, because someone will make a real procurement decision on it.

---

## What to submit

- GitHub repo link
- Vercel deployment link
- The repo should contain `EXTRACTION.md`, `/data/*.json`, and the app code

---

## Scope and time

5-day window. We expect around **4 focused hours** across both parts. A rough app with clear reasoning and honest data beats a polished one that skips the thinking.

---

## What happens next

A **60-minute call** to go deeper. Come ready to explain your decisions and to work through a live problem together.

Good luck.
