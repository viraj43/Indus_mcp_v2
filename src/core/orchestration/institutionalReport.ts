import type { ResearchContextInput } from "../../types/context.js";
import type { ReportInput, ResearchSection, ReportTable } from "../../types/schemas.js";
import { dedupeCitations, aggregateConfidence } from "../citations/citationEngine.js";
import { labelDomains } from "../../sources/labels.js";
import { getCompanyProfile } from "../../tools/company/companyProfile.js";
import { getCompanyOverview } from "../../tools/company/companyOverview.js";
import { getFinancialStatements } from "../../tools/financial/financialStatements.js";
import { getIndustryOverview } from "../../tools/industry/industryOverview.js";
import { getDiscoverCompetitors } from "../../tools/competitor/discoverCompetitors.js";
import { getFundingHistory } from "../../tools/funding/fundingHistory.js";
import { getLitigationHistory } from "../../tools/litigation/litigationHistory.js";
import { getPromoterBackground } from "../../tools/promoter/promoterBackground.js";
import { getNegativeNews } from "../../tools/news/negativeNews.js";
import { getLatestNews } from "../../tools/news/latestNews.js";
import type { ToolResult } from "../../types/common.js";

export type InstitutionalReportType = "debt_raising" | "credit_assessment" | "equity_research" | "general_diligence";

export interface InstitutionalReportOptions {
  company: string;
  reportType: InstitutionalReportType;
  country: "india" | "global";
  listed: "listed" | "unlisted" | "unknown";
  sector?: string;
  companyDomain?: string;
}

export interface PhaseError {
  phase: string;
  message: string;
}

export interface InstitutionalReportResult {
  report: ReportInput;
  phaseErrors: PhaseError[];
}

const REPORT_TYPE_LABELS: Record<InstitutionalReportType, string> = {
  debt_raising: "Debt Raising / Credit Assessment",
  credit_assessment: "Credit Assessment",
  equity_research: "Equity Research",
  general_diligence: "Company Due Diligence",
};

/** Human-facing labels for financial_statements' internal extraction-method
 * enum — a reader shouldn't see implementation vocabulary like
 * "screener_structured" in a report; they should see where the number
 * actually came from, the way a sell-side note would footnote it. */
const EXTRACTION_METHOD_LABELS: Record<string, string> = {
  screener_structured: "Screener.in — structured filing extraction",
  html_tables: "Company filing — HTML tables",
  pdf_tables: "Company filing — PDF tables",
  pdf_keyword_context: "Company filing — unstructured text (no table recovered)",
  snippet_only: "Press/search mentions only (no filing recovered)",
};

function humanizeExtractionMethod(method: string): string {
  return EXTRACTION_METHOD_LABELS[method] ?? method;
}

function unwrap<T>(settled: PromiseSettledResult<T>, phase: string, phaseErrors: PhaseError[]): T | null {
  if (settled.status === "fulfilled") return settled.value;
  phaseErrors.push({ phase, message: settled.reason instanceof Error ? settled.reason.message : String(settled.reason) });
  return null;
}

function domainsCheckedOf(result: ToolResult<unknown> | null): string[] {
  const domains = result?.metadata.domainsChecked;
  return Array.isArray(domains) ? (domains as string[]) : [];
}

function buildCompanySnapshotSection(
  profile: ToolResult<Awaited<ReturnType<typeof getCompanyProfile>>["data"]> | null,
  overview: ToolResult<Awaited<ReturnType<typeof getCompanyOverview>>["data"]> | null,
): ResearchSection {
  const lines: string[] = [];
  if (profile) {
    lines.push(`**CIN:** ${profile.data.cin ?? "Not disclosed in sources reviewed"}`);
    lines.push(`**Incorporation Date:** ${profile.data.incorporationDate ?? "Not disclosed in sources reviewed"}`);
    lines.push(`**Listing Status:** ${profile.data.listingStatus}`);
  }
  if (overview?.data.summary) {
    lines.push("");
    lines.push(overview.data.summary.slice(0, 800));
  }

  const citations = dedupeCitations([...(profile?.citations ?? []), ...(overview?.citations ?? [])]);
  const needsVerification = !profile?.data.cin;

  return {
    title: "Company Snapshot",
    summary: lines.length > 0 ? lines.join("\n") : "No company profile data could be retrieved from trusted sources.",
    tables: [],
    citations,
    confidence: aggregateConfidence(citations),
    metadata: needsVerification ? { tone: "info", label: "Verification Required" } : {},
  };
}

