const { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const guildConfig = require('../utils/guildConfig');
const config = require('../config');

const pendingRequests = new Map();

function createBlacklistEmbed({ targetId, requester, reason, status, approverId, approvedAt }) {
  const embed = new EmbedBuilder()
    .setTitle(status === 'Approved' ? '✅ Blacklist Approved' : status === 'Rejected' ? '❌ Blacklist Rejected' : '🛑 Blacklist Request')
    .setColor(status === 'Approved' ? 0xFF0000 : status === 'Rejected' ? 0x808080 : 0xFFA500)
    .addFields(
      { name: 'User ID', value: targetId, inline: true },
      { name: 'Requested by', value: `${requester}`, inline: true },
      { name: 'Status', value: status, inline: true }
    )
    .setTimestamp();

  if (reason) {
    embed.addFields({ name: 'Reason', value: reason, inline: false });
  }
  if (approverId) {
    embed.addFields({ name: 'Approved by', value: `<@${approverId}>`, inline: true });
  }
  if (approvedAt) {
    embed.addFields({ name: 'Approved at', value: `<t:${Math.floor(approvedAt / 1000)}:F>`, inline: true });
  }

  return embed;
}

function createActionRow(requestId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`blacklist_approve_${requestId}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`blacklist_reject_${requestId}`)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}

function isValidSnowflake(id) {
  return /^\d{17,19}$/.test(id);
}

async function execute(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('blacklist_request_modal')
    .setTitle('Create Blacklist Request');

  const userInput = new TextInputBuilder()
    .setCustomId('user_id')
    .setLabel('User ID')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('123456789012345678')
    .setRequired(true);

  const reasonInput = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Reason for blacklist')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Describe why this user should be blacklisted.')
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(userInput));
  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));

  await interaction.showModal(modal);
}

async function handleModalSubmit(interaction) {
  const userId = interaction.fields.getTextInputValue('user_id').trim();
  const reason = interaction.fields.getTextInputValue('reason').trim();

  if (!isValidSnowflake(userId)) {
    await interaction.reply({ content: '❌ Invalid User ID format. Please provide a valid Discord ID.', ephemeral: true });
    return;
  }

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const guildId = interaction.guildId;
  const requester = `<@${interaction.user.id}>`;
  const guildConf = await guildConfig.get(guildId);
  const targetChannelId = guildConf.blacklistChannelId || config.blacklistChannelId;

  const embed = createBlacklistEmbed({
    targetId: userId,
    requester,
    reason,
    status: 'Pending approval'
  });

  const row = createActionRow(requestId);
  const panelMessage = await (async () => {
    if (!targetChannelId) return null;
    const channel = await interaction.guild.channels.fetch(targetChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return null;
    return channel.send({
      content: `📌 New blacklist request submitted. Waiting for approval from an approver role.`,
      embeds: [embed],
      components: [row]
    }).catch(() => null);
  })();

  if (panelMessage) {
    await interaction.reply({ content: `📌 Blacklist request submitted to <#${panelMessage.channel.id}>.`, ephemeral: true });
  } else {
    const message = await interaction.reply({
      content: `📌 Blacklist request submitted. Waiting for approval from an approver role.`,
      embeds: [embed],
      components: [row],
      fetchReply: true
    });
    pendingRequests.set(requestId, {
      guildId,
      requesterId: interaction.user.id,
      targetId: userId,
      reason,
      status: 'Pending',
      messageId: message.id,
      channelId: interaction.channelId
    });
    return;
  }

  pendingRequests.set(requestId, {
    guildId,
    requesterId: interaction.user.id,
    targetId: userId,
    reason,
    status: 'Pending',
    messageId: panelMessage.id,
    channelId: panelMessage.channel.id
  });
}

async function handleButton(interaction) {
  const customId = interaction.customId;
  const [prefix, action, requestId] = customId.split('_');
  if (prefix !== 'blacklist' || !['approve', 'reject'].includes(action)) return;

  const request = pendingRequests.get(requestId);
  if (!request) {
    await interaction.reply({ content: '❌ This blacklist request is no longer active.', ephemeral: true });
    return;
  }

  if (request.guildId !== interaction.guildId) {
    await interaction.reply({ content: '❌ Invalid request target.', ephemeral: true });
    return;
  }

  const guildConf = await guildConfig.get(interaction.guildId);
  const approverRoleId = guildConf.blacklistApproverRoleId || config.blacklistApproverRoleId;
  const isApprover = approverRoleId ? interaction.member.roles.cache.has(approverRoleId) : interaction.member.permissions.has(PermissionFlagsBits.ManageRoles);

  if (!isApprover) {
    await interaction.reply({ content: '❌ You do not have permission to approve or reject blacklist requests.', ephemeral: true });
    return;
  }

  if (request.status !== 'Pending') {
    await interaction.reply({ content: '❌ This blacklist request has already been processed.', ephemeral: true });
    return;
  }

  const approverId = interaction.user.id;
  const approvedAt = Date.now();
  request.status = action === 'approve' ? 'Approved' : 'Rejected';
  request.approverId = approverId;
  request.approvedAt = approvedAt;

  const embed = createBlacklistEmbed({
    targetId: request.targetId,
    requester: `<@${request.requesterId}>`,
    reason: request.reason,
    status: request.status,
    approverId,
    approvedAt
  });

  const row = createActionRow(requestId, true);

  if (action === 'approve') {
    const blacklistRoleId = guildConf.blacklistRoleId || config.blacklistRoleId;
    let assigned = false;

    if (!blacklistRoleId) {
      await interaction.reply({ content: '⚠️ Blacklist role is not configured. Please use /config blacklist role to set it first, or set BLACKLIST_ROLE_ID in .env.', ephemeral: true });
      return;
    }

    const member = await interaction.guild.members.fetch(request.targetId).catch(() => null);
    if (member) {
      try {
        await member.roles.add(blacklistRoleId, `Blacklisted by ${interaction.user.tag}`);
        assigned = true;
      } catch (err) {
        console.error('Failed to assign blacklist role:', err);
      }
    }

    const entry = {
      userId: request.targetId,
      reason: request.reason,
      approvedBy: approverId,
      approvedAt,
      assigned: assigned,
      assignedRoleId: blacklistRoleId
    };

    const current = await guildConfig.get(interaction.guildId);
    const blacklistEntries = current.blacklistEntries || [];
    const existing = blacklistEntries.find(e => e.userId === request.targetId);
    if (existing) {
      Object.assign(existing, entry);
    } else {
      blacklistEntries.push(entry);
    }
    await guildConfig.update(interaction.guildId, { blacklistEntries });
  }

  await interaction.update({ embeds: [embed], components: [row] });
}

async function handleGuildMemberAdd(member) {
  const conf = await guildConfig.get(member.guild.id);
  const blacklistRoleId = conf.blacklistRoleId || config.blacklistRoleId;
  if (!blacklistRoleId) return;

  const blacklistEntries = conf.blacklistEntries || [];
  const entry = blacklistEntries.find(e => e.userId === member.id);
  if (!entry) return;

  if (!member.roles.cache.has(blacklistRoleId)) {
    await member.roles.add(blacklistRoleId, 'Restored blacklist role for returning member').catch(() => {});
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Request a user to be blacklisted')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),
  execute,
  handleModalSubmit,
  handleButton,
  handleGuildMemberAdd
};
