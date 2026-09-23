import { useNavigate } from "@tanstack/react-router"
import { type FormEvent, useState } from "react"
import { InvalidCredentials } from "../api.ts"
import { loginRoute } from "../routes.tsx"

export const LoginPage = () => {
  const { session } = loginRoute.useRouteContext()
  const { redirect } = loginRoute.useSearch()
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await session.login(email, password)
      // `redirect` a été validé comme chemin interne par validateSearch.
      await navigate({ href: redirect ?? "/" })
    } catch (caught) {
      setError(
        caught instanceof InvalidCredentials
          ? "Adresse ou mot de passe refusé."
          : "Connexion impossible, réessayer."
      )
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <form
        onSubmit={(event) => void submit(event)}
        className="w-full max-w-sm space-y-5 rounded-xl border border-stone-200 bg-white p-6"
      >
        <h1 className="text-lg font-semibold text-stone-900">Recettes</h1>

        <label className="block space-y-1 text-sm">
          <span className="text-stone-700">Adresse e-mail</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2"
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span className="text-stone-700">Mot de passe</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2"
          />
        </label>

        {error !== null && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white
                     hover:bg-stone-700 disabled:opacity-50"
        >
          Se connecter
        </button>
      </form>
    </div>
  )
}
