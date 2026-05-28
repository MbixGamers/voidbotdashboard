// src/bot.js
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Events, REST, Routes, MessageFlags } = require('discord.js');
const { discordToken, discordClientId, discordGuildId } = require('./config');

// Import command handlers
const pros = require('./commands/pros');
const merch = require('./commands/merch');
const news = require('./commands/news');
const videos = require('./commands/videos');
const advanced = require('./commands/advanced');
const help = require('./commands/help');
const socials = require('./commands/socials');
const latestVideo = require('./commands/latestVideo');
const moderation = require('./commands/moderation');
const funfact = require('./commands/funfact');
const ranking = require('./commands/ranking');
const birthday = require('./commands/birthday');
const modStats = require('./commands/modStats');
const gameSubmit = require('./commands/gameSubmit');
const gatekeeper = require('./commands/gatekeeper');

// Ticket system
const ticketSetup = require('./commands/ticketSetup');
const ticketEditSetup = require('./commands/ticketEditSetup');
const ticketClose = require('./commands/ticketClose');
const ticketHandlers = require('./utils/ticketHandlers');

// Antinuke system
const antinuke = require('./commands/antinuke');
const antinukeHandler = require('./utils/antinukeHandler');

// New Security Commands
const security = require('./commands/security');
const lock = require('./commands/lock');
const unlock = require('./commands/unlock');
const scan = require('./commands/scan');
const whitelist = require('./commands/whitelist');
const logs = require('./commands/logs');
const fgive = require('./commands/fgive');
const fremove = require('./commands/fremove');
const blacklist = require('./commands/blacklist');

// Security Utilities
const securityHandler = require('./utils/securityHandler');
const serverLogHandler = require('./utils/serverLogHandler');
const fastModStats = require('./utils/fastModStats');
const auditLogger = require('./utils/auditLogger');
const logManager = require('./utils/logManager');

// Bot status
const { setBotStatus } = require('./botStatus');

// Utilities
const { parsePaginationCustomId } = require('./utils/pagination');

// ==================== GLOBAL STATE ====================
let isShuttingDown = false;
let discordReady = false;

// ==================== COMMAND LIST ====================
const commandList = [
  pros.teamsCommand, pros.prosListCommand, pros.proInfoCommand, pros.opsInfoCommand,
  merch.merchCommand,
  news.newsCommand,
  videos.videosCommand,
  advanced.uptimeCommand,
  help.helpCommand,
  socials.socialsCommand,
  latestVideo.latestVideoCommand,
  moderation.kickCommand, moderation.banCommand, moderation.timeoutCommand, moderation.warnCommand, moderation.clearCommand,
  funfact.funFactCommand,
  ranking.rankingCommand,
  birthday.bwishCommand,
  modStats.modcheckCommand, modStats.modclearCommand, modStats.modgetCommand, modStats.modinfoCommand, modStats.ticketscanCommand,
  gameSubmit.gamesubmitCommand, gameSubmit.gamestatCommand, gameSubmit.gamesoloCommand, gameSubmit.gameresetCommand, gameSubmit.gameremoveCommand,
  gatekeeper.gstartCommand, gatekeeper.gstopCommand,
  ticketSetup.data, ticketEditSetup.data, ticketClose.data,
  antinuke.data,
  security.data,
  lock.data,
  unlock.data,
  scan.data,
  whitelist.data,
  logs.data,
  blacklist.data,
  fgive.data,
  fremove.data
].filter(cmd => cmd);

// ==================== COMMAND REGISTRATION ====================
async function registerCommands() {
  const commands = commandList.map(c => c.toJSON());
  const rest = new REST({ version: '10' }).setToken(discordToken);
  try {
    console.log('🔄 Registering slash commands...');
    if (discordGuildId) {
      await rest.put(Routes.applicationGuildCommands(discordClientId, discordGuildId), { body: commands });
      console.log(`✅ Registered ${commands.length} guild commands`);
    } else {
      await rest.put(Routes.applicationCommands(discordClientId), { body: commands });
      console.log(`✅ Registered ${commands.length} global commands`);
    }
  } catch (error) {
    console.error('❌ Command registration error:', error);
  }
}

// ==================== DISCORD CLIENT ====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildIntegrations,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.DirectMessageTyping,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User],
  failIfNotExists: false
});

