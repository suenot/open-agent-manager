/**
 * Test CMDOP OAuth Device Code Flow
 * Gets JWT token for WebSocket/HTTP API
 */
const https = require("https");

const API_BASE = "https://api.cmdop.com";

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(path, API_BASE);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log("=== CMDOP OAuth Device Code Flow ===\n");

  // Step 1: Request device code
  console.log("1. Requesting device code...");
  const deviceResp = await post("/api/system/oauth/device/", {
    client_name: "ccam-test",
    client_version: "0.1.0",
    client_hostname: require("os").hostname(),
    client_platform: process.platform,
  });

  console.log(`   Status: ${deviceResp.status}`);
  console.log(`   Response: ${JSON.stringify(deviceResp.data, null, 2)}`);

  if (deviceResp.status !== 200 && deviceResp.status !== 201) {
    console.log("\n   Device code request failed!");

    // Try alternative paths
    console.log("\n   Trying /api/oauth/device/...");
    const alt1 = await post("/api/oauth/device/", {
      client_name: "ccam-test",
    });
    console.log(`   Status: ${alt1.status}, Response: ${JSON.stringify(alt1.data)}`);

    console.log("\n   Trying /api/v1/oauth/device/...");
    const alt2 = await post("/api/v1/oauth/device/", {
      client_name: "ccam-test",
    });
    console.log(`   Status: ${alt2.status}, Response: ${JSON.stringify(alt2.data)}`);

    return;
  }

  const { device_code, user_code, verification_uri, expires_in, interval } = deviceResp.data;

  console.log(`\n   ==============================`);
  console.log(`   USER CODE: ${user_code}`);
  console.log(`   Open: ${verification_uri}`);
  console.log(`   Expires in: ${expires_in}s`);
  console.log(`   ==============================\n`);

  // Step 2: Poll for token
  console.log(`2. Polling for token (every ${interval}s)...`);
  const maxAttempts = Math.floor(expires_in / interval);

  for (let i = 0; i < Math.min(maxAttempts, 60); i++) {
    await new Promise(r => setTimeout(r, interval * 1000));

    const tokenResp = await post("/api/system/oauth/token/", {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code,
    });

    if (tokenResp.status === 200) {
      console.log(`   [${i+1}] SUCCESS! Got token!`);
      console.log(`   Access token: ${tokenResp.data.access_token?.slice(0, 20)}...`);
      console.log(`   Refresh token: ${tokenResp.data.refresh_token?.slice(0, 20)}...`);
      console.log(`   Token type: ${tokenResp.data.token_type}`);
      console.log(`   Expires in: ${tokenResp.data.expires_in}s`);
      console.log(`   Scope: ${tokenResp.data.scope}`);

      // Save token for next test
      const fs = require("fs");
      fs.writeFileSync("cmdop-token.json", JSON.stringify(tokenResp.data, null, 2));
      console.log(`\n   Token saved to cmdop-token.json`);
      return;
    }

    const error = tokenResp.data.error || tokenResp.data;
    if (error === "authorization_pending" || error?.error === "authorization_pending") {
      process.stdout.write(`   [${i+1}] Pending... (open ${verification_uri} and enter ${user_code})\r`);
    } else if (error === "slow_down") {
      console.log(`   [${i+1}] Slow down...`);
      await new Promise(r => setTimeout(r, interval * 1000)); // Extra wait
    } else if (error === "expired_token" || error === "access_denied") {
      console.log(`   [${i+1}] ${error} — aborting`);
      return;
    } else {
      console.log(`   [${i+1}] Status ${tokenResp.status}: ${JSON.stringify(tokenResp.data)}`);
    }
  }

  console.log("\n   Timed out waiting for approval.");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
