/** Workers AI's InferenceUpstreamError carries the internal code in message,
 * not reliably in .code. Never return/log the message: it may contain material.
 * Match only the documented numeric prefix, not arbitrary prompt text.
 */
export function clasificarErrorCloudflare(causa: unknown): {
  codigo: 'tiempo' | 'capacidad' | 'cuota_proveedor' | 'proveedor'
  codigoProveedor?: number
} {
  const mensaje = causa instanceof Error ? causa.message : ''
  const coincidencia = /^(3036|3040|3007|3008):(?:\s|$)/.exec(mensaje)
  const codigoProveedor = coincidencia ? Number(coincidencia[1]) : undefined
  const codigo = codigoProveedor === 3036 ? 'cuota_proveedor'
    : codigoProveedor === 3040 ? 'capacidad'
    : codigoProveedor === 3007 || codigoProveedor === 3008 ? 'tiempo' : 'proveedor'
  return { codigo, ...(codigoProveedor !== undefined ? { codigoProveedor } : {}) }
}
