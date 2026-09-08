import type { ResearchContextInput } from "../../types/context.js";
import type { ReportInput, ResearchSection, ReportTable } from "../../types/schemas.js";
import { dedupeCitations, aggregateConfidence } from "../citations/citationEngine.js";
import { labelDomains } from "../../sources/labels.js";
import { getCompanyProfile } from "../../tools/company/companyProfile.js";
import { getCompanyOverview } from "../../tools/company/companyOverview.js";
<<<<<<< HEAD
import { getShareholdingPattern } from "../../tools/company/shareholdingPattern.js";
import { getManagementProfile } from "../../tools/company/managementProfile.js";
import { getFinancialStatements } from "../../tools/financial/financialStatements.js";
import { getSegmentRevenue } from "../../tools/financial/segmentRevenue.js";
import { getIndustryOverview } from "../../tools/industry/industryOverview.js";
import { getMarketSize } from "../../tools/industry/marketSize.js";
=======
import { getFinancialStatements } from "../../tools/financial/financialStatements.js";
import { getIndustryOverview } from "../../tools/industry/industryOverview.js";
>>>>>>> 6e7f6127dba9d8884cd7f1957c7e4521c678ab0f
import { getDiscoverCompetitors } from "../../tools/competitor/discoverCompetitors.js";
import { getFundingHistory } from "../../tools/funding/fundingHistory.js";
import { getLitigationHistory } from "../../tools/litigation/litigationHistory.js";
import { getPromoterBackground } from "../../tools/promoter/promoterBackground.js";
import { getNegativeNews } from "../../tools/news/negativeNews.js";
import { getLatestNews } from "../../tools/news/latestNews.js";
<<<<<<< HEAD
import { getManagementCommentary } from "../../tools/news/managementCommentary.js";
import { getConsensusEstimates } from "../../tools/news/consensusEstimates.js";
import { buildAutoValuation, type AutoValuationResult } from "./autoValuation.js";
=======
>>>>>>> 6e7f6127dba9d8884cd7f1957c7e4521c678ab0f
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
<<<<<<< HEAD
    lines.push(overview.data.summary.slice(0, 2500));
=======
    lines.push(overview.data.summary.slice(0, 800));
>>>>>>> 6e7f6127dba9d8884cd7f1957c7e4521c678ab0f
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

