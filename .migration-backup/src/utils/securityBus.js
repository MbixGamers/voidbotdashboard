const { EventEmitter } = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(50);

function emitSecurityEvent(event, payload = {}) {
  bus.emit(event, payload);
}

function onSecurityEvent(event, listener) {
  bus.on(event, listener);
}

module.exports = {
  bus,
  emitSecurityEvent,
  onSecurityEvent
};
