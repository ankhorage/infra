import path from 'path';

const INFRA_STATE_ROOT = '.ankh/infra';

/*** Resolve one generated path inside the project while protecting Infra state and traversal. */
export function resolveProjectFile(projectPath: string, filePath: string): string {
  if (
    filePath.length === 0 ||
    path.isAbsolute(filePath) ||
    filePath === INFRA_STATE_ROOT ||
    filePath.startsWith(`${INFRA_STATE_ROOT}/`)
  ) {
    throw new Error(`Invalid generated Infra artifact path: ${filePath}`);
  }
  const rootPath = path.resolve(projectPath);
  const resolvedPath = path.resolve(rootPath, filePath);
  const relativePath = path.relative(rootPath, resolvedPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Invalid generated Infra artifact path outside project root: ${filePath}`);
  }
  return resolvedPath;
}
