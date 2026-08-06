import type {
  DataContractValue,
  DbCollectionDefinition,
  DbFieldDefinition,
  GeneratedApiDefinition,
  GeneratedApiRegistry,
  GeneratedApiResourceDefinition,
  GeneratedApiSeedRecord,
} from '@ankhorage/contracts';

import type { GeneratedInfrastructureFile } from './types';

export type GeneratedApiDatabaseDiagnosticCode =
  | 'duplicate-field'
  | 'duplicate-resource-id'
  | 'duplicate-target'
  | 'invalid-default'
  | 'invalid-identifier'
  | 'invalid-primary-key'
  | 'invalid-seed'
  | 'registry-id-mismatch'
  | 'unsupported-policy'
  | 'unsupported-provider';

export interface GeneratedApiDatabaseDiagnostic {
  readonly code: GeneratedApiDatabaseDiagnosticCode;
  readonly severity: 'error' | 'warning';
  readonly apiId: string;
  readonly resourceId?: string;
  readonly path?: string;
  readonly message: string;
}

export interface GeneratedApiDatabaseArtifacts {
  readonly files: readonly GeneratedInfrastructureFile[];
  readonly diagnostics: readonly GeneratedApiDatabaseDiagnostic[];
}

interface GeneratedResourceContext {
  readonly api: GeneratedApiDefinition;
  readonly resource: GeneratedApiResourceDefinition;
  readonly seed: readonly GeneratedApiSeedRecord[];
}

interface GeneratedSeedEntry {
  readonly apiId: string;
  readonly resourceId: string;
  readonly collection: DbCollectionDefinition;
  readonly records: readonly GeneratedApiSeedRecord[];
}

const DEFAULT_DATABASE_SCHEMA = 'public';
const SQL_IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function generateGeneratedApiDatabaseArtifacts(args: {
  readonly generatedApis: GeneratedApiRegistry | undefined;
  readonly databaseProvider: string | undefined;
}): GeneratedApiDatabaseArtifacts {
  const contexts = listGeneratedResources(args.generatedApis);
  if (contexts.length === 0) return { files: [], diagnostics: [] };

  const diagnostics = validateGeneratedApiDatabaseState(
    args.generatedApis ?? {},
    contexts,
    args.databaseProvider,
  );
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { files: [], diagnostics };
  }

  const seedEntries = contexts.map(createSeedEntry);
  const metadata = contexts.map((context) => ({
    apiId: context.api.id,
    database: context.api.database,
    auth: context.api.auth ?? null,
    resourceId: context.resource.id,
    operations: context.resource.operations,
    collection: context.resource.collection,
    policies: context.resource.policies ?? [],
  }));

  return {
    files: [
      jsonFile('infra/minikube/db/generated-api-resources.json', metadata),
      jsonFile('infra/minikube/db/generated-api-seed.json', seedEntries),
      {
        path: 'infra/minikube/db/migrations/001_generated_api_resources.sql',
        content: generateMigrationSql(contexts),
      },
      {
        path: 'infra/minikube/db/seeds/001_generated_api_seed.sql',
        content: generateSeedSql(seedEntries),
      },
      {
        path: 'infra/minikube/db/README.md',
        content: generateReadme(contexts),
      },
    ],
    diagnostics,
  };
}

function listGeneratedResources(
  registry: GeneratedApiRegistry | undefined,
): readonly GeneratedResourceContext[] {
  return Object.values(registry ?? {})
    .sort((left, right) => left.id.localeCompare(right.id))
    .flatMap((api) =>
      [...api.resources]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((resource) => ({ api, resource, seed: resource.seed ?? [] })),
    );
}

