/** Controlled integration for phases 2–4. General activation belongs to phase 5. */
export function myqbankEnabled(): boolean {
  return import.meta.env.VITE_MYQBANK_ENABLED === 'true' || new URLSearchParams(location.search).get('workspace') === 'myqbank'
}
