import type { AppManifest, NavigatorSpec, RouteDefinition } from '@ankhorage/contracts';
import { resolveAuthFlow } from '@ankhorage/contracts/auth';

import type { InfraManifestInput } from '../../../../types';
import type { MinikubeAdapterArtifacts } from '../../contracts';

const CERBOS_NAMESPACE = 'cerbos';

export function generateCerbosAuthzArtifacts(args: {
  manifest: InfraManifestInput;
  namespace: string;
  appManifest?: CerbosAppManifest;
}): MinikubeAdapterArtifacts {
  const { manifest, appManifest } = args;
  const namespace = CERBOS_NAMESPACE;

  const root = 'infra/minikube/k8s/authz/cerbos';
  const resourceRoot = 'authz/cerbos';
  const intent = buildCerbosPolicyIntent({ manifest, appManifest });

  return {
    files: [
      {
        path: `${root}/cerbos.configmap.yaml`,
        content: getCerbosConfigMap(namespace),
      },
      {
        path: `${root}/cerbos.policy.configmap.yaml`,
        content: getCerbosPolicyConfigMap({ namespace, intent }),
      },
      {
        path: `${root}/cerbos.deployment.yaml`,
        content: getCerbosDeployment(namespace),
      },
      {
        path: `${root}/cerbos.service.yaml`,
        content: getCerbosService(namespace),
      },
    ],
    resources: [
      `${resourceRoot}/cerbos.configmap.yaml`,
      `${resourceRoot}/cerbos.policy.configmap.yaml`,
      `${resourceRoot}/cerbos.deployment.yaml`,
      `${resourceRoot}/cerbos.service.yaml`,
    ],
    providerNamespaces: [namespace],
    envEntries: ['CERBOS_URL=http://cerbos.cerbos.svc.cluster.local:3592'],
    warnings: [],
  };
}

function getCerbosConfigMap(namespace: string) {
  return `apiVersion: v1
kind: ConfigMap
metadata:
  name: cerbos-config
  namespace: ${namespace}
data:
  config.yaml: |
    server:
      httpListenAddr: ":3592"
    storage:
      driver: "disk"
      disk:
        directory: /policies
`;
}

function getCerbosPolicyConfigMap(args: { namespace: string; intent: CerbosPolicyIntent }) {
  const { namespace, intent } = args;
  const entries = getCerbosPolicyEntries(intent);
  const renderedEntries = entries
    .map((entry) => {
      const indented = indentLines(entry.content, 4);
      return `  ${entry.key}: |
${indented}`;
    })
    .join('\n');

  return `apiVersion: v1
kind: ConfigMap
metadata:
  name: cerbos-policy
  namespace: ${namespace}
data:
${renderedEntries}
`;
}

