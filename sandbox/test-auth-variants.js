/**
 * Test all CMDOP auth variants
 */
const CMDOP_KEY = process.env.CMDOP_KEY;
const API = "https://api.cmdop.com";

async function tryEndpoint(label, url, opts) {
  console.log(`${label}`);
  try {
    const res = await fetch(url, opts);
    console.log(`  Status: ${res.status}`);
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      console.log(`  Response:`, JSON.stringify(json, null, 2).slice(0, 300));
    } catch {
      console.log(`  Response: ${text.slice(0, 300)}`);
    }
  } catch (err) {
    console.error(`  Failed: ${err.message}`);
  }
  console.log("");
}

async function main() {
  console.log("=== CMDOP Auth Variants Test ===\n");

  // Try client_credentials
  await tryEndpoint("1. POST /api/system/oauth/token/ grant_type=client_credentials",
    `${API}/api/system/oauth/token/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "client_credentials", client_id: CMDOP_KEY }),
    }
  );

  // Try with authorization_code
  await tryEndpoint("2. POST /api/system/oauth/token/ no grant_type, just api_key",
    `${API}/api/system/oauth/token/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${CMDOP_KEY}` },
      body: JSON.stringify({}),
    }
  );

  // Try /api/system/auth/ endpoints
  for (const path of [
    "/api/system/auth/login/",
    "/api/system/auth/token/",
    "/api/system/token/",
    "/api/auth/token/",
    "/api/centrifugo/subscribe/",
    "/api/system/ws-token/",
  ]) {
    await tryEndpoint(`3. POST ${path}`,
      `${API}${path}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${CMDOP_KEY}` },
        body: JSON.stringify({ api_key: CMDOP_KEY }),
      }
    );
  }

  // Try WebSocket with Centrifugo proxy subscribe
  // Maybe the WS accepts API key in a different format
  await tryEndpoint("4. WS handshake via HTTP - Centrifugo connection test",
    `https://ws.cmdop.com/connection/info`,
    { headers: { "Authorization": `Bearer ${CMDOP_KEY}` } }
  );
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
