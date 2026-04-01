/**
 * Test @cmdop/core — HTTP API, OAuth, machines, workspaces
 * This is the browser-side SDK used by @cmdop/react
 */
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').trim().split('\n')) {
    if (line.includes('=') && !line.startsWith('#')) {
      const [k, ...v] = line.split('=');
      process.env[k.trim()] = v.join('=').trim();
    }
  }
}

const CMDOP_KEY = process.env.CMDOP_KEY;

// @cmdop/core is auto-installed as dependency of @cmdop/node
const core = require("@cmdop/core");

console.log("=== @cmdop/core Exploration ===\n");

// 1. List all exports
console.log("1. @cmdop/core exports:");
const exportNames = Object.keys(core).sort();
console.log(`   Total: ${exportNames.length}`);
for (const name of exportNames) {
  const type = typeof core[name];
  console.log(`   ${name}: ${type}`);
}

// 2. Constants
console.log(`\n2. Constants:`);
console.log(`   API_BASE_URL: ${core.API_BASE_URL}`);
console.log(`   DEFAULT_CONFIG: ${JSON.stringify(core.DEFAULT_CONFIG)}`);
console.log(`   VERSION: ${core.VERSION}`);

// 3. Machines module
console.log(`\n3. Machines module:`);
const m = core.machines;
console.log(`   Type: ${typeof m}`);
if (m) {
  for (const key of Object.keys(m)) {
    console.log(`   machines.${key}: ${typeof m[key]}`);
  }
  // Check machines_machines
  if (m.machines_machines) {
    console.log(`\n   machines.machines_machines methods:`);
    for (const key of Object.keys(m.machines_machines)) {
      console.log(`     ${key}: ${typeof m.machines_machines[key]}`);
    }
  }
}

// 4. System module (OAuth)
console.log(`\n4. System module:`);
const sys = core.system;
if (sys) {
  for (const key of Object.keys(sys)) {
    console.log(`   system.${key}: ${typeof sys[key]}`);
  }
  // Check system_oauth
  if (sys.system_oauth) {
    console.log(`\n   system.system_oauth methods:`);
    for (const key of Object.keys(sys.system_oauth)) {
      console.log(`     ${key}: ${typeof sys.system_oauth[key]}`);
    }
  }
}

// 5. Workspaces module
console.log(`\n5. Workspaces module:`);
const ws = core.workspaces;
if (ws) {
  for (const key of Object.keys(ws)) {
    console.log(`   workspaces.${key}: ${typeof ws[key]}`);
  }
}

// 6. API module
console.log(`\n6. api module:`);
const api = core.api;
if (api) {
  for (const key of Object.keys(api)) {
    console.log(`   api.${key}: ${typeof api[key]}`);
  }
}

// 7. Test OAuth Device Code
async function testOAuth() {
  console.log(`\n7. OAuth Device Code Flow test:`);

  const API_BASE = core.API_BASE_URL || "https://api.cmdop.com";
  console.log(`   API_BASE: ${API_BASE}`);

  // Request device code
  console.log(`\n   POST ${API_BASE}/api/system/oauth/device/`);
  try {
    const resp = await fetch(`${API_BASE}/api/system/oauth/device/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: "cmdop-desktop" }),
    });
    console.log(`   Status: ${resp.status}`);
    const data = await resp.json();
    console.log(`   Response: ${JSON.stringify(data, null, 2)}`);

    if (data.device_code) {
      console.log(`\n   ==============================`);
      console.log(`   USER CODE: ${data.user_code}`);
      console.log(`   Open: ${data.verification_uri}?code=${data.user_code}`);
      console.log(`   Expires in: ${data.expires_in}s`);
      console.log(`   ==============================`);

      // Poll a few times
      console.log(`\n   Polling for token (2 attempts, ${data.interval}s interval)...`);
      for (let i = 0; i < 2; i++) {
        await new Promise(r => setTimeout(r, data.interval * 1000));
        const tokenResp = await fetch(`${API_BASE}/api/system/oauth/token/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            device_code: data.device_code,
            client_id: "cmdop-desktop",
          }),
        });
        const tokenData = await tokenResp.json();
        console.log(`   [${i+1}] Status: ${tokenResp.status}`);
        if (tokenData.access_token) {
          console.log(`   SUCCESS! Token: ${tokenData.access_token.slice(0, 20)}...`);
          console.log(`   Full: ${JSON.stringify(tokenData)}`);

          // Test machines API with this token
          return tokenData.access_token;
        } else {
          console.log(`   ${tokenData.error || tokenData.detail || JSON.stringify(tokenData)}`);
        }
      }
    }
  } catch (err) {
    console.log(`   FAILED: ${err.message}`);
  }
  return null;
}

// 8. Test HTTP API with API key (to see if it works)
async function testHTTPWithApiKey() {
  console.log(`\n8. HTTP API with API key (cmd_...):`);

  const API_BASE = core.API_BASE_URL || "https://api.cmdop.com";

  // Try machines
  console.log(`\n   GET ${API_BASE}/api/machines/machines/`);
  try {
    const resp = await fetch(`${API_BASE}/api/machines/machines/`, {
      headers: { "Authorization": `Bearer ${CMDOP_KEY}` }
    });
    console.log(`   Status: ${resp.status}`);
    const data = await resp.json();
    console.log(`   Response: ${JSON.stringify(data).slice(0, 500)}`);
  } catch (err) {
    console.log(`   FAILED: ${err.message}`);
  }

  // Try with Token header
  console.log(`\n   GET ${API_BASE}/api/machines/machines/ (Token header)`);
  try {
    const resp = await fetch(`${API_BASE}/api/machines/machines/`, {
      headers: { "Authorization": `Token ${CMDOP_KEY}` }
    });
    console.log(`   Status: ${resp.status}`);
    const data = await resp.json();
    console.log(`   Response: ${JSON.stringify(data).slice(0, 500)}`);
  } catch (err) {
    console.log(`   FAILED: ${err.message}`);
  }

  // Try with api-key header
  console.log(`\n   GET ${API_BASE}/api/machines/machines/ (x-api-key)`);
  try {
    const resp = await fetch(`${API_BASE}/api/machines/machines/`, {
      headers: { "x-api-key": CMDOP_KEY }
    });
    console.log(`   Status: ${resp.status}`);
    const data = await resp.json();
    console.log(`   Response: ${JSON.stringify(data).slice(0, 500)}`);
  } catch (err) {
    console.log(`   FAILED: ${err.message}`);
  }
}

async function main() {
  await testHTTPWithApiKey();
  await testOAuth();
  console.log("\n=== DONE ===");
}

main().catch(console.error);
