import type {
  AppApiEndpointDefinition,
  AppDataManifest,
  AppGeneratedApiDefinition,
  DbFieldDefinition,
} from '@ankhorage/contracts';

import type { GeneratedInfrastructureFile } from './types';

export interface ApiInfrastructureArtifacts {
  readonly files: readonly GeneratedInfrastructureFile[];
  readonly warnings: readonly string[];
}

interface GeneratedApiResource {
  readonly api: AppGeneratedApiDefinition;
  readonly collection: NonNullable<AppGeneratedApiDefinition['resource']>['collection'];
  readonly seed: readonly Record<string, unknown>[];
}

interface GeneratedApiOperation {
  readonly apiId: string;
  readonly operationId: string;
  readonly intent: AppApiEndpointDefinition['intent'];
  readonly method: AppApiEndpointDefinition['method'];
  readonly path: string;
}

interface GeneratedApiOpenApiOperation {
  readonly operationId: string;
  readonly summary: string;
  readonly responses: Readonly<Record<string, { readonly description: string }>>;
  readonly 'x-ankh-api': {
    readonly apiId: string;
    readonly endpointId: string;
    readonly intent?: AppApiEndpointDefinition['intent'];
  };
}

interface GeneratedApiOpenApiPath {
  readonly delete?: GeneratedApiOpenApiOperation;
  readonly get?: GeneratedApiOpenApiOperation;
  readonly head?: GeneratedApiOpenApiOperation;
  readonly options?: GeneratedApiOpenApiOperation;
  readonly patch?: GeneratedApiOpenApiOperation;
  readonly post?: GeneratedApiOpenApiOperation;
  readonly put?: GeneratedApiOpenApiOperation;
}

interface GeneratedApiOpenApiDocument {
  readonly openapi: '3.1.0';
  readonly info: {
    readonly title: string;
    readonly version: string;
  };
  readonly paths: Readonly<Record<string, GeneratedApiOpenApiPath>>;
}

interface GeneratedApiSeedManifestEntry {
  readonly apiId: string;
  readonly collection: GeneratedApiResource['collection'];
  readonly records: readonly Record<string, unknown>[];
}

const DEFAULT_DATABASE_SCHEMA = 'public';

export function generateApiInfrastructureArtifacts(args: {
  readonly data: AppDataManifest | undefined;
  readonly databaseProvider: string | undefined;
}): ApiInfrastructureArtifacts {
  const generatedApis = listGeneratedApis(args.data);
  if (generatedApis.length === 0) return { files: [], warnings: [] };

  if (args.databaseProvider !== undefined && args.databaseProvider !== 'supabase') {
    return {
      files: [],
      warnings: [
        `API generation is only implemented for the supabase database provider; received ${args.databaseProvider}.`,
      ],
    };
  }

  const seedManifest = createSeedManifest(generatedApis);

  return {
    files: [
      {
        path: 'infra/minikube/db/apis.json',
        content: `${JSON.stringify(
          generatedApis.map((resource) => resource.collection),
          null,
          2,
        )}\n`,
      },
      {
        path: 'infra/minikube/db/api-seed.json',
        content: `${JSON.stringify(seedManifest, null, 2)}\n`,
      },
      {
        path: 'infra/minikube/db/migrations/001_apis.sql',
        content: generateSupabaseMigrationSql(generatedApis),
      },
      {
        path: 'infra/minikube/db/seeds/001_api_seed.sql',
        content: generateSupabaseSeedSql(seedManifest),
      },
      {
        path: 'infra/minikube/db/README.md',
        content: generateReadme(generatedApis),
      },
      {
        path: 'src/generated/apis/resources.ts',
        content: generateResourcesTs(generatedApis),
      },
      {
        path: 'src/generated/apis/appApi.ts',
        content: generateApiTs(generatedApis),
      },
      {
        path: 'src/generated/apis/apiHandlers.ts',
        content: generateApiHandlersTs(generatedApis, seedManifest),
      },
      {
        path: 'src/generated/apis/openapi.json',
        content: `${JSON.stringify(createOpenApi(generatedApis), null, 2)}\n`,
      },
    ],
    warnings: createSeedWarnings(generatedApis),
  };
}

