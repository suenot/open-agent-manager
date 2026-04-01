# SPECIFY.md — Open Agent Manager

## Название проекта

**Open Agent Manager** (рабочее: `ccam`)

## Одним предложением

Нативное macOS-приложение — кастомный терминал для параллельного управления несколькими интерактивными сессиями Claude Code, с группировкой по проектам и опциональным удалённым доступом с телефона через CMDOP SDK.

---

## Проблема

Разработчик ведёт 5–10 проектов одновременно. Для каждого нужен свой Claude Code в своей директории, со своими .claude/ конфигами, MCP-серверами и переменными окружения. Сейчас это выглядит так: открыть iTerm, создать вкладку, `cd /path/to/project`, `claude`, повторить 5 раз. Между проектами — ⌘Tab, потеря контекста, нет общей картины.

Дополнительная боль: уехал из дома, а на домашнем маке или сервере крутятся агенты. Хочется проверить статус / дать новый промпт с телефона — и нечем.

## Решение

Нативное десктопное приложение (Tauri v2) — кастомный терминал, аналог Warp/Antigravity Agent Manager, в котором:

- Sidebar — дерево проектов/workspaces
- Каждый проект открывается как отдельный терминальный таб с запущенным `claude` в интерактивном режиме
- Под капотом — настоящие PTY-процессы (как в iTerm), никакого headless/`-p`
- Опционально: CMDOP-агент для удалённого доступа с телефона

---

## Целевая аудитория

Разработчики, которые:
- Используют Claude Code ежедневно
- Ведут несколько проектов параллельно
- Хотят единый интерфейс управления агентами
- (Опционально) хотят доступ к агентам с мобильного устройства

## User stories

1. **Как разработчик**, я хочу открыть приложение и увидеть все свои проекты в sidebar, чтобы быстро переключаться между Claude Code сессиями
2. **Как разработчик**, я хочу кликнуть на проект и сразу получить терминал с запущенным `claude` в правильной директории с правильными env-переменными
3. **Как разработчик**, я хочу видеть несколько терминалов одновременно (split view), чтобы параллельно работать с разными проектами
4. **Как разработчик**, я хочу видеть метрики (токены, стоимость) по каждой сессии
5. **Как разработчик**, я хочу сохранять шаблоны промптов per-project (review, fix, deploy-check)
6. **Как разработчик**, я хочу управлять запущенными агентами с телефона, когда я не за компьютером

---

## Стек технологий

| Компонент | Технология | Обоснование |
|-----------|-----------|-------------|
| Runtime | **Tauri v2** | Нативное macOS окно, ~5MB бандл, Rust backend |
| PTY | **portable-pty** (crate) | Настоящие PTY-процессы, кросс-платформа |
| Терминал | **@xterm/xterm 5.x** + WebGL addon | GPU-рендеринг, стандарт индустрии |
| Frontend | **React 19** + **Vite** | Быстрый dev, HMR, знакомый стек |
| State | **Zustand** | Минимальный, без бойлерплейта |
| Стили | **TailwindCSS** | Utility-first, dark theme |
| Хранилище | **SQLite** (rusqlite) | Проекты, сессии, метрики |
| IPC | **Tauri Commands + Events** | Типизированный bridge Rust ↔ JS |
| Удалённый доступ | **CMDOP SDK** (опционально) | Доступ к терминалам с телефона |

### Почему не Electron?

- Tauri бандл: ~5-10MB vs Electron ~200MB
- Нативный WebView вместо Chromium
- Rust backend = производительность + безопасность
- Tauri v2 поддерживает мультиокна, system tray, auto-update

### Почему не tauri-plugin-pty?

Для MVP можно использовать `tauri-plugin-pty` (готовый плагин, минимум кода). Для продакшена — свой `PtyManager` на `portable-pty`, чтобы контролировать lifecycle, метрики, рестарт, graceful shutdown.

Рекомендация: **начать с tauri-plugin-pty, переписать на свой PtyManager в v0.2**.

---

## Архитектура

### Слои

