# CMDOP SDK — Полное исследование

> Результат тестирования трёх SDK: Python (`cmdop`), Node.js (`@cmdop/node`), React (`@cmdop/react`).
> Все тесты выполнены на реальной инфраструктуре CMDOP с подключённой машиной `suenotpc`.

---

## Архитектура CMDOP

```
                          ┌─────────────────────┐
                          │   CMDOP Cloud Relay  │
                          │  grpc.cmdop.com:443  │
                          │  api.cmdop.com       │
                          │  ws.cmdop.com        │
                          └───────┬───────┬──────┘
                                  │       │
                    ┌─────────────┘       └──────────────┐
                    │                                    │
           ┌────────┴────────┐                 ┌─────────┴─────────┐
           │  Agent (daemon)  │                │  Client (browser)  │
           │  remote machine  │                │  desktop app       │
           └─────────────────┘                 └───────────────────┘
           gRPC bidirectional                  WebSocket + HTTP API
           TerminalStream                      useTerminal / useMachines
           (создаёт сессии)                    (наблюдает за сессиями)
```

### Три канала связи

| Канал | Endpoint | Auth | Назначение |
|-------|----------|------|------------|
| **gRPC** | `grpc.cmdop.com:443` | API key (`cmd_...`) | Agent-side: создание сессий, sendInput, resize, list, getStatus |
| **HTTP API** | `https://api.cmdop.com/api/...` | JWT (`clit_...`) | Client-side: список машин, OAuth |
| **WebSocket** | `wss://ws.cmdop.com/connection/websocket` | JWT (`clit_...`) | Client-side: output в реальном времени, RPC для input/resize |

### Два типа токенов

| Токен | Префикс | Получение | Использование |
|-------|---------|-----------|---------------|
| **API Key** | `cmd_...` | Dashboard CMDOP | gRPC (Python/Node SDK) |
| **JWT** | `clit_...` | OAuth Device Code Flow | HTTP API + WebSocket (React SDK) |

> **Критично:** API key (`cmd_...`) НЕ работает для HTTP API и WebSocket. Для них нужен JWT.

---

## 1. Python SDK (`cmdop`)

```bash
pip install cmdop  # v0.1.31
```

### Два клиента: Sync + Async

```python
from cmdop import CMDOPClient, AsyncCMDOPClient

# Sync
client = CMDOPClient.remote(api_key="cmd_...")
# Async
client = AsyncCMDOPClient.remote(api_key="cmd_...")
```

### Сервисы

| Сервис | Sync | Async | Описание |
|--------|------|-------|----------|
| `client.terminal` | TerminalService | AsyncTerminalService | Управление терминальными сессиями |
| `client.files` | - | AsyncFileService | Файловые операции на удалённой машине |
| `client.agent` | - | AsyncAgentService | AI агент |
| `client.browser` | - | AsyncBrowserService | Браузер (не реализован — `NoReturn`) |
| `client.extract` | - | AsyncExtractService | Извлечение данных |
| `client.download` | - | AsyncDownloadService | Загрузка файлов |

### Terminal Service (Async) — протестировано

```python
client = AsyncCMDOPClient.remote(api_key="cmd_...")

# Список сессий (РАБОТАЕТ)
result = await client.terminal.list_sessions()
# → SessionListResponse { sessions: [...], total: 5, workspace_name: "..." }

# Поля сессии:
# session_id, machine_hostname, machine_name, status, os,
# agent_version, heartbeat_age_seconds, has_shell, shell,
# working_directory, connected_at

# Найти активную сессию (РАБОТАЕТ)
active = await client.terminal.get_active_session(hostname="suenotpc")
# → SessionListItem с status="connected"

# Отправить ввод (РАБОТАЕТ)
await client.terminal.send_input(session_id, "echo hello\n")

# Изменить размер (РАБОТАЕТ)
await client.terminal.resize(session_id, 120, 40)

# Получить историю (ВОЗВРАЩАЕТ ПУСТЫЕ ДАННЫЕ)
history = await client.terminal.get_history(session_id)
# → HistoryResponse { session_id, data: b'', total_lines: 0, has_more: False }

# Выполнить команду (ВОЗВРАЩАЕТ ПУСТЫЕ ДАННЫЕ)
output, exit_code = await client.terminal.execute("whoami", timeout=10)
# → (b'', -1)

# Отправить сигнал
from cmdop import SignalType
# SignalType: SIGINT, SIGTERM, SIGKILL, SIGSTOP, SIGCONT, SIGHUP
await client.terminal.send_signal(session_id, SignalType.SIGINT)

# Создать потоковый терминал (ТОЛЬКО AGENT-SIDE!)
stream = client.terminal.stream()
# → TerminalStream — создаёт НОВУЮ сессию как агент
```

