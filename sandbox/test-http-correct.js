/**
 * Test CMDOP HTTP API — correct paths
 */
const CMDOP_KEY = process.env.CMDOP_KEY;
const API = "https://api.cmdop.com";

async function main() {
  console.log("=== CMDOP HTTP API (correct paths) ===\n");

  // GET /api/machines/machines/
  console.log("1. GET /api/machines/machines/");
  try {
    const res = await fetch(`${API}/api/machines/machines/`, {
      headers: {
        "Authorization": `Bearer ${CMDOP_KEY}`,
        "Content-Type": "application/json",
      },
    });
    console.log(`   Status: ${res.status}`);
    if (res.ok) {
      const data = await res.json();
      console.log("   Response:", JSON.stringify(data, null, 2));
    } else {
      const text = await res.text();
      console.log("   Error:", text.slice(0, 300));
    }
  } catch (err) {
    console.error("   Failed:", err.message);
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
