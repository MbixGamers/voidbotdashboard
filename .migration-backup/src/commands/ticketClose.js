// src/commands/ticketClose.js
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { closeTicket, isTicketChannel } = require('../utils/ticketHandlers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('Close the current ticket with a reason')
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for closing')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),

  async execute(interaction) {
    // Verify that this channel is a ticket
    const isTicket = await isTicketChannel(interaction.channel.id);
    if (!isTicket) {
      return interaction.reply({
        content: '❌ This command can only be used in ticket channels.',
        flags: MessageFlags.Ephemeral
      });
    }

    const reason = interaction.options.getString('reason');

    // Defer reply to allow time for transcript generation and channel deletion
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    // Perform the closing process
    await closeTicket(interaction.channel, interaction.user.id, reason, interaction.client);

    // Confirm closure (the channel will be deleted, but the ephemeral reply will persist)
    await interaction.editReply({ content: '✅ Ticket closed successfully.' });
  }
};