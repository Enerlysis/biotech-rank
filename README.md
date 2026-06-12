# PDUFA Biotech Watchlist - Vercel + OpenAI

This is a minimal one-click Vercel website that calls the OpenAI Responses API with web search and returns a ranked biotech PDUFA watchlist.

## What it does

- Shows one button: **Rank PDUFA Watchlist**.
- Calls `/api/analyze` server-side.
- Uses OpenAI with the hosted `web_search` tool.
- Searches for OMER/RCKT/FBIO-style biotech companies:
  1. Upcoming PDUFA/FDA action date after the current date.
  2. Similar market-cap style where possible.
  3. Better financial health, runway, and lower dilution risk.
  4. Regulatory quality, CMC/CRL/AdCom risk.
  5. Clinical data quality.
  6. Commercial opportunity and unmet need.
  7. Partnerships/governance.
  8. Liquidity/share-structure risk.
- Sorts results by closest PDUFA date first.
- Renders a table instead of showing raw JSON.

## Important limitation

This is a research assistant, not a financial advisor. It must not be treated as a buy/sell engine. PDUFA dates, market caps, runway, and dilution risk must be verified using primary sources such as company IR releases, SEC EDGAR, FDA sources, and ClinicalTrials.gov.

## Local setup

```bash
npm install
npm i -g vercel
vercel dev
```

Create a `.env.local` file:

```bash
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.4-mini
```

Then open:

```text
http://localhost:3000
```

## Deploy on Vercel

1. Push this folder to GitHub.
2. Import the repo in Vercel.
3. Add Environment Variables:
   - `OPENAI_API_KEY`
   - optional: `OPENAI_MODEL`
4. Deploy.

## Why the API key is server-side

Never expose your OpenAI API key in frontend HTML or JavaScript. The browser only calls the Vercel serverless API route.