### Terminal Service (Sync) — ограниченный

```python
client = CMDOPClient.remote(api_key="cmd_...")

# Sync-клиент НЕ имеет list_sessions(), get_active_session(), execute(), stream()
# Доступные методы:
client.terminal.send_input(session_id, "echo hello\n")
client.terminal.resize(session_id, 120, 40)
client.terminal.get_history(session_id)  # пустые данные
client.terminal.send_signal(session_id, SignalType.SIGINT)
client.terminal.close(session_id)
client.terminal.create(shell="/bin/bash", cols=80, rows=24)
```

### Files Service (Async) — протестировано

```python
# Список файлов (возвращает пустые данные для gRPC)
files = await client.files.list("~")
# → ListDirectoryResponse { path: '', entries: [], next_page_token: None, total_count: 0 }

# Другие методы (не тестировались):
await client.files.read(path, offset=0, length=0)
await client.files.write(path, content)
await client.files.mkdir(path)
await client.files.copy(source, destination)
await client.files.move(source, destination)
await client.files.delete(path)
await client.files.info(path)
```

### Agent Service (Async) — протестировано

```python
from cmdop import AgentType, AgentRunOptions

# РАБОТАЕТ! Выполнить команду на удалённой машине
result = await client.agent.run(
    "Run: ls -la / — return raw output only.",
    session_id=sid  # ОБЯЗАТЕЛЬНО передать session_id!
)
# → AgentResult {
#     request_id: "uuid",
#     success: True,
#     text: "total 92\ndrwxr-xr-x  23 root root...",
#     error: "",
#     duration_ms: 7804,
#     tool_results: [],
#     usage: {prompt_tokens: 0, completion_tokens: 0, total_tokens: 0},
#     data: None,
#     output_json: ""
# }

# БЕЗ session_id → ОШИБКА
result = await client.agent.run("ls -la /")
# → success=False, error="Session 'local...' not found in workspace 'unknown'"

# Потоковый режим — НЕ РЕАЛИЗОВАН
async for event in client.agent.run_stream(prompt="Hello"):
    pass  # → NotImplementedError
```

### TerminalStream (ТОЛЬКО для Agent-daemon)

```python
from cmdop import TerminalStream

# ВНИМАНИЕ: TerminalStream — это агент-сторона!
# Он создаёт НОВУЮ сессию и регистрируется как демон.
# НЕ для наблюдения за существующими сессиями.

stream = TerminalStream(transport=client.transport)
session_id = stream.connect()  # Генерирует UUID, отправляет RegisterRequest

# Колбэки:
stream.on_output(handler)    # Входящие данные от клиента
stream.on_error(handler)
stream.on_status(handler)
stream.on_disconnect(handler)
stream.on_history(handler)

stream.send_input(data)      # Отправить вывод клиенту
stream.send_resize(cols, rows)
stream.request_history(limit=100)
stream.close()
```

### AgentDiscovery (REST API — НЕ РАБОТАЕТ)

```python
from cmdop import AgentDiscovery

disc = AgentDiscovery(api_key="cmd_...")
agents = await disc.list_agents()
# → HTTP 404 (endpoint не существует на api.cmdop.com)
```

### Transport

```python
transport = client.transport
# Type: RemoteTransport
# transport.server = "grpc.cmdop.com:443"
# transport.mode = "remote"
# transport.is_connected = True
# transport.metadata = [("authorization", "Bearer cmd_...")]
# transport.channel → grpc.Channel
# transport.async_channel → grpc.aio.Channel
```

