// src/commands/help.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const helpCommand = new SlashCommandBuilder()
  .setName('help')
  .setDescription('List all commands and what they do.')
  .addStringOption(option =>
    option
      .setName('category')
      .setDescription('Filter by category')
      .setRequired(false)
      .addChoices(
        { name: '📊 Teams & Pros', value: 'teams' },
        { name: '🛒 Merch & Content', value: 'content' },
        { name: '🛠️ Utility', value: 'utility' },
        { name: '🛡️ Moderation', value: 'moderation' },
        { name: '🎮 Game Stats', value: 'game' },
        { name: '🔗 Socials', value: 'socials' },
        { name: '🔒 Security', value: 'security' },
        { name: '📋 Whitelist', value: 'whitelist' }
      )
  );

const CUSTOM_EMOJI_URL = 'https://cdn.discordapp.com/emojis/1444539060004589669.webp?size=128';

function buildHelpEmbed(category, totalCommands = 35) {
  const embed = new EmbedBuilder()
    .setTitle('🤖 Bot - Commands')
    .setDescription('All data is **live** from the website (Firebase). Use the buttons below to navigate.')
    .setColor(0x8a2be2)
    .setTimestamp()
    .setFooter({ 
      text: `${totalCommands} total commands • Use /help [category] to filter`,
      iconURL: CUSTOM_EMOJI_URL
    })
    .setThumbnail(CUSTOM_EMOJI_URL);

  if (category === 'teams') {
    embed.addFields(
      { name: '📊 **Team Statistics**', value: '`/teams` - Show all teams with pro/ops counts', inline: false },
      { name: '👥 **Pros**', value: '`/pros_list` - List all pros (with pagination)\n`/pro_info` - Detailed pro profile by name', inline: true },
      { name: '👔 **Operations**', value: '`/ops_info` - List operations/management team', inline: true }
    );
  } else if (category === 'content') {
    embed.addFields(
      { name: '🛒 **Merch**', value: '`/merch` - Browse store merchandise', inline: true },
      { name: '📰 **News**', value: '`/news` - Latest news articles', inline: true },
      { name: '🎥 **Videos**', value: '`/videos` - Latest YouTube videos\n`/latest-video` - Most recent video', inline: true }
    );
  } else if (category === 'utility') {
    embed.addFields(
      { name: '📊 **Stats**', value: '`/uptime` - Bot uptime & latency', inline: true },
      { name: '❓ **Help**', value: '`/help` - This command', inline: true },
      { name: '🎲 **Fun Fact**', value: '`/funfact` - Random fact', inline: true },
      { name: '🏆 **Ranking**', value: '`/ranking` - Current esports ranking', inline: true },
      { name: '🎂 **Birthday**', value: '`/bwish` - Wish someone happy birthday', inline: true }
    );
  } else if (category === 'moderation') {
    embed.addFields(
      { name: '🛡️ **Moderation Commands**', value: '*(Require appropriate permissions)*', inline: false },
      { name: '👢 **Kick**', value: '`/kick` - Kick a member', inline: true },
      { name: '🔨 **Ban**', value: '`/ban` - Ban a member', inline: true },
      { name: '⏰ **Timeout**', value: '`/timeout` - Timeout a member', inline: true },
      { name: '⚠️ **Warn**', value: '`/warn` - Warn a member', inline: true },
      { name: '🧹 **Clear**', value: '`/clear` - Clear messages', inline: true },
      { name: '📊 **Mod Stats**', value: '`/modcheck` - Show all staff stats\n`/modget` - Get stats for a specific staff member\n`/modclear` - Reset stats (admin only)\n`/modinfo` - View stats for a specific staff role\n`/ticketscan` - Scan ticket channels', inline: false }
    );
  } else if (category === 'game') {
    embed.addFields(
      { name: '🎮 **Game Stats Commands**', value: '*(/gamestat, /gamesolo, /gamereset require admin role)*', inline: false },
      { name: '📝 **Submit**', value: '`/gamesubmit` - Submit your game level & screenshot', inline: true },
      { name: '📋 **View All**', value: '`/gamestat` - View all user submissions (admin)', inline: true },
      { name: '🔍 **View One**', value: '`/gamesolo` - View a specific user\'s submission (admin)', inline: true },
      { name: '🔄 **Reset All**', value: '`/gamereset` - Reset all game submissions (admin)', inline: true },
      { name: '❌ **Remove**', value: '`/gameremove` - Remove your own submission', inline: true }
    );
  } else if (category === 'socials') {
    embed.addFields(
      { name: '🔗 **Social Links**', value: '`/socials` - All social media platforms', inline: false },
      { name: '💬 **Discord**', value: 'Join our community!', inline: true },
      { name: '🎵 **TikTok**', value: 'Official TikTok', inline: true },
      { name: '🎥 **YouTube**', value: 'Official account', inline: true },
      { name: '🐦 **Twitter/X**', value: 'Official account', inline: true },
      { name: '📸 **Instagram**', value: 'Official account', inline: true }
    );
  } else if (category === 'security') {
    embed.addFields(
      { name: '🛡️ **Security Commands**', value: '*(Require Administrator permissions)*', inline: false },
      { name: '🎮 **Anti-Nuke**', value: '`/antinuke toggle` - Enable/disable antinuke\n`/antinuke logchannel` - Set log channel\n`/antinuke thresholds` - Configure spam thresholds\n`/antinuke status` - View current config', inline: false },
      { name: '🔒 **Security Controls**', value: '`/security antinukeon` - Enable antinuke\n`/security antinukeoff` - Disable antinuke\n`/security antinukeconfig` - View config\n`/security antiraid` - Lock all channels\n`/security antirolenuke` - Configure role protection', inline: false },
      { name: '🔐 **Channel Locking**', value: '`/lock` - Lock current/specified channel\n`/unlock` - Unlock current/specified channel', inline: false },
      { name: '🔍 **Server Scan**', value: '`/scan` - Find users with dangerous permissions', inline: false }
    );
  } else if (category === 'whitelist') {
    embed.addFields(
      { name: '📋 **Whitelist Commands**', value: '*(Exempt users/roles from anti-nuke)*', inline: false },
      { name: '👤 **Users**', value: '`/whitelist adduser` - Add user to whitelist\n`/whitelist removeuser` - Remove user from whitelist', inline: true },
      { name: '🎭 **Roles**', value: '`/whitelist addrole` - Add role to whitelist\n`/whitelist removerole` - Remove role from whitelist', inline: true },
      { name: '📋 **List**', value: '`/whitelist list` - Show all whitelisted users/roles', inline: false }
    );
  } else {
    // Default: show all categories
    embed.addFields(
      { name: '📊 **Teams & Pros**', value: '`/teams` `/pros_list` `/pro_info` `/ops_info`', inline: false },
      { name: '🛒 **Merch & Content**', value: '`/merch` `/news` `/videos` `/latest-video`', inline: false },
      { name: '🛠️ **Utility**', value: '`/uptime` `/help` `/funfact` `/ranking` `/bwish`', inline: false },
      { name: '🛡️ **Moderation**', value: '`/kick` `/ban` `/timeout` `/warn` `/clear` `/modcheck` `/modget` `/modclear` `/modinfo` `/ticketscan`', inline: false },
      { name: '🎮 **Game Stats**', value: '`/gamesubmit` `/gamestat` `/gamesolo` `/gamereset` `/gameremove`', inline: false },
      { name: '🔗 **Socials**', value: '`/socials`', inline: false },
      { name: '🛡️ **Security**', value: '`/antinuke` `/security` `/lock` `/unlock` `/scan`', inline: false },
      { name: '📋 **Whitelist**', value: '`/whitelist adduser` `/whitelist removeuser` `/whitelist addrole` `/whitelist removerole` `/whitelist list`', inline: false }
    );
  }
  
  return embed;
}

