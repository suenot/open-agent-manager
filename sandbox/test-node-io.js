/**
 * Test CMDOP: send input + try to get output via WebSocket subscription
 */
const { CMDOPClient } = require("@cmdop/node");

const CMDOP_KEY = process.env.CMDOP_KEY;

async function main() {
  console.log("=== CMDOP: Input/Output test ===\n");

  const client = await CMDOPClient.remote(CMDOP_KEY);

  // List and pick session
  const { sessions } = await client.terminal.list();

  // Try suenotpc first
  const suenotpc = sessions.find(s => s.hostname === "suenotpc");
  const macbook = sessions.find(s => s.status === "connected");

  // Try suenotpc (BACKGROUND)
  if (suenotpc) {
    console.log(`suenotpc session: ${suenotpc.sessionId} | status: ${suenotpc.status}`);
    console.log("Trying to send input to suenotpc (BACKGROUND)...");
    try {
      await client.terminal.sendInput(suenotpc.sessionId, "echo SUENOTPC-TEST\n");
      console.log("Input sent to suenotpc OK!");
    } catch (err) {
      console.error("suenotpc input failed:", err.message);
    }
  }

  // macbook (connected)
  if (macbook) {
    console.log(`\nmacbook session: ${macbook.sessionId} | status: ${macbook.status}`);

    // Send and try resize
    console.log("Sending 'whoami' ...");
    try {
      await client.terminal.sendInput(macbook.sessionId, "whoami\n");
      console.log("Input sent OK");
    } catch (err) {
      console.error("macbook input failed:", err.message);
    }

    // Resize
    console.log("Resizing to 120x40...");
    try {
      await client.terminal.resize(macbook.sessionId, 120, 40);
      console.log("Resize OK");
    } catch (err) {
      console.error("Resize failed:", err.message);
    }
  }

  // Now, the key question: how to get OUTPUT?
  // The Node SDK uses gRPC (not WebSocket), so output may come via:
  // 1. A streaming gRPC call
  // 2. We need to check if TerminalService has a stream method

  // Let's explore what methods the client's terminal service has
  console.log("\n--- Terminal service methods ---");
  const termService = client.terminal;
  const proto = Object.getPrototypeOf(termService);
  const methods = Object.getOwnPropertyNames(proto).filter(m => m !== "constructor");
  console.log("Methods:", methods);

  await client.close();
  console.log("\nDone.");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