---

## 2. Node.js SDK (`@cmdop/node`)

```bash
npm install @cmdop/node  # v0.1.1
```

### Подключение

```javascript
const { CMDOPClient } = require("@cmdop/node");

const client = await CMDOPClient.remote(API_KEY);
// client.isConnected → true
```

### Client API

| Свойство/метод | Тип | Описание |
|---------------|-----|----------|
| `client.isConnected` | boolean | Статус gRPC соединения |
| `client.address` | string | Адрес gRPC сервера |
| `client.terminal` | TerminalService | Терминальные операции |
| `client.files` | FileService | Файловые операции |
| `client.agent` | AgentService | AI агент |
| `client.healthCheck()` | Promise | Проверка здоровья |
| `client.close()` | Promise | Закрытие соединения |

### Terminal Service — протестировано

```javascript
// Список сессий (РАБОТАЕТ)
const { sessions, total, workspaceName } = await client.terminal.list();
// sessions[]: { sessionId, hostname, machineName, status, os,
//   agentVersion, hasShell, shell, workingDir, connectedAt }

// Статус сессии (РАБОТАЕТ)
const status = await client.terminal.getStatus(sessionId);
// → { exists: true, status: "CONNECTED", hostname, connectedAt,
//    lastHeartbeat, commandsCount: 0 }

// Отправить ввод (РАБОТАЕТ)
await client.terminal.sendInput(sessionId, "echo hello\n");

// Изменить размер (РАБОТАЕТ)
await client.terminal.resize(sessionId, 120, 40);

// История (ПУСТАЯ — команды, НЕ output)
const history = await client.terminal.getHistory(sessionId);
// → { commands: [], total: 0 }

// Сигнал
await client.terminal.signal(sessionId, "SIGINT");

// Создать сессию
await client.terminal.create({ shell: "/bin/bash", cols: 80, rows: 24 });

// Закрыть сессию
await client.terminal.close(sessionId);
```

### Files Service (Node.js) — протестировано

```javascript
// ВАЖНО: первый аргумент всех методов — sessionId!

// Листинг каталога (РАБОТАЕТ)
const result = await client.files.list(sid, "/");
// → { entries: [{ name, type, size, permissions, owner, modifiedAt, isHidden, isReadable, isWritable, mimeType }] }

// Чтение файла (РАБОТАЕТ)
const file = await client.files.read(sid, "/etc/hostname");
// → { content: "suenotpc" }

// Stat файла (РАБОТАЕТ)
const stat = await client.files.stat(sid, "/");
// → { name, path, type, size, permissions, modifiedAt, isReadable, isWritable }

// Поиск файлов (РАБОТАЕТ)
const found = await client.files.search(sid, "/etc", { pattern: "*.conf" });
// → { matches: [{ name, path, type, size, ... }] }

// Запись файла
await client.files.write(sid, "/tmp/test.txt", "Hello from CCAM!");

// Создание каталога
await client.files.mkdir(sid, "/tmp/new-dir");

// Удаление
await client.files.delete(sid, "/tmp/test.txt");

// Перемещение / Копирование
await client.files.move(sid, "/tmp/a.txt", "/tmp/b.txt");
await client.files.copy(sid, "/tmp/a.txt", "/tmp/a-copy.txt");

// Архивирование
await client.files.archive(sid, "/tmp/dir", { format: "tar.gz" });
```

### Agent Service (Node.js) — протестировано

```javascript
// ВАЖНО: sessionId — ПЕРВЫЙ аргумент (отличие от Python!)

// Выполнить команду через AI-агент (РАБОТАЕТ)
const result = await client.agent.run(sid, "Run: ls -la / — return raw output only.");
// → { success: true, text: "total 92\ndrwxr-xr-x...", durationMs: 7302, error: "" }

// Структурированный вывод
const result = await client.agent.extract(sid, "What OS is this?", {
  outputSchema: { type: 'object', properties: { os: { type: 'string' } } }
});
```

