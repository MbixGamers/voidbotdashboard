// src/utils/fastModStats.js
const fs = require('fs').promises;
const path = require('path');

const STATS_FILE = path.join(__dirname, '..', '..', 'stats.json');
const PROCESSED_FILE = path.join(__dirname, '..', '..', 'processedMessages.json');
const REPLIES_CACHE_FILE = path.join(__dirname, '..', '..', 'ticket-replies.json');

// In-memory cache - instant access
let statsCache = {
    ticketCounts: {},
    messageCounts: {},
    lastUpdated: 0
};

let repliesCache = new Map();
let processedMessages = new Set();

// Load all data into memory at startup
async function loadStats() {
    try {
        const data = await fs.readFile(STATS_FILE, 'utf8');
        const parsed = JSON.parse(data);
        statsCache.ticketCounts = parsed.ticketCounts || {};
        statsCache.messageCounts = parsed.messageCounts || {};
        statsCache.lastUpdated = Date.now();
    } catch (err) {
        if (err.code !== 'ENOENT') console.error('❌ Error loading stats:', err);
        statsCache.ticketCounts = {};
        statsCache.messageCounts = {};
    }
}

async function loadProcessedMessages() {
    try {
        const data = await fs.readFile(PROCESSED_FILE, 'utf8');
        processedMessages = new Set(JSON.parse(data));
    } catch (err) {
        if (err.code !== 'ENOENT') console.error('❌ Error loading processed messages:', err);
        processedMessages = new Set();
    }
}

async function loadRepliesCache() {
    try {
        const data = await fs.readFile(REPLIES_CACHE_FILE, 'utf8');
        const parsed = JSON.parse(data);
        repliesCache.clear();
        for (const [channelId, repliers] of Object.entries(parsed)) {
            repliesCache.set(channelId, new Set(repliers));
        }
    } catch (err) {
        if (err.code !== 'ENOENT') console.error('❌ Error loading replies cache:', err);
        repliesCache.clear();
    }
}

// Initialize all caches
async function initFastModStats() {
    await Promise.all([
        loadStats(),
        loadProcessedMessages(),
        loadRepliesCache()
    ]);
    console.log('⚡ Fast ModStats initialized with', Object.keys(statsCache.ticketCounts).length, 'users');
}

// Fast getters (O(1) time)
function getTicketCount(userId) {
    return statsCache.ticketCounts[userId] || 0;
}

function getMessageCount(userId) {
    return statsCache.messageCounts[userId] || 0;
}

function getAllStats() {
    return {
        tickets: { ...statsCache.ticketCounts },
        messages: { ...statsCache.messageCounts }
    };
}

function getRepliesForChannel(channelId) {
    return repliesCache.get(channelId) || new Set();
}

function hasStaffReplied(channelId) {
    const repliers = repliesCache.get(channelId);
    return repliers && repliers.size > 0;
}

// Update functions (called by event handlers)
function incrementTicketCount(userId) {
    statsCache.ticketCounts[userId] = (statsCache.ticketCounts[userId] || 0) + 1;
    return statsCache.ticketCounts[userId];
}

function incrementMessageCount(userId) {
    statsCache.messageCounts[userId] = (statsCache.messageCounts[userId] || 0) + 1;
    return statsCache.messageCounts[userId];
}

function addStaffReply(channelId, userId) {
    if (!repliesCache.has(channelId)) {
        repliesCache.set(channelId, new Set());
    }
    repliesCache.get(channelId).add(userId);
}

// Export for use in other modules
module.exports = {
    initFastModStats,
    getTicketCount,
    getMessageCount,
    getAllStats,
    getRepliesForChannel,
    hasStaffReplied,
    incrementTicketCount,
    incrementMessageCount,
    addStaffReply
};