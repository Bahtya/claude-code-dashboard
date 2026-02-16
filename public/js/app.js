// === Claude Code Dashboard - Frontend ===

let dashboardData = null;
let ws = null;
let reconnectTimer = null;
let activeSession = null;
let currentTheme = localStorage.getItem('dashboard-theme') || 'cyberpunk';

// Explorer state
const expandedProjects = new Set();
const expandedSessions = new Set();

// --- Theme Management ---
function initTheme() {
  setTheme(currentTheme, null, false);
  updateThemeSelector();
}

function setTheme(theme, event, save = true) {
  if (event) event.stopPropagation();

  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);

  if (save) {
    localStorage.setItem('dashboard-theme', theme);
  }

  updateThemeSelector();
  updateParticleColors();
}

function toggleThemeDropdown() {
  const selector = document.getElementById('theme-selector');
  selector.classList.toggle('active');
}

function closeThemeDropdown() {
  const selector = document.getElementById('theme-selector');
  selector.classList.remove('active');
}

function updateThemeSelector() {
  const icon = document.getElementById('current-theme-icon');
  const label = document.getElementById('theme-label');

  // Update current theme icon
  icon.className = `theme-icon ${currentTheme}-icon`;

  // Update theme label
  const themeNames = {
    cyberpunk: 'Cyberpunk',
    moltbook: 'Moltbook'
  };
  label.textContent = themeNames[currentTheme] || 'Theme';

  // Update selected state in dropdown
  document.querySelectorAll('.theme-option').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.theme === currentTheme);
  });
}

function updateParticleColors() {
  // This will be called when theme changes to update particle animation colors
  const particles = window.particleData;
  if (particles) {
    particles.themeColor = currentTheme === 'moltbook'
      ? 'rgba(232, 106, 51, 0.2)'
      : 'rgba(0, 240, 255, 0.3)';
  }
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  const selector = document.getElementById('theme-selector');
  if (selector && !selector.contains(e.target)) {
    closeThemeDropdown();
  }
});

// --- Particle Canvas ---
function initParticles() {
  const canvas = document.getElementById('particle-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const COUNT = 60;
  window.particleData = {
    themeColor: currentTheme === 'moltbook'
      ? 'rgba(232, 106, 51, 0.2)'
      : 'rgba(0, 240, 255, 0.3)'
  };

  for (let i = 0; i < COUNT; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.5 + 0.5,
      alpha: Math.random() * 0.3 + 0.1,
    });
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const themeColor = window.particleData?.themeColor || 'rgba(0, 240, 255, 0.3)';

    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = themeColor.replace('0.3', p.alpha.toFixed(2)).replace('0.2', p.alpha.toFixed(2));
      ctx.fill();
    });

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          const lineOpacity = 0.06 * (1 - dist / 120);
          ctx.strokeStyle = themeColor.replace('0.3', lineOpacity.toFixed(2)).replace('0.2', lineOpacity.toFixed(2));
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(animate);
  }
  animate();

  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });
}

// --- WebSocket ---
function connectWS() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen = () => {
    setConnectionStatus('connected', 'Connected');
    showToast('WebSocket connected', 'success');
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'file-change') {
      dashboardData = data.dashboard;
      renderAll();

      // Check if the changed file belongs to the currently viewed session
      if (isSessionFileChange(data.path, activeSession)) {
        refreshCurrentChat();
      } else {
        showToast(`File updated: ${data.path.split(/[/\\]/).pop()}`, 'info');
      }
    }
  };

  ws.onclose = () => {
    setConnectionStatus('disconnected', 'Disconnected');
    reconnectTimer = setTimeout(connectWS, 3000);
  };

  ws.onerror = () => {
    ws.close();
  };
}

function setConnectionStatus(cls, text) {
  const el = document.getElementById('connection-status');
  el.className = `connection-status ${cls}`;
  document.getElementById('conn-text').textContent = text;
}

// --- Chat Auto-Refresh ---
function isSessionFileChange(changePath, activeSession) {
  if (!activeSession) return false;

  // Build JSONL file path pattern
  // Normalize paths to handle both Windows backslashes and Unix forward slashes
  // ~/.claude/projects/{projectDir}/{sessionId}.jsonl
  const normalizedPath = changePath.replace(/\\/g, '/');
  const expectedPattern = `${activeSession.projectDir}/${activeSession.sessionId}.jsonl`;
  return normalizedPath.includes(expectedPattern);
}

