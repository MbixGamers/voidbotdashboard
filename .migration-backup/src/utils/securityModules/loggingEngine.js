const { CATEGORY_NAMES } = require('../../utils/logManager');

async function init(context) {
  const { bus } = context;
  if (!bus) return;

  bus.onSecurityEvent('security.log', ({ guild, category, options }) => {
    if (!guild || !category) return;
    context.logger.log(guild, category, options).catch(() => {});
  });
}

async function scan(guild) {
  return {
    status: 'ready',
    supportedCategories: Object.entries(CATEGORY_NAMES).map(([key, name]) => ({ key, name }))
  };
}

module.exports = {
  name: 'logging',
  init,
  scan
};
