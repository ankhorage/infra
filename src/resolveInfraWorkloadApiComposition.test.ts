import type { InfraManifest, InfraWorkloadSpec } from '@ankhorage/contracts/infra';
import { describe, expect, it } from 'bun:test';

import { resolveInfraWorkloadApiComposition } from './features/environment-lifecycle/domain/resolveInfraWorkloadApiComposition.js';

const environment = {
  deployment: { compute: { provider: 'local' }, runtime: { provider: 'docker-compose' } },
} as const;

describe('resolveInfraWorkloadApiComposition', () => {
  it('assigns every declared internal API to its single workload', () => {
    const result = resolveInfraWorkloadApiComposition(manifest(), [workload('api', ['projects'])]);

    expect(result).toEqual({
      ok: true,
      value: [{ apiId: 'projects', workloadId: 'api' }],
      diagnostics: [],
    });
  });

  it('fails closed for missing API declarations and external API targets', () => {
    const result = resolveInfraWorkloadApiComposition(manifest(), [
      workload('api', ['missing', 'third-party']),
    ]);

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [
        { code: 'infra-workload-api-missing' },
        { code: 'infra-workload-api-external' },
      ],
    });
  });

  it('fails closed when multiple workloads claim one internal API', () => {
    const result = resolveInfraWorkloadApiComposition(manifest(), [
      workload('api-a', ['projects']),
      workload('api-b', ['projects']),
    ]);

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'infra-workload-api-duplicate' }],
    });
  });

  it('fails closed when a workload references APIs without an API registry', () => {
    const { apis: _apis, ...withoutApis } = manifest();
    const result = resolveInfraWorkloadApiComposition(withoutApis, [workload('api', ['projects'])]);

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'infra-workload-api-missing' }],
    });
  });
});

function manifest(): InfraManifest {
  return {
    environments: { local: environment },
    apis: {
      projects: {
        id: 'projects',
        origin: 'internal',
        protocol: 'rest',
        basePath: '/projects',
        endpoints: {},
      },
      'third-party': {
        id: 'third-party',
        origin: 'external',
        protocol: 'rest',
        baseUrl: 'https://third-party.example.test',
        endpoints: {},
      },
    },
    modules: {},
  };
}

function workload(id: string, apiIds: readonly string[]): InfraWorkloadSpec {
  return {
    id,
    artifact: { kind: 'image', image: `example/${id}:1` },
    apis: { apiIds: Object.fromEntries(apiIds.map((apiId) => [apiId, true])) },
  };
}
