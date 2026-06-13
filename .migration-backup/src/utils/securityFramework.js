const securityConfig = require('./securityConfig');
const securityModules = require('./securityModules');
const securityLogger = require('./securityLogger');
const securityBus = require('./securityBus');
const antinukeHandler = require('./antinukeHandler');

const MODULE_LABELS = {
  roleSecurity: 'Role Security',
  antiRoleAbuse: 'Anti-Role Abuse',
  webhookSecurity: 'Webhook Protection',
  antiSpam: 'Anti-Spam',
  logging: 'Logging Engine',
  raidDetection: 'Raid Detection',
  autoLockdown: 'Auto Lockdown',
  antiNukeSystem: 'Anti-Nuke System',
  trustRisk: 'Trust & Risk'
};

async function init(client) {
  await securityModules.init(client, {
    config: securityConfig,
    logger: securityLogger,
    bus: securityBus
  });

  securityBus.onSecurityEvent('security.log', async (payload) => {
    if (!payload || !payload.guild || !payload.category) return;
    await securityLogger.log(payload.guild, payload.category, payload.options || {});
  });
}

async function getGuildConfig(guildId) {
  return securityConfig.get(guildId);
}

async function getModuleStatus(guildId) {
  const config = await getGuildConfig(guildId);
  return config.modules || {};
}

async function setModuleEnabled(guildId, moduleName, enabled) {
  if (!MODULE_LABELS[moduleName]) return false;
  return securityConfig.setModuleEnabled(guildId, moduleName, enabled);
}

function getModuleLabels() {
  return MODULE_LABELS;
}

async function getModuleConfig(guildId, moduleName) {
  const config = await getGuildConfig(guildId);
  if (!MODULE_LABELS[moduleName]) return null;

  const moduleConfig = {
    enabled: config.modules?.[moduleName] ?? false,
    thresholds: config.thresholds || {},
    sensitivity: config.sensitivity || {}
  };

  return moduleConfig;
}

async function setModuleParameter(guildId, moduleName, parameter, value) {
  return securityConfig.setModuleParameter(guildId, moduleName, parameter, value);
}

async function scan(guild, moduleName = 'all') {
  return securityModules.scan(guild, moduleName, {
    config: securityConfig,
    logger: securityLogger,
    bus: securityBus
  });
}

async function handleMessage(message) {
  if (!message.guild) return false;
  const config = await getGuildConfig(message.guild.id);
  if (!config.modules?.antiSpam) return false;

  const handled = await securityModules.handleMessage(message);
  if (handled) return true;

  return antinukeHandler.handleAntiSpam(message);
}

module.exports = {
  init,
  getGuildConfig,
  getModuleStatus,
  setModuleEnabled,
  getModuleLabels,
  getModuleConfig,
  setModuleParameter,
  scan,
  handleMessage
};
