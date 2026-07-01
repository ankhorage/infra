import type { AnkhDiscoveredPackage, AnkhLoadedProvider } from '@ankhorage/ankh';
import {
  createPackageRegistry,
  createProviderRegistry,
  runCli as runAnkhCli,
} from '@ankhorage/ankh';
import { describe, expect, test } from 'bun:test';

import { createInfraRuntimeProvider } from './ankh.provider.js';
import { runCli } from './cli.js';
import { createCapturedCommandContext } from './testSupport.js';

describe('standalone cli and provider-backed dispatch', () => {
  test('prints help and version for the standalone CLI', async () => {
    const help = createCapturedCommandContext('/workspace', '9.9.9');
    const version = createCapturedCommandContext('/workspace', '9.9.9');

    expect((await runCli([], { context: help.context })).exitCode).toBe(0);
    expect(help.stdout.value).toContain('ankhorage-infra <command> [project]');
    expect(help.stdout.value).not.toContain('port-forward');

    expect((await runCli(['--version'], { context: version.context })).exitCode).toBe(0);
    expect(version.stdout.value).toBe('9.9.9\n');
  });

  test('uses the shared command runner for standalone CLI dispatch', async () => {
    const captured = createCapturedCommandContext('/workspace');
    const calls: string[] = [];

    const result = await runCli(['validate', 'shop'], {
      context: captured.context,
      runCommandImpl(request) {
        calls.push(request.command.standaloneName);
        request.context.writeStdout(
          `ran:${request.command.standaloneName}:${request.argv.join(',')}\n`,
        );
        return Promise.resolve({ exitCode: 0 });
      },
    });

    expect(result.exitCode).toBe(0);
    expect(calls).toEqual(['validate']);
    expect(captured.stdout.value).toContain('ran:validate:shop');
  });

  test('routes provider-backed dispatch through @ankhorage/ankh', async () => {
    const captured = createCapturedCommandContext('/workspace');
    const calls: string[] = [];
    const provider = createInfraRuntimeProvider({
      runCommandImpl(request) {
        calls.push(request.command.standaloneName);
        request.context.writeStdout(`provider:${request.command.standaloneName}\n`);
        return Promise.resolve({ exitCode: 0 });
      },
    });

    const packageRegistry = createPackageRegistry([createDiscoveredPackage()]);
    const providerRegistry = createProviderRegistry([createLoadedProvider(provider)]);

    const result = await runAnkhCli(['infra', 'status', 'shop'], {
      context: captured.context,
      registry: packageRegistry,
      providerRegistry,
    });

    expect(result.exitCode).toBe(0);
    expect(calls).toEqual(['status']);
    expect(captured.stdout.value).toContain('provider:status');
  });

  test('uses the same injected shared runner from both surfaces', async () => {
    const standalone = createCapturedCommandContext('/workspace');
    const providerContext = createCapturedCommandContext('/workspace');
    const calls: string[] = [];

    const runCommandImpl = (request: {
      readonly argv: readonly string[];
      readonly command: { readonly standaloneName: string };
      readonly context: { writeStdout(text: string): void };
    }) => {
      calls.push(request.command.standaloneName);
      request.context.writeStdout(`shared:${request.command.standaloneName}\n`);
      return Promise.resolve({ exitCode: 0 });
    };

    await runCli(['generate', 'shop'], {
      context: standalone.context,
      runCommandImpl,
    });

    const provider = createInfraRuntimeProvider({ runCommandImpl });
    const packageRegistry = createPackageRegistry([createDiscoveredPackage()]);
    const providerRegistry = createProviderRegistry([createLoadedProvider(provider)]);

    await runAnkhCli(['infra', 'generate', 'shop'], {
      context: providerContext.context,
      registry: packageRegistry,
      providerRegistry,
    });

    expect(calls).toEqual(['generate', 'generate']);
    expect(standalone.stdout.value).toContain('shared:generate');
    expect(providerContext.stdout.value).toContain('shared:generate');
  });
});

function createDiscoveredPackage(): AnkhDiscoveredPackage {
  return {
    metadata: {
      category: 'infra',
      provider: './dist/ankh.provider.js',
      capabilities: ['infra.validate', 'infra.generate', 'infra.status', 'infra.up', 'infra.down'],
    },
    packageJsonPath: '/workspace/package.json',
    packageName: '@ankhorage/infra',
    packageRoot: '/workspace',
    source: 'workspace',
  };
}

function createLoadedProvider(
  provider: ReturnType<typeof createInfraRuntimeProvider>,
): AnkhLoadedProvider {
  return {
    discoveredPackage: createDiscoveredPackage(),
    manifest: {
      id: provider.id,
      category: provider.category,
      version: provider.version,
      capabilities: provider.capabilities,
      commands: provider.commands,
    },
    providerModuleDefaultExport: provider,
    providerModulePath: '/workspace/dist/ankh.provider.js',
    providerModuleUrl: 'file:///workspace/dist/ankh.provider.js',
  };
}
