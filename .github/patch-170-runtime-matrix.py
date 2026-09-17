from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Expected block not found: {label}")
    return text.replace(old, new, 1)


minikube_path = Path("src/localMinikubeSupabase.integration.test.ts")
minikube = minikube_path.read_text()
for owner in ("firstUp", "secondUp", "pruned", "down", "resumed"):
    minikube = replace_once(
        minikube,
        f"      ledger = {owner}.ledger;",
        f"      ({{ ledger }} = {owner});",
        f"minikube {owner} ledger destructuring",
    )
minikube_path.write_text(minikube)

k3s_path = Path("src/localK3sSupabase.test.ts")
k3s = k3s_path.read_text()
k3s = replace_once(
    k3s,
    "import type {\n  InfraComputeTarget,",
    "import { createHash } from 'node:crypto';\n\nimport type {\n  InfraComputeTarget,\n  InfraControlPlaneCredentialRef,\n  InfraCredentialPort,",
    "k3s imports",
)
k3s = replace_once(
    k3s,
    "const bucket = 'infra164-bucket';\n",
    "const bucket = 'infra164-bucket';\nconst bootstrapCredential = { source: 'control-plane', name: 'SUPABASE_BOOTSTRAP' } as const;\n",
    "k3s bootstrap reference",
)
k3s = replace_once(
    k3s,
    "  const firstLedger: InfraLedger = firstUp.ledger;\n  expect(firstUp.targets).toEqual([target]);",
    "  const firstLedger: InfraLedger = firstUp.ledger;\n  expect(fixture.credentials.persistCount).toBe(1);\n  const firstCredentials = fixture.credentials.readRequired();\n  const firstCredentialFingerprint = credentialFingerprint(firstCredentials);\n  assertPrivilegedValuesAbsent(firstUp, firstCredentials);\n  expect(firstUp.targets).toEqual([target]);",
    "k3s first credential assertions",
)
k3s = replace_once(
    k3s,
    "  expect(JSON.stringify(firstUp)).not.toContain('infra164-service-role-key');\n  expect(JSON.stringify(firstUp)).not.toContain('infra164-postgres-password');\n",
    "",
    "k3s static secret assertions",
)
k3s = replace_once(
    k3s,
    "  expect(resourceIdentities(resumed.resources)).toEqual(identitiesBeforeRestart);\n",
    "  expect(resourceIdentities(resumed.resources)).toEqual(identitiesBeforeRestart);\n  expect(fixture.credentials.persistCount).toBe(1);\n  expect(credentialFingerprint(fixture.credentials.readRequired())).toBe(\n    firstCredentialFingerprint,\n  );\n  assertPrivilegedValuesAbsent(resumed, firstCredentials);\n",
    "k3s resumed credential assertions",
)
k3s = replace_once(
    k3s,
    "  readonly supabase = new FakeSupabaseControlPlane();\n  readonly loadedPackages: string[] = [];",
    "  readonly supabase = new FakeSupabaseControlPlane();\n  readonly credentials = new MemoryCredentialPort();\n  readonly loadedPackages: string[] = [];",
    "k3s fixture credential port",
)
k3s = replace_once(
    k3s,
    "    credentials: {\n      resolveAsync: ({ name }) => Promise.resolve(resolveCredential(name)),\n    },",
    "    credentials: fixture.credentials,",
    "k3s dependencies credential port",
)
old_resolver = """function resolveCredential(name: string): InfraResult<Readonly<Record<string, string>>> {
  if (name === 'SUPABASE_BOOTSTRAP') {
    return success({
      postgresPassword: 'infra164-postgres-password',
      jwtSecret: 'infra164-jwt-secret-0123456789abcdef',
      anonKey: 'infra164-anon-key',
      serviceRoleKey: 'infra164-service-role-key',
      realtimeSecretKeyBase:
        'infra164-realtime-secret-key-base-0123456789abcdefghijklmnopqrstuvwxyz',
      realtimeDatabaseEncryptionKey: '1234567890abcdef',
      pgMetaCryptoKey: 'infra164-pg-meta-crypto-key-0123456789abcdef',
    });
  }
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'unexpected-credential',
        message: `Unexpected credential reference: ${name}`,
      },
    ],
  };
}

"""
k3s = replace_once(k3s, old_resolver, "", "k3s old credential resolver")
k3s_support = """class MemoryCredentialPort implements InfraCredentialPort {
  private values: Readonly<Record<string, string>> | null = null;
  persistCount = 0;

  findAsync(
    reference: InfraControlPlaneCredentialRef,
  ): Promise<InfraResult<Readonly<Record<string, string>> | null>> {
    if (reference.name !== bootstrapCredential.name) return Promise.resolve(success(null));
    return Promise.resolve(success(this.values === null ? null : { ...this.values }));
  }

  resolveAsync(
    reference: InfraControlPlaneCredentialRef,
  ): Promise<InfraResult<Readonly<Record<string, string>>>> {
    if (reference.name === bootstrapCredential.name && this.values !== null) {
      return Promise.resolve(success({ ...this.values }));
    }
    return Promise.resolve(
      failure(
        'unexpected-credential',
        `Unexpected or missing credential reference: ${reference.name}`,
      ),
    );
  }

  persistAsync(
    reference: InfraControlPlaneCredentialRef,
    values: Readonly<Record<string, string>>,
  ): Promise<InfraResult<null>> {
    if (reference.name !== bootstrapCredential.name) {
      return Promise.resolve(
        failure('unexpected-credential', `Unexpected credential reference: ${reference.name}`),
      );
    }
    this.values = { ...values };
    this.persistCount += 1;
    return Promise.resolve(success(null));
  }

  readRequired(): Readonly<Record<string, string>> {
    if (this.values === null) throw new Error('Expected generated Supabase bootstrap credentials.');
    return { ...this.values };
  }
}

function credentialFingerprint(values: Readonly<Record<string, string>>): string {
  const canonical = Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}\\u0000${value}`)
    .join('\\u0001');
  return createHash('sha256').update(canonical).digest('hex');
}

function privilegedCredentialValues(values: Readonly<Record<string, string>>): readonly string[] {
  const { anonKey: _anonKey, ...privileged } = values;
  return Object.values(privileged);
}

function assertPrivilegedValuesAbsent(
  value: unknown,
  credentials: Readonly<Record<string, string>>,
): void {
  const serialized = JSON.stringify(value);
  for (const secret of privilegedCredentialValues(credentials)) {
    expect(serialized).not.toContain(secret);
  }
}

"""
k3s = replace_once(
    k3s,
    "class FakeLocalHostProbe implements LocalHostProbe {",
    k3s_support + "class FakeLocalHostProbe implements LocalHostProbe {",
    "k3s credential support insertion",
)
k3s_path.write_text(k3s)

