// src/utils/antinukeHandler.js
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const antinukeConfig = require('./antinukeConfig');
const ticketConfig = require('./ticketConfig');
const logManager = require('./logManager');
const antiSpamWatcher = require('./antiSpamWatcher');

const INVITE_PATTERN = /(?:discord(?:app)?\.com\/invite|discord\.gg|invite\.gg)\/\w+/i;

// List of common scam patterns
const SCAM_PATTERNS = [
    // Crypto scams
    /bitcoin/i,
    /ethereum/i,
    /crypto/i,
    /free\s+btc/i,
    /free\s+eth/i,
    /claim\s+your\s+reward/i,
    /giveaway/i,
    /double\s+your\s+money/i,
    /investment\s+opportunity/i,
    
    // Phishing links
    /discord(-gift\.|\.gift|\. nitro|nitro\.)/i,
    /steamcommunity\.com.*\?/i,
    /free-nitro/i,
    /nitro-\w+\.\w+/i,
    /gift.*nitro/i,
    
    // Common scam phrases
    /you\s+won/i,
    /you\s+are\s+the\s+winner/i,
    /congratulations.*you/i,
    /click.*to.*claim/i,
    /verify.*account/i,
    /steam.*verify/i,
    /discord.*verify/i,
    
    // Suspicious links (shortened or unusual)
    /bit\.ly/i,
    /tinyurl\.com/i,
    /rb\.gy/i,
    /cutt\.ly/i,
    /ow\.ly/i,
    /is\.gd/i,
    /buff\.ly/i,
    /shorturl\.at/i,
    /short\.link/i,
    /shortest\.link/i,
    /short\.[a-z]{2,}/i,
    /tiny\.cc/i,
    /tr\.im/i,
    /v\.gd/i,
    /cli\.gs/i,
    /pic\.gd/i,
    /dft\.ba/i,
    /rlu\.ru/i,
    /moourl\.com/i,
    /x\.co/i
];

// Fake crypto image patterns (URLs that are likely fake crypto images)
const FAKE_IMAGE_PATTERNS = [
    /bitcoin.*\.(png|jpg|jpeg|gif)/i,
    /crypto.*giveaway.*\.(png|jpg|jpeg|gif)/i,
    /free.*btc.*\.(png|jpg|jpeg|gif)/i,
    /elon.*musk.*crypto.*\.(png|jpg|jpeg|gif)/i,
    /musk.*giveaway.*\.(png|jpg|jpeg|gif)/i,
    /satoshi.*giveaway.*\.(png|jpg|jpeg|gif)/i
];

async function sendLog(guild, config, embed) {
    if (!config.enabled) return;
    await logManager.sendLog(guild, 'security', { embed, timestamp: true }).catch(() => {});
}

async function deleteMessagesFast(channel, userId) {
    try {
        // Fetch only recent messages (limit 20 for speed)
        const messages = await channel.messages.fetch({ limit: 20 }).catch(() => []);
        const userMessages = messages.filter(m => m.author.id === userId && !m.pinned);
        
        // Delete all at once with Promise.all for speed
        await Promise.all(userMessages.map(msg => msg.delete().catch(() => {})));
    } catch (error) {
        console.error('Error deleting messages:', error);
    }
}

