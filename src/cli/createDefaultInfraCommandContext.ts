import { INFRA_PACKAGE_VERSION } from '../constants.js';
import type { InfraCommandContext } from '../types/infraCli.js';

/*** Create the process-backed command context used by the standalone executable. */
export function createDefaultInfraCommandContext(): InfraCommandContext {
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
