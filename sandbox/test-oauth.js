/**
 * Test CMDOP OAuth — try to exchange API key for JWT token
 */
const CMDOP_KEY = process.env.CMDOP_KEY;
const API = "https://api.cmdop.com";

async function main() {
  console.log("=== CMDOP OAuth Test ===\n");

  // Try 1: POST to /api/system/oauth/token/ with API key
  console.log("1. POST /api/system/oauth/token/ with API key as grant...");
  try {
    const res = await fetch(`${API}/api/system/oauth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "api_key",
        api_key: CMDOP_KEY,
      }),
    });
    console.log(`   Status: ${res.status}`);
    const data = await res.text();
    console.log(`   Response: ${data.slice(0, 500)}`);
  } catch (err) {
    console.error("   Failed:", err.message);
  }

  // Try 2: Use API key as Bearer to get token info
  console.log("\n2. GET /api/system/oauth/token/info/ with API key as Bearer...");
  try {
    const res = await fetch(`${API}/api/system/oauth/token/info/`, {
      headers: {
        "Authorization": `Bearer ${CMDOP_KEY}`,
        "Content-Type": "application/json",
      },
    });
    console.log(`   Status: ${res.status}`);
    const data = await res.text();
    console.log(`   Response: ${data.slice(0, 500)}`);
  } catch (err) {
    console.error("   Failed:", err.message);
  }

  // Try 3: Device code flow
  console.log("\n3. POST /api/system/oauth/device/code/ ...");
  try {
    const res = await fetch(`${API}/api/system/oauth/device/code/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "ccam-test",
        client_version: "0.1.0",
      }),
    });
    console.log(`   Status: ${res.status}`);
    const data = await res.text();
    console.log(`   Response: ${data.slice(0, 500)}`);
  } catch (err) {
    console.error("   Failed:", err.message);
  }

  // Try 4: Check if API key works as API key header for machines
  console.log("\n4. GET /api/machines/machines/ with X-Api-Key...");
  try {
    const res = await fetch(`${API}/api/machines/machines/`, {
      headers: {
        "X-Api-Key": CMDOP_KEY,
        "Content-Type": "application/json",
      },
    });
    console.log(`   Status: ${res.status}`);
    const data = await res.text();
    console.log(`   Response: ${data.slice(0, 500)}`);
  } catch (err) {
    console.error("   Failed:", err.message);
  }

  // Try 5: Check Centrifugo-specific token endpoint
  console.log("\n5. POST /api/system/centrifugo/token/ ...");
  try {
    const res = await fetch(`${API}/api/system/centrifugo/token/`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CMDOP_KEY}`,
        "Content-Type": "application/json",
      },
    });
    console.log(`   Status: ${res.status}`);
    const data = await res.text();
    console.log(`   Response: ${data.slice(0, 500)}`);
  } catch (err) {
    console.error("   Failed:", err.message);
  }

  // Try 6: Check /api/system/ws/token/
  console.log("\n6. POST /api/system/ws/token/ ...");
  try {
    const res = await fetch(`${API}/api/system/ws/token/`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CMDOP_KEY}`,
        "Content-Type": "application/json",
      },
    });
    console.log(`   Status: ${res.status}`);
    const data = await res.text();
    console.log(`   Response: ${data.slice(0, 500)}`);
  } catch (err) {
    console.error("   Failed:", err.message);
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
