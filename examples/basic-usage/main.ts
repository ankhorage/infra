/***
 * Inspect the commands exposed by the standalone Infra provider.
 *
 * The provider owns the validation, planning, generation, and lifecycle command surface. Select
 * an environment explicitly before destructive operations.
 *
 * @title Explore Infra commands
 * @usage
 * @readme
 */
import { createInfraRuntimeProvider } from '@ankhorage/infra/cli';

const provider = createInfraRuntimeProvider();
console.log(provider.commands.map((command) => command.path.join(' ')));
