import { searchCompanyMeta } from "./company/searchCompany.js";
import { companyProfileMeta } from "./company/companyProfile.js";
import { companyOverviewMeta } from "./company/companyOverview.js";
import { financialStatementsMeta } from "./financial/financialStatements.js";
import { ratioAnalysisMeta } from "./financial/ratioAnalysis.js";
import { dcfValuationMeta } from "./valuation/dcfValuation.js";
import { comparablesValuationMeta } from "./valuation/comparablesValuation.js";
import { scenarioAnalysisMeta } from "./valuation/scenarioAnalysis.js";
import { redFlagScreenMeta } from "./valuation/redFlagScreen.js";
import { fundingHistoryMeta } from "./funding/fundingHistory.js";
import { discoverCompetitorsMeta } from "./competitor/discoverCompetitors.js";
import { listedPeerComparisonMeta } from "./competitor/listedPeerComparison.js";
import { industryOverviewMeta } from "./industry/industryOverview.js";
import { marketSizeMeta } from "./industry/marketSize.js";
import { latestNewsMeta } from "./news/latestNews.js";
import { negativeNewsMeta } from "./news/negativeNews.js";
import { litigationHistoryMeta } from "./litigation/litigationHistory.js";
import { promoterBackgroundMeta } from "./promoter/promoterBackground.js";
import { generateReportMeta } from "./report/generateReport.js";
import { generateInstitutionalReportMeta } from "./report/generateInstitutionalReport.js";
import { generateMarkdownMeta } from "./export/generateMarkdown.js";
import { generatePdfMeta } from "./export/generatePdf.js";
import type { ToolMeta } from "../types/toolMeta.js";

/** Every tool's self-description, aggregated in one place. Kept in its own
 * module (rather than inside registerTools.ts) so health_check can import
 * it without creating a circular dependency with the tool files. Useful
 * for auto-generated docs and capability discovery once the tool count
 * grows well past 15. */
export const TOOL_REGISTRY: ToolMeta[] = [
  searchCompanyMeta,
  companyProfileMeta,
  companyOverviewMeta,
  financialStatementsMeta,
  ratioAnalysisMeta,
  dcfValuationMeta,
  comparablesValuationMeta,
  scenarioAnalysisMeta,
  redFlagScreenMeta,
  fundingHistoryMeta,
  discoverCompetitorsMeta,
  listedPeerComparisonMeta,
  industryOverviewMeta,
  marketSizeMeta,
  latestNewsMeta,
  negativeNewsMeta,
  litigationHistoryMeta,
  promoterBackgroundMeta,
  generateReportMeta,
  generateInstitutionalReportMeta,
  generateMarkdownMeta,
  generatePdfMeta,
];
