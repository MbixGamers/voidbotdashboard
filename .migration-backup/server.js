const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { client } = require('./src/bot.js');

const app = express();
const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');
const COMMANDS_DIR = path.join(ROOT, 'src', 'commands');
const GUILD_CONFIG_FILE = path.join(ROOT, 'guildConfig.json');
const TICKET_CONFIG_FILE = path.join(ROOT, 'ticketConfig.json');
const WHITELIST_FILE = path.join(ROOT, 'whitelist.json');

app.use(express.static(PUBLIC_DIR));

function formatUptime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hrs}h ${mins}m`;
}

async function safeReadJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

app.get('/api/status', async (req, res) => {
  const commandNames = await fs.readdir(COMMANDS_DIR).then((files) => files.filter((file) => file.endsWith('.js')).map((file) => file.replace('.js', ''))).catch(() => []);
  const guildConfig = await safeReadJson(GUILD_CONFIG_FILE);
  const ticketConfig = await safeReadJson(TICKET_CONFIG_FILE);
  const whitelist = await safeReadJson(WHITELIST_FILE);

  const entries = guildConfig ? Object.values(guildConfig).flatMap((guild) => guild.blacklistEntries || []) : [];
  const uniqueUsers = [...new Set(entries.map((entry) => entry.userId || entry.user || 'unknown'))];

  const botFiles = [
    path.join(ROOT, 'src', 'bot.js'),
    path.join(ROOT, 'src', 'config.js'),
    path.join(ROOT, 'src', 'utils', 'guildConfig.js'),
    path.join(ROOT, 'guildConfig.json'),
    path.join(ROOT, 'ticketConfig.json'),
    path.join(ROOT, 'whitelist.json')
  ];

  const botFilesData = await Promise.all(botFiles.map(async (file) => {
    try {
      const stats = await fs.stat(file);
      return {
        name: path.basename(file),
        path: `/${path.relative(ROOT, file).replace(/\\/g, '/')}`,
        size: stats.size
      };
    } catch {
      return null;
    }
  })).then((items) => items.filter(Boolean));

  const now = Date.now();
  const uptimeSeconds = process.uptime();

  const info = {
    botName: 'Bot',
    online: client?.isReady?.() || false,
    guildCount: client?.guilds?.cache?.size || 0,
    uptime: formatUptime(uptimeSeconds),
    blacklistCount: entries.length,
    uniqueBlacklistedUsers: uniqueUsers.length,
    commandCount: commandNames.length,
    commands: commandNames,
    alerts: [],
    recentRequests: entries.slice(-5).reverse().map((entry, index) => ({
      id: `#${String(index + 1).padStart(3, '0')}`,
      user: entry.userId || entry.user || 'Unknown user',
      action: 'Blacklist',
      status: entry.status || (entry.approvedAt ? 'Approved' : 'Pending'),
      time: entry.approvedAt ? 'Approved' : 'Pending'
    })),
    botFiles: botFilesData,
    ticketConfigExists: Boolean(ticketConfig),
    whitelistExists: Boolean(whitelist)
  };

  if (!process.env.BLACKLIST_ROLE_ID) {
    info.alerts.push({ title: 'Missing blacklist role', message: 'Set BLACKLIST_ROLE_ID in .env.', level: 'Warning' });
  }
  if (!process.env.BLACKLIST_APPROVER_ROLE_ID) {
    info.alerts.push({ title: 'Missing approver role', message: 'Set BLACKLIST_APPROVER_ROLE_ID in .env.', level: 'Warning' });
  }
  if (!guildConfig) {
    info.alerts.push({ title: 'Guild config not found', message: 'Create guildConfig.json in repo root.', level: 'Warning' });
  }

  res.json(info);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🌐 Dashboard server listening on http://localhost:${port}`);
  console.log(`📡 Live API available at http://localhost:${port}/api/status`);
});