```
┌─────────────────────────────────────────────────┐
│  React UI (xterm.js + TailwindCSS)              │
│  Sidebar │ Tab Bar │ Terminal Panes │ Status Bar │
├─────────────────────────────────────────────────┤
│  Tauri IPC Commands + Events                     │
│  spawn_pty, write_pty, kill_pty, resize_pty      │
├─────────────────────────────────────────────────┤
│  Rust Backend                                    │
│  PtyManager │ SessionStore │ ConfigLoader         │
├─────────────────────────────────────────────────┤
│  System (macOS)                                  │
│  PTY processes (claude) │ File System │ Keychain  │
├─────────────────────────────────────────────────┤
│  CMDOP Agent (опционально)                       │
│  Remote terminal relay │ WebSocket tunnel          │
└─────────────────────────────────────────────────┘
```

### Поток данных — открытие проекта

1. Пользователь кликает проект в sidebar
2. UI вызывает Tauri command: `invoke("spawn_pty", { cwd, cmd: "claude", env })`
3. Rust: `portable-pty` создаёт PTY, запускает `claude` в интерактивном режиме
4. PTY stdout → Tauri event → xterm.js `.write()`
5. xterm.js input → Tauri command → PTY stdin `.write()`
6. Полный интерактив: пользователь общается с Claude Code как в обычном терминале

### Поток данных — удалённый доступ (CMDOP)

1. На хосте запущен `cmdop agent start` (фоновый процесс)
2. CMDOP agent создаёт WebSocket-туннель к облаку CMDOP
3. С телефона: `my.cmdop.com` → видны все сессии
4. Пользователь выбирает сессию → CMDOP пробрасывает I/O к PTY
5. Ввод с телефона → CMDOP cloud → CMDOP agent → PTY stdin
6. PTY stdout → CMDOP agent → CMDOP cloud → телефон

---

## Интерфейс

### Layout

```
┌──────────────────────────────────────────────────────┐
│  ● ● ●  Open Agent Manager                ⌘K  ⚙    │
├────────┬─────────────────────────────────────────────┤
│        │  [marketmaker-cc] [listing] [relisted]  +   │
│ ПРОЕКТЫ│─────────────────────────────────────────────│
│        │                                             │
│ ● mm-cc│  $ claude                                   │
│ ○ list.│  > Analyzing src/components/Card.tsx...     │
│ ○ reli.│  > Found 3 issues:                         │
│ ○ refor│  >   1. Missing key prop in map()           │
│ ○ maccl│  >   2. Unused import                       │
│        │  >   3. Memory leak in useEffect            │
│────────│  > Fixing...                                │
│ ШАБЛОНЫ│  > ✓ All issues fixed                       │
│ review │  > █                                        │
│ fix    │                                             │
│ deploy │                                             │
│────────│                                             │
│ ⚙ CMDOP│                                             │
│ ● Online│                                            │
├────────┴─────────────────────────────────────────────┤
│ ● 3 agents │ ↑24.1K ↓8.3K tokens │ $0.12 │ sonnet  │
└──────────────────────────────────────────────────────┘
```

### Компоненты UI

| Компонент | Описание |
|-----------|---------|
| **Sidebar** | Дерево проектов. Статус (●/○). Секция шаблонов. CMDOP-статус |
| **Tab Bar** | Табы активных сессий. Drag-n-drop. Кнопка +. Кнопка ✕ |
| **Terminal Pane** | xterm.js c WebGL. Полный интерактив с claude. Тема: dark |
| **Status Bar** | Кол-во агентов, токены, стоимость, текущая модель |
| **Command Palette** | ⌘K — поиск, переключение проектов, вставка шаблонов |
| **Split View** | Горизонтальный/вертикальный сплит для 2+ терминалов |
| **Settings** | Управление проектами, CMDOP конфиг, тема, шрифт |

---

## Модель данных

### Projects (SQLite)

