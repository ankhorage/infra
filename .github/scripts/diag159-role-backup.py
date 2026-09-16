from pathlib import Path

path = Path('src/localMinikubeSupabaseRecovery.integration.test.ts')
source = path.read_text()
marker = "      expect(await readLatestBackupPointerAsync()).toMatch(/^database\\/\\d{8}T\\d{6}Z$/);"
replacement = r'''      const latestBackup = await readLatestBackupPointerAsync();
      expect(latestBackup).toMatch(/^database\/\d{8}T\d{6}Z$/);
      const rolesBackup = await runAsync(
        [
          'curl',
          '--fail',
          '--silent',
          '--show-error',
          '--aws-sigv4',
          'aws:amz:us-east-1:s3',
          '--user',
          `${s3AccessKey}:${s3SecretKey}`,
          `${minioHostEndpoint}/${physicalBucket}/${latestBackup}/roles.sql`,
        ],
        'read role backup diagnostic',
      );
      const roleLines = rolesBackup
        .split('\n')
        .map((line, index) => `${index + 1}: ${line}`)
        .filter((line) => line.includes('supabase_realtime_admin'));
      throw new Error(`Role backup diagnostic:\n${roleLines.join('\n')}`);'''
if marker not in source:
    raise SystemExit('diagnostic marker not found')
path.write_text(source.replace(marker, replacement, 1))