### Методы которых НЕТ в Node.js SDK (в отличие от Python)

- `execute()` — нет (но есть `agent.run()` который лучше!)
- `getActiveSession()` — нет
- `stream()` — нет (TerminalStream только в Python)

### Transport

```javascript
const transport = client._transport;
// transport._address → gRPC server address
// transport._apiKey → API key
// transport.isConnected → boolean
// transport.channel → gRPC channel object
```

---

## 3. React SDK (`@cmdop/react`)

```bash
npm install @cmdop/react  # + centrifuge, swr as peer deps
```

### Провайдеры

```tsx
import { CMDOPProvider, WebSocketProvider } from "@cmdop/react";

// 1. CMDOPProvider — HTTP API authentication
<CMDOPProvider token={jwtToken}>
  {/* Устанавливает JWT на machines и workspaces модули */}
  {/* Props: { children, apiKey?, token? } */}
</CMDOPProvider>

// 2. WebSocketProvider — WebSocket (Centrifugo)
<WebSocketProvider
  url="wss://ws.cmdop.com/connection/websocket"
  getToken={async () => jwtToken}
  autoConnect={true}  // default
  debug={false}       // default
>
  {/* Подключается к Centrifugo WebSocket */}
</WebSocketProvider>
```

### Хуки

#### `useTerminal` — Терминал в реальном времени

```tsx
import { useTerminal } from "@cmdop/react";

const {
  isConnected,    // boolean — подписан на оба канала (output + status)
  isConnecting,   // boolean
  error,          // Error | null
  output,         // string — накопленный output
  status,         // TerminalStatus | null
  sendInput,      // (data: string) => Promise<void>
  resize,         // (cols: number, rows: number) => Promise<void>
  signal,         // (sig: number | string) => Promise<void>
  clear,          // () => void — очистка output буфера
} = useTerminal({
  sessionId: "UUID сессии",  // НЕ имя машины!
  enabled: true,
  onOutput: (data: string) => { /* текст из терминала */ },
  onStatus: (status) => { /* { state: 'active'|'closed'|'error', exitCode? } */ },
  onError: (error) => { /* Error */ },
});
```

**Как работает внутри:**
- Подписывается на WebSocket каналы:
  - `terminal#${sessionId}#output` → `onOutput(data.data)`
  - `terminal#${sessionId}#status` → `onStatus(data)`
- `isConnected = isOutputSubscribed && isStatusSubscribed`
- Отправляет через Centrifugo RPC:
  - `terminal.input { session_id, data }`
  - `terminal.resize { session_id, cols, rows }`
  - `terminal.signal { session_id, signal }`

#### `useMachines` — Список машин

```tsx
import { useMachines } from "@cmdop/react";

const {
  machines,      // Machine[] — список машин
  total,         // number
  isLoading,     // boolean
  isValidating,  // boolean (SWR)
  error,         // Error | undefined
  refetch,       // () => void
} = useMachines({ page, pageSize });

// Machine:
// { id, name, hostname, status, workspace, active_terminal_session?, ... }
// active_terminal_session: { session_id, created_at } | null
```

**Как работает:**
- Использует SWR для кэширования (`["machines", page, pageSize]`)
- Вызывает `machines.machines_machines.machinesList()` — HTTP API
- Требует JWT токен (устанавливается через `CMDOPProvider`)

#### `useMachine` — Одна машина

```tsx
const { machine, isLoading, error, refetch } = useMachine(machineId);
```

#### `useWorkspaces` / `useWorkspace` — Рабочие пространства

```tsx
const { workspaces, total, isLoading } = useWorkspaces();
const { workspace, isLoading } = useWorkspace(workspaceId);
```

#### `useAgent` — AI Агент

```tsx
const {
  run,            // (prompt, options?) => Promise<string>
  isRunning,      // boolean
  streamingText,  // string — потоковый текст
  result,         // string | null — финальный результат
  toolCalls,      // AgentToolCallEvent['data'][]
  error,          // Error | null
  reset,          // () => void
  cancel,         // () => Promise<void>
} = useAgent({
  sessionId: "...",
  onToken: (text) => {},
  onToolCall: (call) => {},
  onToolResult: (result) => {},
  onDone: (result) => {},
  onError: (error) => {},
});

await run("Hello!", { mode: "chat", timeoutSeconds: 300 });
```

