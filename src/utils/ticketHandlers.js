// src/utils/ticketHandlers.js
const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, Colors } = require('discord.js');
const ticketConfig = require('./ticketConfig');
const guildConfig = require('./guildConfig');
const config = require('../config');
const modStats = require('../commands/modStats');
const dashboardSync = require('./dashboardSync');

async function safeReply(interaction, content, options = {}) {
  try {
    if (interaction.replied) {
      await interaction.followUp({ content, ...options, flags: MessageFlags.Ephemeral }).catch(() => {});
    } else if (interaction.deferred) {
      await interaction.editReply({ content, ...options }).catch(() => {});
    } else {
      await interaction.reply({ content, ...options, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    return true;
  } catch (error) {
    console.error('safeReply error in ticketHandlers:', error);
    return false;
  }
}

async function handleTicketOpen(interaction, typeIndex) {
  try {
    const guild = interaction.guild;
    const ticketConf = await ticketConfig.get(guild.id);
    if (!ticketConf) {
      await safeReply(interaction, 'Ticket system not configured.');
      return;
    }

    // Block blacklisted users from opening tickets
    const gconf = await guildConfig.get(guild.id);
    const blacklistRoleId = gconf.blacklistRoleId || config.blacklistRoleId;
    if (blacklistRoleId && interaction.member.roles.cache.has(blacklistRoleId)) {
      await safeReply(interaction, '❌ You are blacklisted and cannot open tickets.');
      return;
    }

    const ticketType = ticketConf.ticketTypes[typeIndex];
    if (!ticketType) {
      await safeReply(interaction, 'Invalid ticket type.');
      return;
    }

    const existingCount = await userOpenTicketCount(guild.id, interaction.user.id, interaction.member);
    if (existingCount >= 4) {
      await safeReply(interaction, 'You already have 4 open tickets. Please close some before opening more.');
      return;
    }

    // Separate text questions and file questions
    const textQuestions = ticketType.questions?.filter(q => q.type !== 'file') || [];
    const fileQuestions = ticketType.questions?.filter(q => q.type === 'file') || [];

    if (textQuestions.length > 0) {
      const modal = new ModalBuilder()
        .setCustomId(`ticket_questions_${typeIndex}`)
        .setTitle(`Open ${ticketType.name} Ticket`);

      for (let i = 0; i < textQuestions.length; i++) {
        const q = textQuestions[i];
        const label = q.label.length > 45 ? q.label.substring(0, 42) + '...' : q.label;
        
        const input = new TextInputBuilder()
          .setCustomId(`q_${i}`)
          .setLabel(label)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(q.placeholder || '')
          .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
      }
      // Store file questions in a global cache for retrieval after modal submit
      if (!global.ticketFileQuestions) global.ticketFileQuestions = new Map();
      global.ticketFileQuestions.set(`${interaction.user.id}-${typeIndex}`, fileQuestions);
      await interaction.showModal(modal);
    } else {
      // No text questions, create ticket directly
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      }
      await createTicketChannel(interaction, guild, ticketType, {}, fileQuestions);
    }
  } catch (error) {
    console.error('handleTicketOpen error:', error);
    await safeReply(interaction, 'An error occurred. Please try again.');
  }
}

async function handleTicketQuestionsSubmit(interaction, typeIndex) {
  try {
    const guild = interaction.guild;
    const guildConfig = await ticketConfig.get(guild.id);
    if (!guildConfig) {
      await safeReply(interaction, 'Config missing.');
      return;
    }
    const ticketType = guildConfig.ticketTypes[typeIndex];
    if (!ticketType) {
      await safeReply(interaction, 'Invalid type.');
      return;
    }

    const textQuestions = ticketType.questions?.filter(q => q.type !== 'file') || [];
    const fileQuestions = global.ticketFileQuestions?.get(`${interaction.user.id}-${typeIndex}`) || 
                          ticketType.questions?.filter(q => q.type === 'file') || [];

    const answers = {};
    for (let i = 0; i < textQuestions.length; i++) {
      answers[textQuestions[i].label] = interaction.fields.getTextInputValue(`q_${i}`) || '';
    }

    // Clean up cache
    if (global.ticketFileQuestions) {
      global.ticketFileQuestions.delete(`${interaction.user.id}-${typeIndex}`);
    }

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }
    await createTicketChannel(interaction, guild, ticketType, answers, fileQuestions);
  } catch (error) {
    console.error('handleTicketQuestionsSubmit error:', error);
    await safeReply(interaction, 'An error occurred. Please try again.');
  }
}

async function createTicketChannel(interaction, guild, ticketType, answers, fileQuestions = []) {
  try {
    const category = guild.channels.cache.get(ticketType.categoryId);
    if (!category) {
      if (interaction.deferred) {
        await interaction.editReply({ content: 'Ticket category not found. Please contact an admin.' }).catch(() => {});
      } else {
        await safeReply(interaction, 'Ticket category not found. Please contact an admin.');
      }
      return;
    }

    const overwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.UseExternalEmojis
        ],
      },
    ];

    const pingRoleIds = ticketType.pingRoles || [];
    for (const roleId of pingRoleIds) {
      const role = guild.roles.cache.get(roleId);
      if (role) {
        overwrites.push({
          id: roleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.UseExternalEmojis
          ],
        });
      }
    }

    const channel = await guild.channels.create({
      name: `${ticketType.name.toLowerCase().replace(/\s+/g, '-')}-${interaction.user.username}`,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: overwrites,
    });

    await ticketConfig.setChannel(channel.id, {
      guildId: guild.id,
      openerId: interaction.user.id,
      type: ticketType.name,
      createdAt: new Date().toISOString(),
      closed: false,
      claimedBy: null,
      answers: answers,
      pingRoles: pingRoleIds,
      fileQuestions: fileQuestions.map(q => q.label), // store which files were expected
      timer: null
    });

    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle(`🎫 New Ticket: ${ticketType.name}`)
      .setDescription(ticketType.openingMessage || `Welcome <@${interaction.user.id}>! Support will be with you shortly.`)
      .addFields(
        { name: '📅 Opened', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
        { name: '👤 User', value: `<@${interaction.user.id}>`, inline: true }
      );

    if (Object.keys(answers).length) {
      let ansText = '';
      for (const [q, a] of Object.entries(answers)) {
        ansText += `**❓ ${q}**\n\`\`\`${a}\`\`\`\n`;
      }
      embed.addFields({ name: '📋 Pre‑ticket Answers', value: ansText.substring(0, 1024) });
    }

    let content = '';
    if (pingRoleIds.length) {
      const roleMentions = pingRoleIds.map(id => `<@&${id}>`).join(' ');
      content = `**📢 Support Team has been notified!**\n${roleMentions}`;
    }

    const row = new ActionRowBuilder();
    if (ticketType.claimEnabled) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_claim_${channel.id}`)
          .setLabel('Claim Ticket')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🙋')
      );
    }
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_close_${channel.id}`)
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔒')
    );

    // Allow ping roles to start a 12-hour timer which pings opener every 6 hours
    if (pingRoleIds.length) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_timer_start_${channel.id}`)
          .setLabel('Start 12h Timer')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⏱️')
      );
    }

    await channel.send({ content, embeds: [embed], components: [row] });

    // If there are file questions, ask for attachments now
    if (fileQuestions.length > 0) {
      const fileQuestionNames = fileQuestions.map(q => q.label).join('\n- ');
      await channel.send({
        content: `📎 **Please upload the following required file(s):**\n- ${fileQuestionNames}\n\nYou can upload them now.`
      }).catch(() => {}); // Ignore errors if channel is deleted

      // Do NOT await file collection; let it run in the background with error handling
      collectFilesInBackground(channel.id, interaction.user.id, fileQuestions.length, interaction.client).catch(err => {
        // Error is already logged in the function
      });
    }

    // Reply to the interaction immediately – this stops the "loading" state.
    if (interaction.deferred) {
      await interaction.editReply({ content: `✅ Ticket created: ${channel}` }).catch(() => {});
    } else {
      await safeReply(interaction, `✅ Ticket created: ${channel}`);
    }
  } catch (error) {
    console.error('createTicketChannel error:', error);
    const msg = 'An error occurred while creating the ticket. Please try again.';
    if (interaction.deferred) {
      await interaction.editReply({ content: msg }).catch(() => {});
    } else {
      await safeReply(interaction, msg);
    }
  }
}

// Background file collection – does not block the interaction reply
async function collectFilesInBackground(channelId, userId, expectedCount, client) {
  try {
    // Try to get the channel - it might have been deleted
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      console.log(`Channel ${channelId} no longer exists, skipping file collection`);
      return;
    }

    const filter = m => m.author.id === userId && m.attachments.size > 0;
    
    const collected = await channel.awaitMessages({ 
      filter, 
      max: expectedCount, 
      time: 300000, // 5 minutes
      errors: ['time'] 
    }).catch(async (err) => {
      // Timeout occurred
      await channel.send('⏰ No files received within 5 minutes. You can still upload them later if needed.')
        .catch(() => {});
      return null;
    });

    if (collected && collected.size > 0) {
      const attachments = collected.map(m => m.attachments.first().url);
      await channel.send(`✅ Thank you! Received ${attachments.length} file(s).`)
        .catch(() => {});
    }
  } catch (error) {
    console.error('Background file collection error:', error);
    // Channel might have been deleted, ignore silently
  }
}

async function handleClaim(interaction) {
  try {
    // Check if interaction is still valid
    if (!interaction.channel) {
      console.log('Channel no longer exists for claim');
      return;
    }

    const channelId = interaction.channel.id;
    const data = await ticketConfig.getChannel(channelId);
    if (!data || data.closed) {
      await interaction.editReply({ content: 'Ticket not found or already closed.', ephemeral: true }).catch(() => {});
      return;
    }
    if (data.claimedBy) {
      await interaction.editReply({ content: `Already claimed by <@${data.claimedBy}>.`, ephemeral: true }).catch(() => {});
      return;
    }

    const member = interaction.member;
    const allowedRoles = data.pingRoles || [];
    const hasRole = allowedRoles.some(roleId => member.roles.cache.has(roleId));
    if (!hasRole) {
      await interaction.editReply({ content: 'You cannot claim this ticket.', ephemeral: true }).catch(() => {});
      return;
    }

    data.claimedBy = interaction.user.id;
    await ticketConfig.setChannel(channelId, data);

    // Increment claimed tickets count for this staff member
    modStats.incrementClaimedTicket(interaction.user.id);
    dashboardSync.syncTicketClaim(interaction.user).catch(() => {});

    const message = interaction.message;
    if (message) {
      const oldRow = ActionRowBuilder.from(message.components[0]);
      const newRow = new ActionRowBuilder();
      
      for (const component of oldRow.components) {
        if (component.data.custom_id === `ticket_claim_${channelId}`) {
          newRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`ticket_claimed_${channelId}`)
              .setLabel(`Claimed by ${interaction.user.username}`)
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
              .setEmoji('✅')
          );
        } else {
          newRow.addComponents(ButtonBuilder.from(component));
        }
      }
      
      await message.edit({ components: [newRow] }).catch(() => {});
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle('🙋 Ticket Claimed')
      .setDescription(`**${interaction.user}** has claimed this ticket.`)
      .addFields(
        { name: '👤 Claimed by', value: `${interaction.user}`, inline: true },
        { name: '⏰ Time', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
      )
      .setTimestamp();

    await interaction.channel.send({ embeds: [embed] }).catch(() => {});
    await interaction.editReply({ content: 'You claimed this ticket.', ephemeral: true }).catch(() => {});
  } catch (error) {
    console.error('handleClaim error:', error);
    // Channel or message might be gone, just log and ignore
  }
}

async function handleCloseButton(interaction) {
  try {
    const modal = new ModalBuilder()
      .setCustomId('ticket_close_reason')
      .setTitle('Close Ticket');
    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Reason for closing')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Please provide a reason for closing this ticket...')
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    await interaction.showModal(modal);
  } catch (error) {
    console.error('handleCloseButton error:', error);
    await safeReply(interaction, 'An error occurred. Please try again.');
  }
}

async function handleCloseModal(interaction) {
  try {
    const reason = interaction.fields.getTextInputValue('reason');
    
    // Don't defer if we're going to delete the channel
    // Just send an ephemeral reply that will be visible even after channel deletion
    await interaction.reply({ 
      content: '🔒 Closing ticket...', 
      flags: MessageFlags.Ephemeral 
    }).catch(() => {});

    await closeTicket(interaction.channel, interaction.user.id, reason, interaction.client);
    
    // No need to edit reply - channel is being deleted
  } catch (error) {
    console.error('handleCloseModal error:', error);
    // Try to send error message if channel still exists
    try {
      await interaction.followUp({ 
        content: 'An error occurred while closing the ticket.', 
        flags: MessageFlags.Ephemeral 
      }).catch(() => {});
    } catch {}
  }
}

async function closeTicket(channel, closerId, reason, client) {
  try {
    const data = await ticketConfig.getChannel(channel.id);
    if (!data || data.closed) return;

    const transcriptFile = await generateTranscript(channel, data, closerId, reason, client);
    const guild = channel.guild;
    const guildConfig = await ticketConfig.get(guild.id);

    let transcriptMessage = null;
    if (guildConfig?.transcriptChannelId) {
      const transcriptChannel = guild.channels.cache.get(guildConfig.transcriptChannelId)
        || await guild.channels.fetch(guildConfig.transcriptChannelId).catch(() => null);

      if (transcriptChannel?.isTextBased?.()) {
        const embed = new EmbedBuilder()
          .setColor(Colors.DarkPurple)
          .setTitle('📄 Ticket Closed')
          .setDescription(`Ticket **${data.type}** has been closed.`)
          .addFields(
            { name: '📅 Opened', value: `<t:${Math.floor(new Date(data.createdAt).getTime() / 1000)}:F>`, inline: true },
            { name: '👤 Opened by', value: `<@${data.openerId}>`, inline: true },
            { name: '🔒 Closed by', value: `<@${closerId}>`, inline: true },
            { name: '📝 Reason', value: reason, inline: false }
          )
          .setTimestamp();

        if (data.claimedBy) {
          embed.addFields({ name: '🙋 Claimed by', value: `<@${data.claimedBy}>`, inline: true });
        }

        transcriptMessage = await transcriptChannel.send({ embeds: [embed], files: [transcriptFile] }).catch((error) => {
          console.warn('⚠️ Failed to send ticket transcript to Discord transcript channel:', error.message);
          return null;
        });
      } else {
        console.warn(`⚠️ Transcript channel ${guildConfig.transcriptChannelId} was not found or is not text-based; saving dashboard transcript only.`);
      }
    }

    const opener = await client.users.fetch(data.openerId).catch(() => null);
    const claimedBy = data.claimedBy ? await client.users.fetch(data.claimedBy).catch(() => null) : null;
    const closer = await client.users.fetch(closerId).catch(() => null);

    await dashboardSync.syncTicketTranscript({
      ticket_channel_id: channel.id,
      guild_id: guild.id,
      ticket_channel_name: channel.name,
      ticket_type: data.type,
      opener_id: data.openerId,
      opener_username: opener?.tag || opener?.globalName || opener?.username || data.openerId,
      claimed_by: data.claimedBy || null,
      claimed_by_username: claimedBy?.tag || claimedBy?.globalName || claimedBy?.username || null,
      closed_by: closerId,
      closer_username: closer?.tag || closer?.globalName || closer?.username || closerId,
      close_reason: reason,
      transcript_text: transcriptFile.attachment.toString('utf8'),
      discord_message_url: transcriptMessage?.url || null,
      closed_at: new Date().toISOString(),
      metadata: {
        transcript_file_name: transcriptFile.name,
        discord_transcript_channel_id: guildConfig?.transcriptChannelId || null
      }
    });

    // Clear any active timers for this ticket
    if (global.ticketTimers && global.ticketTimers.has(channel.id)) {
      const timers = global.ticketTimers.get(channel.id);
      if (timers.timeout1) clearTimeout(timers.timeout1);
      if (timers.timeout2) clearTimeout(timers.timeout2);
      global.ticketTimers.delete(channel.id);
    }

    data.closed = true;
    data.timer = null;
    await ticketConfig.setChannel(channel.id, data);
    
    // Delete the channel after a short delay to ensure any final messages are sent
    setTimeout(async () => {
      await channel.delete().catch(() => {});
    }, 1000);
  } catch (error) {
    console.error('closeTicket error:', error);
  }
}

async function generateTranscript(channel, ticketData, closerId, reason, client) {
  try {
    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => []);
    const sorted = [...messages.values()].reverse();
    const opener = await client.users.fetch(ticketData.openerId).catch(() => ({ tag: 'Unknown' }));
    const closer = await client.users.fetch(closerId).catch(() => ({ tag: 'Unknown' }));

    const lines = [];
    lines.push('='.repeat(50));
    lines.push(`📁 TICKET TRANSCRIPT - ${channel.name}`);
    lines.push('='.repeat(50));
    lines.push('');
    lines.push(`🔒 Closed at: ${new Date().toUTCString()}`);
    lines.push(`🔒 Closed by: ${closer.tag} (ID: ${closerId})`);
    lines.push(`📝 Closing reason: ${reason}`);
    lines.push(`📅 Opened by: ${opener.tag} (ID: ${ticketData.openerId}) at ${new Date(ticketData.createdAt).toUTCString()}`);
    if (ticketData.claimedBy) {
      const claimedBy = await client.users.fetch(ticketData.claimedBy).catch(() => ({ tag: 'Unknown' }));
      lines.push(`🙋 Claimed by: ${claimedBy.tag} (ID: ${ticketData.claimedBy})`);
    }
    if (ticketData.answers && Object.keys(ticketData.answers).length) {
      lines.push('');
      lines.push('─'.repeat(30));
      lines.push('📋 PRE-TICKET ANSWERS');
      lines.push('─'.repeat(30));
      for (const [q, a] of Object.entries(ticketData.answers)) {
        lines.push(`❓ ${q}:`);
        lines.push(`📝 ${a}`);
        lines.push('');
      }
    }
    lines.push('');
    lines.push('─'.repeat(30));
    lines.push('💬 MESSAGES');
    lines.push('─'.repeat(30));
    lines.push('');
    for (const msg of sorted) {
      const time = msg.createdAt.toUTCString();
      lines.push(`[${time}] ${msg.author.tag}:`);
      if (msg.content) lines.push(`${msg.content}`);
      if (msg.attachments.size) {
        lines.push(`[Attachments: ${msg.attachments.map(a => a.url).join(', ')}]`);
      }
      lines.push('');
    }
    const buffer = Buffer.from(lines.join('\n'), 'utf-8');
    return { attachment: buffer, name: `transcript-${channel.name}-${Date.now()}.txt` };
  } catch (error) {
    console.error('generateTranscript error:', error);
    // Return empty transcript if generation fails
    const buffer = Buffer.from('Failed to generate transcript', 'utf-8');
    return { attachment: buffer, name: `transcript-${channel.name}-${Date.now()}.txt` };
  }
}

async function userOpenTicketCount(guildId, userId, member) {
  if (member && member.permissions.has(PermissionFlagsBits.Administrator)) {
    return 0;
  }
  const channels = ticketConfig.getAllChannels();
  let count = 0;
  for (const [chId, data] of Object.entries(channels)) {
    if (data.guildId === guildId && data.openerId === userId && !data.closed) {
      count++;
    }
  }
  return count;
}

async function isTicketChannel(channelId) {
  const data = await ticketConfig.getChannel(channelId);
  return data !== null && !data.closed;
}

// Timer management for ticket reminders
async function handleStartTimer(interaction) {
  try {
    const channelId = interaction.channel.id;
    const data = await ticketConfig.getChannel(channelId);
    if (!data || data.closed) {
      await safeReply(interaction, 'Ticket not found or already closed.');
      return;
    }

    // Only ping roles can start the timer
    const allowed = data.pingRoles || [];
    const member = interaction.member;
    const hasRole = allowed.some(r => member.roles.cache.has(r));
    if (!hasRole) {
      await safeReply(interaction, 'You are not allowed to start the timer for this ticket.');
      return;
    }

    if (data.timer && data.timer.startedAt) {
      await safeReply(interaction, 'A timer is already active for this ticket.');
      return;
    }

    const startedAt = Date.now();
    const expiresAt = startedAt + (12 * 60 * 60 * 1000); // 12 hours
    data.timer = { startedAt, expiresAt, pinged: 0 };
    await ticketConfig.setChannel(channelId, data);

    scheduleTimerForChannel(channelId, interaction.client);

    await safeReply(interaction, '✅ 12‑hour timer started. The ticket opener will be pinged in 6 hours.');
  } catch (err) {
    console.error('handleStartTimer error:', err);
    await safeReply(interaction, 'An error occurred starting the timer.');
  }
}

function scheduleTimerForChannel(channelId, client) {
  // Ensure global timer map exists
  if (!global.ticketTimers) global.ticketTimers = new Map();

  // Clear existing timers for channel
  if (global.ticketTimers.has(channelId)) {
    const t = global.ticketTimers.get(channelId);
    if (t.timeout1) clearTimeout(t.timeout1);
    if (t.timeout2) clearTimeout(t.timeout2);
    global.ticketTimers.delete(channelId);
  }

  // Load persisted data
  ticketConfig.getChannel(channelId).then(data => {
    if (!data || data.closed || !data.timer) return;
    const now = Date.now();
    const startedAt = data.timer.startedAt;
    const expiresAt = data.timer.expiresAt;
    const pingTime = startedAt + (6 * 60 * 60 * 1000);
    const untilPing = Math.max(0, pingTime - now);
    const untilExpire = Math.max(0, expiresAt - now);

    const timeout1 = setTimeout(async () => {
      try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return;
        const openerId = data.openerId;
        await channel.send({ content: `<@${openerId}> ⏰ Reminder: This ticket has been open for 6 hours. Please respond or support will follow up.` }).catch(() => {});
        data.timer.pinged = 1;
        await ticketConfig.setChannel(channelId, data);
      } catch (e) {
        console.error('Error during 6h ping:', e);
      }
    }, untilPing);

    const timeout2 = setTimeout(async () => {
      try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return;
        const openerId = data.openerId;
        await channel.send({ content: `<@${openerId}> ⏰ Final reminder: 12 hours have passed. This ticket will now be closed.` }).catch(() => {});
        // Close the ticket as system
        await closeTicket(channel, client.user.id, 'Auto‑closed after 12 hour timer', client);
      } catch (e) {
        console.error('Error during 12h expire:', e);
      }
    }, untilExpire);

    global.ticketTimers.set(channelId, { timeout1, timeout2 });
  }).catch(() => {});
}

async function initTimers(client) {
  const channels = ticketConfig.getAllChannels();
  for (const [chId, data] of Object.entries(channels)) {
    if (!data) continue;
    if (data.closed) continue;
    if (data.timer && data.timer.startedAt) {
      scheduleTimerForChannel(chId, client);
    }
  }
}

module.exports = {
  handleTicketOpen,
  handleTicketQuestionsSubmit,
  handleClaim,
  handleCloseButton,
  handleCloseModal,
  closeTicket,
  handleStartTimer,
  initTimers,
  isTicketChannel
};