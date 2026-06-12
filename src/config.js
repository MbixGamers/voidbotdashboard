// src/config.js
const dotenv = require('dotenv');
dotenv.config();

const DEFAULT_GUILD_ID = '1454879351605690522';
const DEFAULT_STAFF_ACCESS_ROLE_ID = '1454916770912534706';
const DEFAULT_TRACKED_ROLES = [
  DEFAULT_STAFF_ACCESS_ROLE_ID,
  '1478605157523787916',
  '1478604846708822087',
  '1458995834984206560'
];

function parseIdList(value, fallback = []) {
  const ids = String(value || '')
    .split(/[\n,]+/)
    .map(id => id.trim())
    .filter(Boolean);
  return ids.length ? Array.from(new Set(ids)) : fallback;
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

module.exports = {
  discordToken: required('DISCORD_TOKEN'),
  discordClientId: required('DISCORD_CLIENT_ID'),
  discordGuildId: process.env.DISCORD_GUILD_ID || DEFAULT_GUILD_ID,
  adminRoleId: process.env.ADMIN_ROLE_ID || process.env.DASHBOARD_AUTH_ROLE_ID || DEFAULT_STAFF_ACCESS_ROLE_ID,
  blacklistApproverRoleId: process.env.BLACKLIST_APPROVER_ROLE_ID || null,
  blacklistRoleId: process.env.BLACKLIST_ROLE_ID || null,
  blacklistChannelId: process.env.BLACKLIST_CHANNEL_ID || null,

  firebaseServiceAccount: process.env.FIREBASE_SERVICE_ACCOUNT,

  youtubeApiKey: process.env.YOUTUBE_API_KEY || null,
  youtubeChannelId: process.env.YOUTUBE_CHANNEL_ID || null,
  fortniteTrackerApiKey: process.env.FORTNITE_TRACKER_API_KEY || null,

  ticketChannelId: process.env.TICKET_CHANNEL_ID || null,
  staffCategoryId: process.env.STAFF_CATEGORY_ID || null,
  rosterCategoryId: process.env.ROSTER_CATEGORY_ID || null,
  trackedRoles: parseIdList(process.env.TRACKED_ROLES || process.env.DASHBOARD_AUTH_ROLE_IDS || process.env.DASHBOARD_AUTH_ROLE_ID || process.env.DASHBOARD_STAFF_ROLE_ID, DEFAULT_TRACKED_ROLES),

  // Dashboard & MongoDB
  dashboardBaseUrl: process.env.DASHBOARD_BASE_URL || null,
  dashboardApiKey: process.env.DASHBOARD_BOT_API_KEY || null,
  dashboardStaffRoleId: process.env.DASHBOARD_AUTH_ROLE_ID || process.env.DASHBOARD_STAFF_ROLE_ID || DEFAULT_STAFF_ACCESS_ROLE_ID,
  defaultGuildId: DEFAULT_GUILD_ID,
  mongoUri: process.env.MONGODB_URI || null,
};
