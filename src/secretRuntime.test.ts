import { describe, expect, test } from 'bun:test';

import type {
  SecretCreateInput,
  SecretGetMetadataInput,
  SecretListInput,
  SecretMetadata,
  SecretPayload,
  SecretRemoveInput,
  SecretReplaceInput,
  SecretResolveInput,
  SecretStoreAdapter,
  SecretStoreResult,
} from '@ankhorage/contracts/secrets';

import { resolveSupabaseOAuthRuntimeEnvironment } from './secretRuntime';

const scope = { projectId: 'scanner', environment: 'local' };
const ref = 'auth/oauth/google';
const metadata: SecretMetadata = {
  ref,
  scope,
  kind: 'oauth',
  provider: 'google',
  configuredFields: ['clientId', 'clientSecret'],
  createdAt: '2026-07-11T18:00:00.000Z',
  updatedAt: '2026-07-11T18:00:00.000Z',
};

class FakeSecretStore implements SecretStoreAdapter {
  constructor(
    private readonly metadataResult: SecretStoreResult<SecretMetadata>,
    private readonly payloadResult: SecretStoreResult<SecretPayload>,
  ) {}

  list(_input: SecretListInput): Promise<SecretStoreResult<readonly SecretMetadata[]>> {
    return Promise.resolve({ ok: true, data: [] });
  }

  getMetadata(_input: SecretGetMetadataInput): Promise<SecretStoreResult<SecretMetadata>> {
    return Promise.resolve(this.metadataResult);
  }

  create(_input: SecretCreateInput): Promise<SecretStoreResult<SecretMetadata>> {
    return Promise.resolve(this.metadataResult);
  }

  replace(_input: SecretReplaceInput): Promise<SecretStoreResult<SecretMetadata>> {
    return Promise.resolve(this.metadataResult);
  }

  remove(_input: SecretRemoveInput): Promise<SecretStoreResult> {
    return Promise.resolve({ ok: true });
  }

  resolve(_input: SecretResolveInput): Promise<SecretStoreResult<SecretPayload>> {
    return Promise.resolve(this.payloadResult);
  }
}

describe('resolveSupabaseOAuthRuntimeEnvironment', () => {
  test('resolves and materializes Google credentials only at the trusted boundary', async () => {
    const secretStore = new FakeSecretStore(
      { ok: true, data: metadata },
      {
        ok: true,
        data: {
          clientId: 'google-client-id',
          clientSecret: 'sentinel-google-secret',
        },
      },
    );

    const result = await resolveSupabaseOAuthRuntimeEnvironment({
      secretStore,
      scope,
      providerCallbackUri: 'http://localhost:54321/auth/v1/callback',
      oauth: {
        enabled: true,
        callbackRoute: '/auth/callback',
        providers: [
          {
            id: 'google',
            enabled: true,
            credentialsRef: ref,
          },
        ],
      },
    });

    expect(result).toEqual({
      ok: true,
      data: {
        environment: {
          GOTRUE_EXTERNAL_GOOGLE_ENABLED: 'true',
          GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID: 'google-client-id',
          GOTRUE_EXTERNAL_GOOGLE_SECRET: 'sentinel-google-secret',
          GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI:
            'http://localhost:54321/auth/v1/callback',
        },
        providers: [
          {
            provider: 'google',
            credentialsRef: ref,
            configuredFields: ['clientId', 'clientSecret'],
          },
        ],
      },
    });
  });

  test('fails before resolving when metadata is incomplete', async () => {
    const secretStore = new FakeSecretStore(
      {
        ok: true,
        data: { ...metadata, configuredFields: ['clientId'] },
      },
      {
        ok: true,
        data: {
          clientId: 'google-client-id',
          clientSecret: 'sentinel-google-secret',
        },
      },
    );

    const result = await resolveSupabaseOAuthRuntimeEnvironment({
      secretStore,
      scope,
      providerCallbackUri: 'http://localhost:54321/auth/v1/callback',
      oauth: {
        enabled: true,
        callbackRoute: '/auth/callback',
        providers: [{ id: 'google', credentialsRef: ref }],
      },
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'invalid_payload',
        message: 'OAuth credentials for "google" are incomplete; missing fields: clientSecret.',
      },
    });
    expect(JSON.stringify(result)).not.toContain('sentinel-google-secret');
  });

  test('materializes disabled providers without reading secret payloads', async () => {
    const secretStore = new FakeSecretStore(
      { ok: false, error: { code: 'not_found', message: 'not found' } },
      { ok: false, error: { code: 'not_found', message: 'not found' } },
    );

    const result = await resolveSupabaseOAuthRuntimeEnvironment({
      secretStore,
      scope,
      providerCallbackUri: 'http://localhost:54321/auth/v1/callback',
      oauth: {
        enabled: false,
        callbackRoute: '/auth/callback',
        providers: [{ id: 'apple', enabled: false }],
      },
    });

    expect(result).toEqual({
      ok: true,
      data: {
        environment: { GOTRUE_EXTERNAL_APPLE_ENABLED: 'false' },
        providers: [],
      },
    });
  });

  test('requires credentialsRef for enabled providers', async () => {
    const secretStore = new FakeSecretStore(
      { ok: true, data: metadata },
      { ok: true, data: { clientId: 'id', clientSecret: 'secret' } },
    );

    const result = await resolveSupabaseOAuthRuntimeEnvironment({
      secretStore,
      scope,
      providerCallbackUri: 'http://localhost:54321/auth/v1/callback',
      oauth: {
        enabled: true,
        callbackRoute: '/auth/callback',
        providers: [{ id: 'google', enabled: true }],
      },
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'invalid_reference',
        message: 'Enabled OAuth provider "google" requires a credentialsRef.',
      },
    });
  });
});
