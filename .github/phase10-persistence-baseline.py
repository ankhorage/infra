from pathlib import Path

package = Path('package.json')
source = package.read_text()
old = '"@ankhorage/supabase": "^0.4.7"'
new = '"@ankhorage/supabase": "^0.4.8"'
if source.count(old) != 1:
    raise SystemExit(f'Expected one Supabase dependency, found {source.count(old)}')
package.write_text(source.replace(old, new, 1))

test = Path('src/hetznerK3sProduction.test.ts')
source = test.read_text()
anchor = "  expect(fixture.kubernetes.serializedResources()).toContain('PersistentVolumeClaim');\n"
addition = anchor + "  expect(fixture.kubernetes.serializedResources()).toContain('/etc/postgresql-custom');\n"
if source.count(anchor) != 1:
    raise SystemExit(f'Expected one PVC assertion, found {source.count(anchor)}')
test.write_text(source.replace(anchor, addition, 1))