function listGeneratedApis(data: AppDataManifest | undefined): readonly GeneratedApiResource[] {
  return Object.values(data?.apis ?? {})
    .filter((api): api is AppGeneratedApiDefinition => api.kind === 'generated')
    .filter((api) => api.resource?.kind === 'collection')
    .map((api) => ({
      api,
      collection: api.resource.collection,
      seed: materializeSeedRecords(api),
    }))
    .sort((left, right) => left.api.id.localeCompare(right.api.id));
}

function createSeedManifest(
  resources: readonly GeneratedApiResource[],
): readonly GeneratedApiSeedManifestEntry[] {
  return resources.map((resource) => ({
    apiId: resource.api.id,
    collection: resource.collection,
    records: resource.seed,
  }));
}

function materializeSeedRecords(api: AppGeneratedApiDefinition): readonly Record<string, unknown>[] {
  if (api.resource?.kind !== 'collection') {
    return [];
  }

  const { primaryKey } = api.resource.collection;
  const primaryKeyField = findPrimaryKeyField(api);

  return (api.resource.seed ?? []).map((record, index) => {
    if (primaryKey === undefined || record[primaryKey] !== undefined) {
      return record;
    }

    if (primaryKeyField?.type !== 'uuid') {
      return record;
    }

    return {
      ...record,
      [primaryKey]: createDeterministicSeedUuid(api.id, index),
    };
  });
}

function createSeedWarnings(resources: readonly GeneratedApiResource[]): readonly string[] {
  return resources.flatMap((resource) => {
    const { primaryKey } = resource.collection;
    const primaryKeyField = findPrimaryKeyField(resource.api);

    if (primaryKey === undefined || primaryKeyField?.type === 'uuid') {
      return [];
    }

    const hasMissingPrimaryKey = resource.seed.some((record) => record[primaryKey] === undefined);
    if (!hasMissingPrimaryKey) {
      return [];
    }

    return [
      `API ${resource.api.id} has seed records without primary key ${primaryKey}; seed SQL cannot fully guarantee idempotence for those records.`,
    ];
  });
}

function generateReadme(resources: readonly GeneratedApiResource[]): string {
  const rows = resources
    .map((resource) => {
      const seedCount = resource.seed.length;
      return `- \`${resource.api.id}\` maps to collection \`${formatCollectionName(resource)}\` with ${resource.collection.fields.length} fields and ${seedCount} starter records.`;
    })
    .join('\n');

  return `# Generated API Artifacts\n\nThese files are generated from API definitions.\n\n## APIs\n\n${rows}\n\n## Files\n\n- \`apis.json\` stores provider-neutral collection definitions for database adapters.\n- \`api-seed.json\` stores starter records configured for generated APIs, with deterministic UUID primary keys added when needed.\n- \`migrations/001_apis.sql\` creates Supabase/Postgres schemas and tables from generated API resource definitions.\n- \`seeds/001_api_seed.sql\` inserts starter records using idempotent conflict handling where possible.\n- \`src/generated/apis/appApi.ts\` exposes bindable API operation metadata.\n- \`src/generated/apis/apiHandlers.ts\` exposes app-owned handler helpers for generated API routes.\n- \`src/generated/apis/openapi.json\` exposes the generated API surface.\n`;
}

function generateResourcesTs(resources: readonly GeneratedApiResource[]): string {
  return `import type { AppGeneratedApiDefinition } from '@ankhorage/contracts';\n\nexport const GENERATED_APIS = ${JSON.stringify(
    resources.map((resource) => resource.api),
    null,
    2,
  )} as const satisfies readonly AppGeneratedApiDefinition[];\n`;
}

function generateApiTs(resources: readonly GeneratedApiResource[]): string {
  return `export interface GeneratedApiOperation {\n  readonly apiId: string;\n  readonly operationId: string;\n  readonly intent?: 'create' | 'custom' | 'delete' | 'list' | 'read' | 'update';\n  readonly method: 'DELETE' | 'GET' | 'HEAD' | 'OPTIONS' | 'PATCH' | 'POST' | 'PUT';\n  readonly path: string;\n}\n\nexport const GENERATED_API_OPERATIONS = ${JSON.stringify(
    resources.flatMap(createApiOperations),
    null,
    2,
  )} as const satisfies readonly GeneratedApiOperation[];\n`;
}

