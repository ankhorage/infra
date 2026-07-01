import { describe, expect, test } from 'bun:test';

import {
  createProviderCommandDescriptors,
  findInfraCommandByStandaloneName,
  INFRA_COMMANDS,
  renderRootHelp,
  runInfraCommand,
} from './commands.js';
import { createCapturedCommandContext } from './testSupport.js';
import { createAppManifest } from './testSupport.js';

describe('infra command table', () => {
  test('stays aligned across provider descriptors and standalone names', () => {
    const providerDescriptors = createProviderCommandDescriptors();

    expect(INFRA_COMMANDS.map((command) => command.standaloneName)).toEqual([
      'validate',
      'generate',
      'status',
      'up',
      'down',
    ]);
    expect(providerDescriptors.map((command) => command.path.join(' '))).toEqual([
      'validate',
      'generate',
      'status',
      'up',
      'down',
    ]);
    expect(JSON.stringify(providerDescriptors)).not.toContain('port-forward');
    expect(JSON.stringify(providerDescriptors)).not.toContain('portForward');
  });

  test('root help only exposes the locked command surface', () => {
    const help = renderRootHelp('0.2.1');

    expect(help).toContain('validate');
    expect(help).toContain('generate');
    expect(help).toContain('status');
    expect(help).toContain('up');
    expect(help).toContain('down');
    expect(help).not.toContain('port-forward');
  });

  test('validate prints warnings without failing', async () => {
    const command = findInfraCommandByStandaloneName('validate');
    const captured = createCapturedCommandContext('/workspace');

    if (command === null) {
      throw new Error('validate command not found');
    }

    const result = await runInfraCommand(
      {
        argv: ['shop'],
        command,
        context: captured.context,
      },
      {
        services: {
          resolveProject() {
            return Promise.resolve({
              appsRoot: '/workspace/apps',
              workspaceRoot: '/workspace',
              manifestPath: '/workspace/apps/shop/ankh.config.json',
              projectId: 'shop',
              projectPath: '/workspace/apps/shop',
              manifest: createAppManifest('shop', { plugins: [] }),
            });
          },
          validateInfraSupport() {
            return ['warning-1'];
          },
        },
      },
    );

    expect(result.exitCode).toBe(0);
    expect(captured.stdout.value).toContain('infraConfigSupport: warnings');
    expect(captured.stderr.value).toContain('warning-1');
  });

  test('generate reports skipped studio results', async () => {
    const command = findInfraCommandByStandaloneName('generate');
    const captured = createCapturedCommandContext('/workspace');

    if (command === null) {
      throw new Error('generate command not found');
    }

    const result = await runInfraCommand(
      {
        argv: ['studio'],
        command,
        context: captured.context,
      },
      {
        services: {
          resolveProject() {
            return Promise.resolve({
              appsRoot: '/workspace/apps',
              workspaceRoot: '/workspace',
              manifestPath: '/workspace/apps/studio/ankh.config.json',
              projectId: 'studio',
              projectPath: '/workspace/apps/studio',
              manifest: createAppManifest('studio', { plugins: [] }),
            });
          },
          syncProjectInfrastructure() {
            return Promise.resolve({
              generated: 0,
              removed: 0,
              warnings: [],
              skipped: {
                reason: 'apps/studio is the dashboard and is not a generated app target.',
              },
            });
          },
        },
      },
    );

    expect(result.exitCode).toBe(0);
    expect(captured.stdout.value).toContain('Skipped: apps/studio');
  });

  test('status, up, and down use the runtime script service with the expected sequencing', async () => {
    const events: string[] = [];
    const status = findInfraCommandByStandaloneName('status');
    const up = findInfraCommandByStandaloneName('up');
    const down = findInfraCommandByStandaloneName('down');

    if (status === null || up === null || down === null) {
      throw new Error('missing infra commands');
    }

    const services = {
      resolveProject() {
        events.push('resolve-project');
        return Promise.resolve({
          appsRoot: '/workspace/apps',
          workspaceRoot: '/workspace',
          manifestPath: '/workspace/apps/shop/ankh.config.json',
          projectId: 'shop',
          projectPath: '/workspace/apps/shop',
          manifest: createAppManifest('shop', {
            deployment: { target: 'minikube', monitoring: false },
            plugins: [],
          }),
        });
      },
      resolveProjectInfrastructureTarget() {
        events.push('resolve-target');
        return Promise.resolve('minikube');
      },
      syncProjectInfrastructure() {
        events.push('generate');
        return Promise.resolve({ generated: 1, removed: 0, warnings: [] });
      },
      runProjectInfraScript(args: { readonly script: string }) {
        events.push(`script:${args.script}`);
        return Promise.resolve();
      },
    };

    await runInfraCommand(
      {
        argv: ['shop'],
        command: status,
        context: createCapturedCommandContext('/workspace').context,
      },
      { services },
    );
    await runInfraCommand(
      { argv: ['shop'], command: up, context: createCapturedCommandContext('/workspace').context },
      { services },
    );
    await runInfraCommand(
      {
        argv: ['shop'],
        command: down,
        context: createCapturedCommandContext('/workspace').context,
      },
      { services },
    );

    expect(events).toEqual([
      'resolve-project',
      'resolve-target',
      'script:status',
      'resolve-project',
      'generate',
      'resolve-target',
      'script:up',
      'resolve-project',
      'resolve-target',
      'script:down',
    ]);
  });

  test('rejects extra arguments for a command', async () => {
    const command = findInfraCommandByStandaloneName('validate');
    const captured = createCapturedCommandContext('/workspace');

    if (command === null) {
      throw new Error('validate command not found');
    }

    const result = await runInfraCommand({
      argv: ['shop', 'extra'],
      command,
      context: captured.context,
    });

    expect(result.exitCode).toBe(1);
    expect(captured.stderr.value).toContain('accepts at most one project argument');
  });
});
