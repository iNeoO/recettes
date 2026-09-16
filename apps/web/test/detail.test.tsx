import { QueryClient } from "@tanstack/react-query"
import { createMemoryHistory } from "@tanstack/react-router"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { App } from "../src/App.tsx"
import { createAppRouter } from "../src/routes.tsx"
import { fakeApi, recipe } from "./fake-api.ts"

const renderAt = (path: string, api = fakeApi()) => {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }))
  render(
    <App
      api={api}
      router={router}
      queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    />
  )
  return router
}

afterEach(() => document.body.replaceChildren())

describe("détail d'une recette", () => {
  it("affiche le titre, la provenance et les portions", async () => {
    renderAt("/recipes/7")

    expect(await screen.findByRole("heading", { name: "Bowl de pastèque" })).toBeTruthy()
    expect(screen.getByText(/livre 1, page 1/)).toBeTruthy()
    expect(screen.getByText(/pour 2 personnes/)).toBeTruthy()
  })

  it("affiche chaque ingrédient avec sa quantité", async () => {
    renderAt("/recipes/7")

    expect(await screen.findByText("1/4")).toBeTruthy()
    expect(screen.getByRole("link", { name: "pastèque" })).toBeTruthy()
    expect(screen.getByText("60g")).toBeTruthy()
  })

  it("regroupe les ingrédients sous leur sous-section", async () => {
    renderAt("/recipes/7")
    expect(await screen.findByText("Pour la garniture")).toBeTruthy()
  })

  it("découpe les instructions en étapes numérotées", async () => {
    renderAt("/recipes/7")

    expect(await screen.findByText("Couper les tomates.")).toBeTruthy()
    expect(screen.getByText("Mélanger.")).toBeTruthy()
  })

  it("renvoie vers la liste filtrée quand on clique un ingrédient", async () => {
    const api = fakeApi()
    const router = renderAt("/recipes/7", api)
    await screen.findByRole("link", { name: "pastèque" })

    await userEvent.click(screen.getByRole("link", { name: "pastèque" }))

    expect(router.state.location.pathname).toBe("/")
    expect(router.state.location.search).toMatchObject({ search: "pastèque" })
  })

  it("annonce une recette introuvable au lieu de rester en chargement", async () => {
    const api = fakeApi()
    renderAt("/recipes/999", {
      ...api,
      byId: () => Promise.reject(new Error("RecipeNotFound")),
    })

    expect(await screen.findByRole("alert")).toBeTruthy()
  })

  it("n'affiche pas d'image quand la recette n'en a pas", async () => {
    const api = fakeApi()
    renderAt("/recipes/7", { ...api, byId: () => Promise.resolve(recipe({ imageUrl: null })) })

    await screen.findByRole("heading", { name: "Bowl de pastèque" })
    expect(screen.queryByRole("img")).toBeNull()
  })
})
