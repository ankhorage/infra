import type { AppManifest } from '@ankhorage/contracts';
import { describe, expect, test } from 'bun:test';

import { generateInfrastructure } from './index';
import type { InfraManifestInput } from './types';

describe('dataset infrastructure generation', () => {
  test('generates provider-neutral dataset, seed, API, and OpenAPI artifacts', () => {
    const manifest: InfraManifestInput = {
      deployment: {
        target: 'minikube',
        monitoring: false,
      },
      database: {
        provider: 'supabase',
        tier: 'dev',
      },
      plugins: [],
    };

    const appManifest: Pick<
      AppManifest,
      'data' | 'metadata' | 'navigator' | 'screens' | 'settings'
    > = {
      metadata: {
        name: 'Cards',
        slug: 'cards',
        version: '1.0.0',
        themeId: 'default',
      },
      data: {
        datasets: {
          poker_situations: {
            id: 'poker_situations',
            label: 'Poker situations',
            description: 'App-owned poker trainer situations.',
            collection: {
              name: 'poker_situations',
              primaryKey: 'id',
              fields: [
                { name: 'id', type: 'uuid', required: true, unique: true },
                { name: 'title', type: 'text', required: true },
                { name: 'description', type: 'text', required: true },
                { name: 'availableActions', type: 'json' },
                { name: 'correctAction', type: 'text' },
              ],
            },
            operations: ['list', 'read', 'create'],
            seed: [
              {
                title: 'Button faces a raise',
                description: 'Choose the best action with position and stack depth in mind.',
                availableActions: [
                  { label: 'Fold', value: 'fold' },
                  { label: 'Call', value: 'call' },
                  { label: 'Raise', value: 'raise' },
                ],
                correctAction: 'raise',
              },
            ],
          },
        },
      },
      navigator: {
        type: 'stack',
        routes: [],
      },
      screens: {},
      settings: {
        localization: {
          defaultLocale: 'en',
          locales: ['en'],
        },
        authFlow: {
          signInRoute: '/sign-in',
          signUpRoute: '/sign-up',
          signOutRoute: '/sign-out',
          unauthorizedRoute: '/sign-in',
          postSignInRoute: '/',
        },
      },
    };

    const result = generateInfrastructure(manifest, { namespaceHint: 'cards', appManifest });
    const rerun = generateInfrastructure(manifest, { namespaceHint: 'cards', appManifest });
    const paths = result.files.map((file) => file.path);

    expect(result.files).toEqual(rerun.files);
    expect(paths).toContain('infra/minikube/db/datasets.json');
    expect(paths).toContain('infra/minikube/db/dataset-seed.json');
    expect(paths).toContain('infra/minikube/db/migrations/001_datasets.sql');
    expect(paths).toContain('infra/minikube/db/seeds/001_dataset_seed.sql');
    expect(paths).toContain('infra/minikube/db/README.md');
    expect(paths).toContain('src/generated/datasets/collections.ts');
    expect(paths).toContain('src/generated/datasets/appDatasetApi.ts');
    expect(paths).toContain('src/generated/datasets/datasetApiHandlers.ts');
    expect(paths).toContain('src/generated/datasets/openapi.json');

    const collectionsFile = result.files.find(
      (file) => file.path === 'src/generated/datasets/collections.ts',
    );
    expect(collectionsFile?.content).toContain('GENERATED_DATASETS');
    expect(collectionsFile?.content).toContain('poker_situations');
    expect(collectionsFile?.content).toContain('availableActions');

    const apiFile = result.files.find(
      (file) => file.path === 'src/generated/datasets/appDatasetApi.ts',
    );
    expect(apiFile?.content).toContain('poker_situations.list');
    expect(apiFile?.content).toContain('/api/datasets/poker_situations');
    expect(apiFile?.content).toContain('poker_situations.read');
    expect(apiFile?.content).toContain('/api/datasets/poker_situations/{id}');

    const handlersFile = result.files.find(
      (file) => file.path === 'src/generated/datasets/datasetApiHandlers.ts',
    );
    expect(handlersFile?.content).toContain('handleGeneratedDatasetList');
    expect(handlersFile?.content).toContain('handleGeneratedDatasetCreate');
    expect(handlersFile?.content).toContain('createGeneratedDatasetMemoryStore');
    expect(handlersFile?.content).toContain('poker_situations');

    const openApiFile = result.files.find(
      (file) => file.path === 'src/generated/datasets/openapi.json',
    );
    expect(openApiFile?.content).toContain('Generated app dataset API');
    expect(openApiFile?.content).toContain('poker_situations.create');
    expect(openApiFile?.content).toContain('x-ankh-dataset');

    const migrationFile = result.files.find(
      (file) => file.path === 'infra/minikube/db/migrations/001_datasets.sql',
    );
    expect(migrationFile?.content).toContain('create extension if not exists pgcrypto');
    expect(migrationFile?.content).toContain(
      'create table if not exists "public"."poker_situations"',
    );
    expect(migrationFile?.content).toContain('"id" uuid default gen_random_uuid() primary key');
    expect(migrationFile?.content).toContain('"availableActions" jsonb');

    const seedFile = result.files.find(
      (file) => file.path === 'infra/minikube/db/dataset-seed.json',
    );
    expect(seedFile?.content).toContain('Button faces a raise');
    expect(seedFile?.content).toContain('correctAction');
    expect(seedFile?.content).toContain('"id"');

    const seedSqlFile = result.files.find(
      (file) => file.path === 'infra/minikube/db/seeds/001_dataset_seed.sql',
    );
    expect(seedSqlFile?.content).toContain('insert into "public"."poker_situations"');
    expect(seedSqlFile?.content).toContain('Button faces a raise');
    expect(seedSqlFile?.content).toContain('on conflict ("id") do nothing');
  });

  test('reports selected state adapter dependencies', () => {
    const manifest: InfraManifestInput = {
      deployment: {
        target: 'minikube',
        monitoring: false,
      },
      state: {
        provider: 'legend',
        persistence: 'none',
      },
      plugins: [],
    };

    const result = generateInfrastructure(manifest, { namespaceHint: 'cards' });

    expect(result.meta.providers).toContain('legend');
    expect(result.dependencies).toEqual([
      {
        name: '@ankhorage/state-legend',
        version: '^0.1.0',
        reason: 'Selected by infra.state.provider=legend.',
      },
    ]);
  });
});
