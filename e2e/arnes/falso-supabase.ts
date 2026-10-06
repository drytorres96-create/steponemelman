/** Sólo el arnés: ninguna prueba de IA usa una cuenta ni un token reales. */
export const supabase = { auth: { getSession: async () => ({ data: { session:
  new URL(location.href).searchParams.get('ia') === '1'
    ? { access_token: 'QA-token-sintetico-sin-acceso-real', user: { id: 'QA-user' } } : null,
} }) } }