compose_path = Path("src/localDockerComposeProviders.integration.test.ts")
compose = compose_path.read_text()
compose = replace_once(
    compose,
    "import { createHmac } from 'node:crypto';",
    "import { createHash } from 'node:crypto';",
    "compose crypto import",
)
compose = replace_once(
    compose,
    "import type {\n  InfraLedger,",
    "import type {\n  InfraControlPlaneCredentialRef,\n  InfraCredentialPort,\n  InfraLedger,",
    "compose credential types",
)
static_credentials = """const jwtSecret = 'phase9-jwt-secret-that-is-at-least-thirty-two-characters';
const credentials = {
  postgresPassword: 'phase9-postgres-password',
  jwtSecret,
  anonKey: createJwt('anon'),
  serviceRoleKey: createJwt('service_role'),
  realtimeSecretKeyBase: 'r'.repeat(64),
  realtimeDatabaseEncryptionKey: '0123456789abcdef',
  pgMetaCryptoKey: 'phase9-meta-crypto-key-that-is-at-least-32-characters',
} as const;
"""
compose = replace_once(
    compose,
    static_credentials,
    "const bootstrapCredential = { source: 'control-plane', name: 'SUPABASE_BOOTSTRAP' } as const;\n",
    "compose static credentials",
)
compose = replace_once(
    compose,
    "    const dependencies = createDependencies();\n    let ledger: InfraLedger | undefined;",
    "    const credentialPort = new MemoryCredentialPort();\n    const dependencies = createDependencies(credentialPort);\n    let ledger: InfraLedger | undefined;",
    "compose empty credential port",
)
compose = replace_once(
    compose,
    "      ledger = firstLedger;\n      assertProviderNeutralOutputs(firstOutputs);",
    "      ledger = firstLedger;\n      expect(credentialPort.persistCount).toBe(1);\n      const firstCredentials = credentialPort.readRequired();\n      const firstCredentialFingerprint = credentialFingerprint(firstCredentials);\n      assertProviderNeutralOutputs(firstOutputs, firstCredentials);",
    "compose first generated credentials",
)
compose = replace_once(
    compose,
    "      ledger = resumedLedger;\n      assertProviderNeutralOutputs(resumedOutputs);",
    "      ledger = resumedLedger;\n      expect(credentialPort.persistCount).toBe(1);\n      expect(credentialFingerprint(credentialPort.readRequired())).toBe(\n        firstCredentialFingerprint,\n      );\n      assertProviderNeutralOutputs(resumedOutputs, firstCredentials);",
    "compose resumed generated credentials",
)
old_dependencies = """function createDependencies(): InfraOrchestrationDependencies {
  return {
    adapterResolver: createNodeInfraAdapterPackageResolver(),
    credentials: {
      resolveAsync: (reference) =>
        Promise.resolve(
          reference.name === 'SUPABASE_BOOTSTRAP'
            ? success(credentials)
            : failure(
                'unexpected-control-plane-credential',
                `Unexpected control-plane credential ${reference.name}.`,
              ),
        ),
    },
"""
new_dependencies = """function createDependencies(credentials: InfraCredentialPort): InfraOrchestrationDependencies {
  return {
    adapterResolver: createNodeInfraAdapterPackageResolver(),
    credentials,
"""
compose = replace_once(
    compose,
    old_dependencies,
    new_dependencies,
    "compose dependencies credential port",
)
old_assert = """function assertProviderNeutralOutputs(outputs: InfraLedger['outputs']): void {
  const serialized = JSON.stringify(outputs);
  expect(serialized).not.toContain(credentials.serviceRoleKey);
  expect(serialized).not.toContain(credentials.postgresPassword);
  expect(serialized).not.toContain(credentials.jwtSecret);
  expect(serialized).not.toContain(credentials.realtimeSecretKeyBase);
  expect(serialized).not.toContain(credentials.realtimeDatabaseEncryptionKey);
  expect(serialized).not.toContain(credentials.pgMetaCryptoKey);
  expect(serialized.toLowerCase()).not.toContain('kubernetes');
"""
new_assert = """function assertProviderNeutralOutputs(
  outputs: InfraLedger['outputs'],
  credentials: Readonly<Record<string, string>>,
): void {
  const serialized = JSON.stringify(outputs);
  for (const secret of privilegedCredentialValues(credentials)) {
    expect(serialized).not.toContain(secret);
  }
  expect(serialized.toLowerCase()).not.toContain('kubernetes');
"""
compose = replace_once(compose, old_assert, new_assert, "compose output safety")
compose = replace_once(
    compose,
    "        value === credentials.anonKey,",
    "        value === readAnonKey(credentials),",
    "compose public anon assertion",
)
old_jwt = """function createJwt(role: 'anon' | 'service_role'): string {
  const encodedHeader = encodeJwtPart({ alg: 'HS256', typ: 'JWT' });
  const encodedPayload = encodeJwtPart({
    role,
    iss: 'supabase',
    iat: 1_700_000_000,
    exp: 4_102_444_800,
  });
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', jwtSecret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

function encodeJwtPart(value: Readonly<Record<string, string | number>>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

"""
compose = replace_once(compose, old_jwt, "", "compose static JWT helpers")
compose_support = """class MemoryCredentialPort implements InfraCredentialPort {
  private values: Readonly<Record<string, string>> | null = null;
  persistCount = 0;

  findAsync(
    reference: InfraControlPlaneCredentialRef,
  ): Promise<InfraResult<Readonly<Record<string, string>> | null>> {
    if (reference.name !== bootstrapCredential.name) return Promise.resolve(success(null));
    return Promise.resolve(success(this.values === null ? null : { ...this.values }));
  }

  resolveAsync(
    reference: InfraControlPlaneCredentialRef,
  ): Promise<InfraResult<Readonly<Record<string, string>>>> {
    if (reference.name === bootstrapCredential.name && this.values !== null) {
      return Promise.resolve(success({ ...this.values }));
    }
    return Promise.resolve(
      failure(
        'unexpected-control-plane-credential',
        `Unexpected or missing control-plane credential ${reference.name}.`,
      ),
    );
  }

  persistAsync(
    reference: InfraControlPlaneCredentialRef,
    values: Readonly<Record<string, string>>,
  ): Promise<InfraResult<null>> {
    if (reference.name !== bootstrapCredential.name) {
      return Promise.resolve(
        failure(
          'unexpected-control-plane-credential',
          `Unexpected control-plane credential ${reference.name}.`,
        ),
      );
    }
    this.values = { ...values };
    this.persistCount += 1;
    return Promise.resolve(success(null));
  }

  readRequired(): Readonly<Record<string, string>> {
    if (this.values === null) throw new Error('Expected generated Supabase bootstrap credentials.');
    return { ...this.values };
  }
}

function credentialFingerprint(values: Readonly<Record<string, string>>): string {
  const canonical = Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}\\u0000${value}`)
    .join('\\u0001');
  return createHash('sha256').update(canonical).digest('hex');
}

function privilegedCredentialValues(values: Readonly<Record<string, string>>): readonly string[] {
  const { anonKey: _anonKey, ...privileged } = values;
  return Object.values(privileged);
}

function readAnonKey(values: Readonly<Record<string, string>>): string {
  const { anonKey } = values;
  if (anonKey === undefined) throw new Error('Expected generated Supabase anonKey.');
  return anonKey;
}

"""
compose = replace_once(
    compose,
    "function createDestroyRequest(",
    compose_support + "function createDestroyRequest(",
    "compose credential support insertion",
)
compose_path.write_text(compose)
