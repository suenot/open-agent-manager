/**
 * Тест Node.js SDK — agent.run() + files сервис
 */
const fs = require('fs');
const path = require('path');
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8').trim().split('\n')) {
  if (line.includes('=') && !line.startsWith('#')) { const [k,...v] = line.split('='); process.env[k.trim()] = v.join('=').trim(); }
}

const { CMDOPClient } = require('@cmdop/node');

(async () => {
  const client = await CMDOPClient.remote(process.env.CMDOP_KEY);

  // Найти connected сессию
  const { sessions } = await client.terminal.list();
  const connected = sessions.find(s => s.status === 'connected');
  if (!connected) { console.log("Нет online сессий!"); await client.close(); return; }
  const sid = connected.sessionId;
  console.log(`Machine: ${connected.machineName} (${sid})\n`);

  // ============================================================
  // 1. Проверим есть ли agent сервис в Node
  // ============================================================
  console.log("=".repeat(60));
  console.log("1. Проверка сервисов Node SDK");
  console.log("=".repeat(60));

  const services = ['terminal', 'files', 'agent', 'extract', 'browser'];
  for (const svc of services) {
    const obj = client[svc];
    if (!obj) {
      console.log(`  ${svc}: НЕТ`);
      continue;
    }
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(obj))
      .filter(m => m !== 'constructor' && !m.startsWith('_'));
    console.log(`  ${svc}: ${methods.join(', ')}`);
  }

  // ============================================================
  // 2. Agent service
  // ============================================================
  if (client.agent) {
    console.log(`\n${"=".repeat(60)}`);
    console.log("2. AGENT.RUN('ls -la /')");
    console.log("=".repeat(60));
    try {
      const result = await client.agent.run("Run: ls -la / — return raw output only.", { sessionId: sid });
      console.log(`  type: ${typeof result}`);
      if (typeof result === 'object') {
        for (const [k, v] of Object.entries(result)) {
          console.log(`  ${k}: ${String(v).slice(0, 500)}`);
        }
      } else {
        console.log(`  result: ${String(result).slice(0, 500)}`);
      }
    } catch (e) {
      console.log(`  ОШИБКА: ${e.message}`);

      // Попробуем другую сигнатуру
      console.log("\n  Попытка 2: agent.run(prompt, sessionId)");
      try {
        const result = await client.agent.run("Run: ls -la / — return raw output only.", sid);
        console.log(`  result: ${JSON.stringify(result).slice(0, 500)}`);
      } catch (e2) {
        console.log(`  ОШИБКА 2: ${e2.message}`);
      }

      // Попытка 3
      console.log("\n  Попытка 3: agent.run({ prompt, sessionId })");
      try {
        const result = await client.agent.run({ prompt: "ls -la /", sessionId: sid });
        console.log(`  result: ${JSON.stringify(result).slice(0, 500)}`);
      } catch (e3) {
        console.log(`  ОШИБКА 3: ${e3.message}`);
      }
    }
  } else {
    console.log("\n  agent сервис отсутствует в Node SDK!");
  }

  // ============================================================
  // 3. Files service
  // ============================================================
  if (client.files) {
    console.log(`\n${"=".repeat(60)}`);
    console.log("3. FILES SERVICE");
    console.log("=".repeat(60));

    console.log("\n--- files.list('/') ---");
    try {
      const result = await client.files.list("/");
      console.log(`  type: ${typeof result}`);
      if (result && result.entries) {
        console.log(`  entries: ${result.entries.length}`);
        for (const e of result.entries.slice(0, 15)) {
          console.log(`    ${e.type || '?'} ${e.name} ${e.size || '?'}b`);
        }
      } else {
        console.log(`  result: ${JSON.stringify(result).slice(0, 500)}`);
      }
    } catch (e) {
      console.log(`  ОШИБКА: ${e.message}`);
    }

    console.log("\n--- files.read('/etc/hostname') ---");
    try {
      const data = await client.files.read("/etc/hostname");
      console.log(`  type: ${typeof data}`);
      if (Buffer.isBuffer(data)) {
        console.log(`  = ${data.toString('utf-8').trim()}`);
      } else {
        console.log(`  = ${String(data).slice(0, 200)}`);
      }
    } catch (e) {
      console.log(`  ОШИБКА: ${e.message}`);
    }

    console.log("\n--- files.info('/') ---");
    try {
      const info = await client.files.info("/");
      console.log(`  info: ${JSON.stringify(info).slice(0, 500)}`);
    } catch (e) {
      console.log(`  ОШИБКА: ${e.message}`);
    }
  } else {
    console.log("\n  files сервис отсутствует в Node SDK!");
  }

  // ============================================================
  // 4. Terminal execute
  // ============================================================
  console.log(`\n${"=".repeat(60)}`);
  console.log("4. TERMINAL.EXECUTE (если есть)");
  console.log("=".repeat(60));
  if (typeof client.terminal.execute === 'function') {
    try {
      const result = await client.terminal.execute("ls -la /", { sessionId: sid, timeout: 15000 });
      console.log(`  result: ${JSON.stringify(result).slice(0, 500)}`);
    } catch (e) {
      console.log(`  ОШИБКА: ${e.message}`);
    }
  } else {
    console.log("  terminal.execute не найден");
    // Проверим все методы terminal детально
    const proto = Object.getPrototypeOf(client.terminal);
    const all = Object.getOwnPropertyNames(proto).filter(m => m !== 'constructor');
    console.log(`  Все методы terminal: ${all.join(', ')}`);
  }

  await client.close();
  console.log(`\n${"=".repeat(60)}`);
  console.log("=== ГОТОВО ===");
  console.log("=".repeat(60));
})();
