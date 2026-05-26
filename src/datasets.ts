import type {
  AppDataManifest,
  AppDatasetDefinition,
  AppDatasetOperation,
  DbFieldDefinition,
} from '@ankhorage/contracts';

import type { GeneratedInfrastructureFile } from './types';

export interface DatasetInfrastructureArtifacts {
  readonly files: readonly GeneratedInfrastructureFile[];
  readonly warnings: readonly string[];
}

interface GeneratedDatasetOperation {
  readonly datasetId: string;
  readonly operationId: string;
  readonly intent: AppDatasetOperation;
  readonly method: 'DELETE' | 'GET' | 'PATCH' | 'POST';
  readonly path: string;
}

interface GeneratedDatasetOpenApiOperation {
  readonly operationId: string;
  readonly summary: string;
  readonly responses: Readonly<Record<string, { readonly description: string }>>;
  readonly 'x-ankh-dataset': {
    readonly datasetId: string;
    readonly intent: AppDatasetOperation;
  };
}

interface GeneratedDatasetOpenApiPath {
  readonly get?: GeneratedDatasetOpenApiOperation;
  readonly post?: GeneratedDatasetOpenApiOperation;
  readonly patch?: GeneratedDatasetOpenApiOperation;
  readonly delete?: GeneratedDatasetOpenApiOperation;
}

interface GeneratedDatasetOpenApiDocument {
  readonly openapi: '3.1.0';
  readonly info: {
    readonly title: string;
    readonly version: string;
  };
  readonly paths: Readonly<Record<string, GeneratedDatasetOpenApiPath>>;
}

interface GeneratedDatasetSeedManifestEntry {
  readonly datasetId: string;
  readonly collection: AppDatasetDefinition['collection'];
  readonly records: readonly Record<string, unknown>[];
}

const DEFAULT_DATASET_OPERATIONS: readonly AppDatasetOperation[] = [
  'create',
  'delete',
  'list',
  'read',
  'update',
];

const DEFAULT_DATABASE_SCHEMA = 'public';

export function generateDatasetInfrastructureArtifacts(args: {
  readonly data: AppDataManifest | undefined;
  readonly databaseProvider: string | undefined;
}): DatasetInfrastructureArtifacts {
  const datasets = listDatasets(args.data);
  if (datasets.length === 0) return { files: [], warnings: [] };

  if (args.databaseProvider !== undefined && args.databaseProvider !== 'supabase') {
    return {
      files: [],
      warnings: [
        `Dataset generation is only implemented for the supabase database provider; received ${args.databaseProvider}.`,
      ],
    };
  }

  const seedManifest = createSeedManifest(datasets);

  return {
    files: [
      {
        path: 'infra/minikube/db/datasets.json',
        content: `${JSON.stringify(
          datasets.map((dataset) => dataset.collection),
          null,
          2,
        )}\n`,
      },
      {
        path: 'infra/minikube/db/dataset-seed.json',
        content: `${JSON.stringify(seedManifest, null, 2)}\n`,
      },
      {
        path: 'infra/minikube/db/migrations/001_datasets.sql',
        content: generateSupabaseMigrationSql(datasets),
      },
      {
        path: 'infra/minikube/db/seeds/001_dataset_seed.sql',
        content: generateSupabaseSeedSql(seedManifest),
      },
      {
        path: 'infra/minikube/db/README.md',
        content: generateReadme(datasets),
      },
      {
        path: 'src/generated/datasets/collections.ts',
        content: generateCollectionsTs(datasets),
      },
      {
        path: 'src/generated/datasets/appDatasetApi.ts',
        content: generateApiTs(datasets),
      },
      {
        path: 'src/generated/datasets/datasetApiHandlers.ts',
        content: generateApiHandlersTs(datasets, seedManifest),
      },
      {
        path: 'src/generated/datasets/openapi.json',
        content: `${JSON.stringify(createOpenApi(datasets), null, 2)}\n`,
      },
    ],
    warnings: createSeedWarnings(datasets),
  };
}

function listDatasets(data: AppDataManifest | undefined): readonly AppDatasetDefinition[] {
  return Object.values(data?.datasets ?? {}).sort((left, right) => left.id.localeCompare(right.id));
}

function createSeedManifest(
  datasets: readonly AppDatasetDefinition[],
): readonly GeneratedDatasetSeedManifestEntry[] {
  return datasets.map((dataset) => ({
    datasetId: dataset.id,
    collection: dataset.collection,
    records: materializeSeedRecords(dataset),
  }));
}