client.once(Events.ClientReady, async () => {
  discordReady = true;
  console.log(`✅ Discord bot ready: ${client.user.tag}`);
  console.log(`📊 Serving ${client.guilds.cache.size} server(s)`);
  
  // Register commands
  await registerCommands().catch(console.error);

  // Set bot status
  setBotStatus(client);
  
  // Initialize all systems
  await modStats.initModStats(client);
  await gameSubmit.initGameSubmit();
  await gatekeeper.initGatekeeper();
  await fastModStats.initFastModStats();
    await ticketHandlers.initTimers(client).catch(console.error);
  
  console.log('🛡️ Security systems initialized');
  console.log('⚡ Fast ModStats ready');
});

client.on(Events.Error, (error) => console.error('❌ Discord client error:', error));
client.on(Events.Warn, (warning) => console.warn('⚠️ Discord warning:', warning));

// ==================== SAFE REPLY HELPER ====================
async function safeReply(interaction, content, options = {}) {
  try {
    if (interaction.replied) {
      await interaction.followUp({ content, ...options, flags: MessageFlags.Ephemeral });
    } else if (interaction.deferred) {
      await interaction.editReply({ content, ...options });
    } else {
      await interaction.reply({ content, ...options, flags: MessageFlags.Ephemeral });
    }
    return true;
  } catch (error) {
    if (error.code !== 10062) { // Ignore unknown interaction errors
      console.error('safeReply error:', error);
    }
    return false;
  }
}

// ==================== INTERACTION HANDLER ====================
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction);
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
    }
  } catch (err) {
    if (err.code !== 10062) { // Ignore unknown interaction errors
      console.error('❌ Interaction error:', err);
    }
    if (!interaction.replied && !interaction.deferred) {
      await safeReply(interaction, 'An error occurred. Please try again.');
    }
  }
});

// ==================== SLASH COMMAND HANDLER ====================
async function handleSlashCommand(interaction) {
  const commandName = interaction.commandName;
  
  // Commands that don't need deferral
  const noDeferCommands = ['setup', 'editsetup', 'close', 'antinuke', 'security', 'lock', 'unlock', 'scan', 'whitelist', 'logs', 'blacklist'];
  
  if (!noDeferCommands.includes(commandName) && !interaction.deferred && !interaction.replied) {
    await interaction.deferReply().catch(() => {});
  }

  const handlers = {
    // Existing commands
    teams: pros.handleTeams,
    pros_list: pros.handleProsList,
    pro_info: pros.handleProInfo,
    ops_info: pros.handleOpsInfo,
    merch: merch.handleMerch,
    news: news.handleNews,
    videos: videos.handleVideos,
    uptime: advanced.handleUptime,
    help: help.handleHelp,
    socials: socials.handleSocials,
    'latest-video': latestVideo.handleLatestVideo,
    kick: moderation.handleKick,
    ban: moderation.handleBan,
    timeout: moderation.handleTimeout,
    warn: moderation.handleWarn,
    clear: moderation.handleClear,
    funfact: funfact.handleFunFact,
    ranking: ranking.handleRanking,
    bwish: birthday.handleBwish,
    modcheck: modStats.handleModcheck,
    modclear: modStats.handleModclear,
    modget: modStats.handleModget,
    modinfo: modStats.handleModinfo,
    ticketscan: modStats.handleTicketscan,
    gamesubmit: gameSubmit.handleGamesubmit,
    gamestat: gameSubmit.handleGamestat,
    gamesolo: gameSubmit.handleGamesolo,
    gamereset: gameSubmit.handleGamereset,
    gameremove: gameSubmit.handleGameremove,
    gstart: gatekeeper.handleGstart,
    gstop: gatekeeper.handleGstop,
    setup: ticketSetup.execute,
    editsetup: ticketEditSetup.execute,
    close: ticketClose.execute,
    
    // New security commands
    antinuke: antinuke.execute,
    security: security.execute,
    lock: lock.execute,
    unlock: unlock.execute,
    scan: scan.execute,
    whitelist: whitelist.execute,
    fgive: fgive.execute,
    fremove: fremove.execute,
    logs: logs.execute,
    blacklist: blacklist.execute
  };

  const handler = handlers[commandName];
  if (handler) {
    await handler(interaction);
    const moderationCommands = new Set(['kick', 'ban', 'timeout', 'warn', 'clear']);
    if (moderationCommands.has(commandName)) {
      await logManager.logModerationCommand(interaction).catch(() => {});
    }
    await logManager.logCommand(interaction).catch(() => {});
  } else if (!interaction.replied && !interaction.deferred) {
    await safeReply(interaction, 'Unknown command.');
  } else if (interaction.deferred && !interaction.replied) {
    await interaction.editReply({ content: 'Unknown command.' }).catch(() => {});
  }
}

