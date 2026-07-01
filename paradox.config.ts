import { defineParadoxConfig } from '@ankhorage/paradox';

export default defineParadoxConfig({
  mode: 'write',

  docs: {
    title: 'INFRA',
    description: 'Executable infra provider and standalone CLI for Ankhorage project workflows.',
    usage: {
      entrypoints: ['src/readme-usage.ts'],
    },
  },

  package: {
    root: '.',
    entrypoints: ['src/index.ts'],
  },

  output: {
    dir: './paradox',
  },
});
