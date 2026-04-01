/**
 * Test various endpoints with Django JWT to find Centrifugo connection token
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

const JWT = process.env.CMDOP_JWT;
const CMDOP_TOKEN = 'cmdop_IPy_B8vW3qm5JXCAr4g83-C6s_Xf_t4eiv7B7PfSzC648uYectnAwk-srd7rn7pK';

async function tryEndpoint(token, tokenName, urlPath, method = 'POST') {
  try {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
    };
    if (method === 'POST') opts.body = '{}';
    const resp = await fetch('https://api.cmdop.com' + urlPath, opts);
    const body = await resp.text().catch(() => '');
    const status = resp.status;
    const prefix = status === 200 ? '✅' : status === 404 ? '⬜' : '❌';
    console.log(`${prefix} [${tokenName}] ${method} ${urlPath} → ${status}: ${body.slice(0, 200)}`);
    return { status, body };
  } catch (err) {
    console.log(`💥 [${tokenName}] ${method} ${urlPath} → ERROR: ${err.message}`);
    return { status: 0, body: '' };
  }
}

async function main() {
  console.log('=== Testing endpoints with Django JWT ===\n');

  // First: verify JWT works for machines API
  await tryEndpoint(JWT, 'JWT', '/api/machines/machines/', 'GET');
  await tryEndpoint(CMDOP_TOKEN, 'cmdop_', '/api/machines/machines/', 'GET');

  console.log('\n=== Searching for Centrifugo token endpoint ===\n');

  const endpoints = [
    ['/api/system/centrifugo/connection-token/', 'POST'],
    ['/api/system/centrifugo/connection-token/', 'GET'],
    ['/api/system/ws/token/', 'POST'],
    ['/api/system/ws/token/', 'GET'],
    ['/api/system/centrifugo/token/', 'POST'],
    ['/api/system/centrifugo/token/', 'GET'],
    ['/api/system/realtime/token/', 'POST'],
    ['/api/system/websocket/token/', 'POST'],
    ['/api/ws/connection-token/', 'POST'],
    ['/api/ws/token/', 'POST'],
    ['/api/centrifugo/connection-token/', 'POST'],
    ['/api/centrifugo/token/', 'POST'],
    ['/api/terminal/ws-token/', 'POST'],
    ['/api/terminal/connection-token/', 'POST'],
    ['/api/machines/ws-token/', 'POST'],
    ['/api/machines/connection-token/', 'POST'],
    // Django REST SimpleJWT standard endpoints
    ['/api/token/', 'POST'],
    ['/api/token/refresh/', 'POST'],
    // System endpoints
    ['/api/system/', 'GET'],
    ['/api/system/health/', 'GET'],
    ['/api/', 'GET'],
  ];

  for (const [ep, method] of endpoints) {
    await tryEndpoint(JWT, 'JWT', ep, method);
  }

  console.log('\n=== Testing Centrifugo proxy connect ===\n');

  // Maybe Centrifugo uses connect proxy - try with connect_url header
  const { Centrifuge } = require("centrifuge");
  const WebSocket = require("ws");

  // Try passing JWT as header instead of token
  const centrifuge = new Centrifuge('wss://ws.cmdop.com/connection/websocket', {
    websocket: WebSocket,
    token: JWT,
    data: { jwt: JWT },
    debug: false,
  });

  let connected = false;
  centrifuge.on('connected', (ctx) => {
    console.log('Centrifugo CONNECTED! client=' + ctx.client);
    connected = true;
  });
  centrifuge.on('disconnected', (ctx) => {
    console.log('Centrifugo DISCONNECTED: code=' + ctx.code + ' reason=' + ctx.reason);
  });

  centrifuge.connect();
  await new Promise(r => setTimeout(r, 3000));
  centrifuge.disconnect();

  if (!connected) {
    console.log('\nDjango JWT also rejected by Centrifugo.');
    console.log('Centrifugo uses a DIFFERENT signing key than Django.');
    console.log('Need to find the endpoint that issues Centrifugo-signed JWTs.');
  }
}

main().catch(console.error);