// ==================== BUTTON HANDLER ====================
async function handleButton(interaction) {
  const id = interaction.customId;

  // === Ticket Setup Buttons ===
  if (id === 'setup_style_buttons' || id === 'setup_style_dropdown') {
    await ticketSetup.handlers.handleSetupStyle(interaction, id === 'setup_style_buttons' ? 'buttons' : 'dropdown');
    return;
  }
  if (id === 'setup_next_category') {
    await ticketSetup.handlers.handleNextCategory(interaction);
    return;
  }
  if (id === 'setup_next_ping') {
    await ticketSetup.handlers.handleNextPing(interaction);
    return;
  }
  if (id === 'setup_next_message') {
    await ticketSetup.handlers.handleNextMessage(interaction);
    return;
  }
  if (id === 'setup_next_transcript') {
    await ticketSetup.handlers.handleNextTranscript(interaction);
    return;
  }
  if (id === 'setup_next_content') {
    await ticketSetup.handlers.handleNextContent(interaction);
    return;
  }
  if (id === 'setup_next_logo') {
    await ticketSetup.handlers.handleNextLogo(interaction);
    return;
  }
  if (id === 'setup_next_banner') {
    await ticketSetup.handlers.handleNextBanner(interaction);
    return;
  }
  if (id.startsWith('setup_add_question_')) {
    const index = parseInt(id.split('_')[3]);
    await ticketSetup.handlers.handleAddQuestion(interaction, index);
    return;
  }

  if (id.startsWith('blacklist_')) {
    await blacklist.handleButton(interaction);
    return;
  }
  if (id.startsWith('setup_next_type_')) {
    const index = parseInt(id.split('_')[3]);
    await ticketSetup.handlers.handleNextType(interaction, index);
    return;
  }
  if (id === 'setup_finish_questions') {
    await ticketSetup.handlers.handleFinishQuestions(interaction);
    return;
  }
  if (id === 'setup_force_overall_yes' || id === 'setup_force_overall_no') {
    await ticketSetup.handlers.handleForceOverall(interaction, id === 'setup_force_overall_yes');
    return;
  }
  if (id === 'setup_claim_overall_yes' || id === 'setup_claim_overall_no') {
    await ticketSetup.handlers.handleClaimOverall(interaction, id === 'setup_claim_overall_yes');
    return;
  }
  if (id === 'setup_ping_overall_yes' || id === 'setup_ping_overall_no') {
    await ticketSetup.handlers.handlePingOverall(interaction, id === 'setup_ping_overall_yes');
    return;
  }
  if (id === 'setup_message_overall_yes' || id === 'setup_message_overall_no') {
    await ticketSetup.handlers.handleMessageOverall(interaction, id === 'setup_message_overall_yes');
    return;
  }
  if (id === 'setup_content_overall_yes' || id === 'setup_content_overall_no') {
    await ticketSetup.handlers.handleContentOverall(interaction, id === 'setup_content_overall_yes');
    return;
  }
  if (id === 'setup_logo_overall_yes' || id === 'setup_logo_overall_no') {
    await ticketSetup.handlers.handleLogoOverall(interaction, id === 'setup_logo_overall_yes');
    return;
  }
  if (id === 'setup_banner_overall_yes' || id === 'setup_banner_overall_no') {
    await ticketSetup.handlers.handleBannerOverall(interaction, id === 'setup_banner_overall_yes');
    return;
  }

  // Setup claim per type
  if (id.startsWith('setup_claim_per_type_')) {
    const parts = id.split('_');
    if (parts.length < 7) {
      console.log('Invalid claim button format:', id);
      return;
    }
    const userId = parts[4];
    const index = parseInt(parts[5], 10);
    const isYes = parts[6] === 'yes';
    if (isNaN(index)) return;
    await ticketSetup.handlers.handleClaimPerType(interaction, index, isYes);
    return;
  }

  // === Edit Setup Buttons ===
  if (id === 'edit_style') {
    await ticketEditSetup.handlers.handleEditStyle(interaction);
    return;
  }
  if (id === 'edit_style_buttons' || id === 'edit_style_dropdown') {
    const style = id === 'edit_style_buttons' ? 'buttons' : 'dropdown';
    await ticketEditSetup.handlers.handleEditStyleChoice(interaction, style);
    return;
  }
  if (id === 'edit_names') {
    await ticketEditSetup.handlers.handleEditNames(interaction);
    return;
  }
  if (id === 'edit_categories') {
    await ticketEditSetup.handlers.handleEditCategories(interaction);
    return;
  }
  if (id === 'edit_questions') {
    await ticketEditSetup.handlers.handleEditQuestions(interaction);
    return;
  }
  if (id === 'edit_claim') {
    await ticketEditSetup.handlers.handleEditClaim(interaction);
    return;
  }
  if (id === 'edit_ping') {
    await ticketEditSetup.handlers.handleEditPing(interaction);
    return;
  }
  if (id === 'edit_messages') {
    await ticketEditSetup.handlers.handleEditMessages(interaction);
    return;
  }
  if (id === 'edit_content') {
    await ticketEditSetup.handlers.handleEditContent(interaction);
    return;
  }
  if (id === 'edit_logo') {
    await ticketEditSetup.handlers.handleEditLogo(interaction);
    return;
  }
  if (id === 'edit_banner') {
    await ticketEditSetup.handlers.handleEditBanner(interaction);
    return;
  }
  if (id === 'edit_transcript') {
    await ticketEditSetup.handlers.handleEditTranscript(interaction);
    return;
  }
  if (id.startsWith('edit_question_add_')) {
    const index = parseInt(id.split('_')[3]);
    await ticketEditSetup.handlers.handleEditQuestionAdd(interaction, index);
    return;
  }
  if (id.startsWith('edit_question_clear_')) {
    const index = parseInt(id.split('_')[3]);
    await ticketEditSetup.handlers.handleEditQuestionClear(interaction, index);
    return;
  }
  if (id.startsWith('edit_question_next_')) {
    const index = parseInt(id.split('_')[3]);
    await ticketEditSetup.handlers.handleEditQuestionNext(interaction, index);
    return;
  }
  if (id === 'edit_question_done') {
    await ticketEditSetup.handlers.handleEditQuestionDone(interaction);
    return;
  }
  if (id.startsWith('edit_questions_overall_') && (id.endsWith('_yes') || id.endsWith('_no'))) {
    const choice = id.endsWith('_yes');
    await ticketEditSetup.handlers.handleEditQuestionsOverall(interaction, choice);
    return;
  }
  if (id.startsWith('edit_claim_overall_') && (id.endsWith('_yes') || id.endsWith('_no'))) {
    const choice = id.endsWith('_yes');
    await ticketEditSetup.handlers.handleEditClaimOverall(interaction, choice);
    return;
  }
  if (id.startsWith('edit_ping_overall_') && (id.endsWith('_yes') || id.endsWith('_no'))) {
    const choice = id.endsWith('_yes');
    await ticketEditSetup.handlers.handleEditPingOverall(interaction, choice);
    return;
  }
  if (id.startsWith('edit_message_overall_') && (id.endsWith('_yes') || id.endsWith('_no'))) {
    const choice = id.endsWith('_yes');
    await ticketEditSetup.handlers.handleEditMessageOverall(interaction, choice);
    return;
  }

  // Edit per type claim
  if (id.startsWith('edit_claim_per_type_')) {
    const parts = id.split('_');
    if (parts.length < 7) {
      console.log('Invalid edit claim button format:', id);
      return;
    }
    const userId = parts[4];
    const index = parseInt(parts[5], 10);
    const isYes = parts[6] === 'yes';
    if (isNaN(index)) return;
    await ticketEditSetup.handlers.handleEditClaimPerType(interaction, index, isYes);
    return;
  }

  // Continue buttons
  if (id === 'edit_ping_next') {
    await ticketEditSetup.handlers.handleEditPingNext(interaction);
    return;
  }
  if (id === 'edit_message_next') {
    await ticketEditSetup.handlers.handleEditMessageNext(interaction);
    return;
  }

  // === Ticket open / claim / close ===
  if (id.startsWith('ticket_open_')) {
    const index = parseInt(id.split('_')[2]);
    await ticketHandlers.handleTicketOpen(interaction, index);
    return;
  }
  if (id.startsWith('ticket_claim_')) {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    await ticketHandlers.handleClaim(interaction);
    return;
  }
  if (id.startsWith('ticket_close_')) {
    await ticketHandlers.handleCloseButton(interaction);
    return;
  }
  if (id.startsWith('ticket_timer_start_')) {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    await ticketHandlers.handleStartTimer(interaction);
    return;
  }

  // === Moderation Confirmation Buttons ===
  if (id.startsWith('confirm_kick_')) {
    await moderation.handleKickConfirm(interaction);
    return;
  }
  if (id.startsWith('confirm_ban_')) {
    await moderation.handleBanConfirm(interaction);
    return;
  }
  if (id.startsWith('confirm_ban_notify_')) {
    await moderation.handleBanConfirmWithDM(interaction);
    return;
  }
  if (id.startsWith('confirm_timeout_')) {
    await moderation.handleTimeoutConfirm(interaction);
    return;
  }
  if (id === 'cancel_mod_action') {
    await moderation.handleCancel(interaction);
    return;
  }

  // === Help Buttons ===
  if (id.startsWith('help_')) {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    if (id === 'help_all') {
      await help.handleHelpCategory(interaction, null);
    } else {
      await help.handleHelpCategory(interaction, id.replace('help_', ''));
    }
    return;
  }

  // === Pagination Buttons ===
  if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});

  if (id.startsWith('pag:')) {
    const parsed = parsePaginationCustomId(id);
    if (!parsed) {
      await interaction.editReply({ content: 'Invalid pagination button.' }).catch(() => {});
      return;
    }
    const { cmd, page, extra } = parsed;
    if (cmd === 'pros_list') await pros.handleProsListPaginated(interaction, page, extra);
    else if (cmd === 'ops_info') await pros.handleOpsInfoPaginated(interaction, page);
    else if (cmd === 'merch') await merch.handleMerchPaginated(interaction, page, extra);
    else if (cmd === 'news') await news.handleNewsPaginated(interaction, page, extra);
    else if (cmd === 'videos') await videos.handleVideosPaginated(interaction, page, extra);
    else await interaction.editReply({ content: 'Unknown paginated command.' }).catch(() => {});
    return;
  }

  if (id.startsWith('back:')) {
    const parts = id.slice(5).split(':');
    if (parts.length < 2) {
      await interaction.editReply({ content: 'Invalid back button.' }).catch(() => {});
      return;
    }
    const cmd = parts[0];
    const page = parseInt(parts[1], 10) || 0;
    const extra = parts.length > 2 ? parts.slice(2).join(':').replace(/_/g, ' ') : '';
    if (cmd === 'pros_list') await pros.handleProsListPaginated(interaction, page, extra);
    else if (cmd === 'ops_info') await pros.handleOpsInfoPaginated(interaction, page);
    else if (cmd === 'merch') await merch.handleMerchPaginated(interaction, page, extra);
    else if (cmd === 'news') await news.handleNewsPaginated(interaction, page, extra);
    else if (cmd === 'videos') await videos.handleVideosPaginated(interaction, page, extra);
    return;
  }

  if (id === 'refresh_latest_youtube' || id === 'refresh_ranking') {
    await latestVideo.handleRefreshLatest(interaction);
    return;
  }

  if (id.startsWith('videos_page_')) {
    const parts = id.split('_');
    if (parts.length < 5) {
      await interaction.editReply({ content: 'Invalid video button.' }).catch(() => {});
      return;
    }
    await videos.handleVideosPaginated(interaction, parseInt(parts[2], 10), parts[3], parts[4]);
    return;
  }

  if (id.startsWith('modcheck_page_')) {
    const page = id.split('_')[2];
    await modStats.handleModcheckPage(interaction, page);
    return;
  }
  if (id.startsWith('gamestat_page_')) {
    const page = id.split('_')[2];
    await gameSubmit.handleGamestatPage(interaction, page);
    return;
  }
  if (id.startsWith('modinfo_page_')) {
    const parts = id.split('_');
    if (parts.length >= 4) {
      const page = parts[2];
      const roleId = parts.slice(3).join('_');
      await modStats.handleModinfoPage(interaction, page, roleId);
    }
    return;
  }
  if (id.startsWith('ticketscan_page_')) {
    const page = id.split('_')[2];
    await modStats.handleTicketscanPage(interaction, page);
    return;
  }
  if (id.startsWith('warnings_view_')) {
    const parts = id.split('_');
    if (parts.length < 3) {
      await interaction.editReply({ content: 'Invalid warnings button.' }).catch(() => {});
      return;
    }
    await moderation.handleViewWarnings(interaction, parts[2]);
    return;
  }
  if (id.startsWith('dm_warning_')) {
    const parts = id.split('_');
    if (parts.length < 4) return;
    await moderation.handleDMWarning(interaction, parts[2], parts[3]);
    return;
  }

  // Scan refresh button
  if (id === 'scan_refresh') {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    await scan.handleRefresh(interaction);
    return;
  }

  // Unknown button - log but don't error
  console.log(`Unknown button clicked: ${id}`);
}

