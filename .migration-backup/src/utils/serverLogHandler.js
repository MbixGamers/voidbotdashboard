const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const logManager = require('./logManager');

const DANGEROUS_PERMISSION_LABELS = {
  Administrator: 'Administrator',
  ManageGuild: 'Manage Server',
  ManageRoles: 'Manage Roles',
  ManageChannels: 'Manage Channels',
  KickMembers: 'Kick Members',
  BanMembers: 'Ban Members',
  ManageMessages: 'Manage Messages',
  ManageWebhooks: 'Manage Webhooks',
  ManageEmojisAndStickers: 'Manage Emojis & Stickers',
  ViewAuditLog: 'View Audit Log',
  ModerateMembers: 'Moderate Members',
  ManageNicknames: 'Manage Nicknames',
  MentionEveryone: 'Mention @everyone',
  ViewGuildInsights: 'View Insights'
};

function getMemberLabel(member) {
  if (!member) return 'Unknown member';
  return member.user ? `${member.user.tag} (${member.id})` : `${member.id}`;
}

function getUserLabel(user) {
  if (!user) return 'Unknown user';
  return `${user.tag} (${user.id})`;
}

function getChannelLabel(channel) {
  if (!channel) return 'Unknown channel';
  return `${channel.name} (${channel.id})`;
}

function truncateText(text, max = 1000) {
  if (text === undefined || text === null) return '[empty]';
  const string = String(text);
  return string.length > max ? `${string.slice(0, max - 3)}...` : string;
}

function formatTimestamp(timestamp, style = 'F') {
  return timestamp ? `<t:${Math.floor(timestamp / 1000)}:${style}>` : 'Unknown';
}

function formatDuration(ms) {
  if (!ms || ms < 0) return 'Unknown';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const parts = [];
  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (hours % 24) parts.push(`${hours % 24} hour${hours % 24 === 1 ? '' : 's'}`);
  if (minutes % 60) parts.push(`${minutes % 60} minute${minutes % 60 === 1 ? '' : 's'}`);
  if (seconds % 60 && parts.length < 3) parts.push(`${seconds % 60} second${seconds % 60 === 1 ? '' : 's'}`);

  return parts.slice(0, 3).join(', ') || '0 seconds';
}

function formatDangerousPermissions(permissions) {
  if (!permissions) return [];
  return permissions.toArray().filter(name => DANGEROUS_PERMISSION_LABELS[name]).map(name => DANGEROUS_PERMISSION_LABELS[name]);
}

function hasDangerousPermissions(permissions) {
  return formatDangerousPermissions(permissions).length > 0;
}

function getDangerousPermissionChanges(oldPermissions, newPermissions) {
  const oldList = formatDangerousPermissions(oldPermissions);
  const newList = formatDangerousPermissions(newPermissions);
  const added = newList.filter(item => !oldList.includes(item));
  const removed = oldList.filter(item => !newList.includes(item));
  return { added, removed };
}

function formatChannelDescription(channel) {
  const category = channel.parent ? channel.parent.name : 'None';
  const type = channel.type ? channel.type.replace('Guild', '') : 'Unknown';
  return `**Name:** ${channel.name}\n**Type:** ${type}\n**Category:** ${category}\n**ID:** ${channel.id}`;
}

function formatOverwriteTarget(overwrite, guild) {
  if (overwrite.type === 'role') {
    if (overwrite.id === guild.id) return '@everyone';
    return guild.roles.cache.get(overwrite.id)?.toString() || `Role (${overwrite.id})`;
  }
  return guild.members.cache.get(overwrite.id)?.toString() || `Member (${overwrite.id})`;
}

