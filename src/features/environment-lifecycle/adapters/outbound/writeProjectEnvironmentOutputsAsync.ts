import { pathExists } from '@ankhorage/utility/node/fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { AppEnvironmentId } from '@ankhorage/contracts/environments';
import type { InfraOutput } from '@ankhorage/contracts/infra';

const ENVIRONMENT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const ENVIRONMENT_ASSIGNMENT_PATTERN = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/u;

/*** Materialize public local Infra outputs into the project app environment while preserving unrelated entries. */
export async function writeProjectEnvironmentOutputsAsync(
  projectPath: string,
  environment: AppEnvironmentId,
  outputs: readonly InfraOutput[],
): Promise<void> {
  if (environment !== 'local') return;

  const values = collectEnvironmentValues(outputs);
  if (values.size === 0) return;

  const environmentPath = path.join(projectPath, '.env.local');
  const current = (await pathExists(environmentPath))
    ? await fs.readFile(environmentPath, 'utf8')
    : '';
  const next = mergeEnvironmentFile(current, values);
  if (next === current) return;

  await fs.mkdir(projectPath, { recursive: true });
  await fs.writeFile(environmentPath, next, 'utf8');
}

/*** Collect only browser-safe public outputs that explicitly declare an environment variable. */
function collectEnvironmentValues(outputs: readonly InfraOutput[]): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const output of outputs) {
    if (output.visibility !== 'public' || output.environmentVariable === undefined) continue;
    if (!ENVIRONMENT_NAME_PATTERN.test(output.environmentVariable)) {
      throw new Error(`Invalid Infra environment variable name: ${output.environmentVariable}`);
    }
    values.set(output.environmentVariable, String(output.value));
  }
  return values;
}

/*** Merge managed environment values without changing unrelated lines or retaining duplicate managed keys. */
function mergeEnvironmentFile(
  current: string,
  values: ReadonlyMap<string, string>,
): string {
  const normalized = current.replaceAll('\r\n', '\n');
  const lines = normalized.length === 0 ? [] : normalized.split('\n');
  if (lines.at(-1) === '') lines.pop();

  const written = new Set<string>();
  const nextLines: string[] = [];
  for (const line of lines) {
    const name = readEnvironmentAssignmentName(line);
    if (name !== undefined && values.has(name)) {
      if (!written.has(name)) {
        nextLines.push(`${name}=${serializeEnvironmentValue(values.get(name) ?? '')}`);
        written.add(name);
      }
      continue;
    }
    nextLines.push(line);
  }

  for (const [name, value] of [...values.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (written.has(name)) continue;
    nextLines.push(`${name}=${serializeEnvironmentValue(value)}`);
  }

  return nextLines.length === 0 ? '' : `${nextLines.join('\n')}\n`;
}

/*** Read an environment assignment name without interpreting or mutating its value. */
function readEnvironmentAssignmentName(line: string): string | undefined {
  return ENVIRONMENT_ASSIGNMENT_PATTERN.exec(line)?.[1];
}

/*** Serialize one primitive Infra output as a quoted dotenv value. */
function serializeEnvironmentValue(value: string): string {
  return JSON.stringify(value);
}
