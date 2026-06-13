// src/commands/lock.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const logManager = require('../utils/logManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Lock the current channel or a specified channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .setDMPermission(false)
        .addChannelOption(opt =>
            opt.setName('channel')
                .setDescription('Channel to lock (defaults to current)')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice)
                .setRequired(false))
        .addStringOption(opt =>
            opt.setName('reason')
                .setDescription('Reason for locking')
                .setRequired(false)),

    async execute(interaction) {
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const reason = interaction.options.getString('reason') || 'No reason provided';
        
        await interaction.deferReply({ ephemeral: true });
        
        try {
            if (channel.isTextBased()) {
                await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                    SendMessages: false
                });
            } else if (channel.isVoiceBased()) {
                await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                    Connect: false
                });
            }
            
            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('🔒 Channel Locked')
                .setDescription(`${channel} has been locked.`)
                .addFields(
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Locked by', value: interaction.user.tag, inline: true }
                )
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            
            await logManager.sendLog(interaction.guild, 'moderation', {
                embed,
                timestamp: true
            }).catch(() => {});
            
        } catch (error) {
            await interaction.editReply({ content: '❌ Failed to lock channel. Check my permissions.' });
        }
    }
};