function formatOverwritePermissions(overwrite) {
  const permissionRows = [
    { bit: PermissionFlagsBits.ViewChannel, label: 'View channel' },
    { bit: PermissionFlagsBits.ReadMessageHistory, label: 'Read message history' },
    { bit: PermissionFlagsBits.SendMessages, label: 'Send messages' },
    { bit: PermissionFlagsBits.EmbedLinks, label: 'Embed links' },
    { bit: PermissionFlagsBits.AttachFiles, label: 'Attach files' },
    { bit: PermissionFlagsBits.UseExternalEmojis, label: 'Use external emojis' }
  ];

  return permissionRows.map(({ bit, label }) => {
    const allow = overwrite.allow.has(bit);
    const deny = overwrite.deny.has(bit);
    const icon = allow ? '✅' : deny ? '❌' : '➖';
    return `${label}: ${icon}`;
  }).join('\n');
}

function buildOverwriteFields(channel) {
  const rows = channel.permissionOverwrites.cache.map(overwrite => ({
    name: `${overwrite.type === 'role' ? 'Role override' : 'Member override'} for ${formatOverwriteTarget(overwrite, channel.guild)}`,
    value: formatOverwritePermissions(overwrite)
  }));
  return rows.length ? rows : [{ name: 'Permission Overwrites', value: 'None' }];
}

async function handleMessageDelete(message) {
  const channel = message.channel;
  if (!channel?.guild) return;
  if (message.author?.bot) return;

  const content = message.partial ? '[unknown]' : message.content || '[no content]';
  const attachmentCount = message.attachments?.size || 0;
  const description = `**Channel:** ${getChannelLabel(channel)}\n**Message ID:** ${message.id}\n**Author:** ${getUserLabel(message.author)}\n**Content:** ${truncateText(content)}`;
  const fields = [];
  const author = message.author ? { name: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) } : null;

  if (attachmentCount > 0) {
    fields.push({ name: 'Attachments', value: `${attachmentCount} attachment(s)`, inline: true });
  }

  await logManager.sendLog(channel.guild, 'mod_logs', {
    title: attachmentCount > 0 ? '🖼️ Message Deleted (Attachment)' : '🗑️ Message Deleted',
    description,
    fields,
    author,
    color: 0xff0000,
    footer: 'Message deleted',
    timestamp: true
  });
}

async function handleMessageUpdate(oldMessage, newMessage) {
  const channel = newMessage.channel || oldMessage.channel;
  if (!channel?.guild) return;
  if (newMessage.author?.bot) return;

  const oldContent = oldMessage.partial ? '[unknown]' : oldMessage.content || '[no content]';
  const newContent = newMessage.content || '[no content]';
  const oldAttachments = oldMessage.attachments?.size || 0;
  const newAttachments = newMessage.attachments?.size || 0;

  if (oldContent === newContent && oldAttachments === newAttachments) return;

  const fields = [
    { name: 'Before', value: truncateText(oldContent) },
    { name: 'After', value: truncateText(newContent) }
  ];
  const author = newMessage.author ? { name: newMessage.author.tag, iconURL: newMessage.author.displayAvatarURL({ dynamic: true }) } : null;

  if (oldAttachments !== newAttachments) {
    fields.push({ name: 'Attachments', value: `${oldAttachments} → ${newAttachments}`, inline: true });
  }

  await logManager.sendLog(channel.guild, 'mod_logs', {
    title: '✏️ Message Edited',
    description: `**Channel:** ${getChannelLabel(channel)}\n**Message ID:** ${newMessage.id}\n**Author:** ${getUserLabel(newMessage.author)}`,
    fields,
    author,
    color: 0xffa500,
    footer: 'Message edited',
    timestamp: true
  });
}

async function handleBulkMessageDelete(messages) {
  const first = messages.first();
  const channel = first?.channel;
  if (!channel?.guild) return;

  await logManager.sendLog(channel.guild, 'mod_logs', {
    title: '🗑️ Bulk Message Delete Detected',
    description: `**Channel:** ${getChannelLabel(channel)}\n**Deleted Messages:** ${messages.size}`,
    color: 0xff0000,
    footer: 'Bulk delete',
    timestamp: true
  });
}

