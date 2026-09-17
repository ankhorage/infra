import type { InfraControlPlaneCredentialRef } from '@ankhorage/contracts/infra';
import { expect, it } from 'bun:test';

import { createEnvironmentInfraCredentialPort } from './features/environment-lifecycle/adapters/outbound/createEnvironmentInfraCredentialPort';

const bundleReference = { source: 'control-plane', name: 'FIXTURE_BOOTSTRAP' } as const satisfies InfraControlPlaneCredentialRef;
const tokenReference = { source: 'control-plane', name: 'FIXTURE_TOKEN' } as const satisfies InfraControlPlaneCredentialRef;

it('finds exact and prefixed environment credentials without mutating state', async () => {
  const port = createEnvironmentInfraCredentialPort({
    FIXTURE_BOOTSTRAP: JSON.stringify({ username: 'fixture', password: 'secret' }),
    ANKH_INFRA_CREDENTIAL_FIXTURE_TOKEN: 'token-value',
  });

  expect(await port.findAsync(bundleReference)).toEqual({
    ok: true,
    value: { username: 'fixture', password: 'secret' },
    diagnostics: [],
  });
  expect(await port.findAsync(tokenReference)).toEqual({
    ok: true,
    value: { token: 'token-value', apiToken: 'token-value' },
    diagnostics: [],
  });
});

it('distinguishes optional lookup from strict resolution', async () => {
  const port = createEnvironmentInfraCredentialPort({});

  expect(await port.findAsync(bundleReference)).toEqual({ ok: true, value: null, diagnostics: [] });
  const resolved = await port.resolveAsync(bundleReference);
  expect(resolved.ok).toBe(false);
  expect(resolved.diagnostics).toEqual([
    {
      severity: 'error',
      code: 'infra-control-plane-credential-missing',
      message:
        'Control-plane credential FIXTURE_BOOTSTRAP is unavailable. Set FIXTURE_BOOTSTRAP or ANKH_INFRA_CREDENTIAL_FIXTURE_BOOTSTRAP.',
    },
  ]);
});

it('fails closed when an environment-only source is asked to persist credentials', async () => {
  const port = createEnvironmentInfraCredentialPort({});
  const persisted = await port.persistAsync(bundleReference, { value: 'secret' });

  expect(persisted.ok).toBe(false);
  expect(persisted.diagnostics).toEqual([
    {
      severity: 'error',
      code: 'infra-control-plane-credential-persistence-unavailable',
      message:
        'Control-plane credential FIXTURE_BOOTSTRAP cannot be persisted by the environment-only credential source.',
    },
  ]);
});