**Как работает:**
- `run` → RPC `agent.run { session_id, prompt, mode, timeout_seconds }`
- Подписка на `agent#${requestId}#events` → token, tool_call, tool_result, done, error
- `cancel` → RPC `agent.cancel { request_id }`

#### `useWebSocket` — Доступ к WebSocket состоянию

```tsx
const {
  client,       // CMDOPWebSocketClient | null
  isConnected,  // boolean
  isConnecting, // boolean
  error,        // Error | null
  connect,      // () => Promise<void>
  disconnect,   // () => void
} = useWebSocket();
```

#### `useSubscription` — Подписка на канал

```tsx
const { data, error, isSubscribed } = useSubscription({
  channel: "terminal#uuid#output",
  enabled: true,
  onData: (data) => {},
  onError: (error) => {},
});
```

#### `useRPC` — RPC вызовы

```tsx
const { call, isLoading, error, reset } = useRPC();
const result = await call("terminal.input", { session_id, data });
```

---

## 4. OAuth Device Code Flow

Единственный способ получить JWT (`clit_...`) для HTTP API и WebSocket.

### Шаг 1: Запросить device code

```
POST https://api.cmdop.com/api/system/oauth/device/
Content-Type: application/json

{ "client_id": "cmdop-desktop" }
```

**Ответ:**
```json
{
  "device_code": "M_DKt5IfPhni...",
  "user_code": "221415",
  "verification_uri": "https://my.cmdop.com/dashboard/device?code=221415",
  "expires_in": 899,
  "interval": 5
}
```

### Шаг 2: Пользователь переходит по ссылке и вводит код

### Шаг 3: Поллинг токена

```
POST https://api.cmdop.com/api/system/oauth/token/
Content-Type: application/json

{
  "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
  "device_code": "M_DKt5IfPhni...",
  "client_id": "cmdop-desktop"
}
```

**Ответ (ожидание):**
```json
{ "error": "authorization_pending" }
```

**Ответ (успех):**
```json
{
  "access_token": "clit_...",
  "refresh_token": "clitr_...",
  "expires_in": 86400,
  "token_type": "Bearer"
}
```

### Шаг 4: Обновление токена

```
POST https://api.cmdop.com/api/system/oauth/token/
Content-Type: application/json

{
  "grant_type": "refresh_token",
  "refresh_token": "clitr_...",
  "client_id": "cmdop-desktop"
}
```

---

## 5. Ключевые находки

### Что РАБОТАЕТ через gRPC (API key `cmd_...`)

| Операция | Node.js | Python (async) | Python (sync) |
|----------|---------|----------------|---------------|
| list sessions | `terminal.list()` | `terminal.list_sessions()` | - |
| get status | `terminal.getStatus(sid)` | - | - |
| get active session | - | `terminal.get_active_session(hostname)` | - |
| send input | `terminal.sendInput(sid, data)` | `terminal.send_input(sid, data)` | `terminal.send_input(sid, data)` |
| resize | `terminal.resize(sid, cols, rows)` | `terminal.resize(sid, cols, rows)` | `terminal.resize(sid, cols, rows)` |
| signal | `terminal.signal(sid, sig)` | `terminal.send_signal(sid, sig)` | `terminal.send_signal(sid, sig)` |
| create session | `terminal.create(opts)` | `terminal.create(...)` | `terminal.create(...)` |
| close session | `terminal.close(sid)` | `terminal.close(sid)` | `terminal.close(sid)` |

### agent.run() — ВЫПОЛНЕНИЕ КОМАНД С ПОЛУЧЕНИЕМ OUTPUT

**Ключевая находка:** `agent.run()` с `session_id` позволяет выполнять команды на удалённой машине и получать полный output через gRPC — **без JWT и WebSocket!**

