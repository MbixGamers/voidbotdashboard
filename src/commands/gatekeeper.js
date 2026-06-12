// src/commands/gatekeeper.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', '..', 'gatekeeper.json');

const TARGET_CHANNEL_ID = '1465551578315493417';
const INFO_CHANNEL_ID = '1444529141234794667';
const APPLY_CHANNEL_ID = '1444529135891386520';

let enabled = false;

async function loadState() {
  try {
    const data = await fs.readFile(STATE_FILE, 'utf8');
    const parsed = JSON.parse(data);
    enabled = parsed.enabled || false;
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('❌ Gatekeeper load error:', err);
    enabled = false;
  }
}

async function saveState() {
  const data = JSON.stringify({ enabled }, null, 2);
  await fs.writeFile(STATE_FILE, data, 'utf8');
}

const gstartCommand = new SlashCommandBuilder()
  .setName('gstart')
  .setDescription('Start auto‑replying to join queries in the join channel')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false);

const gstopCommand = new SlashCommandBuilder()
  .setName('gstop')
  .setDescription('Stop auto‑replying to join queries')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false);

async function handleGstart(interaction) {
  enabled = true;
  await saveState();
  await interaction.editReply(`✅ Gatekeeper enabled. I will now reply to join questions in <#${TARGET_CHANNEL_ID}>.`);
}

async function handleGstop(interaction) {
  enabled = false;
  await saveState();
  await interaction.editReply(`✅ Gatekeeper disabled. I will no longer reply to join questions.`);
}

async function handleMessage(message) {
  if (message.author.bot) return;
  if (message.channel.id !== TARGET_CHANNEL_ID) return;
  if (!enabled) return;

  const content = message.content.toLowerCase();

  const patterns = [
    /how (do|can|to) (i )?join the team/i,
    /can i join the team/i,
    /how to become a (member|pro)/i,
    /team (invite|application|recruitment|tryout)/i,
    /(join|apply)\s+the team/i,
    /\bjoin\b.*\bteam\b/i,
    /\bapply\b.*\bteam\b/i,
    /want to (join|be part of) the team/i,
    /interested in (joining|applying)/i
  ];

  if (!patterns.some(p => p.test(content))) return;

  const replyText = `Hello! Welcome!! 👋\n` +
    `To join the team, please check out <#${INFO_CHANNEL_ID}> for all the info you need.\n` +
    `Once you've decided, you can apply in <#${APPLY_CHANNEL_ID}>.\n\n` +
    `Good luck! 🚀`;

  try {
    await message.reply(replyText);
    console.log(`✅ Gatekeeper replied to ${message.author.tag} in #${message.channel.name}`);
  } catch (err) {
    console.error('❌ Gatekeeper reply error:', err);
  }
}

async function initGatekeeper() {
  await loadState();
  console.log(`🚪 Gatekeeper module loaded (enabled: ${enabled})`);
}

module.exports = {
  gstartCommand,
  gstopCommand,
  handleGstart,
  handleGstop,
  handleMessage,
  initGatekeeper
};