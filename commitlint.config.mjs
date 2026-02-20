/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'core',
        'cli',
        'mcp',
        'skills',
        'schema-std',
        'schema-openspec',
        'plugin-claude',
        'plugin-copilot',
        'plugin-codex',
        'root',
        'all',
      ],
    ],
    'subject-case': [2, 'always', 'lower-case'],
    'header-max-length': [2, 'always', 72],
    'body-max-line-length': [2, 'always', 100],
    'no-ai-coauthor': [2, 'always'],
  },
  plugins: [
    {
      rules: {
        'no-ai-coauthor': ({ raw }) => {
          const forbidden = ['@anthropic.com', '@openai.com']
          const coAuthorLines = raw
            .split('\n')
            .filter((line) => line.toLowerCase().startsWith('co-authored-by:'))
          const hasAiCoauthor = coAuthorLines.some((line) =>
            forbidden.some((domain) => line.toLowerCase().includes(domain.toLowerCase())),
          )
          return [!hasAiCoauthor, 'Commit must not include AI co-author trailers']
        },
      },
    },
  ],
}
