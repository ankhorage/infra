import {
  AUTH_PROVIDERS,
  AUTH_SCOPES,
  AUTHZ_ENGINES,
  DATABASE_PROVIDERS,
  DEPLOYMENT_TARGETS,
} from '@ankhorage/contracts';

import type { InfraManifestInput } from './types.js';

export function validateInfraSupport(manifest: InfraManifestInput): readonly string[] {
  const warnings: string[] = [];

  const deploymentTarget = manifest.deployment?.target;
  if (deploymentTarget !== undefined && !isSupported(deploymentTarget, DEPLOYMENT_TARGETS)) {
    warnings.push(
      warningForUnsupportedValue({
        path: 'infra.deployment.target',
        value: deploymentTarget,
        supported: DEPLOYMENT_TARGETS,
      }),
    );
  }

  const databaseProvider = manifest.database?.provider;
  if (databaseProvider !== undefined && !isSupported(databaseProvider, DATABASE_PROVIDERS)) {
    warnings.push(
      warningForUnsupportedValue({
        path: 'infra.database.provider',
        value: databaseProvider,
        supported: DATABASE_PROVIDERS,
      }),
    );
  }

  const authProvider = manifest.auth?.provider;
  if (authProvider !== undefined && !isSupported(authProvider, AUTH_PROVIDERS)) {
    warnings.push(
      warningForUnsupportedValue({
        path: 'infra.auth.provider',
        value: authProvider,
        supported: AUTH_PROVIDERS,
      }),
    );
  }

  const authScope = manifest.auth?.scope;
  if (authScope !== undefined && !isSupported(authScope, AUTH_SCOPES)) {
    warnings.push(
      warningForUnsupportedValue({
        path: 'infra.auth.scope',
        value: authScope,
        supported: AUTH_SCOPES,
      }),
    );
  }

  const authzEngine = manifest.auth?.authorization.engine;
  if (authzEngine !== undefined && !isSupported(authzEngine, AUTHZ_ENGINES)) {
    warnings.push(
      warningForUnsupportedValue({
        path: 'infra.auth.authorization.engine',
        value: authzEngine,
        supported: AUTHZ_ENGINES,
      }),
    );
  }

  return warnings;
}

function warningForUnsupportedValue(args: {
  readonly path: string;
  readonly value: string;
  readonly supported: readonly string[];
}): string {
  return `${args.path} "${args.value}" is not currently supported by implemented generators. Supported values: ${formatSupportedValues(args.supported)}.`;
}

function formatSupportedValues(values: readonly string[]): string {
  if (values.length === 0) {
    return '(none)';
  }

  return values.join(', ');
}

function isSupported(value: string, supported: readonly string[]): boolean {
  return supported.includes(value);
}
