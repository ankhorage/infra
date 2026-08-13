import type { AppDeployTargets } from '@ankhorage/contracts/deploy';

interface AuthTargetRedirectModel {
  readonly nativeRedirectUris: readonly string[];
  readonly warnings: readonly string[];
  readonly webEnabled: boolean;
}

export function resolveAuthTargetRedirectModel(args: {
  readonly callbackRoute: string;
  readonly targets: AppDeployTargets | undefined;
}): AuthTargetRedirectModel {
  if (args.targets === undefined) {
    return {
      nativeRedirectUris: [],
      warnings: [
        'OAuth deploy.targets is missing; Infra keeps Web-local redirects only until canonical targets are persisted.',
      ],
      webEnabled: true,
    };
  }

  const callbackPath = args.callbackRoute.replace(/^\/+/u, '');
  const nativeRedirectUris: string[] = [];
  const warnings: string[] = [];

  for (const [targetId, target] of [
    ['android', args.targets.android],
    ['ios', args.targets.ios],
  ] as const) {
    if (target?.enabled !== true) continue;
    if (target.scheme === undefined) {
      warnings.push(
        `OAuth ${targetId} target is enabled but deploy.targets.${targetId}.scheme is missing; native callback omitted.`,
      );
      continue;
    }
    nativeRedirectUris.push(`${target.scheme}://${callbackPath}`);
  }

  return {
    nativeRedirectUris: [...new Set(nativeRedirectUris)],
    warnings,
    webEnabled: args.targets.web?.enabled === true,
  };
}
