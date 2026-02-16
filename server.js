const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const CLAUDE_DIR = path.join(require('os').homedir(), '.claude');
const PORT = 3200;

// --- Data Reader ---

function readJsonlFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try { return JSON.parse(line); }
        catch { return null; }
      })
      .filter(Boolean);
  } catch { return []; }
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch { return null; }
}

function getProjects() {
  const projectsDir = path.join(CLAUDE_DIR, 'projects');
  if (!fs.existsSync(projectsDir)) return [];
  return fs.readdirSync(projectsDir)
    .filter(f => fs.statSync(path.join(projectsDir, f)).isDirectory())
    .map(dirName => {
      const projectPath = dirName.replace(/^C--/, 'C:\\').replace(/--/g, '\\').replace(/-/g, '\\');
      return { dirName, projectPath, fullPath: path.join(projectsDir, dirName) };
    });
}

function getSessions(projectDirName) {
  const projectDir = path.join(CLAUDE_DIR, 'projects', projectDirName);
  if (!fs.existsSync(projectDir)) return [];
  const files = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
  return files.map(f => {
    const sessionId = f.replace('.jsonl', '');
    const filePath = path.join(projectDir, f);
    const stat = fs.statSync(filePath);
    const messages = readJsonlFile(filePath);
    const userMessages = messages.filter(m => m.type === 'user');
    const assistantMessages = messages.filter(m => m.type === 'assistant');
    const firstMsg = messages.find(m => m.timestamp);
    const lastMsg = [...messages].reverse().find(m => m.timestamp);
    return {
      sessionId,
      fileName: f,
      size: stat.size,
      modified: stat.mtime,
      totalMessages: messages.length,
      userMessages: userMessages.length,
      assistantMessages: assistantMessages.length,
      firstTimestamp: firstMsg?.timestamp || null,
      lastTimestamp: lastMsg?.timestamp || null,
    };
  });
}

function getMessages(projectDirName, sessionId) {
  const filePath = path.join(CLAUDE_DIR, 'projects', projectDirName, `${sessionId}.jsonl`);
  const messages = readJsonlFile(filePath);
  return messages
    .filter(m => m.type === 'user' || m.type === 'assistant')
    .map(m => ({
      uuid: m.uuid,
      type: m.type,
      timestamp: m.timestamp,
      sessionId: m.sessionId,
      content: extractContent(m.message),
      toolUse: extractToolUse(m.message),
      parentUuid: m.parentUuid,
      isSidechain: m.isSidechain,
    }));
}

function extractContent(message) {
  if (!message) return '';
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    const parts = [];
    for (const b of message.content) {
      if (b.type === 'text') {
        parts.push(b.text);
      } else if (b.type === 'tool_result') {
        const toolContent = Array.isArray(b.content)
          ? b.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
          : (typeof b.content === 'string' ? b.content : '');
        const label = toolContent
          ? `[Tool Result] ${toolContent}`
          : `[Tool Result${b.tool_use_id ? ': ' + b.tool_use_id.substring(0, 12) + '...' : ''}]`;
        parts.push(label);
      }
    }
    return parts.join('\n');
  }
  return '';
}

function extractToolUse(message) {
  if (!message || !Array.isArray(message.content)) return [];
  return message.content
    .filter(b => b.type === 'tool_use')
    .map(b => ({ name: b.name, id: b.id }));
}

function getSubagents(projectDirName, sessionId) {
  const subagentsDir = path.join(CLAUDE_DIR, 'projects', projectDirName, sessionId, 'subagents');
  if (!fs.existsSync(subagentsDir)) return [];
  return fs.readdirSync(subagentsDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => {
      const agentId = f.replace('.jsonl', '');
      const messages = readJsonlFile(path.join(subagentsDir, f));
      const userMsgs = messages.filter(m => m.type === 'user');
      const assistantMsgs = messages.filter(m => m.type === 'assistant');
      const firstMsg = messages.find(m => m.timestamp);
      const lastMsg = [...messages].reverse().find(m => m.timestamp);
      return {
        agentId,
        fileName: f,
        totalMessages: messages.length,
        userMessages: userMsgs.length,
        assistantMessages: assistantMsgs.length,
        firstTimestamp: firstMsg?.timestamp || null,
        lastTimestamp: lastMsg?.timestamp || null,
      };
    });
}

