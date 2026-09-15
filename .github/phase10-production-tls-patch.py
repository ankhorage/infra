from pathlib import Path

path = Path('src/hetznerK3sProduction.test.ts')
source = path.read_text()

replacements = [
    (
        "      networking: { domain, publicBaseUrl },",
        """      networking: {
        domain,
        publicBaseUrl,
        tls: { mode: 'acme-http-01', contactEmail: 'infra@example.test' },
      },""",
    ),
    (
        "  expect(fixture.k3s.lastAccess).toHaveLength(1);",
        """  expect(fixture.k3s.lastAccess).toHaveLength(1);
  expect(fixture.k3s.lastSpec?.networking).toEqual({
    domain,
    publicBaseUrl,
    tls: { mode: 'acme-http-01', contactEmail: 'infra@example.test' },
  });""",
    ),
    (
        "  lastAccess: readonly K3sNodeAccess[] = [];\n  state: K3sClusterObservation['state'] = 'absent';",
        """  lastAccess: readonly K3sNodeAccess[] = [];
  lastSpec?: K3sClusterSpec;
  state: K3sClusterObservation['state'] = 'absent';""",
    ),
    (
        "    this.calls.push('ensure');\n    this.lastAccess = access;",
        """    this.calls.push('ensure');
    this.lastAccess = access;
    this.lastSpec = spec;""",
    ),
]

for old, new in replacements:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'Expected exactly one anchor, found {count}: {old!r}')
    source = source.replace(old, new, 1)

path.write_text(source)
