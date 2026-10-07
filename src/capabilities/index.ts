import type { Capability } from '@ankhorage/contracts/capabilities';

/*** Publish Infra's executable lifecycle operations for Ankh discovery and bindings. */
export const CAPABILITIES = [
  {
    id: 'infra.validate',
    owner: '@ankhorage/infra',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    label: 'Validate infrastructure',
    description:
      'Validate the manifest, credentials, compatibility, and selected infrastructure adapters.',
  },
  {
    id: 'infra.plan',
    owner: '@ankhorage/infra',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    label: 'Plan infrastructure',
    description: 'Calculate the infrastructure changes required for the selected environment.',
  },
  {
    id: 'infra.generate',
    owner: '@ankhorage/infra',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    label: 'Generate infrastructure',
    description: 'Generate infrastructure artifacts for the selected environment.',
  },
  {
    id: 'infra.up',
    owner: '@ankhorage/infra',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    label: 'Start infrastructure',
    description: 'Ensure and reconcile the selected infrastructure environment.',
  },
  {
    id: 'infra.status',
    owner: '@ankhorage/infra',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    label: 'Get infrastructure status',
    description: 'Inspect the current status of the selected infrastructure environment.',
  },
  {
    id: 'infra.outputs',
    owner: '@ankhorage/infra',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    label: 'Get infrastructure outputs',
    description:
      'Read generated public and referenced outputs for the selected infrastructure environment.',
  },
  {
    id: 'infra.down',
    owner: '@ankhorage/infra',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    label: 'Stop infrastructure',
    description: 'Suspend the selected infrastructure environment while retaining its state.',
  },
  {
    id: 'infra.destroy',
    owner: '@ankhorage/infra',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    label: 'Destroy infrastructure',
    description: 'Destroy the selected infrastructure environment after explicit confirmation.',
  },
] as const satisfies readonly Capability[];
