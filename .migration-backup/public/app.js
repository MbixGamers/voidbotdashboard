const state = {
  statusText: document.getElementById('summary-text'),
  backendStatus: document.getElementById('backend-status'),
  guildCount: document.getElementById('guild-count'),
  blacklistCount: document.getElementById('blacklist-count'),
  commandCount: document.getElementById('command-count'),
  alertCount: document.getElementById('alert-count'),
  commandChips: document.getElementById('command-chips'),
  recentRequests: document.getElementById('recent-requests'),
  fileList: document.getElementById('file-list'),
  alerts: document.getElementById('alerts')
};

function renderChips(items) {
  if (!items.length) return '<div class="placeholder">No commands found.</div>';
  return items.map(name => `<span class="chip">${name}</span>`).join('');
}

function renderRequests(items) {
  if (!items.length) return '<div class="placeholder">No recent blacklist entries found.</div>';
  return items.map(item => `
    <div class="request-card">
      <div>
        <strong>${item.user}</strong>
        <p>${item.action} • ${item.time}</p>
      </div>
      <span class="request-badge ${item.status.toLowerCase()}">${item.status}</span>
    </div>
  `).join('');
}

function renderFiles(files) {
  if (!files.length) return '<div class="placeholder">No source files found.</div>';
  return files.map(file => `
    <div class="file-card">
      <div>
        <strong>${file.name}</strong>
        <p>${file.path}</p>
      </div>
      <span class="file-badge">${file.size}</span>
    </div>
  `).join('');
}

function renderAlerts(items) {
  if (!items.length) return '<li class="placeholder">No configuration alerts. Everything looks good.</li>';
  return items.map(item => `
    <li class="alert-card">
      <div>
        <strong>${item.title}</strong>
        <p>${item.message}</p>
      </div>
      <span class="alert-badge warning">${item.level}</span>
    </li>
  `).join('');
}

function formatBytes(bytes) {
  if (typeof bytes !== 'number') return bytes;
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(1)} ${units[index]}`;
}

async function init() {
  try {
    const response = await fetch('/api/status');
    if (!response.ok) throw new Error('Fetch failed');
    const data = await response.json();

    state.backendStatus.textContent = 'Backend connected';
    state.backendStatus.style.background = 'rgba(34, 197, 94, 0.16)';

    state.guildCount.textContent = data.guildCount;
    state.blacklistCount.textContent = data.blacklistCount;
    state.commandCount.textContent = data.commands.length;
    state.alertCount.textContent = data.alerts.length;

    state.statusText.textContent = `Found ${data.guildCount} guilds and ${data.blacklistCount} blacklist entries from the bot folder.`;
    state.commandChips.innerHTML = renderChips(data.commands.slice(0, 12));
    state.recentRequests.innerHTML = renderRequests(data.recentRequests);
    state.fileList.innerHTML = renderFiles(data.botFiles.map(file => ({
      name: file.name,
      path: file.path,
      size: formatBytes(file.size)
    })));
    state.alerts.innerHTML = renderAlerts(data.alerts.map(alert => ({
      title: alert.title,
      message: alert.message,
      level: alert.level || 'Warning'
    })));
  } catch (error) {
    state.backendStatus.textContent = 'Backend unavailable';
    state.backendStatus.style.background = 'rgba(248, 113, 113, 0.14)';
    state.statusText.textContent = 'Unable to reach the backend route. Make sure /api/status is available and the bot repo files are readable.';
    state.alerts.innerHTML = '<li class="alert-card"><div><strong>Fetch error</strong><p>Dashboard could not connect to /api/status.</p></div><span class="alert-badge warning">Error</span></li>';
  }
}

init();
