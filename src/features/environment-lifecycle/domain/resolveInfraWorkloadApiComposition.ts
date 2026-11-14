import type {
  InfraDiagnostic,
  InfraManifest,
  InfraResult,
  InfraWorkloadSpec,
} from '@ankhorage/contracts/infra';

import type { InfraWorkloadApiAssignment } from '../../../types/infraWorkloadApiComposition.js';

/*** Resolve internal API declarations to exactly one declared workload without selecting HTTP transport. */
export function resolveInfraWorkloadApiComposition(
  manifest: InfraManifest,
  workloads: readonly InfraWorkloadSpec[],
): InfraResult<readonly InfraWorkloadApiAssignment[]> {
  const diagnostics: InfraDiagnostic[] = [];
  const assignments: InfraWorkloadApiAssignment[] = [];
  const apiDefinitions = new Map(Object.entries(manifest.apis ?? {}));
  const assignedWorkloads = new Map<string, string>();

  for (const workload of workloads) {
    for (const apiId of Object.keys(workload.apis?.apiIds ?? {})) {
      const api = apiDefinitions.get(apiId);
      if (api === undefined) {
        diagnostics.push(createMissingApiDiagnostic(workload.id, apiId));
        continue;
      }
      if (api.origin !== 'internal') {
        diagnostics.push(createExternalApiDiagnostic(workload.id, apiId));
        continue;
      }
      const assignedWorkloadId = assignedWorkloads.get(apiId);
      if (assignedWorkloadId !== undefined) {
        diagnostics.push(createDuplicateApiDiagnostic(apiId, assignedWorkloadId, workload.id));
        continue;
      }
      assignedWorkloads.set(apiId, workload.id);
      assignments.push({ apiId, workloadId: workload.id });
    }
  }

  return diagnostics.length === 0
    ? { ok: true, value: assignments, diagnostics }
    : { ok: false, diagnostics };
}

/*** Describe an API reference whose registry definition is unavailable to the desired state. */
function createMissingApiDiagnostic(workloadId: string, apiId: string) {
  return {
    severity: 'error' as const,
    code: 'infra-workload-api-missing',
    message: `Workload "${workloadId}" references API "${apiId}", but it is not declared in manifest.apis.`,
  };
}

/*** Describe an external API incorrectly claimed as a workload-served API. */
function createExternalApiDiagnostic(workloadId: string, apiId: string) {
  return {
    severity: 'error' as const,
    code: 'infra-workload-api-external',
    message: `Workload "${workloadId}" references external API "${apiId}"; only internal APIs may be served by workloads.`,
  };
}

/*** Describe the conflicting second workload for one internal API. */
function createDuplicateApiDiagnostic(
  apiId: string,
  assignedWorkloadId: string,
  workloadId: string,
) {
  return {
    severity: 'error' as const,
    code: 'infra-workload-api-duplicate',
    message: `Internal API "${apiId}" is assigned to both workloads "${assignedWorkloadId}" and "${workloadId}".`,
  };
}
