import type { InfraDiagnostic, InfraResult, InfraWorkloadSpec } from '@ankhorage/contracts/infra';

/*** Validate unique workload identities and an acyclic graph of declared workload dependencies. */
export function validateInfraWorkloadGraph(
  workloads: readonly InfraWorkloadSpec[],
): InfraResult<null> {
  const diagnostics = validateUniqueWorkloadIds(workloads);
  const workloadsById = new Map(workloads.map((workload) => [workload.id, workload]));

  for (const workload of workloads) {
    for (const dependencyId of Object.keys(workload.dependsOn ?? {})) {
      if (!workloadsById.has(dependencyId)) {
        diagnostics.push(createMissingDependencyDiagnostic(workload.id, dependencyId));
      }
    }
  }

  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const visited = new Set<string>();
  const visiting = new Set<string>();
  for (const workload of workloads) {
    const cycle = findDependencyCycle(workload.id, workloadsById, visited, visiting, []);
    if (cycle !== undefined) {
      diagnostics.push(createCycleDiagnostic(cycle));
      for (const cycleWorkloadId of cycle) visited.add(cycleWorkloadId);
      visiting.clear();
    }
  }

  return diagnostics.length === 0
    ? { ok: true, value: null, diagnostics }
    : { ok: false, diagnostics };
}

/*** Reject ambiguous workload identities before resolving graph edges. */
function validateUniqueWorkloadIds(workloads: readonly InfraWorkloadSpec[]): InfraDiagnostic[] {
  const workloadIds = new Set<string>();
  return workloads.flatMap((workload) => {
    if (!workloadIds.has(workload.id)) {
      workloadIds.add(workload.id);
      return [];
    }
    return [createDuplicateWorkloadDiagnostic(workload.id)];
  });
}

/*** Visit one workload's declared dependencies and return the first stable cycle path. */
function findDependencyCycle(
  workloadId: string,
  workloads: ReadonlyMap<string, InfraWorkloadSpec>,
  visited: Set<string>,
  visiting: Set<string>,
  path: readonly string[],
): readonly string[] | undefined {
  if (visiting.has(workloadId)) return cyclePath(path, workloadId);
  if (visited.has(workloadId)) return undefined;

  visiting.add(workloadId);
  const workload = workloads.get(workloadId);
  for (const dependencyId of Object.keys(workload?.dependsOn ?? {})) {
    const cycle = findDependencyCycle(dependencyId, workloads, visited, visiting, [
      ...path,
      workloadId,
    ]);
    if (cycle !== undefined) return cycle;
  }
  visiting.delete(workloadId);
  visited.add(workloadId);
  return undefined;
}

/*** Keep a reachable dependency prefix out of the reported cycle. */
function cyclePath(path: readonly string[], workloadId: string): readonly string[] {
  const cycleStart = path.indexOf(workloadId);
  return [...path.slice(cycleStart), workloadId];
}

/*** Describe an ambiguous workload identity in the composed desired state. */
function createDuplicateWorkloadDiagnostic(workloadId: string): InfraDiagnostic {
  return {
    severity: 'error',
    code: 'infra-workload-duplicate',
    message: `Workload "${workloadId}" is declared more than once.`,
  };
}

/*** Describe a workload dependency that is absent from the composed desired state. */
function createMissingDependencyDiagnostic(
  workloadId: string,
  dependencyId: string,
): InfraDiagnostic {
  return {
    severity: 'error',
    code: 'infra-workload-dependency-missing',
    message: `Workload "${workloadId}" depends on undeclared workload "${dependencyId}".`,
  };
}

/*** Describe a cycle that prevents dependency-first planning and reconciliation. */
function createCycleDiagnostic(cycle: readonly string[]): InfraDiagnostic {
  return {
    severity: 'error',
    code: 'infra-workload-dependency-cycle',
    message: `Workload dependencies contain a cycle: ${cycle.join(' -> ')}.`,
  };
}
