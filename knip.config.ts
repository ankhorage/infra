import { createKnipConfig } from '@ankhorage/devtools/knip';

export default createKnipConfig({
  entry: ['examples/basic-usage/main.ts'],
  ignoreDependencies: [
    '@ankhorage/infra-cerbos',
    '@ankhorage/infra-docker-compose',
    '@ankhorage/infra-minikube',
    '@ankhorage/supabase-vault',
  ],
  ignoreFiles: [
    '.prettierrc.js',
    'eslint.config.mjs',
    'eslint.local.config.mjs',
    'paradox.config.ts',
    'prettier.local.config.js',
  ],
});
