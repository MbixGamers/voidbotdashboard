const roleSecurityModule = require('./roleSecurityModule');
const antiRoleAbuseModule = require('./antiRoleAbuseModule');
const webhookSecurityModule = require('./webhookSecurityModule');
const antiSpamModule = require('./antiSpamModule');
const loggingEngine = require('./loggingEngine');
const raidDetectionModule = require('./raidDetectionModule');
const autoLockdownModule = require('./autoLockdownModule');
const antiNukeSystemModule = require('./antiNukeSystemModule');
const trustRiskModule = require('./trustRiskModule');

const modules = {
  roleSecurity: roleSecurityModule,
  antiRoleAbuse: antiRoleAbuseModule,
  webhookSecurity: webhookSecurityModule,
  antiSpam: antiSpamModule,
  logging: loggingEngine,
  raidDetection: raidDetectionModule,
  autoLockdown: autoLockdownModule,
  antiNukeSystem: antiNukeSystemModule,
  trustRisk: trustRiskModule
};

async function init(client, context) {
  for (const [name, module] of Object.entries(modules)) {
    if (typeof module.init === 'function') {
      await module.init({ client, name, ...context });
    }
  }
}

function getModule(name) {
  return modules[name] || null;
}

function getModuleNames() {
  return Object.keys(modules);
}

async function scan(guild, moduleName, context) {
  if (moduleName === 'all') {
    const results = {};
    for (const [name, module] of Object.entries(modules)) {
      if (typeof module.scan === 'function') {
        results[name] = await module.scan(guild, context);
      }
    }
    return results;
  }
  const module = getModule(moduleName);
  if (!module || typeof module.scan !== 'function') return null;
  return module.scan(guild, context);
}

async function handleMessage(message) {
  const module = getModule('antiSpam');
  if (module && typeof module.handleMessage === 'function') {
    return module.handleMessage(message);
  }
  return false;
}

module.exports = {
  init,
  getModule,
  getModuleNames,
  scan,
  handleMessage
};