function buildFinancialSection(financials: ToolResult<Awaited<ReturnType<typeof getFinancialStatements>>["data"]> | null): ResearchSection {
  if (!financials) {
    return {
      title: "Financial Snapshot",
      summary: "Financial data lookup failed — see report metadata for the underlying error.",
      tables: [],
      citations: [],
      confidence: 0,
      metadata: { tone: "warning", label: "Financial Data Not Available" },
    };
  }

  const d = financials.data;
  if (d.status === "not_available") {
    return {
      title: "Financial Snapshot",
      summary: `**Status:** Not Available\n\n**Reason:** ${d.reason}\n\n- Recommended sources to check manually: ${d.recommendedSources.join(", ")}`,
      tables: [],
      citations: financials.citations,
      confidence: 0,
      metadata: { tone: "warning", label: "Financial Data Not Available" },
    };
  }

  if (d.status === "estimate_only") {
    const table: ReportTable = {
      headers: ["Period", "Revenue", "Result", "YoY", "Source"],
      rows: d.estimates.map((e) => {
        let hostname = e.url;
        try {
          hostname = new URL(e.url).hostname;
        } catch {
          // keep raw url if unparsable
        }
        const result = e.netResultRaw ? `${e.netResultRaw} (${e.netResultType})` : "N/A";
        return [e.period ?? "N/A", e.revenueRaw ?? "N/A", result, e.growthPercent !== null ? `${e.growthPercent}%` : "N/A", hostname];
      }),
    };
    return {
      title: "Financial Snapshot",
      summary: `**Status:** Estimate Only (unaudited)\n\n${d.note}`,
      tables: [table],
      citations: financials.citations,
      confidence: financials.confidence,
      metadata: { tone: "info", label: "Unaudited Press-Reported Estimate" },
    };
  }

  const tables: ReportTable[] = [];
  const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "N/A" : String(v));

  if (d.statements.length > 0) {
    const periods = d.statements.map((s) => s.period);
    const lineItemRows: [string, (number | null | undefined)[]][] = [
      ["Revenue", d.statements.map((s) => s.incomeStatement.revenue)],
      ["EBITDA", d.statements.map((s) => s.incomeStatement.ebitda)],
      ["Net Profit", d.statements.map((s) => s.incomeStatement.netProfit)],
      ["Total Assets", d.statements.map((s) => s.balanceSheet.totalAssets)],
      ["Total Equity", d.statements.map((s) => s.balanceSheet.totalEquity)],
      ["Total Debt", d.statements.map((s) => s.balanceSheet.totalDebt)],
      ["Operating Cash Flow", d.statements.map((s) => s.cashFlow.operatingCashFlow)],
    ];
    tables.push({
      headers: ["Line Item", ...periods],
      rows: lineItemRows.map(([label, values]) => [label, ...values.map(fmt)]),
    });

    if (d.ratios?.length) {
      const ratioRows: [string, (number | null)[]][] = [
        ["EBITDA Margin %", d.ratios.map((r) => r.ebitdaMargin)],
        ["Net Profit Margin %", d.ratios.map((r) => r.netProfitMargin)],
        ["ROE %", d.ratios.map((r) => r.roe)],
        ["ROCE %", d.ratios.map((r) => r.roce)],
        ["Debt / Equity", d.ratios.map((r) => r.debtToEquity)],
      ];
      tables.push({
        headers: ["Ratio", ...periods],
        rows: ratioRows.map(([label, values]) => [label, ...values.map(fmt)]),
      });
    }
  }

  const trendLine = d.trend
    ? `**Revenue CAGR:** ${fmt(d.trend.revenueCagr)}%  **Net Profit CAGR:** ${fmt(d.trend.netProfitCagr)}% (${d.trend.periodsAnalyzed}-period trailing)\n\n`
    : "";
  const plausibilityNote = d.plausibilityIssues
    ? `\n\n> Accounting-identity checks flagged ${Object.keys(d.plausibilityIssues).length} period(s) for review (see \`plausibilityIssues\`) — treat those figures with caution pending verification against the primary filing.`
    : "";

  return {
    title: "Financial Snapshot",
    summary: `**Source:** ${humanizeExtractionMethod(d.extractionMethod)}\n**Primary Source:** ${d.primarySourceUrl}\n\n${trendLine}${plausibilityNote}`,
    tables,
    citations: financials.citations,
    confidence: financials.confidence,
    metadata: {},
  };
}

