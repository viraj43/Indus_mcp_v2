# INDUSS Research Intelligence MCP Server

An MCP (Model Context Protocol) server that acts as an institutional research
backend for AI assistants (Claude, ChatGPT, Cursor, VS Code, Windsurf, or any
MCP-compatible client). The LLM handles reasoning and orchestration; this
server handles all data retrieval, extraction, validation, calculation, and
citation generation.

## Status

The architecture is now considered stable: 15 tools proving the full pattern
end-to-end (context → route → search → extract → normalize → validate →
cite → calculate → report), built entirely on reusable engines rather than
per-tool logic. Adding the remaining ~30 tools from the spec is now purely
additive — new source profiles and new tool files composing existing
engines, no structural changes expected.

## Architecture

Tools are thin orchestrators. All reusable logic lives in **engines**
(`src/core/*`) and **sources** (`src/sources/*`), driven by one shared
**ResearchContext** so the same inputs always resolve to the same sources,
the same query, and the same citations — a tool call is deterministic.

```
Claude / ChatGPT / Cursor
        │  MCP Protocol
   INDUSS MCP Server (src/index.ts)
        │
 ┌──────────────────────────────────────────────────┐
 │ src/tools/registerTools.ts                        │  Tool Registry (15 tools, thin orchestration)
 │ src/tools/toolRegistry.ts                          │  Tool Metadata (category/inputs/outputs/sources)
 │                                                     │
 │ src/types/context.ts                               │  ResearchContext — the one input shape every
 │                                                     │  research tool takes (company/sector/country/
 │                                                     │  listed/objective/date)
 │                                                     │
 │ src/core/pipeline/searchPipeline.ts                │  Universal Search Pipeline — the ONLY caller
 │                                                     │  of core/exa/search.ts. Every search-backed
 │                                                     │  tool goes through this, end to end:
 │                                                     │  Router → Exa → Normalizer → Extractor →
 │                                                     │  Validator → Citation Engine → Response
 │ src/core/pipeline/fetchDocument.ts                 │  Deep-extraction document fetcher (opt-in)
 │                                                     │
 │ src/core/router/objective-router.ts                │  objective → source names
 │ src/core/router/source-router.ts                   │  source names → domain allowlist
 │ src/core/exa/{client,search,contents}.ts           │  Exa REST integration
 │ src/core/extraction/*                              │  HTML / PDF / Table extraction
 │ src/core/normalization/normalizer.ts               │  text/number normalization
 │ src/core/citations/citationEngine.ts               │  builds + dedupes + flattens citations
 │ src/core/citations/sourcePriority.ts               │  Source Priority Engine — Tier + Authority +
 │                                                     │  Recency → Confidence
 │ src/core/quality/validationEngine.ts                │  Validator stage: CIN format, financial
 │                                                     │  statement plausibility (grows to cover
 │                                                     │  hallucination/citation-completeness checks)
 │ src/core/financial/financialEngine.ts              │  Financial Calculator over FinancialStatement
 │                                                     │  objects (Income Statement/Balance Sheet/
 │                                                     │  Cash Flow)
 │ src/core/reports/reportEngine.ts                   │  Report orchestration (delegates to renderers/)
 │ src/core/renderers/{html,markdown}/*               │  Pure ResearchSection → string renderers
 │ src/core/pdf/pdfEngine.ts                           │  PDF Generator (Playwright, HTML → PDF)
 │                                                     │
 │ src/sources/{mca,sec,company,government,macro,     │  Each source is fully self-contained: domains,
 │   news,industry,exchange,regulator,legalMedia,     │  query templates per research angle, trust
 │   financialData,privateData,socialSentiment}/      │  tier, baseline authority score
 │   index.ts                                         │
 └──────────────────────────────────────────────────┘
        │
 Public Data Sources (Exa, domain-restricted per src/sources/*)
```

**Search flow:** tool builds a `ResearchContext` (with its fixed `objective`) →
`runSearchPipeline()` → `source-router` resolves domains from the matched
sources → the first matching source's query template is used → Exa (cached) →
Normalizer → optional deep Extractor → optional Validator → Citation Engine
(Source Priority scoring + dedupe) → tool shapes the result.

