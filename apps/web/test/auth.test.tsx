import type { User } from "@recettes/contract"
import { QueryClient } from "@tanstack/react-query"
import { createMemoryHistory } from "@tanstack/react-router"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { Unauthenticated } from "../src/api.ts"
import { App } from "../src/App.tsx"
import { createAppRouter } from "../src/routes.tsx"
import { createSession } from "../src/session.ts"
import { fakeApi, fakeAuth, fakeLists } from "./fake-api.ts"

const renderAt = (path: string, options: { user?: User | null; api?: ReturnType<typeof fakeApi> } = {}) => {
  const auth = fakeAuth(options.user)
  const api = options.api ?? fakeApi()
  const session = createSession(auth)
  const router = createAppRouter(session, createMemoryHistory({ initialEntries: [path] }))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<App api={api} lists={fakeLists()} session={session} router={router} queryClient={queryClient} />)
  return { router, auth, api, queryClient }
}

const signIn = async (password = "secret") => {
  await userEvent.type(await screen.findByLabelText("Adresse e-mail"), "anne@example.org")
  await userEvent.type(screen.getByLabelText("Mot de passe"), password)
  await userEvent.click(screen.getByRole("button", { name: "Se connecter" }))
}

afterEach(() => document.body.replaceChildren())

describe("garde d'authentification", () => {
  it("renvoie vers /login en retenant la destination", async () => {
    const { router, api } = renderAt("/recipes/7?search=x", { user: null })

    await screen.findByRole("button", { name: "Se connecter" })
    expect(router.state.location.pathname).toBe("/login")
    expect(router.state.location.search).toMatchObject({ redirect: "/recipes/7?search=x" })
    // Rien n'a été demandé à l'API avant la connexion.
    expect(api.calls).toHaveLength(0)
  })

  it("revient à la destination après connexion", async () => {
    const { router, auth } = renderAt("/recipes/7", { user: null })
    await signIn()

    expect(await screen.findByRole("heading", { name: "Bowl de pastèque" })).toBeTruthy()
    expect(router.state.location.pathname).toBe("/recipes/7")
    expect(auth.logins).toEqual([{ email: "anne@example.org", password: "secret" }])
  })

  it("atterrit sur la liste quand la destination n'est pas un chemin interne", async () => {
    const { router } = renderAt("/login?redirect=https://evil.example/", { user: null })
    await signIn()

    await waitFor(() => expect(router.state.location.pathname).toBe("/"))
    expect(await screen.findByText("Bowl de pastèque")).toBeTruthy()
  })

  it("signale des identifiants refusés et reste sur /login", async () => {
    const { router } = renderAt("/", { user: null })
    await signIn("faux")

    expect((await screen.findByRole("alert")).textContent).toContain("refusé")
    expect(router.state.location.pathname).toBe("/login")
  })

  it("affiche l'utilisateur connecté", async () => {
    renderAt("/")
    expect(await screen.findByText("anne@example.org")).toBeTruthy()
  })

  it("la déconnexion vide le cache et renvoie vers /login", async () => {
    const { router, auth, queryClient } = renderAt("/")
    await screen.findByText("Bowl de pastèque")
    expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole("button", { name: "Déconnexion" }))

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"))
    expect(auth.logouts.count).toBe(1)
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })

  it("repart vers /login quand une requête répond 401 en cours de session", async () => {
    const api = fakeApi()
    const expired = { ...api, list: () => Promise.reject(new Unauthenticated()) }
    const { router } = renderAt("/?search=creme", { api: expired })

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"))
    expect(router.state.location.search).toMatchObject({ redirect: "/?search=creme" })
  })
})