function buildIndustrySection(industry: ToolResult<Awaited<ReturnType<typeof getIndustryOverview>>["data"]> | null): ResearchSection | null {
  if (!industry) return null;
  return {
    title: "Industry Overview — Macro Research",
    summary:
      industry.data.summary ||
      "No industry-level coverage was found in the trusted source set for this sector — worth a manual check against a consulting/market-research house directly.",
    tables: [],
    citations: industry.citations,
    confidence: industry.confidence,
    metadata: {},
  };
}

function buildCompetitorSection(competitors: ToolResult<Awaited<ReturnType<typeof getDiscoverCompetitors>>["data"]> | null): ResearchSection {
  if (!competitors || competitors.data.topPeers.length === 0) {
    return {
      title: "Competitor Landscape",
      summary: "No named competitors were identified from the industry and news coverage reviewed.",
      tables: [],
      citations: competitors?.citations ?? [],
      confidence: competitors?.confidence ?? 0,
      metadata: {},
    };
  }

  const table: ReportTable = {
    headers: ["Competitor", "Mentions", "Listed Signal"],
    rows: competitors.data.topPeers.map((p) => [p.name, p.mentionCount, p.listedSignal ? "Yes" : "No"]),
  };

  return {
    title: "Competitor Landscape",
    summary: `Ranked by prominence in industry and news coverage, with additional weight given to a confirmed listed-company signal (NSE/BSE references). ${competitors.data.rankedCompetitors.length} candidate(s) identified in total.`,
    tables: [table],
    citations: competitors.citations,
    confidence: competitors.confidence,
    metadata: {},
  };
}

function buildFundingSection(funding: ToolResult<Awaited<ReturnType<typeof getFundingHistory>>["data"]> | null): ResearchSection | null {
  if (!funding || funding.data.events.length === 0) return null;

  const table: ReportTable = {
    headers: ["Round", "Amount", "Source"],
    rows: funding.data.events.map((e) => {
      let hostname = e.url;
      try {
        hostname = new URL(e.url).hostname;
      } catch {
        // keep raw url if unparsable
      }
      return [e.round ?? "Unspecified", e.amountRaw ?? "Not disclosed", hostname];
    }),
  };

  return {
    title: "Funding History",
    summary: `${funding.data.events.length} funding round(s) identified from public disclosures and press coverage.`,
    tables: [table],
    citations: funding.citations,
    confidence: funding.confidence,
    metadata: {},
  };
}

