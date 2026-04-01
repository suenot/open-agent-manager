/**
 * Test CMDOP Node.js SDK — getHistory + polling approach
 */
const { CMDOPClient } = require("@cmdop/node");

const CMDOP_KEY = process.env.CMDOP_KEY;

async function main() {
  console.log("=== CMDOP Node.js getHistory Test ===\n");

  // 1. Connect
  console.log("1. Connecting...");
  const client = await CMDOPClient.remote(CMDOP_KEY);
  console.log(`   Connected: ${client.isConnected}`);

  // 2. List sessions
  console.log("\n2. Listing sessions...");
  const { sessions, total, workspaceName } = await client.terminal.list();
  console.log(`   Workspace: ${workspaceName}`);
  console.log(`   Total: ${total}`);

  const connected = sessions.find(s => s.status === "connected");
  if (!connected) {
    console.log("   No connected sessions!");
    await client.close();
    return;
  }

  const sessionId = connected.sessionId;
  console.log(`   Using: ${sessionId} (${connected.machineName})`);

  // 3. Get history BEFORE sending input
  console.log("\n3. Getting history (before input)...");
  try {
    const history = await client.terminal.getHistory(sessionId);
    console.log(`   History response:`, JSON.stringify(history, null, 2).slice(0, 500));
  } catch (err) {
    console.log(`   getHistory failed: ${err.message}`);
  }

  // 4. Send input
  const marker = `NODE-HISTORY-${Date.now()}`;
  console.log(`\n4. Sending: echo ${marker}`);
  try {
    await client.terminal.sendInput(sessionId, `echo ${marker}\n`);
    console.log("   Sent OK");
  } catch (err) {
    console.log(`   sendInput failed: ${err.message}`);
  }

  // 5. Poll getHistory
  console.log("\n5. Polling getHistory (5 attempts, 1s interval)...");
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const history = await client.terminal.getHistory(sessionId);
      const data = history.data || history.output || history.commands || history;
      const text = typeof data === 'string' ? data :
                   Buffer.isBuffer(data) ? data.toString('utf-8') :
                   JSON.stringify(data);

      if (text.includes(marker)) {
        console.log(`   [${i+1}] FOUND marker in history!`);
        const idx = text.indexOf(marker);
        console.log(`   Context: ${text.slice(Math.max(0, idx - 100), idx + marker.length + 100)}`);
        break;
      } else {
        console.log(`   [${i+1}] Length=${text.length}, marker not found`);
        if (i === 0) {
          console.log(`   Full response keys: ${Object.keys(history || {})}`);
          console.log(`   Full response: ${JSON.stringify(history).slice(0, 300)}`);
        }
      }
    } catch (err) {
      console.log(`   [${i+1}] Failed: ${err.message}`);
    }
  }

  // 6. Try getStatus — maybe there's output there
  console.log("\n6. Getting session status...");
  try {
    const status = await client.terminal.getStatus(sessionId);
    console.log(`   Status: ${JSON.stringify(status, null, 2)}`);
  } catch (err) {
    console.log(`   getStatus failed: ${err.message}`);
  }

  // 7. Explore all available methods on the stub
  console.log("\n7. Exploring terminal service methods...");
  const ts = client.terminal;
  for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(ts))) {
    if (!name.startsWith('_') && name !== 'constructor') {
      console.log(`   ${name}`);
    }
  }

  // 8. Check if there's a way to get websocket token
  console.log("\n8. Checking for websocket/token methods on client...");
  for (const key of Object.keys(client)) {
    console.log(`   client.${key}: ${typeof client[key]}`);
  }
  // Check prototype
  for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(client))) {
    if (!name.startsWith('_') && name !== 'constructor') {
      console.log(`   client.${name}(): ${typeof client[name]}`);
    }
  }

  // 9. Try to get auth/token info from internal transport
  console.log("\n9. Checking transport/internal state...");
  try {
    const transport = client._transport || client.transport;
    if (transport) {
      console.log(`   Transport keys: ${Object.keys(transport)}`);
      for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(transport))) {
        if (!key.startsWith('_')) {
          console.log(`   transport.${key}: ${typeof transport[key]}`);
        }
      }
    }
  } catch (err) {
    console.log(`   Transport access failed: ${err.message}`);
  }

  // Cleanup
  console.log("\n10. Closing...");
  await client.close();
  console.log("   Done.");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
