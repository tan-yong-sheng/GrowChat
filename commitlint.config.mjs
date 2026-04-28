export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat', // new feature
        'fix', // bug fix
        'docs', // documentation
        'style', // formatting
        'refactor', // code change without feat/fix
        'perf', // performance
        'test', // tests
        'build', // build
        'ci', // CI
        'chore', // maintenance
        'revert', // revert
      ],
    ],
    'subject-max-length': [2, 'always', 100],
  },
};
