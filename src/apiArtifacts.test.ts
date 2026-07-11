import { describe, expect, test } from 'bun:test';

import { generateApiInfrastructureArtifacts } from './apiArtifacts';

describe('generated API artifacts', () => {
  test('emits lint-safe Promise-based memory-store methods', () => {
    const result = generateApiInfrastructureArtifacts({
      databaseProvider: 'supabase',
      data: {
        apis: {
          items: {
            id: 'items',
            kind: 'generated',
            label: 'Items',
            description: 'Generated items API.',
            basePath: '/api/items',
            preset: 'crud',
            resource: {
              kind: 'collection',
              collection: {
                name: 'items',
                primaryKey: 'id',
                fields: [
                  { name: 'id', type: 'uuid', required: true, unique: true },
                  { name: 'name', type: 'text', required: true },
                ],
              },
              seed: [],
            },
            endpoints: [
              {
                id: 'items.list',
                method: 'GET',
                path: '/',
                intent: 'list',
              },
            ],
          },
        },
      },
    });

    const handlers = result.files.find(
      (file) => file.path === 'src/generated/apis/apiHandlers.ts',
    );

    expect(handlers).toBeDefined();
    expect(handlers?.content).not.toMatch(/\basync (?:list|read|create|update|delete)\(/);
    expect(handlers?.content).toContain(
      'list(apiId: string): Promise<readonly GeneratedApiRecord[]>',
    );
    expect(handlers?.content).toContain(
      'return Promise.resolve(getRows(records, apiId).map(cloneRecord));',
    );
  });
});