// ==================== SELECT MENU HANDLER ====================
async function handleSelectMenu(interaction) {
  const id = interaction.customId;

  if (id === 'ticket_open_select') {
    const index = parseInt(interaction.values[0]);
    await ticketHandlers.handleTicketOpen(interaction, index);
    return;
  }

  if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});

  if (id.startsWith('pro_sel:')) {
    const parts = id.slice(8).split(':');
    if (parts.length < 3) {
      await interaction.editReply({ content: 'Invalid select menu.' }).catch(() => {});
      return;
    }
    const cmd = parts[0];
    const page = parseInt(parts[1], 10) || 0;
    const extra = parts.length > 2 ? parts.slice(2).join(':').replace(/_/g, ' ') : '';
    const proValue = interaction.values?.[0];
    if (proValue) {
      await pros.replyWithProDetail(interaction, proValue, { cmd, page, extra });
    } else {
      await interaction.editReply({ content: 'No pro selected.' }).catch(() => {});
    }
    return;
  }

  if (id.startsWith('ops_sel:')) {
    const parts = id.slice(8).split(':');
    if (parts.length < 2) {
      await interaction.editReply({ content: 'Invalid select menu.' }).catch(() => {});
      return;
    }
    const cmd = parts[0];
    const page = parseInt(parts[1], 10) || 0;
    const opValue = interaction.values?.[0];
    if (opValue) {
      await pros.replyWithOpsDetail(interaction, opValue, { cmd, page, extra: '' });
    } else {
      await interaction.editReply({ content: 'No member selected.' }).catch(() => {});
    }
    return;
  }

  if (id === 'modinfo_role_select') {
    await modStats.handleModinfoRoleSelect(interaction);
    return;
  }

  await interaction.editReply({ content: 'Unknown select menu.' }).catch(() => {});
}

