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

// Placeholder patterns that hosting platforms inject before the user fills in real values
const PLACEHOLDER_PATTERNS = [/^\/from_user\//i, /^<.+>$/, /^your[_-]/i, /^placeholder/i, /^change[_-]?me/i];

function isPlaceholder(value) {
  return PLACEHOLDER_PATTERNS.some(re => re.test(String(value || '').trim()));
}

function parseIdList(value, fallback = []) {
  const ids = String(value || '')
    .split(/[\n,]+/)
    .map(id => id.trim())
    .filter(Boolean);
  return ids.length ? Array.from(new Set(ids)) : fallback;
}

// Require an env var, rejecting missing values and hosting-platform placeholders.
// Prints a clear startup message so the user knows exactly what to fix.
function required(name) {
  const value = process.env[name];
  if (!value || isPlaceholder(value)) {
    console.error(`\n❌ Missing required environment variable: ${name}`);
    if (isPlaceholder(value)) {
      console.error(`   The current value looks like a placeholder: "${value}"`);
      console.error(`   Set it to the real value in your hosting platform's environment variables.`);
    }
    console.error(`\nRequired environment variables for the bot to start:`);
    console.error(`  DISCORD_TOKEN       — your bot token from https://discord.com/developers/applications`);
    console.error(`  (DISCORD_CLIENT_ID is auto-derived from DISCORD_TOKEN and does not need to be set separately)\n`);
    process.exit(1);
  }
  return value;
}

// Discord bot tokens encode the client (application) ID as base64 in their first segment.
// This means DISCORD_CLIENT_ID never needs to be set separately — we derive it automatically.
function clientIdFromToken(token) {
  try {
    const firstSegment = String(token || '').split('.')[0];
    if (!firstSegment) return null;
    const decoded = Buffer.from(firstSegment, 'base64').toString('utf8');
    if (/^\d{17,20}$/.test(decoded.trim())) return decoded.trim();
  } catch {}
  return null;
}

const discordToken = required('DISCORD_TOKEN');

// Prefer explicitly set DISCORD_CLIENT_ID, fall back to deriving it from the token.
const discordClientId =
  (process.env.DISCORD_CLIENT_ID && !isPlaceholder(process.env.DISCORD_CLIENT_ID))
    ? process.env.DISCORD_CLIENT_ID
    : clientIdFromToken(discordToken);

if (!discordClientId) {
  console.error('\n❌ Could not determine DISCORD_CLIENT_ID.');
  console.error('   It is normally auto-derived from DISCORD_TOKEN, but the token format was not recognised.');
  console.error('   Set DISCORD_CLIENT_ID manually in your environment variables (found in the Discord Developer Portal → your app → General Information → Application ID).\n');
  process.exit(1);
}

module.exports = {
  discordToken,
  discordClientId,
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
  trackedRoles: parseIdList(
    process.env.TRACKED_ROLES ||
    process.env.DASHBOARD_AUTH_ROLE_IDS ||
    process.env.DASHBOARD_AUTH_ROLE_ID ||
    process.env.DASHBOARD_STAFF_ROLE_ID,
    DEFAULT_TRACKED_ROLES
  ),

  dashboardBaseUrl: process.env.DASHBOARD_BASE_URL || null,
  // Accept DASHBOARD_BOT_API_KEY (preferred) or the shorter DASHBOARD_BOT_API alias
  dashboardApiKey: process.env.DASHBOARD_BOT_API_KEY || process.env.DASHBOARD_BOT_API || null,
  dashboardStaffRoleId: process.env.DASHBOARD_AUTH_ROLE_ID || process.env.DASHBOARD_STAFF_ROLE_ID || DEFAULT_STAFF_ACCESS_ROLE_ID,
  defaultGuildId: DEFAULT_GUILD_ID,
  mongoUri: process.env.MONGODB_URI || null,
};
