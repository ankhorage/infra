import type { AppManifest } from '@ankhorage/contracts';

export interface InfraArtifactWriteResult {
  readonly written: number;
  readonly removed: number;
}

export interface ResolvedInfraProject {
  readonly appsRoot: string;
  readonly manifest: AppManifest;
  readonly manifestPath: string;
  readonly projectId: string;
  readonly projectPath: string;
  readonly workspaceRoot: string;
}
