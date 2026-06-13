// src/utils/securityHandler.js
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const antinukeConfig = require('./antinukeConfig');
const auditLogger = require('./auditLogger');
const fastModStats = require('./fastModStats');
const logManager = require('./logManager');

const ROLE_CHANGE_THRESHOLD = 3; // Max role changes in 10 seconds
const KICK_THRESHOLD = 2; // Max kicks in 10 seconds
const BAN_THRESHOLD = 2; // Max bans in 10 seconds
const ADMIN_GRANT_THRESHOLD = 1; // Any admin grant is suspicious

let whitelist = {
    users: new Set(),
    roles: new Set()
};

async function loadWhitelist() {
    try {
        const fs = require('fs').promises;
        const path = require('path');
        const data = await fs.readFile(path.join(__dirname, '..', '..', 'whitelist.json'), 'utf8');
        const parsed = JSON.parse(data);
        whitelist.users = new Set(parsed.users || []);
        whitelist.roles = new Set(parsed.roles || []);
    } catch (err) {
        if (err.code !== 'ENOENT') console.error('❌ Error loading whitelist:', err);
        whitelist.users = new Set();
        whitelist.roles = new Set();
    }
}

function isWhitelisted(member) {
    if (!member) return false;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (whitelist.users.has(member.id)) return true;
    for (const roleId of whitelist.roles) {
        if (member.roles.cache.has(roleId)) return true;
    }
    return false;
}

