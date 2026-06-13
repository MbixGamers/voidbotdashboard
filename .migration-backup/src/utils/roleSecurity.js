const { EmbedBuilder, PermissionFlagsBits, AuditLogEvent } = require('discord.js');
const securityConfig = require('./securityConfig');
const logManager = require('./logManager');

const DANGEROUS_PERMISSION_WEIGHTS = {
  Administrator: 20,
  ManageGuild: 12,
  ManageRoles: 10,
  ManageChannels: 8,
  BanMembers: 7,
  KickMembers: 6,
  ManageWebhooks: 6,
  ManageMessages: 5,
  ModerateMembers: 4,
  ViewAuditLog: 4,
  ManageEmojisAndStickers: 3,
  ManageNicknames: 2,
  MentionEveryone: 2
};

const recentRoleEvents = new Map();

function getRoleRiskScore(role) {
  let score = 0;
  const dangerous = [];
  for (const permissionName of Object.keys(DANGEROUS_PERMISSION_WEIGHTS)) {
    if (role.permissions.has(PermissionFlagsBits[permissionName])) {
      score += DANGEROUS_PERMISSION_WEIGHTS[permissionName];
      dangerous.push(permissionName);
    }
  }
  return { score, dangerous };
}

function formatPermissionLabels(permissionNames) {
  return permissionNames.map(name => {
    return name.replace(/([A-Z])/g, ' $1').trim();
  });
}

function getMemberLabel(member) {
  if (!member) return 'Unknown member';
  return member.user ? `${member.user.tag} (${member.id})` : `${member.id}`;
}

function getChannelLabel(channel) {
  if (!channel) return 'Unknown channel';
  return channel.name ? `${channel.name} (${channel.id})` : `${channel.id}`;
}

function recordRoleEvent(guildId, executorId, eventType) {
  const key = `${guildId}:${executorId}`;
  let state = recentRoleEvents.get(key);
  if (!state) {
    state = { events: [] };
    recentRoleEvents.set(key, state);
  }
  state.events.push({ type: eventType, timestamp: Date.now() });
  const retention = 15000;
  state.events = state.events.filter(item => Date.now() - item.timestamp < retention);
}

function countRecentRoleEvents(guildId, executorId, eventType) {
  const key = `${guildId}:${executorId}`;
  const state = recentRoleEvents.get(key);
  if (!state) return 0;
  return state.events.filter(item => item.type === eventType).length;
}

async function isTrustedExecutor(guild, executorId, memberRoles = []) {
  if (!guild) return false;
  return securityConfig.isWhitelisted(guild.id, executorId, memberRoles);
}