**Report flow:** tool assembles `ResearchSection[]` (each carrying its own
summary, tables, citations, and confidence) into a `ReportInput` →
`core/reports/reportEngine.ts` → `core/renderers/{markdown,html}/reportRenderer.ts`
→ (for PDF) `core/pdf/pdfEngine.ts` (Playwright). The HTML renderer produces
a full cover page + table of contents + numbered sections; a section's
`metadata.tone` (`info`/`success`/`warning`/`danger`) and `metadata.label`
wrap it in a colored callout card, and `summary` supports a light markdown
subset (`**bold**`, `- bullets`, `> blockquotes`) — see
`ReportInputSchema`/`ResearchSectionSchema` in `src/types/schemas.ts`.

**PDF delivery:** `generate_pdf` returns the rendered PDF as a base64 MCP
resource content block embedded directly in the tool response — this is
what makes it retrievable by a *remote* client (e.g. Claude.ai talking to a
Railway deployment), since a server-local file path is meaningless off-box.
It's also written to `reports/` locally and, when `MCP_BASE_URL` is set
(httpStream/production), served over `GET /reports/:filename` (registered
via `server.getApp()`), so the response additionally includes a
`downloadUrl`.

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env   # fill in EXA_API_KEY
npm run build
npm start               # stdio transport, for Claude Desktop / Cursor etc.
```

For local development with auto-reload:

```bash
npm run dev
```

For HTTP transport (remote MCP clients):

```bash
MCP_TRANSPORT=httpStream npm start
```

### With Docker (includes Redis + Postgres)

```bash
docker compose up --build
```

## Testing

```bash
npm test          # vitest — financial engine, citation engine, source priority, quality engine, report engine
npm run typecheck
```

## Tools implemented in this slice (23)

| Category | Tools |
|---|---|
| Company Intelligence | `search_company`, `company_profile`, `company_overview` |
| Financial Intelligence | `financial_statements`, `ratio_analysis` |
| Valuation & Risk | `dcf_valuation`, `comparables_valuation`, `scenario_analysis`, `red_flag_screen` |
| Funding Intelligence | `funding_history` |
| Competitor Intelligence | `discover_competitors`, `listed_peer_comparison` |
| Industry Intelligence | `industry_overview`, `market_size` |
| News Intelligence | `latest_news`, `negative_news` |
| Litigation & Compliance | `litigation_history` |
| Promoter Intelligence | `promoter_background` |
| Report Generation | `generate_report`, **`generate_institutional_report`** |
| PDF & Export | `generate_markdown`, `generate_pdf` |
| Ops | `health_check` (also surfaces the full tool capability registry) |

`negative_news` (soft signal: press + Glassdoor/Reddit sentiment) and
`litigation_history` (hard signal: SEBI/NCLT orders + legal-journalism case
coverage) are deliberately split — they answer different due-diligence
questions and shouldn't be conflated into one keyword screen.

### `generate_institutional_report` — the composite orchestrator

Every tool above also has its core logic exported as a plain function
(`getCompanyProfile`, `getFinancialStatements`, etc., alongside each
`registerXTool`), so `core/orchestration/institutionalReport.ts` can call
them directly, in-process — no re-entering the MCP protocol per phase. A
single `generate_institutional_report` call runs company profile,
financials, industry, server-ranked competitors, funding, and a combined
litigation/promoter/negative-news risk screen in parallel
(`Promise.allSettled`, one phase failing doesn't sink the rest), composes
the results into `ResearchSection`s with deterministic templated text (no
LLM tokens spent server-side), and renders whichever of
json/markdown/html/pdf the caller asked for. The calling model gets a
finished report instead of having to plan and narrate ~10 separate tool
calls itself.

Two quality mechanisms run underneath every company-subject tool
(including this composite one):

- **Entity verification** (`core/quality/entityVerification.ts`) — a
  result must contain the searched company's *distinctive* name tokens,
  not just one word it happens to share with an unrelated company (fixes
  the "Big Bang Boom" query pulling in "Nirmal Bang" or "BB Food").
- **Evidence metadata** (`tools/shared/evidenceMetadata.ts`) — every
  response's `metadata` includes `sourcesChecked` (human-readable labels),
  `primarySources`/`secondarySources` counts, and how many raw hits were
  dropped as false positives, so a clean screen reads as "checked SEBI,
  NCLT, Indian Kanoon... — no matches" rather than going quiet.

`financial_statements` also never returns bare `null`s: when data can't be
found it returns `{ status: "not_available", reason, recommendedSources }`
instead.

The macro/Industry Overview section runs unconditionally now (previously
gated behind an explicit `sector` argument) — real initiating-coverage
notes always carry this context, so `industry_overview` falls back to
searching around the company's own industry when no sector is supplied,
rather than the section silently disappearing. The composite report also
closes with a **"Next: Analyst Synthesis"** section that tells the calling
model exactly which judgment-based sections a finished institutional note
still needs — SWOT, bull/bear case, valuation — and to write them (and
every other section) in a direct, sell-side-analyst register rather than
hedged AI narration; see `core/orchestration/institutionalReport.ts`'s
`buildAnalystChecklistSection()`.

### `financial_statements` — the source waterfall

Real filing data is what everything downstream (ratio analysis, DCF,
comps) depends on, so `financial_statements` tries several extraction
strategies in order rather than one attempt against one URL:

1. **screener.in structured extraction** (`core/extraction/screenerExtractor.ts`)
   — screener.in's company page has a stable, server-rendered DOM
   (`#profit-loss`, `#balance-sheet`, `#cash-flow` sections, each one
   `<table>`), so for any listed company it covers this recovers every
   published annual period's real revenue/EBITDA/net profit/assets/
   equity/debt/cash-flow figures in one fetch — no JS rendering needed.
   The ticker slug is read off whichever screener.in URL Exa's search
   already returned, not guessed from the company name (tickers diverge
   from legal/brand names — e.g. Zomato Limited lists on screener.in as
   "ETERNAL" post-rebrand).
