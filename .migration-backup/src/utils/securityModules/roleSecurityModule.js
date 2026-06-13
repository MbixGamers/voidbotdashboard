const { Events, PermissionFlagsBits, EmbedBuilder, AuditLogEvent } = require('discord.js');

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

function getRoleRisk(role) {
  const dangerous = [];
  let score = 0;

  for (const permissionName of Object.keys(DANGEROUS_PERMISSION_WEIGHTS)) {
    if (role.permissions.has(PermissionFlagsBits[permissionName])) {
      score += DANGEROUS_PERMISSION_WEIGHTS[permissionName];
      dangerous.push(permissionName);
    }
  }

  return { score, dangerous };
}

function formatPermissionNames(permissionNames) {
  return permissionNames.map(name => name.replace(/([A-Z])/g, ' $1').trim());
}

function buildRiskFields(role, score, dangerous) {
  const fields = [
    { name: 'Risk Score', value: String(score), inline: true },
    { name: 'Hoist', value: role.hoist ? 'Yes' : 'No', inline: true },
    { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true }
  ];

  if (dangerous.length) {
    fields.push({ name: 'Dangerous Permissions', value: formatPermissionNames(dangerous).join(', '), inline: false });
  }

  return fields;
}

async function scan(guild, context) {
  const guildConfig = await context.config.get(guild.id);
  if (!guildConfig.modules?.roleSecurity) return { enabled: false };

  const overpowered = [];
  for (const role of guild.roles.cache.values()) {
    if (!role || role.managed || role.id === guild.id) continue;
    const { score, dangerous } = getRoleRisk(role);
    if (score >= (guildConfig.thresholds?.roleRiskScoreThreshold || 12)) {
      overpowered.push({ role, score, dangerous });
    }
  }

  overpowered.sort((a, b) => b.score - a.score);
  const summary = overpowered.slice(0, 6).map(item => ({ role: item.role.name, id: item.role.id, score: item.score, permissions: formatPermissionNames(item.dangerous) }));

  if (summary.length > 0) {
    await context.logger.log(guild, 'role_logs', {
      title: '⚠️ Role Scan Detected Overpowered Roles',
      description: `Detected ${summary.length} overpowered roles during scheduled scan.`,
      fields: summary.map(item => ({ name: `${item.role} (${item.id})`, value: `Score ${item.score} — ${item.permissions.join(', ')}`, inline: false })),
      color: 0xff0000,
      timestamp: true
    });
  }

  return { overpowered: summary };
}

async function handleRoleCreate(role, context) {
  const guildConfig = await context.config.get(role.guild.id);
  if (!guildConfig.modules?.roleSecurity) return;

  const { score, dangerous } = getRoleRisk(role);
  if (!dangerous.length) return;

  const auditLog = await role.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleCreate }).catch(() => null);
  const executor = auditLog?.entries.first()?.executor;

  await context.logger.log(role.guild, 'role_logs', {
    title: '⚠️ Dangerous Role Created',
    description: `**Role:** ${role.name} (${role.id})${executor ? `\n**Created by:** ${executor.tag} (${executor.id})` : ''}`,
    fields: buildRiskFields(role, score, dangerous),
    color: 0xff8800,
    timestamp: true
  });

  if (executor && !guildConfig.whitelist?.users?.includes(executor.id)) {
    await context.logger.log(role.guild, 'security', {
      title: '🚨 Untrusted Role Creation',
      description: `A role with dangerous permissions was created by ${executor.tag} (${executor.id}).`,
      color: 0xff0000,
      timestamp: true
    });
  }
}

async function handleRoleUpdate(oldRole, newRole, context) {
  const guildConfig = await context.config.get(newRole.guild.id);
  if (!guildConfig.modules?.roleSecurity) return;

  const oldRisk = getRoleRisk(oldRole);
  const newRisk = getRoleRisk(newRole);
  const addedPermissions = newRisk.dangerous.filter(name => !oldRisk.dangerous.includes(name));
  const removedPermissions = oldRisk.dangerous.filter(name => !newRisk.dangerous.includes(name));

  if (!addedPermissions.length && !removedPermissions.length && oldRole.position === newRole.position && oldRole.hoist === newRole.hoist) return;

  const auditLog = await newRole.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleUpdate }).catch(() => null);
  const executor = auditLog?.entries.first()?.executor;

  const fields = [];
  if (addedPermissions.length) fields.push({ name: 'Added Dangerous Permissions', value: formatPermissionNames(addedPermissions).join(', '), inline: false });
  if (removedPermissions.length) fields.push({ name: 'Removed Dangerous Permissions', value: formatPermissionNames(removedPermissions).join(', '), inline: false });
  if (oldRole.hoist !== newRole.hoist) fields.push({ name: 'Hoist', value: `${oldRole.hoist ? 'Yes' : 'No'} → ${newRole.hoist ? 'Yes' : 'No'}` });
  if (oldRole.position !== newRole.position) fields.push({ name: 'Position', value: `${oldRole.position} → ${newRole.position}` });

  await context.logger.log(newRole.guild, 'role_logs', {
    title: '⚠️ Role Updated',
    description: `**Role:** ${newRole.name} (${newRole.id})${executor ? `\n**Executor:** ${executor.tag} (${executor.id})` : ''}`,
    fields,
    color: addedPermissions.length ? 0xff4400 : 0x00b0f4,
    timestamp: true
  });
}

async function handleRoleDelete(role, context) {
  const guildConfig = await context.config.get(role.guild.id);
  if (!guildConfig.modules?.roleSecurity) return;

  await context.logger.log(role.guild, 'role_logs', {
    title: '⚠️ Role Deleted',
    description: `**Role:** ${role.name} (${role.id})`,
    fields: [
      { name: 'Hoist', value: role.hoist ? 'Yes' : 'No', inline: true },
      { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true }
    ],
    color: 0xff0000,
    timestamp: true
  });
}

async function init(context) {
  const { client } = context;
  client.on(Events.RoleCreate, async (role) => handleRoleCreate(role, context).catch(() => {}));
  client.on(Events.RoleUpdate, async (oldRole, newRole) => handleRoleUpdate(oldRole, newRole, context).catch(() => {}));
  client.on(Events.RoleDelete, async (role) => handleRoleDelete(role, context).catch(() => {}));
}

module.exports = {
  name: 'roleSecurity',
  init,
  scan,
  handleRoleCreate,
  handleRoleUpdate,
  handleRoleDelete
};