function validateGeneratedApiDatabaseState(
  registry: GeneratedApiRegistry,
  contexts: readonly GeneratedResourceContext[],
  databaseProvider: string | undefined,
): readonly GeneratedApiDatabaseDiagnostic[] {
  const diagnostics: GeneratedApiDatabaseDiagnostic[] = [];
  const targets = new Map<string, GeneratedResourceContext>();
  const resourceIdsByApi = new Map<string, Set<string>>();

  if (databaseProvider !== 'supabase') {
    diagnostics.push({
      code: 'unsupported-provider',
      severity: 'error',
      apiId: contexts[0]?.api.id ?? 'generated-api',
      path: 'infra.database.provider',
      message: 'Generated API database resources currently require the supabase provider.',
    });
  }

  for (const [registryId, api] of Object.entries(registry)) {
    if (registryId !== api.id) {
      diagnostics.push({
        code: 'registry-id-mismatch',
        severity: 'error',
        apiId: api.id,
        path: `generatedApis.${registryId}.id`,
        message: `Generated API registry key '${registryId}' does not match definition id '${api.id}'.`,
      });
    }
  }

  for (const context of contexts) {
    const { api, resource } = context;
    const resourceIds = resourceIdsByApi.get(api.id) ?? new Set<string>();
    if (resourceIds.has(resource.id)) {
      diagnostics.push(
        resourceDiagnostic(
          context,
          'duplicate-resource-id',
          'id',
          `Resource ID '${resource.id}' is duplicated.`,
        ),
      );
    }
    resourceIds.add(resource.id);
    resourceIdsByApi.set(api.id, resourceIds);

    validateIdentifier(context, 'collection.name', resource.collection.name, diagnostics);
    validateIdentifier(
      context,
      'collection.schema',
      resource.collection.schema ?? DEFAULT_DATABASE_SCHEMA,
      diagnostics,
    );
    validateFields(context, diagnostics);
    validatePrimaryKey(context, diagnostics);
    validateSeeds(context, diagnostics);

    const target = `${resource.collection.schema ?? DEFAULT_DATABASE_SCHEMA}.${resource.collection.name}`;
    const previous = targets.get(target);
    if (previous !== undefined) {
      diagnostics.push(
        resourceDiagnostic(
          context,
          'duplicate-target',
          'collection',
          `Database target '${target}' is already owned by ${previous.api.id}/${previous.resource.id}.`,
        ),
      );
    } else {
      targets.set(target, context);
    }

    if ((resource.policies?.length ?? 0) > 0) {
      diagnostics.push(
        resourceDiagnostic(
          context,
          'unsupported-policy',
          'policies',
          'Policy references enable RLS, but the canonical contract does not yet contain provider-owned SQL policy expressions; no CREATE POLICY statement is emitted.',
          'warning',
        ),
      );
    }
  }

  return diagnostics;
}

function validateFields(
  context: GeneratedResourceContext,
  diagnostics: GeneratedApiDatabaseDiagnostic[],
): void {
  const fieldNames = new Set<string>();
  for (const field of context.resource.collection.fields) {
    validateIdentifier(context, `collection.fields.${field.name}.name`, field.name, diagnostics);
    if (fieldNames.has(field.name)) {
      diagnostics.push(
        resourceDiagnostic(
          context,
          'duplicate-field',
          `collection.fields.${field.name}`,
          `Field '${field.name}' is duplicated.`,
        ),
      );
    }
    fieldNames.add(field.name);

    if (!isCompatibleDefault(field)) {
      diagnostics.push(
        resourceDiagnostic(
          context,
          'invalid-default',
          `collection.fields.${field.name}.defaultValue`,
          `Default value for '${field.name}' is incompatible with field type '${field.type}'.`,
        ),
      );
    }
  }
}

function validatePrimaryKey(
  context: GeneratedResourceContext,
  diagnostics: GeneratedApiDatabaseDiagnostic[],
): void {
  const primaryKey = context.resource.collection.primaryKey;
  if (primaryKey === undefined) return;

  validateIdentifier(context, 'collection.primaryKey', primaryKey, diagnostics);
  if (!context.resource.collection.fields.some((field) => field.name === primaryKey)) {
    diagnostics.push(
      resourceDiagnostic(
        context,
        'invalid-primary-key',
        'collection.primaryKey',
        `Primary key '${primaryKey}' must reference a declared field.`,
      ),
    );
  }
}

