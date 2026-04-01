const fs = require('fs');
const path = require('path');
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8').trim().split('\n')) {
  if (line.includes('=') && !line.startsWith('#')) { const [k,...v] = line.split('='); process.env[k.trim()] = v.join('=').trim(); }
}
const { CMDOPClient } = require('@cmdop/node');

(async () => {
  const client = await CMDOPClient.remote(process.env.CMDOP_KEY);
  const { sessions, total, workspaceName } = await client.terminal.list();

  console.log(`Workspace: ${workspaceName}`);
  console.log(`Total sessions: ${total}\n`);

  const machines = {};
  for (const s of sessions) {
    if (!machines[s.machineName]) machines[s.machineName] = [];
    machines[s.machineName].push(s);
  }

  for (const [name, sessns] of Object.entries(machines)) {
    const active = sessns.find(s => s.status === 'connected');
    console.log(`${active ? '[ONLINE] ' : '[OFFLINE]'} ${name}`);
    for (const s of sessns) {
      console.log(`   ${s.status === 'connected' ? 'ACTIVE' : 'dead  '}  ${s.sessionId}  ${s.hostname}  ${s.os}  agent=${s.agentVersion}  shell=${s.shell}  since=${s.connectedAt}`);
    }
    console.log('');
  }

  await client.close();
})();