function getCerbosDeployment(namespace: string) {
  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: cerbos
  namespace: ${namespace}
  labels:
    app.kubernetes.io/name: cerbos
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: cerbos
  template:
    metadata:
      labels:
        app.kubernetes.io/name: cerbos
    spec:
      containers:
        - name: cerbos
          image: ghcr.io/cerbos/cerbos:0.40.0
          args:
            - server
            - --config=/config/config.yaml
          ports:
            - containerPort: 3592
          volumeMounts:
            - name: cerbos-config
              mountPath: /config
            - name: cerbos-policy
              mountPath: /policies
      volumes:
        - name: cerbos-config
          configMap:
            name: cerbos-config
        - name: cerbos-policy
          configMap:
            name: cerbos-policy
`;
}

function getCerbosService(namespace: string) {
  return `apiVersion: v1
kind: Service
metadata:
  name: cerbos
  namespace: ${namespace}
spec:
  selector:
    app.kubernetes.io/name: cerbos
  ports:
    - name: http
      port: 3592
      targetPort: 3592
`;
}

const PUBLIC_GUARD_HINTS = new Set(['public', 'guest', 'anonymous', 'unauthenticated']);
const AUTH_GUARD_HINTS = new Set([
  'auth',
  'authenticated',
  'private',
  'protected',
  'requiresauth',
  'requires-auth',
]);

type CerbosAppManifest = Pick<AppManifest, 'metadata' | 'navigator' | 'screens'> & {
  infra?: AppManifest['infra'];
};

type AuthScope = NonNullable<InfraManifestInput['auth']>['scope'] | 'none';

interface CerbosRouteIntent {
  name: string;
  guards: string[];
  screenId?: string;
}

interface CerbosPolicyIntent {
  authScope: AuthScope;
  publicRoutes: string[];
  protectedRoutes: string[];
  publicScreens: string[];
  protectedScreens: string[];
}

interface CerbosPolicyEntry {
  key: string;
  content: string;
}

function getCerbosPolicyEntries(intent: CerbosPolicyIntent): CerbosPolicyEntry[] {
  const entries: CerbosPolicyEntry[] = [
    {
      key: 'app.resource_policy.yaml',
      content: getAppPolicy(intent),
    },
  ];

  if (intent.publicRoutes.length > 0 || intent.protectedRoutes.length > 0) {
    entries.push({
      key: 'route.resource_policy.yaml',
      content: getRoutePolicy(intent),
    });
  }

  if (intent.publicScreens.length > 0 || intent.protectedScreens.length > 0) {
    entries.push({
      key: 'screen.resource_policy.yaml',
      content: getScreenPolicy(intent),
    });
  }

  return entries;
}

function getAppPolicy(intent: CerbosPolicyIntent): string {
  const roles = intent.authScope === 'global' ? ['authenticated'] : ['anonymous', 'authenticated'];

  return `apiVersion: api.cerbos.dev/v1
resourcePolicy:
  version: "default"
  resource: "app"
  rules:
${indentLines(renderRule({ actions: ['*'], roles }), 4)}
`;
}

function getRoutePolicy(intent: CerbosPolicyIntent): string {
  const rules: string[] = [];

  if (intent.publicRoutes.length > 0) {
    rules.push(
      renderRule({
        actions: ['view', 'navigate'],
        roles: ['anonymous', 'authenticated'],
        conditionExpr: getInConditionExpr('route', intent.publicRoutes),
      }),
    );
  }

  if (intent.protectedRoutes.length > 0) {
    rules.push(
      renderRule({
        actions: ['view', 'navigate'],
        roles: ['authenticated'],
        conditionExpr: getInConditionExpr('route', intent.protectedRoutes),
      }),
    );
  }

  return `apiVersion: api.cerbos.dev/v1
resourcePolicy:
  version: "default"
  resource: "route"
  rules:
${indentLines(rules.join('\n'), 4)}
`;
}

function getScreenPolicy(intent: CerbosPolicyIntent): string {
  const rules: string[] = [];

  if (intent.publicScreens.length > 0) {
    rules.push(
      renderRule({
        actions: ['view', 'render'],
        roles: ['anonymous', 'authenticated'],
        conditionExpr: getInConditionExpr('screen_id', intent.publicScreens),
      }),
    );
  }

  if (intent.protectedScreens.length > 0) {
    rules.push(
      renderRule({
        actions: ['view', 'render'],
        roles: ['authenticated'],
        conditionExpr: getInConditionExpr('screen_id', intent.protectedScreens),
      }),
    );
  }

  return `apiVersion: api.cerbos.dev/v1
resourcePolicy:
  version: "default"
  resource: "screen"
  rules:
${indentLines(rules.join('\n'), 4)}
`;
}

function renderRule(args: { actions: string[]; roles: string[]; conditionExpr?: string }): string {
  const { actions, roles, conditionExpr } = args;

  const lines = [
    `- actions: ${JSON.stringify(actions)}`,
    '  effect: EFFECT_ALLOW',
    `  roles: ${JSON.stringify(roles)}`,
  ];

  if (conditionExpr) {
    lines.push('  condition:');
    lines.push('    match:');
    lines.push(`      expr: ${JSON.stringify(conditionExpr)}`);
  }

  return lines.join('\n');
}

function getInConditionExpr(attribute: string, values: string[]): string {
  return `request.resource.attr.${attribute} in ${JSON.stringify(values)}`;
}

function indentLines(content: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return content
    .trimEnd()
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

function buildCerbosPolicyIntent(args: {
  manifest: InfraManifestInput;
  appManifest?: CerbosAppManifest;
}): CerbosPolicyIntent {
  const { manifest, appManifest } = args;
  const authScope = manifest.auth?.scope ?? 'none';

  const routes = appManifest?.navigator ? flattenNavigatorRoutes(appManifest.navigator) : [];
  const flow = resolveAuthFlow(appManifest?.infra?.auth?.flow);
  const { signInRoute } = flow;
  const { signUpRoute } = flow;
  const { unauthorizedRoute } = flow;

  const publicRouteSet = new Set<string>();
  const protectedRouteSet = new Set<string>();

  for (const route of routes) {
    const isPublic = isPublicRoute({
      route,
      authScope,
      signInRoute,
      signUpRoute,
      unauthorizedRoute,
    });

    if (isPublic) {
      publicRouteSet.add(route.name);
    } else {
      protectedRouteSet.add(route.name);
    }
  }

  const screenVisibility = new Map<string, 'public' | 'protected'>();
  for (const route of routes) {
    if (!route.screenId) continue;
    const isPublic = publicRouteSet.has(route.name);

    const current = screenVisibility.get(route.screenId);
    if (current === 'protected') continue;
    screenVisibility.set(route.screenId, isPublic ? 'public' : 'protected');
  }

  if (appManifest?.screens) {
    const defaultVisibility: 'public' | 'protected' =
      authScope === 'global' ? 'protected' : 'public';

    for (const screenId of Object.keys(appManifest.screens)) {
      if (!screenVisibility.has(screenId)) {
        screenVisibility.set(screenId, defaultVisibility);
      }
    }
  }

  const publicScreens = [...screenVisibility.entries()]
    .filter(([, visibility]) => visibility === 'public')
    .map(([screenId]) => screenId)
    .sort();
  const protectedScreens = [...screenVisibility.entries()]
    .filter(([, visibility]) => visibility === 'protected')
    .map(([screenId]) => screenId)
    .sort();

  return {
    authScope,
    publicRoutes: [...publicRouteSet].sort(),
    protectedRoutes: [...protectedRouteSet].sort(),
    publicScreens,
    protectedScreens,
  };
}

function flattenNavigatorRoutes(navigator: NavigatorSpec): CerbosRouteIntent[] {
  const deduped = new Map<string, CerbosRouteIntent>();

  const walk = (current: NavigatorSpec) => {
    for (const route of current.routes) {
      const normalizedGuards = normalizeGuards(route.guards);
      const existing = deduped.get(route.name);
      deduped.set(route.name, {
        name: route.name,
        guards: unique([...(existing?.guards ?? []), ...normalizedGuards]),
        screenId: route.screenId ?? existing?.screenId,
      });

      if (route.navigator) {
        walk(route.navigator);
      }
    }
  };

  walk(navigator);
  return [...deduped.values()];
}

function normalizeGuards(guards?: RouteDefinition['guards']): string[] {
  return (guards ?? []).map((guard) => guard.trim().toLowerCase()).filter(Boolean);
}

function isPublicRoute(args: {
  route: CerbosRouteIntent;
  authScope: AuthScope;
  signInRoute?: string;
  signUpRoute?: string;
  unauthorizedRoute?: string;
}): boolean {
  const { route, authScope, signInRoute, signUpRoute, unauthorizedRoute } = args;
  const guardSet = new Set(route.guards);
  const signInRouteName = authFlowPathToRouteName(signInRoute);
  const signUpRouteName = authFlowPathToRouteName(signUpRoute);
  const unauthorizedRouteName = authFlowPathToRouteName(unauthorizedRoute);

  if (
    route.name === signInRouteName ||
    route.name === signUpRouteName ||
    route.name === unauthorizedRouteName
  ) {
    return true;
  }

  if (hasAny(guardSet, PUBLIC_GUARD_HINTS)) {
    return true;
  }

  if (hasAny(guardSet, AUTH_GUARD_HINTS)) {
    return false;
  }

  switch (authScope) {
    case 'none':
      return true;
    case 'global':
    default:
      return false;
  }
}

function hasAny(values: Set<string>, candidates: Set<string>): boolean {
  for (const candidate of candidates) {
    if (values.has(candidate)) return true;
  }
  return false;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function authFlowPathToRouteName(routePath: string | undefined): string | undefined {
  if (!routePath) {
    return undefined;
  }

  const normalized = routePath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  return normalized === '' ? 'index' : normalized;
}