<<<<<<< HEAD
function buildFinancialSection(
  financials: ToolResult<Awaited<ReturnType<typeof getFinancialStatements>>["data"]> | null,
  segmentRevenue: ToolResult<Awaited<ReturnType<typeof getSegmentRevenue>>["data"]> | null,
): ResearchSection {
=======
function buildFinancialSection(financials: ToolResult<Awaited<ReturnType<typeof getFinancialStatements>>["data"]> | null): ResearchSection {
>>>>>>> 6e7f6127dba9d8884cd7f1957c7e4521c678ab0f
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

<<<<<<< HEAD
  const segmentTable: ReportTable[] =
    segmentRevenue && segmentRevenue.data.mentions.length > 0
      ? [
          {
            headers: ["Segment/Channel (as disclosed)", "Value Cited", "Source"],
            rows: segmentRevenue.data.mentions
              .slice(0, 3)
              .flatMap((m) => m.labeledValues.slice(0, 6).map((lv) => [lv.label, lv.raw, (() => { try { return new URL(m.url).hostname; } catch { return m.url; } })()])),
          },
        ]
      : [];

  const mergedFinancialCitations = dedupeCitations([...financials.citations, ...(segmentRevenue?.citations ?? [])]);

=======
>>>>>>> 6e7f6127dba9d8884cd7f1957c7e4521c678ab0f
  const d = financials.data;
  if (d.status === "not_available") {
    return {
      title: "Financial Snapshot",
      summary: `**Status:** Not Available\n\n**Reason:** ${d.reason}\n\n- Recommended sources to check manually: ${d.recommendedSources.join(", ")}`,
<<<<<<< HEAD
      tables: segmentTable,
      citations: mergedFinancialCitations,
=======
      tables: [],
      citations: financials.citations,
>>>>>>> 6e7f6127dba9d8884cd7f1957c7e4521c678ab0f
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
<<<<<<< HEAD
      tables: [table, ...segmentTable],
      citations: mergedFinancialCitations,
=======
      tables: [table],
      citations: financials.citations,
>>>>>>> 6e7f6127dba9d8884cd7f1957c7e4521c678ab0f
      confidence: financials.confidence,
      metadata: { tone: "info", label: "Unaudited Press-Reported Estimate" },
    };
  }

<<<<<<< HEAD
  const tables: ReportTable[] = [...segmentTable];
=======
  const tables: ReportTable[] = [];
>>>>>>> 6e7f6127dba9d8884cd7f1957c7e4521c678ab0f
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

<<<<<<< HEAD
  if (d.quarterlyStatements && d.quarterlyStatements.length > 0) {
    const qPeriods = d.quarterlyStatements.map((s) => s.period);
    tables.push({
      headers: ["Quarterly Trend", ...qPeriods],
      rows: [
        ["Revenue", ...d.quarterlyStatements.map((s) => fmt(s.incomeStatement.revenue))],
        ["EBITDA", ...d.quarterlyStatements.map((s) => fmt(s.incomeStatement.ebitda))],
        ["Net Profit", ...d.quarterlyStatements.map((s) => fmt(s.incomeStatement.netProfit))],
      ],
    });
  }

  if (d.marketRatios && Object.keys(d.marketRatios).length > 0) {
    const wanted = ["Current Price", "Market Cap", "Stock P/E", "Book Value", "ROCE", "ROE", "Dividend Yield", "Face Value"];
    const rows = wanted
      .filter((k) => d.marketRatios![k] !== undefined && d.marketRatios![k] !== null)
      .map((k) => [k, fmt(d.marketRatios![k])]);
    if (rows.length > 0) {
      tables.push({ headers: ["Market Metric (screener.in, point-in-time)", "Value"], rows });
    }
  }

  if (d.projection) {
    tables.push({
      headers: ["Line Item", ...d.projection.periods.map((p) => p.period)],
      rows: [
        ["Revenue (projected)", ...d.projection.periods.map((p) => fmt(p.revenue))],
        ["EBITDA (projected)", ...d.projection.periods.map((p) => fmt(p.ebitda))],
        ["EBITDA Margin %", ...d.projection.periods.map((p) => fmt(p.ebitdaMargin))],
        ["Net Profit (projected)", ...d.projection.periods.map((p) => fmt(p.netProfit))],
        ["Net Profit Margin %", ...d.projection.periods.map((p) => fmt(p.netProfitMargin))],
      ],
    });
  }

  const trendLine = d.trend
    ? `**Revenue CAGR:** ${fmt(d.trend.revenueCagr)}%  **Net Profit CAGR:** ${fmt(d.trend.netProfitCagr)}% (${d.trend.periodsAnalyzed}-period trailing)\n\n`
    : "";
  const projectionNote = d.projection ? `> **Trend-Extrapolated Projections:** ${d.projection.disclosure}\n\n` : "";
=======
  const trendLine = d.trend
    ? `**Revenue CAGR:** ${fmt(d.trend.revenueCagr)}%  **Net Profit CAGR:** ${fmt(d.trend.netProfitCagr)}% (${d.trend.periodsAnalyzed}-period trailing)\n\n`
    : "";
>>>>>>> 6e7f6127dba9d8884cd7f1957c7e4521c678ab0f
  const plausibilityNote = d.plausibilityIssues
    ? `\n\n> Accounting-identity checks flagged ${Object.keys(d.plausibilityIssues).length} period(s) for review (see \`plausibilityIssues\`) — treat those figures with caution pending verification against the primary filing.`
    : "";

  return {
    title: "Financial Snapshot",
<<<<<<< HEAD
    summary: `**Source:** ${humanizeExtractionMethod(d.extractionMethod)}\n**Primary Source:** ${d.primarySourceUrl}\n\n${trendLine}${projectionNote}${plausibilityNote}`,
    tables,
    citations: mergedFinancialCitations,
=======
    summary: `**Source:** ${humanizeExtractionMethod(d.extractionMethod)}\n**Primary Source:** ${d.primarySourceUrl}\n\n${trendLine}${plausibilityNote}`,
    tables,
    citations: financials.citations,
>>>>>>> 6e7f6127dba9d8884cd7f1957c7e4521c678ab0f
    confidence: financials.confidence,
    metadata: {},
  };
}

<<<<<<< HEAD
function buildIndustrySection(
  industry: ToolResult<Awaited<ReturnType<typeof getIndustryOverview>>["data"]> | null,
  marketSize: ToolResult<Awaited<ReturnType<typeof getMarketSize>>["data"]> | null,
): ResearchSection | null {
  if (!industry && !marketSize) return null;

  const tables: ReportTable[] = [];
  if (marketSize && marketSize.data.estimates.length > 0) {
    tables.push({
      headers: ["Market Size Cited", "CAGR Cited", "Source"],
      rows: marketSize.data.estimates.slice(0, 8).map((e) => {
        let hostname = e.url;
        try {
          hostname = new URL(e.url).hostname;
        } catch {
          // keep raw url if unparsable
        }
        const sizes = e.marketSizeValues.map((v) => v.raw).join(" / ") || "N/A";
        return [sizes, e.cagrPercent !== null ? `${e.cagrPercent}%` : "N/A", hostname];
      }),
    });
  }

  const summaryParts: string[] = [];
  if (industry?.data.summary) summaryParts.push(industry.data.summary);
  else if (industry) summaryParts.push("No qualitative industry-level coverage was found in the trusted source set for this sector — worth a manual check against a consulting/market-research house directly.");

  const citations = dedupeCitations([...(industry?.citations ?? []), ...(marketSize?.citations ?? [])]);

  return {
    title: "Industry Overview — Macro Research",
    summary: summaryParts.join("\n\n") || "No industry-level coverage was found in the trusted source set for this sector.",
    tables,
    citations,
    confidence: aggregateConfidence(citations),
=======
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
>>>>>>> 6e7f6127dba9d8884cd7f1957c7e4521c678ab0f
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

<<<<<<< HEAD
function buildShareholdingSection(shareholding: ToolResult<Awaited<ReturnType<typeof getShareholdingPattern>>["data"]> | null): ResearchSection | null {
  if (!shareholding) return null;
  if (!shareholding.data.latestByCategory) {
    return {
      title: "Shareholding Pattern",
      summary: "No shareholding-pattern figures were found in the trusted source set — check screener.in or the exchange's shareholding-pattern filing directly.",
      tables: [],
      citations: shareholding.citations,
      confidence: 0,
      metadata: { tone: "warning", label: "Not Available" },
    };
  }
  const table: ReportTable = {
    headers: ["Category", "% Holding"],
    rows: Object.entries(shareholding.data.latestByCategory).map(([k, v]) => [k.charAt(0).toUpperCase() + k.slice(1), `${v}%`]),
  };
  return {
    title: "Shareholding Pattern",
    summary: "Pattern-extracted from screener.in/Trendlyne/exchange search results — verify against the source URL before quoting; not read from a structured filing field.",
    tables: [table],
    citations: shareholding.citations,
    confidence: shareholding.confidence,
    metadata: {},
  };
}

function buildManagementSection(management: ToolResult<Awaited<ReturnType<typeof getManagementProfile>>["data"]> | null): ResearchSection | null {
  if (!management || management.data.mentions.length === 0) return null;
  const lines = management.data.mentions
    .slice(0, 8)
    .map((m) => `- **${m.designationsFound.join(", ")}** — [${m.title}](${m.url})`);
  return {
    title: "Management & Board",
    summary: `${lines.join("\n")}\n\nNames and bios are read out of narrative search snippets, not a structured filing field — cross-check identity against the source URL before quoting, especially for common names.`,
    tables: [],
    citations: management.citations,
    confidence: management.confidence,
    metadata: {},
  };
}

function buildManagementCommentarySection(commentary: ToolResult<Awaited<ReturnType<typeof getManagementCommentary>>["data"]> | null): ResearchSection | null {
  if (!commentary || commentary.data.mentions.length === 0) return null;
  const lines = commentary.data.mentions
    .slice(0, 6)
    .map((m) => `- [${m.title}](${m.url})${m.publishedDate ? ` — ${m.publishedDate.slice(0, 10)}` : ""}\n  ${m.guidanceSnippets.slice(0, 2).join(" / ")}`);
  return {
    title: "Management Commentary & Guidance",
    summary: `${lines.join("\n")}\n\nGuidance-shaped fragments from press coverage of earnings calls, not verified transcript quotes — attribute to the covering outlet unless the source itself is the transcript.`,
    tables: [],
    citations: commentary.citations,
    confidence: commentary.confidence,
    metadata: {},
  };
}

function buildConsensusSection(consensus: ToolResult<Awaited<ReturnType<typeof getConsensusEstimates>>["data"]> | null): ResearchSection | null {
  if (!consensus || consensus.data.brokerageCalls.length === 0) return null;
  const table: ReportTable = {
    headers: ["Brokerage", "Rating", "Target Price"],
    rows: consensus.data.brokerageCalls.slice(0, 10).map((c) => [c.brokerage, c.rating ?? "N/A", c.targetPrice]),
  };
  return {
    title: "Brokerage Target Prices (Not a Consensus Feed)",
    summary: `${consensus.data.brokerageCalls.length} individual brokerage call(s) found in press coverage. Range: ${consensus.data.targetPriceRange ? `${consensus.data.targetPriceRange.low} - ${consensus.data.targetPriceRange.high}` : "N/A"}. **This is NOT a Bloomberg/Refinitiv-style consensus** — it's whatever individual calls happened to be covered in press search results. This server has no paid market-data subscription; treat this as "a few brokerages have said", never as "the Street expects".`,
    tables: [table],
    citations: consensus.citations,
    confidence: consensus.confidence,
    metadata: { tone: "info", label: "Best-Effort, Not Consensus Data" },
  };
}

=======
>>>>>>> 6e7f6127dba9d8884cd7f1957c7e4521c678ab0f
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
<<<<<<< HEAD
    for (const c of litigation.data.cases.slice(0, 8)) {
=======
    for (const c of litigation.data.cases.slice(0, 3)) {
>>>>>>> 6e7f6127dba9d8884cd7f1957c7e4521c678ab0f
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

<<<<<<< HEAD
/** Renders the auto-run DCF + scenario analysis (see autoValuation.ts) as
 * its own report section — real arithmetic over disclosed, mostly
 * company-derived assumptions, not the analyst's final judgment call. Kept
 * deliberately distinct from the "Valuation Call" ai_interpretation
 * section the analyst checklist still asks the calling model to write: that
 * section is where a human/LLM view overrides these defaults with its own
 * assumptions (via dcf_valuation/scenario_analysis directly); this section
 * is just "what does the company's own trend, discounted mechanically,
 * say" so a quant baseline is never silently missing from the report. */
function buildValuationSection(valuation: AutoValuationResult | null): ResearchSection | null {
  if (!valuation) return null;
  const { assumptions, disclosures, dcf, scenario, sensitivityGrid, currentMarketPrice } = valuation;
  const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "N/A" : String(v));
  const pctFmt = (v: number) => `${(v * 100).toFixed(1)}%`;

  const tables: ReportTable[] = [
    {
      headers: ["Assumption", "Value"],
      rows: [
        ["Base Revenue (Rs Cr)", fmt(assumptions.baseRevenue)],
        ["Revenue Growth Path (Yr 1 -> Yr 5)", assumptions.revenueGrowthPath.map(pctFmt).join(" / ")],
        ["EBITDA Margin Path", assumptions.ebitdaMarginPath.map(pctFmt).join(" / ")],
        ["D&A % of Revenue", pctFmt(assumptions.daPctRevenue as number)],
        ["Capex % of Revenue", pctFmt(assumptions.capexPctRevenue as number)],
        ["Incremental NWC % of Revenue Change", pctFmt(assumptions.incrementalNwcPctRevenueChange as number)],
        ["Tax Rate", pctFmt(assumptions.taxRate)],
        ["WACC", pctFmt(assumptions.wacc)],
        ["Terminal Growth Rate", pctFmt(assumptions.terminalGrowthRate)],
        ["Net Debt (Rs Cr)", fmt(assumptions.netDebt)],
        ["Shares Outstanding (Cr)", fmt(assumptions.sharesOutstanding)],
      ],
    },
    {
      headers: ["Scenario", "Fair Value / Share (Rs)", "Enterprise Value (Rs Cr)", "Equity Value (Rs Cr)"],
      rows: [
        ["Bear", fmt(scenario.bear.fairValuePerShare), fmt(scenario.bear.enterpriseValue), fmt(scenario.bear.equityValue)],
        ["Base", fmt(scenario.base.fairValuePerShare), fmt(scenario.base.enterpriseValue), fmt(scenario.base.equityValue)],
        ["Bull", fmt(scenario.bull.fairValuePerShare), fmt(scenario.bull.enterpriseValue), fmt(scenario.bull.equityValue)],
      ],
    },
  ];

  if (sensitivityGrid) {
    tables.push({
      headers: ["WACC \\ Terminal Growth", ...sensitivityGrid.cells[0].map((c) => pctFmt(c.columnValue))],
      rows: sensitivityGrid.cells.map((row) => [
        pctFmt(row[0].rowValue),
        ...row.map((cell) => (cell.valid ? fmt(cell.fairValuePerShare) : "n/m")),
      ]),
    });
  }

  const priceLine = currentMarketPrice !== null ? `**Current Market Price:** Rs ${currentMarketPrice}\n\n` : "";
  const issuesNote = dcf.issues.length > 0 ? `\n\n> Model flagged: ${dcf.issues.join("; ")}` : "";

  return {
    title: "Quantitative Valuation — DCF & Scenario Analysis (Default Assumptions)",
    summary:
      `${priceLine}This is a mechanically-run DCF, not the analyst's final valuation call — see the assumption table below for exactly which inputs came from this company's own filings versus a disclosed default, and re-run \`dcf_valuation\`/\`scenario_analysis\` directly to substitute your own view on any of them.\n\n` +
      disclosures.map((d) => `- ${d}`).join("\n") +
      issuesNote,
    tables,
    citations: [],
    confidence: 0.6,
    metadata: { tone: "info", label: "Default-Assumption DCF" },
  };
}

=======
>>>>>>> 6e7f6127dba9d8884cd7f1957c7e4521c678ab0f
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
<<<<<<< HEAD
    "- **Bull & Bear Case** — the upside and downside narrative. The 'Quantitative Valuation' section above already gives you a real base/bull/bear DCF band computed off this company's own numbers (default assumptions, disclosed) — ground your narrative in those figures rather than restating them as prose alone.",
    "- **Valuation Call** — your own fair-value view. Don't just restate the default-assumption DCF above: state where you'd override its assumptions (growth path, WACC, terminal growth) with your own judgment and why, and — if a clean listed peer exists — run `comparables_valuation` too. If you agree with the default assumptions, say so explicitly rather than leaving it ambiguous whether this is your view or the server's default.",
=======
    "- **Bull & Bear Case** — the upside and downside narrative, ideally backed by `scenario_analysis`'s base/bull/bear DCF output rather than prose alone.",
    "- **Valuation Call** — a fair-value view built on `dcf_valuation` and/or `comparables_valuation`, with your own assumptions stated and reasoned, not defaulted by this server.",
>>>>>>> 6e7f6127dba9d8884cd7f1957c7e4521c678ab0f
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
<<<<<<< HEAD
    .slice(0, 12)
=======
    .slice(0, 5)
>>>>>>> 6e7f6127dba9d8884cd7f1957c7e4521c678ab0f
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
<<<<<<< HEAD
    shareholdingSettled,
    managementSettled,
    financialsSettled,
    segmentRevenueSettled,
    industrySettled,
    marketSizeSettled,
=======
    financialsSettled,
    industrySettled,
>>>>>>> 6e7f6127dba9d8884cd7f1957c7e4521c678ab0f
    competitorsSettled,
    fundingSettled,
    litigationSettled,
    promoterSettled,
    negativeNewsSettled,
    newsSettled,
<<<<<<< HEAD
    managementCommentarySettled,
    consensusSettled,
  ] = await Promise.allSettled([
    getCompanyProfile(baseContext),
    getCompanyOverview(baseContext),
    getShareholdingPattern(baseContext),
    getManagementProfile(baseContext),
    getFinancialStatements(baseContext),
    getSegmentRevenue(baseContext),
    getIndustryOverview(baseContext),
    getMarketSize(baseContext),
=======
  ] = await Promise.allSettled([
    getCompanyProfile(baseContext),
    getCompanyOverview(baseContext),
    getFinancialStatements(baseContext),
    getIndustryOverview(baseContext),
>>>>>>> 6e7f6127dba9d8884cd7f1957c7e4521c678ab0f
    getDiscoverCompetitors(baseContext),
    getFundingHistory(baseContext),
    getLitigationHistory(baseContext),
    getPromoterBackground(baseContext),
    getNegativeNews(baseContext),
    getLatestNews(baseContext, 180),
<<<<<<< HEAD
    getManagementCommentary(baseContext),
    getConsensusEstimates(baseContext),
=======
>>>>>>> 6e7f6127dba9d8884cd7f1957c7e4521c678ab0f
  ]);

  const profile = unwrap(profileSettled, "company_profile", phaseErrors);
  const overview = unwrap(overviewSettled, "company_overview", phaseErrors);
<<<<<<< HEAD
  const shareholding = unwrap(shareholdingSettled, "shareholding_pattern", phaseErrors);
  const management = unwrap(managementSettled, "management_profile", phaseErrors);
  const financials = unwrap(financialsSettled, "financial_statements", phaseErrors);
  const segmentRevenue = unwrap(segmentRevenueSettled, "segment_revenue", phaseErrors);
  const industry = unwrap(industrySettled, "industry_overview", phaseErrors);
  const marketSize = unwrap(marketSizeSettled, "market_size", phaseErrors);
=======
  const financials = unwrap(financialsSettled, "financial_statements", phaseErrors);
  const industry = unwrap(industrySettled, "industry_overview", phaseErrors);
>>>>>>> 6e7f6127dba9d8884cd7f1957c7e4521c678ab0f
  const competitors = unwrap(competitorsSettled, "discover_competitors", phaseErrors);
  const funding = unwrap(fundingSettled, "funding_history", phaseErrors);
  const litigation = unwrap(litigationSettled, "litigation_history", phaseErrors);
  const promoter = unwrap(promoterSettled, "promoter_background", phaseErrors);
  const negativeNews = unwrap(negativeNewsSettled, "negative_news", phaseErrors);
  const news = unwrap(newsSettled, "latest_news", phaseErrors);
<<<<<<< HEAD
  const managementCommentary = unwrap(managementCommentarySettled, "management_commentary", phaseErrors);
  const consensus = unwrap(consensusSettled, "consensus_estimates", phaseErrors);

  let autoValuation: AutoValuationResult | null = null;
  if (financials?.data.status === "available" && financials.data.statements.length > 0) {
    try {
      autoValuation = buildAutoValuation(financials.data.statements, financials.data.marketRatios);
    } catch (err) {
      phaseErrors.push({ phase: "auto_valuation", message: err instanceof Error ? err.message : String(err) });
    }
  }

  const sections: ResearchSection[] = [
    buildCompanySnapshotSection(profile, overview),
    buildShareholdingSection(shareholding),
    buildManagementSection(management),
    buildFinancialSection(financials, segmentRevenue),
    buildValuationSection(autoValuation),
    buildIndustrySection(industry, marketSize),
    buildCompetitorSection(competitors),
    buildFundingSection(funding),
    buildRiskScreeningSection(litigation, promoter, negativeNews),
    buildManagementCommentarySection(managementCommentary),
    buildNewsSection(news),
    buildConsensusSection(consensus),
=======

  const sections: ResearchSection[] = [
    buildCompanySnapshotSection(profile, overview),
    buildFinancialSection(financials),
    buildIndustrySection(industry),
    buildCompetitorSection(competitors),
    buildFundingSection(funding),
    buildRiskScreeningSection(litigation, promoter, negativeNews),
    buildNewsSection(news),
>>>>>>> 6e7f6127dba9d8884cd7f1957c7e4521c678ab0f
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
