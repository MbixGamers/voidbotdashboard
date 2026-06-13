// src/commands/modStats.js
const dashboardSync = require('../utils/dashboardSync');

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const ticketConfig = require('../utils/ticketConfig');
const fastModStats = require('../utils/fastModStats');

// ==================== CONFIG ====================
const STATS_FILE = path.join(__dirname, '..', '..', 'stats.json');
const PROCESSED_FILE = path.join(__dirname, '..', '..', 'processedMessages.json');
const MAPPING_FILE = path.join(__dirname, '..', '..', 'ticket-mapping.json');
const REPLIES_CACHE_FILE = path.join(__dirname, '..', '..', 'ticket-replies.json');
const ITEMS_PER_PAGE = 10;
const MEMBER_CACHE_TTL = 5 * 60 * 1000;
const WRITE_DEBOUNCE_MS = 5000;

// Ticket categories that should always count, plus all categories currently configured in ticketConfig.json.
const FALLBACK_TICKET_CATEGORIES = [
  '1484047630785970186',
  '1484047738000769044',
  '1444542813080518791',
  '1484047826467033249',
  '1444542784647331983'
];

// Exception roles that count as "staff reply" but are not in trackedRoles.
const EXCEPTION_ROLES = [
  '1451325626928726076',
  '1453854535746588855',
  '1462873708178833576',
  '1444524014818299926',
  // Default dashboard staff role. Keep this in code so dashboard counters continue working
  // even when TRACKED_ROLES is missing from the bot environment.
  '1444524137526853723'
];

// In-memory storage
let ticketCounts = {};      // claimed tickets per user
let messageCounts = {};     // messages in ticket channels per user
let processedMessages = new Set();
let memberCache = { timestamp: 0, members: [] }; // all relevant members (tracked + exception)
let trackedOnlyCache = { timestamp: 0, members: [] }; // only tracked roles

// Ticket channel reply tracking
let ticketChannelReplies = new Map(); // channelId -> Set of staff userIds who have replied

// Category statistics cache
let categoryStats = {
  total: {},
  replied: {},
  unreplied: {}
};

// Write queue
let writePending = false;
let writeTimer = null;
let repliesWritePending = false;
let repliesWriteTimer = null;

// ==================== PERSISTENCE FUNCTIONS ====================
async function scheduleWrite() {
  if (writePending) return;
  writePending = true;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(async () => {
    try {
      await saveStatsNow();
    } finally {
      writePending = false;
      writeTimer = null;
    }
  }, WRITE_DEBOUNCE_MS);
}

async function saveStatsNow() {
  const data = JSON.stringify({ ticketCounts, messageCounts }, null, 2);
  await fs.writeFile(STATS_FILE, data, 'utf8');
}

async function loadStats() {
  try {
    const data = await fs.readFile(STATS_FILE, 'utf8');
    const parsed = JSON.parse(data);
    ticketCounts = parsed.ticketCounts || {};
    messageCounts = parsed.messageCounts || {};
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('❌ Error loading stats:', err);
    ticketCounts = {};
    messageCounts = {};
  }
}

async function loadProcessedMessages() {
  try {
    const data = await fs.readFile(PROCESSED_FILE, 'utf8');
    processedMessages = new Set(JSON.parse(data));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('❌ Error loading processed messages:', err);
    processedMessages = new Set();
  }
}

async function saveProcessedMessages() {
  const data = JSON.stringify([...processedMessages], null, 2);
  await fs.writeFile(PROCESSED_FILE, data, 'utf8');
}

// ==================== REPLIES CACHE PERSISTENCE ====================
async function saveRepliesCache() {
  const cacheObj = {};
  for (const [channelId, repliers] of ticketChannelReplies.entries()) {
    cacheObj[channelId] = Array.from(repliers);
  }
  await fs.writeFile(REPLIES_CACHE_FILE, JSON.stringify(cacheObj, null, 2), 'utf8');
}

async function scheduleRepliesWrite() {
  if (repliesWritePending) return;
  repliesWritePending = true;
  if (repliesWriteTimer) clearTimeout(repliesWriteTimer);
  repliesWriteTimer = setTimeout(async () => {
    try {
      await saveRepliesCache();
    } finally {
      repliesWritePending = false;
      repliesWriteTimer = null;
    }
  }, WRITE_DEBOUNCE_MS);
}

