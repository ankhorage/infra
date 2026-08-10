import type { GeneratedApiRegistry } from '@ankhorage/contracts';
import { describe, expect, test } from 'bun:test';

import { generateGeneratedApiDatabaseArtifacts } from './generatedApiDatabase';
import { generateInfrastructure } from './index';
import { createAppManifest } from './testSupport';
import type { InfraManifestInput } from './types';

function createGeneratedApis(): GeneratedApiRegistry {
  return {
    catalog: {
      id: 'catalog',
      protocol: 'rest',
      name: 'Catalog API',
      basePath: '/api/catalog',
      database: { id: 'primary-db', kind: 'database' },
      resources: [
        {
          id: 'products',
          path: '/products',
          operations: ['list', 'read', 'create', 'update', 'delete'],
          collection: {
            schema: 'app',
            name: 'products',
            primaryKey: 'id',
            fields: [
              { name: 'id', type: 'uuid', required: true, unique: true },
              { name: 'name', type: 'text', required: true, unique: true },
              { name: 'price', type: 'number', defaultValue: 12.5 },
              { name: 'active', type: 'boolean', defaultValue: true },
              { name: 'created_at', type: 'datetime' },
              { name: 'metadata', type: 'json' },
            ],
          },
          seed: [
            {
              name: 'Starter product',
              price: 9.5,
              active: true,
              metadata: { source: 'fixture' },
            },
          ],
        },
      ],
    },
  };
}