function materializeSeedRecords(dataset: AppDatasetDefinition): readonly Record<string, unknown>[] {
  const { primaryKey } = dataset.collection;
  const primaryKeyField = findPrimaryKeyField(dataset);

  return (dataset.seed ?? []).map((record, index) => {
    if (primaryKey === undefined || record[primaryKey] !== undefined) {
      return record;
    }

    if (primaryKeyField?.type !== 'uuid') {
      return record;
    }

    return {
      ...record,
      [primaryKey]: createDeterministicSeedUuid(dataset.id, index),
    };
  });
}

function createSeedWarnings(datasets: readonly AppDatasetDefinition[]): readonly string[] {
  return datasets.flatMap((dataset) => {
    const { primaryKey } = dataset.collection;
    const seed = dataset.seed ?? [];
    const primaryKeyField = findPrimaryKeyField(dataset);

    if (primaryKey === undefined || primaryKeyField?.type === 'uuid') {
      return [];
    }

    const hasMissingPrimaryKey = seed.some((record) => record[primaryKey] === undefined);
    if (!hasMissingPrimaryKey) {
      return [];
    }

    return [
      `Dataset ${dataset.id} has seed records without primary key ${primaryKey}; seed SQL cannot fully guarantee idempotence for those records.`,
    ];
  });
}

function generateReadme(datasets: readonly AppDatasetDefinition[]): string {
  const rows = datasets
    .map((dataset) => {
      const seedCount = dataset.seed?.length ?? 0;
      return `- \`${dataset.id}\` maps to collection \`${formatCollectionName(dataset)}\` with ${dataset.collection.fields.length} fields and ${seedCount} starter records.`;
    })
    .join('\n');

  return `# Generated Dataset Artifacts\n\nThese files are generated from \`ankh.config.json\` -> \`data.datasets\`.\n\n## Datasets\n\n${rows}\n\n## Files\n\n- \`datasets.json\` stores provider-neutral collection definitions for database adapters.\n- \`dataset-seed.json\` stores starter records configured in Studio, with deterministic UUID primary keys added when needed.\n- \`migrations/001_datasets.sql\` creates Supabase/Postgres schemas and tables from the dataset collection definitions.\n- \`seeds/001_dataset_seed.sql\` inserts starter records using idempotent conflict handling where possible.\n- \`src/generated/datasets/appDatasetApi.ts\` exposes bindable dataset operation metadata.\n- \`src/generated/datasets/datasetApiHandlers.ts\` exposes app-owned CRUD handler helpers for generated dataset routes.\n- \`src/generated/datasets/openapi.json\` exposes the generated dataset API surface.\n`;
}

function generateCollectionsTs(datasets: readonly AppDatasetDefinition[]): string {
  return `import type { AppDatasetDefinition } from '@ankhorage/contracts';\n\nexport const GENERATED_DATASETS = ${JSON.stringify(
    datasets,
    null,
    2,
  )} as const satisfies readonly AppDatasetDefinition[];\n`;
}

function generateApiTs(datasets: readonly AppDatasetDefinition[]): string {
  return `export interface GeneratedDatasetOperation {\n  readonly datasetId: string;\n  readonly operationId: string;\n  readonly intent: 'create' | 'delete' | 'list' | 'read' | 'update';\n  readonly method: 'DELETE' | 'GET' | 'PATCH' | 'POST';\n  readonly path: string;\n}\n\nexport const GENERATED_DATASET_OPERATIONS = ${JSON.stringify(
    datasets.flatMap(createDatasetOperations),
    null,
    2,
  )} as const satisfies readonly GeneratedDatasetOperation[];\n`;
}

