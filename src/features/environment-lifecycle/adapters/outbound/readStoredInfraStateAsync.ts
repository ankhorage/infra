import type { AppEnvironmentId } from '@ankhorage/contracts/environments';
import { promises as fs } from 'fs';

import type { InfraStoredState } from '../../../../types/infraOrchestration.js';
import { isInfraStoredState } from '../../utils/isInfraStoredState.js';
import { resolveInfraStatePath } from '../../utils/resolveInfraStatePath.js';

/*** Read exact environment state; malformed ownership state fails closed rather than disappearing. */
export async function readStoredInfraStateAsync(
  projectPath: string,
  environment: AppEnvironmentId,
): Promise<InfraStoredState | null> {
  const statePath = resolveInfraStatePath(projectPath, environment);
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(statePath, 'utf8'));
    if (!isInfraStoredState(parsed)) {
      throw new Error(`Stored Infra state has an invalid shape: ${statePath}`);
    }
    return parsed;
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

/*** Recognize only the filesystem's absent-file failure. */
function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

/*** Narrow filesystem error values. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}