function buildRiskScreeningSection(
  litigation: ToolResult<Awaited<ReturnType<typeof getLitigationHistory>>["data"]> | null,
  promoter: ToolResult<Awaited<ReturnType<typeof getPromoterBackground>>["data"]> | null,
  negativeNews: ToolResult<Awaited<ReturnType<typeof getNegativeNews>>["data"]> | null,
): ResearchSection {
  const checkedDomains = new Set<string>();
  [litigation, promoter, negativeNews].forEach((r) => domainsCheckedOf(r).forEach((d) => checkedDomains.add(d)));
  const checklist = labelDomains(Array.from(checkedDomains))
    .map((label) => `✓ ${label}`)
    .join(", ");

  const lines: string[] = [`**Checked:** ${checklist || "no sources reachable"}`, ""];

  if (litigation) {
    lines.push(
      litigation.data.recordClean
        ? "- **Litigation / Regulatory (SEBI, NCLT, legal media):** No matches found."
        : `- **Litigation / Regulatory (SEBI, NCLT, legal media):** ${litigation.data.cases.length} potential record(s) found — requires manual review.`,
    );
    for (const c of litigation.data.cases.slice(0, 3)) {
      lines.push(`  - [${c.title}](${c.url})${c.caseReference ? ` (Case: ${c.caseReference})` : ""}`);
    }
  } else {
    lines.push("- **Litigation / Regulatory:** screen could not be completed — see report metadata for the error.");
  }

  if (promoter) {
    lines.push(
      promoter.data.screenClean
        ? "- **Promoter / Director Background:** No disqualification or debarment records found."
        : `- **Promoter / Director Background:** ${promoter.data.flags.length} flag(s) found — requires manual review.`,
    );
  } else {
    lines.push("- **Promoter / Director Background:** screen could not be completed — see report metadata for the error.");
  }

  if (negativeNews) {
    lines.push(
      negativeNews.data.screenClean
        ? "- **Adverse Media & Public Sentiment:** No adverse coverage found."
        : `- **Adverse Media & Public Sentiment:** ${negativeNews.data.flaggedArticles.length} article(s) flagged — requires manual review.`,
    );
  } else {
    lines.push("- **Adverse Media & Public Sentiment:** screen could not be completed — see report metadata for the error.");
  }

  const citations = dedupeCitations([
    ...(litigation?.citations ?? []),
    ...(promoter?.citations ?? []),
    ...(negativeNews?.citations ?? []),
  ]);

  const anyDirty = litigation?.data.recordClean === false || promoter?.data.screenClean === false || negativeNews?.data.screenClean === false;
  const allRan = litigation && promoter && negativeNews;
  const allClean = allRan && litigation.data.recordClean && promoter.data.screenClean && negativeNews.data.screenClean;

  return {
    title: "Risk & Compliance Screening",
    summary: lines.join("\n"),
    tables: [],
    citations,
    confidence: aggregateConfidence(citations),
    metadata: anyDirty
      ? { tone: "danger", label: "Risk Flags Identified" }
      : allClean
        ? { tone: "success", label: "Screening Clean" }
        : {},
  };
}

/** This composite tool only assembles source-derived, deterministic
 * sections — the SWOT grid, the bull/bear narrative, and a DCF/comps-based
 * valuation call for judgment this server deliberately won't fake (see
 * design note in core/reports/analystNote.ts). Real initiating-coverage
 * notes (PL Capital, ICICI Securities, Motilal Oswal) all carry these, so
 * rather than silently omitting them this closing section tells the
 * calling model exactly what to add next and how to mark it, instead of
 * leaving the report looking "finished" when it isn't. This is guidance,
 * not judgment, so it does NOT carry metadata.kind = "ai_interpretation"
 * itself — the sections it asks for should. */
function buildAnalystChecklistSection(): ResearchSection {
  const lines = [
    "This report covers verified facts and figures. A finished institutional note also needs the analyst's own synthesis — add the following as new sections (via `generate_report`/`generate_pdf`), each marked `metadata.kind = \"ai_interpretation\"` so it renders as your own view rather than sourced fact:",
    "",
    "- **SWOT Analysis** — Strengths/Weaknesses/Opportunities/Threats, reasoned from the Company Snapshot, Financial Snapshot, Industry Overview, and Risk & Compliance sections above.",
    "- **Bull & Bear Case** — the upside and downside narrative, ideally backed by `scenario_analysis`'s base/bull/bear DCF output rather than prose alone.",
    "- **Valuation Call** — a fair-value view built on `dcf_valuation` and/or `comparables_valuation`, with your own assumptions stated and reasoned, not defaulted by this server.",
    "",
    "Write these the way a sell-side analyst would: direct, data-led, and free of hedging filler (\"it is important to note\", \"based on the information provided\") — every claim should trace back to a fact already in this report or a number from the valuation tools above.",
  ];

  return {
    title: "Next: Analyst Synthesis",
    summary: lines.join("\n"),
    tables: [],
    citations: [],
    confidence: 1,
    metadata: { tone: "info", label: "For the Calling Model" },
  };
}

