const { log } = require('../config');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[log.level] || LEVELS.info;

const at = (lvl) => (...args) => {
  if (LEVELS[lvl] >= threshold) {
    const line = `[${lvl.toUpperCase()}]`;
    (lvl === 'error' ? console.error : console.log)(line, ...args);
  }
};

module.exports = {
  debug: at('debug'),
  info:  at('info'),
  warn:  at('warn'),
  error: at('error'),
};
