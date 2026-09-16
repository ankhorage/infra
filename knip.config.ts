import { createKnipConfig } from '@ankhorage/devtools/knip';

export default createKnipConfig({
  ignoreDependencies: [
    '@ankhorage/cerbos',
    '@ankhorage/docker-compose',
    '@ankhorage/local',
    '@ankhorage/minikube',
    '@ankhorage/r2',
    '@ankhorage/supabase-vault',
  ],
  ignoreFiles: [
    '.prettierrc.js',
    'eslint.config.mjs',
    'eslint.local.config.mjs',
    'paradox.config.ts',
    'prettier.local.config.js',
    'src/readme-usage.ts',
  ],
});