async function scanGuildRoles(guild) {
  const config = await securityConfig.get(guild.id);
  if (!config.enabled || !config.roleProtection?.enabled) return;

  const overpowered = [];
  for (const role of guild.roles.cache.values()) {
    if (!role || role.managed || role.id === guild.id) continue;
    const { score, dangerous } = getRoleRiskScore(role);
    if (score >= (config.roleProtection.roleRiskScoreThreshold || 12)) {
      overpowered.push({ role, score, dangerous });
    }
  }

  if (!overpowered.length) return;

  overpowered.sort((a, b) => b.score - a.score);
  const lines = overpowered.slice(0, 6).map(item => {
    return `**${item.role.name}** (${item.role.id}) — Score ${item.score}\n${formatPermissionLabels(item.dangerous).join(', ')}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle('⚠️ Overpowered Roles Detected')
    .setDescription(`The server has ${overpowered.length} roles that exceed the configured risk threshold.`)
    .addFields({ name: 'High-risk roles', value: lines.join('\n\n') })
    .setTimestamp();

  await logManager.sendLog(guild, 'role_logs', {
    embed,
    timestamp: true
  });
}

async function initRoleScanner(client) {
  const intervalMinutes = 5;
  const initialDelay = 10000;

  setTimeout(async () => {
    for (const guild of client.guilds.cache.values()) {
      await scanGuildRoles(guild).catch(console.error);
    }
  }, initialDelay);

  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      await scanGuildRoles(guild).catch(console.error);
    }
  }, Math.max(60000, intervalMinutes * 60 * 1000));
}

async function handleRoleCreate(role) {
  const config = await securityConfig.get(role.guild.id);
  if (!config.enabled || !config.roleProtection?.enabled) return;

  const { score, dangerous } = getRoleRiskScore(role);
  if (dangerous.length === 0) return;

  const auditLog = await role.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleCreate }).catch(() => null);
  const executor = auditLog?.entries.first()?.executor;
  const executorLabel = executor ? `${executor.tag} (${executor.id})` : 'Unknown';

  const embed = new EmbedBuilder()
    .setColor(0xff8800)
    .setTitle('⚠️ Dangerous Role Created')
    .setDescription(`**Role:** ${role.name} (${role.id})\n**Creator:** ${executorLabel}`)
    .addFields(
      { name: 'Risk Score', value: String(score), inline: true },
      { name: 'Permissions', value: formatPermissionLabels(dangerous).join(', '), inline: false },
      { name: 'Hoist', value: role.hoist ? 'Yes' : 'No', inline: true },
      { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true }
    )
    .setTimestamp();

  await logManager.sendLog(role.guild, 'role_logs', { embed, timestamp: true });

  if (executor && !await isTrustedExecutor(role.guild, executor.id, [])) {
    const alertEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('🚨 Untrusted Role Creation')
      .setDescription(`A high-risk role was created by ${executorLabel}.`) 
      .addFields({ name: 'Role', value: `${role.name} (${role.id})`, inline: true })
      .setTimestamp();

    await logManager.sendLog(role.guild, 'security', { embed: alertEmbed, timestamp: true });
  }
}

async function handleRoleUpdate(oldRole, newRole) {
  const config = await securityConfig.get(newRole.guild.id);
  if (!config.enabled || !config.roleProtection?.enabled) return;

  const auditLog = await newRole.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleUpdate }).catch(() => null);
  const entry = auditLog?.entries.first();
  const executor = entry?.executor;
  const executorId = executor?.id;
  if (executorId) {
    recordRoleEvent(newRole.guild.id, executorId, 'role_update');
  }

  const addedPermissions = [];
  const removedPermissions = [];
  for (const permName of Object.keys(DANGEROUS_PERMISSION_WEIGHTS)) {
    const had = oldRole.permissions.has(PermissionFlagsBits[permName]);
    const has = newRole.permissions.has(PermissionFlagsBits[permName]);
    if (!had && has) addedPermissions.push(permName);
    if (had && !has) removedPermissions.push(permName);
  }

  const changedHoist = oldRole.hoist !== newRole.hoist;
  const positionDelta = Math.abs(newRole.position - oldRole.position);
  const isSuspiciousPosition = positionDelta >= (config.roleProtection.positionJumpThreshold || 5);
  const recentCount = executorId ? countRecentRoleEvents(newRole.guild.id, executorId, 'role_update') : 0;

  if (!addedPermissions.length && !changedHoist && !isSuspiciousPosition && recentCount < (config.roleProtection.maxRapidRoleChanges || 4)) return;

  const fields = [];
  if (addedPermissions.length) {
    fields.push({ name: 'Escalated Permissions', value: formatPermissionLabels(addedPermissions).join(', '), inline: false });
  }
  if (removedPermissions.length) {
    fields.push({ name: 'Removed Permissions', value: formatPermissionLabels(removedPermissions).join(', '), inline: false });
  }
  if (changedHoist) {
    fields.push({ name: 'Hoist', value: `${oldRole.hoist ? 'Yes' : 'No'} → ${newRole.hoist ? 'Yes' : 'No'}` });
  }
  if (isSuspiciousPosition) {
    fields.push({ name: 'Position Change', value: `${oldRole.position} → ${newRole.position}` });
  }
  if (recentCount >= (config.roleProtection.maxRapidRoleChanges || 4)) {
    fields.push({ name: 'Rapid role edits', value: `${recentCount} edits in the recent window`, inline: true });
  }

  const embed = new EmbedBuilder()
    .setColor(addedPermissions.length ? 0xff4400 : 0xffa500)
    .setTitle(addedPermissions.length ? '⚠️ Role Permission Escalation Detected' : '⚠️ Suspicious Role Update Detected')
    .setDescription(`**Role:** ${newRole.name} (${newRole.id})${executor ? `\n**Executor:** ${executor.tag} (${executor.id})` : ''}`)
    .addFields(fields)
    .setTimestamp();

  await logManager.sendLog(newRole.guild, 'role_logs', { embed, timestamp: true });
  if (addedPermissions.length || recentCount >= (config.roleProtection.maxRapidRoleChanges || 4)) {
    await logManager.sendLog(newRole.guild, 'security', { embed, timestamp: true });
  }
}

async function handleRoleDelete(role) {
  const config = await securityConfig.get(role.guild.id);
  if (!config.enabled || !config.roleProtection?.enabled) return;

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle('⚠️ Role Deleted')
    .setDescription(`**Role:** ${role.name} (${role.id})\n**Hoist:** ${role.hoist ? 'Yes' : 'No'}\n**Mentionable:** ${role.mentionable ? 'Yes' : 'No'}`)
    .setTimestamp();

  await logManager.sendLog(role.guild, 'role_logs', { embed, timestamp: true });
}

module.exports = {
  initRoleScanner,
  scanGuildRoles,
  handleRoleCreate,
  handleRoleUpdate,
  handleRoleDelete
};