async function handleAntiScam(message) {
    if (message.author.bot) return false;
    if (message.member?.permissions.has(PermissionFlagsBits.Administrator)) return false;

    const config = await antinukeConfig.get(message.guildId);
    if (!config.enabled || !config.antiScamEnabled) return false;

    const ticketChannel = await ticketConfig.getChannel(message.channel.id);
    const isTicketChannel = Boolean(ticketChannel);

    let isScam = false;
    let scamReason = '';

    // Check for @everyone or @here mentions (fast check first)
    if (config.antiMentionEnabled && message.mentions.everyone) {
        isScam = true;
        scamReason = '@everyone or @here mention';
    }

    // Check for suspicious invite links
    if (!isScam && message.content && config.antiInviteEnabled) {
        if (INVITE_PATTERN.test(message.content)) {
            isScam = true;
            scamReason = 'Suspicious Discord invite link';
        }
    }

    // Check for suspicious links/content
    if (!isScam && message.content) {
        const content = message.content.toLowerCase();
        for (const pattern of SCAM_PATTERNS) {
            if (pattern.test(content)) {
                isScam = true;
                scamReason = `Suspicious content: ${pattern}`;
                break;
            }
        }
    }

    // Check new account message behavior
    if (!isScam && config.antiNewAccountEnabled && message.author.createdTimestamp) {
        const accountAge = Date.now() - message.author.createdTimestamp;
        const minAgeMs = config.minAccountAgeMinutes * 60000;
        if (accountAge < minAgeMs) {
            const freshContent = message.content || '';
            if (INVITE_PATTERN.test(freshContent) || SCAM_PATTERNS.some(pattern => pattern.test(freshContent.toLowerCase()))) {
                isScam = true;
                scamReason = `New account suspicious content (age < ${config.minAccountAgeMinutes}m)`;
            }
        }
    }

    // Check attachments for fake crypto images
    if (!isScam && message.attachments.size > 0) {
        for (const [_, attachment] of message.attachments) {
            if (attachment.contentType?.startsWith('image/')) {
                const url = attachment.url.toLowerCase();
                for (const pattern of FAKE_IMAGE_PATTERNS) {
                    if (pattern.test(url)) {
                        isScam = true;
                        scamReason = 'Suspicious crypto giveaway image';
                        break;
                    }
                }
            }
        }
    }

    // Check embeds (often used for scam links)
    if (!isScam && message.embeds.length > 0) {
        for (const embed of message.embeds) {
            if (embed.description) {
                for (const pattern of SCAM_PATTERNS) {
                    if (pattern.test(embed.description.toLowerCase())) {
                        isScam = true;
                        scamReason = 'Suspicious embed content';
                        break;
                    }
                }
            }
            if (embed.url) {
                for (const pattern of SCAM_PATTERNS) {
                    if (pattern.test(embed.url.toLowerCase())) {
                        isScam = true;
                        scamReason = 'Suspicious embed URL';
                        break;
                    }
                }
            }
        }
    }

    if (isScam) {
        try {
            // Delete the scam message immediately
            await message.delete().catch(() => {});

            if (!isTicketChannel || !config.ticketChannelSafeMode) {
                // Delete other recent messages from this user and punish in normal channels
                await deleteMessagesFast(message.channel, message.author.id);
                await message.member.kick(`Antinuke: ${scamReason}`).catch(() => {});
            }

            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle(isTicketChannel ? '🚫 Scam Detected in Ticket Channel' : '🚫 Scam Detected - User Kicked')
                .setDescription(`**User:** ${message.author.tag} (${message.author.id})\n**Reason:** ${scamReason}`)
                .addFields(
                    { name: 'Channel', value: `${message.channel}`, inline: true },
                    { name: 'Message Content', value: message.content || '[No content]', inline: false }
                )
                .setTimestamp()
                .setFooter({ text: isTicketChannel ? 'Ticket content was blocked without auto-punishment' : 'Action taken automatically' });
            
            await sendLog(message.guild, config, embed);
            return true;
        } catch (error) {
            console.error('Error handling scam:', error);
        }
    }
    
    return false;
}

