// src/commands/unlock.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const logManager = require('../utils/logManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Unlock the current channel or a specified channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .setDMPermission(false)
        .addChannelOption(opt =>
            opt.setName('channel')
                .setDescription('Channel to unlock (defaults to current)')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice)
                .setRequired(false))
        .addStringOption(opt =>
            opt.setName('reason')
                .setDescription('Reason for unlocking')
                .setRequired(false)),

    async execute(interaction) {
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const reason = interaction.options.getString('reason') || 'No reason provided';
        
        await interaction.deferReply({ ephemeral: true });
        
        try {
            if (channel.isTextBased()) {
                await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                    SendMessages: null
                });
            } else if (channel.isVoiceBased()) {
                await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                    Connect: null
                });
            }
            
            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('🔓 Channel Unlocked')
                .setDescription(`${channel} has been unlocked.`)
                .addFields(
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Unlocked by', value: interaction.user.tag, inline: true }
                )
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            
            await logManager.sendLog(interaction.guild, 'moderation', {
                embed,
                timestamp: true
            }).catch(() => {});
            
        } catch (error) {
            await interaction.editReply({ content: '❌ Failed to unlock channel. Check my permissions.' });
        }
    }
};