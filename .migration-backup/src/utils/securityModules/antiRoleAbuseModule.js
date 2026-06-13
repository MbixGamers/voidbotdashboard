const { Events, PermissionFlagsBits, EmbedBuilder, AuditLogEvent } = require('discord.js');

const recentRoleEvents = new Map();

function recordEvent(guildId, executorId, type) {
  const key = `${guildId}:${executorId}`;
  const now = Date.now();
  let state = recentRoleEvents.get(key);
  if (!state) {
    state = [];
    recentRoleEvents.set(key, state);
  }
  state.push({ type, timestamp: now });
  const windowMs = 15000;
  recentRoleEvents.set(key, state.filter(item => now - item.timestamp < windowMs));
}

function countEvents(guildId, executorId, type) {
  const key = `${guildId}:${executorId}`;
  const state = recentRoleEvents.get(key) || [];
  return state.filter(item => item.type === type).length;
}

function getPermissionEscalation(oldRole, newRole) {
  const escalated = [];
  for (const permissionName of Object.keys(PermissionFlagsBits)) {
    if (!oldRole.permissions.has(PermissionFlagsBits[permissionName]) && newRole.permissions.has(PermissionFlagsBits[permissionName])) {
      escalated.push(permissionName);
    }
  }
  return escalated;
}

async function handleRoleCreate(role, context) {
  const guildConfig = await context.config.get(role.guild.id);
  if (!guildConfig.modules?.antiRoleAbuse) return;

  const auditLog = await role.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleCreate }).catch(() => null);
  const executor = auditLog?.entries.first()?.executor;
  if (!executor) return;

  recordEvent(role.guild.id, executor.id, 'create');
  const count = countEvents(role.guild.id, executor.id, 'create');
  const threshold = guildConfig.thresholds?.roleSpamThreshold || 3;

  if (count >= threshold) {
    await context.logger.log(role.guild, 'security', {
      title: '🚨 Mass Role Creation Detected',
      description: `**Executor:** ${executor.tag} (${executor.id})\n**Count:** ${count} role creates in a short period`,
      color: 0xff0000,
      timestamp: true
    });
  }
}

async function handleRoleDelete(role, context) {
  const guildConfig = await context.config.get(role.guild.id);
  if (!guildConfig.modules?.antiRoleAbuse) return;

  const auditLog = await role.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleDelete }).catch(() => null);
  const executor = auditLog?.entries.first()?.executor;
  if (!executor) return;

  recordEvent(role.guild.id, executor.id, 'delete');
  const count = countEvents(role.guild.id, executor.id, 'delete');
  const threshold = guildConfig.thresholds?.roleSpamThreshold || 3;

  if (count >= threshold) {
    await context.logger.log(role.guild, 'security', {
      title: '🚨 Mass Role Deletion Detected',
      description: `**Executor:** ${executor.tag} (${executor.id})\n**Count:** ${count} role deletions in a short period`,
      color: 0xff0000,
      timestamp: true
    });
  }
}

async function handleRoleUpdate(oldRole, newRole, context) {
  const guildConfig = await context.config.get(newRole.guild.id);
  if (!guildConfig.modules?.antiRoleAbuse) return;

  const auditLog = await newRole.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleUpdate }).catch(() => null);
  const executor = auditLog?.entries.first()?.executor;
  if (!executor) return;

  recordEvent(newRole.guild.id, executor.id, 'update');
  const count = countEvents(newRole.guild.id, executor.id, 'update');
  const threshold = guildConfig.thresholds?.roleSpamThreshold || 4;
  const escalation = getPermissionEscalation(oldRole, newRole);
  const hoistAbuse = oldRole.hoist !== newRole.hoist;
  const positionJump = Math.abs(newRole.position - oldRole.position);
  const positionThreshold = guildConfig.roleProtection?.positionJumpThreshold || 5;

  if (count >= threshold || escalation.length || hoistAbuse || positionJump >= positionThreshold) {
    const fields = [];
    if (escalation.length) fields.push({ name: 'Permission Escalation', value: escalation.join(', '), inline: false });
    if (hoistAbuse) fields.push({ name: 'Hoist Changed', value: `${oldRole.hoist ? 'Yes' : 'No'} → ${newRole.hoist ? 'Yes' : 'No'}` });
    if (positionJump >= positionThreshold) fields.push({ name: 'Position Jump', value: `${oldRole.position} → ${newRole.position}` });
    if (count >= threshold) fields.push({ name: 'Rapid Updates', value: `${count} edits in the recent window` });

    await context.logger.log(newRole.guild, 'security', {
      title: '⚠️ Anti-Role Abuse Alert',
      description: `**Executor:** ${executor.tag} (${executor.id})\n**Role:** ${newRole.name} (${newRole.id})`,
      fields,
      color: 0xff4400,
      timestamp: true
    });
  }
}

async function scan(guild) {
  return {
    status: 'ready',
    note: 'Anti-role-abuse module is active and watching role create/delete/update events.'
  };
}

async function init(context) {
  const { client } = context;

  client.on(Events.RoleCreate, async (role) => handleRoleCreate(role, context).catch(() => {}));
  client.on(Events.RoleDelete, async (role) => handleRoleDelete(role, context).catch(() => {}));
  client.on(Events.RoleUpdate, async (oldRole, newRole) => handleRoleUpdate(oldRole, newRole, context).catch(() => {}));
}

module.exports = {
  name: 'antiRoleAbuse',
  init,
  scan
};
