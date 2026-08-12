import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

import type { InfraCommandContext } from './commandContext.js';

export type InfraLifecycleScript = 'destroy' | 'down' | 'port-forward' | 'reset' | 'status' | 'up';

export interface InfraScriptOutput {
  readonly stderr: string;
  readonly stdout: string;
}

export interface InfraPortForwardInfo {
  readonly localPort: number;
  readonly url: string;
}

export class InfraScriptExecutionError extends Error {
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly stdout: string;

  constructor(args: {
    readonly exitCode: number | null;
    readonly message: string;
    readonly stderr: string;
    readonly stdout: string;
  }) {
    super(args.message);
    this.name = 'InfraScriptExecutionError';
    this.exitCode = args.exitCode;
    this.stderr = args.stderr;
    this.stdout = args.stdout;
  }
}

export async function runProjectInfrastructureLifecycle(args: {
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly onStderr?: (chunk: string) => void;
  readonly onStdout?: (chunk: string) => void;
  readonly projectId: string;
  readonly projectPath: string;
  readonly script: InfraLifecycleScript;
  readonly target: string;
}): Promise<InfraScriptOutput> {
  const scriptPath = resolveProjectInfraScriptPath(args);
  if (!(await pathExists(scriptPath))) {
    throw new Error(
      `Infra script not found: ${scriptPath}. Regenerate infrastructure for project '${args.projectId}' first.`,
    );
  }

  return runShellScript({
    args: args.args ?? [],
    env: args.env ?? process.env,
    onStderr: args.onStderr,
    onStdout: args.onStdout,
    scriptPath,
  });
}

export async function resolveProjectInfrastructurePortForward(args: {
  readonly projectPath: string;
  readonly target: string;
}): Promise<InfraPortForwardInfo> {
  const infraRoot = path.join(args.projectPath, 'infra', args.target);
  const envPath = path.join(infraRoot, '.env');
  const fallbackEnvPath = path.join(infraRoot, '.env.example');
  const sourcePath = (await pathExists(envPath)) ? envPath : fallbackEnvPath;
  const env = await readSimpleEnvMap(sourcePath);
  const localPort = parsePositivePort(env.get('APP_PORT_FORWARD_LOCAL_PORT'));

  if (localPort === null) {
    throw new Error(
      `Generated Infra did not provide a valid APP_PORT_FORWARD_LOCAL_PORT in ${sourcePath}. Regenerate infrastructure first.`,
    );
  }

  return {
    localPort,
    url: `http://127.0.0.1:${localPort}`,
  };
}

export async function runProjectInfraScript(args: {
  readonly context: InfraCommandContext;
  readonly projectId: string;
  readonly projectPath: string;
  readonly script: InfraLifecycleScript;
  readonly target: string;
}): Promise<void> {
  await runProjectInfrastructureLifecycle({
    env: args.context.env,
    onStderr: args.context.writeStderr,
    onStdout: args.context.writeStdout,
    projectId: args.projectId,
    projectPath: args.projectPath,
    script: args.script,
    target: args.target,
  });
}

export function resolveProjectInfraScriptPath(args: {
  readonly projectPath: string;
  readonly script: InfraLifecycleScript;
  readonly target: string;
}): string {
  return path.join(args.projectPath, getInfraScriptsDirectory(args.target), `${args.script}.sh`);
}

function getInfraScriptsDirectory(target: string): string {
  switch (target) {
    case 'minikube':
      return 'infra/minikube/scripts';
    default:
      throw new Error(`Unsupported deployment target for infra scripts: ${target}`);
  }
}

async function runShellScript(args: {
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly onStderr?: (chunk: string) => void;
  readonly onStdout?: (chunk: string) => void;
  readonly scriptPath: string;
}): Promise<InfraScriptOutput> {
  return new Promise<InfraScriptOutput>((resolve, reject) => {
    const child = spawn('bash', [args.scriptPath, ...args.args], {
      cwd: path.dirname(args.scriptPath),
      env: { ...args.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      args.onStdout?.(chunk);
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      args.onStderr?.(chunk);
    });
    child.once('error', (error) =>
      reject(createStartError(args.scriptPath, error, stdout, stderr)),
    );
    child.once('close', (exitCode) => {
      if (exitCode === 0) {
        resolve({ stderr, stdout });
        return;
      }
      reject(createExitError(args.scriptPath, exitCode, stdout, stderr));
    });
  });
}

function createStartError(
  scriptPath: string,
  error: Error,
  stdout: string,
  stderr: string,
): InfraScriptExecutionError {
  return new InfraScriptExecutionError({
    exitCode: null,
    message: `Failed to start infra script '${scriptPath}': ${error.message}`,
    stderr,
    stdout,
  });
}

function createExitError(
  scriptPath: string,
  exitCode: number | null,
  stdout: string,
  stderr: string,
): InfraScriptExecutionError {
  return new InfraScriptExecutionError({
    exitCode,
    message: `Infra script '${scriptPath}' exited with code ${exitCode ?? 'unknown'}.`,
    stderr,
    stdout,
  });
}

async function readSimpleEnvMap(filePath: string): Promise<Map<string, string>> {
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

function parsePositivePort(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65_535 ? parsed : null;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
