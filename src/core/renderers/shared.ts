export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escapes text, then applies inline **bold** and *italic* markers. Called
 * on already-line-split text by renderMarkdownSummary, never on raw
 * unescaped input directly. */
function formatInline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, "<em>$1</em>");
}

/** Renders a small markdown subset used by ResearchSection summaries:
 * paragraphs, "- "/"* " bullet lists, "> " blockquotes, and inline bold/
 * italic emphasis. This is deliberately not a full markdown parser —
 * section summaries are LLM-composed prose, not arbitrary documents, and
 * this covers the patterns that actually show up (a bolded key figure
 * followed by a bullet list of highlights, an occasional caveat
 * blockquote). Plain text with no markdown still renders correctly as a
 * single paragraph. */
export function renderMarkdownSummary(raw: string): string {
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let quote: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(`<p>${formatInline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push(`<ul>${list.map((item) => `<li>${formatInline(item)}</li>`).join("")}</ul>`);
      list = [];
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      blocks.push(`<blockquote>${quote.map((line) => `<p>${formatInline(line)}</p>`).join("")}</blockquote>`);
      quote = [];
    }
  };

  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trim();
    if (line === "") {
      flushParagraph();
      flushList();
      flushQuote();
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      flushQuote();
      list.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushParagraph();
      flushList();
      quote.push(line.replace(/^>\s?/, ""));
      continue;
    }
    flushList();
    flushQuote();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  flushQuote();

  return blocks.join("\n");
}
