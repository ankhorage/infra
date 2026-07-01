import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

import type { InfraCommandContext } from './commandContext.js';

export type InfraLifecycleScript = 'down' | 'status' | 'up';

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

export async function runProjectInfraScript(args: {
  readonly context: InfraCommandContext;
  readonly projectId: string;
  readonly projectPath: string;
  readonly script: InfraLifecycleScript;
  readonly target: string;
}): Promise<void> {
  const scriptPath = resolveProjectInfraScriptPath(args);
  if (!(await pathExists(scriptPath))) {
    throw new Error(
      `Infra script not found: ${scriptPath}. Run infra generate for project '${args.projectId}' first.`,
    );
  }

  await runShellScript({
    context: args.context,
    scriptPath,
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
  readonly context: InfraCommandContext;
  readonly scriptPath: string;
}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('bash', [args.scriptPath], {
      cwd: path.dirname(args.scriptPath),
      env: { ...args.context.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      args.context.writeStdout(chunk);
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      args.context.writeStderr(chunk);
    });

    child.once('error', (error) => {
      reject(
        new InfraScriptExecutionError({
          exitCode: null,
          message: `Failed to start infra script '${args.scriptPath}': ${error.message}`,
          stderr,
          stdout,
        }),
      );
    });

    child.once('close', (exitCode) => {
      if (exitCode === 0) {
        resolve();
        return;
      }

      reject(
        new InfraScriptExecutionError({
          exitCode,
          message: `Infra script '${args.scriptPath}' exited with code ${exitCode ?? 'unknown'}.`,
          stderr,
          stdout,
        }),
      );
    });
  });
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