async function handleInviteCreate(invite) {
  const guild = invite.guild;
  if (!guild) return;

  const expiresAt = invite.expiresAt ? formatTimestamp(invite.expiresAt.getTime(), 'F') : 'Never';
  const description = `**Invite Code:** ${invite.code}\n**Channel:** ${getChannelLabel(invite.channel)}\n**Created By:** ${invite.inviter ? getUserLabel(invite.inviter) : 'Unknown'}\n**Max Uses:** ${invite.maxUses || 'Unlimited'}\n**Temporary:** ${invite.temporary ? 'Yes' : 'No'}\n**Expires:** ${expiresAt}${invite.url ? `\n**URL:** ${invite.url}` : ''}`;

  await logManager.sendLog(guild, 'mod_logs', {
    title: '🔗 Invite Created',
    description,
    color: 0x00b0f4,
    footer: 'Invite created',
    timestamp: true
  });
}

async function handleInviteDelete(invite) {
  const guild = invite.guild;
  if (!guild) return;

  const description = `**Invite Code:** ${invite.code}\n**Channel:** ${getChannelLabel(invite.channel)}${invite.inviter ? `\n**Created By:** ${getUserLabel(invite.inviter)}` : ''}`;

  await logManager.sendLog(guild, 'mod_logs', {
    title: '❌ Invite Deleted',
    description,
    color: 0xff0000,
    footer: 'Invite deleted',
    timestamp: true
  });
}

async function handleGuildMemberAdd(member) {
  const createdAt = member.user?.createdTimestamp || null;
  const accountAge = createdAt ? formatDuration(Date.now() - createdAt) : 'Unknown';
  const author = member.user ? { name: member.user.tag, iconURL: member.user.displayAvatarURL({ dynamic: true }) } : null;

  await logManager.sendLog(member.guild, 'server_logs', {
    title: '✅ Member Joined',
    description: `**Member:** ${member.user?.tag || 'Unknown'}\n**Username:** ${member.user?.username || 'Unknown'}\n**User ID:** ${member.id}`,
    author,
    fields: [
      { name: 'Account Created', value: formatTimestamp(createdAt, 'F'), inline: true },
      { name: 'Account Age', value: accountAge, inline: true }
    ],
    color: 0x00ff00,
    footer: 'Member join',
    timestamp: true
  });
}

async function handleGuildMemberRemove(member) {
  const roles = member.roles?.cache.filter(role => role.id !== member.guild.id);
  const roleList = roles && roles.size ? roles.map(role => role.toString()).join(' ') : 'No roles';
  const joinedAt = member.joinedTimestamp || null;
  const author = member.user ? { name: member.user.tag, iconURL: member.user.displayAvatarURL({ dynamic: true }) } : null;

  await logManager.sendLog(member.guild, 'server_logs', {
    title: '🚪 Member Left',
    description: `**Member:** ${getMemberLabel(member)}\n**User ID:** ${member.id}\n**Joined:** ${formatTimestamp(joinedAt, 'R')}`,
    author,
    fields: [
      { name: 'Member joined', value: joinedAt ? formatDuration(Date.now() - joinedAt) : 'Unknown', inline: true },
      { name: 'Roles', value: roleList, inline: false }
    ],
    color: 0xff8800,
    footer: 'Member leave',
    timestamp: true
  });
}