async function loadRepliesCache() {
  try {
    const data = await fs.readFile(REPLIES_CACHE_FILE, 'utf8');
    const parsed = JSON.parse(data);
    ticketChannelReplies.clear();
    for (const [channelId, repliers] of Object.entries(parsed)) {
      ticketChannelReplies.set(channelId, new Set(repliers));
    }
    console.log(`✅ Loaded ${ticketChannelReplies.size} ticket channels from replies cache`);
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('❌ Error loading replies cache:', err);
    ticketChannelReplies.clear();
  }
}

// ==================== HELPERS ====================
function hasAdminAccess(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator) || 
         (config.adminRoleId && member.roles.cache.has(config.adminRoleId));
}

function getConfiguredTicketCategoryIds() {
  const categoryIds = new Set(FALLBACK_TICKET_CATEGORIES);
  for (const guildConfig of Object.values(ticketConfig.getAllConfigs())) {
    for (const ticketType of guildConfig.ticketTypes || []) {
      if (ticketType.categoryId) categoryIds.add(ticketType.categoryId);
    }
  }
  return categoryIds;
}

function getDashboardTrackedRoleIds() {
  const settings = dashboardSync.getCachedDashboardSettings?.();
  return Array.isArray(settings?.tracked_role_ids) ? settings.tracked_role_ids : [];
}

function getTrackedRoleIds() {
  return Array.from(new Set([...config.trackedRoles, ...getDashboardTrackedRoleIds()].filter(Boolean)));
}

function getConfiguredStaffRoleIds() {
  const roleIds = new Set([...getTrackedRoleIds(), ...EXCEPTION_ROLES]);
  if (config.adminRoleId) roleIds.add(config.adminRoleId);
  if (config.dashboardStaffRoleId) roleIds.add(config.dashboardStaffRoleId);

  for (const guildConfig of Object.values(ticketConfig.getAllConfigs())) {
    for (const ticketType of guildConfig.ticketTypes || []) {
      for (const roleId of ticketType.pingRoles || []) {
        if (roleId) roleIds.add(roleId);
      }
    }
  }

  return roleIds;
}

async function isTicketChannel(messageOrChannel) {
  const channel = messageOrChannel?.channel || messageOrChannel;
  if (!channel?.id) return false;

  const channelData = await ticketConfig.getChannel(channel.id);
  if (channelData && !channelData.closed) return true;

  const categoryIds = getConfiguredTicketCategoryIds();
  return Boolean(channel.parentId && categoryIds.has(channel.parentId));
}

function isStaff(member) {
  if (!member) return false;
  if (hasAdminAccess(member)) return true;
  const staffRoleIds = getConfiguredStaffRoleIds();
  return member.roles.cache.some(r => staffRoleIds.has(r.id));
}

// Get list of relevant members, optionally excluding exceptions
async function getRelevantMembers(guild, includeExceptions = true) {
  const now = Date.now();
  const cache = includeExceptions ? memberCache : trackedOnlyCache;
  if (cache.timestamp && now - cache.timestamp < MEMBER_CACHE_TTL) {
    return cache.members;
  }

  try {
    await guild.members.fetch();
  } catch (err) {
    console.error('❌ Failed to fetch members:', err);
    return [];
  }

  const members = [];
  const roles = includeExceptions ? [...getConfiguredStaffRoleIds()] : getTrackedRoleIds();
  for (const roleId of roles) {
    const role = guild.roles.cache.get(roleId);
    if (!role) continue;
    role.members.forEach(member => members.push(member));
  }

  // Admins can claim tickets and reply to tickets too, so mod-checks must include them even
  // when they do not also carry one of the tracked staff roles.
  if (!includeExceptions) {
    guild.members.cache
      .filter(member => hasAdminAccess(member))
      .forEach(member => members.push(member));
  }

  const unique = new Map();
  members.forEach(m => unique.set(m.id, m));
  const memberList = Array.from(unique.values()).map(m => ({
    id: m.id,
    username: m.user.username,
    roles: m.roles.cache.map(r => r.id)
  }));

  if (includeExceptions) {
    memberCache = { timestamp: now, members: memberList };
  } else {
    trackedOnlyCache = { timestamp: now, members: memberList };
  }
  return memberList;
}

function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}


async function findDashboardUser(client, userId) {
  for (const guild of client.guilds.cache.values()) {
    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    if (member?.user) {
      member.user.lastGuildId = guild.id;
      return member.user;
    }
  }
  return client.users.cache.get(userId) || await client.users.fetch(userId).catch(() => null);
}

