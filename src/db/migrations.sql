-- INDUSS Research MCP — optional history/audit schema.
-- Applied automatically by docker-compose's postgres init mount; run manually
-- against DATABASE_URL otherwise.

CREATE TABLE IF NOT EXISTS research_queries (
    id BIGSERIAL PRIMARY KEY,
    tool_name TEXT NOT NULL,
    params JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS research_results (
    id BIGSERIAL PRIMARY KEY,
    query_id BIGINT NOT NULL REFERENCES research_queries(id) ON DELETE CASCADE,
    success BOOLEAN NOT NULL,
    data JSONB,
    citations JSONB NOT NULL DEFAULT '[]'::jsonb,
    confidence NUMERIC(4, 3),
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_queries_tool_name ON research_queries (tool_name);
CREATE INDEX IF NOT EXISTS idx_research_queries_created_at ON research_queries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_results_query_id ON research_results (query_id);

CREATE TABLE IF NOT EXISTS generated_reports (
    id BIGSERIAL PRIMARY KEY,
    company_name TEXT,
    report_title TEXT NOT NULL,
    format TEXT NOT NULL CHECK (format IN ('json', 'markdown', 'html', 'pdf', 'docx')),
    storage_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
