const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const funFactCommand = new SlashCommandBuilder()
  .setName('funfact')
  .setDescription('Get a random fun fact about Esports!');

const funFacts = [
  'The server started as a friend group just for fun.',
  'The team is one of the largest self-funded esports organizations.',
  'The esports project was first created in 2022.',
  'Almost 2 members join the team as you type this command!',
  'The team is arguably one of the best NA/EU rosters.',
  'The esports community has a large audience base throughout the world.',
  'The organization is not limited to Fortnite; it also has teams for games like R6 and COD.',
  'The server rewards hard work and lets moderators grow into operations without bias.'
];

async function handleFunFact(interaction) {
  const randomFact = funFacts[Math.floor(Math.random() * funFacts.length)];

  const embed = new EmbedBuilder()
    .setTitle('🎲 Fun Fact')
    .setDescription(randomFact)
    .setColor(0x8a2be2)
    .setTimestamp()
    .setFooter({ text: 'Did you know?' });

  await interaction.editReply({ embeds: [embed] });
}

module.exports = {
  funFactCommand,
  handleFunFact
};