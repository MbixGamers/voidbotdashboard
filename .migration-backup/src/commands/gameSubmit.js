// src/commands/gameSubmit.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');

// ==================== CONFIG ====================
const SUBMISSIONS_FILE = path.join(__dirname, '..', '..', 'gameSubmissions.json');
const CONFIG_FILE = path.join(__dirname, '..', '..', 'gameConfig.json');
const ITEMS_PER_PAGE = 5;
const WRITE_DEBOUNCE_MS = 5000;

let submissions = {};
let gameName = 'Game';
let writePending = false;
let writeTimer = null;

async function scheduleWrite() {
  if (writePending) return;
  writePending = true;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(async () => {
    try {
      await saveSubmissionsNow();
    } finally {
      writePending = false;
      writeTimer = null;
    }
  }, WRITE_DEBOUNCE_MS);
}

async function saveSubmissionsNow() {
  const data = JSON.stringify(submissions, null, 2);
  await fs.writeFile(SUBMISSIONS_FILE, data, 'utf8');
}

async function loadSubmissions() {
  try {
    const data = await fs.readFile(SUBMISSIONS_FILE, 'utf8');
    submissions = JSON.parse(data);
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('❌ Error loading submissions:', err);
    submissions = {};
  }
}

async function loadGameConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    const config = JSON.parse(data);
    gameName = config.gameName || 'Game';
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('❌ Error loading game config:', err);
    gameName = 'Game';
  }
}

async function saveGameConfig() {
  const data = JSON.stringify({ gameName }, null, 2);
  await fs.writeFile(CONFIG_FILE, data, 'utf8');
}

function hasAdminAccess(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator) || 
         (config.adminRoleId && member.roles.cache.has(config.adminRoleId));
}

// ==================== COMMAND DEFINITIONS ====================
const gamesubmitCommand = new SlashCommandBuilder()
  .setName('gamesubmit')
  .setDescription('Submit your game stats (level and screenshot)')
  .addStringOption(option => option.setName('level').setDescription('Your current level (e.g., "Level 50")').setRequired(true))
  .addAttachmentOption(option => option.setName('screenshot').setDescription('Screenshot proof').setRequired(true))
  .setDMPermission(false);

const gamestatCommand = new SlashCommandBuilder()
  .setName('gamestat')
  .setDescription('View all user game submissions (admin only)')
  .setDMPermission(false);

const gamesoloCommand = new SlashCommandBuilder()
  .setName('gamesolo')
  .setDescription('View a specific user\'s game submission (admin only)')
  .addUserOption(option => option.setName('user').setDescription('The user to check').setRequired(true))
  .setDMPermission(false);

const gameresetCommand = new SlashCommandBuilder()
  .setName('gamereset')
  .setDescription('Reset all game submissions (admin only)')
  .setDMPermission(false);

const gameremoveCommand = new SlashCommandBuilder()
  .setName('gameremove')
  .setDescription('Remove your own game submission')
  .setDMPermission(false);

// ==================== HANDLERS ====================
async function handleGamesubmit(interaction) {
  const user = interaction.user;
  const level = interaction.options.getString('level');
  const attachment = interaction.options.getAttachment('screenshot');

  if (!attachment.contentType?.startsWith('image/')) {
    return interaction.editReply('❌ Please attach an image file (PNG, JPG, GIF, etc.).');
  }

  submissions[user.id] = {
    level,
    imageUrl: attachment.url,
    timestamp: new Date().toISOString(),
    username: user.tag,
    avatarUrl: user.displayAvatarURL({ size: 64 })
  };

  scheduleWrite();

  const embed = new EmbedBuilder()
    .setTitle('✅ Game Stats Recorded')
    .setDescription(`Your submission has been saved. Use the command again to update.`)
    .setColor(0x00ff00)
    .setThumbnail(attachment.url)
    .addFields(
      { name: '🎮 Game', value: gameName, inline: true },
      { name: '📊 Level', value: level, inline: true },
      { name: '🖼️ Screenshot', value: `[Click to enlarge](${attachment.url})`, inline: false }
    )
    .setTimestamp()
    .setFooter({ text: `Submitted by ${user.tag}`, iconURL: user.displayAvatarURL() });

  await interaction.editReply({ embeds: [embed] });
}