function buildNewsSection(news: ToolResult<Awaited<ReturnType<typeof getLatestNews>>["data"]> | null): ResearchSection | null {
  if (!news) return null;
  const lines = news.data.articles
    .slice(0, 5)
    .map((a) => `- [${a.title}](${a.url})${a.publishedDate ? ` — ${a.publishedDate.slice(0, 10)}` : ""}`);

  return {
    title: "Recent News",
    summary: lines.length > 0 ? lines.join("\n") : "No recent news coverage found in the trusted source allowlist.",
    tables: [],
    citations: news.citations,
    confidence: news.confidence,
    metadata: {},
  };
}

/** The internal orchestrator behind generate_institutional_report:
 * one call in, every relevant phase run in parallel (Router → Exa →
 * Extractor → Validator → Citation Engine for each), composed into
 * ResearchSections with deterministic templated text — no LLM tokens spent
 * inside the server. The calling model receives a finished report instead
 * of having to plan and narrate 10 separate tool calls itself. */
export async function buildInstitutionalReport(opts: InstitutionalReportOptions): Promise<InstitutionalReportResult> {
  const baseContext: ResearchContextInput = {
    company: opts.company,
    companyDomain: opts.companyDomain,
    sector: opts.sector,
    country: opts.country,
    listed: opts.listed,
    date: new Date().toISOString(),
  };

  const phaseErrors: PhaseError[] = [];

  const [
    profileSettled,
    overviewSettled,
    financialsSettled,
    industrySettled,
    competitorsSettled,
    fundingSettled,
    litigationSettled,
    promoterSettled,
    negativeNewsSettled,
    newsSettled,
  ] = await Promise.allSettled([
    getCompanyProfile(baseContext),
    getCompanyOverview(baseContext),
    getFinancialStatements(baseContext),
    getIndustryOverview(baseContext),
    getDiscoverCompetitors(baseContext),
    getFundingHistory(baseContext),
    getLitigationHistory(baseContext),
    getPromoterBackground(baseContext),
    getNegativeNews(baseContext),
    getLatestNews(baseContext, 180),
  ]);

  const profile = unwrap(profileSettled, "company_profile", phaseErrors);
  const overview = unwrap(overviewSettled, "company_overview", phaseErrors);
  const financials = unwrap(financialsSettled, "financial_statements", phaseErrors);
  const industry = unwrap(industrySettled, "industry_overview", phaseErrors);
  const competitors = unwrap(competitorsSettled, "discover_competitors", phaseErrors);
  const funding = unwrap(fundingSettled, "funding_history", phaseErrors);
  const litigation = unwrap(litigationSettled, "litigation_history", phaseErrors);
  const promoter = unwrap(promoterSettled, "promoter_background", phaseErrors);
  const negativeNews = unwrap(negativeNewsSettled, "negative_news", phaseErrors);
  const news = unwrap(newsSettled, "latest_news", phaseErrors);

  const sections: ResearchSection[] = [
    buildCompanySnapshotSection(profile, overview),
    buildFinancialSection(financials),
    buildIndustrySection(industry),
    buildCompetitorSection(competitors),
    buildFundingSection(funding),
    buildRiskScreeningSection(litigation, promoter, negativeNews),
    buildNewsSection(news),
    buildAnalystChecklistSection(),
  ].filter((s): s is ResearchSection => s !== null);

  const report: ReportInput = {
    title: `${opts.company} — ${REPORT_TYPE_LABELS[opts.reportType]}`,
    subtitle: "Company Diligence & Market Intelligence Brief",
    companyName: opts.company,
    tags: [opts.listed === "listed" ? "Listed" : opts.listed === "unlisted" ? "Unlisted" : "Listing Status Unknown", REPORT_TYPE_LABELS[opts.reportType]],
    preparedBy: "INDUSS Research Intelligence Agent",
    sections,
  };

  return { report, phaseErrors };
}
