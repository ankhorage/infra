import type {
  InfraExecutionContext,
  InfraResult,
  InfraServiceAdapter,
} from '@ankhorage/contracts/infra';
import { INFRA_ADAPTER_CATALOG } from '@ankhorage/contracts/infra';
import { expect, it } from 'bun:test';

import { prepareInfraServicesAsync } from './features/environment-lifecycle/application/use-cases/prepareInfraServicesAsync';

it('leaves services without preparation unchanged', async () => {
  const service: InfraServiceAdapter = {
    descriptor: INFRA_ADAPTER_CATALOG.cerbos,
    validateAsync: () => success(null),
    planAsync: () => success([]),
    desiredWorkloadsAsync: () => success([]),
    reconcileAsync: () => success({ resources: [], outputs: [] }),
    statusAsync: () => success([]),
    destroyAsync: () => success({ resources: [], outputs: [] }),
  };

  expect(await prepareInfraServicesAsync(createContext(), [service])).toEqual({
    ok: true,
    value: null,
    diagnostics: [],
  });
});

function createContext(): InfraExecutionContext {
  return {
    projectId: 'fixture',
    environment: 'local',
    desired: {
      deployment: {
        compute: { provider: 'local' },
        runtime: { provider: 'docker-compose' },
      },
    },
    credentials: {
      findAsync: () => success(null),
      resolveAsync: () => success({}),
      persistAsync: () => success(null),
    },
    secrets: { resolveAsync: () => success('secret') },
  };
}

function success<T>(value: T): Promise<InfraResult<T>> {
  return Promise.resolve({ ok: true, value, diagnostics: [] });
}
