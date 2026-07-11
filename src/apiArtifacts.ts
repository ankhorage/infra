import type { AppDataManifest } from '@ankhorage/contracts';

import {
  type ApiInfrastructureArtifacts,
  generateApiInfrastructureArtifacts as generateRawApiInfrastructureArtifacts,
} from './apis';

const GENERATED_API_HANDLERS_PATH = 'src/generated/apis/apiHandlers.ts';

export type { ApiInfrastructureArtifacts } from './apis';

export function generateApiInfrastructureArtifacts(args: {
  readonly data: AppDataManifest | undefined;
  readonly databaseProvider: string | undefined;
}): ApiInfrastructureArtifacts {
  const artifacts = generateRawApiInfrastructureArtifacts(args);

  return {
    ...artifacts,
    files: artifacts.files.map((file) =>
      file.path === GENERATED_API_HANDLERS_PATH
        ? { ...file, content: makeGeneratedApiHandlersLintSafe(file.content) }
        : file,
    ),
  };
}

function makeGeneratedApiHandlersLintSafe(source: string): string {
  let result = source;

  result = replaceGeneratedSnippet(
    result,
    '    async list(apiId: string): Promise<readonly GeneratedApiRecord[]> {',
    '    list(apiId: string): Promise<readonly GeneratedApiRecord[]> {',
  );
  result = replaceGeneratedSnippet(
    result,
    '      return getRows(records, apiId).map(cloneRecord);',
    '      return Promise.resolve(getRows(records, apiId).map(cloneRecord));',
  );
  result = replaceGeneratedSnippet(
    result,
    '    async read(apiId: string, id: string): Promise<GeneratedApiRecord | null> {',
    '    read(apiId: string, id: string): Promise<GeneratedApiRecord | null> {',
  );
  result = replaceGeneratedSnippet(
    result,
    '      if (primaryKey === null) return null;',
    '      if (primaryKey === null) return Promise.resolve(null);',
    3,
  );
  result = replaceGeneratedSnippet(
    result,
    '      return record === undefined ? null : cloneRecord(record);',
    '      return Promise.resolve(record === undefined ? null : cloneRecord(record));',
  );
  result = replaceGeneratedSnippet(
    result,
    '    async create(apiId: string, values: GeneratedApiRecord): Promise<GeneratedApiRecord> {',
    '    create(apiId: string, values: GeneratedApiRecord): Promise<GeneratedApiRecord> {',
  );
  result = replaceGeneratedSnippet(
    result,
    '      return cloneRecord(nextRecord);',
    '      return Promise.resolve(cloneRecord(nextRecord));',
    2,
  );
  result = replaceGeneratedSnippet(result, '    async update(\n', '    update(\n');
  result = replaceGeneratedSnippet(
    result,
    '      if (index < 0) return null;',
    '      if (index < 0) return Promise.resolve(null);',
  );
  result = replaceGeneratedSnippet(
    result,
    '    async delete(apiId: string, id: string): Promise<GeneratedApiRecord | null> {',
    '    delete(apiId: string, id: string): Promise<GeneratedApiRecord | null> {',
  );
  result = replaceGeneratedSnippet(
    result,
    '      if (deleted === undefined) return null;',
    '      if (deleted === undefined) return Promise.resolve(null);',
  );
  result = replaceGeneratedSnippet(
    result,
    '      return cloneRecord(deleted);',
    '      return Promise.resolve(cloneRecord(deleted));',
  );

  return result;
}

function replaceGeneratedSnippet(
  source: string,
  snippet: string,
  replacement: string,
  expectedCount = 1,
): string {
  const count = source.split(snippet).length - 1;
  if (count !== expectedCount) {
    throw new Error(
      `Expected generated API handler snippet ${JSON.stringify(snippet)} ${expectedCount} time(s), found ${count}.`,
    );
  }

  return source.replaceAll(snippet, replacement);
}
