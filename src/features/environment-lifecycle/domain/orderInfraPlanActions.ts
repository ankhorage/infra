import type {
  InfraPlanAction,
  InfraResourceIdentity,
  InfraResult,
} from '@ankhorage/contracts/infra';

/*** Order plan actions dependency-first and reject duplicate owners or dependency cycles. */
export function orderInfraPlanActions(
  actions: readonly InfraPlanAction[],
): InfraResult<readonly InfraPlanAction[]> {
  const byOwner = new Map(actions.map((action) => [identityKey(action.owner), action]));
  if (byOwner.size !== actions.length) return invalidPlan('duplicate resource actions');
  const ordered: InfraPlanAction[] = [];
  const complete = new Set<string>();
  const active = new Set<string>();
  for (const action of actions) {
    const result = visitAction(action, byOwner, ordered, complete, active);
    if (!result.ok) return result;
  }
  return { ok: true, value: ordered, diagnostics: [] };
}

/*** Visit one plan node and its in-plan dependencies exactly once. */
function visitAction(
  action: InfraPlanAction,
  byOwner: ReadonlyMap<string, InfraPlanAction>,
  ordered: InfraPlanAction[],
  complete: Set<string>,
  active: Set<string>,
): InfraResult<null> {
  const key = identityKey(action.owner);
  if (complete.has(key)) return { ok: true, value: null, diagnostics: [] };
  if (active.has(key)) return invalidPlan('a dependency cycle');
  active.add(key);
  for (const dependency of action.dependsOn) {
    const dependencyAction = byOwner.get(identityKey(dependency));
    if (dependencyAction === undefined) continue;
    const result = visitAction(dependencyAction, byOwner, ordered, complete, active);
    if (!result.ok) return result;
  }
  active.delete(key);
  complete.add(key);
  ordered.push(action);
  return { ok: true, value: null, diagnostics: [] };
}

/*** Create a collision-safe key for one provider-owned resource identity. */
function identityKey(identity: InfraResourceIdentity): string {
  return `${identity.projectId}\0${identity.environment}\0${identity.adapter}\0${identity.resourceId}`;
}

/*** Reject an invalid aggregated plan without exposing provider internals. */
function invalidPlan(detail: string): InfraResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'infra-plan-invalid',
        message: `The aggregated infrastructure plan contains ${detail}.`,
      },
    ],
  };
}