// ==================== MODAL SUBMIT HANDLER ====================
async function handleModalSubmit(interaction) {
  const id = interaction.customId;

  // Setup modals
  if (id === 'setup_names_modal') {
    await ticketSetup.handlers.handleSetupNamesModal(interaction);
    return;
  }
  if (id.startsWith('setup_category_')) {
    const index = parseInt(id.split('_')[2]);
    await ticketSetup.handlers.handleSetupCategoryModal(interaction, index);
    return;
  }
  if (id.startsWith('setup_question_')) {
    const typeIndex = parseInt(id.split('_')[2]);
    await ticketSetup.handlers.handleQuestionModal(interaction, typeIndex);
    return;
  }
  if (id.startsWith('setup_ping_')) {
    const index = parseInt(id.split('_')[2]);
    await ticketSetup.handlers.handlePingRolesModal(interaction, index);
    return;
  }
  if (id.startsWith('setup_message_')) {
    const index = parseInt(id.split('_')[2]);
    await ticketSetup.handlers.handleOpeningMessageModal(interaction, index);
    return;
  }
  if (id === 'setup_transcript_modal') {
    await ticketSetup.handlers.handleTranscriptModal(interaction);
    return;
  }
  if (id === 'setup_main_content_modal') {
    await ticketSetup.handlers.handleMainContentModal(interaction);
    return;
  }
  if (id === 'setup_logo_modal') {
    await ticketSetup.handlers.handleLogoModal(interaction);
    return;
  }
  if (id === 'setup_banner_modal') {
    await ticketSetup.handlers.handleBannerModal(interaction);
    return;
  }

  // Edit modals
  if (id === 'edit_names_modal') {
    await ticketEditSetup.handlers.handleEditNamesModal(interaction);
    return;
  }
  if (id === 'edit_categories_modal') {
    await ticketEditSetup.handlers.handleEditCategoriesModal(interaction);
    return;
  }
  if (id.startsWith('edit_question_modal_')) {
    const index = parseInt(id.split('_')[3]);
    await ticketEditSetup.handlers.handleEditQuestionModal(interaction, index);
    return;
  }
  if (id.startsWith('edit_ping_modal_')) {
    const index = parseInt(id.split('_')[3]);
    await ticketEditSetup.handlers.handleEditPingModal(interaction, index);
    return;
  }
  if (id.startsWith('edit_message_modal_')) {
    const index = parseInt(id.split('_')[3]);
    await ticketEditSetup.handlers.handleEditMessageModal(interaction, index);
    return;
  }
  if (id === 'edit_transcript_modal') {
    await ticketEditSetup.handlers.handleEditTranscriptModal(interaction);
    return;
  }
  if (id === 'edit_content_modal') {
    await ticketEditSetup.handlers.handleEditContentModal(interaction);
    return;
  }
  if (id === 'edit_logo_modal') {
    await ticketEditSetup.handlers.handleEditLogoModal(interaction);
    return;
  }
  if (id === 'edit_banner_modal') {
    await ticketEditSetup.handlers.handleEditBannerModal(interaction);
    return;
  }

  // Ticket questions modal
  if (id.startsWith('ticket_questions_')) {
    const index = parseInt(id.split('_')[2]);
    await ticketHandlers.handleTicketQuestionsSubmit(interaction, index);
    return;
  }

  if (id === 'blacklist_request_modal') {
    await blacklist.handleModalSubmit(interaction);
    return;
  }

  // Ticket close reason modal
  if (id === 'ticket_close_reason') {
    await ticketHandlers.handleCloseModal(interaction);
    return;
  }

  await safeReply(interaction, 'Unknown modal.');
}

