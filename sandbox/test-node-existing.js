/**
 * Test CMDOP Node.js SDK — use existing connected session
 */
const { CMDOPClient } = require("@cmdop/node");

const CMDOP_KEY = process.env.CMDOP_KEY;

async function main() {
  console.log("=== CMDOP: Test with existing sessions ===\n");

  const client = await CMDOPClient.remote(CMDOP_KEY);
  console.log(`Connected to ${client.address}\n`);

  // List all sessions
  const { sessions } = await client.terminal.list();
  console.log("All sessions:");
  for (const s of sessions) {
    console.log(`  ${s.sessionId} | ${s.status} | ${s.machineName} (${s.hostname})`);
  }

  // Find connected sessions
  const connected = sessions.filter(s => s.status === "connected");
  console.log(`\nConnected sessions: ${connected.length}`);

  if (connected.length === 0) {
    console.log("No connected sessions. Machine agent might be offline.");
    await client.close();
    return;
  }

  // Try the first connected session
  const session = connected[0];
  console.log(`\nUsing session: ${session.sessionId} (${session.machineName})`);

  // Get status
  console.log("\nGetting status...");
  try {
    const status = await client.terminal.getStatus(session.sessionId);
    console.log("Status:", JSON.stringify(status, null, 2));
  } catch (err) {
    console.error("Get status failed:", err.message);
  }

  // Send input
  console.log("\nSending: 'echo CMDOP-TEST-OK'...");
  try {
    await client.terminal.sendInput(session.sessionId, "echo CMDOP-TEST-OK\n");
    console.log("Input sent OK!");
  } catch (err) {
    console.error("Send input failed:", err.message);
  }

  // Wait and check
  await new Promise(r => setTimeout(r, 2000));

  console.log("\nGetting status after input...");
  try {
    const status = await client.terminal.getStatus(session.sessionId);
    console.log("Status:", JSON.stringify(status, null, 2));
  } catch (err) {
    console.error("Get status failed:", err.message);
  }

  // Also try the suenotpc machine specifically
  const suenotpc = sessions.find(s => s.hostname === "suenotpc" || s.machineName?.toLowerCase().includes("suenotpc"));
  if (suenotpc) {
    console.log(`\n--- suenotpc session: ${suenotpc.sessionId} | ${suenotpc.status} ---`);
    try {
      const status = await client.terminal.getStatus(suenotpc.sessionId);
      console.log("Status:", JSON.stringify(status, null, 2));
    } catch (err) {
      console.error("suenotpc status failed:", err.message);
    }

    if (suenotpc.status === "connected") {
      console.log("Sending input to suenotpc...");
      try {
        await client.terminal.sendInput(suenotpc.sessionId, "echo SUENOTPC-OK\n");
        console.log("Input sent to suenotpc OK!");
      } catch (err) {
        console.error("Send input to suenotpc failed:", err.message);
      }
    } else {
      console.log("suenotpc is not connected — agent might be offline on that machine");
    }
  }

  await client.close();
  console.log("\nDone.");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
