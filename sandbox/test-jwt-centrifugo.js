/**
 * Test Centrifugo WebSocket with real JWT from .env (CMDOP_JWT)
 */
const fs = require('fs');
const path = require('path');

// Load .env
const envPath = path.join(__dirname, '..', '.env');
for (const line of fs.readFileSync(envPath, 'utf-8').trim().split('\n')) {
  if (line.includes('=') && !line.startsWith('#')) {
    const [k, ...v] = line.split('=');
    process.env[k.trim()] = v.join('=').trim();
  }
}

const JWT = process.env.CMDOP_JWT;
const API_KEY = process.env.CMDOP_KEY;

const { Centrifuge } = require("centrifuge");
const WebSocket = require("ws");
const { CMDOPClient } = require("@cmdop/node");

// Decode JWT payload
const payload = JSON.parse(Buffer.from(JWT.split('.')[1], 'base64').toString());
console.log('JWT payload:', JSON.stringify(payload, null, 2));
console.log('JWT starts with:', JWT.slice(0, 10) + '...');
console.log('Expires:', new Date(payload.exp * 1000).toISOString());
console.log('Is expired:', Date.now() > payload.exp * 1000);
console.log();

async function main() {
  // 1. Get session via gRPC
  console.log('1. Getting session via gRPC...');
  const grpc = await CMDOPClient.remote(API_KEY);
  const { sessions } = await grpc.terminal.list();
  const connected = sessions.find(s => s.status === 'connected');
  if (!connected) {
    console.log('   No connected sessions!');
    await grpc.close();
    return;
  }
  const sid = connected.sessionId;
  console.log('   Session:', sid, '(' + connected.machineName + ')');

  // 2. Connect to Centrifugo with JWT
  console.log('\n2. Connecting to Centrifugo with JWT...');
  const centrifuge = new Centrifuge('wss://ws.cmdop.com/connection/websocket', {
    websocket: WebSocket,
    token: JWT,
    getToken: async () => JWT,
    debug: true,
  });

  let wsConnected = false;

  centrifuge.on('connected', (ctx) => {
    console.log('   >>> CONNECTED! transport=' + ctx.transport);
    wsConnected = true;
  });
  centrifuge.on('disconnected', (ctx) => {
    console.log('   >>> DISCONNECTED: code=' + ctx.code + ' reason=' + ctx.reason);
  });
  centrifuge.on('error', (ctx) => {
    console.log('   >>> ERROR:', ctx.error?.message || JSON.stringify(ctx));
  });

  centrifuge.connect();

  // Wait for connection
  await new Promise(r => setTimeout(r, 5000));

  if (wsConnected) {
    console.log('\n3. Subscribing to terminal output...');
    const outputChannel = 'terminal#' + sid + '#output';
    const sub = centrifuge.newSubscription(outputChannel);

    sub.on('publication', (ctx) => {
      console.log('   OUTPUT:', JSON.stringify(ctx.data).slice(0, 200));
    });
    sub.on('error', (ctx) => {
      console.log('   SUB ERROR:', ctx.error?.message);
    });
    sub.on('subscribed', () => {
      console.log('   Subscribed to', outputChannel);
    });
    sub.subscribe();

    // Wait for subscription
    await new Promise(r => setTimeout(r, 2000));

    // Send a test command via gRPC
    console.log('\n4. Sending test command via gRPC...');
    await grpc.terminal.sendInput(sid, 'echo CCAM_WS_TEST_OK\n');

    // Wait for output
    console.log('   Waiting for output...');
    await new Promise(r => setTimeout(r, 5000));
  } else {
    console.log('\n   WebSocket connection FAILED with JWT.');
    console.log('   JWT might be expired or invalid for Centrifugo.');
  }

  centrifuge.disconnect();
  await grpc.close();
  console.log('\nDone.');
}

main().catch(console.error);