```sql
CREATE TABLE projects (
  id          TEXT PRIMARY KEY,           -- uuid
  name        TEXT NOT NULL,
  path        TEXT NOT NULL UNIQUE,       -- абсолютный путь
  description TEXT,
  icon        TEXT DEFAULT '📁',
  system_prompt TEXT,                     -- append к дефолтному
  env_vars    TEXT DEFAULT '{}',          -- JSON: { KEY: VALUE }
  mcp_config  TEXT DEFAULT '{}',          -- JSON: MCP серверы
  templates   TEXT DEFAULT '[]',          -- JSON: [{ name, prompt }]
  sort_order  INTEGER DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Sessions (SQLite)

```sql
CREATE TABLE sessions (
  id              TEXT PRIMARY KEY,       -- uuid
  project_id      TEXT REFERENCES projects(id),
  claude_session  TEXT,                   -- session_id из claude (для --resume)
  status          TEXT DEFAULT 'running', -- running | stopped | error
  input_tokens    INTEGER DEFAULT 0,
  output_tokens   INTEGER DEFAULT 0,
  cost_usd        REAL DEFAULT 0,
  started_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  stopped_at      DATETIME
);
```

### Prompt Templates (в projects.templates JSON)

```json
[
  { "name": "review", "prompt": "Review all recent changes for bugs, security issues, and code style" },
  { "name": "fix", "prompt": "Fix all issues found in the review" },
  { "name": "deploy-check", "prompt": "Run build, analyze errors, suggest fixes" }
]
```

---

## Tauri Commands (IPC API)

### PTY Management

| Command | Params | Return | Description |
|---------|--------|--------|-------------|
| `spawn_pty` | `{ session_id, project_id, cwd, cmd?, args?, env?, cols, rows }` | `Result<()>` | Создать PTY, запустить `claude` |
| `write_pty` | `{ session_id, data: string }` | `Result<()>` | Отправить данные в PTY stdin |
| `resize_pty` | `{ session_id, cols, rows }` | `Result<()>` | Изменить размер PTY |
| `kill_pty` | `{ session_id }` | `Result<()>` | Завершить PTY |
| `list_sessions` | — | `Vec<SessionInfo>` | Список активных PTY |

### Tauri Events (Rust → JS)

| Event | Payload | Description |
|-------|---------|-------------|
| `pty-output-{session_id}` | `string` (raw bytes) | Данные из PTY stdout |
| `pty-exit-{session_id}` | `{ code: number }` | PTY процесс завершился |

### Projects CRUD

| Command | Params | Return | Description |
|---------|--------|--------|-------------|
| `get_projects` | — | `Vec<Project>` | Все проекты |
| `add_project` | `Project` | `Result<Project>` | Добавить проект |
| `update_project` | `Project` | `Result<()>` | Обновить проект |
| `delete_project` | `{ id }` | `Result<()>` | Удалить проект |
| `import_claude_config` | `{ path }` | `Result<Project>` | Импорт из .claude/ |

---

## CMDOP интеграция (опционально)

### Что такое CMDOP

CMDOP — CLI-инструмент для удалённого доступа к терминалу. Позволяет управлять машиной откуда угодно через `my.cmdop.com` или CMDOP SDK.

### Как интегрируется

CMDOP работает как **отдельный слой** и не влияет на ядро приложения:

```
[Локально]                          [Удалённо]
                                    
ccam app                            Телефон (браузер/приложение)
  └── PTY Manager                     └── my.cmdop.com / CMDOP SDK
        └── PTY processes                    │
              ↑↓                              │ WebSocket tunnel
        cmdop agent  ←──── CMDOP Cloud ──────┘
```

### Уровни интеграции

**Уровень 1: Standalone (без интеграции в UI)**

Пользователь сам ставит `cmdop agent start`. CMDOP автоматически видит все терминальные сессии на машине, включая PTY от ccam. Работает из коробки, без единой строчки кода в ccam.

```bash
# На маке
cmdop login
cmdop agent start

# На телефоне — зайти на my.cmdop.com, увидеть сессии
```

**Уровень 2: Интеграция в UI**

ccam показывает CMDOP-статус в sidebar, может запускать/останавливать cmdop agent, показывать URL для подключения.

```rust
// Tauri commands
#[tauri::command]
fn cmdop_status() -> CmdopStatus { /* проверяем cmdop agent status */ }

#[tauri::command]  
fn cmdop_start() -> Result<()> { /* запускаем cmdop agent start */ }

#[tauri::command]
fn cmdop_stop() -> Result<()> { /* останавливаем cmdop agent stop */ }
```

**Уровень 3: Deep интеграция через CMDOP SDK**

Используем `@cmdop/node` или `@cmdop/react` SDK для:

- Проброса конкретных PTY-сессий (не всех, а выбранных) через CMDOP
- Показа вывода конкретного агента на телефоне
- Отправки промптов удалённо

```typescript
// Пример: React-компонент для мобильного UI
import { useTerminal } from '@cmdop/react';