function generateApiHandlersTs(
  datasets: readonly AppDatasetDefinition[],
  seedManifest: readonly GeneratedDatasetSeedManifestEntry[],
): string {
  return `export type GeneratedDatasetRecord = Readonly<Record<string, unknown>>;\n\nexport interface GeneratedDatasetSeedManifestEntry {\n  readonly datasetId: string;\n  readonly records: readonly GeneratedDatasetRecord[];\n}\n\nexport interface GeneratedDatasetStore {\n  list(datasetId: string): Promise<readonly GeneratedDatasetRecord[]>;\n  read(datasetId: string, id: string): Promise<GeneratedDatasetRecord | null>;\n  create(datasetId: string, values: GeneratedDatasetRecord): Promise<GeneratedDatasetRecord>;\n  update(datasetId: string, id: string, values: GeneratedDatasetRecord): Promise<GeneratedDatasetRecord | null>;\n  delete(datasetId: string, id: string): Promise<GeneratedDatasetRecord | null>;\n}\n\nexport interface GeneratedDatasetRequest {\n  readonly datasetId: string;\n  readonly id?: string;\n  readonly body?: GeneratedDatasetRecord;\n}\n\nexport interface GeneratedDatasetResponse<TData = unknown> {\n  readonly status: number;\n  readonly data: TData;\n}\n\nconst GENERATED_DATASET_PRIMARY_KEYS = ${JSON.stringify(createPrimaryKeyRegistry(datasets), null, 2)} as const satisfies Readonly<Record<string, string>>;\n\nexport const GENERATED_DATASET_SEED = ${JSON.stringify(
    seedManifest.map((entry) => ({ datasetId: entry.datasetId, records: entry.records })),
    null,
    2,
  )} as const satisfies readonly GeneratedDatasetSeedManifestEntry[];\n\nexport function isGeneratedDatasetId(datasetId: string): datasetId is Extract<keyof typeof GENERATED_DATASET_PRIMARY_KEYS, string> {\n  return Object.prototype.hasOwnProperty.call(GENERATED_DATASET_PRIMARY_KEYS, datasetId);\n}\n\nexport function getGeneratedDatasetPrimaryKey(datasetId: string): string | null {\n  if (!isGeneratedDatasetId(datasetId)) {\n    return null;\n  }\n\n  return GENERATED_DATASET_PRIMARY_KEYS[datasetId];\n}\n\nexport function createGeneratedDatasetMemoryStore(\n  seed: readonly GeneratedDatasetSeedManifestEntry[] = GENERATED_DATASET_SEED,\n): GeneratedDatasetStore {\n  const records = new Map<string, GeneratedDatasetRecord[]>();\n\n  for (const datasetId of Object.keys(GENERATED_DATASET_PRIMARY_KEYS)) {\n    records.set(datasetId, []);\n  }\n\n  for (const entry of seed) {\n    records.set(entry.datasetId, entry.records.map(cloneRecord));\n  }\n\n  return {\n    async list(datasetId: string): Promise<readonly GeneratedDatasetRecord[]> {\n      return getRows(records, datasetId).map(cloneRecord);\n    },\n\n    async read(datasetId: string, id: string): Promise<GeneratedDatasetRecord | null> {\n      const primaryKey = getGeneratedDatasetPrimaryKey(datasetId);\n      if (primaryKey === null) return null;\n\n      const record = getRows(records, datasetId).find((row) => String(row[primaryKey]) === id);\n      return record === undefined ? null : cloneRecord(record);\n    },\n\n    async create(datasetId: string, values: GeneratedDatasetRecord): Promise<GeneratedDatasetRecord> {\n      const primaryKey = getGeneratedDatasetPrimaryKey(datasetId);\n      const nextRecord =\n        primaryKey === null || values[primaryKey] !== undefined\n          ? cloneRecord(values)\n          : { ...values, [primaryKey]: createRuntimeRecordId() };\n      const nextRows = [...getRows(records, datasetId), nextRecord];\n      records.set(datasetId, nextRows);\n      return cloneRecord(nextRecord);\n    },\n\n    async update(\n      datasetId: string,\n      id: string,\n      values: GeneratedDatasetRecord,\n    ): Promise<GeneratedDatasetRecord | null> {\n      const primaryKey = getGeneratedDatasetPrimaryKey(datasetId);\n      if (primaryKey === null) return null;\n\n      const rows = getRows(records, datasetId);\n      const index = rows.findIndex((row) => String(row[primaryKey]) === id);\n      if (index < 0) return null;\n\n      const currentRecord = rows[index] ?? {};\n      const nextRecord = { ...currentRecord, ...values, [primaryKey]: currentRecord[primaryKey] ?? id };\n      const nextRows = rows.map((row, rowIndex) => (rowIndex === index ? nextRecord : row));\n      records.set(datasetId, nextRows);\n      return cloneRecord(nextRecord);\n    },\n\n    async delete(datasetId: string, id: string): Promise<GeneratedDatasetRecord | null> {\n      const primaryKey = getGeneratedDatasetPrimaryKey(datasetId);\n      if (primaryKey === null) return null;\n\n      const rows = getRows(records, datasetId);\n      const deleted = rows.find((row) => String(row[primaryKey]) === id);\n      if (deleted === undefined) return null;\n\n      records.set(\n        datasetId,\n        rows.filter((row) => String(row[primaryKey]) !== id),\n      );\n      return cloneRecord(deleted);\n    },\n  };\n}\n\nexport async function handleGeneratedDatasetList(\n  store: GeneratedDatasetStore,\n  request: GeneratedDatasetRequest,\n): Promise<GeneratedDatasetResponse> {\n  if (!isGeneratedDatasetId(request.datasetId)) {\n    return notFoundResponse(request.datasetId);\n  }\n\n  return { status: 200, data: await store.list(request.datasetId) };\n}\n\nexport async function handleGeneratedDatasetRead(\n  store: GeneratedDatasetStore,\n  request: GeneratedDatasetRequest,\n): Promise<GeneratedDatasetResponse> {\n  if (!isGeneratedDatasetId(request.datasetId) || request.id === undefined) {\n    return notFoundResponse(request.datasetId);\n  }\n\n  const record = await store.read(request.datasetId, request.id);\n  return record === null ? notFoundResponse(request.datasetId) : { status: 200, data: record };\n}\n\nexport async function handleGeneratedDatasetCreate(\n  store: GeneratedDatasetStore,\n  request: GeneratedDatasetRequest,\n): Promise<GeneratedDatasetResponse> {\n  if (!isGeneratedDatasetId(request.datasetId)) {\n    return notFoundResponse(request.datasetId);\n  }\n\n  return { status: 201, data: await store.create(request.datasetId, request.body ?? {}) };\n}\n\nexport async function handleGeneratedDatasetUpdate(\n  store: GeneratedDatasetStore,\n  request: GeneratedDatasetRequest,\n): Promise<GeneratedDatasetResponse> {\n  if (!isGeneratedDatasetId(request.datasetId) || request.id === undefined) {\n    return notFoundResponse(request.datasetId);\n  }\n\n  const record = await store.update(request.datasetId, request.id, request.body ?? {});\n  return record === null ? notFoundResponse(request.datasetId) : { status: 200, data: record };\n}\n\nexport async function handleGeneratedDatasetDelete(\n  store: GeneratedDatasetStore,\n  request: GeneratedDatasetRequest,\n): Promise<GeneratedDatasetResponse> {\n  if (!isGeneratedDatasetId(request.datasetId) || request.id === undefined) {\n    return notFoundResponse(request.datasetId);\n  }\n\n  const record = await store.delete(request.datasetId, request.id);\n  return record === null ? notFoundResponse(request.datasetId) : { status: 200, data: record };\n}\n\nfunction getRows(\n  records: ReadonlyMap<string, readonly GeneratedDatasetRecord[]>,\n  datasetId: string,\n): readonly GeneratedDatasetRecord[] {\n  return records.get(datasetId) ?? [];\n}\n\nfunction cloneRecord(record: GeneratedDatasetRecord): GeneratedDatasetRecord {\n  return { ...record };\n}\n\nfunction createRuntimeRecordId(): string {\n  const randomPart = Math.random().toString(16).slice(2);\n  return \`generated-\${Date.now()}-\${randomPart}\`;\n}\n\nfunction notFoundResponse(datasetId: string): GeneratedDatasetResponse {\n  return {\n    status: 404,\n    data: {\n      error: \`Unknown dataset or record: \${datasetId}\`,\n    },\n  };\n}\n`;
}

