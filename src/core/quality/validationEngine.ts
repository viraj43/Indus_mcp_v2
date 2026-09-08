import type { FinancialStatement } from "../financial/financialEngine.js";

/** Domain-specific validation beyond Zod's structural type checks — used
 * by tools to sanity-check extracted facts before trusting them, since a
 * value can be the right *shape* (a string, a number) while still being
 * garbage (a malformed CIN, an accounting identity that doesn't hold). This
 * is the Validator stage of the Universal Search Pipeline (see
 * core/pipeline/searchPipeline.ts) — it will grow to cover hallucination
 * detection, citation completeness, and other QA checks over time. */

const CIN_PATTERN = /^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/;

/** Validates the Indian Corporate Identification Number format:
 * L/U + 5-digit industry code + 2-letter state + 4-digit year + 3-letter
 * ownership class + 6-digit registration number. */
export function isValidCIN(value: string): boolean {
  return CIN_PATTERN.test(value.trim());
}

export interface PlausibilityIssue {
  field: string;
  message: string;
}

/** Sanity-checks a FinancialStatement against basic accounting identities
 * (EBITDA can't exceed revenue, equity can't exceed assets, etc.) so
 * extraction errors surface as flagged issues instead of being silently
 * fed into ratio calculations. Returns an empty array when nothing looks
 * wrong. */
export function checkFinancialPlausibility(
  statement: Pick<FinancialStatement, "incomeStatement" | "balanceSheet">,
): PlausibilityIssue[] {
  const { incomeStatement: is, balanceSheet: bs } = statement;
  const issues: PlausibilityIssue[] = [];

  if (is.revenue <= 0) {
    issues.push({ field: "incomeStatement.revenue", message: "Revenue must be positive." });
  }
  if (is.ebitda !== undefined && is.ebitda > is.revenue) {
    issues.push({ field: "incomeStatement.ebitda", message: "EBITDA cannot exceed total revenue." });
  }
  if (is.netProfit !== undefined && is.ebitda !== undefined && is.netProfit > is.ebitda) {
    issues.push({ field: "incomeStatement.netProfit", message: "Net profit exceeds EBITDA — verify source figures." });
  }
  if (bs.totalDebt !== undefined && bs.totalDebt < 0) {
    issues.push({ field: "balanceSheet.totalDebt", message: "Total debt cannot be negative." });
  }
  if (bs.totalAssets !== undefined && bs.totalEquity !== undefined && bs.totalEquity > bs.totalAssets) {
    issues.push({ field: "balanceSheet.totalEquity", message: "Total equity cannot exceed total assets." });
  }

  return issues;
}
