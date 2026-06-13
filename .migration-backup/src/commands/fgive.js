const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const forceRoleStore = require('../utils/forceRoleStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fgive')
    .setDescription('Give a role to a selected user if your ID is allowed')
    .setDMPermission(false)
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('The user to give the role to')
        .setRequired(true))
    .addRoleOption(option =>
      option
        .setName('role')
        .setDescription('The role to grant')
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

    if (!await forceRoleStore.isFgiveAllowed(interaction.user.id)) {
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

    if (role.managed || role.id === guild.id) {
      await interaction.editReply({ content: '❌ This role cannot be assigned manually.', ephemeral: true });
      return;
    }

    if (botMember.roles.highest.comparePositionTo(role) <= 0) {
      await interaction.editReply({ content: '❌ I cannot assign that role because it is higher than or equal to my highest role.', ephemeral: true });
      return;
    }

    if (member.roles.cache.has(role.id)) {
      await interaction.editReply({ content: '❌ That user already has this role.', ephemeral: true });
      return;
    }

    try {
      await member.roles.add(role, `Role assignment via fgive by ${interaction.user.tag}`);
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Role Assigned')
        .setDescription(`${targetUser.tag} has been given the **${role.name}** role.`)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error('fgive error:', error);
      await interaction.editReply({ content: '❌ I could not assign that role. Please check my permissions and role hierarchy.', ephemeral: true });
    }
  }
};
