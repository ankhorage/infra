import type { InfraGeneratedArtifact, InfraLedger } from '@ankhorage/contracts/infra';
import { promises as fs } from 'fs';
import path from 'path';

import type { InfraArtifactWriteResult } from '../../../../types/infraProject.js';
import { resolveProjectFile } from '../../utils/resolveProjectFile.js';

/*** Write validated generated artifacts and remove only stale paths from the prior ledger. */
export async function writeInfraGeneratedArtifactsAsync(
  projectPath: string,
  artifacts: readonly InfraGeneratedArtifact[],
  previous: InfraLedger | undefined,
): Promise<InfraArtifactWriteResult> {
  const nextPaths = new Set<string>();
  const validated = artifacts.map((artifact) => {
    if (nextPaths.has(artifact.path)) {
      throw new Error(`Duplicate generated Infra artifact path: ${artifact.path}`);
    }
    nextPaths.add(artifact.path);
    return { artifact, outputPath: resolveProjectFile(projectPath, artifact.path) };
  });
  for (const { artifact, outputPath } of validated) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, artifact.content, 'utf8');
    if (artifact.executable === true) await fs.chmod(outputPath, 0o755);
  }
  const stalePaths = (previous?.artifacts ?? [])
    .map(({ path: artifactPath }) => artifactPath)
    .filter((artifactPath) => !nextPaths.has(artifactPath));
  for (const stalePath of stalePaths) {
    await fs.rm(resolveProjectFile(projectPath, stalePath), { force: true });
  }
  return { written: validated.length, removed: stalePaths.length };
}
