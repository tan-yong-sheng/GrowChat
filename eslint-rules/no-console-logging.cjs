/**
 * @fileoverview Custom ESLint rule: ban console.* in src/ (except logger.js).
 *
 * Enforces use of the structured logging system (createLogger / createRootLogger)
 * instead of raw console.log / console.warn / console.error / console.debug /
 * console.info. The only exemption is src/utils/logger.js, which legitimately
 * uses console.* as its output mechanism.
 *
 * @see docs/backend/infra/logging.md
 */

'use strict';

const BANNED_METHODS = ['log', 'warn', 'error', 'debug', 'info'];

const SRC_PATH_RE = /[\\/]src[\\/]/;
const LOGGER_PATH_RE = /src[\\/]utils[\\/]logger\.js$/;

function isExemptPath(filename) {
  return !SRC_PATH_RE.test(filename) || LOGGER_PATH_RE.test(filename);
}

function isBannedConsoleCall(node) {
  const { object, property } = node;
  return (
    object.type === 'Identifier' &&
    object.name === 'console' &&
    property.type === 'Identifier' &&
    BANNED_METHODS.includes(property.name)
  );
}

/** @type {import('eslint').Rule.RuleModule} */
const noConsoleLoggingRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow console.* calls in src/ — use structured logger instead',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      noConsoleLogging:
        'Use structured logger (createLogger / createRootLogger) instead of console.{{ method }}. ' +
        'See docs/backend/infra/logging.md for the logging architecture.',
    },
    schema: [], // no options
  },

  create(context) {
    const filename = context.filename || context.getFilename();

    if (isExemptPath(filename)) {
      return {};
    }

    return {
      MemberExpression(node) {
        if (!isBannedConsoleCall(node)) return;
        context.report({
          node,
          messageId: 'noConsoleLogging',
          data: { method: node.property.name },
        });
      },
    };
  },
};

module.exports = noConsoleLoggingRule;
