import { APP_ENVIRONMENT_IDS } from '@ankhorage/contracts/environments';
import {
  INFRA_ADAPTER_CATALOG,
  type InfraLedger,
  isInfraEnvironmentSpec,
} from '@ankhorage/contracts/infra';

import type { InfraStoredState } from '../../../types/infraOrchestration.js';

/*** Validate persisted ownership state before any provider receives it. */
export function isInfraStoredState(value: unknown): value is InfraStoredState {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    isInfraEnvironmentSpec(value.desired) &&
    isInfraLedger(value.ledger)
  );
}

/*** Validate the canonical ledger's serializable outer boundary. */
function isInfraLedger(value: unknown): value is InfraLedger {
  if (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    typeof value.projectId === 'string' &&
    typeof value.environment === 'string' &&
    APP_ENVIRONMENT_IDS.some((environment) => environment === value.environment) &&
    Array.isArray(value.targets) &&
    Array.isArray(value.resources) &&
    Array.isArray(value.outputs) &&
    Array.isArray(value.artifacts)
  ) {
    const { environment, projectId } = value;
    return (
      value.targets.every(isComputeTarget) &&
      value.resources.every((resource) => isOwnedResource(resource, projectId, environment)) &&
      value.outputs.every((output) => isOutput(output, projectId, environment)) &&
      value.artifacts.every((artifact) => isArtifactIdentity(artifact, projectId, environment))
    );
  }
  return false;
}

/*** Validate portable compute targets without accepting resolved credential payloads. */
function isComputeTarget(value: unknown): boolean {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !['linux', 'darwin', 'windows'].includes(String(value.os)) ||
    !['amd64', 'arm64'].includes(String(value.architecture))
  ) {
    return false;
  }
  if (value.kind === 'local-host') return true;
  return (
    value.kind === 'ssh-host' &&
    typeof value.host === 'string' &&
    typeof value.port === 'number' &&
    typeof value.user === 'string' &&
    typeof value.hostKeyFingerprint === 'string' &&
    isControlPlaneReference(value.credential)
  );
}

/*** Validate one exact resource plus its dependency identities. */
function isOwnedResource(value: unknown, projectId: string, environment: string): boolean {
  return (
    isRecord(value) &&
    isScopedIdentity(value.identity, projectId, environment) &&
    typeof value.persistent === 'boolean' &&
    (value.retention === 'retain' || value.retention === 'delete-on-destroy') &&
    Array.isArray(value.dependsOn) &&
    value.dependsOn.every((identity) => isScopedIdentity(identity, projectId, environment))
  );
}

/*** Enforce the public-value versus secret-reference output union at rest. */
function isOutput(value: unknown, projectId: string, environment: string): boolean {
  if (
    !isRecord(value) ||
    !isScopedIdentity(value.owner, projectId, environment) ||
    typeof value.name !== 'string'
  ) {
    return false;
  }
  if (value.visibility === 'public') {
    return (
      ['string', 'number', 'boolean'].includes(typeof value.value) &&
      value.reference === undefined &&
      (value.environmentVariable === undefined || typeof value.environmentVariable === 'string')
    );
  }
  return (
    value.visibility === 'secret' &&
    value.value === undefined &&
    value.environmentVariable === undefined &&
    isSecretReference(value.reference, projectId, environment)
  );
}

/*** Validate one generated-artifact ledger identity without accepting file content. */
function isArtifactIdentity(value: unknown, projectId: string, environment: string): boolean {
  return (
    isRecord(value) &&
    isScopedIdentity(value.owner, projectId, environment) &&
    typeof value.path === 'string'
  );
}

/*** Validate scope, adapter catalog identity, and resource ID. */
function isScopedIdentity(value: unknown, projectId: string, environment: string): boolean {
  return (
    isRecord(value) &&
    value.projectId === projectId &&
    value.environment === environment &&
    Object.values(INFRA_ADAPTER_CATALOG).some(({ id }) => id === value.adapter) &&
    typeof value.resourceId === 'string'
  );
}

/*** Validate an unresolved control-plane credential identity. */
function isControlPlaneReference(value: unknown): boolean {
  return isRecord(value) && value.source === 'control-plane' && typeof value.name === 'string';
}

/*** Validate an unresolved secret reference scoped to this exact ledger. */
function isSecretReference(value: unknown, projectId: string, environment: string): boolean {
  return (
    isRecord(value) &&
    value.source === 'secret-store' &&
    value.projectId === projectId &&
    value.environment === environment &&
    typeof value.ref === 'string' &&
    typeof value.key === 'string'
  );
}

/*** Narrow parsed values. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}
