import type { AppEnvironmentId } from '@ankhorage/contracts/environments';
import path from 'path';

import { resolveInfraEnvironmentStateDirectory } from './resolveInfraEnvironmentStateDirectory.js';

/*** Build an exact state-file path from a closed canonical environment identifier. */
export function resolveInfraStatePath(projectPath: string, environment: AppEnvironmentId): string {
  return path.join(resolveInfraEnvironmentStateDirectory(projectPath, environment), 'state.json');
}
