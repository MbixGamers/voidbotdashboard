const logManager = require('./logManager');
const logConfig = require('./logConfig');
const { CATEGORY_NAMES } = require('./logManager');

async function log(guild, category, options = {}) {
  return logManager.sendLog(guild, category, options);
}

async function setLogChannel(guildId, channelId) {
  return logConfig.update(guildId, { logChannelId: channelId });
}

async function getLogSettings(guildId) {
  return logConfig.get(guildId);
}

async function toggleCategory(guildId, category, enabled) {
  const current = await getLogSettings(guildId);
  const updated = { ...current.enabledCategories, [category]: enabled };
  return logConfig.update(guildId, { enabledCategories: updated });
}

module.exports = {
  log,
  setLogChannel,
  getLogSettings,
  toggleCategory,
  CATEGORY_NAMES
};
