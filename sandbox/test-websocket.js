/**
 * Test CMDOP WebSocket (Centrifugo) — connect, subscribe to terminal output, send input
 */
const { Centrifuge } = require("centrifuge");
const { CMDOPClient } = require("@cmdop/node");
const WebSocket = require("ws");

const CMDOP_KEY = process.env.CMDOP_KEY;
const WS_URL = "wss://ws.cmdop.com/connection/websocket";

async function main() {
  console.log("=== CMDOP WebSocket (Centrifugo) Test ===\n");

  // Step 1: Get real session ID via gRPC
  console.log("1. Getting real session ID via gRPC...");
  const grpcClient = await CMDOPClient.remote(CMDOP_KEY);
  const { sessions } = await grpcClient.terminal.list();
  const connected = sessions.find(s => s.status === "connected");

  if (!connected) {
    console.log("No connected sessions found!");
    await grpcClient.close();
    return;
  }

  const sessionId = connected.sessionId;
  console.log(`   Using session: ${sessionId} (${connected.machineName})`);

  // Step 2: Connect to Centrifugo WebSocket
  console.log("\n2. Connecting to WebSocket...");

  const centrifuge = new Centrifuge(WS_URL, {
    getToken: async () => CMDOP_KEY,
    websocket: WebSocket,
  });

  centrifuge.on("connected", (ctx) => {
    console.log(`   WebSocket connected! Client ID: ${ctx.client}`);
  });

  centrifuge.on("disconnected", (ctx) => {
    console.log(`   WebSocket disconnected: ${ctx.reason} (code: ${ctx.code})`);
  });

  centrifuge.on("error", (ctx) => {
    console.log(`   WebSocket error:`, ctx);
  });

  // Step 3: Subscribe to terminal output channel
  const outputChannel = `terminal#${sessionId}#output`;
  const statusChannel = `terminal#${sessionId}#status`;

  console.log(`\n3. Subscribing to: ${outputChannel}`);
  const outputSub = centrifuge.newSubscription(outputChannel);

  outputSub.on("publication", (ctx) => {
    console.log(`   [OUTPUT] ${JSON.stringify(ctx.data)}`);
  });
  outputSub.on("subscribing", (ctx) => {
    console.log(`   [OUTPUT] subscribing... code=${ctx.code} reason=${ctx.reason}`);
  });
  outputSub.on("subscribed", (ctx) => {
    console.log(`   [OUTPUT] subscribed!`);
  });
  outputSub.on("error", (ctx) => {
    console.log(`   [OUTPUT] error:`, ctx);
  });
  outputSub.on("unsubscribed", (ctx) => {
    console.log(`   [OUTPUT] unsubscribed: ${ctx.reason} (code: ${ctx.code})`);
  });

  console.log(`   Subscribing to: ${statusChannel}`);
  const statusSub = centrifuge.newSubscription(statusChannel);

  statusSub.on("publication", (ctx) => {
    console.log(`   [STATUS] ${JSON.stringify(ctx.data)}`);
  });
  statusSub.on("subscribed", (ctx) => {
    console.log(`   [STATUS] subscribed!`);
  });
  statusSub.on("error", (ctx) => {
    console.log(`   [STATUS] error:`, ctx);
  });

  // Connect
  outputSub.subscribe();
  statusSub.subscribe();
  centrifuge.connect();

  // Wait for connection
  await new Promise(r => setTimeout(r, 3000));

  // Step 4: Send input via gRPC
  console.log("\n4. Sending 'echo WS-TEST-OK' via gRPC...");
  try {
    await grpcClient.terminal.sendInput(sessionId, "echo WS-TEST-OK\n");
    console.log("   Input sent OK");
  } catch (err) {
    console.error("   Send input failed:", err.message);
  }

  // Step 5: Wait for output
  console.log("\n5. Waiting for output (5 seconds)...");
  await new Promise(r => setTimeout(r, 5000));

  // Step 6: Try RPC via WebSocket
  console.log("\n6. Trying RPC via WebSocket...");
  try {
    const result = await centrifuge.rpc("terminal.input", {
      session_id: sessionId,
      data: "echo WS-RPC-OK\n",
    });
    console.log("   RPC result:", result);
  } catch (err) {
    console.error("   RPC failed:", err.message || err);
  }

  // Wait more for output
  await new Promise(r => setTimeout(r, 3000));

  // Cleanup
  console.log("\n7. Cleanup...");
  outputSub.unsubscribe();
  statusSub.unsubscribe();
  centrifuge.disconnect();
  await grpcClient.close();
  console.log("   Done.");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
