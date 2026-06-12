const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const rankingCommand = new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Get the current esports ranking');

const RANKING_DATA = {
    nacRank: 17,
    totalEarnings: 7500,
    prPoints: 122365,
    lastUpdated: '2026-03-11',
};

function formatCurrency(amount) {
    if (!amount && amount !== 0) return '$0';
    return `$${amount.toLocaleString()}`;
}

function formatNumber(num) {
    if (!num && num !== 0) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

async function handleRanking(interaction) {
    try {
        const embed = new EmbedBuilder()
            .setTitle('🏆 **ESPORTS RANKINGS**')
            .setDescription('▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬')
            .setColor(0x8a2be2)
            .setThumbnail('https://cdn.discordapp.com/emojis/1444539060004589669.webp?size=128')
            .addFields(
                {
                    name: '📊 **PR POINTS**',
                    value: `\`\`\`\n${formatNumber(RANKING_DATA.prPoints)}\n\`\`\``,
                    inline: false
                },
                {
                    name: '📍 **NAC RANKING**',
                    value: `\`\`\`\n#${RANKING_DATA.nacRank}\n\`\`\``,
                    inline: true
                },
                {
                    name: '💰 **TOTAL EARNINGS**',
                    value: `\`\`\`\n${formatCurrency(RANKING_DATA.totalEarnings)}\n\`\`\``,
                    inline: true
                }
            )
            .setFooter({
                text: `Last updated: ${RANKING_DATA.lastUpdated} • Data from FortniteTracker`,
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('View on Fortnite Tracker')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://fortnitetracker.com/esports/organization/' + 'vo' + 'id-esports')
                    .setEmoji('🔗'),
                new ButtonBuilder()
                    .setLabel('NAC Leaderboard')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://fortnitetracker.com/esports?region=NAC')
                    .setEmoji('📊')
            );

        await interaction.editReply({
            embeds: [embed],
            components: [row]
        });

    } catch (error) {
        console.error('❌ /ranking command error:', error);

        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Error Displaying Rankings')
            .setDescription('An unexpected error occurred while displaying ranking data.')
            .setColor(0xff0000)
            .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

module.exports = {
    rankingCommand,
    handleRanking
};