async function handleGuildUpdate(oldGuild, newGuild) {
  const changes = [];
  if (oldGuild.name !== newGuild.name) changes.push({ name: 'Name', value: `${oldGuild.name} → ${newGuild.name}` });
  if (oldGuild.verificationLevel !== newGuild.verificationLevel) changes.push({ name: 'Verification Level', value: `${oldGuild.verificationLevel} → ${newGuild.verificationLevel}` });
  if (oldGuild.afkChannelId !== newGuild.afkChannelId) changes.push({ name: 'AFK Channel', value: `${oldGuild.afkChannel?.name || 'None'} → ${newGuild.afkChannel?.name || 'None'}` });
  if (oldGuild.afkTimeout !== newGuild.afkTimeout) changes.push({ name: 'AFK Timeout', value: `${oldGuild.afkTimeout} → ${newGuild.afkTimeout}` });
  if (oldGuild.systemChannelId !== newGuild.systemChannelId) changes.push({ name: 'System Channel', value: `${oldGuild.systemChannel?.name || 'None'} → ${newGuild.systemChannel?.name || 'None'}` });
  if (oldGuild.rulesChannelId !== newGuild.rulesChannelId) changes.push({ name: 'Rules Channel', value: `${oldGuild.rulesChannel?.name || 'None'} → ${newGuild.rulesChannel?.name || 'None'}` });
  if (oldGuild.publicUpdatesChannelId !== newGuild.publicUpdatesChannelId) changes.push({ name: 'Updates Channel', value: `${oldGuild.publicUpdatesChannel?.name || 'None'} → ${newGuild.publicUpdatesChannel?.name || 'None'}` });
  if (oldGuild.vanityURLCode !== newGuild.vanityURLCode) changes.push({ name: 'Vanity URL', value: `${oldGuild.vanityURLCode || 'None'} → ${newGuild.vanityURLCode || 'None'}` });
  if (oldGuild.banner !== newGuild.banner) changes.push({ name: 'Banner', value: 'Server banner updated' });
  if (oldGuild.splash !== newGuild.splash) changes.push({ name: 'Splash', value: 'Server splash updated' });

  if (!changes.length) return;

  await logManager.sendLog(newGuild, 'server_logs', {
    title: '🏛️ Server Updated',
    description: `**Server:** ${newGuild.name}\n**ID:** ${newGuild.id}`,
    fields: changes,
    thumbnail: newGuild.iconURL({ dynamic: true }),
    color: 0x00b0f4,
    footer: 'Server update',
    timestamp: true
  });
}

async function handleGuildBanAdd(ban) {
  const author = ban.user ? { name: ban.user.tag, iconURL: ban.user.displayAvatarURL({ dynamic: true }) } : null;
  await logManager.sendLog(ban.guild, 'server_logs', {
    title: '⛔ Member Banned',
    description: `**User:** ${getUserLabel(ban.user)}`,
    author,
    color: 0xff0000,
    footer: 'Member ban',
    timestamp: true
  });
}

async function handleGuildBanRemove(guild, user) {
  const author = user ? { name: user.tag, iconURL: user.displayAvatarURL({ dynamic: true }) } : null;
  await logManager.sendLog(guild, 'server_logs', {
    title: '🔓 Member Unbanned',
    description: `**User:** ${getUserLabel(user)}`,
    author,
    color: 0x00ff00,
    footer: 'Member unban',
    timestamp: true
  });
}

