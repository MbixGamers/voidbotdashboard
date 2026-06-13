// src/commands/advanced.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const uptimeCommand = new SlashCommandBuilder()
  .setName('uptime')
  .setDescription('Show bot uptime and latency.');

// Store bot start time
const botStartTime = Date.now();

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

async function handleUptime(interaction) {
  const uptime = Date.now() - botStartTime;
  const processUptime = process.uptime();
  const roundtrip = Date.now() - interaction.createdTimestamp;
  const wsPing = interaction.client.ws.ping;

  const embed = new EmbedBuilder()
    .setTitle('⏱️ Bot Uptime & Latency')
    .addFields(
      { name: 'Bot Uptime', value: formatUptime(uptime), inline: true },
      { name: 'Process Uptime', value: formatUptime(processUptime * 1000), inline: true },
      { name: 'Started', value: new Date(botStartTime).toLocaleString(), inline: false },
      { name: 'Roundtrip Latency', value: `${roundtrip}ms`, inline: true },
      { name: 'WebSocket Ping', value: `${wsPing}ms`, inline: true },
      { name: 'Status', value: roundtrip < 100 ? '🟢 Excellent' : roundtrip < 200 ? '🟡 Good' : '🔴 Slow', inline: true }
    )
    .setColor(0x00ff00)
    .setTimestamp()
    .setFooter({ text: 'Bot' });

  await interaction.editReply({ embeds: [embed] });
}

module.exports = {
  uptimeCommand,
  handleUptime
};