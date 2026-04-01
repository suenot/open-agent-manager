/**
 * Test @cmdop/react API surface — explore all hooks and their behavior
 * Since React hooks can't run outside React, we analyze the source code
 */
const fs = require('fs');
const path = require('path');

// Try multiple locations
let src;
const locations = [
  path.join(__dirname, '..', 'node_modules', '@cmdop', 'react', 'dist', 'index.js'),
  path.join(__dirname, 'node_modules', '@cmdop', 'react', 'dist', 'index.js'),
];
for (const loc of locations) {
  try {
    src = fs.readFileSync(loc, 'utf-8');
    console.log(`Found at: ${loc}`);
    break;
  } catch {}
}
if (!src) {
  console.log("@cmdop/react not found!");
  process.exit(1);
}

console.log("=== @cmdop/react API Analysis ===\n");
console.log(`Source length: ${src.length} chars\n`);

// Extract function names
const funcMatches = src.matchAll(/function\s+(\w+)\s*\(/g);
const functions = [...funcMatches].map(m => m[1]).filter(f => !f.startsWith('_'));
console.log("Exported functions:");
for (const f of [...new Set(functions)]) {
  console.log(`  ${f}`);
}

// Extract class names
const classMatches = src.matchAll(/var\s+(\w+)\s*=\s*class\s*\{/g);
const classes = [...classMatches].map(m => m[1]);
console.log("\nClasses:");
for (const c of classes) {
  console.log(`  ${c}`);
}

// Extract channel patterns (for WebSocket subscriptions)
const channelMatches = src.matchAll(/channel:\s*[`'"]([^`'"]+)[`'"]/g);
const channels = [...channelMatches].map(m => m[1]);
console.log("\nWebSocket channels:");
for (const c of [...new Set(channels)]) {
  console.log(`  ${c}`);
}

// Extract RPC methods
const rpcMatches = src.matchAll(/call\(["']([^"']+)["']/g);
const rpcs = [...rpcMatches].map(m => m[1]);
console.log("\nWebSocket RPC methods:");
for (const r of [...new Set(rpcs)]) {
  console.log(`  ${r}`);
}

// Extract template literal channels
const templateChannelMatches = src.matchAll(/`terminal#\$\{(\w+)\}#(\w+)`/g);
const templateChannels = [...templateChannelMatches].map(m => `terminal#\${${m[1]}}#${m[2]}`);
console.log("\nTemplate channels:");
for (const c of [...new Set(templateChannels)]) {
  console.log(`  ${c}`);
}

// Extract all fetch/API calls
const fetchMatches = src.matchAll(/(?:fetch|axios|request)\s*\(\s*[`'"]([^`'"]+)[`'"]/g);
console.log("\nHTTP API calls:");
for (const m of fetchMatches) {
  console.log(`  ${m[1]}`);
}

// Extract WS URL
const wsMatches = src.matchAll(/wss?:\/\/[^'"`\s]+/g);
console.log("\nWebSocket URLs in source:");
for (const m of wsMatches) {
  console.log(`  ${m[0]}`);
}

// Now analyze useTerminal hook in detail
console.log("\n=== useTerminal Hook Analysis ===");
const termStart = src.indexOf('function useTerminal(options)');
const termEnd = src.indexOf('function signalNameToNumber');
if (termStart > -1 && termEnd > -1) {
  const termSrc = src.slice(termStart, termEnd);
  console.log(`Source length: ${termSrc.length} chars`);

  // Extract what data from onOutput callback contains
  if (termSrc.includes('data.data')) {
    console.log("  onOutput: receives data.data (string from publication)");
  }
  if (termSrc.includes('isOutputSubscribed && isStatusSubscribed')) {
    console.log("  isConnected: true when both output AND status channels subscribed");
  }
}

// Analyze useMachines
console.log("\n=== useMachines Hook Analysis ===");
const machStart = src.indexOf('function useMachines(options');
const machEnd = src.indexOf('function useMachine(machineId');
if (machStart > -1 && machEnd > -1) {
  const machSrc = src.slice(machStart, machEnd);
  console.log(`Source length: ${machSrc.length} chars`);
  console.log(`  Uses SWR for caching`);
  console.log(`  Key: ["machines", page, pageSize]`);
  if (machSrc.includes('machinesList')) {
    console.log("  Calls: machines.machines_machines.machinesList()");
  }
  if (machSrc.includes('results')) {
    console.log("  Returns: data?.results ?? []");
  }
}

// Analyze CMDOPProvider
console.log("\n=== CMDOPProvider Analysis ===");
const provStart = src.indexOf('function CMDOPProvider(');
const provEnd = src.indexOf('function useCMDOP(');
if (provStart > -1 && provEnd > -1) {
  const provSrc = src.slice(provStart, provEnd);
  if (provSrc.includes('machines2.setToken')) {
    console.log("  Sets token on: machines module, workspaces module");
  }
  if (provSrc.includes('apiKey')) {
    console.log("  Props: { children, apiKey?, token? }");
  }
}

// Analyze WebSocketProvider
console.log("\n=== WebSocketProvider Analysis ===");
const wsStart = src.indexOf('function WebSocketProvider(');
const wsEnd = src.indexOf('function useWebSocket(');
if (wsStart > -1 && wsEnd > -1) {
  const wsSrc = src.slice(wsStart, wsEnd);
  if (wsSrc.includes('autoConnect')) {
    console.log("  Props: { url, getToken, autoConnect=true, debug=false }");
  }
  if (wsSrc.includes('CMDOPWebSocketClient')) {
    console.log("  Creates: CMDOPWebSocketClient internally");
  }
}

console.log("\n=== Summary ===");
console.log(`
Architecture:
1. CMDOPProvider — sets JWT token for HTTP API (machines, workspaces)
2. WebSocketProvider — connects to Centrifugo WebSocket with JWT
3. useTerminal — subscribes to terminal#<sid>#output and terminal#<sid>#status
   - sendInput via RPC: terminal.input { session_id, data }
   - resize via RPC: terminal.resize { session_id, cols, rows }
   - signal via RPC: terminal.signal { session_id, signal }
4. useMachines — fetches machines list via HTTP API (SWR cached)
5. useAgent — runs AI agent via WebSocket RPC

Token flow:
- OAuth Device Code Flow → JWT (clit_...)
- JWT used for both HTTP API (Bearer) and WebSocket (Centrifugo token)
- API key (cmd_...) is for gRPC only, NOT for HTTP API or WebSocket

gRPC endpoints (from @cmdop/node):
- grpc.cmdop.com:443

HTTP API endpoints (from @cmdop/core):
- https://api.cmdop.com/api/machines/machines/
- https://api.cmdop.com/api/system/oauth/device/
- https://api.cmdop.com/api/system/oauth/token/

WebSocket endpoint:
- wss://ws.cmdop.com/connection/websocket
`);
