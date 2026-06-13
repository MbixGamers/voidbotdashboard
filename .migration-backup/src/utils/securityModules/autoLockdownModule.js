async function init(context) {
  // Stub for future auto lockdown functionality
}

async function scan(guild) {
  return {
    status: 'stub',
    note: 'Auto lockdown module is available as a placeholder for future activation.'
  };
}

module.exports = {
  name: 'autoLockdown',
  init,
  scan
};
