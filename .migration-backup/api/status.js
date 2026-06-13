const fs = require('fs').promises;
const path = require('path');

const ROOT = process.cwd();
const GUILD_CONFIG_FILE = path.join(ROOT, 'guildConfig.json');
const COMMANDS_DIR = path.join(ROOT, 'src', 'commands');
const TICKET_CONFIG_FILE = path.join(ROOT, 'ticketConfig.json');
const WHITELIST_FILE = path.join(ROOT, 'whitelist.json');

async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function buildRequestSummary(entries) {
  const sorted = [...entries].sort((a, b) => {
    const timeA = a.approvedAt || a.requestedAt || 0;
    const timeB = b.approvedAt || b.requestedAt || 0;
    return timeB - timeA;
  });

  return sorted.slice(0, 5).map((entry, index) => ({
    id: `#${String(index + 1).padStart(3, '0')}`,
    user: entry.userId || entry.user || 'Unknown user',
    action: 'Blacklist',
    status: entry.status || (entry.approvedAt ? 'Approved' : 'Pending'),
    time: entry.approvedAt ? 'Approved' : 'Pending'
  }));
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const [guildConfig, ticketConfig, whitelist] = await Promise.all([
    readJson(GUILD_CONFIG_FILE),
    readJson(TICKET_CONFIG_FILE),
    readJson(WHITELIST_FILE)
  ]);

  let commandNames = [];
  try {
    const files = await fs.readdir(COMMANDS_DIR);
    commandNames = files.filter((file) => file.endsWith('.js')).map((file) => file.replace('.js', ''));
  } catch (error) {
    commandNames = [];
  }

  const guildEntries = guildConfig ? Object.values(guildConfig) : [];
  const blacklistEntries = guildEntries.flatMap((guild) => guild.blacklistEntries || []);
  const uniqueUsers = [...new Set(blacklistEntries.map((entry) => entry.userId || entry.user || 'unknown'))];
  const filesToShow = [];

  const botFiles = [
    path.join(ROOT, 'src', 'bot.js'),
    path.join(ROOT, 'src', 'config.js'),
    path.join(ROOT, 'src', 'utils', 'guildConfig.js'),
    path.join(ROOT, 'guildConfig.json'),
    path.join(ROOT, 'ticketConfig.json'),
    path.join(ROOT, 'whitelist.json')
  ];

  for (const file of botFiles) {
    try {
      const stats = await fs.stat(file);
      filesToShow.push({
        name: path.basename(file),
        path: `/${path.relative(ROOT, file).replace(/\\/g, '/')}`,
        size: stats.size
      });
    } catch (error) {
      // ignore missing files
    }
  }

  const alerts = [];
  if (!process.env.BLACKLIST_ROLE_ID) {
    alerts.push({ title: 'Missing blacklist role', message: 'Set BLACKLIST_ROLE_ID in .env or deploy env vars.', level: 'Warning' });
  }
  if (!process.env.BLACKLIST_APPROVER_ROLE_ID) {
    alerts.push({ title: 'Missing approver role', message: 'Set BLACKLIST_APPROVER_ROLE_ID to allow approvals.', level: 'Warning' });
  }
  if (!guildConfig) {
    alerts.push({ title: 'Guild config not found', message: 'No guildConfig.json file was detected in the repo root.', level: 'Warning' });
  }

  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    botName: 'Bot',
    guildCount: guildConfig ? Object.keys(guildConfig).length : 0,
    blacklistCount: blacklistEntries.length,
    blacklistedUsers: uniqueUsers.length,
    commandCount: commandNames.length,
    commands: commandNames,
    alerts,
    recentRequests: buildRequestSummary(blacklistEntries),
    botFiles: filesToShow,
    ticketConfigExists: Boolean(ticketConfig),
    whitelistExists: Boolean(whitelist)
  });
};