describe('generated API database bridge', () => {
  test('generates deterministic provider-owned database artifacts', () => {
    const input = {
      generatedApis: createGeneratedApis(),
      databaseProvider: 'supabase',
    } as const;
    const result = generateGeneratedApiDatabaseArtifacts(input);
    const rerun = generateGeneratedApiDatabaseArtifacts(input);
    const paths = result.files.map((file) => file.path);

    expect(result.files).toEqual(rerun.files);
    expect(result.diagnostics).toEqual([]);
    expect(paths).toEqual([
      'infra/minikube/db/generated-api-resources.json',
      'infra/minikube/db/generated-api-seed.json',
      'infra/minikube/db/migrations/001_generated_api_resources.sql',
      'infra/minikube/db/seeds/001_generated_api_seed.sql',
      'infra/minikube/db/README.md',
    ]);
    expect(paths.some((path) => path.startsWith('src/generated/apis/'))).toBe(false);
    expect(paths.some((path) => path.includes('/k8s/') && path.includes('api'))).toBe(false);
  });

  test('maps canonical collection fields to Supabase/Postgres SQL', () => {
    const result = generateGeneratedApiDatabaseArtifacts({
      generatedApis: createGeneratedApis(),
      databaseProvider: 'supabase',
    });
    const migration = result.files.find((file) =>
      file.path.endsWith('001_generated_api_resources.sql'),
    );

    expect(migration?.content).toContain('create schema if not exists "app";');
    expect(migration?.content).toContain('create table if not exists "app"."products"');
    expect(migration?.content).toContain('"id" uuid default gen_random_uuid() primary key');
    expect(migration?.content).toContain('"name" text not null unique');
    expect(migration?.content).toContain('"price" numeric default 12.5');
    expect(migration?.content).toContain('"active" boolean default true');
    expect(migration?.content).toContain('"created_at" timestamptz');
    expect(migration?.content).toContain('"metadata" jsonb');
  });

  test('materializes deterministic UUID primary keys for seed records', () => {
    const result = generateGeneratedApiDatabaseArtifacts({
      generatedApis: createGeneratedApis(),
      databaseProvider: 'supabase',
    });
    const seedJson = result.files.find((file) => file.path.endsWith('generated-api-seed.json'));
    const seedSql = result.files.find((file) => file.path.endsWith('001_generated_api_seed.sql'));

    expect(seedJson?.content).toMatch(/"id": "[0-9a-f-]{36}"/);
    expect(seedSql?.content).toContain('insert into "app"."products"');
    expect(seedSql?.content).toContain('Starter product');
    expect(seedSql?.content).toContain('on conflict ("id") do nothing');
  });

  test('enables RLS for explicit policy intent without inventing SQL policies', () => {
    const generatedApis = createGeneratedApis();
    const { catalog } = generatedApis;
    expect(catalog).toBeDefined();
    if (catalog === undefined) return;

    const [products] = catalog.resources;
    expect(products).toBeDefined();
    if (products === undefined) return;

    const result = generateGeneratedApiDatabaseArtifacts({
      generatedApis: {
        catalog: {
          ...catalog,
          resources: [{ ...products, policies: [{ id: 'products-read', operation: 'read' }] }],
        },
      },
      databaseProvider: 'supabase',
    });
    const migration = result.files.find((file) =>
      file.path.endsWith('001_generated_api_resources.sql'),
    );

    expect(migration?.content).toContain('alter table "app"."products" enable row level security;');
    expect(migration?.content).not.toContain('create policy');
    expect(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'unsupported-policy' && diagnostic.severity === 'warning',
      ),
    ).toBe(true);
  });

  test('returns structured diagnostics and no partial artifacts for invalid definitions', () => {
    const result = generateGeneratedApiDatabaseArtifacts({
      databaseProvider: 'supabase',
      generatedApis: {
        broken: {
          id: 'broken',
          protocol: 'rest',
          basePath: '/api/broken',
          database: { id: 'db', kind: 'database' },
          resources: [
            {
              id: 'items',
              path: '/items',
              operations: ['list'],
              collection: {
                name: 'invalid-name',
                primaryKey: 'missing_id',
                fields: [
                  { name: 'title', type: 'text', required: true },
                  { name: 'title', type: 'text' },
                ],
              },
              seed: [{ title: 'ok', extra: 'not-declared' }],
            },
          ],
        },
      },
    });
    const diagnosticCodes = result.diagnostics.map((diagnostic) => diagnostic.code);

    expect(result.files).toEqual([]);
    expect(diagnosticCodes).toContain('invalid-identifier');
    expect(diagnosticCodes).toContain('invalid-primary-key');
    expect(diagnosticCodes).toContain('duplicate-field');
    expect(diagnosticCodes).toContain('invalid-seed');
  });

  test('rejects two generated resources targeting the same database table', () => {
    const { catalog } = createGeneratedApis();
    expect(catalog).toBeDefined();
    if (catalog === undefined) return;

    const [products] = catalog.resources;
    expect(products).toBeDefined();
    if (products === undefined) return;

    const result = generateGeneratedApiDatabaseArtifacts({
      databaseProvider: 'supabase',
      generatedApis: {
        catalog: {
          ...catalog,
          resources: [products, { ...products, id: 'products-copy', path: '/products-copy' }],
        },
      },
    });

    expect(result.files).toEqual([]);
    expect(
      result.diagnostics.some(
        (diagnostic) => diagnostic.code === 'duplicate-target' && diagnostic.severity === 'error',
      ),
    ).toBe(true);
  });

  test('rejects seed values that do not match collection field types', () => {
    const { catalog } = createGeneratedApis();
    expect(catalog).toBeDefined();
    if (catalog === undefined) return;

    const [products] = catalog.resources;
    expect(products).toBeDefined();
    if (products === undefined) return;

    const result = generateGeneratedApiDatabaseArtifacts({
      databaseProvider: 'supabase',
      generatedApis: {
        catalog: {
          ...catalog,
          resources: [{ ...products, seed: [{ name: 'Broken product', price: 'free' }] }],
        },
      },
    });

    expect(result.files).toEqual([]);
    expect(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'invalid-seed' && diagnostic.path?.endsWith('seed.0.price') === true,
      ),
    ).toBe(true);
  });

  test('rejects null seed values for required fields and primary keys', () => {
    const { catalog } = createGeneratedApis();
    expect(catalog).toBeDefined();
    if (catalog === undefined) return;

    const [products] = catalog.resources;
    expect(products).toBeDefined();
    if (products === undefined) return;

    const result = generateGeneratedApiDatabaseArtifacts({
      databaseProvider: 'supabase',
      generatedApis: {
        catalog: {
          ...catalog,
          resources: [{ ...products, seed: [{ id: null, name: null }] }],
        },
      },
    });
    const invalidSeedPaths = result.diagnostics
      .filter((diagnostic) => diagnostic.code === 'invalid-seed')
      .map((diagnostic) => diagnostic.path);

    expect(result.files).toEqual([]);
    expect(invalidSeedPaths).toContain('generatedApis.catalog.resources.products.seed.0.id');
    expect(invalidSeedPaths).toContain('generatedApis.catalog.resources.products.seed.0.name');
  });

  test('uses SQL DEFAULT when seed records omit a column that another record supplies', () => {
    const generatedApis: GeneratedApiRegistry = {
      defaults: {
        id: 'defaults',
        protocol: 'rest',
        basePath: '/api/defaults',
        database: { id: 'db', kind: 'database' },
        resources: [
          {
            id: 'items',
            path: '/items',
            operations: ['list'],
            collection: {
              name: 'items',
              fields: [
                { name: 'name', type: 'text', required: true },
                { name: 'active', type: 'boolean', required: true, defaultValue: true },
              ],
            },
            seed: [{ name: 'A' }, { name: 'B', active: false }],
          },
        ],
      },
    };
    const result = generateGeneratedApiDatabaseArtifacts({
      databaseProvider: 'supabase',
      generatedApis,
    });
    const seedSql = result.files.find((file) => file.path.endsWith('001_generated_api_seed.sql'));

    expect(result.diagnostics).toEqual([]);
    expect(seedSql?.content).toContain("('A', default),\n  ('B', false)");
    expect(seedSql?.content).not.toContain("('A', null)");
  });

  test('rejects invalid UUID and datetime defaults before SQL generation', () => {
    const generatedApis: GeneratedApiRegistry = {
      invalidDefaults: {
        id: 'invalidDefaults',
        protocol: 'rest',
        basePath: '/api/defaults',
        database: { id: 'db', kind: 'database' },
        resources: [
          {
            id: 'items',
            path: '/items',
            operations: ['list'],
            collection: {
              name: 'items',
              fields: [
                { name: 'external_id', type: 'uuid', defaultValue: 'banana' },
                { name: 'created_at', type: 'datetime', defaultValue: 'not-a-date' },
              ],
            },
          },
        ],
      },
    };
    const result = generateGeneratedApiDatabaseArtifacts({
      databaseProvider: 'supabase',
      generatedApis,
    });

    expect(result.files).toEqual([]);
    expect(result.diagnostics.filter((diagnostic) => diagnostic.code === 'invalid-default')).toHaveLength(
      2,
    );
  });

  test('integrates generated DB artifacts without generating an API service workload', () => {
    const infra: InfraManifestInput = {
      deployment: { target: 'minikube', monitoring: false },
      database: { provider: 'supabase', tier: 'dev' },
      plugins: [],
    };
    const appManifest = {
      ...createAppManifest('catalog', infra),
      generatedApis: createGeneratedApis(),
    };
    const result = generateInfrastructure(infra, { appManifest });
    const paths = result.files.map((file) => file.path);

    expect(paths).toContain('infra/minikube/db/migrations/001_generated_api_resources.sql');
    expect(paths).not.toContain('src/generated/apis/appApi.ts');
    expect(paths).not.toContain('src/generated/apis/apiHandlers.ts');
    expect(paths).not.toContain('src/generated/apis/openapi.json');
    expect(paths).not.toContain('infra/minikube/k8s/generated-api/deployment.yaml');
    expect(paths).not.toContain('infra/minikube/k8s/generated-api/service.yaml');
  });

  test('generates no database bridge artifacts when no generated APIs exist', () => {
    const result = generateGeneratedApiDatabaseArtifacts({
      generatedApis: undefined,
      databaseProvider: 'supabase',
    });

    expect(result).toEqual({ files: [], diagnostics: [] });
  });
});
