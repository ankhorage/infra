import { INFRA_PACKAGE_VERSION } from './packageMetadata.js';

export interface InfraCommandContext {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly version: string;
  writeStdout(text: string): void;
  writeStderr(text: string): void;
}

export interface InfraCommandRunResult {
  readonly exitCode: number;
}

export function createDefaultCommandContext(): InfraCommandContext {
  return {
    cwd: process.cwd(),
    env: process.env,
    version: INFRA_PACKAGE_VERSION,
    writeStdout(text: string) {
      process.stdout.write(text);
    },
    writeStderr(text: string) {
      process.stderr.write(text);
    },
  };
}
