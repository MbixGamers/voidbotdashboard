const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const securityConfig = require('./securityConfig');
const logManager = require('./logManager');

const recentWebhookEvents = new Map();
const webhookUsageState = new Map();

function getChannelLabel(channel) {
  if (!channel) return 'Unknown channel';
  return channel.name ? `${channel.name} (${channel.id})` : `${channel.id}`;
}

function getWebhookLabel(message) {
  return message.webhookId ? `Webhook ${message.webhookId}` : 'Webhook message';
}

function recordWebhookEvent(guildId, executorId, type) {
  const key = `${guildId}:${executorId}`;
  let state = recentWebhookEvents.get(key);
  if (!state) {
    state = [];
    recentWebhookEvents.set(key, state);
  }
  state.push({ type, timestamp: Date.now() });
  const window = 20000;
  recentWebhookEvents.set(key, state.filter(item => Date.now() - item.timestamp < window));
}

function countWebhookEvents(guildId, executorId, type) {
  const key = `${guildId}:${executorId}`;
  const state = recentWebhookEvents.get(key) || [];
  return state.filter(item => item.type === type).length;
}

async function getLatestWebhookAuditEntry(guild, type) {
  return guild.fetchAuditLogs({ limit: 1, type }).then(log => log.entries.first()).catch(() => null);
}

async function handleWebhooksUpdate(channel) {
  const guild = channel.guild;
  if (!guild) return;
  const config = await securityConfig.get(guild.id);
  if (!config.enabled || !config.webhookProtection?.enabled) return;

  const createEntry = await getLatestWebhookAuditEntry(guild, AuditLogEvent.WebhookCreate);
  const deleteEntry = await getLatestWebhookAuditEntry(guild, AuditLogEvent.WebhookDelete);
  const updateEntry = await getLatestWebhookAuditEntry(guild, AuditLogEvent.WebhookUpdate);
  const entries = [createEntry, deleteEntry, updateEntry].filter(Boolean);
  const latest = entries.sort((a, b) => b.createdTimestamp - a.createdTimestamp)[0];

  const title = latest?.action === 'WEBHOOK_CREATE'
    ? '🔧 Webhook Created'
    : latest?.action === 'WEBHOOK_DELETE'
      ? '🗑️ Webhook Deleted'
      : '🔧 Webhook Updated';
  const description = `**Channel:** ${getChannelLabel(channel)}`;
  const executorLabel = latest?.executor ? `${latest.executor.tag} (${latest.executor.id})` : 'Unknown';

  const embed = new EmbedBuilder()
    .setColor(latest?.action === 'WEBHOOK_DELETE' ? 0xff0000 : 0x00b0f4)
    .setTitle(title)
    .setDescription(`${description}\n**Executor:** ${executorLabel}`)
    .addFields({ name: 'Action', value: latest?.action || 'Webhook activity detected', inline: true })
    .setTimestamp();

  await logManager.sendLog(guild, 'webhook_logs', { embed, timestamp: true });

  if (latest?.executor && !await securityConfig.isWhitelisted(guild.id, latest.executor.id, [])) {
    const eventType = latest.action === 'WEBHOOK_CREATE' ? 'create' : latest.action === 'WEBHOOK_DELETE' ? 'delete' : 'update';
    recordWebhookEvent(guild.id, latest.executor.id, eventType);
    const recentCount = countWebhookEvents(guild.id, latest.executor.id, eventType);
    const threshold = config.webhookProtection?.spikeThreshold || 3;

    if (recentCount >= threshold) {
      const alertEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('🚨 Webhook Abuse Spike Detected')
        .setDescription(`**Executor:** ${executorLabel}\n**Channel:** ${getChannelLabel(channel)}\n**Webhook actions in window:** ${recentCount}`)
        .addFields({ name: 'Action Type', value: eventType, inline: true })
        .setTimestamp();

      await logManager.sendLog(guild, 'security', { embed: alertEmbed, timestamp: true });
    }
  }
}

async function handleWebhookMessage(message) {
  const guild = message.guild;
  if (!guild) return;
  const config = await securityConfig.get(guild.id);
  if (!config.enabled || !config.webhookProtection?.enabled) return;

  const key = `${guild.id}:${message.webhookId}`;
  let state = webhookUsageState.get(key);
  const now = Date.now();
  if (!state) {
    state = { messages: [] };
    webhookUsageState.set(key, state);
  }

  const mentionCount = message.mentions?.users?.size || 0;
  state.messages.push({ timestamp: now, content: message.content || '', mentions: mentionCount });
  const window = config.webhookProtection?.usageWindowMs || 20000;
  state.messages = state.messages.filter(item => now - item.timestamp < window);

  const repeatedMessageCount = state.messages.filter(item => item.content && item.content === (message.content || '')).length;
  const totalMessages = state.messages.length;
  const highMentionMessages = state.messages.filter(item => item.mentions >= (config.webhookProtection?.mentionSpamThreshold || 3)).length;

  if (totalMessages >= (config.webhookProtection?.spamMessageThreshold || 15) || repeatedMessageCount >= (config.webhookProtection?.repeatSpamThreshold || 4) || highMentionMessages >= (config.webhookProtection?.mentionSpamRepeatThreshold || 3)) {
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('🚨 Suspicious Webhook Spam Detected')
      .setDescription(`**Webhook ID:** ${message.webhookId}\n**Channel:** ${getChannelLabel(message.channel)}\n**Recent webhook messages:** ${totalMessages}`)
      .addFields(
        { name: 'Repeated identical messages', value: String(repeatedMessageCount), inline: true },
        { name: 'High mention messages', value: String(highMentionMessages), inline: true }
      )
      .setTimestamp();

    await logManager.sendLog(guild, 'webhook_logs', { embed, timestamp: true });
    await logManager.sendLog(guild, 'security', { embed, timestamp: true });
  }
}

module.exports = {
  handleWebhooksUpdate,
  handleWebhookMessage
};
