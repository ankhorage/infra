import { runInfraCliAsync } from './cli/runInfraCliAsync.js';

/***
 * Provider-neutral infrastructure lifecycle
 *
 * `@ankhorage/infra` resolves only the compute, runtime, and service adapter packages selected by
 * an environment-aware Infra manifest. Its typed use cases own orchestration, dependency ordering,
 * safe outputs, deterministic artifacts, and environment-scoped ownership state. Provider packages
 * own all technology-specific implementation.
 *
 * The standalone CLI and `ankh infra` expose the same lifecycle:
 *
 * - `validate`
 * - `plan`
 * - `generate`
 * - `up`
 * - `status`
 * - `outputs`
 * - `down`
 * - `destroy`
 *
 * `local` is the only default environment. Destruction always requires an explicit environment and
 * exact `<project>:<environment>` confirmation. Persistent resources remain retained unless each
 * exact owned resource is separately authorized with `--delete-resource <adapter>:<resourceId>`.
 * Environment-style outputs print only explicitly public values with an environment-variable name;
 * secret outputs remain references.
 *
 * @usage
 */
await runInfraCliAsync(['--help']);