function buildHelpButtons(currentCategory) {
  const rows = [];
  
  const row1 = new ActionRowBuilder();
  const categories1 = [
    { id: 'help_teams', label: ' Teams', emoji: '📊' },
    { id: 'help_content', label: 'Content', emoji: '🛒' },
    { id: 'help_utility', label: ' Utility', emoji: '🛠️' }
  ];
  
  categories1.forEach(cat => {
    const button = new ButtonBuilder()
      .setCustomId(cat.id)
      .setLabel(cat.label)
      .setStyle(currentCategory === cat.id.replace('help_', '') ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji(cat.emoji);
    row1.addComponents(button);
  });
  rows.push(row1);
  
  const row2 = new ActionRowBuilder();
  const categories2 = [
    { id: 'help_moderation', label: ' Mod', emoji: '🛡️' },
    { id: 'help_game', label: ' Game', emoji: '🎮' },
    { id: 'help_socials', label: 'Socials', emoji: '🔗' }
  ];
  
  categories2.forEach(cat => {
    const button = new ButtonBuilder()
      .setCustomId(cat.id)
      .setLabel(cat.label)
      .setStyle(currentCategory === cat.id.replace('help_', '') ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji(cat.emoji);
    row2.addComponents(button);
  });
  rows.push(row2);
  
  const row3 = new ActionRowBuilder();
  const categories3 = [
    { id: 'help_security', label: ' Security', emoji: '🛡️' },
    { id: 'help_whitelist', label: 'Whitelist', emoji: '📋' }
  ];
  
  categories3.forEach(cat => {
    const button = new ButtonBuilder()
      .setCustomId(cat.id)
      .setLabel(cat.label)
      .setStyle(currentCategory === cat.id.replace('help_', '') ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji(cat.emoji);
    row3.addComponents(button);
  });
  rows.push(row3);
  
  const row4 = new ActionRowBuilder();
  row4.addComponents(
    new ButtonBuilder()
      .setCustomId('help_all')
      .setLabel(' All Commands')
      .setStyle(ButtonStyle.Success)
      .setEmoji('📋')
  );
  rows.push(row4);
  
  return rows;
}

async function handleHelp(interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }

  const category = interaction.options?.getString('category') || null;
  const embed = buildHelpEmbed(category);
  const buttons = buildHelpButtons(category);
  
  await interaction.editReply({ 
    embeds: [embed], 
    components: buttons 
  });
}

async function handleHelpCategory(interaction, category) {
  const embed = buildHelpEmbed(category);
  const buttons = buildHelpButtons(category);
  
  await interaction.editReply({ 
    embeds: [embed], 
    components: buttons 
  });
}

module.exports = {
  helpCommand,
  handleHelp,
  handleHelpCategory
};