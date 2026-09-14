import { APP_ENVIRONMENT_IDS, type AppEnvironmentId } from '@ankhorage/contracts/environments';
import path from 'path';

const INFRA_STATE_ROOT = '.ankh/infra';

/*** Build an exact state-file path from a closed canonical environment identifier. */
export function resolveInfraStatePath(projectPath: string, environment: AppEnvironmentId): string {
  if (!APP_ENVIRONMENT_IDS.includes(environment)) {
    throw new Error(`Invalid Infra state environment: ${environment}`);
  }
  return path.join(projectPath, INFRA_STATE_ROOT, environment, 'state.json');
}