function generateApiHandlersTs(
  resources: readonly GeneratedApiResource[],
  seedManifest: readonly GeneratedApiSeedManifestEntry[],
): string {
  return `export type GeneratedApiRecord = Readonly<Record<string, unknown>>;\n\nexport interface GeneratedApiSeedManifestEntry {\n  readonly apiId: string;\n  readonly records: readonly GeneratedApiRecord[];\n}\n\nexport interface GeneratedApiStore {\n  list(apiId: string): Promise<readonly GeneratedApiRecord[]>;\n  read(apiId: string, id: string): Promise<GeneratedApiRecord | null>;\n  create(apiId: string, values: GeneratedApiRecord): Promise<GeneratedApiRecord>;\n  update(apiId: string, id: string, values: GeneratedApiRecord): Promise<GeneratedApiRecord | null>;\n  delete(apiId: string, id: string): Promise<GeneratedApiRecord | null>;\n}\n\nexport interface GeneratedApiRequest {\n  readonly apiId: string;\n  readonly id?: string;\n  readonly body?: GeneratedApiRecord;\n}\n\nexport interface GeneratedApiResponse<TData = unknown> {\n  readonly status: number;\n  readonly data: TData;\n}\n\nconst GENERATED_API_PRIMARY_KEYS = ${JSON.stringify(createPrimaryKeyRegistry(resources), null, 2)} as const satisfies Readonly<Record<string, string>>;\n\nexport const GENERATED_API_SEED = ${JSON.stringify(
    seedManifest.map((entry) => ({ apiId: entry.apiId, records: entry.records })),
    null,
    2,
  )} as const satisfies readonly GeneratedApiSeedManifestEntry[];\n\nexport function isGeneratedApiId(apiId: string): apiId is Extract<keyof typeof GENERATED_API_PRIMARY_KEYS, string> {\n  return Object.prototype.hasOwnProperty.call(GENERATED_API_PRIMARY_KEYS, apiId);\n}\n\nexport function getGeneratedApiPrimaryKey(apiId: string): string | null {\n  if (!isGeneratedApiId(apiId)) {\n    return null;\n  }\n\n  return GENERATED_API_PRIMARY_KEYS[apiId];\n}\n\nexport function createGeneratedApiMemoryStore(\n  seed: readonly GeneratedApiSeedManifestEntry[] = GENERATED_API_SEED,\n): GeneratedApiStore {\n  const records = new Map<string, GeneratedApiRecord[]>();\n\n  for (const apiId of Object.keys(GENERATED_API_PRIMARY_KEYS)) {\n    records.set(apiId, []);\n  }\n\n  for (const entry of seed) {\n    records.set(entry.apiId, entry.records.map(cloneRecord));\n  }\n\n  return {\n    async list(apiId: string): Promise<readonly GeneratedApiRecord[]> {\n      return getRows(records, apiId).map(cloneRecord);\n    },\n\n    async read(apiId: string, id: string): Promise<GeneratedApiRecord | null> {\n      const primaryKey = getGeneratedApiPrimaryKey(apiId);\n      if (primaryKey === null) return null;\n\n      const record = getRows(records, apiId).find((row) => String(row[primaryKey]) === id);\n      return record === undefined ? null : cloneRecord(record);\n    },\n\n    async create(apiId: string, values: GeneratedApiRecord): Promise<GeneratedApiRecord> {\n      const primaryKey = getGeneratedApiPrimaryKey(apiId);\n      const nextRecord =\n        primaryKey === null || values[primaryKey] !== undefined\n          ? cloneRecord(values)\n          : { ...values, [primaryKey]: createRuntimeRecordId() };\n      const nextRows = [...getRows(records, apiId), nextRecord];\n      records.set(apiId, nextRows);\n      return cloneRecord(nextRecord);\n    },\n\n    async update(\n      apiId: string,\n      id: string,\n      values: GeneratedApiRecord,\n    ): Promise<GeneratedApiRecord | null> {\n      const primaryKey = getGeneratedApiPrimaryKey(apiId);\n      if (primaryKey === null) return null;\n\n      const rows = getRows(records, apiId);\n      const index = rows.findIndex((row) => String(row[primaryKey]) === id);\n      if (index < 0) return null;\n\n      const currentRecord = rows[index] ?? {};\n      const nextRecord = { ...currentRecord, ...values, [primaryKey]: currentRecord[primaryKey] ?? id };\n      const nextRows = rows.map((row, rowIndex) => (rowIndex === index ? nextRecord : row));\n      records.set(apiId, nextRows);\n      return cloneRecord(nextRecord);\n    },\n\n    async delete(apiId: string, id: string): Promise<GeneratedApiRecord | null> {\n      const primaryKey = getGeneratedApiPrimaryKey(apiId);\n      if (primaryKey === null) return null;\n\n      const rows = getRows(records, apiId);\n      const deleted = rows.find((row) => String(row[primaryKey]) === id);\n      if (deleted === undefined) return null;\n\n      records.set(\n        apiId,\n        rows.filter((row) => String(row[primaryKey]) !== id),\n      );\n      return cloneRecord(deleted);\n    },\n  };\n}\n\nexport async function handleGeneratedApiList(\n  store: GeneratedApiStore,\n  request: GeneratedApiRequest,\n): Promise<GeneratedApiResponse> {\n  if (!isGeneratedApiId(request.apiId)) {\n    return notFoundResponse(request.apiId);\n  }\n\n  return { status: 200, data: await store.list(request.apiId) };\n}\n\nexport async function handleGeneratedApiRead(\n  store: GeneratedApiStore,\n  request: GeneratedApiRequest,\n): Promise<GeneratedApiResponse> {\n  if (!isGeneratedApiId(request.apiId) || request.id === undefined) {\n    return notFoundResponse(request.apiId);\n  }\n\n  const record = await store.read(request.apiId, request.id);\n  return record === null ? notFoundResponse(request.apiId) : { status: 200, data: record };\n}\n\nexport async function handleGeneratedApiCreate(\n  store: GeneratedApiStore,\n  request: GeneratedApiRequest,\n): Promise<GeneratedApiResponse> {\n  if (!isGeneratedApiId(request.apiId)) {\n    return notFoundResponse(request.apiId);\n  }\n\n  return { status: 201, data: await store.create(request.apiId, request.body ?? {}) };\n}\n\nexport async function handleGeneratedApiUpdate(\n  store: GeneratedApiStore,\n  request: GeneratedApiRequest,\n): Promise<GeneratedApiResponse> {\n  if (!isGeneratedApiId(request.apiId) || request.id === undefined) {\n    return notFoundResponse(request.apiId);\n  }\n\n  const record = await store.update(request.apiId, request.id, request.body ?? {});\n  return record === null ? notFoundResponse(request.apiId) : { status: 200, data: record };\n}\n\nexport async function handleGeneratedApiDelete(\n  store: GeneratedApiStore,\n  request: GeneratedApiRequest,\n): Promise<GeneratedApiResponse> {\n  if (!isGeneratedApiId(request.apiId) || request.id === undefined) {\n    return notFoundResponse(request.apiId);\n  }\n\n  const record = await store.delete(request.apiId, request.id);\n  return record === null ? notFoundResponse(request.apiId) : { status: 200, data: record };\n}\n\nfunction getRows(\n  records: ReadonlyMap<string, readonly GeneratedApiRecord[]>,\n  apiId: string,\n): readonly GeneratedApiRecord[] {\n  return records.get(apiId) ?? [];\n}\n\nfunction cloneRecord(record: GeneratedApiRecord): GeneratedApiRecord {\n  return { ...record };\n}\n\nfunction createRuntimeRecordId(): string {\n  const randomPart = Math.random().toString(16).slice(2);\n  return \`generated-\${Date.now()}-\${randomPart}\`;\n}\n\nfunction notFoundResponse(apiId: string): GeneratedApiResponse {\n  return {\n    status: 404,\n    data: {\n      error: \`Unknown API or record: \${apiId}\`,\n    },\n  };\n}\n`;
}

