import { expect, test } from 'bun:test';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { syncProjectInfrastructure } from './projectInfrastructure';
import { createAppManifest } from './testSupport';

const OBSOLETE_FILES = [
  'infra/minikube/db/generated-api-resources.json',
  'infra/minikube/db/migrations/001_generated_api_resources.sql',
] as const;

test('removes obsolete generated API database artifacts tracked by the infra ledger', async () => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'infra-api-cleanup-'));

  try {
    await writeObsoleteArtifacts(projectPath);
    const manifest = createAppManifest('shop', {
      deployment: { target: 'minikube', monitoring: false },
      modules: [],
    });
    const result = await syncProjectInfrastructure({
      projectId: 'shop',
      projectPath,
      manifest,
      generateInfrastructureImpl: () => ({
        files: [],
        warnings: [],
        meta: { target: 'minikube', providers: [] },
        dependencies: [],
      }),
    });

    expect(result.removed).toBe(OBSOLETE_FILES.length);
    for (const filePath of OBSOLETE_FILES) {
      expect(await pathExists(path.join(projectPath, filePath))).toBe(false);
    }
  } finally {
    await fs.rm(projectPath, { force: true, recursive: true });
  }
});

async function writeObsoleteArtifacts(projectPath: string): Promise<void> {
  for (const filePath of OBSOLETE_FILES) {
    const absolutePath = path.join(projectPath, filePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, 'obsolete', 'utf8');
  }

  await fs.mkdir(path.join(projectPath, '.ankh'), { recursive: true });
  await fs.writeFile(
    path.join(projectPath, '.ankh/infra-ledger.json'),
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      target: 'minikube',
      files: OBSOLETE_FILES,
      warnings: [],
    }),
    'utf8',
  );
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
