import { promises as fs } from 'fs';
import path from 'path';

import type { InfraStoredState } from '../../../../types/infraOrchestration.js';
import { isInfraStoredState } from '../../utils/isInfraStoredState.js';
import { resolveInfraStatePath } from '../../utils/resolveInfraStatePath.js';

/*** Persist serializable desired identity plus a secret-safe canonical ledger atomically. */
export async function writeStoredInfraStateAsync(
  projectPath: string,
  state: InfraStoredState,
): Promise<void> {
  if (!isInfraStoredState(state)) {
    throw new Error('Refusing to persist invalid or cross-scoped Infra ownership state.');
  }
  const statePath = resolveInfraStatePath(projectPath, state.ledger.environment);
  const temporaryPath = `${statePath}.tmp`;
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, statePath);
}
