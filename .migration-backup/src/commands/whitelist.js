// src/commands/whitelist.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

const WHITELIST_FILE = path.join(__dirname, '..', '..', 'whitelist.json');

let whitelist = { users: [], roles: [] };

async function loadWhitelist() {
    try {
        const data = await fs.readFile(WHITELIST_FILE, 'utf8');
        whitelist = JSON.parse(data);
    } catch (err) {
        if (err.code !== 'ENOENT') console.error('❌ Error loading whitelist:', err);
        whitelist = { users: [], roles: [] };
    }
}

async function saveWhitelist() {
    await fs.writeFile(WHITELIST_FILE, JSON.stringify(whitelist, null, 2), 'utf8');
}

loadWhitelist();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('whitelist')
        .setDescription('Manage whitelisted users and roles (exempt from anti-nuke)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub
                .setName('adduser')
                .setDescription('Add a user to whitelist')
                .addUserOption(opt =>
                    opt.setName('user')
                        .setDescription('User to whitelist')
                        .setRequired(true)))
        .addSubcommand(sub =>
            sub
                .setName('removeuser')
                .setDescription('Remove a user from whitelist')
                .addUserOption(opt =>
                    opt.setName('user')
                        .setDescription('User to remove')
                        .setRequired(true)))
        .addSubcommand(sub =>
            sub
                .setName('addrole')
                .setDescription('Add a role to whitelist')
                .addRoleOption(opt =>
                    opt.setName('role')
                        .setDescription('Role to whitelist')
                        .setRequired(true)))
        .addSubcommand(sub =>
            sub
                .setName('removerole')
                .setDescription('Remove a role from whitelist')
                .addRoleOption(opt =>
                    opt.setName('role')
                        .setDescription('Role to remove')
                        .setRequired(true)))
        .addSubcommand(sub =>
            sub
                .setName('list')
                .setDescription('List all whitelisted users and roles')),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        await loadWhitelist();
        
        if (subcommand === 'adduser') {
            const user = interaction.options.getUser('user');
            if (!whitelist.users.includes(user.id)) {
                whitelist.users.push(user.id);
                await saveWhitelist();
                
                const embed = new EmbedBuilder()
                    .setColor(0x00ff00)
                    .setTitle('✅ User Whitelisted')
                    .setDescription(`${user.tag} has been added to the whitelist.`)
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
                await interaction.reply({ content: '❌ User is already whitelisted.', ephemeral: true });
            }
            
        } else if (subcommand === 'removeuser') {
            const user = interaction.options.getUser('user');
            const index = whitelist.users.indexOf(user.id);
            if (index > -1) {
                whitelist.users.splice(index, 1);
                await saveWhitelist();
                
                const embed = new EmbedBuilder()
                    .setColor(0xffaa00)
                    .setTitle('✅ User Removed')
                    .setDescription(`${user.tag} has been removed from the whitelist.`)
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
                await interaction.reply({ content: '❌ User is not whitelisted.', ephemeral: true });
            }
            
        } else if (subcommand === 'addrole') {
            const role = interaction.options.getRole('role');
            if (!whitelist.roles.includes(role.id)) {
                whitelist.roles.push(role.id);
                await saveWhitelist();
                
                const embed = new EmbedBuilder()
                    .setColor(0x00ff00)
                    .setTitle('✅ Role Whitelisted')
                    .setDescription(`${role.name} has been added to the whitelist.`)
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
                await interaction.reply({ content: '❌ Role is already whitelisted.', ephemeral: true });
            }
            
        } else if (subcommand === 'removerole') {
            const role = interaction.options.getRole('role');
            const index = whitelist.roles.indexOf(role.id);
            if (index > -1) {
                whitelist.roles.splice(index, 1);
                await saveWhitelist();
                
                const embed = new EmbedBuilder()
                    .setColor(0xffaa00)
                    .setTitle('✅ Role Removed')
                    .setDescription(`${role.name} has been removed from the whitelist.`)
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
                await interaction.reply({ content: '❌ Role is not whitelisted.', ephemeral: true });
            }
            
        } else if (subcommand === 'list') {
            const users = await Promise.all(whitelist.users.map(async id => {
                try {
                    const user = await interaction.client.users.fetch(id);
                    return user.tag;
                } catch {
                    return `Unknown User (${id})`;
                }
            }));
            
            const roles = whitelist.roles.map(id => {
                const role = interaction.guild.roles.cache.get(id);
                return role ? role.name : `Unknown Role (${id})`;
            });
            
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('📋 Whitelist')
                .addFields(
                    { name: '👤 Whitelisted Users', value: users.length ? users.join('\n') : 'None', inline: true },
                    { name: '🎭 Whitelisted Roles', value: roles.length ? roles.join('\n') : 'None', inline: true }
                )
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
};