2. **Filing-PDF table recovery** (`core/extraction/pdfTableExtractor.ts`)
   — for BSE/NSE results and annual-report PDFs, which have no HTML
   table to scrape. Uses `pdfjs-dist` to read each text run's exact (x, y)
   position and reconstructs rows/columns from that positioning — pdf-parse
   alone (used elsewhere for keyword-context extraction) only returns
   flattened text with layout discarded, which is why the pre-waterfall
   version of this tool could never recover real figures from a PDF.
3. **Generic HTML `<table>` scraping** (`core/extraction/htmlExtractor.ts` +
   `tableExtractor.ts`) — the original fuzzy-label-match approach, kept as
   a fallback for IR/exchange pages that aren't screener.in.
4. **Keyword-context text windows** (`core/extraction/pdfExtractor.ts`) —
   last resort when no table structure could be recovered at all.
5. **Press-digest estimate for unlisted companies**
   (`core/extraction/pressFinancialsExtractor.ts`) — steps 1-4 above only
   ever work for listed companies (screener.in, BSE/NSE PDFs, IR pages all
   require a public filing to exist). For an unlisted company, every free
   third-party financials aggregator we tested (Zaubacorp, Tofler's public
   site, Craft.co, Owler, Dealroom) is bot-walled against automated access
   — confirmed by direct testing, not assumed. The one freely-reachable
   channel is business media that specifically buys and digests RoC/MCA
   AOC-4 filings into articles reporting exact figures (Entrackr, Inc42,
   YourStory — see `sources/startupMedia/index.ts`); this step
   regex-extracts period/revenue/profit-or-loss/growth from that coverage.
   The result comes back as `{ status: "estimate_only", estimates, note }`
   instead of being merged into the normal `FinancialStatement[]` shape —
   it is explicitly *not* claimed to be audited-grade, and the `note` field
   names the real fix (a paid MCA-data vendor, e.g. Probe42 or Setu's MCA
   API) rather than pretending the paywall problem was solved.

The tool returns real `FinancialStatement[]` objects (the same shape
`ratio_analysis` consumes) rather than an ad hoc line-items record, and by
default (`includeRatios: true`) computes the full ratio set and
multi-period CAGR trend inline — so a single `financial_statements` call
gives you filing data, ratios, and trend together instead of a manual
reshape-and-round-trip through `ratio_analysis`. Every returned statement
is also run through `checkFinancialPlausibility()`, and any flagged period
lowers the response's confidence rather than being silently trusted.

### AI-interpretation sections — synthesis without conflating it with fact

Every fact-bearing tool in this server is source-derived and scored by the
Source Priority Engine, but a genuinely useful research report also needs
judgment (is this a real moat, is this red flag material, would we invest)
— and no regex/heuristic in this codebase should try to fake that (see
`core/competitor/peerRanking.ts`'s comment on a "real, checkable heuristic"
vs. a fabricated score). That synthesis belongs to the calling LLM, so
`ResearchSectionSchema.metadata.kind = "ai_interpretation"`
(`core/reports/analystNote.ts`) is a recognized convention: any section a
caller marks this way gets a visually distinct callout in both the
HTML and Markdown renderers, and the renderer unconditionally appends a
"not investment/legal/financial advice" disclaimer — enforced by the
renderer, not left to whichever caller assembled the section to remember
to type it. Use it whenever you (the calling model) are writing your own
analysis, an investment thesis, or a verdict rather than restating what a
source said.