async function refreshCurrentChat() {
  if (!activeSession) return;

  const container = document.getElementById('chat-container');

  // Re-fetch messages based on current session type
  if (activeSession.type === 'session') {
    const messages = await fetchMessages(activeSession.projectDir, activeSession.sessionId);
    renderChat(container, messages);
    showToast('新消息已到达', 'info');
  } else if (activeSession.type === 'agent') {
    const messages = await fetchSubagentMessages(activeSession.projectDir, activeSession.sessionId, activeSession.agentId);
    renderChat(container, messages);
    showToast('新消息已到达', 'info');
  }
}

// --- Data Fetching ---
async function fetchDashboard() {
  try {
    const res = await fetch('/api/dashboard');
    dashboardData = await res.json();
    renderAll();
  } catch (e) {
    console.error('Failed to fetch dashboard:', e);
  }
}

async function fetchMessages(projectDir, sessionId) {
  try {
    const res = await fetch(`/api/messages/${encodeURIComponent(projectDir)}/${sessionId}`);
    return await res.json();
  } catch (e) {
    console.error('Failed to fetch messages:', e);
    return [];
  }
}

async function fetchSubagentMessages(projectDir, sessionId, agentId) {
  try {
    const res = await fetch(`/api/subagent-messages/${encodeURIComponent(projectDir)}/${sessionId}/${agentId}`);
    return await res.json();
  } catch (e) {
    console.error('Failed to fetch subagent messages:', e);
    return [];
  }
}

// --- Render Functions ---
function renderAll() {
  if (!dashboardData) return;
  renderStats();
  renderExplorer();
  renderHistory();
  renderTodos();
  renderTimeline();
  updateHeader();
}

function updateHeader() {
  const d = dashboardData;
  document.getElementById('header-sessions').textContent = d.totalSessions;
  // Count total messages across all projects/sessions
  let totalMsgs = 0;
  for (const p of d.projects) {
    for (const s of p.sessions) {
      totalMsgs += s.totalMessages;
    }
  }
  document.getElementById('header-messages').textContent = d.stats?.totalMessages || totalMsgs;
  document.getElementById('header-agents').textContent = d.totalAgents;
}

