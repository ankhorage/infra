import type { AppEnvironmentId } from '@ankhorage/contracts/environments';
import { APP_ENVIRONMENT_IDS } from '@ankhorage/contracts/environments';
import path from 'path';

/*** Build the canonical project-local state directory for one closed Infra environment. */
export function resolveInfraEnvironmentStateDirectory(
  projectPath: string,
  environment: AppEnvironmentId,
): string {
  if (!APP_ENVIRONMENT_IDS.includes(environment)) {
    throw new Error(`Invalid Infra state environment: ${environment}`);
  }
  return path.join(projectPath, INFRA_STATE_ROOT, environment);
}

const INFRA_STATE_ROOT = '.ankh/infra';
