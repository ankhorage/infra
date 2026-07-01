import type { AnkhCapabilityId, AnkhCommandDescriptor } from '@ankhorage/contracts/cli';

import type { InfraCommandContext, InfraCommandRunResult } from './commandContext.js';
import { validateInfraSupport } from './infraValidation.js';
import {
  INFRA_CAPABILITIES,
  INFRA_COMMAND_CATEGORY,
  INFRA_PACKAGE_NAME,
} from './packageMetadata.js';
import type { ResolvedInfraProject } from './project.js';
import { resolveInfraProject } from './project.js';
import type { InfraSyncResult } from './projectInfrastructure.js';
import {
  resolveProjectInfrastructureTarget,
  syncProjectInfrastructure,
} from './projectInfrastructure.js';
import type { InfraLifecycleScript } from './runtime.js';
import { runProjectInfraScript } from './runtime.js';

type InfraCommandName = 'down' | 'generate' | 'status' | 'up' | 'validate';

interface InfraCommandRunRequest {
  readonly context: InfraCommandContext;
  readonly projectId?: string;
}

type InfraCommandImplementation = (
  request: InfraCommandRunRequest,
  services: InfraCommandServices,
) => Promise<InfraCommandRunResult>;

export interface InfraCommandDefinition {
  readonly capability: AnkhCapabilityId;
  readonly path: readonly [InfraCommandName];
  readonly standaloneName: InfraCommandName;
  readonly summary: string;
  readonly run: InfraCommandImplementation;
}

export interface InfraCommandInvocation {
  readonly argv: readonly string[];
  readonly command: InfraCommandDefinition;
  readonly context: InfraCommandContext;
}

export interface InfraCommandServices {
  readonly resolveProject: (options: {
    readonly cwd: string;
    readonly projectId?: string;
  }) => Promise<ResolvedInfraProject>;
  readonly resolveProjectInfrastructureTarget: (args: {
    readonly manifest: ResolvedInfraProject['manifest'];
    readonly projectPath: string;
  }) => Promise<string | null>;
  readonly runProjectInfraScript: (args: {
    readonly context: InfraCommandContext;
    readonly projectId: string;
    readonly projectPath: string;
    readonly script: InfraLifecycleScript;
    readonly target: string;
  }) => Promise<void>;
  readonly syncProjectInfrastructure: (args: {
    readonly manifest: ResolvedInfraProject['manifest'];
    readonly projectId: string;
    readonly projectPath: string;
  }) => Promise<InfraSyncResult>;
  readonly validateInfraSupport: typeof validateInfraSupport;
}

export interface RunInfraCommandOptions {
  readonly runCommandImpl?: RunInfraCommandImpl;
  readonly services?: Partial<InfraCommandServices>;
}

export type RunInfraCommandImpl = (
  request: InfraCommandInvocation,
  options?: RunInfraCommandOptions,
) => Promise<InfraCommandRunResult>;

const COMMAND_CAPABILITIES = {
  validate: INFRA_CAPABILITIES[0],
  generate: INFRA_CAPABILITIES[1],
  status: INFRA_CAPABILITIES[2],
  up: INFRA_CAPABILITIES[3],
  down: INFRA_CAPABILITIES[4],
} as const satisfies Record<InfraCommandName, AnkhCapabilityId>;

export const INFRA_COMMANDS = [
  {
    standaloneName: 'validate',
    path: ['validate'],
    capability: COMMAND_CAPABILITIES.validate,
    summary: 'Validate infra support for a project manifest.',
    run: runValidateCommand,
  },
  {
    standaloneName: 'generate',
    path: ['generate'],
    capability: COMMAND_CAPABILITIES.generate,
    summary: 'Generate infra artifacts and update the infra ledger for a project.',
    run: runGenerateCommand,
  },
  {
    standaloneName: 'status',
    path: ['status'],
    capability: COMMAND_CAPABILITIES.status,
    summary: 'Run the generated runtime status script for a project.',
    run: runStatusCommand,
  },
  {
    standaloneName: 'up',
    path: ['up'],
    capability: COMMAND_CAPABILITIES.up,
    summary: 'Generate infra artifacts, then run the generated up script.',
    run: runUpCommand,
  },
  {
    standaloneName: 'down',
    path: ['down'],
    capability: COMMAND_CAPABILITIES.down,
    summary: 'Run the generated down script for a project.',
    run: runDownCommand,
  },
] as const satisfies readonly InfraCommandDefinition[];

