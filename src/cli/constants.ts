import { destroy } from './commands/destroy.js';
import { down } from './commands/down.js';
import { generate } from './commands/generate.js';
import { outputs } from './commands/outputs.js';
import { plan } from './commands/plan.js';
import { status } from './commands/status.js';
import { up } from './commands/up.js';
import { validate } from './commands/validate.js';

export const INFRA_COMMANDS = [
  validate,
  plan,
  generate,
  up,
  status,
  outputs,
  down,
  destroy,
] as const;
