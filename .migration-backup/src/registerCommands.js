const { REST, Routes } = require('discord.js');
const { discordToken, discordClientId, discordGuildId } = require('./config');

const {
  teamsCommand,
  prosListCommand,
  proInfoCommand,
  opsInfoCommand
} = require('./commands/pros');
const { merchCommand } = require('./commands/merch');
const { newsCommand } = require('./commands/news');
const { videosCommand } = require('./commands/videos');
const {
  uptimeCommand
} = require('./commands/advanced');
const { helpCommand } = require('./commands/help');
const { socialsCommand } = require('./commands/socials');
const { latestVideoCommand } = require('./commands/latestVideo');
const {
  kickCommand,
  banCommand,
  timeoutCommand,
  warnCommand,
  clearCommand
} = require('./commands/moderation');
const { funFactCommand } = require('./commands/funfact');
const { rankingCommand } = require('./commands/ranking');
const { bwishCommand } = require('./commands/birthday');
const { 
  modcheckCommand, 
  modclearCommand, 
  modgetCommand, 
  modinfoCommand,
  ticketscanCommand
} = require('./commands/modStats');
const {
  gamesubmitCommand,
  gamestatCommand,
  gamesoloCommand,
  gameresetCommand,
  gameremoveCommand
} = require('./commands/gameSubmit');
const { gstartCommand, gstopCommand } = require('./commands/gatekeeper');

// Ticket commands
const ticketSetup = require('./commands/ticketSetup');
const ticketEditSetup = require('./commands/ticketEditSetup');
const ticketClose = require('./commands/ticketClose');

// Antinuke commands
const antinuke = require('./commands/antinuke');

// New Security Commands
const security = require('./commands/security');
const lock = require('./commands/lock');
const unlock = require('./commands/unlock');
const scan = require('./commands/scan');
const whitelist = require('./commands/whitelist');
const fgive = require('./commands/fgive');
const fremove = require('./commands/fremove');

const commands = [
  teamsCommand,
  prosListCommand,
  proInfoCommand,
  opsInfoCommand,
  merchCommand,
  newsCommand,
  videosCommand,
  uptimeCommand,
  helpCommand,
  socialsCommand,
  latestVideoCommand,
  kickCommand,
  banCommand,
  timeoutCommand,
  warnCommand,
  clearCommand,
  funFactCommand,
  rankingCommand,
  bwishCommand,
  modcheckCommand,
  modclearCommand,
  modgetCommand,
  modinfoCommand,
  ticketscanCommand,
  gamesubmitCommand,
  gamestatCommand,
  gamesoloCommand,
  gameresetCommand,
  gameremoveCommand,
  gstartCommand,
  gstopCommand,
  
  // Ticket commands
  ticketSetup.data,
  ticketEditSetup.data,
  ticketClose.data,
  
  // Antinuke command
  antinuke.data,
  
  // New Security Commands
  security.data,
  lock.data,
  unlock.data,
  scan.data,
  whitelist.data,
  fgive.data,
  fremove.data
].map(command => command.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(discordToken);

  try {
    console.log('🔄 Started refreshing application (/) commands...');
    console.log(`📋 Total commands to register: ${commands.length}`);

    if (discordGuildId) {
      await rest.put(
        Routes.applicationGuildCommands(discordClientId, discordGuildId),
        { body: commands }
      );
      console.log(`✅ Successfully reloaded **GUILD** commands for guild: ${discordGuildId}`);
      console.log(`📊 Commands will appear instantly in that server`);
    } else {
      await rest.put(
        Routes.applicationCommands(discordClientId),
        { body: commands }
      );
      console.log(`✅ Successfully reloaded **GLOBAL** application (/) commands`);
      console.log(`⏳ Global commands may take up to 1 hour to appear in all servers`);
    }
    
    const commandNames = commands.map(cmd => cmd.name);
    console.log(`📋 Registered commands: ${commandNames.join(', ')}`);
    console.log(`🎉 Command registration complete!`);

  } catch (error) {
    console.error('❌ Error registering commands:', error);
    
    if (error.code === 50035) {
      console.error('❌ Invalid command format - check your command definitions');
    } else if (error.code === 50001) {
      console.error('❌ Missing access - check bot permissions');
    } else if (error.code === 50013) {
      console.error('❌ Missing permissions - check bot has application.commands scope');
    }
  }
}

registerCommands();