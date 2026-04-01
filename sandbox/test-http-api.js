/**
 * Test CMDOP HTTP API — get machines and their active sessions
 */
const CMDOP_KEY = process.env.CMDOP_KEY;
const API = "https://api.cmdop.com";

async function fetchJSON(url, token) {
  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  console.log("=== CMDOP HTTP API Test ===\n");

  // Try machines endpoint
  console.log("1. GET /api/v1/machines/machines/");
  try {
    const data = await fetchJSON(`${API}/api/v1/machines/machines/`, CMDOP_KEY);
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Failed:", err.message);
  }

  // Try without /api/v1 prefix
  console.log("\n2. GET /machines/machines/");
  try {
    const data = await fetchJSON(`${API}/machines/machines/`, CMDOP_KEY);
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Failed:", err.message);
  }

  // Try with Token prefix
  console.log("\n3. GET /api/v1/machines/machines/ with Token prefix");
  try {
    const res = await fetch(`${API}/api/v1/machines/machines/`, {
      headers: {
        "Authorization": `Token ${CMDOP_KEY}`,
        "Content-Type": "application/json",
      },
    });
    const text = await res.text();
    console.log(`Status: ${res.status}`);
    console.log("Response:", text.slice(0, 500));
  } catch (err) {
    console.error("Failed:", err.message);
  }

  // Try API key in header
  console.log("\n4. GET /api/v1/machines/machines/ with X-Api-Key");
  try {
    const res = await fetch(`${API}/api/v1/machines/machines/`, {
      headers: {
        "X-Api-Key": CMDOP_KEY,
        "Content-Type": "application/json",
      },
    });
    const text = await res.text();
    console.log(`Status: ${res.status}`);
    console.log("Response:", text.slice(0, 500));
  } catch (err) {
    console.error("Failed:", err.message);
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
