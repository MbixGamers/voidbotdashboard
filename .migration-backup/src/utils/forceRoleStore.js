const fs = require('fs').promises;
const path = require('path');

const STORE_FILE = path.join(__dirname, '..', '..', 'fgive-ids.json');

async function loadStore() {
  try {
    const raw = await fs.readFile(STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw);

    return {
      fgive: Array.isArray(parsed.fgive) ? parsed.fgive : [],
      fremove: Array.isArray(parsed.fremove) ? parsed.fremove : []
    };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { fgive: [], fremove: [] };
    }
    throw err;
  }
}

async function saveStore(config) {
  await fs.writeFile(
    STORE_FILE,
    JSON.stringify({ fgive: config.fgive || [], fremove: config.fremove || [] }, null, 2),
    'utf8'
  );
}

function normalizeId(id) {
  return String(id);
}

async function isAllowed(command, userId) {
  const config = await loadStore();
  const list = Array.isArray(config[command]) ? config[command] : [];
  return list.includes(normalizeId(userId));
}

async function addAllowedUser(command, userId) {
  const config = await loadStore();
  const list = Array.isArray(config[command]) ? config[command] : [];
  const normalizedId = normalizeId(userId);

  if (list.includes(normalizedId)) {
    return false;
  }

  list.push(normalizedId);
  config[command] = list;
  await saveStore(config);
  return true;
}

async function removeAllowedUser(command, userId) {
  const config = await loadStore();
  const list = Array.isArray(config[command]) ? config[command] : [];
  const normalizedId = normalizeId(userId);
  config[command] = list.filter(id => id !== normalizedId);
  await saveStore(config);
  return true;
}

module.exports = {
  isFgiveAllowed: (userId) => isAllowed('fgive', userId),
  isFremoveAllowed: (userId) => isAllowed('fremove', userId),
  addAllowedUser,
  removeAllowedUser,
  loadStore
};