function validateSeeds(
  context: GeneratedResourceContext,
  diagnostics: GeneratedApiDatabaseDiagnostic[],
): void {
  const fields = new Map(context.resource.collection.fields.map((field) => [field.name, field]));
  const primaryKey = context.resource.collection.primaryKey;

  context.seed.forEach((record, index) => {
    for (const key of Object.keys(record)) {
      if (!fields.has(key)) {
        diagnostics.push(
          resourceDiagnostic(
            context,
            'invalid-seed',
            `seed.${index}.${key}`,
            `Seed field '${key}' is not declared by the collection.`,
          ),
        );
      }
    }

    for (const field of fields.values()) {
      const generatedUuidPrimaryKey =
        field.name === primaryKey && field.type === 'uuid' && record[field.name] === undefined;
      if (
        field.required === true &&
        field.defaultValue === undefined &&
        record[field.name] === undefined &&
        !generatedUuidPrimaryKey
      ) {
        diagnostics.push(
          resourceDiagnostic(
            context,
            'invalid-seed',
            `seed.${index}.${field.name}`,
            `Seed record is missing required field '${field.name}'.`,
          ),
        );
      }
    }
  });
}

function validateIdentifier(
  context: GeneratedResourceContext,
  path: string,
  value: string,
  diagnostics: GeneratedApiDatabaseDiagnostic[],
): void {
  if (SQL_IDENTIFIER_RE.test(value)) return;
  diagnostics.push(
    resourceDiagnostic(
      context,
      'invalid-identifier',
      path,
      `Database identifier '${value}' must match ${SQL_IDENTIFIER_RE.source}.`,
    ),
  );
}

function resourceDiagnostic(
  context: GeneratedResourceContext,
  code: GeneratedApiDatabaseDiagnosticCode,
  path: string,
  message: string,
  severity: GeneratedApiDatabaseDiagnostic['severity'] = 'error',
): GeneratedApiDatabaseDiagnostic {
  return {
    code,
    severity,
    apiId: context.api.id,
    resourceId: context.resource.id,
    path: `generatedApis.${context.api.id}.resources.${context.resource.id}.${path}`,
    message,
  };
}

function isCompatibleDefault(field: DbFieldDefinition): boolean {
  const value = field.defaultValue;
  if (value === undefined || value === null) return true;

  switch (field.type) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'text':
    case 'datetime':
    case 'uuid':
      return typeof value === 'string';
    case 'json':
      return true;
  }
}

function createSeedEntry(context: GeneratedResourceContext): GeneratedSeedEntry {
  return {
    apiId: context.api.id,
    resourceId: context.resource.id,
    collection: context.resource.collection,
    records: context.seed.map((record, index) => materializeSeedRecord(context, record, index)),
  };
}

function materializeSeedRecord(
  context: GeneratedResourceContext,
  record: GeneratedApiSeedRecord,
  index: number,
): GeneratedApiSeedRecord {
  const primaryKey = context.resource.collection.primaryKey;
  if (primaryKey === undefined || record[primaryKey] !== undefined) return record;

  const primaryKeyField = context.resource.collection.fields.find(
    (field) => field.name === primaryKey,
  );
  if (primaryKeyField?.type !== 'uuid') return record;

  return {
    ...record,
    [primaryKey]: createDeterministicSeedUuid(context.api.id, context.resource.id, index),
  };
}

function generateMigrationSql(contexts: readonly GeneratedResourceContext[]): string {
  const statements = contexts.flatMap((context) => {
    const schema = quoteIdentifier(context.resource.collection.schema ?? DEFAULT_DATABASE_SCHEMA);
    const table = quoteIdentifier(context.resource.collection.name);
    const columns = context.resource.collection.fields.map((field) =>
      formatColumn(field, field.name === context.resource.collection.primaryKey),
    );
    const rls =
      (context.resource.policies?.length ?? 0) > 0
        ? [`alter table ${schema}.${table} enable row level security;`]
        : [];

    return [
      `create schema if not exists ${schema};`,
      `create table if not exists ${schema}.${table} (\n  ${columns.join(',\n  ')}\n);`,
      ...rls,
    ];
  });

  return [
    '-- Generated from canonical GeneratedApiDefinition resources.',
    '-- No HTTP/GraphQL service or Kubernetes API workload is generated here.',
    'create extension if not exists pgcrypto;',
    '',
    ...statements,
    '',
  ].join('\n');
}

