import { renderProviderHelp } from '@ankhorage/ankh';
import { describe, expect, test } from 'bun:test';

import { INFRA_PACKAGE_DESCRIPTION } from '../constants.js';
import { createCapturedCommandContext } from '../testSupport.js';
import { createInfraRuntimeProvider } from './createInfraRuntimeProvider.js';
import { runInfraCliAsync } from './runInfraCliAsync.js';

describe('standalone Infra CLI', () => {
  test('renders every help alias from the canonical provider manifest', async () => {
    const expectedHelp = renderProviderHelp({
      commandPrefix: ['ankhorage-infra'],
      description: INFRA_PACKAGE_DESCRIPTION,
      manifest: createInfraRuntimeProvider(),
    });

    for (const argv of [[], ['-h'], ['--help'], ['help']] as const) {
      const captured = createCapturedCommandContext('/workspace', '9.9.9');
      const result = await runInfraCliAsync(argv, { context: captured.context });

      expect(result).toEqual({ exitCode: 0 });
      expect(captured.stdout.value).toBe(expectedHelp);
      expect(captured.stderr.value).toBe('');
    }
  });

  test('prints version and dispatches all commands through the shared runner', async () => {
    const version = createCapturedCommandContext('/workspace', '9.9.9');
    expect((await runInfraCliAsync(['--version'], { context: version.context })).exitCode).toBe(0);
    expect(version.stdout.value).toBe('9.9.9\n');

    const calls: string[] = [];
    for (const name of [
      'validate',
      'plan',
      'generate',
      'up',
      'status',
      'outputs',
      'down',
      'destroy',
    ]) {
      await runInfraCliAsync([name, 'shop'], {
        context: createCapturedCommandContext('/workspace').context,
        runCommandImpl(request) {
          calls.push(request.command.standaloneName);
          return Promise.resolve({ exitCode: 0 });
        },
      });
    }
    expect(calls).toEqual([
      'validate',
      'plan',
      'generate',
      'up',
      'status',
      'outputs',
      'down',
      'destroy',
    ]);
  });
});
