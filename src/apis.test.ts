import type { AppManifest } from '@ankhorage/contracts';
import { describe, expect, test } from 'bun:test';

import { generateInfrastructure } from './index';
import { createAppManifest } from './testSupport';
import type { InfraManifestInput } from './types';

describe('API infrastructure generation', () => {
  test('generates provider-neutral API, seed, handlers, and OpenAPI artifacts', () => {
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
        apis: {
          poker_situations: {
            id: 'poker_situations',
            kind: 'generated',
            label: 'Poker situations',
            description: 'App-owned poker trainer situations.',
            basePath: '/api/poker-situations',
            preset: 'crud',
            resource: {
              kind: 'collection',
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
            endpoints: [
              {
                id: 'poker_situations.list',
                method: 'GET',
                path: '/',
                intent: 'list',
              },
              {
                id: 'poker_situations.read',
                method: 'GET',
                path: '/{id}',
                intent: 'read',
              },
              {
                id: 'poker_situations.create',
                method: 'POST',
                path: '/',
                intent: 'create',
              },
              {
                id: 'poker_situations.leaderboard',
                method: 'GET',
                path: '/leaderboard',
                intent: 'custom',
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
    expect(paths).toContain('infra/minikube/db/apis.json');
    expect(paths).toContain('infra/minikube/db/api-seed.json');
    expect(paths).toContain('infra/minikube/db/migrations/001_apis.sql');
    expect(paths).toContain('infra/minikube/db/seeds/001_api_seed.sql');
    expect(paths).toContain('infra/minikube/db/README.md');
    expect(paths).toContain('src/generated/apis/resources.ts');
    expect(paths).toContain('src/generated/apis/appApi.ts');
    expect(paths).toContain('src/generated/apis/apiHandlers.ts');
    expect(paths).toContain('src/generated/apis/openapi.json');
    expect(paths.some((path) => path.includes('datasets'))).toBe(false);

    const resourcesFile = result.files.find(
      (file) => file.path === 'src/generated/apis/resources.ts',
    );
    expect(resourcesFile?.content).toContain('GENERATED_APIS');
    expect(resourcesFile?.content).toContain('poker_situations');
    expect(resourcesFile?.content).toContain('availableActions');

    const apiFile = result.files.find((file) => file.path === 'src/generated/apis/appApi.ts');
    expect(apiFile?.content).toContain('poker_situations.list');
    expect(apiFile?.content).toContain('/api/poker-situations');
    expect(apiFile?.content).toContain('poker_situations.read');
    expect(apiFile?.content).toContain('/api/poker-situations/{id}');
    expect(apiFile?.content).toContain('poker_situations.leaderboard');
    expect(apiFile?.content).toContain('/api/poker-situations/leaderboard');

    const handlersFile = result.files.find(
      (file) => file.path === 'src/generated/apis/apiHandlers.ts',
    );
    expect(handlersFile?.content).toContain('handleGeneratedApiList');
    expect(handlersFile?.content).toContain('handleGeneratedApiCreate');
    expect(handlersFile?.content).toContain('createGeneratedApiMemoryStore');
    expect(handlersFile?.content).toContain('poker_situations');
    expect(handlersFile?.content).not.toContain('Dataset');

    const openApiFile = result.files.find(
      (file) => file.path === 'src/generated/apis/openapi.json',
    );
    expect(openApiFile?.content).toContain('Generated app API');
    expect(openApiFile?.content).toContain('poker_situations.create');
    expect(openApiFile?.content).toContain('poker_situations.leaderboard');
    expect(openApiFile?.content).toContain('x-ankh-api');
    expect(openApiFile?.content).not.toContain('x-ankh-dataset');

    const migrationFile = result.files.find(
      (file) => file.path === 'infra/minikube/db/migrations/001_apis.sql',
    );
    expect(migrationFile?.content).toContain('create extension if not exists pgcrypto');
    expect(migrationFile?.content).toContain(
      'create table if not exists "public"."poker_situations"',
    );
    expect(migrationFile?.content).toContain('"id" uuid default gen_random_uuid() primary key');
    expect(migrationFile?.content).toContain('"availableActions" jsonb');

    const seedFile = result.files.find((file) => file.path === 'infra/minikube/db/api-seed.json');
    expect(seedFile?.content).toContain('Button faces a raise');
    expect(seedFile?.content).toContain('correctAction');
    expect(seedFile?.content).toContain('"id"');

    const seedSqlFile = result.files.find(
      (file) => file.path === 'infra/minikube/db/seeds/001_api_seed.sql',
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

    const result = generateInfrastructure(manifest, { appManifest: createAppManifest('cards') });

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