function createApiOperations(resource: GeneratedApiResource): readonly GeneratedApiOperation[] {
  return resource.api.endpoints.map((endpoint) => ({
    apiId: resource.api.id,
    operationId: endpoint.id,
    intent: endpoint.intent,
    method: endpoint.method,
    path: joinApiPath(resource.api.basePath, endpoint.path),
  }));
}

function createOpenApi(resources: readonly GeneratedApiResource[]): GeneratedApiOpenApiDocument {
  const paths: Record<string, GeneratedApiOpenApiPath> = {};

  for (const resource of resources) {
    for (const operation of createApiOperations(resource)) {
      const endpoint = resource.api.endpoints.find((candidate) => candidate.id === operation.operationId);
      addOpenApiOperation(paths, operation, {
        operationId: operation.operationId,
        summary: endpoint?.label ?? `${operation.intent ?? 'custom'} ${resource.api.label ?? resource.api.id}`,
        responses: {
          [operation.intent === 'create' ? '201' : '200']: { description: 'Successful response.' },
        },
        'x-ankh-api': {
          apiId: resource.api.id,
          endpointId: operation.operationId,
          ...(operation.intent === undefined ? {} : { intent: operation.intent }),
        },
      });
    }
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Generated app API',
      version: '1.0.0',
    },
    paths,
  };
}