```python
# Python
result = await client.agent.run(
    "Run: ls -la / — return raw output only.",
    session_id=sid
)
print(result.text)  # полный вывод ls -la /
print(result.success)  # True
print(result.duration_ms)  # ~5-8 сек
```

```javascript
// Node.js (сигнатура отличается! sessionId ПЕРВЫМ аргументом)
const result = await client.agent.run(sid, "Run: ls -la / — return raw output only.");
console.log(result.text);  // полный вывод
console.log(result.success);  // true
console.log(result.durationMs);  // ~7000ms
```

**Протестированные команды:**
| Команда | Результат |
|---------|-----------|
| `ls -la /` | Полный листинг root — 23+ каталогов |
| `ls -la ~` | Домашняя папка root — Desktop, Documents, Downloads... |
| `whoami && hostname && uname -a` | `root`, `aicmdop`, Linux 6.5.0-1017-azure x86_64 |
| `cat /etc/os-release` | Ubuntu 22.04.4 LTS (Jammy Jellyfish) |
| `df -h` | 29G root + 20 дисков по ~1TB |

> **Важно:** `agent.run()` использует AI-агент на стороне сервера. Он интерпретирует промпт, выполняет команду и возвращает результат. Для raw output используйте промпт типа "return raw output only".

### files service (Node.js) — ПРЯМОЙ ДОСТУП К ФАЙЛАМ

**Node.js SDK `files` сервис работает с sessionId!**

```javascript
// Листинг файлов (РАБОТАЕТ)
const result = await client.files.list(sid, "/");
// entries: [{ name, type, size, permissions, modifiedAt, ... }]

// Чтение файлов (РАБОТАЕТ)
const file = await client.files.read(sid, "/etc/hostname");
// file.content → "suenotpc"

// Информация о файле (РАБОТАЕТ)
const stat = await client.files.stat(sid, "/");
// { name, path, type, size, permissions, modifiedAt, isReadable, isWritable }

// Поиск файлов (РАБОТАЕТ)
const found = await client.files.search(sid, "/etc", { pattern: "*.conf" });
// matches: [{ name, path, type, size, permissions, ... }]
```

### files service (Python) — возвращает пустые данные

Python `files` сервис НЕ принимает `session_id` (его нет в сигнатуре) → возвращает пустые данные:

```python
# Не работает — нет параметра session_id
result = await client.files.list("/")  # пустой ListDirectoryResponse
data = await client.files.read("/etc/hostname")  # пустой bytes
```

### Что НЕ РАБОТАЕТ / ограничения

| Операция | Почему |
|----------|--------|
| `getHistory()` / `get_history()` | История команд (всегда пуста), НЕ буфер вывода |
| `execute()` (Python) | Возвращает `(b'', -1)` — зависит от getHistory |
| `files.*` (Python) | Нет `session_id` в сигнатуре → пустые данные |
| `agent.run_stream()` | `NotImplementedError` в Python SDK |
| `TerminalStream.on_output` | Всегда 0 chunks — agent-side only |
| `AgentDiscovery.list_agents()` | HTTP 404 |

### Три способа получить данные с удалённой машины

| Способ | SDK | Auth | Скорость | Что получаем |
|--------|-----|------|----------|-------------|
| **agent.run(sid, prompt)** | Node.js / Python | API key (`cmd_...`) | ~5-8 сек | Результат команды через AI-агент |
| **files.*(sid, path)** | Node.js | API key (`cmd_...`) | <1 сек | Прямой доступ к файлам: list, read, stat, search |
| **WebSocket subscribe** | React | JWT (`clit_...`) | Реальное время | Поток output терминала |

### Session ID = UUID, НЕ имя машины

```
Правильно: 4aac8db9-2a91-5547-a665-d117dd326c66
Неправильно: suenotpc, Suenotpc
```

Как найти UUID:
- gRPC: `list()` / `list_sessions()` → найти по `machineName` / `machine_name`
- HTTP API: `GET /api/machines/machines/` → `machine.active_terminal_session.session_id`

---

## 6. Полный flow для клиентского приложения

### Вариант A: Только API key (gRPC) — ПРОСТОЙ

