const { EmbedBuilder } = require('discord.js');
const logConfig = require('./logConfig');
const antinukeConfig = require('./antinukeConfig');

const CATEGORY_NAMES = {
  security: 'Security',
  moderation: 'Moderation',
  ticket: 'Ticket',
  command: 'Commands',
  system: 'System',
  custom: 'Custom',
  mod_logs: 'Mod Logs',
  server_logs: 'Server Logs',
  role_logs: 'Role Logs',
  webhook_logs: 'Webhook Logs',
  raid_logs: 'Raid Logs'
};

function buildEmbed(options = {}) {
  const embed = options.embed instanceof EmbedBuilder ? options.embed : new EmbedBuilder();

  if (options.author || options.authorName) {
    const author = options.author || {};
    const name = author.name || options.authorName;
    const iconURL = author.iconURL || author.iconUrl || options.authorIcon;
    const url = author.url || options.authorUrl;
    if (name) {
      embed.setAuthor({ name, iconURL, url });
    }
  }

  if (options.thumbnail) embed.setThumbnail(options.thumbnail);
  if (options.image) embed.setImage(options.image);

  if (options.title) embed.setTitle(options.title);
  if (options.description) embed.setDescription(options.description);
  if (options.color) embed.setColor(options.color);
  if (options.fields) embed.addFields(options.fields);
  if (options.footer || options.category) {
    const footerText = options.footer ? options.footer : '';
    const categoryText = options.category ? CATEGORY_NAMES[options.category] || options.category : null;
    const combined = categoryText ? `${footerText ? `${footerText} • ` : ''}${categoryText}` : footerText;
    embed.setFooter({ text: combined || 'Log Entry' });
  }
  if (options.timestamp) {
    embed.setTimestamp(options.timestamp === true ? Date.now() : options.timestamp);
  }

  return embed;
}

async function getLogChannel(guild) {
  const config = await logConfig.get(guild.id);
  if (config.logChannelId) {
    return guild.channels.cache.get(config.logChannelId) || null;
  }

  // Fallback to antinuke log channel if available
  const antiConfig = await antinukeConfig.get(guild.id);
  if (antiConfig.logChannelId) {
    return guild.channels.cache.get(antiConfig.logChannelId) || null;
  }

  return null;
}

async function sendLog(guild, category, options = {}) {
  if (!guild) return;
  if (!(await logConfig.isCategoryEnabled(guild.id, category))) return;

  const logChannel = await getLogChannel(guild);
  if (!logChannel) return;

  const embed = buildEmbed({ ...options, category });
  await logChannel.send({ embeds: [embed] }).catch(() => {});
}

async function logModerationCommand(interaction) {
  if (!interaction.guild) return;
  if (!interaction.commandName) return;

  const optionPairs = [];
  for (const [name, option] of interaction.options.data.map(opt => [opt.name, opt])) {
    if (option.value !== undefined && option.value !== null) {
      optionPairs.push(`**${name}:** ${option.value}`);
    }
  }

  await sendLog(interaction.guild, 'mod_logs', {
    title: '⚔️ Moderator Command Executed',
    description: `**User:** ${interaction.user.tag} (${interaction.user.id})\n**Command:** \/${interaction.commandName}`,
    fields: optionPairs.length > 0 ? [{ name: 'Options', value: optionPairs.join('\n') }] : [],
    color: 0xffa500,
    footer: interaction.channel ? `Channel: ${interaction.channel.name}` : 'Direct Message',
    timestamp: true
  });
}

async function logCommand(interaction) {
  if (!interaction.guild) return;
  if (!interaction.commandName) return;

  const optionPairs = [];
  for (const [name, option] of interaction.options.data.map(opt => [opt.name, opt])) {
    if (option.value !== undefined && option.value !== null) {
      optionPairs.push(`**${name}:** ${option.value}`);
    }
  }

  await sendLog(interaction.guild, 'command', {
    title: '⚡ Command Executed',
    description: `**User:** ${interaction.user.tag} (${interaction.user.id})\n**Command:** \/${interaction.commandName}`,
    fields: optionPairs.length > 0 ? [{ name: 'Options', value: optionPairs.join('\n') }] : [],
    color: 0x5865f2,
    footer: interaction.channel ? `Channel: ${interaction.channel.name}` : 'Direct Message',
    timestamp: true
  });
}

module.exports = {
  sendLog,
  logCommand,
  logModerationCommand,
  CATEGORY_NAMES
};