function addOpenApiOperation(
  paths: Record<string, GeneratedApiOpenApiPath>,
  operation: GeneratedApiOperation,
  openApiOperation: GeneratedApiOpenApiOperation,
) {
  const path = paths[operation.path] ?? {};
  const method = operation.method.toLowerCase() as Lowercase<AppApiEndpointDefinition['method']>;
  paths[operation.path] = { ...path, [method]: openApiOperation };
}

function generateSupabaseMigrationSql(resources: readonly GeneratedApiResource[]): string {
  const statements = resources.flatMap((resource) => [
    `create schema if not exists ${quoteSqlIdentifier(resource.collection.schema ?? DEFAULT_DATABASE_SCHEMA)};`,
    generateCreateTableSql(resource),
  ]);

  return [
    '-- Generated from API definitions.',
    '-- Safe to re-run: schemas and tables are created with if not exists.',
    'create extension if not exists pgcrypto;',
    '',
    ...statements,
    '',
  ].join('\n');
}

function generateCreateTableSql(resource: GeneratedApiResource): string {
  const schema = quoteSqlIdentifier(resource.collection.schema ?? DEFAULT_DATABASE_SCHEMA);
  const table = quoteSqlIdentifier(resource.collection.name);
  const columns = collectSqlFields(resource).map((field) =>
    formatSqlColumn(field, field.name === (resource.collection.primaryKey ?? 'id')),
  );

  return `create table if not exists ${schema}.${table} (\n  ${columns.join(',\n  ')}\n);`;
}

function collectSqlFields(resource: GeneratedApiResource): readonly DbFieldDefinition[] {
  const primaryKey = resource.collection.primaryKey ?? 'id';
  const hasPrimaryKeyField = resource.collection.fields.some((field) => field.name === primaryKey);

  if (hasPrimaryKeyField) {
    return resource.collection.fields;
  }

  return [{ name: primaryKey, type: 'uuid', required: true, unique: true }, ...resource.collection.fields];
}

function generateSupabaseSeedSql(
  seedManifest: readonly GeneratedApiSeedManifestEntry[],
): string {
  const inserts = seedManifest.flatMap((entry) => generateSeedInsertStatements(entry));

  return [
    '-- Generated from API seed records.',
    '-- Safe to re-run when seed records have stable primary keys or unique constraints.',
    ...(inserts.length === 0 ? ['-- No API seed records configured.'] : inserts),
    '',
  ].join('\n');
}

function generateSeedInsertStatements(entry: GeneratedApiSeedManifestEntry): readonly string[] {
  if (entry.records.length === 0) {
    return [];
  }

  const { primaryKey } = entry.collection;
  const columns = collectSeedColumns(entry);
  if (columns.length === 0) {
    return [];
  }

  const schema = quoteSqlIdentifier(entry.collection.schema ?? DEFAULT_DATABASE_SCHEMA);
  const table = quoteSqlIdentifier(entry.collection.name);
  const quotedColumns = columns.map(quoteSqlIdentifier).join(', ');
  const values = entry.records
    .map((record) => `(${columns.map((column) => formatSqlValue(record[column])).join(', ')})`)
    .join(',\n  ');
  const conflict =
    primaryKey === undefined
      ? 'on conflict do nothing'
      : `on conflict (${quoteSqlIdentifier(primaryKey)}) do nothing`;

  return [`insert into ${schema}.${table} (${quotedColumns}) values\n  ${values}\n${conflict};`];
}

