// src/utils/guildConfig.js
const fs = require('fs').promises;
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', '..', 'guildConfig.json');
const WRITE_DEBOUNCE_MS = 5000;

let cache = {};
let writePending = false;
let writeTimer = null;

async function load() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    cache = JSON.parse(data);
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('❌ Error loading guild config:', err);
    cache = {};
  }
}

async function scheduleWrite() {
  if (writePending) return;
  writePending = true;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(async () => {
    try {
      await fs.writeFile(CONFIG_FILE, JSON.stringify(cache, null, 2), 'utf8');
    } catch (err) {
      console.error('❌ Error saving guild config:', err);
    } finally {
      writePending = false;
      writeTimer = null;
    }
  }, WRITE_DEBOUNCE_MS);
}

/**
 * Get guild configuration.
 * @param {string} guildId
 * @returns {Object} config object (never null)
 */
async function get(guildId) {
  const config = cache[guildId];
  if (config) return { ...config };

  // Return default config if none exists
  return {
    adminRoleId: null,
    trackedRoles: [],
    gatekeeper: {
      enabled: false,
      targetChannelId: null,
      infoChannelId: null,
      applyChannelId: null,
    },
    blacklistApproverRoleId: null,
    blacklistRoleId: null,
    blacklistChannelId: null,
    blacklistEntries: []
  };
}

/**
 * Set (overwrite) guild configuration.
 * @param {string} guildId
 * @param {Object} data
 */
async function set(guildId, data) {
  cache[guildId] = data;
  await scheduleWrite();
}

/**
 * Update partial data for a guild.
 * @param {string} guildId
 * @param {Object} partial
 */
async function update(guildId, partial) {
  const current = await get(guildId);
  const merged = { ...current, ...partial };
  // Deep merge gatekeeper if present
  if (partial.gatekeeper && current.gatekeeper) {
    merged.gatekeeper = { ...current.gatekeeper, ...partial.gatekeeper };
  }
  await set(guildId, merged);
}

// Initialize on load
load().catch(console.error);

module.exports = { get, set, update };