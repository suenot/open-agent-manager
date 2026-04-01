/**
 * Тест Node.js SDK с ПРАВИЛЬНЫМИ сигнатурами:
 * - agent.run(sessionId, prompt)
 * - files.list(sessionId, path)
 * - files.read(sessionId, path)
 */
const fs = require('fs');
const path = require('path');
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8').trim().split('\n')) {
  if (line.includes('=') && !line.startsWith('#')) { const [k,...v] = line.split('='); process.env[k.trim()] = v.join('=').trim(); }
}

const { CMDOPClient } = require('@cmdop/node');

(async () => {
  const client = await CMDOPClient.remote(process.env.CMDOP_KEY);

  const { sessions } = await client.terminal.list();
  const connected = sessions.find(s => s.status === 'connected');
  if (!connected) { console.log("Нет online!"); await client.close(); return; }
  const sid = connected.sessionId;
  console.log(`Machine: ${connected.machineName} (${sid})\n`);

  // ============================================================
  // 1. AGENT.RUN — выполнить команду на удалённой машине
  // ============================================================
  console.log("=".repeat(60));
  console.log("1. agent.run(sid, 'ls -la /')");
  console.log("=".repeat(60));
  try {
    const result = await client.agent.run(sid, "Run: ls -la / — return raw output only.");
    console.log(`  success: ${result.success}`);
    console.log(`  duration: ${result.durationMs}ms`);
    console.log(`  text:\n${result.text}`);
    if (result.error) console.log(`  error: ${result.error}`);
  } catch (e) {
    console.log(`  ОШИБКА: ${e.message}`);
  }

  // ============================================================
  // 2. AGENT.RUN — whoami
  // ============================================================
  console.log(`\n${"=".repeat(60)}`);
  console.log("2. agent.run(sid, 'whoami && hostname')");
  console.log("=".repeat(60));
  try {
    const result = await client.agent.run(sid, "Run: whoami && hostname && uname -a — return raw output only.");
    console.log(`  success: ${result.success}`);
    console.log(`  text:\n${result.text}`);
  } catch (e) {
    console.log(`  ОШИБКА: ${e.message}`);
  }

  // ============================================================
  // 3. FILES.LIST — листинг файлов
  // ============================================================
  console.log(`\n${"=".repeat(60)}`);
  console.log("3. files.list(sid, '/')");
  console.log("=".repeat(60));
  try {
    const result = await client.files.list(sid, "/");
    console.log(`  type: ${typeof result}`);
    if (result && result.entries) {
      console.log(`  entries: ${result.entries.length}`);
      for (const e of result.entries.slice(0, 20)) {
        console.log(`    ${e.type || '?'} ${e.name} ${e.size != null ? e.size + 'b' : ''}`);
      }
    } else {
      console.log(`  result: ${JSON.stringify(result).slice(0, 500)}`);
    }
  } catch (e) {
    console.log(`  ОШИБКА: ${e.message}`);
  }

  // ============================================================
  // 4. FILES.LIST домашняя папка
  // ============================================================
  console.log(`\n${"=".repeat(60)}`);
  console.log("4. files.list(sid, '~')");
  console.log("=".repeat(60));
  try {
    const result = await client.files.list(sid, "~");
    if (result && result.entries) {
      console.log(`  entries: ${result.entries.length}`);
      for (const e of result.entries.slice(0, 20)) {
        console.log(`    ${e.type || '?'} ${e.name}`);
      }
    } else {
      console.log(`  result: ${JSON.stringify(result).slice(0, 500)}`);
    }
  } catch (e) {
    console.log(`  ОШИБКА: ${e.message}`);
  }

  // ============================================================
  // 5. FILES.READ
  // ============================================================
  console.log(`\n${"=".repeat(60)}`);
  console.log("5. files.read(sid, '/etc/hostname')");
  console.log("=".repeat(60));
  try {
    const result = await client.files.read(sid, "/etc/hostname");
    console.log(`  type: ${typeof result}`);
    if (result && result.content) {
      const text = Buffer.isBuffer(result.content) ? result.content.toString('utf-8') : String(result.content);
      console.log(`  content: ${text.trim()}`);
    } else if (Buffer.isBuffer(result)) {
      console.log(`  buffer: ${result.toString('utf-8').trim()}`);
    } else {
      console.log(`  result: ${JSON.stringify(result).slice(0, 500)}`);
    }
  } catch (e) {
    console.log(`  ОШИБКА: ${e.message}`);
  }

  // ============================================================
  // 6. FILES.READ /etc/os-release
  // ============================================================
  console.log(`\n${"=".repeat(60)}`);
  console.log("6. files.read(sid, '/etc/os-release')");
  console.log("=".repeat(60));
  try {
    const result = await client.files.read(sid, "/etc/os-release");
    if (result && result.content) {
      const text = Buffer.isBuffer(result.content) ? result.content.toString('utf-8') : String(result.content);
      console.log(`  content:\n${text}`);
    } else {
      console.log(`  result: ${JSON.stringify(result).slice(0, 500)}`);
    }
  } catch (e) {
    console.log(`  ОШИБКА: ${e.message}`);
  }

  // ============================================================
  // 7. FILES.STAT
  // ============================================================
  console.log(`\n${"=".repeat(60)}`);
  console.log("7. files.stat(sid, '/')");
  console.log("=".repeat(60));
  try {
    const result = await client.files.stat(sid, "/");
    console.log(`  result: ${JSON.stringify(result, null, 2).slice(0, 500)}`);
  } catch (e) {
    console.log(`  ОШИБКА: ${e.message}`);
  }

  // ============================================================
  // 8. FILES.SEARCH
  // ============================================================
  console.log(`\n${"=".repeat(60)}`);
  console.log("8. files.search(sid, ...)");
  console.log("=".repeat(60));
  try {
    const result = await client.files.search(sid, "/etc", { pattern: "*.conf" });
    console.log(`  type: ${typeof result}`);
    if (result && Array.isArray(result.matches)) {
      console.log(`  matches: ${result.matches.length}`);
      for (const m of result.matches.slice(0, 10)) {
        console.log(`    ${m.path || m}`);
      }
    } else {
      console.log(`  result: ${JSON.stringify(result).slice(0, 500)}`);
    }
  } catch (e) {
    console.log(`  ОШИБКА: ${e.message}`);
  }

  // ============================================================
  // 9. AGENT.EXTRACT — структурированный вывод
  // ============================================================
  console.log(`\n${"=".repeat(60)}`);
  console.log("9. agent.extract(sid, ...)");
  console.log("=".repeat(60));
  try {
    const result = await client.agent.extract(sid, "What is the hostname and OS of this machine?", {
      outputSchema: {
        type: 'object',
        properties: {
          hostname: { type: 'string' },
          os: { type: 'string' },
          kernel: { type: 'string' }
        }
      }
    });
    console.log(`  result: ${JSON.stringify(result, null, 2).slice(0, 500)}`);
  } catch (e) {
    console.log(`  ОШИБКА: ${e.message}`);
  }

  await client.close();
  console.log(`\n${"=".repeat(60)}`);
  console.log("=== ГОТОВО ===");
  console.log("=".repeat(60));
})();
