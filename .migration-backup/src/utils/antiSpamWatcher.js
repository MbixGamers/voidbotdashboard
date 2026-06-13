const { EmbedBuilder } = require('discord.js');
const logManager = require('./logManager');
const securityConfig = require('./securityConfig');

const spamState = new Map();

function getUserKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function cleanupState(state, now, windowMs) {
  state.messages = state.messages.filter(entry => now - entry.timestamp < windowMs);
}

async function handleSpamSignals(message, config) {
  if (!config.enabled || !config.spam?.enhancedEnabled) return false;
  if (!message.guild || !message.member) return false;
  if (message.author?.bot) return false;

  const now = Date.now();
  const key = getUserKey(message.guild.id, message.author.id);
  let state = spamState.get(key);
  if (!state) {
    state = { messages: [] };
    spamState.set(key, state);
  }

  const content = (message.content || '').trim();
  const mentionCount = message.mentions?.users?.size || 0;
  const isRepeat = content.length > 0 && state.messages.some(item => item.content === content);

  state.messages.push({ timestamp: now, content, mentions: mentionCount });
  cleanupState(state, now, config.spam.burstWindow || 5000);

  const recentMessages = state.messages.length;
  const repeatedCount = state.messages.filter(item => item.content === content).length;
  const mentionSpamCount = state.messages.filter(item => item.mentions >= (config.spam.mentionThreshold || 4)).length;

  const burstThreshold = config.spam.burstThreshold || 8;
  const repeatThreshold = config.spam.repeatContentThreshold || 3;
  const mentionThreshold = config.spam.mentionThreshold || 4;
  const mentionRepeatThreshold = config.spam.mentionRepeatThreshold || 2;

  let detected = false;
  let reason = null;

  if (recentMessages >= burstThreshold) {
    detected = true;
    reason = `Message burst: ${recentMessages} messages in ${(config.spam.burstWindow || 5000) / 1000}s`;
  } else if (repeatedCount >= repeatThreshold && content.length > 8) {
    detected = true;
    reason = `Repeated content: ${repeatedCount} identical messages`;
  } else if (mentionSpamCount >= mentionRepeatThreshold || mentionCount >= mentionThreshold) {
    detected = true;
    reason = `Mention spam: ${mentionCount} mentions in the latest message`; 
  }

  if (!detected) return false;

  await message.delete().catch(() => {});

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle('🚫 Spam Detected')
    .setDescription(`**User:** ${message.author.tag} (${message.author.id})\n**Channel:** ${message.channel}\n**Reason:** ${reason}`)
    .addFields(
      { name: 'Burst Count', value: String(recentMessages), inline: true },
      { name: 'Repeat Count', value: String(repeatedCount), inline: true },
      { name: 'Mentions', value: String(mentionCount), inline: true }
    )
    .setTimestamp();

  await logManager.sendLog(message.guild, 'security', { embed, timestamp: true });

  const warningEmbed = new EmbedBuilder()
    .setColor(0xffaa00)
    .setTitle('⚠️ Spam Blocked')
    .setDescription(`<@${message.author.id}>, your message was removed because it matched spam behavior. Please wait a moment before sending more messages.`)
    .setTimestamp();

  const warningMessage = await message.channel.send({ embeds: [warningEmbed] }).catch(() => null);
  if (warningMessage) setTimeout(() => warningMessage.delete().catch(() => {}), 6000);

  state.messages = [];
  return true;
}

module.exports = {
  handleSpamSignals
};