// ==================== MESSAGE HANDLER ====================
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  
  // Gatekeeper first
  await gatekeeper.handleMessage(message).catch(err => console.error('Gatekeeper error:', err));
  
  // Anti-scam and anti-spam
  try {
    const isScam = await antinukeHandler.handleAntiScam(message);
    if (!isScam) {
      await antinukeHandler.handleAntiSpam(message);
    }
  } catch (err) {
    console.error('Antinuke error:', err);
  }
});

// ==================== SECURITY EVENT HANDLERS ====================
client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
  securityHandler.handleGuildMemberUpdate(oldMember, newMember).catch(console.error);
  serverLogHandler.handleGuildMemberUpdate(oldMember, newMember).catch(console.error);
});

client.on(Events.GuildUpdate, (oldGuild, newGuild) => {
  serverLogHandler.handleGuildUpdate(oldGuild, newGuild).catch(console.error);
});

client.on(Events.RoleCreate, (role) => {
  securityHandler.handleRoleCreate(role).catch(console.error);
  serverLogHandler.handleRoleCreate(role).catch(console.error);
});

client.on(Events.RoleDelete, (role) => {
  securityHandler.handleRoleDelete(role).catch(console.error);
  serverLogHandler.handleRoleDelete(role).catch(console.error);
});

