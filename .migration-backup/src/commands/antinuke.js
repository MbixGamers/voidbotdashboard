// src/commands/antinuke.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const antinukeConfig = require('../utils/antinukeConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('antinuke')
        .setDescription('Configure the antinuke and antispam system')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub
                .setName('toggle')
                .setDescription('Enable or disable the antinuke system')
                .addBooleanOption(opt =>
                    opt.setName('enabled')
                        .setDescription('Enable or disable')
                        .setRequired(true)))
        .addSubcommand(sub =>
            sub
                .setName('logchannel')
                .setDescription('Set the channel for antinuke logs')
                .addChannelOption(opt =>
                    opt.setName('channel')
                        .setDescription('The channel to send logs to')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)))
        .addSubcommand(sub =>
            sub
                .setName('status')
                .setDescription('Check the current antinuke configuration'))
        .addSubcommand(sub =>
            sub
                .setName('thresholds')
                .setDescription('Configure spam thresholds')
                .addIntegerOption(opt =>
                    opt.setName('warn')
                        .setDescription('Messages before warning (default: 5)')
                        .setMinValue(1)
                        .setMaxValue(20)
                        .setRequired(false))
                .addIntegerOption(opt =>
                    opt.setName('timeout1')
                        .setDescription('Messages before 10min timeout (default: 10)')
                        .setMinValue(1)
                        .setMaxValue(30)
                        .setRequired(false))
                .addIntegerOption(opt =>
                    opt.setName('timeout2')
                        .setDescription('Messages before 1 day timeout (default: 15)')
                        .setMinValue(1)
                        .setMaxValue(50)
                        .setRequired(false))
                .addIntegerOption(opt =>
                    opt.setName('reset')
                        .setDescription('Seconds to reset message count (default: 10)')
                        .setMinValue(5)
                        .setMaxValue(60)
                        .setRequired(false)))
        .addSubcommand(sub =>
            sub
                .setName('feature')
                .setDescription('Enable or disable a security feature')
                .addStringOption(opt =>
                    opt.setName('feature')
                        .setDescription('Feature to enable or disable')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Anti-Scam', value: 'antiScamEnabled' },
                            { name: 'Anti-Spam', value: 'antiSpamEnabled' },
                            { name: 'Anti-Invite', value: 'antiInviteEnabled' },
                            { name: 'Anti-Mention', value: 'antiMentionEnabled' },
                            { name: 'New Account Protection', value: 'antiNewAccountEnabled' },
                            { name: 'Ticket Safe Mode', value: 'ticketChannelSafeMode' }
                        ))
                .addBooleanOption(opt =>
                    opt.setName('enabled')
                        .setDescription('Enable or disable the feature')
                        .setRequired(true)))
        .addSubcommand(sub =>
            sub
                .setName('accountage')
                .setDescription('Set minimum account age for new-account protection')
                .addIntegerOption(opt =>
                    opt.setName('minutes')
                        .setDescription('Minimum account age in minutes')
                        .setMinValue(1)
                        .setMaxValue(1440)
                        .setRequired(true)))
        .addSubcommand(sub =>
            sub
                .setName('resetwarnings')
                .setDescription('Reset spam warnings for a user')
                .addUserOption(opt =>
                    opt.setName('user')
                        .setDescription('The user to reset warnings for')
                        .setRequired(true))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        if (subcommand === 'toggle') {
            const enabled = interaction.options.getBoolean('enabled');
            await antinukeConfig.update(guildId, { enabled });
            
            const embed = new EmbedBuilder()
                .setColor(enabled ? 0x00ff00 : 0xff0000)
                .setTitle('🛡️ Antinuke System')
                .setDescription(`Antinuke has been **${enabled ? 'enabled' : 'disabled'}**`)
                .setTimestamp()
                .setFooter({ text: `Changed by ${interaction.user.tag}` });
            
            await interaction.reply({ embeds: [embed], ephemeral: true });

        } else if (subcommand === 'logchannel') {
            const channel = interaction.options.getChannel('channel');
            await antinukeConfig.update(guildId, { logChannelId: channel.id });
            
            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('📝 Log Channel Updated')
                .setDescription(`Antinuke logs will now be sent to ${channel}`)
                .setTimestamp()
                .setFooter({ text: `Updated by ${interaction.user.tag}` });
            
            await interaction.reply({ embeds: [embed], ephemeral: true });

        } else if (subcommand === 'thresholds') {
            const warnThreshold = interaction.options.getInteger('warn');
            const timeout1Threshold = interaction.options.getInteger('timeout1');
            const timeout2Threshold = interaction.options.getInteger('timeout2');
            const resetSeconds = interaction.options.getInteger('reset');
            
            const updates = {};
            if (warnThreshold !== null) updates.warnThreshold = warnThreshold;
            if (timeout1Threshold !== null) updates.timeout1Threshold = timeout1Threshold;
            if (timeout2Threshold !== null) updates.timeout2Threshold = timeout2Threshold;
            if (resetSeconds !== null) updates.resetSeconds = resetSeconds;
            
            await antinukeConfig.update(guildId, updates);
            
            const config = await antinukeConfig.get(guildId);
            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('⚙️ Thresholds Updated')
                .addFields(
                    { name: '⚠️ Warning Threshold', value: `${config.warnThreshold} messages`, inline: true },
                    { name: '⏰ 10min Timeout', value: `${config.timeout1Threshold} messages`, inline: true },
                    { name: '📅 1 Day Timeout', value: `${config.timeout2Threshold} messages`, inline: true },
                    { name: '⏱️ Reset Time', value: `${config.resetSeconds} seconds`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: `Updated by ${interaction.user.tag}` });
            
            await interaction.reply({ embeds: [embed], ephemeral: true });

        } else if (subcommand === 'feature') {
            const feature = interaction.options.getString('feature');
            const enabled = interaction.options.getBoolean('enabled');
            const featureNames = {
                antiScamEnabled: 'Anti-Scam',
                antiSpamEnabled: 'Anti-Spam',
                antiInviteEnabled: 'Anti-Invite',
                antiMentionEnabled: 'Anti-Mention',
                antiNewAccountEnabled: 'New Account Protection',
                ticketChannelSafeMode: 'Ticket Safe Mode'
            };

            await antinukeConfig.update(guildId, { [feature]: enabled });

            const embed = new EmbedBuilder()
                .setColor(enabled ? 0x00ff00 : 0xff0000)
                .setTitle('⚙️ Feature Updated')
                .setDescription(`${featureNames[feature] || feature} has been **${enabled ? 'enabled' : 'disabled'}**.`)
                .setTimestamp()
                .setFooter({ text: `Updated by ${interaction.user.tag}` });

            await interaction.reply({ embeds: [embed], ephemeral: true });

        } else if (subcommand === 'accountage') {
            const minutes = interaction.options.getInteger('minutes');
            await antinukeConfig.update(guildId, { minAccountAgeMinutes: minutes });

            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('⏱️ Account Age Set')
                .setDescription(`New account protection now uses a minimum account age of **${minutes} minutes**.`)
                .setTimestamp()
                .setFooter({ text: `Updated by ${interaction.user.tag}` });

            await interaction.reply({ embeds: [embed], ephemeral: true });

        } else if (subcommand === 'resetwarnings') {
            const user = interaction.options.getUser('user');
            await antinukeConfig.resetUserWarnings(guildId, user.id);

            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('♻️ Warnings Reset')
                .setDescription(`Spam warnings have been reset for ${user.tag}.`)
                .setTimestamp()
                .setFooter({ text: `Updated by ${interaction.user.tag}` });

            await interaction.reply({ embeds: [embed], ephemeral: true });

        } else if (subcommand === 'status') {
            const config = await antinukeConfig.get(guildId);
            const logChannel = config.logChannelId ? `<#${config.logChannelId}>` : 'Not set';
            
            const embed = new EmbedBuilder()
                .setColor(config.enabled ? 0x00ff00 : 0xff0000)
                .setTitle('🛡️ Antinuke Status')
                .addFields(
                    { name: 'Status', value: config.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: 'Log Channel', value: logChannel, inline: true },
                    { name: 'Anti-Scam', value: config.antiScamEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: 'Anti-Spam', value: config.antiSpamEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: 'Anti-Invite', value: config.antiInviteEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: 'Anti-Mention', value: config.antiMentionEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: 'New Account Protection', value: config.antiNewAccountEnabled ? `✅ Enabled (${config.minAccountAgeMinutes}m)` : '❌ Disabled', inline: true },
                    { name: 'Ticket Safe Mode', value: config.ticketChannelSafeMode ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: '⚠️ Warning Threshold', value: `${config.warnThreshold} messages`, inline: true },
                    { name: '⏰ 10min Timeout', value: `${config.timeout1Threshold} messages`, inline: true },
                    { name: '📅 1 Day Timeout', value: `${config.timeout2Threshold} messages`, inline: true },
                    { name: '⏱️ Reset Time', value: `${config.resetSeconds} seconds`, inline: true }
                )
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
};