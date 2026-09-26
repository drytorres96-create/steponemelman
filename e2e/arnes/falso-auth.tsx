export function useAuth() { return { session: { access_token: 'x'.repeat(30) }, user: { id: 'cuenta-demo' }, signOut: async () => {} } }
export function AuthProvider({ children }: { children: unknown }) { return children }