function RemoteAgent({ sessionId }: { sessionId: string }) {
  const { output, sendInput } = useTerminal({ sessionId });
  return (
    <div>
      <pre>{output}</pre>
      <input onKeyDown={(e) => sendInput(e.target.value)} />
    </div>
  );
}
```

### Рекомендация

- **MVP**: Уровень 1 (standalone). Ноль кода. Просто документация: "установите cmdop для удалённого доступа"
- **v0.2**: Уровень 2. Кнопка CMDOP в sidebar, статус, старт/стоп
- **v0.3+**: Уровень 3. Если нужен кастомный мобильный UI или гранулярный контроль

### CMDOP зависимости

| Пакет | Когда нужен | Описание |
|-------|-------------|----------|
| `cmdop` CLI | Уровень 1-2 | `curl -sSL https://cmdop.com/install.sh \| bash` |
| `@cmdop/node` | Уровень 3 | `npm install @cmdop/node` — серверный SDK |
| `@cmdop/react` | Уровень 3 | `npm install @cmdop/react` — React hooks |
| `cmdop` (Python) | Не нужен | `pip install cmdop` — если будет Python-часть |

---

## Файловая структура проекта

```
claude-agent-manager/
├── src-tauri/
│   ├── Cargo.toml                    # tauri, portable-pty, rusqlite, serde, chrono
│   ├── tauri.conf.json               # Tauri v2 конфиг, permissions, window settings
│   ├── capabilities/
│   │   └── default.json              # Tauri v2 capabilities (shell, fs, etc.)
│   ├── src/
│   │   ├── main.rs                   # Entry point, state management
│   │   ├── commands/
│   │   │   ├── mod.rs
│   │   │   ├── pty.rs                # spawn_pty, write_pty, kill_pty, resize_pty
│   │   │   ├── projects.rs           # CRUD проектов
│   │   │   └── cmdop.rs              # CMDOP status/start/stop (v0.2)
│   │   ├── pty_manager.rs            # PTY pool, lifecycle, events
│   │   ├── db.rs                     # SQLite: проекты, сессии, метрики
│   │   └── config.rs                 # Загрузка .claude/ конфигов, env
│   └── icons/                        # Иконки приложения
│
├── src/                              # React frontend
│   ├── main.tsx                      # Entry point
│   ├── App.tsx                       # Root layout
│   ├── components/
│   │   ├── Sidebar/
│   │   │   ├── Sidebar.tsx           # Дерево проектов
│   │   │   ├── ProjectItem.tsx       # Элемент проекта со статусом
│   │   │   └── CmdopStatus.tsx       # CMDOP индикатор (v0.2)
│   │   ├── Terminal/
│   │   │   ├── TerminalPane.tsx      # xterm.js + PTY bridge
│   │   │   ├── TerminalTabs.tsx      # Tab bar
│   │   │   └── SplitView.tsx         # Split layout (v0.2)
│   │   ├── StatusBar.tsx             # Метрики, токены
│   │   ├── CommandPalette.tsx        # ⌘K (v0.2)
│   │   └── Settings/
│   │       ├── Settings.tsx          # Главный экран настроек
│   │       ├── ProjectEditor.tsx     # Добавление/редактирование проекта
│   │       └── CmdopConfig.tsx       # CMDOP настройки (v0.2)
│   ├── hooks/
│   │   ├── usePty.ts                 # PTY lifecycle, events
│   │   ├── useProjects.ts            # Projects CRUD
│   │   └── useCmdop.ts              # CMDOP status (v0.2)
│   ├── stores/
│   │   └── store.ts                  # Zustand: sessions, projects, ui state
│   └── styles/
│       └── terminal-theme.ts         # xterm.js тема
│
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── data/
    └── projects.json                 # Начальные проекты (→ SQLite)
```

---

## Конфигурация проекта

### Через UI (Settings → Add Project)

Пользователь указывает:
- **Name**: отображаемое имя
- **Path**: абсолютный путь к директории проекта
- **Icon**: эмодзи
- **Environment Variables**: KEY=VALUE (опционально)
- **System Prompt**: дополнительные инструкции для claude (опционально)
- **Templates**: именованные промпты (опционально)

### Авто-импорт из .claude/

Если в директории проекта есть `.claude/`, ccam может подтянуть:
- `CLAUDE.md` → description
- `.claude/settings.json` → MCP серверы, allowedTools
- `.env` → environment variables

### Пример конфига (внутренний JSON в SQLite)

