import OpenAI from "openai";

const TODAY = "2026-06-12";

function cleanString(value, max = 1000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function extractJson(text) {
  if (!text || typeof text !== "string") {
    throw new Error("The model returned an empty response.");
  }

  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("The model did not return valid JSON. Try again.");
  }
}

function normalizeUrlSource(source) {
  if (!source) return null;
  if (typeof source === "string") {
    return { title: "Source", url: source, source_type: "web", why_it_matters: "Source used by the model." };
  }
  return {
    title: cleanString(source.title || source.name || "Source", 180),
    url: cleanString(source.url || source.link || "", 500),
    source_type: cleanString(source.source_type || source.type || "web", 80),
    why_it_matters: cleanString(source.why_it_matters || source.note || "Supports the catalyst, date, financial health, or risk assessment.", 240)
  };
}

function normalizeRow(row, index) {
  const sources = Array.isArray(row?.sources)
    ? row.sources.map(normalizeUrlSource).filter((s) => s && s.url)
    : [];

  return {
    rank: Number(row?.rank || index + 1),
    ticker: cleanString(row?.ticker || "", 20).toUpperCase(),
    company: cleanString(row?.company || "Unknown", 180),
    pdufa_date: cleanString(row?.pdufa_date || "Unknown", 40),
    days_until_pdufa: Number.isFinite(Number(row?.days_until_pdufa)) ? Number(row.days_until_pdufa) : null,
    market_cap_usd: cleanString(row?.market_cap_usd || "Unknown", 80),
    market_cap_similarity: cleanString(row?.market_cap_similarity || "Unknown", 120),
    drug: cleanString(row?.drug || "Unknown", 180),
    indication: cleanString(row?.indication || "Unknown", 240),
    application_type: cleanString(row?.application_type || "Unknown", 120),
    review_type: cleanString(row?.review_type || "Unknown", 120),
    cash_runway: cleanString(row?.cash_runway || "Unknown", 180),
    financial_health: cleanString(row?.financial_health || "Unknown", 80),
    dilution_risk: cleanString(row?.dilution_risk || "Unknown", 80),
    regulatory_risk: cleanString(row?.regulatory_risk || "Unknown", 120),
    catalyst_quality: cleanString(row?.catalyst_quality || "Unknown", 120),
    overall_health_score_0_100: Number.isFinite(Number(row?.overall_health_score_0_100)) ? Number(row.overall_health_score_0_100) : null,
    watchlist_view: cleanString(row?.watchlist_view || "Research watchlist candidate, not a buy recommendation.", 220),
    key_reasons: Array.isArray(row?.key_reasons) ? row.key_reasons.map((x) => cleanString(x, 220)).filter(Boolean).slice(0, 6) : [],
    red_flags: Array.isArray(row?.red_flags) ? row.red_flags.map((x) => cleanString(x, 220)).filter(Boolean).slice(0, 6) : [],
    sources
  };
}

function normalizeWatchlist(data, modelSources = []) {
  const rows = Array.isArray(data?.rows) ? data.rows.map(normalizeRow) : [];

  rows.sort((a, b) => {
    const ad = Date.parse(a.pdufa_date);
    const bd = Date.parse(b.pdufa_date);
    if (!Number.isNaN(ad) && !Number.isNaN(bd) && ad !== bd) return ad - bd;
    if (!Number.isNaN(ad) && Number.isNaN(bd)) return -1;
    if (Number.isNaN(ad) && !Number.isNaN(bd)) return 1;
    return (b.overall_health_score_0_100 || 0) - (a.overall_health_score_0_100 || 0);
  });

  const globalSources = [
    ...(Array.isArray(data?.sources) ? data.sources : []),
    ...(Array.isArray(modelSources) ? modelSources : [])
  ]
    .map(normalizeUrlSource)
    .filter((s) => s && s.url)
    .filter((s, idx, arr) => arr.findIndex((x) => x.url === s.url) === idx)
    .slice(0, 30);

  return {
    generated_at: new Date().toISOString(),
    as_of_date: TODAY,
    title: cleanString(data?.title || "PDUFA biotech watchlist", 140),
    summary: cleanString(
      data?.summary ||
        "Ranked upcoming PDUFA watchlist using catalyst proximity, market-cap similarity, financial health, regulatory risk, clinical quality, and dilution risk.",
      1200
    ),
    methodology_order: Array.isArray(data?.methodology_order)
      ? data.methodology_order.map((x) => cleanString(x, 180)).filter(Boolean).slice(0, 10)
      : [
          "1. Upcoming PDUFA/FDA decision date after today",
          "2. Similarity to OMER/RCKT/FBIO market-cap style",
          "3. Financial health, runway, and dilution risk",
          "4. Regulatory pathway, CMC risk, CRL/AdCom risk",
          "5. Clinical data quality and endpoint strength",
          "6. Commercial opportunity and unmet need",
          "7. Management credibility, partnerships, and governance",
          "8. Liquidity/share-structure risk"
        ],
    rows,
    excluded: Array.isArray(data?.excluded)
      ? data.excluded.map((x) => ({
          ticker: cleanString(x?.ticker || "", 20).toUpperCase(),
          reason: cleanString(x?.reason || "Excluded by screen.", 220)
        })).slice(0, 20)
      : [],
    warnings: Array.isArray(data?.warnings)
      ? data.warnings.map((x) => cleanString(x, 260)).filter(Boolean).slice(0, 10)
      : [
          "This is a research watchlist, not financial advice.",
          "Verify every PDUFA date and cash-runway figure from company filings and FDA/company releases before using it."
        ],
    sources: globalSources,
    disclaimer: "Research only. This does not tell users what to buy or sell. Verify primary sources and consider professional advice."
  };
}

