import type { AppManifest } from '@ankhorage/contracts';
import { promises as fs } from 'fs';
import path from 'path';

import { generateInfrastructure } from './index.js';
import { validateInfraSupport } from './infraValidation.js';

const INFRA_LEDGER_RELATIVE_PATH = '.ankh/infra-ledger.json';
const STUDIO_PROJECT_ID = 'studio';

interface InfraLedger {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly target: string;
  readonly files: readonly string[];
  readonly warnings: readonly string[];
}

export interface InfraSyncResult {
  readonly generated: number;
  readonly removed: number;
  readonly warnings: readonly string[];
  readonly skipped?: {
    readonly reason: string;
  };
}

export async function syncProjectInfrastructure(args: {
  readonly generateInfrastructureImpl?: typeof generateInfrastructure;
  readonly manifest: AppManifest;
  readonly projectId: string;
  readonly projectPath: string;
}): Promise<InfraSyncResult> {
  const supportWarnings = validateInfraSupport(args.manifest.infra);

  if (args.projectId === STUDIO_PROJECT_ID) {
    return {
      generated: 0,
      removed: 0,
      warnings: supportWarnings,
      skipped: {
        reason: 'apps/studio is the dashboard and is not a generated app target.',
      },
    };
  }

  const previousLedger = await readInfraLedger(args.projectPath);
  const previousFiles = new Set(previousLedger?.files ?? []);

  if (args.manifest.infra.deployment === undefined) {
    const removed = await removeFiles(args.projectPath, previousFiles);
    await removeInfraLedger(args.projectPath);
    return {
      generated: 0,
      removed,
      warnings: supportWarnings,
    };
  }

  const generated = (args.generateInfrastructureImpl ?? generateInfrastructure)(
    args.manifest.infra,
    {
      namespaceHint: args.projectId,
      appManifest: args.manifest,
    },
  );
  const combinedWarnings = uniqueStrings([...supportWarnings, ...generated.warnings]);
  const nextFiles = new Set<string>();

  for (const file of generated.files) {
    const outputPath = resolveProjectFile(args.projectPath, file.path);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, file.content, 'utf8');

    if (file.executable === true) {
      await fs.chmod(outputPath, 0o755);
    }

    nextFiles.add(file.path);
  }

  const staleFiles = new Set([...previousFiles].filter((filePath) => !nextFiles.has(filePath)));
  const removed = await removeFiles(args.projectPath, staleFiles);

  await writeInfraLedger(args.projectPath, {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: generated.meta.target,
    files: [...nextFiles].sort(),
    warnings: combinedWarnings,
  });

  return {
    generated: generated.files.length,
    removed,
    warnings: combinedWarnings,
  };
}

export async function resolveProjectInfrastructureTarget(args: {
  readonly manifest: AppManifest;
  readonly projectPath: string;
}): Promise<string | null> {
  const manifestTarget = args.manifest.infra.deployment?.target;
  if (manifestTarget !== undefined) {
    return manifestTarget;
  }

  const ledger = await readInfraLedger(args.projectPath);
  return ledger?.target ?? null;
}

export function resolveProjectFile(projectPath: string, filePath: string): string {
  const rootPath = path.resolve(projectPath);
  const resolvedPath = path.resolve(rootPath, filePath);
  const relativePath = path.relative(rootPath, resolvedPath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Invalid infra output path outside project root: ${filePath}`);
  }

  return resolvedPath;
}

async function readInfraLedger(projectPath: string): Promise<InfraLedger | null> {
  const ledgerPath = path.join(projectPath, INFRA_LEDGER_RELATIVE_PATH);

  try {
    const rawLedger = await fs.readFile(ledgerPath, 'utf8');
    const parsedLedger: unknown = JSON.parse(rawLedger);
    return isInfraLedger(parsedLedger) ? parsedLedger : null;
  } catch {
    return null;
  }
}

async function writeInfraLedger(projectPath: string, ledger: InfraLedger): Promise<void> {
  const ledgerPath = path.join(projectPath, INFRA_LEDGER_RELATIVE_PATH);
  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
  await fs.writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
}

async function removeInfraLedger(projectPath: string): Promise<void> {
  await fs.rm(path.join(projectPath, INFRA_LEDGER_RELATIVE_PATH), { force: true });
}

async function removeFiles(projectPath: string, files: ReadonlySet<string>): Promise<number> {
  let removedFiles = 0;

  for (const filePath of files) {
    await fs.rm(resolveProjectFile(projectPath, filePath), { force: true });
    removedFiles += 1;
  }

  return removedFiles;
}

function isInfraLedger(value: unknown): value is InfraLedger {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    typeof value.generatedAt === 'string' &&
    typeof value.target === 'string' &&
    Array.isArray(value.files) &&
    value.files.every((filePath) => typeof filePath === 'string') &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning) => typeof warning === 'string')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