async function syncDashboardSnapshots(client) {
  if (!dashboardSync.isDashboardSyncConfigured()) return;

  const userIds = new Set([...Object.keys(ticketCounts), ...Object.keys(messageCounts)]);
  if (!userIds.size) return;

  let synced = 0;
  for (const userId of userIds) {
    const user = await findDashboardUser(client, userId);
    await dashboardSync.syncStaffSnapshot(user || { id: userId, username: 'Discord User' }, {
      discord_id: userId,
      username: user?.tag || user?.username || 'Discord User',
      tickets_claimed_total: ticketCounts[userId] || 0,
      tickets_claimed_week: ticketCounts[userId] || 0,
      messages_total: messageCounts[userId] || 0,
      messages_week: messageCounts[userId] || 0,
      guild_id: user?.lastGuildId || null
    });
    synced++;
  }

  console.log(`✅ Synced ${synced} staff stat snapshot${synced === 1 ? '' : 's'} to the dashboard`);
}

// ==================== PRE-SCAN FUNCTION ====================
async function preScanTicketChannels(client) {
  console.log('🔍 Pre-scanning ticket channels for staff replies...');
  let totalChannelsScanned = 0;
  let totalRepliesFound = 0;
  
  // Reset category stats
  categoryStats = {
    total: {},
    replied: {},
    unreplied: {}
  };
  
  for (const guild of client.guilds.cache.values()) {
    // Initialize category stats for this guild
    for (const categoryId of getConfiguredTicketCategoryIds()) {
      const category = guild.channels.cache.get(categoryId);
      if (category) {
        categoryStats.total[categoryId] = 0;
        categoryStats.replied[categoryId] = 0;
        categoryStats.unreplied[categoryId] = 0;
      }
    }
    
    for (const categoryId of getConfiguredTicketCategoryIds()) {
      const category = guild.channels.cache.get(categoryId);
      if (!category) continue;
      
      const channels = category.children.cache.filter(c => c.isTextBased());
      categoryStats.total[categoryId] = channels.size;
      
      for (const channel of channels.values()) {
        totalChannelsScanned++;
        
        try {
          // Fetch last 50 messages to check for staff replies
          const messages = await channel.messages.fetch({ limit: 50 }).catch(() => []);
          let hasStaffReply = false;
          
          for (const msg of messages.values()) {
            if (msg.author.bot) continue;
            const member = msg.member || await guild.members.fetch(msg.author.id).catch(() => null);
            if (member && isStaff(member)) {
              hasStaffReply = true;
              
              // Add to ticketChannelReplies
              if (!ticketChannelReplies.has(channel.id)) {
                ticketChannelReplies.set(channel.id, new Set());
              }
              ticketChannelReplies.get(channel.id).add(msg.author.id);
              totalRepliesFound++;
              
              // Also count this historic ticket message once for local command accuracy.
              if (!processedMessages.has(msg.id)) {
                processedMessages.add(msg.id);
                messageCounts[msg.author.id] = (messageCounts[msg.author.id] || 0) + 1;
              }
            }
          }
          
          if (hasStaffReply) {
            categoryStats.replied[categoryId] = (categoryStats.replied[categoryId] || 0) + 1;
          } else {
            categoryStats.unreplied[categoryId] = (categoryStats.unreplied[categoryId] || 0) + 1;
          }
        } catch (err) {
          console.error(`❌ Error scanning channel ${channel.id}:`, err);
          categoryStats.unreplied[categoryId] = (categoryStats.unreplied[categoryId] || 0) + 1;
        }
      }
    }
  }
  
  // Save the pre-scanned data
  await scheduleRepliesWrite();
  await scheduleWrite();
  await saveProcessedMessages();
  
  console.log(`✅ Pre-scan complete: ${totalChannelsScanned} channels, ${totalRepliesFound} staff messages found`);
  
  // Log category statistics
  console.log('📊 Category Statistics:');
  for (const [catId, total] of Object.entries(categoryStats.total)) {
    const replied = categoryStats.replied[catId] || 0;
    const unreplied = categoryStats.unreplied[catId] || 0;
    console.log(`  Category ${catId}: Total=${total}, Replied=${replied}, Unreplied=${unreplied}`);
  }
}

// ==================== COMMAND DEFINITIONS ====================
const modcheckCommand = new SlashCommandBuilder()
  .setName('modcheck')
  .setDescription('📊 Show claimed tickets and message stats for all staff members')
  .setDMPermission(false);