async function handleGuildMemberUpdate(oldMember, newMember) {
  if (!newMember.guild) return;

  const changes = [];
  let title = '👤 Member Update';

  const oldNickname = oldMember.nickname || oldMember.user.username;
  const newNickname = newMember.nickname || newMember.user.username;
  const nicknameChanged = oldNickname !== newNickname;
  if (nicknameChanged) {
    changes.push({ name: 'Nickname Before', value: oldNickname });
    changes.push({ name: 'Nickname After', value: newNickname });
  }

  const oldRoles = new Set(oldMember.roles.cache.keys());
  const newRoles = new Set(newMember.roles.cache.keys());
  const addedRoles = [...newRoles].filter(roleId => !oldRoles.has(roleId));
  const removedRoles = [...oldRoles].filter(roleId => !newRoles.has(roleId));

  let color = 0xffa500;
  if (addedRoles.length > 0) {
    const roleNames = addedRoles.map(roleId => newMember.guild.roles.cache.get(roleId)?.toString() || roleId);
    changes.push({ name: 'Role Added', value: roleNames.join(' ') });
    if (!nicknameChanged && removedRoles.length === 0 && !newMember.communicationDisabledUntilTimestamp && !oldMember.communicationDisabledUntilTimestamp) {
      title = '➕ Role Given';
    }

    const dangerousRoles = addedRoles
      .map(roleId => newMember.guild.roles.cache.get(roleId))
      .filter(role => role && hasDangerousPermissions(role.permissions));

    if (dangerousRoles.length > 0) {
      const dangerousDetails = dangerousRoles.map(role => `**${role.name}**: ${formatDangerousPermissions(role.permissions).join(', ')}`);
      changes.push({ name: '⚠️ Dangerous Role Assigned', value: dangerousDetails.join('\n'), inline: false });
      title = '⚠️ Dangerous Role Assigned';
      color = 0xff0000;
    }
  }
  if (removedRoles.length > 0) {
    const roleNames = removedRoles.map(roleId => oldMember.guild.roles.cache.get(roleId)?.toString() || roleId);
    changes.push({ name: 'Role Removed', value: roleNames.join(' ') });
    if (!nicknameChanged && addedRoles.length === 0 && !newMember.communicationDisabledUntilTimestamp && !oldMember.communicationDisabledUntilTimestamp) {
      title = '➖ Role Removed';
    }
  }

  const oldTimeout = oldMember.communicationDisabledUntilTimestamp;
  const newTimeout = newMember.communicationDisabledUntilTimestamp;
  if (oldTimeout !== newTimeout) {
    if (newTimeout) {
      changes.push({ name: 'Timeout', value: `Member timed out until ${formatTimestamp(newTimeout, 'F')}` });
      title = '⏱️ Member Timeout';
    } else {
      changes.push({ name: 'Timeout', value: 'Timeout removed' });
      title = '⏱️ Member Timeout Removed';
    }
  }

  if (!changes.length) return;  
  if (nicknameChanged && addedRoles.length === 0 && removedRoles.length === 0 && oldTimeout === newTimeout) {
    title = '✏️ Nickname Changed';
  }

  const author = newMember.user ? { name: newMember.user.tag, iconURL: newMember.user.displayAvatarURL({ dynamic: true }) } : null;

  await logManager.sendLog(newMember.guild, 'mod_logs', {
    title,
    description: `**Member:** ${getMemberLabel(newMember)}\n**User ID:** ${newMember.id}`,
    fields: changes,
    author,
    color,
    footer: 'Member update',
    timestamp: true
  });
}

async function handleRoleCreate(role) {
  const dangerousPermissions = formatDangerousPermissions(role.permissions);
  const fields = [
    { name: 'Color', value: role.hexColor || 'Default', inline: true },
    { name: 'Hoist', value: role.hoist ? 'Yes' : 'No', inline: true },
    { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true }
  ];

  let title = '➕ Role Created';
  let color = 0x00ff00;
  if (dangerousPermissions.length > 0) {
    title = '⚠️ Role Created with Dangerous Permissions';
    color = 0xff0000;
    fields.push({ name: 'Dangerous Permissions', value: dangerousPermissions.join(', '), inline: false });
  }

  await logManager.sendLog(role.guild, 'server_logs', {
    title,
    description: `**Role:** ${role.toString()}\n**ID:** ${role.id}`,
    fields,
    thumbnail: role.guild.iconURL({ dynamic: true }),
    color,
    footer: 'Role create',
    timestamp: true
  });
}

async function handleRoleDelete(role) {
  await logManager.sendLog(role.guild, 'server_logs', {
    title: '🗑️ Role Deleted',
    description: `**Role:** ${role.name}\n**ID:** ${role.id}`,
    fields: [
      { name: 'Color', value: role.hexColor || 'Default', inline: true },
      { name: 'Hoist', value: role.hoist ? 'Yes' : 'No', inline: true },
      { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true }
    ],
    color: 0xff0000,
    footer: 'Role delete',
    timestamp: true
  });
}

