import type { AppManifest } from '@ankhorage/contracts';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import type { InfraCommandContext } from './commandContext.js';

export interface CapturedCommandContext {
  readonly context: InfraCommandContext;
  readonly stderr: { value: string };
  readonly stdout: { value: string };
}

export function createCapturedCommandContext(
  cwd: string,
  version = '0.2.1',
): CapturedCommandContext {
  const stdout = { value: '' };
  const stderr = { value: '' };

  return {
    stdout,
    stderr,
    context: {
      cwd,
      env: process.env,
      version,
      writeStdout(text: string) {
        stdout.value += text;
      },
      writeStderr(text: string) {
        stderr.value += text;
      },
    },
  };
}

export async function createWorkspaceFixture(
  args: {
    readonly manifest?: AppManifest;
    readonly manifestFile?: 'invalid-json' | 'missing';
    readonly projectId?: string;
  } = {},
): Promise<{
  readonly appsRoot: string;
  readonly projectId: string;
  readonly projectPath: string;
  readonly rootPath: string;
}> {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ankhorage-infra-'));
  const appsRoot = path.join(rootPath, 'apps');
  const projectId = args.projectId ?? 'shop';
  const projectPath = path.join(appsRoot, projectId);

  await fs.mkdir(projectPath, { recursive: true });
  await fs.writeFile(
    path.join(projectPath, 'package.json'),
    JSON.stringify({ name: projectId, version: '1.0.0' }, null, 2),
    'utf8',
  );

  if (args.manifestFile === 'invalid-json') {
    await fs.writeFile(path.join(projectPath, 'ankh.config.json'), '{invalid', 'utf8');
  } else if (args.manifestFile !== 'missing') {
    await fs.writeFile(
      path.join(projectPath, 'ankh.config.json'),
      `${JSON.stringify(args.manifest ?? createAppManifest(projectId), null, 2)}\n`,
      'utf8',
    );
  }

  return {
    appsRoot,
    projectId,
    projectPath,
    rootPath,
  };
}

export function createAppManifest(
  projectId: string,
  infra: AppManifest['infra'] = { plugins: [] },
): AppManifest {
  return {
    metadata: {
      name: projectId,
      slug: projectId,
      version: '1.0.0',
      themeId: 'default',
    },
    themes: [],
    activeThemeId: 'default',
    infra,
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
      authFlow: {
        signInRoute: '/sign-in',
        signOutRoute: '/sign-out',
        postSignInRoute: '/',
        unauthorizedRoute: '/sign-in',
      },
    },
  };
}
