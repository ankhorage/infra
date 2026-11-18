import type { InfraWorkloadSpec } from '@ankhorage/contracts/infra';
import { describe, expect, it } from 'bun:test';

import { validateInfraWorkloadGraph } from './features/environment-lifecycle/domain/validateInfraWorkloadGraph.js';

describe('validateInfraWorkloadGraph', () => {
  it('accepts a dependency-first workload graph', () => {
    expect(validateInfraWorkloadGraph([workload('worker', ['api']), workload('api')])).toEqual({
      ok: true,
      value: null,
      diagnostics: [],
    });
  });

  it('fails closed for duplicate workloads and missing dependencies', () => {
    expect(
      validateInfraWorkloadGraph([
        workload('api'),
        workload('api'),
        workload('worker', ['missing']),
      ]),
    ).toMatchObject({
      ok: false,
      diagnostics: [
        { code: 'infra-workload-duplicate' },
        { code: 'infra-workload-dependency-missing' },
      ],
    });
  });

  it('fails closed for cyclic dependencies', () => {
    expect(
      validateInfraWorkloadGraph([workload('api', ['worker']), workload('worker', ['api'])]),
    ).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'infra-workload-dependency-cycle' }],
    });
  });

  it('reports only the cyclic suffix of a reachable dependency path', () => {
    expect(
      validateInfraWorkloadGraph([
        workload('gateway', ['api']),
        workload('api', ['worker']),
        workload('worker', ['api']),
      ]),
    ).toMatchObject({
      ok: false,
      diagnostics: [{ message: 'Workload dependencies contain a cycle: api -> worker -> api.' }],
    });
  });
});

function workload(id: string, dependencies: readonly string[] = []): InfraWorkloadSpec {
  return {
    id,
    artifact: { kind: 'image', image: `example/${id}:1` },
    dependsOn: Object.fromEntries(dependencies.map((dependency) => [dependency, true])),
  };
}
