import { runCli } from './cli/bin.js';

/***
 * Provider, CLI, and project API surface
 *
 * `@ankhorage/infra` owns infrastructure generation, project reconciliation,
 * and generated lifecycle execution.
 *
 * The same owner implementation backs CLI consumers and the public
 * `@ankhorage/infra/project` application-service boundary. Trusted hosts such
 * as Studio should call that subpath instead of reproducing ledger, generated
 * file, lifecycle-script, or port-forward configuration semantics.
 *
 * CLI entrypoints:
 *
 * - `ankh infra ...`
 * - `bunx @ankhorage/infra ...`
 *
 * Current command surface:
 *
 * - `validate`
 * - `generate`
 * - `status`
 * - `up`
 * - `down`
 *
 * Project resolution for the CLI is workspace-aware: pass `[project]`, or
 * omit it when cwd is already inside `apps/<project>`. Programmatic project
 * operations accept an explicit project path and do not require Studio or a
 * particular workspace layout.
 *
 * @usage
 */
await runCli(['--help']);
