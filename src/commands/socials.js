const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const socialsCommand = new SlashCommandBuilder()
  .setName('socials')
  .setDescription('List all official social media links.');

const socialPlatforms = [
  {
    name: 'Discord Roster Hub',
    url: 'https://discord.gg/' + 'vo' + 'id-esports-lf-investors-1197180527686463498',
    icon: '💬',
    color: 0x5865F2,
    inviteCode: 'server-invite'
  },
  {
    name: 'TikTok',
    url: 'https://www.tiktok.com/@' + 'vo' + 'idesportsggs?_r=1&_t=ZT-92a7CN4YVqg',
    icon: '🎵',
    color: 0x000000,
    handle: 'Official TikTok'
  },
  {
    name: 'YouTube',
    url: 'https://youtube.com/@' + 'vo' + 'idesports2x?si=PbRzUj_o9Q178kIj',
    icon: '🎥',
    color: 0xFF0000,
    handle: 'Official account'
  },
  {
    name: 'Twitter / X',
    url: 'https://x.com/' + 'vo' + 'idesports2x?s=21',
    icon: '🐦',
    color: 0x1DA1F2,
    handle: 'Official account'
  },
  {
    name: 'Instagram',
    url: 'https://www.instagram.com/' + 'vo' + 'idesports2x?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==',
    icon: '📸',
    color: 0xE4405F,
    handle: 'Official account'
  }
];

const PER_PAGE = 5;

function buildSocialsEmbed() {
  const embed = new EmbedBuilder()
    .setTitle('🔗 Official Social Links')
    .setDescription('Click the buttons below to visit each platform!')
    .setColor(0x8a2be2)
    .setTimestamp()
    .setFooter({ text: 'All links are verified and managed by the team' });

  socialPlatforms.forEach(social => {
    embed.addFields({
      name: `${social.icon} **${social.name}**`,
      value: `🔗 [Click to visit](${social.url})${social.handle ? `\n🔖 ${social.handle}` : ''}`,
      inline: true
    });
  });

  return embed;
}

function buildSocialsButtons() {
  const rows = [];

  const platformRow = new ActionRowBuilder();

  socialPlatforms.forEach(social => {
    let buttonLabel = social.name;
    if (social.name === 'Twitter / X') buttonLabel = '𝕏';

    platformRow.addComponents(
      new ButtonBuilder()
        .setLabel(buttonLabel)
        .setEmoji(social.icon)
        .setStyle(ButtonStyle.Link)
        .setURL(social.url)
    );
  });

  rows.push(platformRow);

  return rows;
}

async function handleSocials(interaction) {
  const embed = buildSocialsEmbed();
  const rows = buildSocialsButtons();

  await interaction.editReply({
    embeds: [embed],
    components: rows
  });
}

module.exports = {
  socialsCommand,
  handleSocials
};