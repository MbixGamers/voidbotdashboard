const fs = require('fs').promises;
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', '..', 'logConfig.json');
const WRITE_DEBOUNCE_MS = 5000;

const DEFAULT_CATEGORIES = {
  security: true,
  moderation: true,
  ticket: true,
  command: true,
  system: true,
  custom: true,
  mod_logs: true,
  server_logs: true,
  role_logs: true,
  webhook_logs: true,
  raid_logs: true
};

const DEFAULT_CONFIG = {
  logChannelId: null,
  enabledCategories: { ...DEFAULT_CATEGORIES }
};

let configCache = {};
let writePending = false;
let writeTimer = null;

async function load() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    configCache = JSON.parse(data);
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('❌ Error loading log config:', err);
    configCache = {};
  }
}

async function scheduleWrite() {
  if (writePending) return;
  writePending = true;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(async () => {
    try {
      await fs.writeFile(CONFIG_FILE, JSON.stringify(configCache, null, 2), 'utf8');
    } catch (err) {
      console.error('❌ Error saving log config:', err);
    } finally {
      writePending = false;
      writeTimer = null;
    }
  }, WRITE_DEBOUNCE_MS);
}

async function get(guildId) {
  const config = configCache[guildId];
  if (config) {
    return {
      logChannelId: config.logChannelId || null,
      enabledCategories: { ...DEFAULT_CATEGORIES, ...(config.enabledCategories || {}) }
    };
  }
  return { ...DEFAULT_CONFIG };
}

async function update(guildId, partial) {
  const current = await get(guildId);
  configCache[guildId] = {
    ...current,
    ...partial,
    enabledCategories: {
      ...current.enabledCategories,
      ...(partial.enabledCategories || {})
    }
  };
  await scheduleWrite();
}

async function setLogChannel(guildId, channelId) {
  await update(guildId, { logChannelId: channelId });
}

async function isCategoryEnabled(guildId, category) {
  const config = await get(guildId);
  return Boolean(config.enabledCategories?.[category]);
}

async function getEnabledCategories(guildId) {
  const config = await get(guildId);
  return { ...config.enabledCategories };
}

load().catch(console.error);

module.exports = {
  get,
  update,
  setLogChannel,
  isCategoryEnabled,
  getEnabledCategories,
  DEFAULT_CATEGORIES
};