function renderStats() {
  const d = dashboardData;
  const stats = d.stats || {};
  let totalMsgs = 0;
  for (const p of d.projects) {
    for (const s of p.sessions) {
      totalMsgs += s.totalMessages;
    }
  }
  totalMsgs = stats.totalMessages || totalMsgs;
  const totalSessions = d.totalSessions;
  const totalAgents = d.totalAgents;
  const longest = stats.longestSession;
  const durationMin = longest ? Math.round(longest.duration / 60000) : 0;

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card">
      <div class="stat-num">${d.projects.length}</div>
      <div class="stat-desc">Projects</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${totalSessions}</div>
      <div class="stat-desc">Sessions</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${totalMsgs}</div>
      <div class="stat-desc">Messages</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${totalAgents}</div>
      <div class="stat-desc">Subagents</div>
    </div>
  `;
}

// --- Explorer Tree ---
function renderExplorer() {
  const el = document.getElementById('explorer-tree');
  const projects = dashboardData.projects;

  if (!projects.length) {
    el.innerHTML = '<div class="empty-state">No projects found</div>';
    return;
  }

  let html = '';
  for (const project of projects) {
    const name = project.projectPath.split(/[/\\]/).pop() || project.dirName;
    const isExpanded = expandedProjects.has(project.dirName);
    const sessionCount = project.sessions.length;
    const toggleCls = sessionCount > 0
      ? (isExpanded ? 'tree-toggle expanded' : 'tree-toggle')
      : 'tree-toggle no-children';

    html += `
      <div class="tree-item level-0" onclick="toggleProject('${project.dirName}')">
        <span class="${toggleCls}">&#9654;</span>
        <div class="tree-icon icon-project">${escHtml(name[0].toUpperCase())}</div>
        <div class="tree-info">
          <div class="tree-title">${escHtml(name)}</div>
          <div class="tree-meta">${escHtml(project.projectPath)}</div>
        </div>
        <span class="tree-badge badge-purple">${sessionCount} sess</span>
      </div>
    `;

    if (isExpanded) {
      html += '<div class="tree-children">';
      // Sort sessions by lastTimestamp descending
      const sessions = [...project.sessions].sort((a, b) => {
        return (b.lastTimestamp || '').localeCompare(a.lastTimestamp || '');
      });

      for (const session of sessions) {
        const shortId = session.sessionId.substring(0, 8);
        const time = session.lastTimestamp ? formatTime(session.lastTimestamp) : '';
        const isActive = activeSession?.sessionId === session.sessionId && activeSession?.type === 'session';
        const activeCls = isActive ? ' active' : '';
        const hasAgents = session.subagents && session.subagents.length > 0;
        const isSessionExpanded = expandedSessions.has(session.sessionId);
        const sToggleCls = hasAgents
          ? (isSessionExpanded ? 'tree-toggle expanded' : 'tree-toggle')
          : 'tree-toggle no-children';

        html += `
          <div class="tree-item level-1${activeCls}" onclick="onSessionClick(event, '${project.dirName}', '${session.sessionId}')">
            <span class="${sToggleCls}" onclick="toggleSession(event, '${session.sessionId}')">&#9654;</span>
            <div class="tree-icon icon-session">${shortId.substring(0, 2).toUpperCase()}</div>
            <div class="tree-info">
              <div class="tree-title">${shortId}...</div>
              <div class="tree-meta">${time} | ${session.userMessages}u ${session.assistantMessages}a</div>
            </div>
            <span class="tree-badge badge-cyan">${session.totalMessages} msg</span>
          </div>
        `;

        if (isSessionExpanded && hasAgents) {
          html += '<div class="tree-children">';
          for (const agent of session.subagents) {
            const agentTime = agent.lastTimestamp ? formatTime(agent.lastTimestamp) : '';
            const isAgentActive = activeSession?.agentId === agent.agentId && activeSession?.type === 'agent';
            const agentActiveCls = isAgentActive ? ' active' : '';

            html += `
              <div class="tree-item level-2${agentActiveCls}" onclick="loadSubagent('${project.dirName}', '${session.sessionId}', '${agent.agentId}')">
                <span class="tree-toggle no-children">&#9654;</span>
                <div class="tree-icon icon-agent">AG</div>
                <div class="tree-info">
                  <div class="tree-title">${escHtml(agent.agentId.substring(0, 12))}...</div>
                  <div class="tree-meta">${agentTime}</div>
                </div>
                <span class="tree-badge badge-green">${agent.totalMessages} msg</span>
              </div>
            `;
          }
          html += '</div>';
        }
      }
      html += '</div>';
    }
  }

  el.innerHTML = html;
}

function toggleProject(dirName) {
  if (expandedProjects.has(dirName)) {
    expandedProjects.delete(dirName);
  } else {
    expandedProjects.add(dirName);
  }
  renderExplorer();
}

function toggleSession(event, sessionId) {
  event.stopPropagation();
  if (expandedSessions.has(sessionId)) {
    expandedSessions.delete(sessionId);
  } else {
    expandedSessions.add(sessionId);
  }
  renderExplorer();
}

function onSessionClick(event, projectDir, sessionId) {
  // If clicking the toggle arrow, don't load messages
  if (event.target.closest('.tree-toggle')) return;
  loadSession(projectDir, sessionId);
}

function renderHistory() {
  const el = document.getElementById('history-list');
  const history = dashboardData.history || [];
  if (!history.length) {
    el.innerHTML = '<div class="empty-state">No command history</div>';
    return;
  }
  const recent = history.slice(-20).reverse();
  el.innerHTML = recent.map(h => {
    const time = h.timestamp ? formatTime(new Date(h.timestamp).toISOString()) : '';
    const project = h.project?.split(/[/\\]/).pop() || '';
    const display = h.display && h.display.length > 60 ? h.display.substring(0, 60) + '...' : (h.display || '');
    return `
      <div class="list-item">
        <div class="list-item-icon icon-history">&gt;</div>
        <div class="list-item-info">
          <div class="list-item-title">${escHtml(display)}</div>
          <div class="list-item-meta">${time} | ${escHtml(project)}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderTodos() {
  const el = document.getElementById('todo-list');
  const todos = dashboardData.todos || [];
  if (!todos.length) {
    el.innerHTML = '<div class="empty-state">No active todos</div>';
    return;
  }
  el.innerHTML = todos.map(t => {
    const statusBadge = t.status === 'completed' ? 'badge-green'
      : t.status === 'in_progress' ? 'badge-cyan' : 'badge-pink';
    return `
      <div class="list-item">
        <div class="list-item-icon icon-todo">${t.status === 'completed' ? '&#10003;' : '&#9675;'}</div>
        <div class="list-item-info">
          <div class="list-item-title">${escHtml(t.subject || t.description || 'Untitled')}</div>
          <div class="list-item-meta">${escHtml(t.status || 'pending')}</div>
        </div>
        <span class="list-item-badge ${statusBadge}">${t.status || 'pending'}</span>
      </div>
    `;
  }).join('');
}

function renderTimeline() {
  const el = document.getElementById('timeline-chart');
  const activity = dashboardData.stats?.dailyActivity || [];

  if (!activity.length) {
    // Build timeline from session data
    const sessionsByDate = {};
    for (const p of dashboardData.projects) {
      for (const s of p.sessions) {
        if (s.firstTimestamp) {
          const date = s.firstTimestamp.substring(0, 10);
          sessionsByDate[date] = sessionsByDate[date] || { messages: 0, sessions: 0 };
          sessionsByDate[date].messages += s.totalMessages;
          sessionsByDate[date].sessions += 1;
        }
      }
    }
    const dates = Object.keys(sessionsByDate).sort();
    if (!dates.length) {
      el.innerHTML = '<div class="empty-state">No activity data</div>';
      return;
    }
    renderBars(el, dates.map(d => ({
      label: d.substring(5),
      value: sessionsByDate[d].messages,
      tooltip: `${sessionsByDate[d].sessions} sessions, ${sessionsByDate[d].messages} msgs`,
    })));
    return;
  }

  renderBars(el, activity.map(a => ({
    label: a.date.substring(5),
    value: a.messageCount,
    tooltip: `${a.sessionCount} sessions, ${a.messageCount} msgs, ${a.toolCallCount} tools`,
  })));
}

function renderBars(container, items) {
  const maxVal = Math.max(...items.map(i => i.value), 1);
  const maxBarHeight = 140;
  container.innerHTML = items.map(item => {
    const height = Math.max(4, (item.value / maxVal) * maxBarHeight);
    return `
      <div class="timeline-bar-wrap" title="${item.tooltip}">
        <div class="timeline-bar" style="height: ${height}px">
          <span class="timeline-bar-count">${item.value}</span>
        </div>
        <span class="timeline-bar-label">${item.label}</span>
      </div>
    `;
  }).join('');
}

// --- Chat Loading ---
async function loadSession(projectDir, sessionId) {
  activeSession = { projectDir, sessionId, type: 'session' };
  // Auto-expand the parent project
  expandedProjects.add(projectDir);
  renderExplorer();

  // Update breadcrumb
  const project = dashboardData.projects.find(p => p.dirName === projectDir);
  const projectName = project ? (project.projectPath.split(/[/\\]/).pop() || project.dirName) : projectDir;
  document.getElementById('breadcrumb').textContent = `${projectName} / ${sessionId.substring(0, 8)}...`;
  document.getElementById('chat-session-label').textContent = sessionId.substring(0, 8) + '...';

  const container = document.getElementById('chat-container');
  container.innerHTML = '<div class="chat-placeholder"><p>Loading messages...</p></div>';

  const messages = await fetchMessages(projectDir, sessionId);
  renderChat(container, messages);
}

async function loadSubagent(projectDir, sessionId, agentId) {
  activeSession = { projectDir, sessionId, agentId, type: 'agent' };
  // Auto-expand parents
  expandedProjects.add(projectDir);
  expandedSessions.add(sessionId);
  renderExplorer();

  // Update breadcrumb
  const project = dashboardData.projects.find(p => p.dirName === projectDir);
  const projectName = project ? (project.projectPath.split(/[/\\]/).pop() || project.dirName) : projectDir;
  document.getElementById('breadcrumb').textContent = `${projectName} / ${sessionId.substring(0, 8)}... / ${agentId.substring(0, 8)}...`;
  document.getElementById('chat-session-label').textContent = `Agent: ${agentId.substring(0, 12)}...`;

  const container = document.getElementById('chat-container');
  container.innerHTML = '<div class="chat-placeholder"><p>Loading subagent messages...</p></div>';

  const messages = await fetchSubagentMessages(projectDir, sessionId, agentId);
  renderChat(container, messages);
}

function renderChat(container, messages) {
  if (!messages.length) {
    container.innerHTML = '<div class="chat-placeholder"><p>No messages in this session</p></div>';
    return;
  }

  container.innerHTML = messages.map(m => {
    const content = m.content.length > 800 ? m.content.substring(0, 800) + '\n...[truncated]' : m.content;
    const time = m.timestamp ? formatTime(m.timestamp) : '';
    const toolHtml = m.toolUse?.length
      ? `<div class="chat-msg-tools">${m.toolUse.map(t => `<span class="tool-tag">${escHtml(t.name)}</span>`).join('')}</div>`
      : '';
    return `
      <div class="chat-msg ${m.type}">
        <div class="chat-msg-header">
          <span class="chat-msg-role">${m.type === 'user' ? 'USER' : 'ASSISTANT'}</span>
          <span class="chat-msg-time">${time}</span>
        </div>
        <div class="chat-msg-content">${escHtml(content)}</div>
        ${toolHtml}
      </div>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

// --- Utils ---
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTime(isoStr) {
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return isoStr; }
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="pulse-dot" style="background: ${type === 'success' ? 'var(--accent-green)' : 'var(--accent-cyan)'}"></span>${escHtml(msg)}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initParticles();
  connectWS();
  fetchDashboard();
});
