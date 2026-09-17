import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { AppEnvironmentId } from '@ankhorage/contracts/environments';

import { resolveInfraEnvironmentStateDirectory } from '../../utils/resolveInfraEnvironmentStateDirectory.js';

/*** Remove only persisted generated credential state for one explicit project environment. */
export async function removeStoredInfraCredentialsAsync(
  projectPath: string,
  environment: AppEnvironmentId,
): Promise<void> {
  const credentialDirectory = path.join(
    resolveInfraEnvironmentStateDirectory(projectPath, environment),
    'credentials',
  );
  await fs.rm(credentialDirectory, { recursive: true, force: true });
}
