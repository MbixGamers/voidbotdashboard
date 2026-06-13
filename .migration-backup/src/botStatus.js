// src/botStatus.js
const { ActivityType } = require('discord.js');

/**
 * Sets the bot's rich presence (activity).
 * Call this after the client is ready.
 * @param {Client} client - The Discord.js client instance.
 */
function setBotStatus(client) {
  if (!client || !client.user) {
    console.error('❌ Cannot set status: client or client.user is not available.');
    return;
  }

  try {
    // Set a clean activity – no command listing.
    client.user.setActivity('Advanced Bot', {
      type: ActivityType.Watching,
    });

    console.log('✅ Bot status (rich presence) set successfully.');
  } catch (error) {
    console.error('❌ Failed to set bot status:', error);
  }
}

module.exports = { setBotStatus };