export async function runInfraCommand(
  request: InfraCommandInvocation,
  options: RunInfraCommandOptions = {},
): Promise<InfraCommandRunResult> {
  const services = createInfraCommandServices(options.services);

  try {
    const parsedArgs = parseCommandArguments(request.command, request.argv);
    if (parsedArgs.kind === 'help') {
      request.context.writeStdout(renderCommandHelp(request.command));
      return { exitCode: 0 };
    }

    return await request.command.run(
      {
        context: request.context,
        projectId: parsedArgs.projectId,
      },
      services,
    );
  } catch (error) {
    request.context.writeStderr(renderCommandFailure(request.command.standaloneName, error));
    return { exitCode: 1 };
  }
}

export function createProviderCommandDescriptors(): readonly AnkhCommandDescriptor[] {
  return INFRA_COMMANDS.map((command) => ({
    capability: command.capability,
    path: command.path,
    summary: command.summary,
  }));
}

export function findInfraCommandByStandaloneName(value: string): InfraCommandDefinition | null {
  return INFRA_COMMANDS.find((command) => command.standaloneName === value) ?? null;
}

export function renderRootHelp(version: string): string {
  const commandLines = INFRA_COMMANDS.map(
    (command) => `  ${command.standaloneName.padEnd(8, ' ')} ${command.summary}`,
  ).join('\n');

  return [
    `@ankhorage/infra v${version}`,
    '',
    'Usage:',
    `  ankhorage-infra <command> [project]`,
    `  ankh ${INFRA_COMMAND_CATEGORY} <command> [project]`,
    '',
    'Commands:',
    commandLines,
    '',
    'Project resolution:',
    '  Pass [project], or omit it when cwd is inside apps/<project>.',
    '',
  ].join('\n');
}

export function renderUnknownCommand(value: string): string {
  return [`Unknown infra command: ${value}`, '', 'Run ankhorage-infra --help', ''].join('\n');
}

function renderCommandHelp(command: InfraCommandDefinition): string {
  return [
    `${command.summary}`,
    '',
    'Usage:',
    `  ankhorage-infra ${command.standaloneName} [project]`,
    `  ankh ${INFRA_COMMAND_CATEGORY} ${command.path.join(' ')} [project]`,
    '',
    'Project resolution:',
    '  Pass [project], or omit it when cwd is inside apps/<project>.',
    '',
  ].join('\n');
}

function createInfraCommandServices(
  overrides: Partial<InfraCommandServices> = {},
): InfraCommandServices {
  return {
    resolveProject: overrides.resolveProject ?? resolveInfraProject,
    resolveProjectInfrastructureTarget:
      overrides.resolveProjectInfrastructureTarget ?? resolveProjectInfrastructureTarget,
    runProjectInfraScript: overrides.runProjectInfraScript ?? runProjectInfraScript,
    syncProjectInfrastructure: overrides.syncProjectInfrastructure ?? syncProjectInfrastructure,
    validateInfraSupport: overrides.validateInfraSupport ?? validateInfraSupport,
  };
}

function parseCommandArguments(
  command: InfraCommandDefinition,
  argv: readonly string[],
): { readonly kind: 'help' } | { readonly kind: 'run'; readonly projectId?: string } {
  if (argv.length === 1 && isHelpToken(argv[0])) {
    return { kind: 'help' };
  }

  if (argv.length > 1) {
    throw new Error(`Infra ${command.standaloneName} accepts at most one project argument.`);
  }

  return {
    kind: 'run',
    projectId: argv[0],
  };
}

async function runValidateCommand(
  request: InfraCommandRunRequest,
  services: InfraCommandServices,
): Promise<InfraCommandRunResult> {
  const project = await services.resolveProject({
    cwd: request.context.cwd,
    projectId: request.projectId,
  });
  const warnings = [...services.validateInfraSupport(project.manifest.infra)];

  request.context.writeStdout(`projectId: ${project.projectId}\n`);
  request.context.writeStdout(`infraConfigSupport: ${warnings.length === 0 ? 'ok' : 'warnings'}\n`);
  writeWarnings(request.context, warnings);

  return { exitCode: 0 };
}