function createDatasetOperations(
  dataset: AppDatasetDefinition,
): readonly GeneratedDatasetOperation[] {
  const operations = dataset.operations ?? DEFAULT_DATASET_OPERATIONS;
  return operations.map((operation) => createDatasetOperation(dataset.id, operation));
}

function createDatasetOperation(
  datasetId: string,
  operation: AppDatasetOperation,
): GeneratedDatasetOperation {
  const collectionPath = `/api/datasets/${datasetId}`;
  const recordPath = `${collectionPath}/{id}`;

  switch (operation) {
    case 'create':
      return {
        datasetId,
        operationId: `${datasetId}.create`,
        intent: operation,
        method: 'POST',
        path: collectionPath,
      };
    case 'delete':
      return {
        datasetId,
        operationId: `${datasetId}.delete`,
        intent: operation,
        method: 'DELETE',
        path: recordPath,
      };
    case 'list':
      return {
        datasetId,
        operationId: `${datasetId}.list`,
        intent: operation,
        method: 'GET',
        path: collectionPath,
      };
    case 'read':
      return {
        datasetId,
        operationId: `${datasetId}.read`,
        intent: operation,
        method: 'GET',
        path: recordPath,
      };
    case 'update':
      return {
        datasetId,
        operationId: `${datasetId}.update`,
        intent: operation,
        method: 'PATCH',
        path: recordPath,
      };
  }
}

