import type { ReportInput, ResearchSection } from "../../../types/schemas.js";
import { flattenSectionCitations } from "../../citations/citationEngine.js";
import { escapeHtml, renderMarkdownSummary, slugify } from "../shared.js";
import { AI_INTERPRETATION_DISCLAIMER, AI_INTERPRETATION_LABEL, isAiInterpretation } from "../../reports/analystNote.js";

const DEFAULT_BRAND_NAME = "INDUSS";
const DEFAULT_BRAND_TAGLINE = "Research Intelligence";
const DEFAULT_CLASSIFICATION = "CONFIDENTIAL RESEARCH REPORT";
const DEFAULT_PREPARED_BY = "INDUSS Research Intelligence";

type SectionTone = "danger" | "info" | "success" | "warning";

const TONE_ICON: Record<SectionTone, string> = {
  info: "&#9432;",
  success: "&#10003;",
  warning: "&#9888;",
  danger: "&#9888;",
};

function isTone(value: unknown): value is SectionTone {
  return value === "info" || value === "success" || value === "warning" || value === "danger";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const datePart = d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const timePart = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${datePart}, ${timePart}`;
}

function renderCover(report: ReportInput): string {
  const brandName = report.brandName ?? DEFAULT_BRAND_NAME;
  const brandTagline = report.brandTagline ?? DEFAULT_BRAND_TAGLINE;
  const classification = report.classification ?? DEFAULT_CLASSIFICATION;
  const preparedBy = report.preparedBy ?? DEFAULT_PREPARED_BY;
  const generatedAt = report.generatedAt ?? new Date().toISOString();
  const tags = report.tags ?? [];

  const tagsHtml = tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("");

  return `<section class="cover">
    <div class="brand">
      <span class="brand-mark">${escapeHtml(brandName.slice(0, 2).toUpperCase())}</span>
      <div>
        <div class="brand-name">${escapeHtml(brandName)}</div>
        <div class="brand-tagline">${escapeHtml(brandTagline)}</div>
      </div>
    </div>
    <div class="cover-main">
      <div class="eyebrow">${escapeHtml(classification)}</div>
      <h1 class="cover-title">${escapeHtml(report.title)}</h1>
      ${report.subtitle ? `<p class="cover-subtitle">${escapeHtml(report.subtitle)}</p>` : ""}
      ${tagsHtml ? `<div class="tag-row">${tagsHtml}</div>` : ""}
    </div>
    <div class="cover-footer">
      <div class="meta-grid">
        <div><div class="meta-label">Prepared</div><div class="meta-value">${escapeHtml(formatDate(generatedAt))}</div></div>
        <div><div class="meta-label">Prepared By</div><div class="meta-value">${escapeHtml(preparedBy)}</div></div>
      </div>
      <p class="confidential-note">CONFIDENTIAL &mdash; Prepared exclusively for internal client use. Not for distribution.</p>
    </div>
  </section>`;
}

function renderToc(report: ReportInput, brandName: string): string {
  const items = report.sections
    .map(
      (s, i) => `<li><span class="toc-num">${pad2(i + 1)}</span><span class="toc-title">${escapeHtml(s.title)}</span></li>`,
    )
    .join("\n");

  return `<section class="toc-page">
    <div class="eyebrow">Contents</div>
    <h1 class="toc-heading">Table of Contents</h1>
    <ol class="toc-list">${items}</ol>
    <p class="toc-footer">Prepared by ${escapeHtml(brandName)} Research Intelligence &middot; ${escapeHtml(
      formatDate(report.generatedAt ?? new Date().toISOString()),
    )}</p>
  </section>`;
}

function renderTable(table: ResearchSection["tables"][number]): string {
  return `<table class="data-table">
    <thead><tr>${table.headers.map((h) => `<th>${escapeHtml(String(h))}</th>`).join("")}</tr></thead>
    <tbody>${table.rows
      .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell))}</td>`).join("")}</tr>`)
      .join("\n")}</tbody>
  </table>`;
}

function renderSection(section: ResearchSection, index: number): string {
  const tone = isTone(section.metadata?.tone) ? section.metadata.tone : null;
  const label = typeof section.metadata?.label === "string" ? section.metadata.label : null;
  const isInterpretation = isAiInterpretation(section.metadata);

  const summaryHtml = renderMarkdownSummary(section.summary);
  const tablesHtml = section.tables.map(renderTable).join("\n");
  const sourcesHtml = section.citations.length
    ? `<p class="sources">Sources: ${section.citations.map((c) => `<a href="${c.url}">${escapeHtml(c.source)}</a>`).join(", ")}</p>`
    : "";

  const body = `<div class="section-summary">${summaryHtml}</div>${tablesHtml}${sourcesHtml}`;

  // ai_interpretation always renders as its own distinct callout — never
  // blended with (or overridden by) the tone-based fact callouts — and
  // always carries the disclaimer, whether or not the section's own text
  // included one, and whether or not this section also set a tone/label.
  const wrapped = isInterpretation
    ? `<div class="callout callout-interpretation">
        <div class="callout-label">&#129504; ${escapeHtml(label ?? AI_INTERPRETATION_LABEL)}</div>
        ${body}
        <p class="interpretation-disclaimer">${escapeHtml(AI_INTERPRETATION_DISCLAIMER)}</p>
      </div>`
    : tone
      ? `<div class="callout callout-${tone}">${
          label ? `<div class="callout-label">${TONE_ICON[tone]} ${escapeHtml(label)}</div>` : ""
        }${body}</div>`
      : body;

  return `<section class="report-section" id="${slugify(section.title)}">
    <div class="section-header">
      <span class="section-num">${pad2(index + 1)}</span>
      <h2>${escapeHtml(section.title)}</h2>
      <span class="section-confidence">confidence ${section.confidence}</span>
    </div>
    ${wrapped}
  </section>`;
}

function renderCitationsAppendix(report: ReportInput): string {
  const citations = flattenSectionCitations(report.sections.map((s) => s.citations));
  if (citations.length === 0) return "";

  return `<section class="report-section" id="citations">
    <div class="section-header"><h2>Citations</h2></div>
    <ol class="citations">
      ${citations
        .map(
          (c) =>
            `<li><a href="${c.url}">${escapeHtml(c.source)}</a>${
              c.publicationDate ? ` &mdash; ${escapeHtml(c.publicationDate)}` : ""
            } <span class="confidence-chip">${escapeHtml(c.tier)} &middot; ${c.confidenceScore}</span></li>`,
        )
        .join("\n")}
    </ol>
  </section>`;
}

/** Pure HTML renderer for a ReportInput: institutional-style cover page,
 * table of contents, numbered sections (with optional tone-based callout
 * styling and inline markdown), styled data tables, and a citations
 * appendix. Everything here is driven by the ReportInput/ResearchSection
 * data — there is no company- or report-specific content in this file.
 * This is what core/pdf/pdfEngine.ts feeds to Playwright for print
 * rendering. No orchestration logic lives here — see
 * core/reports/reportEngine.ts. */
export function renderReportHtml(report: ReportInput): string {
  const brandName = report.brandName ?? DEFAULT_BRAND_NAME;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(report.title)}</title>
<style>
  :root {
    --ink: #16181d;
    --muted: #6b7280;
    --accent: #2952e3;
    --border: #e5e7eb;
    --bg-soft: #f8fafc;
    --success: #16a34a;
    --success-bg: #f0fdf4;
    --success-border: #bbf7d0;
    --warning: #b45309;
    --warning-bg: #fffbeb;
    --warning-border: #fde68a;
    --danger: #dc2626;
    --danger-bg: #fef2f2;
    --danger-border: #fecaca;
    --info: #2952e3;
    --info-bg: #eff6ff;
    --info-border: #bfdbfe;
    --interpretation: #7c3aed;
    --interpretation-bg: #f5f3ff;
    --interpretation-border: #ddd6fe;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--ink);
    margin: 0;
    padding: 44px 56px;
    line-height: 1.55;
    font-size: 13px;
  }

  /* Cover page */
  .cover { min-height: 920px; display: flex; flex-direction: column; justify-content: space-between; break-after: page; page-break-after: always; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand-mark { width: 34px; height: 34px; border-radius: 8px; background: var(--bg-soft); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 12px; color: var(--accent); flex-shrink: 0; }
  .brand-name { font-weight: 800; font-size: 15px; letter-spacing: 0.02em; }
  .brand-tagline { font-size: 11px; color: var(--muted); }
  .cover-main { margin: auto 0; }
  .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.09em; color: var(--accent); text-transform: uppercase; margin-bottom: 12px; }
  .cover-title { font-size: 34px; font-weight: 800; line-height: 1.18; margin: 0 0 12px; }
  .cover-subtitle { font-size: 15px; color: var(--muted); margin: 0 0 20px; }
  .tag-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .tag { font-size: 11px; font-weight: 600; padding: 5px 13px; border-radius: 999px; border: 1px solid var(--border); }
  .cover-footer { border-top: 1px solid var(--border); padding-top: 18px; }
  .meta-grid { display: flex; gap: 56px; margin-bottom: 14px; }
  .meta-label { font-size: 10px; font-weight: 700; letter-spacing: 0.07em; color: var(--muted); text-transform: uppercase; margin-bottom: 4px; }
  .meta-value { font-size: 13px; font-weight: 600; }
  .confidential-note { font-size: 11px; font-weight: 600; color: var(--danger); margin: 0; }

  /* Table of contents page */
  .toc-page { min-height: 920px; break-after: page; page-break-after: always; }
  .toc-heading { font-size: 24px; font-weight: 800; margin: 6px 0 24px; }
  .toc-list { list-style: none; margin: 0; padding: 0; }
  .toc-list li { display: flex; align-items: baseline; gap: 18px; padding: 14px 0; border-bottom: 1px solid var(--border); }
  .toc-num { font-size: 11px; color: var(--muted); font-weight: 700; min-width: 20px; }
  .toc-title { font-size: 14px; }
  .toc-footer { margin-top: 36px; font-size: 11px; color: var(--muted); text-align: center; }

  /* Sections */
  .report-section { margin-top: 34px; }
  .report-section:first-of-type { margin-top: 0; }
  .section-header { display: flex; align-items: baseline; gap: 12px; border-bottom: 2px solid var(--accent); padding-bottom: 8px; margin-bottom: 16px; }
  .section-num { font-size: 11px; font-weight: 700; color: var(--accent); background: var(--info-bg); border-radius: 4px; padding: 2px 7px; }
  .section-header h2 { font-size: 17px; margin: 0; flex: 1; }
  .section-confidence { font-size: 10px; color: var(--muted); font-weight: 600; white-space: nowrap; }

  .callout { border: 1px solid var(--border); border-radius: 8px; padding: 18px 20px; }
  .callout-info { background: var(--info-bg); border-color: var(--info-border); }
  .callout-success { background: var(--success-bg); border-color: var(--success-border); }
  .callout-warning { background: var(--warning-bg); border-color: var(--warning-border); }
  .callout-danger { background: var(--danger-bg); border-color: var(--danger-border); }
  .callout-label { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 10px; }
  .callout-info .callout-label { color: var(--info); }
  .callout-success .callout-label { color: var(--success); }
  .callout-warning .callout-label { color: var(--warning); }
  .callout-danger .callout-label { color: var(--danger); }
  .callout-interpretation { background: var(--interpretation-bg); border: 1px dashed var(--interpretation-border); }
  .callout-interpretation .callout-label { color: var(--interpretation); }
  .interpretation-disclaimer { margin: 12px 0 0; padding-top: 10px; border-top: 1px solid var(--interpretation-border); font-size: 10.5px; font-style: italic; color: var(--muted); }

  .section-summary p { margin: 0 0 10px; font-size: 13px; line-height: 1.65; color: #374151; }
  .section-summary ul { margin: 0 0 12px; padding-left: 20px; }
  .section-summary li { font-size: 13px; line-height: 1.6; margin-bottom: 6px; color: #374151; }
  .section-summary blockquote { margin: 12px 0; padding: 10px 16px; border-left: 3px solid var(--accent); background: var(--bg-soft); font-size: 12.5px; color: #4b5563; font-style: italic; }
  .section-summary blockquote p { margin: 0; }
  .section-summary > :last-child { margin-bottom: 0; }

  table.data-table { width: 100%; border-collapse: collapse; margin: 14px 0 18px; font-size: 12px; }
  table.data-table thead th { text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); background: var(--bg-soft); padding: 8px 12px; border-bottom: 2px solid var(--border); }
  table.data-table td { padding: 8px 12px; border-bottom: 1px solid var(--border); color: #1f2937; }
  table.data-table tbody tr:nth-child(even) { background: #fafbfc; }

  p.sources { font-size: 11px; color: var(--muted); margin: 6px 0 0; }
  p.sources a { color: var(--accent); text-decoration: none; }

  ol.citations { font-size: 11px; color: var(--muted); padding-left: 20px; }
  ol.citations li { margin-bottom: 8px; }
  ol.citations a { color: var(--accent); text-decoration: none; }
  .confidence-chip { display: inline-block; margin-left: 4px; padding: 1px 8px; border-radius: 999px; background: var(--bg-soft); font-size: 10px; }

  @media print {
    body { padding: 0 24px; }
    .report-section { page-break-inside: avoid; break-inside: avoid; }
  }
</style>
</head>
<body>
  ${renderCover(report)}
  ${renderToc(report, brandName)}
  ${report.sections.map((s, i) => renderSection(s, i)).join("\n")}
  ${renderCitationsAppendix(report)}
</body>
</html>`;
}