client.on(Events.RoleUpdate, (oldRole, newRole) => {
  securityHandler.handleRoleUpdate(oldRole, newRole).catch(console.error);
  serverLogHandler.handleRoleUpdate(oldRole, newRole).catch(console.error);
});

client.on(Events.GuildBanAdd, (ban) => {
  securityHandler.handleGuildBanAdd(ban).catch(console.error);
  serverLogHandler.handleGuildBanAdd(ban).catch(console.error);
});

client.on(Events.GuildBanRemove, (guild, user) => {
  serverLogHandler.handleGuildBanRemove(guild, user).catch(console.error);
});

client.on(Events.GuildMemberRemove, (member) => {
  securityHandler.handleGuildMemberRemove(member).catch(console.error);
  serverLogHandler.handleGuildMemberRemove(member).catch(console.error);
});

client.on(Events.GuildMemberAdd, (member) => {
  serverLogHandler.handleGuildMemberAdd(member).catch(console.error);
  blacklist.handleGuildMemberAdd(member).catch(console.error);
});

client.on(Events.ChannelCreate, (channel) => {
  securityHandler.handleChannelCreate(channel).catch(console.error);
  serverLogHandler.handleChannelCreate(channel).catch(console.error);
});

client.on(Events.ChannelDelete, (channel) => {
  securityHandler.handleChannelDelete(channel).catch(console.error);
  serverLogHandler.handleChannelDelete(channel).catch(console.error);
});

