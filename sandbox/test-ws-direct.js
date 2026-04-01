/**
 * Попытка подключиться к WebSocket Centrifugo напрямую с API key
 * и получить output с удалённого терминала
 */
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
for (const line of fs.readFileSync(envPath, 'utf-8').trim().split('\n')) {
  if (line.includes('=') && !line.startsWith('#')) {
    const [k, ...v] = line.split('=');
    process.env[k.trim()] = v.join('=').trim();
  }
}

const { Centrifuge } = require("centrifuge");
const WebSocket = require("ws");
const { CMDOPClient } = require("@cmdop/node");

const CMDOP_KEY = process.env.CMDOP_KEY;
const WS_URL = "wss://ws.cmdop.com/connection/websocket";

async function main() {
  console.log("=== Direct WebSocket Test ===\n");

  // 1. Get session ID via gRPC
  console.log("1. Getting session ID via gRPC...");
  const grpc = await CMDOPClient.remote(CMDOP_KEY);
  const { sessions } = await grpc.terminal.list();
  const connected = sessions.find(s => s.status === "connected");
  if (!connected) {
    console.log("   No connected sessions!");
    await grpc.close();
    return;
  }
  const sessionId = connected.sessionId;
  console.log(`   Session: ${sessionId} (${connected.machineName})`);

  // 2. Try WebSocket with API key as token
  console.log("\n2. Connecting to Centrifugo with API key...");
  const centrifuge = new Centrifuge(WS_URL, {
    websocket: WebSocket,
    token: CMDOP_KEY,
    getToken: async () => CMDOP_KEY,
    debug: false,
  });

  let wsConnected = false;

  centrifuge.on("connected", (ctx) => {
    console.log(`   CONNECTED! transport=${ctx.transport}`);
    wsConnected = true;
  });
  centrifuge.on("disconnected", (ctx) => {
    console.log(`   DISCONNECTED: code=${ctx.code} reason=${ctx.reason}`);
  });
  centrifuge.on("error", (ctx) => {
    console.log(`   ERROR: ${ctx.error?.message || JSON.stringify(ctx)}`);
  });

  centrifuge.connect();

  // Wait for connection
  await new Promise(r => setTimeout(r, 3000));

  if (!wsConnected) {
    console.log("   WebSocket connection failed with API key.");
    console.log("   (Expected — API key is for gRPC, JWT needed for WebSocket)");

    // 3. Send ls via gRPC to show it works one-way
    console.log("\n3. Demonstrating one-way: sending ls via gRPC...");
    await grpc.terminal.sendInput(sessionId, "echo '=== SENT FROM SANDBOX ===' && ls -la /tmp\n");
    console.log("   Sent! Command is executing on remote machine.");
    console.log("   But we CANNOT see the output here.");
    console.log("   Output is only visible:");
    console.log("     - On the remote machine's terminal");
    console.log("     - In CMDOP dashboard (uses WebSocket + JWT)");
    console.log("     - In our app after OAuth Device Code Flow → JWT");
  } else {
    // If somehow connected, try subscribing
    console.log(`\n3. Subscribing to terminal#${sessionId}#output...`);
    const outputChannel = `terminal#${sessionId}#output`;
    const sub = centrifuge.newSubscription(outputChannel);

    sub.on("publication", (ctx) => {
      console.log(`   OUTPUT: ${JSON.stringify(ctx.data)}`);
    });
    sub.on("error", (ctx) => {
      console.log(`   SUB ERROR: ${ctx.error?.message}`);
    });
    sub.on("subscribed", () => {
      console.log("   Subscribed!");
    });

    sub.subscribe();

    // Send ls
    console.log(`\n4. Sending ls via gRPC...`);
    await grpc.terminal.sendInput(sessionId, "ls -la /tmp\n");

    // Wait for output
    await new Promise(r => setTimeout(r, 5000));
  }

  centrifuge.disconnect();
  await grpc.close();

  console.log("\n=== ИТОГ ===");
  console.log(`
С API key (cmd_...) из .env можно:
  ✅ Подключиться через gRPC
  ✅ Получить список сессий (list)
  ✅ Отправить команду (sendInput) — ls ВЫПОЛНИТСЯ на удалённой машине
  ✅ Изменить размер терминала (resize)
  ✅ Отправить сигнал (signal)
  ❌ Получить output (stdout/stderr) — НЕВОЗМОЖНО через gRPC

Чтобы получить output, нужен JWT (clit_...):
  1. OAuth Device Code Flow:
     POST https://api.cmdop.com/api/system/oauth/device/
     → user_code → пользователь подтверждает в браузере
     POST https://api.cmdop.com/api/system/oauth/token/
     → access_token (clit_...)

  2. С JWT можно:
     ✅ WebSocket: subscribe terminal#<sid>#output → видеть output
     ✅ HTTP API: GET /api/machines/machines/ → найти session_id
     ✅ WebSocket RPC: terminal.input → отправлять ввод
`);
}

main().catch(console.error);
