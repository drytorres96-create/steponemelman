export function useAuth() { return { session: { access_token: 'x'.repeat(30) }, signOut: async () => {} } }
export function AuthProvider({ children }: { children: unknown }) { return children }
