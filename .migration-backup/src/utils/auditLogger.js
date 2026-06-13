// src/utils/auditLogger.js
const { EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

const AUDIT_LOG_FILE = path.join(__dirname, '..', '..', 'auditLog.json');
const WRITE_DEBOUNCE_MS = 5000;

let auditCache = [];
let writePending = false;
let writeTimer = null;

async function loadAuditLog() {
    try {
        const data = await fs.readFile(AUDIT_LOG_FILE, 'utf8');
        auditCache = JSON.parse(data);
    } catch (err) {
        if (err.code !== 'ENOENT') console.error('❌ Error loading audit log:', err);
        auditCache = [];
    }
}

async function scheduleWrite() {
    if (writePending) return;
    writePending = true;
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(async () => {
        try {
            await fs.writeFile(AUDIT_LOG_FILE, JSON.stringify(auditCache.slice(-1000), null, 2), 'utf8');
        } catch (err) {
            console.error('❌ Error saving audit log:', err);
        } finally {
            writePending = false;
            writeTimer = null;
        }
    }, WRITE_DEBOUNCE_MS);
}

async function logAction(guildId, action, data) {
    const logEntry = {
        guildId,
        action,
        timestamp: Date.now(),
        ...data
    };
    
    auditCache.push(logEntry);
    if (auditCache.length > 1000) auditCache.shift(); // Keep last 1000 entries
    
    await scheduleWrite();
}

async function getRecentActions(guildId, action, seconds = 60) {
    const cutoff = Date.now() - (seconds * 1000);
    return auditCache.filter(entry => 
        entry.guildId === guildId && 
        entry.action === action && 
        entry.timestamp > cutoff
    );
}

async function sendAuditLog(guild, config, embed) {
    if (!config.enabled || !config.logChannelId) return;
    
    const logChannel = guild.channels.cache.get(config.logChannelId);
    if (logChannel) {
        await logChannel.send({ embeds: [embed] }).catch(() => {});
    }
}

// Initialize
loadAuditLog().catch(console.error);

module.exports = {
    logAction,
    getRecentActions,
    sendAuditLog
};