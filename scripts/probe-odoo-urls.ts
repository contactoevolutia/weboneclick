import "dotenv/config";

const urls = [
  "https://oneclick.adhoc.inc/jsonrpc",
  "https://oneclick.adhoc.ar/jsonrpc",
  "https://oneclick.adhoc.inc/web/jsonrpc",
  "https://oneclick.adhoc.ar/web/jsonrpc",
];

const body = JSON.stringify({
  jsonrpc: "2.0",
  method: "call",
  params: { service: "common", method: "version", args: [] },
  id: 1,
});

async function main() {
  for (const endpoint of urls) {
    const t0 = Date.now();
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body,
      });
      const raw = await res.text();
      const ok = raw.trimStart().startsWith("{");
      console.log(
        endpoint,
        "->",
        res.status,
        res.headers.get("content-type"),
        ok ? "JSON" : "HTML",
        `${Date.now() - t0}ms`,
        raw.slice(0, 100).replace(/\s+/g, " ")
      );
    } catch (e) {
      console.log(endpoint, "ERR", e instanceof Error ? e.message : e);
    }
  }
}

main().catch(console.error);