function createOpenApi(datasets: readonly AppDatasetDefinition[]): GeneratedDatasetOpenApiDocument {
  const paths: Record<string, GeneratedDatasetOpenApiPath> = {};

  for (const dataset of datasets) {
    for (const operation of createDatasetOperations(dataset)) {
      addOpenApiOperation(paths, operation, {
        operationId: operation.operationId,
        summary: `${operation.intent} ${dataset.label ?? dataset.id}`,
        responses: {
          [operation.intent === 'create' ? '201' : '200']: { description: 'Successful response.' },
        },
        'x-ankh-dataset': {
          datasetId: dataset.id,
          intent: operation.intent,
        },
      });
    }
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Generated app dataset API',
      version: '1.0.0',
    },
    paths,
  };
}

function addOpenApiOperation(
  paths: Record<string, GeneratedDatasetOpenApiPath>,
  operation: GeneratedDatasetOperation,
  openApiOperation: GeneratedDatasetOpenApiOperation,
) {
  const path = paths[operation.path] ?? {};

  switch (operation.method) {
    case 'DELETE':
      paths[operation.path] = { ...path, delete: openApiOperation };
      return;
    case 'GET':
      paths[operation.path] = { ...path, get: openApiOperation };
      return;
    case 'PATCH':
      paths[operation.path] = { ...path, patch: openApiOperation };
      return;
    case 'POST':
      paths[operation.path] = { ...path, post: openApiOperation };
      return;
  }
}

function generateSupabaseMigrationSql(datasets: readonly AppDatasetDefinition[]): string {
  const statements = datasets.flatMap((dataset) => [
    `create schema if not exists ${quoteSqlIdentifier(dataset.collection.schema ?? DEFAULT_DATABASE_SCHEMA)};`,
    generateCreateTableSql(dataset),
  ]);

  return [
    '-- Generated from ankh.config.json -> data.datasets.',
    '-- Safe to re-run: schemas and tables are created with if not exists.',
    'create extension if not exists pgcrypto;',
    '',
    ...statements,
    '',
  ].join('\n');
}

function generateCreateTableSql(dataset: AppDatasetDefinition): string {
  const schema = quoteSqlIdentifier(dataset.collection.schema ?? DEFAULT_DATABASE_SCHEMA);
  const table = quoteSqlIdentifier(dataset.collection.name);
  const columns = collectSqlFields(dataset).map((field) =>
    formatSqlColumn(field, field.name === (dataset.collection.primaryKey ?? 'id')),
  );

  return `create table if not exists ${schema}.${table} (\n  ${columns.join(',\n  ')}\n);`;
}

function collectSqlFields(dataset: AppDatasetDefinition): readonly DbFieldDefinition[] {
  const primaryKey = dataset.collection.primaryKey ?? 'id';
  const hasPrimaryKeyField = dataset.collection.fields.some((field) => field.name === primaryKey);

  if (hasPrimaryKeyField) {
    return dataset.collection.fields;
  }

  return [
    { name: primaryKey, type: 'uuid', required: true, unique: true },
    ...dataset.collection.fields,
  ];
}

function generateSupabaseSeedSql(
  seedManifest: readonly GeneratedDatasetSeedManifestEntry[],
): string {
  const inserts = seedManifest.flatMap((entry) => generateSeedInsertStatements(entry));

  return [
    '-- Generated from ankh.config.json -> data.datasets seed records.',
    '-- Safe to re-run when seed records have stable primary keys or unique constraints.',
    ...(inserts.length === 0 ? ['-- No dataset seed records configured.'] : inserts),
    '',
  ].join('\n');
}

function generateSeedInsertStatements(entry: GeneratedDatasetSeedManifestEntry): readonly string[] {
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

function collectSeedColumns(entry: GeneratedDatasetSeedManifestEntry): readonly string[] {
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
  datasets: readonly AppDatasetDefinition[],
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    datasets.map((dataset) => [dataset.id, dataset.collection.primaryKey ?? 'id']),
  );
}

function findPrimaryKeyField(dataset: AppDatasetDefinition): DbFieldDefinition | undefined {
  const { primaryKey } = dataset.collection;
  if (primaryKey === undefined) {
    return undefined;
  }

  return dataset.collection.fields.find((field) => field.name === primaryKey);
}

function createDeterministicSeedUuid(datasetId: string, index: number): string {
  const input = `${datasetId}:${index}`;
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

function formatCollectionName(dataset: AppDatasetDefinition): string {
  return dataset.collection.schema
    ? `${dataset.collection.schema}.${dataset.collection.name}`
    : dataset.collection.name;
}
