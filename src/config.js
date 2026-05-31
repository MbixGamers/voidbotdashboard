// src/config.js
const dotenv = require('dotenv');
dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

module.exports = {
  discordToken: required('DISCORD_TOKEN'),
  discordClientId: required('DISCORD_CLIENT_ID'),
  discordGuildId: process.env.DISCORD_GUILD_ID || null,
  adminRoleId: '1508119141553406012',
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
  trackedRoles: process.env.TRACKED_ROLES ? process.env.TRACKED_ROLES.split(',').map(id => id.trim()) : [],

  // Dashboard & MongoDB
  dashboardBaseUrl: process.env.DASHBOARD_BASE_URL || null,
  dashboardApiKey: process.env.DASHBOARD_BOT_API_KEY || null,
  dashboardStaffRoleId: process.env.DASHBOARD_AUTH_ROLE_ID || process.env.DASHBOARD_STAFF_ROLE_ID || '1444524137526853723',
  mongoUri: process.env.MONGODB_URI || null,
};