async function handleGamestat(interaction, page = 0) {
  if (!hasAdminAccess(interaction.member)) {
    return interaction.editReply({ content: '❌ You do not have permission to use this command.' });
  }

  if (interaction.isButton() && !interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate();
  }

  const userIds = Object.keys(submissions);
  if (userIds.length === 0) {
    return interaction.editReply('📭 No submissions yet.');
  }

  const entries = userIds.map(id => ({ id, ...submissions[id] }));
  entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const totalPages = Math.ceil(entries.length / ITEMS_PER_PAGE);
  const currentPage = Math.max(0, Math.min(page, totalPages - 1));
  const start = currentPage * ITEMS_PER_PAGE;
  const end = Math.min(start + ITEMS_PER_PAGE, entries.length);
  const pageEntries = entries.slice(start, end);

  // Create an embed for each entry on the page
  const embeds = pageEntries.map((entry, idx) => {
    const rank = start + idx + 1;
    const date = new Date(entry.timestamp);
    const timeAgo = `<t:${Math.floor(date.getTime() / 1000)}:R>`;

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${gameName} Submission #${rank}`)
      .setColor(0x8a2be2)
      .setThumbnail(entry.imageUrl) // Show the screenshot as thumbnail
      .addFields(
        { name: '👤 User', value: `<@${entry.id}>`, inline: true },
        { name: '📊 Level', value: entry.level, inline: true },
        { name: '⏱️ Submitted', value: timeAgo, inline: true },
        { name: '🖼️ Screenshot', value: `[Click to enlarge](${entry.imageUrl})`, inline: false }
      )
      .setTimestamp()
      .setFooter({ text: `Page ${currentPage + 1}/${totalPages} • Total submissions: ${entries.length}` });

    return embed;
  });

  const row = new ActionRowBuilder();
  if (currentPage > 0) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`gamestat_page_${currentPage - 1}`)
        .setLabel('◀ Previous')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⬅️')
    );
  }
  if (currentPage < totalPages - 1) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`gamestat_page_${currentPage + 1}`)
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('➡️')
    );
  }

  await interaction.editReply({ embeds, components: row.components.length ? [row] : [] });
}

async function handleGamestatPage(interaction, page) {
  await handleGamestat(interaction, parseInt(page));
}

async function handleGamesolo(interaction) {
  if (!hasAdminAccess(interaction.member)) {
    return interaction.editReply({ content: '❌ You do not have permission to use this command.' });
  }

  const targetUser = interaction.options.getUser('user');
  const submission = submissions[targetUser.id];

  if (!submission) {
    return interaction.editReply(`❌ User **${targetUser.tag}** has not submitted any game stats.`);
  }

  const embed = new EmbedBuilder()
    .setTitle(`📊 ${gameName} Stats`)
    .setColor(0x8a2be2)
    .setThumbnail(submission.avatarUrl || targetUser.displayAvatarURL())
    .setImage(submission.imageUrl)
    .addFields(
      { name: '👤 User', value: targetUser.toString(), inline: true },
      { name: '📊 Level', value: submission.level, inline: true },
      { name: '⏱️ Submitted', value: `<t:${Math.floor(new Date(submission.timestamp).getTime() / 1000)}:R>`, inline: true },
      { name: '🖼️ Screenshot', value: `[Click to view full size](${submission.imageUrl})`, inline: false }
    )
    .setTimestamp()
    .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

  await interaction.editReply({ embeds: [embed] });
}

async function handleGamereset(interaction) {
  if (!hasAdminAccess(interaction.member)) {
    return interaction.editReply({ content: '❌ You do not have permission to use this command.' });
  }

  submissions = {};
  await saveSubmissionsNow();

  const embed = new EmbedBuilder()
    .setTitle('✅ Game Stats Reset')
    .setDescription('All game submissions have been cleared.')
    .setColor(0x00ff00)
    .setTimestamp()
    .setFooter({ text: `Reset by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

  await interaction.editReply({ embeds: [embed] });
}

async function handleGameremove(interaction) {
  const userId = interaction.user.id;

  if (!submissions[userId]) {
    return interaction.editReply('❌ You do not have any game submission to remove.');
  }

  delete submissions[userId];
  await saveSubmissionsNow();

  const embed = new EmbedBuilder()
    .setTitle('✅ Submission Removed')
    .setDescription('Your game submission has been successfully removed.')
    .setColor(0x00ff00)
    .setTimestamp()
    .setFooter({ text: `Removed by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

  await interaction.editReply({ embeds: [embed] });
}

async function initGameSubmit() {
  await loadSubmissions();
  await loadGameConfig();
  console.log('📊 Loaded game submissions and config.');
}

module.exports = {
  gamesubmitCommand,
  gamestatCommand,
  gamesoloCommand,
  gameresetCommand,
  gameremoveCommand,
  handleGamesubmit,
  handleGamestat,
  handleGamestatPage,
  handleGamesolo,
  handleGamereset,
  handleGameremove,
  initGameSubmit
};