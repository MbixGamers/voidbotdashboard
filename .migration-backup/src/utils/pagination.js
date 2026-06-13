const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const MAX_CUSTOM_ID_LENGTH = 100;
const PREFIX = 'pag:';

function encodeExtra(str) {
  if (!str || str.length === 0) return '';
  return String(str)
    .slice(0, 30)
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_');
}

function decodeExtra(str) {
  return str ? String(str).replace(/_/g, ' ') : '';
}

/**
 * Build a pagination row with Previous/Next buttons.
 * @param {string} cmd - Command identifier (e.g., 'pros_list')
 * @param {number} page - Current page (0‑based)
 * @param {number} totalPages - Total number of pages
 * @param {string} [extra=''] - Optional extra data (e.g., filter)
 * @returns {ActionRowBuilder|null}
 */
function buildPaginationRow(cmd, page, totalPages, extra = '') {
  if (totalPages <= 1) return null;

  const extraEnc = encodeExtra(extra);

  const basePrev = `${PREFIX}${cmd}:${page - 1}:${extraEnc}`;
  const baseNext = `${PREFIX}${cmd}:${page + 1}:${extraEnc}`;

  const prevId = basePrev.length > MAX_CUSTOM_ID_LENGTH
    ? basePrev.substring(0, MAX_CUSTOM_ID_LENGTH)
    : basePrev;

  const nextId = baseNext.length > MAX_CUSTOM_ID_LENGTH
    ? baseNext.substring(0, MAX_CUSTOM_ID_LENGTH)
    : baseNext;

  const row = new ActionRowBuilder();
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(prevId)
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(nextId)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1)
  );
  return row;
}

/**
 * Parse a pagination custom ID.
 * @param {string} customId
 * @returns {{ cmd: string, page: number, extra: string } | null}
 */
function parsePaginationCustomId(customId) {
  if (!customId || !customId.startsWith(PREFIX)) return null;

  const withoutPrefix = customId.slice(PREFIX.length);
  const parts = withoutPrefix.split(':');

  if (parts.length < 2) return null;

  const cmd = parts[0];
  const page = parseInt(parts[1], 10);
  const extra = parts.length > 2 ? decodeExtra(parts.slice(2).join(':')) : '';

  if (isNaN(page)) return null;

  return { cmd, page, extra };
}

module.exports = {
  buildPaginationRow,
  parsePaginationCustomId,
  PREFIX,
  encodeExtra,
  decodeExtra
};