function buildPrompt(extraNotes = "") {
  return `You are a biotech catalyst research analyst. Today is ${TODAY}.

Task:
Find public US-listed biotech companies similar in style to OMER, RCKT, and FBIO: upcoming FDA PDUFA/FDA action dates, micro/small/lower-mid cap when possible, and comparatively healthy financial runway. Arrange them by the closest future PDUFA/FDA decision date.

Do NOT give buy/sell instructions. Do NOT say "buy" or "what to buy". Return a research watchlist only.

Use this exact screening order:
1. Confirm an upcoming PDUFA/FDA action date after ${TODAY}. Prefer company IR press releases, SEC filings/exhibits, FDA pages, and trusted biotech/news sources.
2. Filter toward OMER/RCKT/FBIO style: roughly $100M-$1.5B market cap, but allow up to about $3B if the financial health/catalyst quality is clearly stronger.
3. Prioritize high health: cash runway, cash vs. burn, low immediate dilution risk, no going-concern warning, no obvious toxic financing.
4. Assess regulatory quality: clean NDA/BLA/sNDA, Priority Review/Orphan/Fast Track/Breakthrough, prior CRL history, AdCom risk, CMC/manufacturing risk.
5. Assess clinical data quality: pivotal data, endpoint strength, safety profile, population and comparator.
6. Assess commercial fit: rare disease/unmet need, competitive landscape, launch potential, voucher potential where relevant.
7. Assess governance/validation: partnerships, big pharma involvement, insider/institutional support, management credibility.
8. Assess liquidity/share structure: reverse split history, low float, warrants/ATM, trading liquidity.

Return 6 to 10 rows. Sort rows by nearest pdufa_date first, then higher overall_health_score_0_100.

For each row, include compact but specific source URLs. Do not invent dates or numbers. If a figure is uncertain, say "Needs verification".

Extra user note: ${cleanString(extraNotes, 800) || "None"}

Return valid JSON only with this shape:
{
  "title": "string",
  "summary": "string",
  "methodology_order": ["string"],
  "rows": [
    {
      "rank": 1,
      "ticker": "string",
      "company": "string",
      "pdufa_date": "YYYY-MM-DD",
      "days_until_pdufa": 0,
      "market_cap_usd": "string",
      "market_cap_similarity": "string",
      "drug": "string",
      "indication": "string",
      "application_type": "string",
      "review_type": "string",
      "cash_runway": "string",
      "financial_health": "Green | Yellow | Red",
      "dilution_risk": "Low | Medium | High",
      "regulatory_risk": "string",
      "catalyst_quality": "string",
      "overall_health_score_0_100": 0,
      "watchlist_view": "string",
      "key_reasons": ["string"],
      "red_flags": ["string"],
      "sources": [{"title":"string", "url":"string", "source_type":"company_ir|sec|fda|clinicaltrials|news|finance", "why_it_matters":"string"}]
    }
  ],
  "excluded": [{"ticker":"string", "reason":"string"}],
  "warnings": ["string"],
  "sources": [{"title":"string", "url":"string", "source_type":"string", "why_it_matters":"string"}],
  "disclaimer": "string"
}`;
}

export default async function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).json({ ok: true });
    if (req.method !== "POST") return res.status(405).json({ error: "Use POST /api/analyze." });

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "Missing OPENAI_API_KEY environment variable on the server. Add it in Vercel Project Settings → Environment Variables."
      });
    }

    const body = req.body || {};
    const extraNotes = cleanString(body.extraNotes || "", 800);
    const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await client.responses.create({
      model,
      input: buildPrompt(extraNotes),
      tools: [{ type: "web_search" }],
      tool_choice: "required"
    });

    const text = response.output_text || "";
    const parsed = extractJson(text);
    const output = normalizeWatchlist(parsed, response.sources || []);

    return res.status(200).json(output);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: error?.message || String(error),
      generated_at: new Date().toISOString(),
      as_of_date: TODAY,
      title: "PDUFA biotech watchlist",
      summary: "The server could not generate the watchlist. Check your OpenAI API key, model name, and whether the selected model supports the Responses API web_search tool.",
      methodology_order: [],
      rows: [],
      excluded: [],
      warnings: [error?.message || String(error)],
      sources: [],
      disclaimer: "Research only. This does not tell users what to buy or sell."
    });
  }
}
