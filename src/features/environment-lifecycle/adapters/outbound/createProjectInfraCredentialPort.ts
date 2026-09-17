import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { AppEnvironmentId } from '@ankhorage/contracts/environments';
import type {
  InfraControlPlaneCredentialRef,
  InfraCredentialPort,
  InfraResult,
} from '@ankhorage/contracts/infra';

import { createInfraFailure } from '../../utils/createInfraFailure.js';
import { normalizeInfraEnvironmentKey } from '../../utils/normalizeInfraEnvironmentKey.js';
import { resolveInfraEnvironmentStateDirectory } from '../../utils/resolveInfraEnvironmentStateDirectory.js';
import { createEnvironmentInfraCredentialPort } from './createEnvironmentInfraCredentialPort.js';

interface ProjectInfraCredentialPortOptions {
  readonly projectPath: string;
  readonly environment: AppEnvironmentId;
  readonly processEnvironment: Readonly<Record<string, string | undefined>>;
}

interface StoredCredentialBundle {
  readonly schemaVersion: 1;
  readonly name: string;
  readonly values: Readonly<Record<string, string>>;
}

/*** Resolve explicit environment overrides before durable project-local bootstrap credentials. */
export function createProjectInfraCredentialPort(
  options: ProjectInfraCredentialPortOptions,
): InfraCredentialPort {
  const environmentPort = createEnvironmentInfraCredentialPort(options.processEnvironment);
  return {
    async findAsync(reference) {
      const overridden = await environmentPort.findAsync(reference);
      if (!overridden.ok || overridden.value !== null) return overridden;
      return readStoredCredentialAsync(options, reference);
    },
    async resolveAsync(reference) {
      const found = await this.findAsync(reference);
      if (!found.ok) return found;
      if (found.value !== null) {
        return { ok: true, value: found.value, diagnostics: found.diagnostics };
      }
      return missingCredential(reference.name);
    },
    async persistAsync(reference, values) {
      if (!isStringRecord(values)) {
        return createInfraFailure(
          'infra-control-plane-credential-invalid',
          `Control-plane credential ${reference.name} must contain only string fields.`,
        );
      }
      return writeStoredCredentialAsync(options, reference, values);
    },
  };
}

/*** Read one exact credential bundle without enumerating or exposing sibling credentials. */
async function readStoredCredentialAsync(
  options: ProjectInfraCredentialPortOptions,
  reference: InfraControlPlaneCredentialRef,
): Promise<InfraResult<Readonly<Record<string, string>> | null>> {
  const credentialPath = resolveCredentialPath(options, reference.name);
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(credentialPath, 'utf8'));
    if (!isStoredCredentialBundle(parsed) || parsed.name !== reference.name) {
      return invalidCredentialStore(reference.name);
    }
    return { ok: true, value: parsed.values, diagnostics: [] };
  } catch (error) {
    if (isMissingFile(error)) return { ok: true, value: null, diagnostics: [] };
    if (error instanceof SyntaxError) return invalidCredentialStore(reference.name);
    return createInfraFailure(
      'infra-control-plane-credential-store-read-failed',
      `Control-plane credential ${reference.name} could not be read from project state.`,
    );
  }
}

/*** Persist one opaque bundle atomically with restrictive local-host permissions. */
async function writeStoredCredentialAsync(
  options: ProjectInfraCredentialPortOptions,
  reference: InfraControlPlaneCredentialRef,
  values: Readonly<Record<string, string>>,
): Promise<InfraResult<null>> {
  const credentialPath = resolveCredentialPath(options, reference.name);
  const directory = path.dirname(credentialPath);
  const temporaryPath = `${credentialPath}.${process.pid}.${randomUUID()}.tmp`;
  const stored: StoredCredentialBundle = { schemaVersion: 1, name: reference.name, values };
  try {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await restrictPermissionsAsync(directory, 0o700);
    await fs.writeFile(temporaryPath, `${JSON.stringify(stored, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    await fs.rename(temporaryPath, credentialPath);
    await restrictPermissionsAsync(credentialPath, 0o600);
    return { ok: true, value: null, diagnostics: [] };
  } catch {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    return createInfraFailure(
      'infra-control-plane-credential-store-write-failed',
      `Control-plane credential ${reference.name} could not be persisted to project state.`,
    );
  }
}

/*** Resolve one credential to an opaque hash-named file inside its project/environment scope. */
function resolveCredentialPath(options: ProjectInfraCredentialPortOptions, name: string): string {
  const digest = createHash('sha256').update(name).digest('hex');
  return path.join(
    resolveInfraEnvironmentStateDirectory(options.projectPath, options.environment),
    'credentials',
    `${digest}.json`,
  );
}

/*** Apply owner-only permissions where the host platform supports POSIX file modes. */
async function restrictPermissionsAsync(targetPath: string, mode: number): Promise<void> {
  if (process.platform !== 'win32') await fs.chmod(targetPath, mode);
}

/*** Create the canonical missing-credential diagnostic after every trusted source was checked. */
function missingCredential(name: string): InfraResult<never> {
  const prefixedName = `ANKH_INFRA_CREDENTIAL_${normalizeInfraEnvironmentKey(name)}`;
  return createInfraFailure(
    'infra-control-plane-credential-missing',
    `Control-plane credential ${name} is unavailable. Set ${name} or ${prefixedName}.`,
  );
}

/*** Reject malformed persisted state without exposing or replacing any stored value. */
function invalidCredentialStore(name: string): InfraResult<never> {
  return createInfraFailure(
    'infra-control-plane-credential-store-invalid',
    `Stored control-plane credential ${name} has an invalid project-state shape.`,
  );
}

/*** Recognize the private stored credential record. */
function isStoredCredentialBundle(value: unknown): value is StoredCredentialBundle {
  if (!isRecord(value)) return false;
  return value.schemaVersion === 1 && typeof value.name === 'string' && isStringRecord(value.values);
}

/*** Recognize string-only opaque provider credential bundles. */
function isStringRecord(value: unknown): value is Readonly<Record<string, string>> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

/*** Narrow arbitrary JSON and filesystem error objects. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/*** Recognize only the filesystem's absent-file failure. */
function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}
