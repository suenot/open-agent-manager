/**
 * Test CMDOP Node.js SDK — connect to remote machine via gRPC relay
 */
async function main() {
  const { CMDOPClient } = await import("@cmdop/node");

  const CMDOP_KEY = process.env.CMDOP_KEY;
  const CMDOP_MACHINE = process.env.CMDOP_MACHINE;

  if (!CMDOP_KEY) {
    console.error("ERROR: CMDOP_KEY env var is not set");
    process.exit(1);
  }

  console.log("=== CMDOP Node.js SDK Test ===");
  console.log(`API Key: ${CMDOP_KEY.slice(0, 8)}...`);
  console.log(`Machine: ${CMDOP_MACHINE || "(not specified)"}`);
  console.log("");

  // Step 1: Connect
  console.log("1. Connecting to remote via CMDOPClient.remote()...");
  let client;
  try {
    client = await CMDOPClient.remote(CMDOP_KEY);
    console.log(`   Connected: ${client.isConnected}`);
    console.log(`   Address: ${client.address}`);
  } catch (err) {
    console.error("   FAILED to connect:", err.message);
    process.exit(1);
  }

  // Step 2: Health check
  console.log("\n2. Health check...");
  try {
    const health = await client.healthCheck();
    console.log("   Health:", JSON.stringify(health, null, 2));
  } catch (err) {
    console.error("   Health check failed:", err.message);
  }

  // Step 3: List sessions
  console.log("\n3. Listing sessions...");
  try {
    const result = await client.terminal.list();
    console.log(`   Workspace: ${result.workspaceName}`);
    console.log(`   Total sessions: ${result.total}`);
    for (const s of result.sessions) {
      console.log(`   - ${s.sessionId} | ${s.status} | ${s.hostname || "?"} | ${s.machineName || "?"} | shell=${s.shell || "?"}`);
    }
  } catch (err) {
    console.error("   List sessions failed:", err.message);
  }

  // Step 4: Create session
  console.log("\n4. Creating terminal session...");
  let sessionId;
  try {
    const session = await client.terminal.create({
      name: "ccam-test",
      cols: 80,
      rows: 24,
    });
    sessionId = session.sessionId;
    console.log(`   Session created: ${sessionId}`);
    console.log(`   Shell: ${session.shell}`);
    console.log(`   Status: ${session.status}`);
    console.log(`   Hostname: ${session.hostname}`);
    console.log(`   WorkingDir: ${session.workingDir}`);
  } catch (err) {
    console.error("   Create session failed:", err.message);
    console.error("   Full error:", err);
  }

  // Step 5: Send input (if session created)
  if (sessionId) {
    console.log("\n5. Sending input: 'echo hello-cmdop'...");
    try {
      await client.terminal.sendInput(sessionId, "echo hello-cmdop\n");
      console.log("   Input sent OK");
    } catch (err) {
      console.error("   Send input failed:", err.message);
    }

    // Step 6: Get status
    console.log("\n6. Getting session status...");
    try {
      const status = await client.terminal.getStatus(sessionId);
      console.log("   Status:", JSON.stringify(status, null, 2));
    } catch (err) {
      console.error("   Get status failed:", err.message);
    }

    // Step 7: Close session
    console.log("\n7. Closing session...");
    try {
      await client.terminal.close(sessionId);
      console.log("   Session closed OK");
    } catch (err) {
      console.error("   Close session failed:", err.message);
    }
  }

  // Cleanup
  console.log("\n8. Closing client...");
  await client.close();
  console.log("   Done.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