async function handleRoleUpdate(oldRole, newRole) {
  const changes = [];
  if (oldRole.name !== newRole.name) {
    changes.push({ name: 'Name', value: `${oldRole.name} → ${newRole.name}` });
  }
  if (oldRole.color !== newRole.color) {
    changes.push({ name: 'Color', value: `${oldRole.hexColor || oldRole.color} → ${newRole.hexColor || newRole.color}` });
  }
  if (oldRole.hoist !== newRole.hoist) {
    changes.push({ name: 'Hoist', value: `${oldRole.hoist ? 'Yes' : 'No'} → ${newRole.hoist ? 'Yes' : 'No'}` });
  }
  if (oldRole.mentionable !== newRole.mentionable) {
    changes.push({ name: 'Mentionable', value: `${oldRole.mentionable ? 'Yes' : 'No'} → ${newRole.mentionable ? 'Yes' : 'No'}` });
  }
  if (oldRole.position !== newRole.position) {
    changes.push({ name: 'Position', value: `${oldRole.position} → ${newRole.position}` });
  }

  const permissionChange = getDangerousPermissionChanges(oldRole.permissions, newRole.permissions);
  const hasDangerousChange = permissionChange.added.length > 0 || permissionChange.removed.length > 0;

  if (hasDangerousChange) {
    if (permissionChange.added.length > 0) {
      changes.push({ name: '⚠️ Dangerous Permissions Added', value: permissionChange.added.join(', '), inline: false });
    }
    if (permissionChange.removed.length > 0) {
      changes.push({ name: 'ℹ️ Dangerous Permissions Removed', value: permissionChange.removed.join(', '), inline: false });
    }
  }

  if (!changes.length) return;

  const titleText = hasDangerousChange ? '⚠️ Role Updated — Permission Change' : '✏️ Role Updated';
  const color = permissionChange.added.length > 0 ? 0xff0000 : 0x00b0f4;

  await logManager.sendLog(newRole.guild, 'server_logs', {
    title: titleText,
    description: `**Role:** ${newRole.toString()}\n**ID:** ${newRole.id}`,
    fields: changes,
    thumbnail: newRole.guild.iconURL({ dynamic: true }),
    color,
    footer: 'Role update',
    timestamp: true
  });
}

async function handleChannelCreate(channel) {
  const fields = buildOverwriteFields(channel);
  const type = channel.type ? channel.type.replace('Guild', '') : 'Channel';

  await logManager.sendLog(channel.guild, 'server_logs', {
    title: `📁 ${type} Created`,
    description: formatChannelDescription(channel),
    fields,
    color: 0x00ff00,
    footer: 'Channel created',
    timestamp: true
  });
}

async function handleChannelDelete(channel) {
  const fields = buildOverwriteFields(channel);
  const type = channel.type ? channel.type.replace('Guild', '') : 'Channel';

  await logManager.sendLog(channel.guild, 'server_logs', {
    title: `🗑️ ${type} Deleted`,
    description: formatChannelDescription(channel),
    fields,
    color: 0xff0000,
    footer: 'Channel deleted',
    timestamp: true
  });
}

