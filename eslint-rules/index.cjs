/**
 * @fileoverview ESLint plugin: growchat-logging
 *
 * Provides the `no-console-logging` rule that bans raw console.* calls
 * in src/ files, enforcing use of the structured logging system.
 */

'use strict';

const noConsoleLoggingRule = require('./no-console-logging.cjs');

module.exports = {
  rules: {
    'no-console-logging': noConsoleLoggingRule,
  },
};