function getStats() {
  return readJsonFile(path.join(CLAUDE_DIR, 'stats-cache.json'));
}

function getHistory() {
  return readJsonlFile(path.join(CLAUDE_DIR, 'history.jsonl'));
}

function getTodos() {
  const todosDir = path.join(CLAUDE_DIR, 'todos');
  if (!fs.existsSync(todosDir)) return [];
  const results = [];
  for (const f of fs.readdirSync(todosDir)) {
    if (!f.endsWith('.json')) continue;
    const data = readJsonFile(path.join(todosDir, f));
    if (Array.isArray(data)) {
      results.push(...data.map(t => ({ ...t, sourceFile: f })));
    }
  }
  return results;
}

function getSettings() {
  const settings = readJsonFile(path.join(CLAUDE_DIR, 'settings.json'));
  if (settings?.env) {
    const safe = { ...settings };
    safe.env = {};
    for (const [k, v] of Object.entries(settings.env)) {
      safe.env[k] = k.includes('TOKEN') || k.includes('KEY') || k.includes('SECRET')
        ? v.substring(0, 12) + '...'
        : v;
    }
    return safe;
  }
  return settings;
}

function getDashboardData() {
  const projects = getProjects().map(p => {
    const sessions = getSessions(p.dirName).map(s => {
      const subagents = getSubagents(p.dirName, s.sessionId);
      return { ...s, projectDir: p.dirName, subagents };
    });
    return { ...p, sessions };
  });

  // Flat counts for header stats
  let totalSessions = 0, totalAgents = 0;
  for (const p of projects) {
    totalSessions += p.sessions.length;
    for (const s of p.sessions) totalAgents += s.subagents.length;
  }

  return {
    projects,
    totalSessions,
    totalAgents,
    stats: getStats(),
    history: getHistory(),
    todos: getTodos(),
    settings: getSettings(),
    timestamp: new Date().toISOString(),
  };
}

// --- REST API ---

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/dashboard', (req, res) => {
  res.json(getDashboardData());
});

app.get('/api/messages/:projectDir/:sessionId', (req, res) => {
  res.json(getMessages(req.params.projectDir, req.params.sessionId));
});

app.get('/api/subagent-messages/:projectDir/:sessionId/:agentId', (req, res) => {
  const filePath = path.join(
    CLAUDE_DIR, 'projects', req.params.projectDir,
    req.params.sessionId, 'subagents', `${req.params.agentId}.jsonl`
  );
  const messages = readJsonlFile(filePath)
    .filter(m => m.type === 'user' || m.type === 'assistant')
    .map(m => ({
      uuid: m.uuid,
      type: m.type,
      timestamp: m.timestamp,
      content: extractContent(m.message),
      toolUse: extractToolUse(m.message),
    }));
  res.json(messages);
});

// --- WebSocket ---

function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// --- File Watcher ---

const watcher = chokidar.watch(CLAUDE_DIR, {
  ignored: [/(^|[\/\\])\.git/, /node_modules/],
  persistent: true,
  ignoreInitial: true,
  depth: 5,
  awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
});

let debounceTimer = null;
function debouncedBroadcast(event, filePath) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    broadcast({
      type: 'file-change',
      event,
      path: filePath,
      dashboard: getDashboardData(),
    });
  }, 800);
}

watcher
  .on('change', p => debouncedBroadcast('change', p))
  .on('add', p => debouncedBroadcast('add', p))
  .on('unlink', p => debouncedBroadcast('unlink', p));

// --- Start ---

server.listen(PORT, () => {
  console.log(`\n  Claude Code Dashboard`);
  console.log(`  =====================`);
  console.log(`  Server:    http://localhost:${PORT}`);
  console.log(`  Watching:  ${CLAUDE_DIR}`);
  console.log(`  WebSocket: ws://localhost:${PORT}\n`);
});
