import type { AppEnvironmentId } from '@ankhorage/contracts/environments';
import { promises as fs } from 'fs';

import { resolveInfraStatePath } from '../../utils/resolveInfraStatePath.js';

/*** Remove only the exact selected environment state after a complete destroy. */
export async function removeStoredInfraStateAsync(
  projectPath: string,
  environment: AppEnvironmentId,
): Promise<void> {
  await fs.rm(resolveInfraStatePath(projectPath, environment), { force: true });
}
