/**
 * OAuth Device Code Flow — получить JWT для WebSocket.
 * Запускаем, открываем ссылку в браузере, подтверждаем — получаем токен.
 */
const fs = require('fs');
const path = require('path');
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8').trim().split('\n')) {
  if (line.includes('=') && !line.startsWith('#')) { const [k,...v] = line.split('='); process.env[k.trim()] = v.join('=').trim(); }
}

const API = "https://api.cmdop.com";

async function main() {
  // 1. Request device code
  console.log("1. Requesting device code...");
  const resp = await fetch(`${API}/api/system/oauth/device/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: "cmdop-desktop" }),
  });
  const dc = await resp.json();

  console.log(`\n${"=".repeat(50)}`);
  console.log(`  CODE: ${dc.user_code}`);
  console.log(`  OPEN: ${dc.verification_uri}`);
  console.log(`${"=".repeat(50)}`);
  console.log(`\nОткрой ссылку и введи код. Жду до ${dc.expires_in}с...\n`);

  // 2. Poll for token
  const interval = (dc.interval || 5) * 1000;
  const deadline = Date.now() + dc.expires_in * 1000;
  let attempt = 0;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, interval));
    attempt++;

    const tokenResp = await fetch(`${API}/api/system/oauth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: dc.device_code,
        client_id: "cmdop-desktop",
      }),
    });
    const data = await tokenResp.json();

    if (data.access_token) {
      console.log(`\n[${attempt}] УСПЕХ!\n`);
      console.log(`access_token:  ${data.access_token}`);
      console.log(`refresh_token: ${data.refresh_token}`);
      console.log(`expires_in:    ${data.expires_in}s`);

      // Save to file for other tests
      fs.writeFileSync(path.join(__dirname, '.jwt-token'), JSON.stringify(data, null, 2));
      console.log(`\nСохранено в sandbox/.jwt-token`);
      return data;
    }

    if (data.error === "expired_token") {
      console.log(`[${attempt}] Код истёк!`);
      return null;
    }

    process.stdout.write(`[${attempt}] Жду подтверждения...  \r`);
  }

  console.log("Таймаут!");
  return null;
}

main().catch(console.error);
