import { promises as fs } from 'fs';
import path from 'path';

export async function readProjectInfrastructureEnvironment(args: {
  readonly keys: readonly string[];
  readonly projectPath: string;
  readonly target: string;
}): Promise<Readonly<Record<string, string>>> {
  const infraRoot = path.join(args.projectPath, 'infra', args.target);
  const envPath = path.join(infraRoot, '.env');
  const fallbackPath = path.join(infraRoot, '.env.example');
  const sourcePath = (await pathExists(envPath)) ? envPath : fallbackPath;
  const environment = await readEnvironmentFile(sourcePath);
  const selected: Record<string, string> = {};

  for (const key of new Set(args.keys)) {
    const value = environment.get(key);
    if (value !== undefined) selected[key] = value;
  }

  return selected;
}

async function readEnvironmentFile(filePath: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const content = await fs.readFile(filePath, 'utf8');

  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    out.set(key, value);
  }

  return out;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
