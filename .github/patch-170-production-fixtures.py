from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Expected block not found: {label}")
    return text.replace(old, new, 1)


for filename in (
    "src/hetznerK3sSupabaseR2.test.ts",
    "src/hetznerK3sProduction.test.ts",
):
    path = Path(filename)
    text = path.read_text()
    text = replace_once(
        text,
        "import type { InfraManifest, InfraResult } from '@ankhorage/contracts/infra';"
        if filename.endswith("SupabaseR2.test.ts")
        else "import type {\n  InfraLedger,",
        "import type {\n  InfraControlPlaneCredentialRef,\n  InfraCredentialPort,\n  InfraManifest,\n  InfraResult,\n} from '@ankhorage/contracts/infra';"
        if filename.endswith("SupabaseR2.test.ts")
        else "import type {\n  InfraControlPlaneCredentialRef,\n  InfraCredentialPort,\n  InfraLedger,",
        f"{filename} credential imports",
    )
    text = replace_once(
        text,
        """    credentials: {
      resolveAsync: ({ name }) => Promise.resolve(resolveCredential(name)),
    },
""",
        """    credentials: createCredentialPort(),
""",
        f"{filename} credential dependency",
    )
    marker = "function resolveCredential(name: string): InfraResult<Readonly<Record<string, string>>> {"
    support = """function createCredentialPort(): InfraCredentialPort {
  return {
    findAsync: (reference) => Promise.resolve(findCredential(reference)),
    resolveAsync: ({ name }) => Promise.resolve(resolveCredential(name)),
    persistAsync: (reference) =>
      Promise.resolve({
        ok: false,
        diagnostics: [
          {
            severity: 'error',
            code: 'unexpected-credential-persist',
            message: `Production fixture must not persist credential ${reference.name}.`,
          },
        ],
      }),
  };
}

function findCredential(
  reference: InfraControlPlaneCredentialRef,
): InfraResult<Readonly<Record<string, string>> | null> {
  return reference.name === 'SUPABASE_BOOTSTRAP'
    ? resolveCredential(reference.name)
    : success(null);
}

"""
    text = replace_once(text, marker, support + marker, f"{filename} credential port insertion")
    path.write_text(text)