```json
{
  "id": "proj-mm-cc",
  "name": "marketmaker-cc",
  "path": "/Users/suenot/projects/marketmaker-cc-landing",
  "icon": "📈",
  "env_vars": {
    "NODE_ENV": "development"
  },
  "templates": [
    { "name": "review", "prompt": "Review recent changes for bugs and style issues" },
    { "name": "build-check", "prompt": "Run vercel build and fix any errors" }
  ]
}
```

---

## Клавиатурные сочетания

| Shortcut | Action |
|----------|--------|
| `⌘K` | Command Palette |
| `⌘T` | Новая сессия для текущего проекта |
| `⌘W` | Закрыть текущий таб |
| `⌘1-9` | Переключиться на таб N |
| `⌘\` | Split view (toggle) |
| `⌘]` / `⌘[` | Следующий / предыдущий таб |
| `⌘,` | Settings |
| `⌘Shift+P` | Вставить шаблон промпта |

---

## Roadmap

### MVP (2-3 вечера)

- [ ] Tauri v2 scaffolding
- [ ] Sidebar с хардкод-списком проектов
- [ ] `spawn_pty` → запуск `claude` в интерактивном режиме per-project
- [ ] xterm.js c WebGL addon, bridge к PTY через Tauri events
- [ ] Tab switching между сессиями
- [ ] Базовая тёмная тема
- [ ] CMDOP: уровень 1 (standalone, просто README инструкция)

### v0.2 (1 неделя)

- [ ] SQLite для проектов и сессий
- [ ] CRUD проектов в UI (Settings → Add/Edit/Delete)
- [ ] Command Palette (⌘K)
- [ ] Split view (горизонтальный/вертикальный)
- [ ] Парсинг метрик из ANSI-вывода claude (токены, стоимость)
- [ ] Status bar с метриками
- [ ] Переход на свой PtyManager (с portable-pty)
- [ ] CMDOP: уровень 2 (кнопка в sidebar, старт/стоп/статус)

### v0.3 (2 недели)

- [ ] Шаблоны промптов per-project
- [ ] Авто-импорт из .claude/ конфигов
- [ ] Drag & drop проектов в sidebar
- [ ] Notifications при завершении задачи (macOS native)
- [ ] Автозапуск выбранных агентов при старте приложения
- [ ] CMDOP: уровень 3 (SDK интеграция, гранулярный проброс сессий)

### v1.0

- [ ] Multi-agent координация (TeammateTool когда включат)
- [ ] Workflow конструктор (цепочки: review → fix → test → commit)
- [ ] Плагинная система
- [ ] Auto-update через Tauri updater
- [ ] Homebrew cask + GitHub Releases
- [ ] Экспорт/импорт конфигов (шаринг между машинами)

---

## Зависимости

### Cargo.toml (Rust)

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon", "system-tray"] }
tauri-plugin-shell = "2"
portable-pty = "0.8"
rusqlite = { version = "0.31", features = ["bundled"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1", features = ["v4"] }
```

### package.json (JS)

```json
{
  "dependencies": {
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-shell": "^2.0.0",
    "@xterm/xterm": "^5.5.0",
    "@xterm/addon-fit": "^0.10.0",
    "@xterm/addon-webgl": "^0.18.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.0"
  }
}
```

### Опционально (CMDOP)

```json
{
  "@cmdop/node": "latest",
  "@cmdop/react": "latest"
}
```

---

## Требования к системе

- **macOS** 12+ (Monterey и выше)
- **Claude Code** установлен и доступен в PATH (`claude` CLI)
- **ANTHROPIC_API_KEY** в окружении или macOS Keychain
- **Node.js** 18+ (требование Claude Code)
- **CMDOP** (опционально): `cmdop` CLI установлен для удалённого доступа

---

## Лицензия

MIT (open source)

---

## Открытые вопросы

1. **Парсинг метрик из claude**: Claude Code выводит информацию о токенах и стоимости в ANSI-формате. Нужно reverse-engineer'ить формат или использовать `--output-format json` для параллельной сессии? Или парсить из `~/.claude/` логов?
2. **TeammateTool**: Когда Anthropic включит feature flags, нужно ли нативно интегрировать multi-agent координацию или оставить это на уровне отдельных PTY?
3. **Кроссплатформа**: MVP только macOS. Стоит ли сразу закладывать Linux/Windows или отложить?
4. **CMDOP pricing**: Бесплатный тир CMDOP покрывает базовый use case? Нужно проверить лимиты.
5. **Брендинг**: Финальное название продукта, иконка, домен.
