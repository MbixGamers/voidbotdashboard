// src/commands/config.js
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config');
const guildConfig = require('../utils/guildConfig');

function isOwner(userId) {
  return userId === config.ownerId;
}

async function hasAdminAccess(member) {
  if (isOwner(member.id)) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  const guildConf = await guildConfig.get(member.guild.id);
  if (guildConf.adminRoleId && member.roles.cache.has(guildConf.adminRoleId)) return true;

  return false;
}

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
    console.error('safeReply error in config:', error);
    return false;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure per‑server settings (admin only)')
    .setDMPermission(false)
    .addSubcommand(sub =>
      sub
        .setName('adminrole')
        .setDescription('Set the role that can use admin commands (e.g. /modcheck)')
        .addRoleOption(opt => opt.setName('role').setDescription('The admin role').setRequired(true)))
    .addSubcommand(sub =>
      sub
        .setName('trackedroles')
        .setDescription('Manage tracked staff roles (for mod stats)')
        .addStringOption(opt =>
          opt.setName('action')
            .setDescription('Action to perform')
            .setRequired(true)
            .addChoices(
              { name: 'add', value: 'add' },
              { name: 'remove', value: 'remove' },
              { name: 'list', value: 'list' }
            ))
        .addRoleOption(opt => opt.setName('role').setDescription('Role to add/remove').setRequired(false)))
    .addSubcommand(sub =>
      sub
        .setName('blacklist')
        .setDescription('Configure blacklist settings')
        .addStringOption(opt =>
          opt.setName('action')
            .setDescription('Action to perform')
            .setRequired(true)
            .addChoices(
              { name: 'set approver role', value: 'approver' },
              { name: 'set blacklist role', value: 'role' },
              { name: 'set channel', value: 'channel' },
              { name: 'status', value: 'status' }
            ))
        .addRoleOption(opt => opt.setName('role').setDescription('Role to assign').setRequired(false))
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel for blacklist panels').setRequired(false)))
    .addSubcommand(sub =>
      sub
        .setName('gatekeeper')
        .setDescription('Configure the gatekeeper (auto‑reply to join questions)')
        .addStringOption(opt =>
          opt.setName('action')
            .setDescription('Action to perform')
            .setRequired(true)
            .addChoices(
              { name: 'set', value: 'set' },
              { name: 'toggle', value: 'toggle' },
              { name: 'status', value: 'status' },
              { name: 'setmessage', value: 'setmessage' }
            ))
        .addChannelOption(opt => opt.setName('target').setDescription('Channel where gatekeeper listens').setRequired(false))
        .addChannelOption(opt => opt.setName('info').setDescription('Info channel to mention').setRequired(false))
        .addChannelOption(opt => opt.setName('apply').setDescription('Apply channel to mention').setRequired(false))
        .addStringOption(opt => opt.setName('message').setDescription('Custom reply message').setRequired(false))),

  async execute(interaction) {
    if (!(await hasAdminAccess(interaction.member))) {
      return safeReply(interaction, '❌ You do not have permission to use this command.');
    }

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (subcommand === 'adminrole') {
      const role = interaction.options.getRole('role');
      await guildConfig.update(guildId, { adminRoleId: role.id });
      await safeReply(interaction, `✅ Admin role set to ${role}.`);
    }

    else if (subcommand === 'trackedroles') {
      const action = interaction.options.getString('action');
      const role = interaction.options.getRole('role');
      const conf = await guildConfig.get(guildId);
      let tracked = conf.trackedRoles || [];

      if (action === 'add') {
        if (!role) return safeReply(interaction, '❌ You must specify a role to add.');
        if (tracked.includes(role.id)) return safeReply(interaction, '⚠️ That role is already tracked.');
        tracked.push(role.id);
        await guildConfig.update(guildId, { trackedRoles: tracked });
        await safeReply(interaction, `✅ Added ${role} to tracked roles.`);
      }
      else if (action === 'remove') {
        if (!role) return safeReply(interaction, '❌ You must specify a role to remove.');
        const index = tracked.indexOf(role.id);
        if (index === -1) return safeReply(interaction, '⚠️ That role is not tracked.');
        tracked.splice(index, 1);
        await guildConfig.update(guildId, { trackedRoles: tracked });
        await safeReply(interaction, `✅ Removed ${role} from tracked roles.`);
      }
      else if (action === 'list') {
        if (tracked.length === 0) {
          await safeReply(interaction, '📋 No tracked roles configured for this server.');
        } else {
          const roleMentions = tracked.map(id => `<@&${id}>`).join(', ');
          await safeReply(interaction, `📋 Tracked roles: ${roleMentions}`);
        }
      }
    }

    else if (subcommand === 'blacklist') {
      const action = interaction.options.getString('action');
      const role = interaction.options.getRole('role');
      const conf = await guildConfig.get(guildId);

      if (action === 'approver') {
        if (!role) return safeReply(interaction, '❌ You must specify a role to use as the blacklist approver.');
        await guildConfig.update(guildId, { blacklistApproverRoleId: role.id });
        await safeReply(interaction, `✅ Blacklist approver role set to ${role}.`);
      }
      else if (action === 'role') {
        if (!role) return safeReply(interaction, '❌ You must specify the blacklist role.');
        await guildConfig.update(guildId, { blacklistRoleId: role.id });
        await safeReply(interaction, `✅ Blacklist role set to ${role}.`);
      }
      else if (action === 'status') {
        const approverRole = conf.blacklistApproverRoleId ? `<@&${conf.blacklistApproverRoleId}>` : 'Not set';
        const blacklistRole = conf.blacklistRoleId ? `<@&${conf.blacklistRoleId}>` : 'Not set';
        const count = (conf.blacklistEntries || []).length;
        await safeReply(interaction, `**Blacklist config**\nApprover role: ${approverRole}\nBlacklist role: ${blacklistRole}\nStored blacklist entries: ${count}`);
      }
    }

    else if (subcommand === 'gatekeeper') {
      const action = interaction.options.getString('action');
      const target = interaction.options.getChannel('target');
      const info = interaction.options.getChannel('info');
      const apply = interaction.options.getChannel('apply');
      const customMessage = interaction.options.getString('message');
      const conf = await guildConfig.get(guildId);
      let gatekeeper = conf.gatekeeper || { enabled: false, targetChannelId: null, infoChannelId: null, applyChannelId: null, customMessage: null };

      if (action === 'set') {
        if (!target || !info || !apply) {
          return safeReply(interaction, '❌ You must provide target, info, and apply channels.');
        }
        gatekeeper.targetChannelId = target.id;
        gatekeeper.infoChannelId = info.id;
        gatekeeper.applyChannelId = apply.id;
        await guildConfig.update(guildId, { gatekeeper });
        await safeReply(interaction, `✅ Gatekeeper channels set.\nTarget: ${target}\nInfo: ${info}\nApply: ${apply}`);
      }
      else if (action === 'setmessage') {
        if (!customMessage) {
          return safeReply(interaction, '❌ You must provide a custom message.');
        }
        gatekeeper.customMessage = customMessage;
        await guildConfig.update(guildId, { gatekeeper });
        await safeReply(interaction, '✅ Custom gatekeeper message set.');
      }
      else if (action === 'toggle') {
        gatekeeper.enabled = !gatekeeper.enabled;
        await guildConfig.update(guildId, { gatekeeper });
        await safeReply(interaction, `✅ Gatekeeper is now **${gatekeeper.enabled ? 'enabled' : 'disabled'}**.`);
      }
      else if (action === 'status') {
        const status = gatekeeper.enabled ? '✅ Enabled' : '❌ Disabled';
        const targetCh = gatekeeper.targetChannelId ? `<#${gatekeeper.targetChannelId}>` : 'Not set';
        const infoCh = gatekeeper.infoChannelId ? `<#${gatekeeper.infoChannelId}>` : 'Not set';
        const applyCh = gatekeeper.applyChannelId ? `<#${gatekeeper.applyChannelId}>` : 'Not set';
        const msg = gatekeeper.customMessage || 'Default message (using channel mentions)';
        await safeReply(interaction, `**Gatekeeper Status**\n${status}\nTarget: ${targetCh}\nInfo: ${infoCh}\nApply: ${applyCh}\nCustom Message: ${msg}`);
      }
    }
  }
};