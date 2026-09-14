import { createInfraRuntimeProvider } from './createInfraRuntimeProvider.js';

const provider = createInfraRuntimeProvider();

export type {
  CreateInfraRuntimeProviderOptions,
  InfraCommandServices,
  RunInfraCommandImpl,
} from '../types/infraCli.js';
export { createInfraRuntimeProvider } from './createInfraRuntimeProvider.js';
export default provider;
