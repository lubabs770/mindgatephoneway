import config from '../config';
import type { LogLevel } from './types';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[config.log.level] ?? LEVELS.info;

const at = (lvl: LogLevel) => (...args: unknown[]): void => {
  if (LEVELS[lvl] >= threshold) {
    const line = `[${lvl.toUpperCase()}]`;
    (lvl === 'error' ? console.error : console.log)(line, ...args);
  }
};

export const debug = at('debug');
export const info = at('info');
export const warn = at('warn');
export const error = at('error');

export default { debug, info, warn, error };
