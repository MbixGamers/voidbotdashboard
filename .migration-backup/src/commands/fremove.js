const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const forceRoleStore = require('../utils/forceRoleStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fremove')
    .setDescription('Remove a role from a selected user if your ID is allowed')
    .setDMPermission(false)
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('The user to remove the role from')
        .setRequired(true))
    .addRoleOption(option =>
      option
        .setName('role')
        .setDescription('The role to remove')
        .setRequired(true)),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('target');
    const role = interaction.options.getRole('role');
    const guild = interaction.guild;

    if (!targetUser) {
      await interaction.editReply({ content: '❌ User not found.', ephemeral: true });
      return;
    }

    if (!role) {
      await interaction.editReply({ content: '❌ Role not found.', ephemeral: true });
      return;
    }

    if (!await forceRoleStore.isFremoveAllowed(interaction.user.id)) {
      await interaction.editReply({ content: '❌ You are not authorized to use this command.', ephemeral: true });
      return;
    }

    if (!guild) {
      await interaction.editReply({ content: '❌ This command must be used in a server.', ephemeral: true });
      return;
    }

    const member = await guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      await interaction.editReply({ content: '❌ That user is not in this server.', ephemeral: true });
      return;
    }

    const botMember = guild.members.me;
    if (!botMember) {
      await interaction.editReply({ content: '❌ Bot member data is unavailable.', ephemeral: true });
      return;
    }

    if (!member.roles.cache.has(role.id)) {
      await interaction.editReply({ content: '❌ That user does not have that role.', ephemeral: true });
      return;
    }

    if (botMember.roles.highest.comparePositionTo(role) <= 0) {
      await interaction.editReply({ content: '❌ I cannot remove that role because it is higher than or equal to my highest role.', ephemeral: true });
      return;
    }

    try {
      await member.roles.remove(role, `Role removal via fremove by ${interaction.user.tag}`);
      const embed = new EmbedBuilder()
        .setColor(0xFFAA00)
        .setTitle('✅ Role Removed')
        .setDescription(`The **${role.name}** role has been removed from ${targetUser.tag}.`)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error('fremove error:', error);
      await interaction.editReply({ content: '❌ I could not remove that role. Please check my permissions and role hierarchy.', ephemeral: true });
    }
  }
};
