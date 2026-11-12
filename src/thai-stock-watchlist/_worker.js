// Cloudflare Pages Advanced Mode Worker — same-origin proxy for Yahoo Finance.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/chart") return yahooChart(request, url);
    if (url.pathname === "/api/fundamentals") return yahooFundamentals(request, url);
    return env.ASSETS.fetch(request);
  },
};

const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "*",
};

function symbol(url) {
  return (url.searchParams.get("symbol") || "").toUpperCase().replace(/[^A-Z0-9.\-=^]/g, "");
}

async function proxyYahoo(path, cacheTtl) {
  for (const host of ["query1", "query2"]) {
    try {
      const upstream = await fetch(`https://${host}.finance.yahoo.com${path}`, {
        headers: { "user-agent": "Mozilla/5.0", accept: "application/json,text/plain,*/*" },
        cf: { cacheTtl, cacheEverything: true },
      });
      const body = await upstream.text();
      if (upstream.ok && body.startsWith("{")) {
        return new Response(body, { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": `public, max-age=${cacheTtl}`, ...headers } });
      }
    } catch (_) { /* try the next Yahoo host */ }
  }
  return new Response(JSON.stringify({ error: "Yahoo Finance is unavailable" }), { status: 502, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
}

function yahooChart(request, url) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  const ticker = symbol(url);
  const range = (url.searchParams.get("range") || "1y").replace(/[^a-z0-9]/gi, "");
  const interval = (url.searchParams.get("interval") || "1d").replace(/[^a-z0-9]/gi, "");
  const events = (url.searchParams.get("events") || "").replace(/[^a-z,]/gi, "");
  if (!ticker) return new Response(JSON.stringify({ error: "missing symbol" }), { status: 400, headers });
  return proxyYahoo(`/v8/finance/chart/${ticker}?range=${range}&interval=${interval}${events ? `&events=${events}` : ""}`, 60);
}

function yahooFundamentals(request, url) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  const ticker = symbol(url);
  if (!ticker) return new Response(JSON.stringify({ error: "missing symbol" }), { status: 400, headers });
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - 8 * 365 * 86400;
  const types = [
    "trailingPeRatio", "trailingEps", "trailingMarketCap",
    "quarterlyDilutedEPS", "annualDilutedEPS",
    "quarterlyOperatingIncome", "annualOperatingIncome",
    "quarterlyTotalAssets", "annualTotalAssets",
    "quarterlyTotalDebt", "annualTotalDebt",
    "quarterlyStockholdersEquity", "annualStockholdersEquity",
  ].join(",");
  return proxyYahoo(`/ws/fundamentals-timeseries/v1/finance/timeseries/${ticker}?type=${types}&period1=${period1}&period2=${period2}`, 21600);
}