async function runGenerateCommand(
  request: InfraCommandRunRequest,
  services: InfraCommandServices,
): Promise<InfraCommandRunResult> {
  const project = await services.resolveProject({
    cwd: request.context.cwd,
    projectId: request.projectId,
  });

  request.context.writeStdout(`Regenerating infrastructure for project: ${project.projectId}...\n`);

  const result = await services.syncProjectInfrastructure({
    manifest: project.manifest,
    projectId: project.projectId,
    projectPath: project.projectPath,
  });

  if (result.skipped !== undefined) {
    request.context.writeStdout(`Skipped: ${result.skipped.reason}\n`);
    return { exitCode: 0 };
  }

  request.context.writeStdout(`Generated: ${result.generated}, removed stale: ${result.removed}\n`);
  writeWarnings(request.context, result.warnings);

  return { exitCode: 0 };
}

async function runStatusCommand(
  request: InfraCommandRunRequest,
  services: InfraCommandServices,
): Promise<InfraCommandRunResult> {
  const project = await services.resolveProject({
    cwd: request.context.cwd,
    projectId: request.projectId,
  });
  const target = await services.resolveProjectInfrastructureTarget({
    manifest: project.manifest,
    projectPath: project.projectPath,
  });

  if (target === null) {
    throw new Error(
      `Project '${project.projectId}' has no infrastructure target. Run infra generation first.`,
    );
  }

  await services.runProjectInfraScript({
    context: request.context,
    projectId: project.projectId,
    projectPath: project.projectPath,
    script: 'status',
    target,
  });

  return { exitCode: 0 };
}

async function runUpCommand(
  request: InfraCommandRunRequest,
  services: InfraCommandServices,
): Promise<InfraCommandRunResult> {
  const project = await services.resolveProject({
    cwd: request.context.cwd,
    projectId: request.projectId,
  });

  request.context.writeStdout(`Preparing infrastructure for project: ${project.projectId}...\n`);

  const generateResult = await services.syncProjectInfrastructure({
    manifest: project.manifest,
    projectId: project.projectId,
    projectPath: project.projectPath,
  });

  if (generateResult.skipped !== undefined) {
    request.context.writeStdout(`Skipped: ${generateResult.skipped.reason}\n`);
    return { exitCode: 0 };
  }

  writeWarnings(request.context, generateResult.warnings);

  const target = await services.resolveProjectInfrastructureTarget({
    manifest: project.manifest,
    projectPath: project.projectPath,
  });

  if (project.manifest.infra.deployment === undefined || target === null) {
    throw new Error(
      `Project '${project.projectId}' has no infra.deployment target configured in ankh.config.json.`,
    );
  }

  await services.runProjectInfraScript({
    context: request.context,
    projectId: project.projectId,
    projectPath: project.projectPath,
    script: 'up',
    target,
  });
  request.context.writeStdout('Infrastructure is up.\n');

  return { exitCode: 0 };
}

async function runDownCommand(
  request: InfraCommandRunRequest,
  services: InfraCommandServices,
): Promise<InfraCommandRunResult> {
  const project = await services.resolveProject({
    cwd: request.context.cwd,
    projectId: request.projectId,
  });
  const target = await services.resolveProjectInfrastructureTarget({
    manifest: project.manifest,
    projectPath: project.projectPath,
  });

  if (target === null) {
    throw new Error(
      `Project '${project.projectId}' has no infrastructure target. Run infra generation first.`,
    );
  }

  await services.runProjectInfraScript({
    context: request.context,
    projectId: project.projectId,
    projectPath: project.projectPath,
    script: 'down',
    target,
  });
  request.context.writeStdout('Infrastructure is down.\n');

  return { exitCode: 0 };
}

function writeWarnings(context: InfraCommandContext, warnings: readonly string[]): void {
  if (warnings.length === 0) {
    return;
  }

  context.writeStderr('Warnings:\n');
  for (const warning of warnings) {
    context.writeStderr(`- ${warning}\n`);
  }
}

function renderCommandFailure(commandName: InfraCommandName, error: unknown): string {
  return `Infra ${commandName} failed: ${getErrorMessage(error)}\n`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isHelpToken(value: string | undefined): boolean {
  return value === '--help' || value === '-h' || value === 'help';
}