async function handleChannelUpdate(oldChannel, newChannel) {
  const changes = [];
  if (oldChannel.name !== newChannel.name) {
    changes.push({ name: 'Name', value: `${oldChannel.name} → ${newChannel.name}` });
  }
  if (oldChannel.type !== newChannel.type) {
    changes.push({ name: 'Type', value: `${oldChannel.type} → ${newChannel.type}` });
  }
  if (oldChannel.parentId !== newChannel.parentId) {
    changes.push({ name: 'Category', value: `${oldChannel.parent?.name || 'None'} → ${newChannel.parent?.name || 'None'}` });
  }
  if ('topic' in oldChannel && oldChannel.topic !== newChannel.topic) {
    changes.push({ name: 'Topic', value: `${oldChannel.topic || '[none]'} → ${newChannel.topic || '[none]'}` });
  }
  if ('rateLimitPerUser' in oldChannel && oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
    changes.push({ name: 'Slowmode', value: `${oldChannel.rateLimitPerUser} → ${newChannel.rateLimitPerUser}` });
  }
  if ('nsfw' in oldChannel && oldChannel.nsfw !== newChannel.nsfw) {
    changes.push({ name: 'NSFW', value: `${oldChannel.nsfw ? 'Yes' : 'No'} → ${newChannel.nsfw ? 'Yes' : 'No'}` });
  }

  if (!changes.length) return;

  await logManager.sendLog(newChannel.guild, 'server_logs', {
    title: '✏️ Channel Updated',
    description: formatChannelDescription(newChannel),
    fields: changes,
    color: 0x00b0f4,
    footer: 'Channel update',
    timestamp: true
  });
}

async function handleEmojiCreate(emoji) {
  await logManager.sendLog(emoji.guild, 'server_logs', {
    title: '✅ Emoji Created',
    description: `**Emoji:** ${emoji.toString()}\n**ID:** ${emoji.id}`,
    fields: [
      { name: 'Animated', value: emoji.animated ? 'Yes' : 'No', inline: true },
      { name: 'Managed', value: emoji.managed ? 'Yes' : 'No', inline: true }
    ],
    color: 0x00ff00,
    footer: 'Emoji create',
    timestamp: true
  });
}

async function handleEmojiUpdate(oldEmoji, newEmoji) {
  const changes = [];
  if (oldEmoji.name !== newEmoji.name) {
    changes.push({ name: 'Name', value: `${oldEmoji.name} → ${newEmoji.name}` });
  }
  if (oldEmoji.animated !== newEmoji.animated) {
    changes.push({ name: 'Animated', value: `${oldEmoji.animated ? 'Yes' : 'No'} → ${newEmoji.animated ? 'Yes' : 'No'}` });
  }
  if (oldEmoji.managed !== newEmoji.managed) {
    changes.push({ name: 'Managed', value: `${oldEmoji.managed ? 'Yes' : 'No'} → ${newEmoji.managed ? 'Yes' : 'No'}` });
  }

  if (!changes.length) return;

  await logManager.sendLog(newEmoji.guild, 'server_logs', {
    title: '✏️ Emoji Updated',
    description: `**Emoji:** ${newEmoji.toString()}\n**ID:** ${newEmoji.id}`,
    fields: changes,
    color: 0x00b0f4,
    footer: 'Emoji update',
    timestamp: true
  });
}

async function handleEmojiDelete(emoji) {
  await logManager.sendLog(emoji.guild, 'server_logs', {
    title: '🗑️ Emoji Deleted',
    description: `**Emoji:** ${emoji.name}\n**ID:** ${emoji.id}`,
    fields: [
      { name: 'Animated', value: emoji.animated ? 'Yes' : 'No', inline: true },
      { name: 'Managed', value: emoji.managed ? 'Yes' : 'No', inline: true }
    ],
    color: 0xff0000,
    footer: 'Emoji delete',
    timestamp: true
  });
}