```
1. API key из .env (cmd_...)

2. gRPC: terminal.list() → найти connected session → sessionId (UUID)

3. Работа с файлами (Node.js):
   files.list(sid, "/")      → листинг каталога
   files.read(sid, path)     → чтение файла
   files.stat(sid, path)     → информация о файле
   files.search(sid, dir, {pattern})  → поиск файлов
   files.write(sid, path, content)    → запись файла

4. Выполнение команд (Node.js / Python):
   agent.run(sid, "Run: ls -la / — return raw output only")
   → { success: true, text: "полный вывод", durationMs: ~7000 }

5. Управление терминалом:
   terminal.sendInput(sid, "command\n")  → отправить ввод
   terminal.resize(sid, cols, rows)      → изменить размер
   terminal.signal(sid, "SIGINT")        → отправить сигнал
```

**Ограничения:** нет потокового output в реальном времени (5-8 сек задержка agent.run)

### Вариант B: JWT (WebSocket) — ПОЛНЫЙ REAL-TIME

```
1. OAuth Device Code Flow → JWT (clit_...)

2. HTTP API с JWT:
   GET /api/machines/machines/ → машины с active_terminal_session.session_id

3. WebSocket с JWT:
   Subscribe: terminal#${sessionId}#output → output в реальном времени
   Subscribe: terminal#${sessionId}#status → статус
   RPC: terminal.input { session_id, data } → ввод
   RPC: terminal.resize { session_id, cols, rows } → resize
   RPC: terminal.signal { session_id, signal } → сигнал
```

React SDK (`@cmdop/react`) реализует вариант B:
- `CMDOPProvider` → JWT для HTTP API
- `WebSocketProvider` → Centrifugo WebSocket
- `useMachines()` → HTTP API, находит machine и session_id
- `useTerminal({ sessionId })` → WebSocket subscribe + RPC

---

## 7. Endpoints

| Тип | URL | Auth |
|-----|-----|------|
| gRPC | `grpc.cmdop.com:443` | `Bearer cmd_...` (metadata) |
| HTTP API | `https://api.cmdop.com/api/machines/machines/` | `Bearer clit_...` (header) |
| HTTP OAuth | `https://api.cmdop.com/api/system/oauth/device/` | none |
| HTTP OAuth | `https://api.cmdop.com/api/system/oauth/token/` | none |
| WebSocket | `wss://ws.cmdop.com/connection/websocket` | JWT `clit_...` (Centrifugo) |
| Dashboard | `https://my.cmdop.com/dashboard/device` | user browser |

---

## 8. Тестовые скрипты

| Файл | Что тестирует | Результат |
|------|---------------|-----------|
| `test-node-full.js` | Node.js terminal SDK | list, status, sendInput ✅; history пуст |
| `test-node-agent2.js` | Node.js agent + files | **agent.run ✅, files.list ✅, files.read ✅, files.stat ✅, files.search ✅** |
| `test-agent-deep.py` | Python agent.run подробно | **ls, whoami, cat, df — всё работает!** |
| `test-files-agent.py` | Python files + agent + terminal | agent.run ✅; files пусто; execute пусто |
| `test-all-services.py` | Инспекция всех сервисов | Полная карта API всех сервисов |
| `test-python-full.py` | Python sync + async | sync ограничен; async полный |
| `test-python-full2.py` | Python async подробно | get_active_session, files, agent, discovery |
| `test-core-http.js` | @cmdop/core, HTTP API, OAuth | API key не для HTTP; OAuth работает |
| `test-react-api.js` | React SDK анализ кода | Все хуки, каналы, RPC |
| `test-ws-direct.js` | WebSocket с API key | Centrifugo требует JWT (код 3500) |
| `test-machines.js` | Список машин | Suenotpc ONLINE, macbook OFFLINE |
| `test-oauth-get-jwt.js` | OAuth Device Code Flow | Готов к запуску, получает JWT |
| `test-ls.py` | Python: execute + getHistory | Всё пусто, sendInput работает |
| `test-ls2.py` | Python: TerminalStream | Подключается, но 0 output |