const modclearCommand = new SlashCommandBuilder()
  .setName('modclear')
  .setDescription('🔄 Reset all tracked stats (tickets and messages)')
  .setDMPermission(false);

const modgetCommand = new SlashCommandBuilder()
  .setName('modget')
  .setDescription('🔍 Get stats for a specific staff member')
  .addUserOption(option => option.setName('user').setDescription('The user to check').setRequired(true))
  .setDMPermission(false);

const modinfoCommand = new SlashCommandBuilder()
  .setName('modinfo')
  .setDescription('📋 View stats for all members of a specific staff role')
  .setDMPermission(false);

const ticketscanCommand = new SlashCommandBuilder()
  .setName('ticketscan')
  .setDescription('🔎 Scan ticket categories and show unreplied tickets')
  .setDMPermission(false);

// ==================== HANDLERS ====================
async function handleModcheck(interaction, page = 0) {
  try {
    if (!hasAdminAccess(interaction.member)) {
      if (interaction.deferred) {
        return interaction.editReply({ content: '❌ You do not have permission to use this command.' });
      } else {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
      }
    }

    // Only defer if not already deferred/replied
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    await dashboardSync.fetchDashboardSettings({ force: true }).catch(() => {});
    trackedOnlyCache = { timestamp: 0, members: [] };

    const guild = interaction.guild;
    const members = await getRelevantMembers(guild, false); // exclude exceptions
    if (members.length === 0) {
      return interaction.editReply('❌ No members with tracked roles found.');
    }

    const stats = [];
    for (const m of members) {
      const userId = m.id;
      const username = m.username;
      const memberObj = guild.members.cache.get(userId);
      if (!memberObj) continue;

      const trackedRoleIds = getTrackedRoleIds();
      const trackedRoles = memberObj.roles.cache.filter(r => trackedRoleIds.includes(r.id));
      let highestRole = null;
      let highestPosition = -1;
      trackedRoles.forEach(role => {
        if (role.position > highestPosition) {
          highestPosition = role.position;
          highestRole = role;
        }
      });
      const roleName = highestRole ? highestRole.name : (hasAdminAccess(memberObj) ? 'Admin' : 'Unknown');

      const tickets = ticketCounts[userId] || 0;   // claimed tickets
      const messages = messageCounts[userId] || 0;

      stats.push({ userId, username, role: roleName, tickets, messages });
    }

    if (stats.length === 0) {
      return interaction.editReply('❌ No members with tracked roles found.');
    }

    const sortedByTickets = [...stats].sort((a, b) => b.tickets - a.tickets);
    const sortedByMessages = [...stats].sort((a, b) => b.messages - a.messages);

    const totalPages = Math.ceil(stats.length / ITEMS_PER_PAGE);
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));
    const start = currentPage * ITEMS_PER_PAGE;
    const end = Math.min(start + ITEMS_PER_PAGE, stats.length);

    const ticketPage = sortedByTickets.slice(start, end);
    const messagePage = sortedByMessages.slice(start, end);

    const embed = new EmbedBuilder()
      .setTitle('📊 Staff Activity Stats')
      .setColor(0x5865F2)
      .setTimestamp()
      .setFooter({ text: `Page ${currentPage + 1}/${totalPages} • Live tracked data` });

    if (ticketPage.length > 0) {
      let ticketList = '';
      ticketPage.forEach((item, idx) => {
        const rank = start + idx + 1;
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
        ticketList += `${medal} <@${item.userId}> (${item.role}) – **${formatNumber(item.tickets)}** claimed ticket${item.tickets !== 1 ? 's' : ''}\n`;
      });
      embed.addFields({ name: '🎫 Tickets Claimed', value: ticketList, inline: false });
    } else {
      embed.addFields({ name: '🎫 Tickets Claimed', value: 'No data', inline: false });
    }

    if (messagePage.length > 0) {
      let messageList = '';
      messagePage.forEach((item, idx) => {
        const rank = start + idx + 1;
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
        messageList += `${medal} <@${item.userId}> (${item.role}) – **${formatNumber(item.messages)}** message${item.messages !== 1 ? 's' : ''}\n`;
      });
      embed.addFields({ name: '💬 Messages Sent', value: messageList, inline: false });
    } else {
      embed.addFields({ name: '💬 Messages Sent', value: 'No data', inline: false });
    }

    const row = new ActionRowBuilder();
    if (currentPage > 0) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`modcheck_page_${currentPage - 1}`)
          .setLabel('◀ Previous')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⬅️')
      );
    }
    if (currentPage < totalPages - 1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`modcheck_page_${currentPage + 1}`)
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('➡️')
      );
    }

    await interaction.editReply({ embeds: [embed], components: row.components.length ? [row] : [] });
  } catch (error) {
    console.error('handleModcheck error:', error);
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply('❌ An error occurred while processing the command.').catch(() => {});
    } else if (!interaction.replied) {
      await interaction.reply({ content: '❌ An error occurred while processing the command.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}

async function handleModclear(interaction) {
  try {
    if (!hasAdminAccess(interaction.member)) {
      if (interaction.deferred) {
        return interaction.editReply({ content: '❌ You do not have permission to use this command.' });
      } else {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
      }
    }

    // Only defer if not already deferred/replied
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    ticketCounts = {};
    messageCounts = {};
    processedMessages.clear();
    ticketChannelReplies.clear();
    memberCache = { timestamp: 0, members: [] };
    trackedOnlyCache = { timestamp: 0, members: [] };
    categoryStats = { total: {}, replied: {}, unreplied: {} };
    await saveStatsNow();
    await saveProcessedMessages();
    await saveRepliesCache();

    await interaction.editReply('✅ All stats have been reset.');
  } catch (error) {
    console.error('handleModclear error:', error);
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply('❌ An error occurred while processing the command.').catch(() => {});
    } else if (!interaction.replied) {
      await interaction.reply({ content: '❌ An error occurred while processing the command.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}

async function handleModget(interaction) {
  try {
    if (!hasAdminAccess(interaction.member)) {
      if (interaction.deferred) {
        return interaction.editReply({ content: '❌ You do not have permission to use this command.' });
      } else {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
      }
    }

    // Only defer if not already deferred/replied
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    const targetUser = interaction.options.getUser('user');
    const guild = interaction.guild;
    const member = guild.members.cache.get(targetUser.id);

    const trackedRoleIds = getTrackedRoleIds();
    const hasTrackedRole = member && member.roles.cache.some(r => trackedRoleIds.includes(r.id));

    if (!hasTrackedRole) {
      return interaction.editReply({
        content: `⚠️ The selected user does not have any of the tracked roles.`,
        allowedMentions: { users: [] }
      });
    }

    const userId = targetUser.id;
    const tickets = ticketCounts[userId] || 0;
    const messages = messageCounts[userId] || 0;

    const trackedRoles = member.roles.cache.filter(r => trackedRoleIds.includes(r.id));
    let highestRole = null;
    let highestPosition = -1;
    trackedRoles.forEach(role => {
      if (role.position > highestPosition) {
        highestPosition = role.position;
        highestRole = role;
      }
    });
    const roleName = highestRole ? highestRole.name : 'Unknown';

    const embed = new EmbedBuilder()
      .setTitle(`📊 Stats for ${targetUser.username}`)
      .setColor(0x5865F2)
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        { name: '👤 User', value: `${targetUser}`, inline: true },
        { name: '🎫 Tickets Claimed', value: `**${formatNumber(tickets)}**`, inline: true },
        { name: '💬 Messages Sent', value: `**${formatNumber(messages)}**`, inline: true },
        { name: '🎖️ Highest Role', value: roleName, inline: false }
      )
      .setTimestamp()
      .setFooter({ text: 'Individual stats' });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('handleModget error:', error);
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply('❌ An error occurred while processing the command.').catch(() => {});
    } else if (!interaction.replied) {
      await interaction.reply({ content: '❌ An error occurred while processing the command.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}

async function handleModcheckPage(interaction, page) {
  await handleModcheck(interaction, parseInt(page));
}

// ==================== MODINFO HANDLER ====================
async function handleModinfo(interaction) {
  try {
    if (!hasAdminAccess(interaction.member)) {
      if (interaction.deferred) {
        return interaction.editReply({ content: '❌ You do not have permission to use this command.' });
      } else {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
      }
    }

    // Only defer if not already deferred/replied
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    const guild = interaction.guild;
    const roles = [];

    for (const roleId of getTrackedRoleIds()) {
      const role = guild.roles.cache.get(roleId);
      if (role) {
        roles.push({ id: role.id, name: role.name });
      }
    }

    if (roles.length === 0) {
      return interaction.editReply('❌ No tracked roles configured.');
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('modinfo_role_select')
      .setPlaceholder('📋 Select a role to view stats')
      .addOptions(
        roles.map(r => ({
          label: r.name,
          value: r.id,
          description: `View stats for ${r.name}`,
          emoji: '👥'
        }))
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.editReply({
      content: '📋 **Please select a role:**',
      components: [row]
    });
  } catch (error) {
    console.error('handleModinfo error:', error);
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply('❌ An error occurred while processing the command.').catch(() => {});
    } else if (!interaction.replied) {
      await interaction.reply({ content: '❌ An error occurred while processing the command.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}

async function handleModinfoRoleSelect(interaction) {
  try {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== 'modinfo_role_select') return;

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }

    if (!hasAdminAccess(interaction.member)) {
      return interaction.editReply({ content: '❌ You do not have permission.', components: [] });
    }

    const roleId = interaction.values[0];
    const guild = interaction.guild;
    const role = guild.roles.cache.get(roleId);
    
    if (!role) {
      return interaction.editReply({ content: '❌ Role not found.', components: [] });
    }

    await guild.members.fetch();
    const members = role.members.map(m => m.user.id);
    if (members.length === 0) {
      return interaction.editReply({ content: `❌ No members have the role **${role.name}**.`, components: [] });
    }

    const stats = [];
    for (const userId of members) {
      const member = guild.members.cache.get(userId);
      if (!member) continue;
      const tickets = ticketCounts[userId] || 0;
      const messages = messageCounts[userId] || 0;
      stats.push({ userId, username: member.user.username, tickets, messages });
    }

    stats.sort((a, b) => b.tickets - a.tickets || b.messages - a.messages);

    const totalPages = Math.ceil(stats.length / ITEMS_PER_PAGE);
    const embed = buildModinfoEmbed(stats, role.name, 0, totalPages);

    const row = new ActionRowBuilder();
    if (totalPages > 1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`modinfo_page_1_${roleId}`)
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('➡️')
      );
    }

    await interaction.editReply({
      content: null,
      embeds: [embed],
      components: row.components.length ? [row] : []
    });
  } catch (error) {
    console.error('handleModinfoRoleSelect error:', error);
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply('❌ An error occurred while processing the command.').catch(() => {});
    }
  }
}

function buildModinfoEmbed(stats, roleName, page, totalPages) {
  const start = page * ITEMS_PER_PAGE;
  const end = Math.min(start + ITEMS_PER_PAGE, stats.length);
  const slice = stats.slice(start, end);

  const embed = new EmbedBuilder()
    .setTitle(`📋 Stats for ${roleName}`)
    .setColor(0x5865F2)
    .setTimestamp()
    .setFooter({ text: `Page ${page + 1}/${totalPages} • Total members: ${stats.length}` });

  let desc = '';
  slice.forEach((s, idx) => {
    const rank = start + idx + 1;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
    desc += `${medal} <@${s.userId}> – 🎫 **${formatNumber(s.tickets)}** claimed, 💬 **${formatNumber(s.messages)}** messages\n`;
  });
  embed.setDescription(desc || 'No members found.');

  return embed;
}

async function handleModinfoPage(interaction, page, roleId) {
  try {
    if (!hasAdminAccess(interaction.member)) {
      return interaction.reply({ content: '❌ You do not have permission.', flags: MessageFlags.Ephemeral });
    }

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }

    const guild = interaction.guild;
    const role = guild.roles.cache.get(roleId);
    if (!role) {
      return interaction.editReply({ content: '❌ Role not found.', components: [] });
    }

    await guild.members.fetch();
    const members = role.members.map(m => m.user.id);
    const stats = [];
    for (const userId of members) {
      const member = guild.members.cache.get(userId);
      if (!member) continue;
      const tickets = ticketCounts[userId] || 0;
      const messages = messageCounts[userId] || 0;
      stats.push({ userId, username: member.user.username, tickets, messages });
    }

    stats.sort((a, b) => b.tickets - a.tickets || b.messages - a.messages);

    const totalPages = Math.ceil(stats.length / ITEMS_PER_PAGE);
    const currentPage = parseInt(page);

    const embed = buildModinfoEmbed(stats, role.name, currentPage, totalPages);

    const row = new ActionRowBuilder();
    if (totalPages > 1) {
      if (currentPage > 0) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`modinfo_page_${currentPage - 1}_${roleId}`)
            .setLabel('◀ Previous')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬅️')
        );
      }
      if (currentPage < totalPages - 1) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`modinfo_page_${currentPage + 1}_${roleId}`)
            .setLabel('Next ▶')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('➡️')
        );
      }
    }

    await interaction.editReply({
      embeds: [embed],
      components: row.components.length ? [row] : []
    });
  } catch (error) {
    console.error('handleModinfoPage error:', error);
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply('❌ An error occurred while processing the command.').catch(() => {});
    }
  }
}

// ==================== TICKETSCAN HANDLER ====================
async function handleTicketscan(interaction, page = 0) {
  try {
    if (!hasAdminAccess(interaction.member)) {
      if (interaction.deferred) {
        return interaction.editReply({ content: '❌ You do not have permission to use this command.' });
      } else {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
      }
    }

    // Only defer if not already deferred/replied
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    const guild = interaction.guild;
    
    // Get all ticket channels from the specified categories
    let allTicketChannels = [];
    let totalChannels = 0;
    const categoryMap = new Map(); // Store category names for display
    const categoryStats = {}; // Store stats per category for this guild
    
    // Initialize category stats
    for (const categoryId of getConfiguredTicketCategoryIds()) {
      const category = guild.channels.cache.get(categoryId);
      if (category) {
        categoryMap.set(categoryId, category.name);
        categoryStats[categoryId] = {
          total: 0,
          replied: 0,
          unreplied: 0,
          name: category.name
        };
      }
    }
    
    // Scan channels
    for (const categoryId of getConfiguredTicketCategoryIds()) {
      const category = guild.channels.cache.get(categoryId);
      if (!category) continue;
      
      const channels = category.children.cache.filter(c => c.isTextBased());
      categoryStats[categoryId].total = channels.size;
      totalChannels += channels.size;
      
      for (const channel of channels.values()) {
        allTicketChannels.push(channel);
        
        const repliers = ticketChannelReplies.get(channel.id);
        if (repliers && repliers.size > 0) {
          categoryStats[categoryId].replied++;
        } else {
          categoryStats[categoryId].unreplied++;
        }
      }
    }

    // Build category summary
    let summaryText = '';
    for (const [catId, stats] of Object.entries(categoryStats)) {
      if (stats.total > 0) {
        summaryText += `**${stats.name}**: ${stats.total} total, ${stats.replied} replied, ${stats.unreplied} unreplied\n`;
      }
    }

    // Get unreplied channels for pagination
    const unrepliedChannels = allTicketChannels.filter(channel => {
      const repliers = ticketChannelReplies.get(channel.id);
      return !repliers || repliers.size === 0;
    }).sort((a, b) => a.name.localeCompare(b.name));

    const totalPages = Math.max(1, Math.ceil(unrepliedChannels.length / ITEMS_PER_PAGE));
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));
    const start = currentPage * ITEMS_PER_PAGE;
    const end = Math.min(start + ITEMS_PER_PAGE, unrepliedChannels.length);
    const pageItems = unrepliedChannels.slice(start, end);

    const embed = new EmbedBuilder()
      .setTitle('📊 Ticket Channel Status')
      .setColor(0x5865F2)
      .setDescription(
        `**Overall Summary**\n` +
        `Total Channels: ${totalChannels}\n\n` +
        `**Category Breakdown**\n${summaryText || 'No categories found'}\n` +
        `**Unreplied Channels (Page ${currentPage + 1}/${totalPages}):**`
      )
      .setTimestamp()
      .setFooter({ text: 'Channels where no staff member has replied yet' });

    if (pageItems.length === 0) {
      embed.addFields({ name: '✅ All Good!', value: 'All tickets have been replied to!', inline: false });
    } else {
      const fieldValue = pageItems.map((channel, idx) => {
        const rank = start + idx + 1;
        const categoryName = categoryMap.get(channel.parentId) || 'Unknown Category';
        return `${rank}. ${channel} (${categoryName})`;
      }).join('\n');
      embed.addFields({ name: '📋 Unreplied Channels', value: fieldValue, inline: false });
    }

    const row = new ActionRowBuilder();
    if (currentPage > 0) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ticketscan_page_${currentPage - 1}`)
          .setLabel('◀ Previous')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⬅️')
      );
    }
    if (currentPage < totalPages - 1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ticketscan_page_${currentPage + 1}`)
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('➡️')
      );
    }

    await interaction.editReply({ embeds: [embed], components: row.components.length ? [row] : [] });
  } catch (error) {
    console.error('handleTicketscan error:', error);
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply('❌ An error occurred while processing the command.').catch(() => {});
    } else if (!interaction.replied) {
      await interaction.reply({ content: '❌ An error occurred while processing the command.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}

async function handleTicketscanPage(interaction, page) {
  await handleTicketscan(interaction, parseInt(page));
}

// ==================== EVENT HANDLERS ====================
function initModStats(client) {
  if (!getTrackedRoleIds().length) {
    console.warn('⚠️ No tracked staff roles configured; mod stats will still count admins, dashboard staff, exception roles, and ticket ping roles.');
  }

  // Load all data first
  Promise.all([
    ticketConfig.ensureLoaded(),
    dashboardSync.fetchDashboardSettings({ force: true }),
    loadStats(),
    loadProcessedMessages(),
    loadRepliesCache()
  ]).then(() => {
    console.log('✅ Stats and cache loaded, starting pre-scan...');
    syncDashboardSnapshots(client).catch(err => {
      console.error('❌ Error syncing dashboard stat snapshots:', err);
    });
    // Run pre-scan after loading cache
    setTimeout(() => {
      preScanTicketChannels(client)
        .then(() => syncDashboardSnapshots(client))
        .catch(err => {
          console.error('❌ Error during pre-scan:', err);
        });
    }, 5000); // Wait 5 seconds for guilds to be fully loaded
  });

  setInterval(() => {
    if (writePending) saveStatsNow();
    if (repliesWritePending) saveRepliesCache();
  }, WRITE_DEBOUNCE_MS * 2);

  setInterval(() => {
    dashboardSync.fetchDashboardSettings({ force: true })
      .then(() => {
        memberCache = { timestamp: 0, members: [] };
        trackedOnlyCache = { timestamp: 0, members: [] };
      })
      .catch(err => {
        console.warn('⚠️ Could not refresh dashboard staff role settings:', err.message);
      });
  }, Number(process.env.DASHBOARD_SETTINGS_REFRESH_MS || 5 * 60 * 1000));

  client.on('messageCreate', async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    const member = message.member || await message.guild?.members.fetch(message.author.id).catch(() => null);
    const relevant = isStaff(member);

    // Count configured ticket channels, including channels recorded in ticketChannels.json and
    // any current ticket category from ticketConfig.json. This keeps the dashboard counter working
    // after ticket categories are edited without requiring code changes.
    const inTicketChannel = await isTicketChannel(message);

    // Track staff messages only inside ticket channels so dashboard goals match ticket support activity.
    if (inTicketChannel && relevant && !processedMessages.has(message.id)) {
      processedMessages.add(message.id);
      messageCounts[message.author.id] = (messageCounts[message.author.id] || 0) + 1;
      fastModStats.incrementMessageCount(message.author.id);
      scheduleWrite();
      saveProcessedMessages().catch(() => {});
      dashboardSync.syncStaffMessage(message.author, message).catch(() => {});
    }
    
    if (inTicketChannel && relevant) {
      const channelId = message.channel.id;
      
      // Initialize the Set for this channel if it doesn't exist
      if (!ticketChannelReplies.has(channelId)) {
        ticketChannelReplies.set(channelId, new Set());
      }
      
      // Add this staff member to the repliers set
      const repliers = ticketChannelReplies.get(channelId);
      if (!repliers.has(message.author.id)) {
        repliers.add(message.author.id);
        fastModStats.addStaffReply(channelId, message.author.id);
        scheduleRepliesWrite();
      }
    }
  });

  // Clean up ticketChannelReplies when channels are deleted
  client.on('channelDelete', (channel) => {
    if (ticketChannelReplies.has(channel.id)) {
      ticketChannelReplies.delete(channel.id);
      scheduleRepliesWrite();
    }
  });
}

// Export increment function for use in ticketHandlers
function incrementClaimedTicket(userId) {
  ticketCounts[userId] = (ticketCounts[userId] || 0) + 1;
  fastModStats.incrementTicketCount(userId);
  scheduleWrite();
}

module.exports = {
  modcheckCommand,
  modclearCommand,
  modgetCommand,
  modinfoCommand,
  ticketscanCommand,
  handleModcheck,
  handleModclear,
  handleModget,
  handleModcheckPage,
  handleModinfo,
  handleModinfoRoleSelect,
  handleModinfoPage,
  handleTicketscan,
  handleTicketscanPage,
  initModStats,
  incrementClaimedTicket,
  // Export for testing
  preScanTicketChannels,
  isStaff,
  isTicketChannel,
  getConfiguredTicketCategoryIds,
  getConfiguredStaffRoleIds,
  getTrackedRoleIds
};
