// src/utils/ticketConfig.js
const fs = require('fs').promises;
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', '..', 'ticketConfig.json');
const CHANNELS_FILE = path.join(__dirname, '..', '..', 'ticketChannels.json');
const WRITE_DEBOUNCE_MS = 5000;

let configCache = {};
let channelsCache = {};
let configWritePending = false;
let channelsWritePending = false;
let configTimer = null;
let channelsTimer = null;

/**
 * Loads both config and channels from JSON files into memory.
 */
async function load() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    configCache = JSON.parse(data);
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('❌ Error loading ticket config:', err);
    configCache = {};
  }
  try {
    const data = await fs.readFile(CHANNELS_FILE, 'utf8');
    channelsCache = JSON.parse(data);
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('❌ Error loading ticket channels:', err);
    channelsCache = {};
  }
}

/**
 * Schedules a write of the config cache to disk (debounced).
 */
async function scheduleConfigWrite() {
  if (configWritePending) return;
  configWritePending = true;
  if (configTimer) clearTimeout(configTimer);
  configTimer = setTimeout(async () => {
    try {
      await fs.writeFile(CONFIG_FILE, JSON.stringify(configCache, null, 2), 'utf8');
    } catch (err) {
      console.error('❌ Error saving ticket config:', err);
    } finally {
      configWritePending = false;
      configTimer = null;
    }
  }, WRITE_DEBOUNCE_MS);
}

/**
 * Schedules a write of the channels cache to disk (debounced).
 */
async function scheduleChannelsWrite() {
  if (channelsWritePending) return;
  channelsWritePending = true;
  if (channelsTimer) clearTimeout(channelsTimer);
  channelsTimer = setTimeout(async () => {
    try {
      await fs.writeFile(CHANNELS_FILE, JSON.stringify(channelsCache, null, 2), 'utf8');
    } catch (err) {
      console.error('❌ Error saving ticket channels:', err);
    } finally {
      channelsWritePending = false;
      channelsTimer = null;
    }
  }, WRITE_DEBOUNCE_MS);
}

/**
 * Retrieves the configuration for a guild.
 * @param {string} guildId
 * @returns {Object|null}
 */
async function get(guildId) {
  return configCache[guildId] ? { ...configCache[guildId] } : null;
}

/**
 * Saves or updates the configuration for a guild.
 * @param {string} guildId
 * @param {Object} data
 */
async function set(guildId, data) {
  configCache[guildId] = data;
  await scheduleConfigWrite();
}

/**
 * Deletes the configuration for a guild.
 * @param {string} guildId
 */
async function del(guildId) {
  delete configCache[guildId];
  await scheduleConfigWrite();
}

/**
 * Retrieves metadata for a specific ticket channel.
 * @param {string} channelId
 * @returns {Object|null}
 */
async function getChannel(channelId) {
  return channelsCache[channelId] ? { ...channelsCache[channelId] } : null;
}

/**
 * Saves or updates metadata for a ticket channel.
 * @param {string} channelId
 * @param {Object} data
 */
async function setChannel(channelId, data) {
  channelsCache[channelId] = data;
  await scheduleChannelsWrite();
}

/**
 * Deletes metadata for a ticket channel.
 * @param {string} channelId
 */
async function delChannel(channelId) {
  delete channelsCache[channelId];
  await scheduleChannelsWrite();
}

/**
 * Returns all ticket channel metadata (used for checking limits).
 * @returns {Object}
 */
function getAllChannels() {
  return channelsCache;
}

/**
 * Returns all guild ticket setup configurations.
 * @returns {Object}
 */
function getAllConfigs() {
  return configCache;
}

function ensureLoaded() {
  return loadPromise;
}

// Initialize on load
const loadPromise = load().catch(console.error);

module.exports = {
  get,
  set,
  del,
  getChannel,
  setChannel,
  delChannel,
  getAllChannels,
  getAllConfigs,
  ensureLoaded
};
