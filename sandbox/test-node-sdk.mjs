/**
 * Test @cmdop/node SDK — agent.run() and files.list()
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env
for (const line of readFileSync(join(__dirname, '..', '.env'), 'utf-8').trim().split('\n')) {
  if (line.includes('=') && !line.startsWith('#')) {
    const [k, ...v] = line.split('=');
    process.env[k.trim()] = v.join('=').trim();
  }
}

const API_KEY = process.env.CMDOP_KEY;
console.log(`API Key: ${API_KEY.slice(0, 10)}...`);

const { CMDOPClient } = await import('@cmdop/node');

console.log('Connecting to remote...');
const client = await CMDOPClient.remote(API_KEY);
console.log(`Connected! address=${client.address}`);

// List sessions
console.log('\n=== terminal.list() ===');
const { sessions } = await client.terminal.list();
console.log(`Sessions: ${sessions.length}`);
for (const s of sessions) {
  console.log(`  ${s.machineName} | ${s.status} | ${s.sessionId.slice(0, 20)}...`);
}

const connected = sessions.filter(s => s.status === 'connected');
if (!connected.length) {
  console.log('No connected sessions!');
  process.exit(1);
}

const sid = connected[0].sessionId;
console.log(`\nUsing session: ${connected[0].machineName} (${sid.slice(0, 20)}...)`);

// Test agent.run
console.log('\n=== agent.run() ===');
const start = Date.now();
try {
  const result = await client.agent.run(sid, 'echo HELLO_FROM_NODE && date && pwd');
  console.log(`Result (${Date.now() - start}ms):`);
  console.log(`  text: ${result.text}`);
  console.log(`  success: ${result.success}`);
} catch (e) {
  console.log(`  FAILED: ${e.message}`);
}

// Test files.list
console.log('\n=== files.list() ===');
try {
  const result = await client.files.list(sid, '/');
  console.log(`Entries: ${result.entries.length}, total: ${result.totalCount}`);
  for (const e of result.entries.slice(0, 10)) {
    console.log(`  ${e.type === 'directory' ? 'd' : '-'} ${e.name}`);
  }
} catch (e) {
  console.log(`  FAILED: ${e.message}`);
}

// Test files.read
console.log('\n=== files.read("/etc/hostname") ===');
try {
  const result = await client.files.read(sid, '/etc/hostname');
  console.log(`Content: ${result.content.toString('utf-8')}`);
} catch (e) {
  console.log(`  FAILED: ${e.message}`);
}

console.log('\nDone!');
process.exit(0);