async function handleVoiceStateUpdate(oldState, newState) {
  if (newState.member?.user?.bot) return;
  const guild = newState.guild || oldState.guild;
  if (!guild) return;

  const oldChannel = oldState.channel;
  const newChannel = newState.channel;
  if (!oldChannel && !newChannel) return;

  const statusFields = [
    { name: 'Self-muted', value: newState.selfMute ? 'Yes' : 'No', inline: true },
    { name: 'Self-deafened', value: newState.selfDeaf ? 'Yes' : 'No', inline: true },
    { name: 'Server muted', value: newState.serverMute ? 'Yes' : 'No', inline: true },
    { name: 'Server deafened', value: newState.serverDeaf ? 'Yes' : 'No', inline: true },
    { name: 'Streaming', value: newState.streaming ? 'Yes' : 'No', inline: true },
    { name: 'Video', value: newState.selfVideo ? 'Yes' : 'No', inline: true }
  ];

  const diffFields = [];
  if (oldState.selfMute !== newState.selfMute) diffFields.push({ name: 'Self-muted', value: `${oldState.selfMute ? 'Yes' : 'No'} → ${newState.selfMute ? 'Yes' : 'No'}` });
  if (oldState.selfDeaf !== newState.selfDeaf) diffFields.push({ name: 'Self-deafened', value: `${oldState.selfDeaf ? 'Yes' : 'No'} → ${newState.selfDeaf ? 'Yes' : 'No'}` });
  if (oldState.serverMute !== newState.serverMute) diffFields.push({ name: 'Server muted', value: `${oldState.serverMute ? 'Yes' : 'No'} → ${newState.serverMute ? 'Yes' : 'No'}` });
  if (oldState.serverDeaf !== newState.serverDeaf) diffFields.push({ name: 'Server deafened', value: `${oldState.serverDeaf ? 'Yes' : 'No'} → ${newState.serverDeaf ? 'Yes' : 'No'}` });
  if (oldState.streaming !== newState.streaming) diffFields.push({ name: 'Streaming', value: `${oldState.streaming ? 'Yes' : 'No'} → ${newState.streaming ? 'Yes' : 'No'}` });
  if (oldState.selfVideo !== newState.selfVideo) diffFields.push({ name: 'Video', value: `${oldState.selfVideo ? 'Yes' : 'No'} → ${newState.selfVideo ? 'Yes' : 'No'}` });

  if (!oldChannel && newChannel) {
    await logManager.sendLog(guild, 'mod_logs', {
      title: '🎧 Member Joined Voice Channel',
      description: `**Member:** ${getMemberLabel(newState.member)}\n**Channel:** ${newChannel.toString()}`,
      fields: statusFields,
      color: 0x00ff00,
      footer: 'Voice join',
      timestamp: true
    });
    return;
  }

  if (oldChannel && !newChannel) {
    await logManager.sendLog(guild, 'mod_logs', {
      title: '🎤 Member Left Voice Channel',
      description: `**Member:** ${getMemberLabel(oldState.member)}\n**Channel:** ${oldChannel.toString()}`,
      fields: statusFields,
      color: 0xff8800,
      footer: 'Voice leave',
      timestamp: true
    });
    return;
  }

  if (oldChannel.id !== newChannel.id) {
    await logManager.sendLog(guild, 'mod_logs', {
      title: '🔁 Voice Channel Moved',
      description: `**Member:** ${getMemberLabel(newState.member)}\n**From:** ${oldChannel.toString()}\n**To:** ${newChannel.toString()}`,
      fields: statusFields,
      color: 0x00b0f4,
      footer: 'Voice move',
      timestamp: true
    });
    return;
  }

  if (diffFields.length > 0) {
    await logManager.sendLog(guild, 'mod_logs', {
      title: '🔊 Voice State Updated',
      description: `**Member:** ${getMemberLabel(newState.member)}\n**Channel:** ${newChannel.toString()}`,
      fields: diffFields,
      color: 0x00b0f4,
      footer: 'Voice state update',
      timestamp: true
    });
  }
}

module.exports = {
  handleMessageDelete,
  handleMessageUpdate,
  handleBulkMessageDelete,
  handleInviteCreate,
  handleInviteDelete,
  handleGuildMemberAdd,
  handleGuildMemberRemove,
  handleGuildUpdate,
  handleGuildBanAdd,
  handleGuildBanRemove,
  handleGuildMemberUpdate,
  handleRoleCreate,
  handleRoleDelete,
  handleRoleUpdate,
  handleChannelCreate,
  handleChannelDelete,
  handleChannelUpdate,
  handleEmojiCreate,
  handleEmojiUpdate,
  handleEmojiDelete,
  handleVoiceStateUpdate
};
