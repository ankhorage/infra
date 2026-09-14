import { describe, expect, test } from 'bun:test';

import { createCapturedCommandContext } from '../testSupport.js';
import { runInfraCliAsync } from './runInfraCliAsync.js';

describe('standalone Infra CLI', () => {
  test('prints help/version and dispatches all commands through the shared runner', async () => {
    const help = createCapturedCommandContext('/workspace', '9.9.9');
    const version = createCapturedCommandContext('/workspace', '9.9.9');
    expect((await runInfraCliAsync([], { context: help.context })).exitCode).toBe(0);
    expect(help.stdout.value).toContain('ankhorage-infra <command>');
    expect(help.stdout.value).toContain('destroy');
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