function generateSeedSql(entries: readonly GeneratedSeedEntry[]): string {
  const statements = entries.flatMap((entry) => createSeedStatements(entry));
  return [
    '-- Generated from canonical generated API seed records.',
    ...(statements.length === 0 ? ['-- No generated API seed records configured.'] : statements),
    '',
  ].join('\n');
}

function createSeedStatements(entry: GeneratedSeedEntry): readonly string[] {
  if (entry.records.length === 0) return [];

  const columns = entry.collection.fields
    .map((field) => field.name)
    .filter((fieldName) => entry.records.some((record) => record[fieldName] !== undefined));
  if (columns.length === 0) return [];

  const schema = quoteIdentifier(entry.collection.schema ?? DEFAULT_DATABASE_SCHEMA);
  const table = quoteIdentifier(entry.collection.name);
  const values = entry.records
    .map((record) => `(${columns.map((column) => formatValue(record[column])).join(', ')})`)
    .join(',\n  ');
  const conflict =
    entry.collection.primaryKey === undefined
      ? 'on conflict do nothing'
      : `on conflict (${quoteIdentifier(entry.collection.primaryKey)}) do nothing`;

  return [
    `insert into ${schema}.${table} (${columns.map(quoteIdentifier).join(', ')}) values\n  ${values}\n${conflict};`,
  ];
}

function formatColumn(field: DbFieldDefinition, primaryKey: boolean): string {
  const defaultValue = formatDefault(field, primaryKey);
  const primaryKeyClause = primaryKey ? ' primary key' : '';
  const required = field.required === true && !primaryKey ? ' not null' : '';
  const unique = field.unique === true && !primaryKey ? ' unique' : '';
  return `${quoteIdentifier(field.name)} ${mapFieldType(field.type)}${defaultValue}${primaryKeyClause}${required}${unique}`;
}

function mapFieldType(type: DbFieldDefinition['type']): string {
  if (type === 'uuid') return 'uuid';
  if (type === 'text') return 'text';
  if (type === 'number') return 'numeric';
  if (type === 'boolean') return 'boolean';
  if (type === 'datetime') return 'timestamptz';
  return 'jsonb';
}

function formatDefault(field: DbFieldDefinition, primaryKey: boolean): string {
  if (primaryKey && field.type === 'uuid' && field.defaultValue === undefined) {
    return ' default gen_random_uuid()';
  }
  if (field.defaultValue === undefined) return '';
  return ` default ${formatValue(field.defaultValue)}`;
}

function formatValue(value: DataContractValue | undefined): string {
  if (value === undefined || value === null) return 'null';
  if (typeof value === 'string') return `'${escapeString(value)}'`;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return `'${escapeString(JSON.stringify(value))}'::jsonb`;
}

function generateReadme(contexts: readonly GeneratedResourceContext[]): string {
  const resources = contexts
    .map((context) => {
      const collection = context.resource.collection;
      return `- \`${context.api.id}/${context.resource.id}\` -> \`${collection.schema ?? DEFAULT_DATABASE_SCHEMA}.${collection.name}\``;
    })
    .join('\n');

  return `# Generated API Database Artifacts\n\nThese files materialize canonical generated API resources into Supabase/Postgres database infrastructure.\n\n${resources}\n\nNo HTTP/GraphQL server, Docker image, application handler, OpenAPI document, Kubernetes Deployment or Service is generated by this bridge.\n`;
}

function jsonFile(path: string, value: unknown): GeneratedInfrastructureFile {
  return { path, content: `${JSON.stringify(value, null, 2)}\n` };
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function escapeString(value: string): string {
  return value.replaceAll("'", "''");
}

function createDeterministicSeedUuid(apiId: string, resourceId: string, index: number): string {
  const input = `${apiId}:${resourceId}:${index}`;
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
