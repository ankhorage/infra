import {
  INFRA_ADAPTER_CATALOG,
  type InfraAdapterDescriptor,
  type InfraComputeAdapter,
  type InfraDiagnostic,
  type InfraEnvironmentSpec,
  type InfraResult,
  type InfraRuntimeAdapter,
  type InfraServiceAdapter,
  isInfraAdapterDescriptor,
  validateInfraAdapterSelection,
} from '@ankhorage/contracts/infra';

import type { ResolvedInfraAdapters } from '../../../../types/infraOrchestration.js';
import type {
  InfraAdapterPackageModule,
  InfraAdapterPackageResolver,
} from '../ports/outbound/infraAdapterPackage.js';

/*** Resolve exactly the selected provider packages and validate their public adapter boundaries. */
export async function resolveInfraAdaptersAsync(
  environment: InfraEnvironmentSpec,
  resolver: InfraAdapterPackageResolver,
): Promise<InfraResult<ResolvedInfraAdapters>> {
  const entries = getSelectedCatalogEntries(environment);
  const modules = await Promise.all(
    entries.map(async (entry) => loadModuleAsync(entry.package, resolver)),
  );
  const loadingDiagnostics = modules.flatMap((result) => result.diagnostics);
  if (loadingDiagnostics.length > 0) return { ok: false, diagnostics: loadingDiagnostics };
  const loaded = modules.flatMap((result) => (result.ok ? [result.value] : []));
  const selection = validateInfraAdapterSelection(
    environment,
    loaded.map(({ infraAdapterDescriptor }) => infraAdapterDescriptor),
  );
  if (!selection.ok) return selection;
  const instantiated = instantiateModules(loaded);
  if (!instantiated.ok) return instantiated;
  const instances = instantiated.value;
  const compute = instances.find(isComputeAdapter);
  const runtime = instances.find(isRuntimeAdapter);
  const services = instances.filter(isServiceAdapter);
  const diagnostics = validateInstances(compute, runtime, services, selection.value);
  return diagnostics.length > 0 || compute === undefined || runtime === undefined
    ? { ok: false, diagnostics }
    : {
        ok: true,
        value: { compute, runtime, services: orderServiceAdapters(services) },
        diagnostics: [],
      };
}

/*** Order services by selected capability dependencies while preserving catalog order for peers. */
function orderServiceAdapters(
  services: readonly InfraServiceAdapter[],
): readonly InfraServiceAdapter[] {
  const pending = [...services];
  const ordered: InfraServiceAdapter[] = [];
  const provided = new Set<string>(['compute', 'runtime', 'workloads', 'networking']);
  while (pending.length > 0) {
    const index = pending.findIndex((service) =>
      service.descriptor.dependencies.every(
        (dependency) =>
          provided.has(dependency) ||
          !services.some(({ descriptor }) => hasCapability(descriptor, dependency)),
      ),
    );
    if (index < 0) return services;
    const [service] = pending.splice(index, 1);
    if (service === undefined) return services;
    ordered.push(service);
    for (const capability of service.descriptor.capabilities) provided.add(capability);
  }
  return ordered;
}

/*** Compare catalog capability values across descriptor union members. */
function hasCapability(descriptor: InfraAdapterDescriptor, capability: string): boolean {
  return (descriptor.capabilities as readonly string[]).includes(capability);
}

/*** Invoke selected factories safely and require their instances to match the module descriptor. */
function instantiateModules(
  modules: readonly InfraAdapterPackageModule[],
): InfraResult<readonly unknown[]> {
  const instances: unknown[] = [];
  const diagnostics: InfraDiagnostic[] = [];
  for (const module of modules) {
    try {
      const instance = module.createInfraAdapter();
      if (!isAdapterForDescriptor(instance, module.infraAdapterDescriptor)) {
        diagnostics.push(
          instanceDiagnostic(
            module.infraAdapterDescriptor.id,
            `Selected adapter factory for ${module.infraAdapterDescriptor.package} returned a mismatched lifecycle implementation.`,
          ),
        );
      } else instances.push(instance);
    } catch {
      diagnostics.push(
        instanceDiagnostic(
          module.infraAdapterDescriptor.id,
          `Selected adapter factory for ${module.infraAdapterDescriptor.package} could not be created.`,
        ),
      );
    }
  }
  return diagnostics.length > 0
    ? { ok: false, diagnostics }
    : { ok: true, value: instances, diagnostics: [] };
}

/*** Select each configured adapter once, including multi-capability service providers. */
function getSelectedCatalogEntries(environment: InfraEnvironmentSpec) {
  const ids = new Set([
    environment.deployment.compute.provider,
    environment.deployment.runtime.provider,
    environment.database?.provider,
    environment.objectStorage?.provider,
    environment.auth?.provider,
    environment.authz?.provider,
    environment.secretStore?.provider,
  ]);
  return Object.values(INFRA_ADAPTER_CATALOG).filter((entry) => ids.has(entry.id));
}