client.on(Events.ChannelUpdate, (oldChannel, newChannel) => {
  serverLogHandler.handleChannelUpdate(oldChannel, newChannel).catch(console.error);
});

client.on(Events.MessageDelete, (message) => {
  serverLogHandler.handleMessageDelete(message).catch(console.error);
});

client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
  serverLogHandler.handleMessageUpdate(oldMessage, newMessage).catch(console.error);
});

client.on(Events.MessagesBulkDelete, (messages) => {
  serverLogHandler.handleBulkMessageDelete(messages).catch(console.error);
});

client.on(Events.InviteCreate, (invite) => {
  serverLogHandler.handleInviteCreate(invite).catch(console.error);
});

client.on(Events.InviteDelete, (invite) => {
  serverLogHandler.handleInviteDelete(invite).catch(console.error);
});

client.on(Events.GuildEmojiCreate, (emoji) => {
  serverLogHandler.handleEmojiCreate(emoji).catch(console.error);
});

client.on(Events.GuildEmojiUpdate, (oldEmoji, newEmoji) => {
  serverLogHandler.handleEmojiUpdate(oldEmoji, newEmoji).catch(console.error);
});

client.on(Events.GuildEmojiDelete, (emoji) => {
  serverLogHandler.handleEmojiDelete(emoji).catch(console.error);
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  serverLogHandler.handleVoiceStateUpdate(oldState, newState).catch(console.error);
});

// ==================== LOGIN & SHUTDOWN ====================
async function loginWithRetry() {
  const MAX_ATTEMPTS = 10;
  const BASE_DELAY = 5000;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (isShuttingDown) return console.log('🛑 Shutdown in progress, aborting login.');
    console.log(`🔄 Discord login attempt ${attempt}/${MAX_ATTEMPTS}...`);
    try {
      await Promise.race([
        client.login(discordToken).then(() => new Promise((resolve, reject) => {
          if (discordReady) { resolve(); return; }
          const timer = setTimeout(() => reject(new Error('ClientReady timed out')), 25000);
          client.once(Events.ClientReady, () => { clearTimeout(timer); resolve(); });
        })),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Login timed out after 30s')), 30000))
      ]);
      console.log('🎉 Bot is fully connected!');
      return;
    } catch (err) {
      console.error(`❌ Attempt ${attempt} failed: ${err.message}`);
      if (attempt === MAX_ATTEMPTS) return console.error('❌ All login attempts exhausted.');
      const delay = Math.min(BASE_DELAY * attempt, 60000);
      console.log(`⏳ Retrying in ${delay / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function start() {
  console.log('🚀 Starting Void Esports Discord Bot...');
  if (!discordToken || discordToken.split('.').length !== 3) {
    console.error('❌ DISCORD_TOKEN is missing or malformed.');
    process.exit(1);
  }
  console.log(`🔑 Token loaded (${discordToken.length} chars)`);
  loginWithRetry().catch(console.error);
}

process.on('SIGTERM', () => {
  console.log('📴 SIGTERM received...');
  isShuttingDown = true;
  try { if (discordReady) client.destroy(); } catch (_) {}
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('📴 SIGINT — exiting.');
  process.exit(0);
});
process.on('uncaughtException', (err) => console.error('❌ Uncaught exception:', err));
process.on('unhandledRejection', (err) => console.error('❌ Unhandled rejection:', err));

start();

module.exports = { client };