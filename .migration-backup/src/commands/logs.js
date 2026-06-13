const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const logConfig = require('../utils/logConfig');
const { CATEGORY_NAMES } = require('../utils/logManager');

const CATEGORY_CHOICES = Object.entries(CATEGORY_NAMES).map(([value, name]) => ({ name, value }));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Configure the server log channel and log categories')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommandGroup(group =>
      group
        .setName('channel')
        .setDescription('Manage the log channel')
        .addSubcommand(sub =>
          sub
            .setName('set')
            .setDescription('Set the server log channel')
            .addChannelOption(opt =>
              opt.setName('channel')
                .setDescription('Channel to receive bot logs')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)))
        .addSubcommand(sub =>
          sub
            .setName('remove')
            .setDescription('Remove the configured log channel')))
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('Show current log settings'))
    .addSubcommandGroup(group =>
      group
        .setName('category')
        .setDescription('Enable or disable log categories')
        .addSubcommand(sub =>
          sub
            .setName('set')
            .setDescription('Enable or disable a log category')
            .addStringOption(opt =>
              opt.setName('category')
                .setDescription('The log category to update')
                .setRequired(true)
                .addChoices(...CATEGORY_CHOICES))
            .addBooleanOption(opt =>
              opt.setName('enabled')
                .setDescription('Enable or disable this category')
                .setRequired(true))))
    .addSubcommand(sub =>
      sub
        .setName('categories')
        .setDescription('List available log categories')),

  async execute(interaction) {
    const subcommandGroup = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (subcommandGroup === 'channel') {
      if (subcommand === 'set') {
        const channel = interaction.options.getChannel('channel');
        await logConfig.update(guildId, { logChannelId: channel.id });

        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x00ff00)
              .setTitle('✅ Log Channel Set')
              .setDescription(`All bot logs will now be sent to ${channel}.`)
              .setTimestamp()
          ],
          ephemeral: true
        });
      }

      if (subcommand === 'remove') {
        await logConfig.update(guildId, { logChannelId: null });
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xffaa00)
              .setTitle('🗑️ Log Channel Removed')
              .setDescription('The server log channel has been cleared. No logs will be posted until a channel is configured.')
              .setTimestamp()
          ],
          ephemeral: true
        });
      }
    }

    if (subcommand === 'status') {
      const config = await logConfig.get(guildId);
      const channelLabel = config.logChannelId ? `<#${config.logChannelId}>` : 'Not configured';
      const categoryFields = Object.entries(config.enabledCategories).map(([category, enabled]) => ({
        name: CATEGORY_NAMES[category] || category,
        value: enabled ? '✅ Enabled' : '❌ Disabled',
        inline: true
      }));

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('📌 Log Settings')
            .addFields(
              { name: 'Log Channel', value: channelLabel, inline: false },
              ...categoryFields
            )
            .setTimestamp()
        ],
        ephemeral: true
      });
    }

    if (subcommandGroup === 'category' && subcommand === 'set') {
      const category = interaction.options.getString('category');
      const enabled = interaction.options.getBoolean('enabled');
      const current = await logConfig.get(guildId);
      const updatedCategories = { ...current.enabledCategories, [category]: enabled };
      await logConfig.update(guildId, { enabledCategories: updatedCategories });

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(enabled ? 0x00ff00 : 0xff0000)
            .setTitle(`${enabled ? '✅ Enabled' : '❌ Disabled'} ${CATEGORY_NAMES[category] || category}`)
            .setDescription(`Logs for the **${CATEGORY_NAMES[category] || category}** category will now be ${enabled ? 'sent' : 'skipped'}.`)
            .setTimestamp()
        ],
        ephemeral: true
      });
    }

    if (subcommand === 'categories') {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('📚 Available Log Categories')
            .setDescription(Object.entries(CATEGORY_NAMES)
              .map(([value, name]) => `• **${name}** \\(${value}\)`) 
              .join('\n'))
            .setTimestamp()
        ],
        ephemeral: true
      });
    }

    await interaction.reply({ content: 'Invalid logs subcommand.', ephemeral: true });
  }
};
