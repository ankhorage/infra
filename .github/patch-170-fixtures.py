from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Expected block not found: {label}")
    return text.replace(old, new, 1)


k3s_path = Path("src/localK3sSupabase.test.ts")
k3s = k3s_path.read_text()
k3s = replace_once(
    k3s,
    """function success<T>(value: T): InfraResult<T> {
  return { ok: true, value, diagnostics: [] };
}
""",
    """function success<T>(value: T): InfraResult<T> {
  return { ok: true, value, diagnostics: [] };
}

function failure(code: string, message: string): InfraResult<never> {
  return { ok: false, diagnostics: [{ severity: 'error', code, message }] };
}
""",
    "k3s failure helper",
)
k3s_path.write_text(k3s)

recovery_path = Path("src/localMinikubeSupabaseRecovery.integration.test.ts")
recovery = recovery_path.read_text()
recovery = replace_once(
    recovery,
    """import type {
  InfraLedger,
""",
    """import type {
  InfraControlPlaneCredentialRef,
  InfraCredentialPort,
  InfraLedger,
""",
    "recovery credential imports",
)
old_credentials = """    credentials: {
      resolveAsync: ({ name }) =>
        Promise.resolve(
          name === 'SUPABASE_BOOTSTRAP'
            ? success(supabaseCredentials())
            : name === 'S3_PERSISTENCE'
              ? success({ accessKeyId: s3AccessKey, secretAccessKey: s3SecretKey })
              : failure('unexpected-credential', `Unexpected credential reference: ${name}`),
        ),
    },
"""
recovery = replace_once(
    recovery,
    old_credentials,
    """    credentials: createCredentialPort(),
""",
    "recovery credential dependency",
)
credential_port = """function createCredentialPort(): InfraCredentialPort {
  return {
    findAsync: (reference) => Promise.resolve(findCredential(reference)),
    resolveAsync: (reference) => Promise.resolve(resolveCredential(reference)),
    persistAsync: (reference) =>
      Promise.resolve(
        failure(
          'unexpected-credential-persist',
          `Recovery acceptance must not persist credential ${reference.name}.`,
        ),
      ),
  };
}

function findCredential(
  reference: InfraControlPlaneCredentialRef,
): InfraResult<Readonly<Record<string, string>> | null> {
  if (reference.name === 'SUPABASE_BOOTSTRAP') return success(supabaseCredentials());
  if (reference.name === 'S3_PERSISTENCE') {
    return success({ accessKeyId: s3AccessKey, secretAccessKey: s3SecretKey });
  }
  return success(null);
}

function resolveCredential(
  reference: InfraControlPlaneCredentialRef,
): InfraResult<Readonly<Record<string, string>>> {
  if (reference.name === 'SUPABASE_BOOTSTRAP') return success(supabaseCredentials());
  if (reference.name === 'S3_PERSISTENCE') {
    return success({ accessKeyId: s3AccessKey, secretAccessKey: s3SecretKey });
  }
  return failure('unexpected-credential', `Unexpected credential reference: ${reference.name}`);
}

"""
recovery = replace_once(
    recovery,
    "function createDestroyRequest(\n",
    credential_port + "function createDestroyRequest(\n",
    "recovery credential port insertion",
)
recovery_path.write_text(recovery)
