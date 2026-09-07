/** Human-readable names for domains, used to render an evidence checklist
 * ("Checked: MCA, SEBI, NCLT, Indian Kanoon...") instead of raw hostnames.
 * Falls back to the domain itself when unmapped, so this never blocks on
 * being kept perfectly in sync with sources/*. */
const DOMAIN_LABELS: Record<string, string> = {
  "mca.gov.in": "MCA",
  "zaubacorp.com": "Zauba Corp",
  "tofler.in": "Tofler",
  "opencorporates.com": "OpenCorporates",
  "indiafilings.com": "IndiaFilings",
  "sec.gov": "SEC",
  "linkedin.com": "LinkedIn",
  "crunchbase.com": "Crunchbase",
  "finmin.gov.in": "Ministry of Finance",
  "niti.gov.in": "NITI Aayog",
  "rbi.org.in": "RBI",
  "imf.org": "IMF",
  "worldbank.org": "World Bank",
  "mospi.gov.in": "MOSPI",
  "reuters.com": "Reuters",
  "economictimes.indiatimes.com": "Economic Times",
  "livemint.com": "Mint",
  "business-standard.com": "Business Standard",
  "moneycontrol.com": "Moneycontrol",
  "deloitte.com": "Deloitte",
  "pwc.com": "PwC",
  "ey.com": "EY",
  "kpmg.com": "KPMG",
  "mckinsey.com": "McKinsey",
  "bain.com": "Bain",
  "bcg.com": "BCG",
  "imarcgroup.com": "IMARC",
  "statista.com": "Statista",
  "nasscom.in": "NASSCOM",
  "nseindia.com": "NSE",
  "bseindia.com": "BSE",
  "sebi.gov.in": "SEBI",
  "nclt.gov.in": "NCLT",
  "indiankanoon.org": "Indian Kanoon",
  "livelaw.in": "LiveLaw",
  "barandbench.com": "Bar & Bench",
  "screener.in": "Screener.in",
  "trendlyne.com": "Trendlyne",
  "aceanalyser.com": "Ace Equity",
  "capitaliq.spglobal.com": "Capital IQ",
  "pitchbook.com": "Pitchbook",
  "dealroom.co": "Dealroom",
  "craft.co": "Craft.co",
  "owler.com": "Owler",
  "tracxn.com": "Tracxn",
  "glassdoor.com": "Glassdoor",
  "reddit.com": "Reddit",
};

export function labelForDomain(domain: string): string {
  return DOMAIN_LABELS[domain] ?? domain;
}

export function labelDomains(domains: string[]): string[] {
  return domains.map(labelForDomain);
}
