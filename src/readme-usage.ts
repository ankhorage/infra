import { runCli } from './cli/bin.js';

/***
 * Provider and CLI surface
 *
 * `@ankhorage/infra` owns infra command behavior.
 *
 * The same shared command implementation backs both:
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
 * `status` runs the generated live runtime status script for a project.
 *
 * Project resolution is project-aware:
 *
 * - pass `[project]`, or
 * - omit it when cwd is already inside `apps/<project>`
 *
 * @usage
 */
await runCli(['--help']);
