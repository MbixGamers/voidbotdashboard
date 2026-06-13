async function init(context) {
  // Stub for future raid detection integration
}

async function scan(guild) {
  return {
    status: 'stub',
    note: 'Raid detection is prepared but not yet implemented.'
  };
}

module.exports = {
  name: 'raidDetection',
  init,
  scan
};
