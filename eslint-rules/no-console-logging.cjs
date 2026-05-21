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

    // Only apply to src/ files
    if (!filename.includes('/src/') && !filename.includes('\\src\\')) {
      return {};
    }

    // Exempt the logger module itself (it uses console.* as output)
    if (filename.endsWith('src/utils/logger.js') || filename.endsWith('src\\utils\\logger.js')) {
      return {};
    }

    return {
      MemberExpression(node) {
        if (
          node.object.type === 'Identifier' &&
          node.object.name === 'console' &&
          node.property.type === 'Identifier' &&
          BANNED_METHODS.includes(node.property.name)
        ) {
          context.report({
            node,
            messageId: 'noConsoleLogging',
            data: { method: node.property.name },
          });
        }
      },
    };
  },
};

module.exports = noConsoleLoggingRule;

