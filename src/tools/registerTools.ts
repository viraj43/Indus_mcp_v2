import type { FastMCP } from "fastmcp";
import { registerSearchCompanyTool } from "./company/searchCompany.js";
import { registerCompanyProfileTool } from "./company/companyProfile.js";
import { registerCompanyOverviewTool } from "./company/companyOverview.js";
import { registerFinancialStatementsTool } from "./financial/financialStatements.js";
import { registerRatioAnalysisTool } from "./financial/ratioAnalysis.js";
import { registerDcfValuationTool } from "./valuation/dcfValuation.js";
import { registerComparablesValuationTool } from "./valuation/comparablesValuation.js";
import { registerScenarioAnalysisTool } from "./valuation/scenarioAnalysis.js";
import { registerRedFlagScreenTool } from "./valuation/redFlagScreen.js";
import { registerFundingHistoryTool } from "./funding/fundingHistory.js";
import { registerDiscoverCompetitorsTool } from "./competitor/discoverCompetitors.js";
import { registerListedPeerComparisonTool } from "./competitor/listedPeerComparison.js";
import { registerIndustryOverviewTool } from "./industry/industryOverview.js";
import { registerMarketSizeTool } from "./industry/marketSize.js";
import { registerLatestNewsTool } from "./news/latestNews.js";
import { registerNegativeNewsTool } from "./news/negativeNews.js";
import { registerLitigationHistoryTool } from "./litigation/litigationHistory.js";
import { registerPromoterBackgroundTool } from "./promoter/promoterBackground.js";
import { registerGenerateReportTool } from "./report/generateReport.js";
import { registerGenerateInstitutionalReportTool } from "./report/generateInstitutionalReport.js";
import { registerGenerateMarkdownTool } from "./export/generateMarkdown.js";
import { registerGeneratePdfTool } from "./export/generatePdf.js";
import { registerHealthCheckTool } from "./health/healthCheck.js";

/** Central tool registry. Every MCP tool the server exposes is wired up
 * here so src/index.ts stays a thin bootstrap file. */
export function registerAllTools(server: FastMCP): void {
  // Company Intelligence
  registerSearchCompanyTool(server);
  registerCompanyProfileTool(server);
  registerCompanyOverviewTool(server);

  // Financial Intelligence
  registerFinancialStatementsTool(server);
  registerRatioAnalysisTool(server);

  // Valuation & Risk (mechanical calculation, no search — see design note
  // in core/reports/analystNote.ts: these tools compute, they don't judge)
  registerDcfValuationTool(server);
  registerComparablesValuationTool(server);
  registerScenarioAnalysisTool(server);
  registerRedFlagScreenTool(server);

  // Funding Intelligence
  registerFundingHistoryTool(server);

  // Competitor Intelligence
  registerDiscoverCompetitorsTool(server);
  registerListedPeerComparisonTool(server);

  // Industry Intelligence
  registerIndustryOverviewTool(server);
  registerMarketSizeTool(server);

  // News Intelligence
  registerLatestNewsTool(server);
  registerNegativeNewsTool(server);

  // Litigation & Compliance
  registerLitigationHistoryTool(server);

  // Promoter Intelligence
  registerPromoterBackgroundTool(server);

  // Report Generation
  registerGenerateReportTool(server);
  registerGenerateInstitutionalReportTool(server);

  // PDF & Export
  registerGenerateMarkdownTool(server);
  registerGeneratePdfTool(server);

  // Ops
  registerHealthCheckTool(server);
}
