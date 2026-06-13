const antiSpamWatcher = require('../antiSpamWatcher');
const securityConfig = require('../securityConfig');

async function handleMessage(message) {
  if (!message.guild || message.author?.bot) return false;
  const guildConfig = await securityConfig.get(message.guild.id);
  if (!guildConfig.modules?.antiSpam || !guildConfig.spam?.enhancedEnabled) return false;

  return antiSpamWatcher.handleSpamSignals(message, guildConfig);
}

async function scan(guild) {
  return {
    status: 'ready',
    note: 'Anti-Spam module is enabled and ready to inspect message behavior.'
  };
}

async function init(context) {
  // no direct initialization required; message handling is coordinated through the security framework
}

module.exports = {
  name: 'antiSpam',
  init,
  handleMessage,
  scan
};
