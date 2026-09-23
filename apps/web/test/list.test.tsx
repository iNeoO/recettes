import { QueryClient } from "@tanstack/react-query"
import { createMemoryHistory } from "@tanstack/react-router"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { App } from "../src/App.tsx"
import { createAppRouter } from "../src/routes.tsx"
import { createSession } from "../src/session.ts"
import { fakeApi, fakeAuth, fakeLists } from "./fake-api.ts"

const renderApp = (api: ReturnType<typeof fakeApi>, path = "/") => {
  const session = createSession(fakeAuth())
  const router = createAppRouter(session, createMemoryHistory({ initialEntries: [path] }))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<App api={api} lists={fakeLists()} session={session} router={router} queryClient={queryClient} />)
  return router
}

afterEach(() => document.body.replaceChildren())

describe("liste des recettes", () => {
  it("affiche les recettes rendues par l'API", async () => {
    const api = fakeApi()
    renderApp(api)

    expect(await screen.findByText("Bowl de pastèque")).toBeTruthy()
    expect(screen.getByText("Curry de lentilles")).toBeTruthy()
    expect(screen.getByText("2 recettes")).toBeTruthy()
  })

  it("préfixe le chemin d'image rendu par l'API", async () => {
    renderApp(fakeApi())

    const image = await screen.findByRole("presentation")
    // L'API rend « /recipes/1/image » : sans préfixe, la SPA se servirait
    // elle-même au lieu d'appeler le serveur.
    expect(image.getAttribute("src")).toBe("/api/recipes/1/image")
  })

  it("remplace la photo manquante par une mention, pas par une image cassée", async () => {
    renderApp(fakeApi())
    expect(await screen.findByText("sans photo")).toBeTruthy()
  })

  it("porte la recherche dans l'URL et dans la requête", async () => {
    const api = fakeApi()
    const router = renderApp(api)
    await screen.findByText("Bowl de pastèque")

    await userEvent.type(screen.getByLabelText("Rechercher"), "creme")

    await waitFor(() => expect(router.state.location.search).toMatchObject({ search: "creme" }))
    await waitFor(() => expect(api.calls.at(-1)?.search).toBe("creme"))
  })

  it("lit les filtres depuis l'URL au premier rendu", async () => {
    const api = fakeApi()
    renderApp(api, "/?search=halloumi&book=2&category=Boissons")

    await waitFor(() =>
      expect(api.calls[0]).toMatchObject({
        search: "halloumi",
        book: 2,
        category: "Boissons",
      })
    )
  })

  it("ne blanchit pas la page sur une URL bricolée à la main", async () => {
    const api = fakeApi()
    renderApp(api, "/?limit=99999&offset=abc")

    // Retombe sur la liste sans filtre plutôt que de lever.
    expect(await screen.findByText("Bowl de pastèque")).toBeTruthy()
    expect(api.calls[0]).toEqual({})
  })

  it("conserve les filtres en changeant de page", async () => {
    const api = fakeApi({ total: 60, limit: 20, offset: 0 })
    const router = renderApp(api, "/?search=creme")
    await screen.findByText("Bowl de pastèque")

    await userEvent.click(screen.getByRole("button", { name: "Suivant" }))

    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ search: "creme", offset: 20 })
    )
    await waitFor(() => expect(api.calls.at(-1)).toMatchObject({ search: "creme", offset: 20 }))
  })

  it("annonce une liste vide plutôt que d'afficher une grille vide", async () => {
    renderApp(fakeApi({ items: [], total: 0 }))
    expect(await screen.findByText(/Aucune recette/)).toBeTruthy()
  })
})
