const { Events, AuditLogEvent, EmbedBuilder } = require('discord.js');

function getChannelLabel(channel) {
  if (!channel) return 'Unknown channel';
  return channel.name ? `${channel.name} (${channel.id})` : `${channel.id}`;
}

const webhookUsageState = new Map();

function recordWebhookEvent(guildId, executorId, type) {
  const key = `${guildId}:${executorId}`;
  const now = Date.now();
  let state = webhookUsageState.get(key);
  if (!state) {
    state = [];
    webhookUsageState.set(key, state);
  }
  state.push({ type, timestamp: now });
  webhookUsageState.set(key, state.filter(entry => now - entry.timestamp < 20000));
}

function countWebhookEvents(guildId, executorId, type) {
  const key = `${guildId}:${executorId}`;
  const state = webhookUsageState.get(key) || [];
  return state.filter(entry => entry.type === type).length;
}

async function handleWebhooksUpdate(channel, context) {
  const guildConfig = await context.config.get(channel.guild.id);
  if (!guildConfig.modules?.webhookSecurity) return;

  const audit = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.WebhookCreate }).catch(() => null);
  const entry = audit?.entries.first();
  const executor = entry?.executor;
  if (!executor) return;

  recordWebhookEvent(channel.guild.id, executor.id, 'create');
  const count = countWebhookEvents(channel.guild.id, executor.id, 'create');
  const threshold = guildConfig.thresholds?.webhookSpikeThreshold || 3;

  await context.logger.log(channel.guild, 'webhook_logs', {
    title: '🔧 Webhook Created',
    description: `**Executor:** ${executor.tag} (${executor.id})\n**Channel:** ${getChannelLabel(channel)}`,
    color: 0x00b0f4,
    timestamp: true
  });

  if (count >= threshold) {
    await context.logger.log(channel.guild, 'security', {
      title: '🚨 Webhook Spike Detected',
      description: `**Executor:** ${executor.tag} (${executor.id})\n**Webhook creates:** ${count} in the recent window`,
      color: 0xff0000,
      timestamp: true
    });
  }
}

async function handleWebhookMessage(message, context) {
  const guildConfig = await context.config.get(message.guild.id);
  if (!guildConfig.modules?.webhookSecurity) return false;
  if (!message.webhookId) return false;

  const content = (message.content || '').trim();
  const now = Date.now();
  const key = `${message.guild.id}:${message.webhookId}`;
  let state = webhookUsageState.get(key);
  if (!state) {
    state = [];
    webhookUsageState.set(key, state);
  }

  state.push({ timestamp: now, content, mentions: message.mentions?.users?.size || 0 });
  const window = guildConfig.thresholds?.webhookUsageWindowMs || 20000;
  webhookUsageState.set(key, state.filter(entry => now - entry.timestamp < window));

  const recentCount = webhookUsageState.get(key).length;
  const repeatedCount = webhookUsageState.get(key).filter(entry => entry.content === content).length;
  const mentionSpamCount = webhookUsageState.get(key).filter(entry => entry.mentions >= (guildConfig.thresholds?.webhookMentionThreshold || 3)).length;

  const spamThreshold = guildConfig.thresholds?.webhookSpamThreshold || 15;
  const repeatThreshold = guildConfig.thresholds?.webhookRepeatThreshold || 4;
  const mentionThreshold = guildConfig.thresholds?.webhookMentionThreshold || 3;

  if (recentCount >= spamThreshold || repeatedCount >= repeatThreshold || mentionSpamCount >= mentionThreshold) {
    await context.logger.log(message.guild, 'webhook_logs', {
      title: '🚨 Suspicious Webhook Activity',
      description: `**Webhook ID:** ${message.webhookId}\n**Channel:** ${getChannelLabel(message.channel)}`,
      fields: [
        { name: 'Recent messages', value: String(recentCount), inline: true },
        { name: 'Repeated messages', value: String(repeatedCount), inline: true },
        { name: 'High mention messages', value: String(mentionSpamCount), inline: true }
      ],
      color: 0xff0000,
      timestamp: true
    });
    return true;
  }

  return false;
}

async function scan(guild) {
  return {
    status: 'ready',
    note: 'Webhook security module is active and watching webhook creation and messages.'
  };
}

async function init(context) {
  const { client } = context;
  client.on(Events.WebhooksUpdate, async (channel) => handleWebhooksUpdate(channel, context).catch(() => {}));
  client.on(Events.MessageCreate, async (message) => {
    if (message.webhookId) {
      await handleWebhookMessage(message, context).catch(() => {});
    }
  });
}

module.exports = {
  name: 'webhookSecurity',
  init,
  scan
};
