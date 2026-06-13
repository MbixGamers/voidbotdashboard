// src/commands/scan.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const antinukeConfig = require('../utils/antinukeConfig');

function buildLimitedField(lines, maxLength = 1024, suffix = '') {
    const keptLines = [];
    let currentLength = 0;
    const effectiveMax = Math.max(0, maxLength - suffix.length);

    for (const line of lines) {
        const lineLength = currentLength === 0 ? line.length : line.length + 1;
        if (currentLength + lineLength > effectiveMax) break;
        keptLines.push(line);
        currentLength += lineLength;
    }

    let result = keptLines.join('\n');
    return result && suffix ? `${result}${suffix}` : result;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('scan')
        .setDescription('Scan the server for potential security threats')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const guild = interaction.guild;
        
        // Scan for dangerous permissions
        const dangerousPerms = [
            'Administrator',
            'ManageGuild',
            'ManageRoles',
            'ManageChannels',
            'KickMembers',
            'BanMembers',
            'MentionEveryone',
            'ManageWebhooks'
        ];
        
        const threats = {
            roles: [],
            users: []
        };
        
        // Check roles
        guild.roles.cache.forEach(role => {
            if (role.id === guild.id) return;
            
            const dangerous = [];
            for (const perm of dangerousPerms) {
                if (role.permissions.has(perm)) {
                    dangerous.push(perm);
                }
            }
            
            if (dangerous.length > 0) {
                threats.roles.push({
                    name: role.name,
                    id: role.id,
                    permissions: dangerous,
                    memberCount: role.members.size
                });
            }
        });
        
        // Check members with dangerous roles
        for (const role of threats.roles) {
            const roleObj = guild.roles.cache.get(role.id);
            if (!roleObj) continue;
            roleObj.members.forEach(member => {
                if (!member.user.bot) {
                    threats.users.push({
                        tag: member.user.tag,
                        id: member.id,
                        roles: [role.name],
                        permissions: role.permissions
                    });
                }
            });
        }
        
        // Remove duplicates
        threats.users = threats.users.filter((user, index, self) => 
            index === self.findIndex(u => u.id === user.id)
        );
        
        const embed = new EmbedBuilder()
            .setColor(0xffaa00)
            .setTitle('🔍 Security Scan Results')
            .setDescription(`**Server:** ${guild.name}\n**Scanned at:** <t:${Math.floor(Date.now() / 1000)}:F>`)
            .addFields(
                { name: '⚠️ Dangerous Roles', value: threats.roles.length.toString(), inline: true },
                { name: '⚠️ At-Risk Members', value: threats.users.length.toString(), inline: true },
                { name: '🛡️ Total Members', value: guild.memberCount.toString(), inline: true }
            )
            .setTimestamp();
        
        if (threats.roles.length > 0) {
            const roleLines = threats.roles.map(r => `**${r.name}** - ${r.permissions.join(', ')}`);
            const roleListWithoutSuffix = buildLimitedField(roleLines, 1024);
            const displayedRoles = roleListWithoutSuffix ? roleListWithoutSuffix.split('\n').length : 0;
            const remainingRoles = threats.roles.length - displayedRoles;
            const suffix = remainingRoles > 0 ? `\n... and ${remainingRoles} more` : '';
            let roleList = roleListWithoutSuffix;

            if (remainingRoles > 0) {
                roleList = buildLimitedField(roleLines, 1024, suffix);
            }

            if (!roleList) {
                roleList = 'Too many roles to display.';
            }

            embed.addFields({ name: '📋 Dangerous Roles', value: roleList, inline: false });
        }
        
        if (threats.users.length > 0) {
            const userLines = threats.users.map(u => `**${u.tag}** - <@${u.id}>`);
            const userListWithoutSuffix = buildLimitedField(userLines, 1024);
            const displayedUsers = userListWithoutSuffix ? userListWithoutSuffix.split('\n').length : 0;
            const remainingUsers = threats.users.length - displayedUsers;
            const suffix = remainingUsers > 0 ? `\n... and ${remainingUsers} more` : '';
            let userList = userListWithoutSuffix;

            if (remainingUsers > 0) {
                userList = buildLimitedField(userLines, 1024, suffix);
            }

            if (!userList) {
                userList = 'Too many members to display.';
            }

            embed.addFields({ name: '👥 At-Risk Members', value: userList, inline: false });
        }
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('scan_refresh')
                    .setLabel('🔄 Refresh Scan')
                    .setStyle(ButtonStyle.Primary)
            );
        
        await interaction.editReply({ embeds: [embed], components: [row] });
    }
};