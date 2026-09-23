import { useNavigate, useRouterState } from "@tanstack/react-router"
import { useEffect, useRef } from "react"
import { Unauthenticated } from "./api.ts"
import { authenticatedRoute } from "./routes.tsx"

/**
 * Une requête a reçu 401 alors que la garde de route était passée : la session
 * a expiré entre-temps. On oublie l'utilisateur et on repart vers /login, en
 * retenant la page courante.
 */
export const useAuthGuard = (error: unknown) => {
  const { session } = authenticatedRoute.useRouteContext()
  const href = useRouterState({ select: (state) => state.location.href })
  const navigate = useNavigate()
  // Une seule redirection : l'URL change pendant la navigation, et l'effet
  // repartirait sinon avec /login lui-même comme destination.
  const redirected = useRef(false)

  useEffect(() => {
    if (redirected.current || !(error instanceof Unauthenticated)) return
    redirected.current = true
    session.expire()
    void navigate({ to: "/login", search: { redirect: href } })
  }, [error, session, href, navigate])
}