async function handleGuildMemberUpdate(oldMember, newMember) {
    const config = await antinukeConfig.get(newMember.guild.id);
    if (!config.enabled || isWhitelisted(newMember)) return;

    // Check for admin role grant
    const oldAdmin = oldMember.permissions.has(PermissionFlagsBits.Administrator);
    const newAdmin = newMember.permissions.has(PermissionFlagsBits.Administrator);
    
    if (!oldAdmin && newAdmin) {
        // Someone was given admin perms
        const auditLog = await newMember.guild.fetchAuditLogs({ 
            limit: 1, 
            type: 25 // MEMBER_ROLE_UPDATE
        }).catch(() => null);
        
        const executor = auditLog?.entries.first()?.executor;
        
        const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('⚠️ ADMIN PERMISSIONS GRANTED')
            .setDescription(`**User:** ${newMember.user.tag} (${newMember.id})\n**Action:** Granted Administrator permissions`)
            .addFields(
                { name: 'Executed By', value: executor ? `${executor.tag} (${executor.id})` : 'Unknown', inline: true },
                { name: 'Time', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
            )
            .setTimestamp();
        
        await logManager.sendLog(newMember.guild, 'security', { embed, timestamp: true });
        
        // Check if this is suspicious (non-whitelisted executor)
        if (executor && !isWhitelisted(await newMember.guild.members.fetch(executor.id).catch(() => null))) {
            // Auto-remove the admin perms
            await newMember.roles.set(oldMember.roles.cache, 'Anti-Nuke: Suspicious admin grant').catch(() => {});
            
            const actionEmbed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('🛡️ AUTO-ACTION TAKEN')
                .setDescription(`Administrator permissions were automatically removed from ${newMember.user.tag} due to suspicious activity.`)
                .setTimestamp();
            
            await logManager.sendLog(newMember.guild, 'security', { embed: actionEmbed, timestamp: true });
        }
    }
}

async function handleRoleCreate(role) {
    const config = await antinukeConfig.get(role.guild.id);
    if (!config.enabled) return;
    
    const auditLog = await role.guild.fetchAuditLogs({ limit: 1, type: 30 }).catch(() => null);
    const executor = auditLog?.entries.first()?.executor;
    
    if (executor && !isWhitelisted(await role.guild.members.fetch(executor.id).catch(() => null))) {
        const recentCreations = await auditLogger.getRecentActions(role.guild.id, 'role_create', 10);
        
        if (recentCreations.length >= 2) {
            // Mass role creation detected
            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('🚫 MASS ROLE CREATION DETECTED')
                .setDescription(`**User:** ${executor.tag} (${executor.id})`)
                .addFields(
                    { name: 'Roles Created', value: `${recentCreations.length + 1} in last 10 seconds`, inline: true },
                    { name: 'Action', value: 'All staff roles removed', inline: true }
                )
                .setTimestamp();
            
            await logManager.sendLog(role.guild, 'security', { embed, timestamp: true });
            
            // Remove all staff roles from the executor
            const member = await role.guild.members.fetch(executor.id).catch(() => null);
            if (member) {
                const staffRoles = member.roles.cache.filter(r => 
                    r.permissions.has(PermissionFlagsBits.Administrator) ||
                    r.permissions.has(PermissionFlagsBits.ManageRoles) ||
                    r.permissions.has(PermissionFlagsBits.ManageChannels) ||
                    r.permissions.has(PermissionFlagsBits.KickMembers) ||
                    r.permissions.has(PermissionFlagsBits.BanMembers)
                );
                
                await member.roles.remove(staffRoles, 'Anti-Nuke: Mass role creation').catch(() => {});
            }
        }
        
        await auditLogger.logAction(role.guild.id, 'role_create', {
            userId: executor.id,
            roleId: role.id,
            roleName: role.name
        });
    }
}

async function handleRoleDelete(role) {
    const config = await antinukeConfig.get(role.guild.id);
    if (!config.enabled) return;
    
    const auditLog = await role.guild.fetchAuditLogs({ limit: 1, type: 32 }).catch(() => null);
    const executor = auditLog?.entries.first()?.executor;
    
    if (executor && !isWhitelisted(await role.guild.members.fetch(executor.id).catch(() => null))) {
        const recentDeletions = await auditLogger.getRecentActions(role.guild.id, 'role_delete', 10);
        
        if (recentDeletions.length >= 2) {
            // Mass role deletion detected
            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('🚫 MASS ROLE DELETION DETECTED')
                .setDescription(`**User:** ${executor.tag} (${executor.id})`)
                .addFields(
                    { name: 'Roles Deleted', value: `${recentDeletions.length + 1} in last 10 seconds`, inline: true },
                    { name: 'Action', value: 'User banned', inline: true }
                )
                .setTimestamp();
            
            await logManager.sendLog(role.guild, 'security', { embed, timestamp: true });
            
            // Ban the user
            await role.guild.members.ban(executor.id, { reason: 'Anti-Nuke: Mass role deletion' }).catch(() => {});
        }
        
        await auditLogger.logAction(role.guild.id, 'role_delete', {
            userId: executor.id,
            roleId: role.id,
            roleName: role.name
        });
    }
}

async function handleRoleUpdate(oldRole, newRole) {
    const config = await antinukeConfig.get(newRole.guild.id);
    if (!config.enabled) return;
    
    const auditLog = await newRole.guild.fetchAuditLogs({ limit: 1, type: 31 }).catch(() => null);
    const executor = auditLog?.entries.first()?.executor;
    
    if (executor && !isWhitelisted(await newRole.guild.members.fetch(executor.id).catch(() => null))) {
        // Check if admin perms were added to role
        const oldAdmin = oldRole.permissions.has(PermissionFlagsBits.Administrator);
        const newAdmin = newRole.permissions.has(PermissionFlagsBits.Administrator);
        
        if (!oldAdmin && newAdmin) {
            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('⚠️ ADMIN PERMISSIONS ADDED TO ROLE')
                .setDescription(`**Role:** ${newRole.name} (${newRole.id})\n**Executor:** ${executor.tag} (${executor.id})`)
                .addFields(
                    { name: 'Action', value: 'Admin permissions removed from role', inline: true }
                )
                .setTimestamp();
            
            await logManager.sendLog(newRole.guild, 'security', { embed, timestamp: true });
            
            // Remove admin perms from role
            await newRole.setPermissions(oldRole.permissions, 'Anti-Nuke: Suspicious admin grant').catch(() => {});
        }
    }
}

async function handleGuildBanAdd(ban) {
    const config = await antinukeConfig.get(ban.guild.id);
    if (!config.enabled) return;
    
    const auditLog = await ban.guild.fetchAuditLogs({ limit: 1, type: 22 }).catch(() => null);
    const executor = auditLog?.entries.first()?.executor;
    
    if (executor && !isWhitelisted(await ban.guild.members.fetch(executor.id).catch(() => null))) {
        const recentBans = await auditLogger.getRecentActions(ban.guild.id, 'member_ban', 10);
        
        if (recentBans.length >= BAN_THRESHOLD) {
            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('🚫 MASS BANNING DETECTED')
                .setDescription(`**User:** ${executor.tag} (${executor.id})`)
                .addFields(
                    { name: 'Bans', value: `${recentBans.length + 1} in last 10 seconds`, inline: true },
                    { name: 'Action', value: 'All staff roles removed', inline: true }
                )
                .setTimestamp();
            
            await logManager.sendLog(ban.guild, 'security', { embed, timestamp: true });
            
            // Remove all staff roles
            const member = await ban.guild.members.fetch(executor.id).catch(() => null);
            if (member) {
                const staffRoles = member.roles.cache.filter(r => 
                    r.permissions.has(PermissionFlagsBits.Administrator) ||
                    r.permissions.has(PermissionFlagsBits.BanMembers)
                );
                await member.roles.remove(staffRoles, 'Anti-Nuke: Mass banning').catch(() => {});
            }
        }
        
        await auditLogger.logAction(ban.guild.id, 'member_ban', {
            userId: executor.id,
            targetId: ban.user.id
        });
    }
}

async function handleGuildMemberRemove(member) {
    const config = await antinukeConfig.get(member.guild.id);
    if (!config.enabled) return;
    
    const auditLog = await member.guild.fetchAuditLogs({ limit: 1, type: 20 }).catch(() => null);
    const executor = auditLog?.entries.first()?.executor;
    
    if (executor && !isWhitelisted(await member.guild.members.fetch(executor.id).catch(() => null))) {
        const recentKicks = await auditLogger.getRecentActions(member.guild.id, 'member_kick', 10);
        
        if (recentKicks.length >= KICK_THRESHOLD) {
            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('🚫 MASS KICKING DETECTED')
                .setDescription(`**User:** ${executor.tag} (${executor.id})`)
                .addFields(
                    { name: 'Kicks', value: `${recentKicks.length + 1} in last 10 seconds`, inline: true },
                    { name: 'Action', value: 'All staff roles removed', inline: true }
                )
                .setTimestamp();
            
            await logManager.sendLog(member.guild, 'security', { embed, timestamp: true });
            
            // Remove all staff roles
            const staffMember = await member.guild.members.fetch(executor.id).catch(() => null);
            if (staffMember) {
                const staffRoles = staffMember.roles.cache.filter(r => 
                    r.permissions.has(PermissionFlagsBits.Administrator) ||
                    r.permissions.has(PermissionFlagsBits.KickMembers)
                );
                await staffMember.roles.remove(staffRoles, 'Anti-Nuke: Mass kicking').catch(() => {});
            }
        }
        
        await auditLogger.logAction(member.guild.id, 'member_kick', {
            userId: executor.id,
            targetId: member.id
        });
    }
}

async function handleChannelCreate(channel) {
    const config = await antinukeConfig.get(channel.guild.id);
    if (!config.enabled) return;
    
    const auditLog = await channel.guild.fetchAuditLogs({ limit: 1, type: 10 }).catch(() => null);
    const executor = auditLog?.entries.first()?.executor;
    
    if (executor && !isWhitelisted(await channel.guild.members.fetch(executor.id).catch(() => null))) {
        const recentCreations = await auditLogger.getRecentActions(channel.guild.id, 'channel_create', 10);
        
        if (recentCreations.length >= 3) {
            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('🚫 MASS CHANNEL CREATION DETECTED')
                .setDescription(`**User:** ${executor.tag} (${executor.id})`)
                .addFields(
                    { name: 'Channels Created', value: `${recentCreations.length + 1} in last 10 seconds`, inline: true },
                    { name: 'Action', value: 'All staff roles removed', inline: true }
                )
                .setTimestamp();
            
            await logManager.sendLog(channel.guild, 'security', { embed, timestamp: true });
            
            // Remove all staff roles
            const member = await channel.guild.members.fetch(executor.id).catch(() => null);
            if (member) {
                const staffRoles = member.roles.cache.filter(r => 
                    r.permissions.has(PermissionFlagsBits.Administrator) ||
                    r.permissions.has(PermissionFlagsBits.ManageChannels)
                );
                await member.roles.remove(staffRoles, 'Anti-Nuke: Mass channel creation').catch(() => {});
            }
        }
        
        await auditLogger.logAction(channel.guild.id, 'channel_create', {
            userId: executor.id,
            channelId: channel.id,
            channelName: channel.name
        });
    }
}

async function handleChannelDelete(channel) {
    const config = await antinukeConfig.get(channel.guild.id);
    if (!config.enabled) return;
    
    const auditLog = await channel.guild.fetchAuditLogs({ limit: 1, type: 12 }).catch(() => null);
    const executor = auditLog?.entries.first()?.executor;
    
    if (executor && !isWhitelisted(await channel.guild.members.fetch(executor.id).catch(() => null))) {
        const recentDeletions = await auditLogger.getRecentActions(channel.guild.id, 'channel_delete', 10);
        
        if (recentDeletions.length >= 3) {
            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('🚫 MASS CHANNEL DELETION DETECTED')
                .setDescription(`**User:** ${executor.tag} (${executor.id})`)
                .addFields(
                    { name: 'Channels Deleted', value: `${recentDeletions.length + 1} in last 10 seconds`, inline: true },
                    { name: 'Action', value: 'User banned', inline: true }
                )
                .setTimestamp();
            
            await logManager.sendLog(channel.guild, 'security', { embed, timestamp: true });
            
            // Ban the user
            await channel.guild.members.ban(executor.id, { reason: 'Anti-Nuke: Mass channel deletion' }).catch(() => {});
        }
        
        await auditLogger.logAction(channel.guild.id, 'channel_delete', {
            userId: executor.id,
            channelId: channel.id,
            channelName: channel.name
        });
    }
}

// Initialize whitelist
loadWhitelist().catch(console.error);

module.exports = {
    isWhitelisted,
    handleGuildMemberUpdate,
    handleRoleCreate,
    handleRoleDelete,
    handleRoleUpdate,
    handleGuildBanAdd,
    handleGuildMemberRemove,
    handleChannelCreate,
    handleChannelDelete,
    whitelist
};