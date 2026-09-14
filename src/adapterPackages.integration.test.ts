import type { InfraEnvironmentSpec } from '@ankhorage/contracts/infra';
import { expect, test } from 'bun:test';

import { createNodeInfraAdapterPackageResolver } from './features/environment-lifecycle/adapters/outbound/createNodeInfraAdapterPackageResolver.js';
import { resolveInfraAdaptersAsync } from './features/environment-lifecycle/application/use-cases/resolveInfraAdaptersAsync.js';

test('loads every published package in the required provider composition matrix', async () => {
  const environments = [
    environment('local', 'minikube'),
    environment('local', 'k3s'),
    environment('local', 'docker-compose'),
    production(false),
    production(true),
  ];
  const resolved = await Promise.all(
    environments.map((desired) =>
      resolveInfraAdaptersAsync(desired, createNodeInfraAdapterPackageResolver()),
    ),
  );
  expect(resolved.every(({ ok }) => ok)).toBe(true);
  expect(
    new Set(
      resolved.flatMap((result) =>
        result.ok
          ? [
              result.value.compute.descriptor.id,
              result.value.runtime.descriptor.id,
              ...result.value.services.map(({ descriptor }) => descriptor.id),
            ]
          : [],
      ),
    ),
  ).toEqual(
    new Set([
      'local',
      'hetzner',
      'minikube',
      'k3s',
      'docker-compose',
      'supabase',
      'cerbos',
      'r2',
      'supabase-vault',
    ]),
  );
});

function environment(
  compute: 'local',
  runtime: 'minikube' | 'k3s' | 'docker-compose',
): InfraEnvironmentSpec {
  if (runtime === 'minikube') {
    return {
      deployment: { compute: { provider: compute }, runtime: { provider: runtime } },
      database: { provider: 'supabase' },
    };
  }
  return {
    deployment: { compute: { provider: compute }, runtime: { provider: runtime } },
    database: { provider: 'supabase' },
  };
}

function production(withOptionalServices: boolean): InfraEnvironmentSpec {
  return {
    deployment: {
      compute: { provider: 'hetzner', location: 'nbg1' },
      runtime: { provider: 'k3s', topology: { servers: 1, agents: 0 } },
    },
    database: { provider: 'supabase' },
    ...(withOptionalServices
      ? {
          objectStorage: { provider: 'r2' as const, buckets: ['media'] },
          authz: { provider: 'cerbos' as const, kind: 'ABAC' as const },
          secretStore: { provider: 'supabase-vault' as const },
        }
      : {}),
  };
}
