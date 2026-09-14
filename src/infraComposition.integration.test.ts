import type { InfraLedger, InfraManifest, InfraResult } from '@ankhorage/contracts/infra';
import { expect, test } from 'bun:test';

import { createNodeInfraAdapterPackageResolver } from './features/environment-lifecycle/adapters/outbound/createNodeInfraAdapterPackageResolver.js';
import { destroyInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/destroyInfraEnvironmentAsync.js';
import { downInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/downInfraEnvironmentAsync.js';
import { planInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/planInfraEnvironmentAsync.js';
import { statusInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/statusInfraEnvironmentAsync.js';
import { upInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/upInfraEnvironmentAsync.js';
import type { InfraOrchestrationDependencies } from './types/infraOrchestration.js';

const projectId = 'infra145-orchestrator-acceptance';
const manifest = {
  environments: {
    local: {
      deployment: {
        compute: { provider: 'local' },
        runtime: { provider: 'docker-compose', projectName: projectId },
      },
      workloads: [
        {
          id: 'web',
          artifact: { kind: 'image', image: 'nginx:alpine' },
          ports: [{ name: 'http', port: 80 }],
          exposure: 'internal',
        },
      ],
    },
  },
  modules: [],
} as const satisfies InfraManifest;

test.skipIf(process.env.ANKH_INFRA_COMPOSITION_E2E !== '1')(
  'runs the typed lifecycle through real Local and Docker Compose adapters',
  async () => {
    const dependencies = createDependencies();
    let ledger: InfraLedger | undefined;
    try {
      const initialPlan = requireSuccess(
        await planInfraEnvironmentAsync({ projectId, manifest }, dependencies),
      );
      expect(initialPlan.actions.some(({ operation }) => operation === 'create')).toBe(true);

      const firstUp = requireSuccess(
        await upInfraEnvironmentAsync({ projectId, manifest }, dependencies),
      );
      const { ledger: firstLedger } = firstUp;
      ledger = firstLedger;
      expect(firstUp.resources.some(({ identity }) => identity.resourceId === 'service:web')).toBe(
        true,
      );
      const status = requireSuccess(
        await statusInfraEnvironmentAsync({ projectId, manifest, previous: ledger }, dependencies),
      );
      expect(status.state).toBe('ready');
      const convergedPlan = requireSuccess(
        await planInfraEnvironmentAsync({ projectId, manifest, previous: ledger }, dependencies),
      );
      expect(convergedPlan.actions.every(({ operation }) => operation === 'noop')).toBe(true);

      const down = requireSuccess(
        await downInfraEnvironmentAsync({ projectId, manifest, previous: ledger }, dependencies),
      );
      const { ledger: downLedger } = down;
      ledger = downLedger;
      const resumed = requireSuccess(
        await upInfraEnvironmentAsync({ projectId, manifest, previous: ledger }, dependencies),
      );
      const { ledger: resumedLedger } = resumed;
      ledger = resumedLedger;
      const destroyed = requireSuccess(
        await destroyInfraEnvironmentAsync(
          {
            projectId,
            manifest,
            environment: 'local',
            previous: ledger,
            confirmation: { projectId, environment: 'local' },
            persistence: { policy: 'retain' },
          },
          dependencies,
        ),
      );
      ledger = destroyed.ledger ?? undefined;
      expect(destroyed.ledger).toBeNull();
    } finally {
      if (ledger !== undefined) {
        await destroyInfraEnvironmentAsync(
          {
            projectId,
            manifest,
            environment: 'local',
            previous: ledger,
            confirmation: { projectId, environment: 'local' },
            persistence: { policy: 'retain' },
          },
          dependencies,
        );
      }
    }
  },
  120_000,
);

function createDependencies(): InfraOrchestrationDependencies {
  return {
    adapterResolver: createNodeInfraAdapterPackageResolver(),
    credentials: { resolveAsync: () => Promise.resolve(success({})) },
    secrets: {
      resolveAsync: () =>
        Promise.resolve({
          ok: false,
          diagnostics: [
            { severity: 'error', code: 'unexpected-secret', message: 'No secret is expected.' },
          ],
        }),
    },
  };
}

function requireSuccess<T>(result: InfraResult<T>): T {
  if (!result.ok) throw new Error(result.diagnostics.map(({ message }) => message).join(' '));
  return result.value;
}

function success<T>(value: T): InfraResult<T> {
  return { ok: true, value, diagnostics: [] };
}