### Valuation & Risk tools — mechanical, no forecasting of their own

`dcf_valuation`, `comparables_valuation`, `scenario_analysis`, and
`red_flag_screen` (`core/financial/dcfEngine.ts`,
`comparablesEngine.ts`, `scenarioEngine.ts`, `redFlagEngine.ts`) are pure
calculation tools — no search, no LLM tokens spent server-side — that
follow the same design split as everything else here: **the MCP computes
and verifies, the calling LLM judges.** Concretely:

- `dcf_valuation` runs a discounted-cash-flow model from assumptions
  *you* supply explicitly (revenue growth path, EBITDA margin path,
  D&A/capex/NWC as % of revenue, tax rate, WACC, terminal growth, net
  debt) — it forecasts nothing and defaults nothing; every assumption is
  echoed back in the output, and a structurally broken assumption set
  (e.g. `wacc <= terminalGrowthRate`) is reported in `issues` instead of
  silently producing a distorted number.
- `comparables_valuation` applies a peer multiple set you supply
  (EV/EBITDA, P/E, EV/Sales — e.g. sourced from `listed_peer_comparison`)
  to the target's own metrics, returning low/median/high bands per
  multiple type plus one blended equity-value range (enterprise-value
  bands bridged to equity via `netDebt`). It picks no peers and invents no
  multiples.
- `scenario_analysis` reruns the same DCF three times — base, and bull/bear
  perturbed by deltas you choose — plus an optional 2D sensitivity grid
  (typically WACC × terminal growth).
- `red_flag_screen` tallies evidence *you've already gathered* from
  `litigation_history`, `negative_news`, `ratio_analysis`/
  `financial_statements`' plausibility checks, and any promoter
  regulatory-hit count you derived from `promoter_background`, into a
  severity-bucketed flag list using fixed, disclosed thresholds. It
  renders no verdict — a "clean" result means the inputs given raised no
  flags, not that none exist.

None of these tools produce a "management quality" score or an automated
INVEST/AVOID verdict, and they never will — that is deliberately left to
the calling LLM, ideally written as its own section marked
`metadata.kind = "ai_interpretation"` above.

Every tool returns the standard envelope:

```json
{
  "success": true,
  "data": {},
  "citations": [],
  "confidence": 0.98,
  "metadata": {}
}
```

Every `Citation` carries the four components the Source Priority Engine
scores it on:

```json
{
  "source": "mca.gov.in",
  "url": "...",
  "publicationDate": "...",
  "evidenceSnippet": "...",
  "tier": "official_filing",
  "authority": 0.95,
  "recencyPenalty": 0,
  "confidenceScore": 0.96
}
```

## Adding a new tool

1. If the objective needs a source not already covered, add a new profile
   under `src/sources/<name>/index.ts` (domains + searchTemplates + tier +
   confidence + supportsPDF/HTML) and register it in `src/sources/index.ts`.
   Otherwise, add the objective → source mapping to
   `src/core/router/objective-router.ts` and reuse existing sources.
2. Create `src/tools/<category>/<toolName>.ts`. Accept a
   `context: ResearchContextInputSchema.required({...})` parameter, call
   `withObjective(args.context, "<objective>")`, then
   `runSearchPipeline({ context, templateKey, subject, ... })` — never call
   `core/exa/search.ts` directly.
3. Export a `<toolName>Meta: ToolMeta` alongside the register function
   (category/inputs/outputs/requiredSources/caching/estimatedRuntimeMs) and
   add it to `src/tools/toolRegistry.ts`.
4. Register the tool in `src/tools/registerTools.ts`.
5. If the tool does deterministic calculation only (no search), add pure
   functions to the relevant engine under `src/core/<engine>/` (or a new
   engine folder) with unit tests in `tests/`.
6. For fact validation beyond Zod's type checks (format/plausibility
   rules), add functions to `src/core/quality/validationEngine.ts`.

## Notes on infra

- **Redis** is optional at runtime: if unreachable, the cache layer
  (`src/cache/cache.ts`) transparently falls back to an in-process memory
  store, so the server still works without `docker compose up`.
- **Postgres** is optional and only used for the query/result history schema
  in `src/db/migrations.sql`; tools function without `DATABASE_URL` set.
- **BullMQ** (`src/queue/queue.ts`) is wired up for future long-running
  report jobs but no tool enqueues to it yet in this slice.
