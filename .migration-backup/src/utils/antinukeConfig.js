// src/utils/antinukeConfig.js
const fs = require('fs').promises;
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', '..', 'antinukeConfig.json');
const WARNINGS_FILE = path.join(__dirname, '..', '..', 'antinukeWarnings.json');
const WRITE_DEBOUNCE_MS = 5000;

let configCache = {};
let warningsCache = {};
let writePending = false;
let warningsWritePending = false;
let writeTimer = null;
let warningsTimer = null;

const DEFAULT_CONFIG = {
    enabled: false,
    logChannelId: null,
    antiScamEnabled: true,
    antiSpamEnabled: true,
    antiInviteEnabled: true,
    antiMentionEnabled: true,
    antiNewAccountEnabled: false,
    minAccountAgeMinutes: 10,
    ticketChannelSafeMode: true,
    warnThreshold: 5,
    timeout1Threshold: 10,
    timeout2Threshold: 15,
    resetSeconds: 10
};

async function load() {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf8');
        configCache = JSON.parse(data);
    } catch (err) {
        if (err.code !== 'ENOENT') console.error('❌ Error loading antinuke config:', err);
        configCache = {};
    }
    
    try {
        const data = await fs.readFile(WARNINGS_FILE, 'utf8');
        warningsCache = JSON.parse(data);
    } catch (err) {
        if (err.code !== 'ENOENT') console.error('❌ Error loading antinuke warnings:', err);
        warningsCache = {};
    }
}

async function scheduleWrite() {
    if (writePending) return;
    writePending = true;
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(async () => {
        try {
            await fs.writeFile(CONFIG_FILE, JSON.stringify(configCache, null, 2), 'utf8');
        } catch (err) {
            console.error('❌ Error saving antinuke config:', err);
        } finally {
            writePending = false;
            writeTimer = null;
        }
    }, WRITE_DEBOUNCE_MS);
}

async function scheduleWarningsWrite() {
    if (warningsWritePending) return;
    warningsWritePending = true;
    if (warningsTimer) clearTimeout(warningsTimer);
    warningsTimer = setTimeout(async () => {
        try {
            await fs.writeFile(WARNINGS_FILE, JSON.stringify(warningsCache, null, 2), 'utf8');
        } catch (err) {
            console.error('❌ Error saving antinuke warnings:', err);
        } finally {
            warningsWritePending = false;
            warningsTimer = null;
        }
    }, WRITE_DEBOUNCE_MS);
}

async function get(guildId) {
    const config = configCache[guildId];
    if (config) return { ...DEFAULT_CONFIG, ...config };
    return { ...DEFAULT_CONFIG };
}

async function update(guildId, partial) {
    const current = await get(guildId);
    configCache[guildId] = { ...current, ...partial };
    await scheduleWrite();
}

async function getUserWarnings(guildId, userId) {
    const key = `${guildId}-${userId}`;
    return warningsCache[key] || {
        messageCount: 0,
        lastMessageTime: 0,
        currentTimeoutLevel: 0, // 0 = none, 1 = warned, 2 = 10min timeout, 3 = 1 day timeout
        timeoutExpires: 0,
        hasBeenWarned: false // Track if warning has been issued at current level
    };
}

async function updateUserWarnings(guildId, userId, data) {
    const key = `${guildId}-${userId}`;
    warningsCache[key] = data;
    await scheduleWarningsWrite();
}

async function resetUserWarnings(guildId, userId) {
    const key = `${guildId}-${userId}`;
    delete warningsCache[key];
    await scheduleWarningsWrite();
}

// Initialize on load
load().catch(console.error);

module.exports = {
    get,
    update,
    getUserWarnings,
    updateUserWarnings,
    resetUserWarnings
};