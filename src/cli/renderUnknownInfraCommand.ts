/*** Render an invalid standalone Infra command without guessing intent. */
export function renderUnknownInfraCommand(value: string): string {
  return [`Unknown infra command: ${value}`, '', 'Run ankhorage-infra --help', ''].join('\n');
}
