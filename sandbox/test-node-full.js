/**
 * Full Node.js SDK (@cmdop/node) exploration
 * Tests ALL available methods and documents results
 */
const fs = require('fs');
const path = require('path');
// Load .env manually
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').trim().split('\n')) {
    if (line.includes('=') && !line.startsWith('#')) {
      const [k, ...v] = line.split('=');
      process.env[k.trim()] = v.join('=').trim();
    }
  }
}
const { CMDOPClient } = require("@cmdop/node");

const CMDOP_KEY = process.env.CMDOP_KEY;
const CMDOP_MACHINE = process.env.CMDOP_MACHINE;

function log(section, msg) {
  console.log(`[${section}] ${msg}`);
}

async function main() {
  console.log("=== CMDOP Node.js SDK — Full Exploration ===");
  console.log(`API Key: ${CMDOP_KEY?.slice(0, 12)}...`);
  console.log(`Machine: ${CMDOP_MACHINE}\n`);

  // =============== 1. CONNECTION ===============
  log("CONNECT", "Connecting with CMDOPClient.remote()...");
  const client = await CMDOPClient.remote(CMDOP_KEY);
  log("CONNECT", `isConnected: ${client.isConnected}`);
  log("CONNECT", `mode: ${client.mode}`);

  // Explore client properties
  log("CONNECT", "Client properties:");
  for (const key of Object.keys(client)) {
    log("CONNECT", `  client.${key}: ${typeof client[key]}`);
  }
  log("CONNECT", "Client prototype methods:");
  for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(client))) {
    if (!name.startsWith('_') && name !== 'constructor') {
      log("CONNECT", `  client.${name}(): ${typeof client[name]}`);
    }
  }

  // =============== 2. TERMINAL SERVICE ===============
  log("TERMINAL", "Exploring terminal service methods...");
  const ts = client.terminal;
  for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(ts))) {
    if (!name.startsWith('_') && name !== 'constructor') {
      log("TERMINAL", `  terminal.${name}(): ${typeof ts[name]}`);
    }
  }

  // =============== 3. LIST SESSIONS ===============
  log("LIST", "Listing sessions...");
  try {
    const listResult = await client.terminal.list();
    log("LIST", `Total sessions: ${listResult.total}`);
    log("LIST", `Workspace: ${listResult.workspaceName}`);
    log("LIST", `Sessions:`);
    for (const s of listResult.sessions) {
      log("LIST", `  ${s.sessionId} | status=${s.status} | machine=${s.machineName} | hostname=${s.hostname || 'n/a'} | os=${s.os || 'n/a'} | created=${s.createdAt || 'n/a'}`);
      // Dump ALL fields
      log("LIST", `    ALL FIELDS: ${JSON.stringify(s)}`);
    }

    // Find our machine
    const connected = listResult.sessions.find(s => s.status === "connected");
    if (!connected) {
      log("LIST", "No connected sessions found!");
      await client.close();
      return;
    }

    const sessionId = connected.sessionId;
    log("LIST", `\nUsing connected session: ${sessionId} (${connected.machineName})`);

    // =============== 4. GET STATUS ===============
    log("STATUS", `Getting status for ${sessionId}...`);
    try {
      const status = await client.terminal.getStatus(sessionId);
      log("STATUS", `Result: ${JSON.stringify(status, null, 2)}`);
    } catch (err) {
      log("STATUS", `Failed: ${err.message}`);
    }

    // =============== 5. GET HISTORY ===============
    log("HISTORY", `Getting history for ${sessionId}...`);
    try {
      const history = await client.terminal.getHistory(sessionId);
      log("HISTORY", `Result keys: ${Object.keys(history)}`);
      log("HISTORY", `Result: ${JSON.stringify(history).slice(0, 500)}`);
    } catch (err) {
      log("HISTORY", `Failed: ${err.message}`);
    }

    // =============== 6. SEND INPUT ===============
    const marker = `NODE-FULL-${Date.now()}`;
    log("INPUT", `Sending: echo ${marker}`);
    try {
      const result = await client.terminal.sendInput(sessionId, `echo ${marker}\n`);
      log("INPUT", `Result: ${JSON.stringify(result)}`);
    } catch (err) {
      log("INPUT", `Failed: ${err.message}`);
    }

    // =============== 7. RESIZE ===============
    log("RESIZE", `Resizing to 120x40...`);
    try {
      const result = await client.terminal.resize(sessionId, 120, 40);
      log("RESIZE", `Result: ${JSON.stringify(result)}`);
    } catch (err) {
      log("RESIZE", `Failed: ${err.message}`);
    }

    // =============== 8. POLL HISTORY FOR MARKER ===============
    log("POLL", "Polling history for marker (3 attempts)...");
    for (let i = 0; i < 3; i++) {
      await new Promise(r => setTimeout(r, 1500));
      try {
        const history = await client.terminal.getHistory(sessionId);
        const text = JSON.stringify(history);
        if (text.includes(marker)) {
          log("POLL", `[${i+1}] FOUND marker!`);
          break;
        } else {
          log("POLL", `[${i+1}] Not found. Length=${text.length}`);
        }
      } catch (err) {
        log("POLL", `[${i+1}] Failed: ${err.message}`);
      }
    }

    // =============== 9. EXECUTE ===============
    log("EXEC", "Testing execute('echo EXEC-TEST')...");
    try {
      const execResult = await client.terminal.execute(sessionId, "echo EXEC-TEST");
      log("EXEC", `Result: ${JSON.stringify(execResult)}`);
    } catch (err) {
      log("EXEC", `Failed: ${err.message}`);
    }

    // =============== 10. OTHER TERMINAL METHODS ===============
    log("OTHER", "Testing getActiveSession()...");
    try {
      const active = await client.terminal.getActiveSession(sessionId);
      log("OTHER", `getActiveSession: ${JSON.stringify(active)}`);
    } catch (err) {
      log("OTHER", `getActiveSession failed: ${err.message}`);
    }

    // =============== 11. TRANSPORT INTERNALS ===============
    log("TRANSPORT", "Exploring transport...");
    const transport = client._transport || client.transport;
    if (transport) {
      log("TRANSPORT", `Transport keys: ${Object.keys(transport)}`);
      for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(transport))) {
        if (!key.startsWith('_')) {
          log("TRANSPORT", `  transport.${key}: ${typeof transport[key]}`);
        }
      }
      // Check if there's URL info
      if (transport.url) log("TRANSPORT", `  URL: ${transport.url}`);
      if (transport.host) log("TRANSPORT", `  Host: ${transport.host}`);
      if (transport._host) log("TRANSPORT", `  _Host: ${transport._host}`);
    }

  } catch (err) {
    log("ERROR", `Failed: ${err.message}`);
    log("ERROR", err.stack);
  }

  // Cleanup
  log("DONE", "Closing...");
  await client.close();
  log("DONE", "Finished.");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