/*** Convert module-resolution errors into provider-safe diagnostics without importing alternatives. */
async function loadModuleAsync(
  packageName: string,
  resolver: InfraAdapterPackageResolver,
): Promise<InfraResult<InfraAdapterPackageModule>> {
  try {
    const loaded: unknown = await resolver.loadAsync(packageName);
    return isInfraAdapterPackageModule(loaded)
      ? { ok: true, value: loaded, diagnostics: [] }
      : adapterFailure(
          'infra-adapter-module-invalid',
          `Selected adapter package ${packageName} does not export its canonical descriptor and factory.`,
        );
  } catch {
    return adapterFailure(
      'infra-adapter-package-unavailable',
      `Selected adapter package ${packageName} could not be loaded.`,
    );
  }
}

/*** Validate the runtime shape of a dynamically loaded provider package. */
function isInfraAdapterPackageModule(value: unknown): value is InfraAdapterPackageModule {
  return (
    isRecord(value) &&
    isInfraAdapterDescriptor(value.infraAdapterDescriptor) &&
    typeof value.createInfraAdapter === 'function'
  );
}

/*** Validate one compute adapter instance without trusting a dynamic module cast. */
function isComputeAdapter(value: unknown): value is InfraComputeAdapter {
  return hasAdapterMethods(value, 'compute', [
    'validateAsync',
    'inspectAsync',
    'planAsync',
    'ensureAsync',
    'statusAsync',
    'destroyAsync',
  ]);
}

/*** Validate one runtime adapter instance without trusting a dynamic module cast. */
function isRuntimeAdapter(value: unknown): value is InfraRuntimeAdapter {
  return hasAdapterMethods(value, 'runtime', [
    'validateAsync',
    'planAsync',
    'ensureAsync',
    'statusAsync',
    'suspendAsync',
    'destroyAsync',
  ]);
}

/*** Validate one service adapter instance without trusting a dynamic module cast. */
function isServiceAdapter(value: unknown): value is InfraServiceAdapter {
  return hasAdapterMethods(value, 'service', [
    'validateAsync',
    'planAsync',
    'desiredWorkloadsAsync',
    'reconcileAsync',
    'statusAsync',
    'destroyAsync',
  ]);
}

/*** Match a factory result to the exact descriptor selected from its module. */
function isAdapterForDescriptor(value: unknown, expected: InfraAdapterDescriptor): boolean {
  const validShape =
    expected.kind === 'compute'
      ? isComputeAdapter(value)
      : expected.kind === 'runtime'
        ? isRuntimeAdapter(value)
        : isServiceAdapter(value);
  return (
    validShape &&
    isRecord(value) &&
    isInfraAdapterDescriptor(value.descriptor) &&
    value.descriptor.id === expected.id &&
    value.descriptor.package === expected.package
  );
}

/*** Check a dynamic adapter descriptor kind and its required lifecycle methods. */
function hasAdapterMethods(
  value: unknown,
  kind: InfraAdapterDescriptor['kind'],
  methods: readonly string[],
): boolean {
  return (
    isRecord(value) &&
    isInfraAdapterDescriptor(value.descriptor) &&
    value.descriptor.kind === kind &&
    methods.every((method) => typeof Reflect.get(value, method) === 'function')
  );
}

/*** Ensure factories returned exactly one matching compute/runtime adapter and every service. */
function validateInstances(
  compute: InfraComputeAdapter | undefined,
  runtime: InfraRuntimeAdapter | undefined,
  services: readonly InfraServiceAdapter[],
  descriptors: readonly InfraAdapterDescriptor[],
): readonly InfraDiagnostic[] {
  const expectedServices = descriptors.filter(({ kind }) => kind === 'service').length;
  const diagnostics: InfraDiagnostic[] = [];
  if (compute === undefined)
    diagnostics.push(instanceDiagnostic('compute', 'Selected compute adapter factory is invalid.'));
  if (runtime === undefined)
    diagnostics.push(instanceDiagnostic('runtime', 'Selected runtime adapter factory is invalid.'));
  if (services.length !== expectedServices)
    diagnostics.push(
      instanceDiagnostic('service', 'A selected service adapter factory is invalid.'),
    );
  return diagnostics;
}

/*** Create an adapter-factory diagnostic without exposing module exception details. */
function instanceDiagnostic(kind: string, message: string): InfraDiagnostic {
  return { severity: 'error', code: `infra-${kind}-adapter-invalid`, message };
}

/*** Create a failed adapter resolution result. */
function adapterFailure(code: string, message: string): InfraResult<never> {
  return { ok: false, diagnostics: [{ severity: 'error', code, message }] };
}

/*** Narrow dynamically loaded module and adapter values. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}
