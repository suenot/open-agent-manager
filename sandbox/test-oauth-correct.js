/**
 * Test OAuth Device Code Flow with CORRECT schema from @cmdop/core
 *
 * Key finding: @cmdop/core uses client_name (NOT client_id!)
 * DeviceCodeRequestRequestSchema: { client_name, client_version, client_hostname, client_platform }
 * TokenRequestRequestSchema: { grant_type, device_code, refresh_token } — NO client_id!
 */

async function main() {
  console.log("=== OAuth Test: @cmdop/core Schema (client_name) ===\n");

  // Step 1: Request device code using OFFICIAL schema
  console.log("1. Requesting device code with client_name (NOT client_id)...");
  const deviceResp = await fetch("https://api.cmdop.com/api/system/oauth/device/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "ccam",
      client_version: "0.1.0",
      client_hostname: require("os").hostname(),
      client_platform: process.platform,
    }),
  });
  const dc = await deviceResp.json();
  console.log(`   Status: ${deviceResp.status}`);
  console.log(`   device_code: ${dc.device_code?.slice(0, 20)}...`);
  console.log(`   user_code: ${dc.user_code}`);
  console.log(`   verification_uri: ${dc.verification_uri}`);

  if (!dc.device_code) {
    console.log("   FAILED to get device code!");
    return;
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`  CODE: ${dc.user_code}`);
  console.log(`  OPEN: ${dc.verification_uri}`);
  console.log(`${"=".repeat(50)}`);
  console.log(`\nОткрой ссылку и введи код. Жду до ${dc.expires_in}с...\n`);

  // Step 2: Poll for token — WITHOUT client_id (matching @cmdop/core schema)
  const interval = (dc.interval || 5) * 1000;
  const deadline = Date.now() + dc.expires_in * 1000;
  let attempt = 0;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, interval));
    attempt++;

    const tokenResp = await fetch("https://api.cmdop.com/api/system/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: dc.device_code,
        // NO client_id — matching @cmdop/core TokenRequestRequestSchema
      }),
    });
    const data = await tokenResp.json();

    if (data.access_token) {
      console.log(`\n[${attempt}] SUCCESS!\n`);
      console.log(`access_token prefix: "${data.access_token.slice(0, 6)}"`);
      console.log(`access_token full:   ${data.access_token}`);
      console.log(`refresh_token prefix: "${data.refresh_token?.slice(0, 7)}"`);
      console.log(`refresh_token full:   ${data.refresh_token}`);
      console.log(`expires_in:          ${data.expires_in}s`);
      console.log(`token_type:          ${data.token_type}`);
      console.log(`scope:               ${data.scope}`);

      if (data.access_token.startsWith("clit_")) {
        console.log(`\n✅ Token has clit_ prefix — CORRECT for WebSocket!`);
      } else if (data.access_token.startsWith("cmdop_")) {
        console.log(`\n❌ Token has cmdop_ prefix — WRONG! WebSocket will reject.`);
      } else {
        console.log(`\n⚠️ Unknown token prefix: ${data.access_token.slice(0, 10)}`);
      }

      // Save token
      require("fs").writeFileSync(
        require("path").join(__dirname, ".jwt-token-correct"),
        JSON.stringify(data, null, 2)
      );
      console.log(`\nСохранено в sandbox/.jwt-token-correct`);
      return;
    }

    if (data.error === "expired_token" || data.error === "access_denied") {
      console.log(`[${attempt}] ${data.error} — aborting`);
      return;
    }

    process.stdout.write(`[${attempt}] Жду подтверждения... \r`);
  }

  console.log("\nТаймаут!");
}

main().catch(console.error);