function collectSeedColumns(entry: GeneratedApiSeedManifestEntry): readonly string[] {
  const columns = new Set<string>();
  if (entry.collection.primaryKey !== undefined) {
    columns.add(entry.collection.primaryKey);
  }

  for (const field of entry.collection.fields) {
    if (entry.records.some((record) => record[field.name] !== undefined)) {
      columns.add(field.name);
    }
  }

  const fieldNames = new Set(entry.collection.fields.map((field) => field.name));
  const extraColumns = entry.records
    .flatMap((record) => Object.keys(record))
    .filter((column) => !fieldNames.has(column) && column !== entry.collection.primaryKey)
    .sort();

  for (const column of extraColumns) {
    columns.add(column);
  }

  return [...columns];
}

function formatSqlColumn(field: DbFieldDefinition, primaryKey: boolean): string {
  const defaultValue = formatSqlDefaultValue(field, primaryKey);
  const primaryKeyClause = primaryKey ? ' primary key' : '';
  const required = field.required === true && !primaryKey ? ' not null' : '';
  const unique = field.unique === true && !primaryKey ? ' unique' : '';

  return `${quoteSqlIdentifier(field.name)} ${mapSqlFieldType(field.type)}${defaultValue}${primaryKeyClause}${required}${unique}`;
}

function mapSqlFieldType(type: DbFieldDefinition['type']): string {
  switch (type) {
    case 'text':
      return 'text';
    case 'number':
      return 'double precision';
    case 'boolean':
      return 'boolean';
    case 'datetime':
      return 'timestamptz';
    case 'json':
      return 'jsonb';
    case 'uuid':
      return 'uuid';
  }
}

function formatSqlDefaultValue(field: DbFieldDefinition, primaryKey: boolean): string {
  if (primaryKey && field.type === 'uuid' && field.defaultValue === undefined) {
    return ' default gen_random_uuid()';
  }

  if (field.defaultValue === undefined) {
    return '';
  }

  if (field.defaultValue === null) {
    return ' default null';
  }

  if (typeof field.defaultValue === 'string') {
    return ` default '${escapeSqlString(field.defaultValue)}'`;
  }

  return ` default ${String(field.defaultValue)}`;
}

function formatSqlValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'string') {
    return `'${escapeSqlString(value)}'`;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'null';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'bigint') {
    return String(value);
  }

  return `'${escapeSqlString(stringifyJsonValue(value))}'::jsonb`;
}

function stringifyJsonValue(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return 'null';
  }
}

function quoteSqlIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function escapeSqlString(value: string): string {
  return value.replaceAll("'", "''");
}

function createPrimaryKeyRegistry(
  resources: readonly GeneratedApiResource[],
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    resources.map((resource) => [resource.api.id, resource.collection.primaryKey ?? 'id']),
  );
}

function findPrimaryKeyField(api: AppGeneratedApiDefinition): DbFieldDefinition | undefined {
  if (api.resource?.kind !== 'collection') {
    return undefined;
  }

  const { primaryKey } = api.resource.collection;
  if (primaryKey === undefined) {
    return undefined;
  }

  return api.resource.collection.fields.find((field) => field.name === primaryKey);
}

function createDeterministicSeedUuid(apiId: string, index: number): string {
  const input = `${apiId}:${index}`;
  const hex = `${hashHex(input, 0)}${hashHex(input, 1)}${hashHex(input, 2)}${hashHex(input, 3)}`;
  const variant = ((Number.parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function hashHex(input: string, salt: number): string {
  let hash = 2166136261 ^ salt;

  for (const char of input) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

function formatCollectionName(resource: GeneratedApiResource): string {
  return resource.collection.schema
    ? `${resource.collection.schema}.${resource.collection.name}`
    : resource.collection.name;
}

function joinApiPath(basePath: string, endpointPath: string): string {
  const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  const endpoint = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  return endpoint === '/' ? base || '/' : `${base}${endpoint}`;
}
