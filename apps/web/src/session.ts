import type { User } from "@recettes/contract"
import type { AuthApi } from "./api.ts"

/**
 * La session vue du navigateur. `current` n'interroge le serveur qu'une fois :
 * la garde de route s'exécute à chaque navigation et ne doit pas coûter une
 * requête chaque fois. Le cookie, lui, reste invisible d'ici (httpOnly).
 */
export interface Session {
  readonly current: () => Promise<User | null>
  readonly login: (email: string, password: string) => Promise<User>
  readonly logout: () => Promise<void>
  /** Le serveur a dit 401 : la prochaine garde ré-interrogera. */
  readonly expire: () => void
}

export const createSession = (auth: AuthApi): Session => {
  let known: Promise<User | null> | null = null

  return {
    current: () => {
      known ??= auth.me().catch((error: unknown) => {
        known = null
        throw error
      })
      return known
    },
    login: async (email, password) => {
      const user = await auth.login(email, password)
      known = Promise.resolve(user)
      return user
    },
    logout: async () => {
      known = Promise.resolve(null)
      await auth.logout()
    },
    expire: () => {
      known = null
    },
  }
}
