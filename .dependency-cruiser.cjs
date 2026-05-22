module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-frontend-to-src',
      severity: 'error',
      from: { path: '^public/js/' },
      to: { path: '^src/' },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    includeOnly: ['src', 'public/js'],
    reporterOptions: {
      archi: {
        collapsePattern: '^node_modules',
      },
    },
  },
};
