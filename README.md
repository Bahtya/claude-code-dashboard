# Claude Code Dashboard

A real-time web dashboard for inspecting Claude Code session data stored in `~/.claude/`. It reads JSONL session files, JSON config files, and history to display projects, sessions, subagent conversations, todos, command history, and activity timeline.

## Screenshots

### Cyberpunk Theme (Default)

![Cyberpunk Theme](public/screenshots/cyberpunk-theme.png)

Dark neon aesthetics with glassmorphism effects and animated particle background.

### Moltbook Theme

![Moltbook Theme](public/screenshots/moltbook-theme.png)

Warm and modern design with coral and teal accents, inspired by [moltbook.com](https://www.moltbook.com/).

## Features

- **Dual Theme System**
  - Cyberpunk (Dark Neon) - Default dark theme with cyan and magenta accents
  - Moltbook (Warm Modern) - Light theme inspired by [moltbook.com](https://www.moltbook.com/)

- **Real-time Updates**
  - WebSocket-based live data synchronization
  - Auto-refresh chat when session files change

- **Session Explorer**
  - Browse all projects and sessions
  - View subagent conversations
  - Track activity timeline

- **Activity Tracking**
  - Statistics overview (projects, sessions, messages, agents)
  - Visual activity chart
  - Todo status monitoring
  - Command history display

## Installation

```bash
# Clone the repository
git clone git@github.com:Bahtya/claude-code-dashboard.git
cd claude-code-dashboard

# Install dependencies
npm install
```

## Usage

```bash
# Start the server
npm start

# Or use the Windows launcher
启动Dashboard.bat
```

Visit [http://localhost:3200](http://localhost:3200) in your browser.

Use the theme selector in the header to switch between Cyberpunk and Moltbook themes.

## Desktop Application

The dashboard can also be packaged as a desktop application using Electron:

```bash
# Install Electron (may require VPN/proxy in China)
npm install electron electron-builder

# Run in development mode
npm run electron-dev

# Build Windows installer
npm run dist
```

## How It Works

The dashboard reads Claude Code session data from:
- `~/.claude/projects/*/**.jsonl` - Session messages
- `~/.claude/stats-cache.json` - Cached statistics
- `~/.claude/history.jsonl` - Command history
- `~/.claude/todos/*.json` - Todos
- `~/.claude/settings.json` - User settings

The server uses Chokidar to watch for file changes and broadcasts updates to all connected clients via WebSocket.

### Claude Code Agent Teams Communication Mechanism

> Source: [Jerome.Y. (@alterxyz4)](https://x.com/alterxyz4/status/2021892207574405386)

Claude Code's Agent Teams feature uses an extremely simple file system as a message queue, without any message middleware, database, or network communication.

**Three Core Primitives:**

1. **File System Message Queue** — Each agent has an inbox JSON file
2. **AsyncLocalStorage** — Node.js native async context isolation
3. **Shared Task List** — One JSON file per task

**Directory Structure:**
```
~/.claude/
├── teams/[team-name]/
│   ├── config.json          # Team config and member list
│   └── inboxes/
│       ├── team-lead.json   # Lead's inbox
│       └── observer.json    # Teammate's inbox
└── tasks/[team-name]/
    └── 1.json               # Task file
```

**Message Delivery:**
- Messages can only be delivered between conversation turns (not real-time)
- Teammate messages are injected as user messages
- Protocol messages (idle notifications, close requests) are serialized as JSON strings in the text field
- Inbox files are created on demand, each message appended to the end of the JSON array

**Two Running Modes:**
| Mode | Description |
|------|-------------|
| in-process | Within main process, AsyncLocalStorage isolates context |
| tmux | Independent tmux pane, completely separate process |

**Known Limitations:**
- No real-time capability (messages can only be delivered between turns)
- No synchronous waiting (cannot `await teammate.confirm()`)
- Context compaction kills team awareness
- Multiple teammates writing MEMORY.md simultaneously will overwrite each other

See: [docs/claude-code-agent-communication.md](docs/claude-code-agent-communication.md) for details.

## Architecture

**Backend:**
- Express server + WebSocket (ws)
- File watcher (chokidar) for real-time updates
- API routes for data retrieval

**Frontend:**
- Vanilla JavaScript (no framework)
- Glassmorphism/Cyberpunk CSS design
- WebSocket client for real-time updates
- Canvas particle animation background

**API Routes:**
- `GET /api/dashboard` - Full aggregated dashboard data
- `GET /api/messages/:projectDir/:sessionId` - Session messages
- `GET /api/subagent-messages/:projectDir/:sessionId/:agentId` - Subagent messages

## Tech Stack

- **Backend:** Node.js + Express + WebSocket (ws) + Chokidar
- **Frontend:** Vanilla JavaScript + CSS3
- **Data Source:** Reads from `~/.claude/` directory

## Project Structure

```
dashboard/
├── server.js           # Express + WebSocket server
├── public/
│   ├── index.html      # Main HTML
│   ├── css/style.css   # Dual theme styles
│   └── js/app.js       # Frontend logic
├── electron/           # Desktop app packaging
│   ├── main.js
│   └── preload.js
├── assets/             # Icons and images
└── package.json
```

## License

MIT

---

Built with :heart: for the Claude Code community