async function handleAntiSpam(message) {
    if (message.author.bot) return false;
    if (message.member?.permissions.has(PermissionFlagsBits.Administrator)) return false;
    
    const config = await antinukeConfig.get(message.guildId);
    if (!config.enabled || !config.antiSpamEnabled) return false;

    const ticketChannel = await ticketConfig.getChannel(message.channel.id);
    const isTicketChannel = Boolean(ticketChannel);
    const guildId = message.guildId;
    const userId = message.author.id;
    const channel = message.channel;
    
    const spamFlags = await antiSpamWatcher.handleSpamSignals(message, config);
    if (spamFlags) return true;

    // Get user's spam data
    let userData = await antinukeConfig.getUserWarnings(guildId, userId);
    const now = Date.now();
    
    // Check if user is currently in timeout
    if (userData.timeoutExpires > now) {
        // Delete the message immediately if user is in timeout
        await message.delete().catch(() => {});
        
        // If they're trying to spam while in timeout, add a small ping to remind them
        if (userData.messageCount % 5 === 0) { // Every 5 messages while in timeout
            const timeoutEmbed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('⏰ You are currently timed out')
                .setDescription(`<@${userId}>, you are still timed out. Please wait until <t:${Math.floor(userData.timeoutExpires / 1000)}:R> before sending messages again.`)
                .setTimestamp();
            
            await channel.send({ embeds: [timeoutEmbed] }).then(msg => {
                setTimeout(() => msg.delete().catch(() => {}), 5000);
            }).catch(() => {});
        }
        
        return true;
    }
    
    // Reset message count if enough time has passed
    if (now - userData.lastMessageTime > config.resetSeconds * 1000) {
        userData.messageCount = 0;
        userData.hasBeenWarned = false; // Reset warning flag when count resets
    }
    
    // Increment message count
    userData.messageCount++;
    userData.lastMessageTime = now;
    
    let action = null;
    let timeoutDuration = null;
    let warningMessage = null;
    
    // Progressive timeout system - warn only once
    if (userData.messageCount >= config.timeout2Threshold && userData.currentTimeoutLevel < 3) {
        // 1 day timeout (final level)
        timeoutDuration = 86400000; // 24 hours
        action = 'timed out for 1 day';
        warningMessage = `**🚫 <@${userId}>, you have been timed out for 1 day!**\n\nYou were warned about spamming but continued. This is your final timeout - next time will result in a ban.\n\nPlease take this time to read our server rules.`;
        userData.currentTimeoutLevel = 3;
        userData.hasBeenWarned = false; // Reset warning flag
    } 
    else if (userData.messageCount >= config.timeout1Threshold && userData.currentTimeoutLevel < 2) {
        // 10 minute timeout
        timeoutDuration = 600000; // 10 minutes
        action = 'timed out for 10 minutes';
        warningMessage = `**⏰ <@${userId}>, you have been timed out for 10 minutes!**\n\nYou were warned about spamming but continued. If you continue after this timeout, you'll receive a 1 day timeout.\n\nTake this time to calm down and read the server rules.`;
        userData.currentTimeoutLevel = 2;
        userData.hasBeenWarned = false; // Reset warning flag
    } 
    else if (userData.messageCount >= config.warnThreshold && !userData.hasBeenWarned && userData.currentTimeoutLevel < 1) {
        // Warning - only once
        action = 'warned';
        warningMessage = `**⚠️ <@${userId}>, please stop spamming!**\n\nYou've sent ${userData.messageCount} messages in a short period. This is your only warning - if you continue, you will be timed out immediately.\n\n• First timeout: 10 minutes\n• Final timeout: 1 day\n\nPlease respect the server rules and give others a chance to speak.`;
        userData.currentTimeoutLevel = 1;
        userData.hasBeenWarned = true;
    }
    
    if (action) {
        try {a
            // Delete spam messages first
            await deleteMessagesFast(channel, userId);
            
            if (timeoutDuration && !(isTicketChannel && config.ticketChannelSafeMode)) {
                // Apply timeout only outside of ticket-safe mode
                await message.member.timeout(timeoutDuration, `Anti-spam: ${action}`).catch(() => {});
                userData.timeoutExpires = now + timeoutDuration;
            }

            if (isTicketChannel && config.ticketChannelSafeMode && timeoutDuration) {
                // Convert forced timeout action to a ticket warning when safe mode is enabled
                action = 'warned in ticket channel';
                timeoutDuration = null;
                warningMessage = `⚠️ Please keep ticket conversations relevant and avoid spamming.`;
            }
            
            // Send warning in the channel (ping the user)
            const warningEmbed = new EmbedBuilder()
                .setColor(timeoutDuration ? 0xff0000 : 0xffaa00)
                .setTitle(timeoutDuration ? '⏰ Timeout Issued' : '⚠️ Warning Issued')
                .setDescription(warningMessage)
                .setTimestamp();
            
            const warningMsg = await channel.send({ embeds: [warningEmbed] }).catch(() => null);
            
            // Auto-delete warning after 10 seconds to keep chat clean
            if (warningMsg) {
                setTimeout(() => warningMsg.delete().catch(() => {}), 10000);
            }
            
            // Send log
            const logEmbed = new EmbedBuilder()
                .setColor(timeoutDuration ? 0xff0000 : 0xffaa00)
                .setTitle(timeoutDuration ? '⏰ User Timed Out' : '⚠️ User Warned')
                .setDescription(`**User:** ${message.author.tag} (${message.author.id})\n**Action:** ${action}\n**Message Count:** ${userData.messageCount}`)
                .addFields(
                    { name: 'Channel', value: `${channel}`, inline: true },
                    { name: 'Threshold', value: `Warning: ${config.warnThreshold} | 10min: ${config.timeout1Threshold} | 1d: ${config.timeout2Threshold}`, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: `Action taken automatically` });
            
            await sendLog(message.guild, config, logEmbed);
            
        } catch (error) {
            console.error('Error applying anti-spam action:', error);
        }
    }
    
    // Save updated user data
    await antinukeConfig.updateUserWarnings(guildId, userId, userData);
    
    return false;
}

module.exports = {
    handleAntiScam,
    handleAntiSpam
};