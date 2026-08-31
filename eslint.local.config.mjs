import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createConfig } from '@ankhorage/devtools/eslint';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INFRA_FILES = ['examples/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'];

function legacyRuleExceptions(rule, files) {
  return { files, rules: { [rule]: 'off' } };
}

export default [
  ...createConfig({
    tsconfigRootDir: __dirname,
    project: ['./tsconfig.eslint.json'],
    files: INFRA_FILES,
  }),
  {
    files: INFRA_FILES,
    rules: {
      complexity: ['error', { max: 100 }],
      'max-lines': ['error', { max: 5000, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 1000, skipBlankLines: true, skipComments: true }],
    },
  },
  legacyRuleExceptions('security/detect-object-injection', [
    'src/adapters/minikube/base/twoAppIsolation.integration.test.ts',
    'src/projectDatabase.ts',
    'src/projectEnvironment.ts',
  ]),
];
