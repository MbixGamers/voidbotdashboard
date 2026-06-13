// src/commands/security.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const securityFramework = require('../utils/securityFramework');

const MODULE_LABELS = securityFramework.getModuleLabels();
const MODULE_CHOICES = Object.entries(MODULE_LABELS).map(([value, name]) => ({ name, value }));

function parseValue(value) {
    if (value === undefined || value === null) return value;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : value;
}

function buildModuleStatusFields(config, moduleName) {
    const fields = [];
    if (moduleName) {
        const label = MODULE_LABELS[moduleName] || moduleName;
        fields.push({ name: 'Module', value: `${label} (${moduleName})`, inline: false });
        fields.push({ name: 'Status', value: config.enabled ? '✅ Enabled' : '❌ Disabled', inline: true });
        fields.push({ name: 'Threat Scan Count', value: `${Object.keys(config.thresholds || {}).length}`, inline: true });
        fields.push({ name: 'Sensitivity', value: `${config.sensitivity?.antiSpam || 'default'}`, inline: true });
    } else {
        for (const [name, enabled] of Object.entries(config.modules || {})) {
            fields.push({ name: MODULE_LABELS[name] || name, value: enabled ? '✅ Enabled' : '❌ Disabled', inline: true });
        }
    }
    return fields;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('security')
        .setDescription('Security module control hub')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub
                .setName('enable')
                .setDescription('Enable a security module')
                .addStringOption(opt =>
                    opt.setName('module')
                        .setDescription('Module to enable')
                        .setRequired(true)
                        .addChoices(...MODULE_CHOICES)))
        .addSubcommand(sub =>
            sub
                .setName('disable')
                .setDescription('Disable a security module')
                .addStringOption(opt =>
                    opt.setName('module')
                        .setDescription('Module to disable')
                        .setRequired(true)
                        .addChoices(...MODULE_CHOICES)))
        .addSubcommand(sub =>
            sub
                .setName('status')
                .setDescription('Show security module status')
                .addStringOption(opt =>
                    opt.setName('module')
                        .setDescription('Optional module to inspect')
                        .setRequired(false)
                        .addChoices(...MODULE_CHOICES)))
        .addSubcommand(sub =>
            sub
                .setName('config')
                .setDescription('View or update a module configuration parameter')
                .addStringOption(opt =>
                    opt.setName('module')
                        .setDescription('Module to configure')
                        .setRequired(true)
                        .addChoices(...MODULE_CHOICES))
                .addStringOption(opt =>
                    opt.setName('parameter')
                        .setDescription('Parameter name to update or inspect')
                        .setRequired(false))
                .addStringOption(opt =>
                    opt.setName('value')
                        .setDescription('New value for the parameter')
                        .setRequired(false)))
        .addSubcommand(sub =>
            sub
                .setName('scan')
                .setDescription('Run a security module scan')
                .addStringOption(opt =>
                    opt.setName('module')
                        .setDescription('Optional module to scan')
                        .setRequired(false)
                        .addChoices(...MODULE_CHOICES))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        const moduleName = interaction.options.getString('module');

        if (subcommand === 'enable' || subcommand === 'disable') {
            const enabled = subcommand === 'enable';
            const success = await securityFramework.setModuleEnabled(guildId, moduleName, enabled);

            const embed = new EmbedBuilder()
                .setColor(enabled ? 0x00ff00 : 0xff0000)
                .setTitle(`🛡️ Security Module ${enabled ? 'Enabled' : 'Disabled'}`)
                .setDescription(`${MODULE_LABELS[moduleName] || moduleName} is now ${enabled ? '**ENABLED**' : '**DISABLED**'}.`)
                .setTimestamp();

            if (!success) {
                embed.setColor(0xff8800).setDescription(`Could not locate the module: ${moduleName}`);
            }

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        if (subcommand === 'status') {
            const guildConfig = await securityFramework.getGuildConfig(guildId);
            const embed = new EmbedBuilder()
                .setColor(0x00aaff)
                .setTitle('🔐 Security Status')
                .setDescription(`Security module status for **${interaction.guild.name}**`)
                .addFields(buildModuleStatusFields(guildConfig, moduleName))
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        if (subcommand === 'config') {
            const parameter = interaction.options.getString('parameter');
            const value = interaction.options.getString('value');
            const config = await securityFramework.getModuleConfig(guildId, moduleName);

            if (!config) {
                await interaction.reply({ content: `Unknown module: ${moduleName}`, ephemeral: true });
                return;
            }

            if (!parameter) {
                const fields = [
                    { name: 'Module', value: MODULE_LABELS[moduleName] || moduleName, inline: false },
                    { name: 'Enabled', value: config.enabled ? '✅ Yes' : '❌ No', inline: true }
                ];

                if (Object.keys(config.thresholds).length) {
                    fields.push({ name: 'Thresholds', value: Object.entries(config.thresholds).map(([key, val]) => `**${key}**: ${val}`).join('\n') || 'None', inline: false });
                }
                if (Object.keys(config.sensitivity).length) {
                    fields.push({ name: 'Sensitivity', value: Object.entries(config.sensitivity).map(([key, val]) => `**${key}**: ${val}`).join('\n') || 'None', inline: false });
                }

                const embed = new EmbedBuilder()
                    .setColor(0x00aaff)
                    .setTitle(`⚙️ Configuration: ${MODULE_LABELS[moduleName] || moduleName}`)
                    .addFields(fields)
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            }

            if (!value) {
                await interaction.reply({ content: 'Please provide a value to update the configuration parameter.', ephemeral: true });
                return;
            }

            const parsed = parseValue(value);
            await securityFramework.setModuleParameter(guildId, moduleName, parameter, parsed);
            const updatedConfig = await securityFramework.getModuleConfig(guildId, moduleName);

            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle(`⚙️ Updated Configuration for ${MODULE_LABELS[moduleName] || moduleName}`)
                .setDescription(`Set **${parameter}** to **${parsed}**`) 
                .addFields(
                    { name: 'Module Enabled', value: updatedConfig.enabled ? '✅ Yes' : '❌ No', inline: true },
                    { name: 'Value', value: String(parsed), inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        if (subcommand === 'scan') {
            await interaction.deferReply({ ephemeral: true });
            const results = await securityFramework.scan(interaction.guild, moduleName || 'all');
            const embed = new EmbedBuilder()
                .setColor(0x00aaff)
                .setTitle('🔍 Security Scan Results')
                .setDescription(`Security scan completed for **${interaction.guild.name}**.`)
                .setTimestamp();

            if (moduleName === null || moduleName === 'all') {
                if (!results || Object.keys(results).length === 0) {
                    embed.addFields({ name: 'Result', value: 'No scanable security modules are available.' });
                } else {
                    for (const [name, result] of Object.entries(results)) {
                        const label = MODULE_LABELS[name] || name;
                        const summary = typeof result === 'object' ? JSON.stringify(result).slice(0, 600) : String(result);
                        embed.addFields({ name: label, value: summary || 'No actionable findings', inline: false });
                    }
                }
            } else {
                const label = MODULE_LABELS[moduleName] || moduleName;
                const summary = typeof results === 'object' ? JSON.stringify(results).slice(0, 600) : String(results);
                embed.addFields({ name: label, value: summary || 'No actionable findings' });
            }

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        await interaction.reply({ content: 'Unsupported security command.', ephemeral: true });
    }
};