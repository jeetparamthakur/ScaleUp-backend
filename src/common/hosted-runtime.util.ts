export function isHostedRuntime(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
}
