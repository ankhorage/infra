import type { AppManifest, NavigatorSpec } from '@ankhorage/contracts';
import { promises as fs } from 'fs';
import path from 'path';

export interface ResolvedInfraProject {
  readonly appsRoot: string;
  readonly manifest: AppManifest;
  readonly manifestPath: string;
  readonly projectId: string;
  readonly projectPath: string;
  readonly workspaceRoot: string;
}

export async function resolveInfraProject(options: {
  readonly cwd: string;
  readonly projectId?: string;
}): Promise<ResolvedInfraProject> {
  const workspaceRoot = await findWorkspaceRoot(options.cwd);
  if (workspaceRoot === null) {
    throw new Error(`Could not find an Ankh workspace root from cwd: ${options.cwd}`);
  }

  const appsRoot = path.join(workspaceRoot, 'apps');
  const projectId =
    options.projectId === undefined
      ? inferProjectId(options.cwd, appsRoot)
      : validateExplicitProjectId(options.projectId);
  if (projectId === null) {
    throw new Error(
      'Could not infer a project from cwd. Pass a project id or run the command inside apps/<project>.',
    );
  }

  const projectPath = resolveProjectPath(appsRoot, projectId);
  if (!(await pathExists(projectPath))) {
    throw new Error(`Project '${projectId}' not found.`);
  }

  const manifestPath = path.join(projectPath, 'ankh.config.json');
  const manifest = await readProjectManifest({
    manifestPath,
    projectId,
    projectPath,
  });

  return {
    appsRoot,
    manifest,
    manifestPath,
    projectId,
    projectPath,
    workspaceRoot,
  };
}

function resolveProjectPath(appsRoot: string, projectId: string): string {
  const projectPath = path.resolve(appsRoot, projectId);
  const appsRootPath = `${path.resolve(appsRoot)}${path.sep}`;

  if (!projectPath.startsWith(appsRootPath)) {
    throw new Error('Security check failed while resolving the project path.');
  }

  return projectPath;
}

function createFallbackManifest(projectId: string): AppManifest {
  return {
    metadata: {
      name: projectId,
      slug: projectId,
      version: '0.0.0',
      themeId: 'default',
    },
    themes: [],
    activeThemeId: 'default',
    infra: {
      plugins: [],
    },
    navigator: {
      type: 'stack',
      routes: [{ name: 'index', screenId: 'index' }],
    },
    screens: {},
    settings: {
      localization: {
        defaultLocale: 'en',
        locales: ['en'],
      },
    },
  };
}

async function readProjectManifest(args: {
  readonly manifestPath: string;
  readonly projectId: string;
  readonly projectPath: string;
}): Promise<AppManifest> {
  if (!(await pathExists(args.manifestPath))) {
    return createFallbackManifest(args.projectId);
  }

  const rawManifest = await fs.readFile(args.manifestPath, 'utf8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawManifest);
  } catch (error) {
    throw new Error(
      `Project manifest is not valid JSON: ${args.manifestPath}: ${getErrorMessage(error)}`,
      { cause: error },
    );
  }

  if (!isAppManifest(parsed)) {
    throw new Error(`Project manifest has an invalid shape: ${args.manifestPath}`);
  }

  return parsed;
}

async function findWorkspaceRoot(startPath: string): Promise<string | null> {
  let currentPath = path.resolve(startPath);

  for (;;) {
    const appsRoot = path.join(currentPath, 'apps');
    if (await isDirectory(appsRoot)) {
      return currentPath;
    }

    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return null;
    }

    currentPath = parentPath;
  }
}

function inferProjectId(cwd: string, appsRoot: string): string | null {
  const relativePath = path.relative(path.resolve(appsRoot), path.resolve(cwd));
  if (relativePath === '' || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }

  const [projectId] = relativePath.split(path.sep);
  return projectId === undefined || projectId.length === 0 ? null : path.basename(projectId);
}

function validateExplicitProjectId(projectId: string): string {
  if (projectId.trim().length === 0) {
    throw new Error('Invalid project id: expected a single safe project segment.');
  }

  if (
    projectId === '.' ||
    projectId === '..' ||
    path.isAbsolute(projectId) ||
    projectId.includes('/') ||
    projectId.includes('\\')
  ) {
    throw new Error(`Invalid project id: ${projectId}. Expected a single safe project segment.`);
  }

  return projectId;
}

function isAppManifest(value: unknown): value is AppManifest {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isAppManifestMetadata(value.metadata) &&
    Array.isArray(value.themes) &&
    typeof value.activeThemeId === 'string' &&
    isInfraManifestRecord(value.infra) &&
    isNavigatorSpec(value.navigator) &&
    isRecord(value.screens) &&
    isSettingsRecord(value.settings)
  );
}

function isAppManifestMetadata(value: unknown): value is AppManifest['metadata'] {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.slug === 'string' &&
    typeof value.version === 'string' &&
    typeof value.themeId === 'string' &&
    (value.created === undefined || typeof value.created === 'string') &&
    (value.updated === undefined || typeof value.updated === 'string')
  );
}

function isInfraManifestRecord(value: unknown): value is AppManifest['infra'] {
  return isRecord(value) && Array.isArray(value.plugins);
}

function isNavigatorSpec(value: unknown): value is NavigatorSpec {
  return (
    isRecord(value) &&
    typeof value.type === 'string' &&
    Array.isArray(value.routes) &&
    (value.initialRouteName === undefined || typeof value.initialRouteName === 'string')
  );
}

function isSettingsRecord(value: unknown): value is AppManifest['settings'] {
  return (
    isRecord(value) &&
    (value.apiBaseUrl === undefined || typeof value.apiBaseUrl === 'string') &&
    isLocalizationRecord(value.localization)
  );
}

function isLocalizationRecord(value: unknown): value is AppManifest['settings']['localization'] {
  return (
    isRecord(value) &&
    typeof value.defaultLocale === 'string' &&
    Array.isArray(value.locales) &&
    value.locales.every((locale) => typeof locale === 'string')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
