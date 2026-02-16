# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Code Dashboard — a real-time web dashboard for inspecting Claude Code session data stored in `~/.claude/`. It reads JSONL session files, JSON config files, and history to display projects, sessions, subagent conversations, todos, command history, and activity timelines.

## Commands

```bash
npm start        # Start the server on port 3200
npm run dev       # Same as npm start (no hot reload)
npm install       # Install dependencies (express, ws, chokidar)
```

The server runs at `http://localhost:3200` with WebSocket on the same port.

## Architecture

Single-server, no build step, no bundler. Plain HTML/CSS/JS frontend served as static files.

### Backend (`server.js`)
- Express server + WebSocket (ws) + file watcher (chokidar)
- Reads from `~/.claude/` directory: `projects/*/**.jsonl` (sessions), `stats-cache.json`, `history.jsonl`, `todos/*.json`, `settings.json`
- `getDashboardData()` aggregates all data into one payload
- File changes in `~/.claude/` trigger debounced WebSocket broadcasts with the full dashboard payload
- API routes:
  - `GET /api/dashboard` — full aggregated data
  - `GET /api/messages/:projectDir/:sessionId` — session messages
  - `GET /api/subagent-messages/:projectDir/:sessionId/:agentId` — subagent messages

### Frontend (`public/`)
- `index.html` — single-page layout with particle canvas background
- `js/app.js` — all rendering logic, WebSocket client, data fetching
- `css/style.css` — glassmorphism/cyberpunk theme with CSS variables in `:root`
- No framework, no bundler — vanilla JS with innerHTML-based rendering

### Data Format (Claude Code JSONL)
Messages in `.jsonl` files have this structure:
- `type`: `"user"` or `"assistant"`
- `message.content`: either a string or an array of content blocks
- Content block types: `"text"` (with `.text`), `"tool_use"` (with `.name`, `.id`), `"tool_result"` (with `.content` as string or array, `.tool_use_id`)
- User messages can contain `tool_result` blocks (tool return values), not just plain text

### Key Functions
- `extractContent(message)` — converts message content blocks to display text; handles `text` and `tool_result` block types
- `extractToolUse(message)` — extracts tool call names from assistant messages
- `getProjects()` — maps directory names back to Windows paths (e.g., `C--Users-15323-Project` → `C:\Users\15323\Project`)

## Platform Notes

- Developed on Windows; paths use `\\` separator
- Project directory names in `~/.claude/projects/` encode paths with `-` as separator (`C--` prefix for drive letter, `--` for `\`)
- Node.js on Windows: avoid `/dev/stdin`, use temp files for piping data to scripts
