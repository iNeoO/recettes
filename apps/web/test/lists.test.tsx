import type { ShoppingList } from "@recettes/contract"
import { QueryClient } from "@tanstack/react-query"
import { createMemoryHistory } from "@tanstack/react-router"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { App } from "../src/App.tsx"
import { createAppRouter } from "../src/routes.tsx"
import { createSession } from "../src/session.ts"
import { fakeApi, fakeAuth, fakeLists, shoppingList } from "./fake-api.ts"

const renderAt = (path: string, initial: ReadonlyArray<ShoppingList> = [shoppingList()]) => {
  const lists = fakeLists(initial)
  const session = createSession(fakeAuth())
  const router = createAppRouter(session, createMemoryHistory({ initialEntries: [path] }))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<App api={fakeApi()} lists={lists} session={session} router={router} queryClient={queryClient} />)
  return { router, lists, queryClient }
}

afterEach(() => document.body.replaceChildren())

describe("listes de courses", () => {
  it("énumère les listes avec leur nombre de plats", async () => {
    renderAt("/lists")

    expect(await screen.findByText("23 septembre 2026")).toBeTruthy()
    expect(screen.getByText(/3 plats · 2 pers\./)).toBeTruthy()
  })

  it("créer tire 5 repas par défaut et ouvre la liste", async () => {
    const { router, lists } = renderAt("/lists", [])
    await screen.findByText(/Aucune liste/)

    expect(screen.getByLabelText("Nombre de repas")).toHaveProperty("value", "5")
    await userEvent.click(screen.getByRole("button", { name: "Créer une liste" }))

    await waitFor(() => expect(router.state.location.pathname).toBe("/lists/1"))
    expect(lists.calls).toContain("create 5")
    expect(await screen.findByText("Plat tiré 5")).toBeTruthy()
  })

  it("créer tire le nombre de repas saisi", async () => {
    const { lists } = renderAt("/lists", [])
    await screen.findByText(/Aucune liste/)

    const meals = screen.getByLabelText("Nombre de repas")
    await userEvent.clear(meals)
    await userEvent.type(meals, "2")
    await userEvent.click(screen.getByRole("button", { name: "Créer une liste" }))

    await waitFor(() => expect(lists.calls).toContain("create 2"))
    expect(await screen.findByText("Plat tiré 2")).toBeTruthy()
    expect(screen.queryByText("Plat tiré 3")).toBeNull()
  })

  it("refuse de créer sans nombre de repas valide", async () => {
    const { lists } = renderAt("/lists", [])
    await screen.findByText(/Aucune liste/)

    await userEvent.clear(screen.getByLabelText("Nombre de repas"))
    await userEvent.click(screen.getByRole("button", { name: "Créer une liste" }))

    expect(lists.calls.filter((c) => c.startsWith("create"))).toEqual([])
  })

  it("ajouter incrémente le plat et le bandeau, retirer décrémente", async () => {
    const { lists } = renderAt("/?list=3", [shoppingList({ recipes: [] })])
    await screen.findByText("Bowl de pastèque")

    const [addFirst] = await screen.findAllByRole("button", { name: "Ajouter" })
    await userEvent.click(addFirst!)
    await userEvent.click(addFirst!)

    expect(await screen.findByText("×2")).toBeTruthy()
    expect(screen.getByRole("status").textContent).toContain("2 plats")
    expect(lists.calls.filter((c) => c.startsWith("addRecipe 3 1"))).toHaveLength(2)

    await userEvent.click(screen.getByRole("button", { name: "Retirer une fois" }))
    expect(await screen.findByText("×1")).toBeTruthy()
  })

  it("terminer ouvre la liste", async () => {
    const { router } = renderAt("/?list=3")
    await screen.findByRole("status")

    await userEvent.click(screen.getByRole("link", { name: "Terminer" }))

    await waitFor(() => expect(router.state.location.pathname).toBe("/lists/3"))
    expect(await screen.findByRole("heading", { name: "23 septembre 2026" })).toBeTruthy()
  })

  it("quand la liste en cours n'existe plus, le bandeau le dit et cache Ajouter", async () => {
    renderAt("/?list=42", [])
    await screen.findByText("Bowl de pastèque")

    const banner = await screen.findByRole("status")
    await waitFor(() => expect(banner.textContent).toContain("n'existe plus"))
    expect(screen.getByRole("link", { name: "Voir les listes" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Ajouter" })).toBeNull()
  })

  it("sans liste en cours, aucun bouton Ajouter ni bandeau", async () => {
    renderAt("/")
    await screen.findByText("Bowl de pastèque")
    expect(screen.queryByRole("button", { name: "Ajouter" })).toBeNull()
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("affiche les plats, les quantités arrondies et le placard", async () => {
    renderAt("/lists/3")

    expect(await screen.findByRole("heading", { name: "23 septembre 2026" })).toBeTruthy()
    expect(screen.getByText("×2")).toBeTruthy()
    expect(screen.getByText("2 gousses")).toBeTruthy()
    expect(screen.getByText("350 g")).toBeTruthy()
    expect(screen.getByText("1,2 l")).toBeTruthy()
    expect(screen.getByText("3")).toBeTruthy()
    const pantry = screen.getByRole("heading", { name: "Placard" }).parentElement!
    expect(within(pantry).getByText("huile d'olive")).toBeTruthy()
  })

  it("cocher appelle l'API et l'état persiste après rechargement", async () => {
    const { lists, queryClient } = renderAt("/lists/3")
    await screen.findByRole("heading", { name: "23 septembre 2026" })

    const farine = screen.getByRole("checkbox", { name: /farine/ })
    await userEvent.click(farine)

    expect(screen.getByRole("checkbox", { name: /farine/ })).toHaveProperty("checked", true)
    await waitFor(() => expect(lists.calls).toContain("setChecked 3 11 true"))

    // Un rechargement relit le faux serveur, qui a retenu la case.
    await queryClient.invalidateQueries({ queryKey: ["list", 3] })
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: /farine/ })).toHaveProperty("checked", true)
    )
    expect(screen.getByRole("checkbox", { name: /lait/ })).toHaveProperty("checked", true)
    expect(screen.getByRole("checkbox", { name: /ail/ })).toHaveProperty("checked", false)
  })

  it("change le nombre de personnes", async () => {
    const { lists } = renderAt("/lists/3")
    await screen.findByRole("heading", { name: "23 septembre 2026" })

    await userEvent.click(screen.getByRole("button", { name: "Une personne de plus" }))

    await waitFor(() => expect(lists.calls).toContain("setServings 3 3"))
    expect(await screen.findByLabelText("Nombre de personnes")).toHaveProperty("textContent", "3")
  })

  it("retire un plat depuis la liste", async () => {
    const { lists } = renderAt("/lists/3")
    await screen.findByRole("heading", { name: "23 septembre 2026" })

    await userEvent.click(screen.getByRole("button", { name: "Retirer Curry de lentilles" }))

    await waitFor(() => expect(lists.calls).toContain("removeRecipe 3 2"))
    await waitFor(() => expect(screen.queryByText("Curry de lentilles")).toBeNull())
  })

  it("ajoute un plat au hasard depuis la liste", async () => {
    const { lists } = renderAt("/lists/3")
    await screen.findByRole("heading", { name: "23 septembre 2026" })

    await userEvent.click(screen.getByRole("button", { name: "Un plat au hasard" }))

    await waitFor(() => expect(lists.calls).toContain("addRandomRecipe 3"))
    expect(await screen.findByText("Plat tiré 1")).toBeTruthy()
  })

  it("remplace un plat par un autre tiré au hasard, à sa place", async () => {
    const { lists } = renderAt("/lists/3")
    await screen.findByRole("heading", { name: "23 septembre 2026" })

    await userEvent.click(screen.getByRole("button", { name: "Remplacer Curry de lentilles" }))

    await waitFor(() => expect(lists.calls).toContain("replaceRecipe 3 2"))
    await waitFor(() => expect(screen.queryByText("Curry de lentilles")).toBeNull())
    const dishes = screen.getByRole("heading", { name: "Plats" }).closest("section")!
    expect(within(dishes).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringContaining("Bowl de pastèque"),
      expect.stringContaining("Plat tiré 1"),
    ])
  })

  it("garde l'accès au catalogue pour choisir à la main", async () => {
    renderAt("/lists/3")
    await screen.findByRole("heading", { name: "23 septembre 2026" })

    const link = screen.getByRole("link", { name: "Choisir dans le catalogue" })
    expect(link.getAttribute("href")).toBe("/?list=3")
  })

  it("supprime une liste en deux clics et revient aux listes", async () => {
    const { router, lists } = renderAt("/lists/3")
    await screen.findByRole("heading", { name: "23 septembre 2026" })

    await userEvent.click(screen.getByRole("button", { name: "Supprimer cette liste" }))
    expect(lists.calls).not.toContain("remove 3")
    await userEvent.click(screen.getByRole("button", { name: "Confirmer la suppression" }))

    await waitFor(() => expect(router.state.location.pathname).toBe("/lists"))
    expect(lists.state.has(3)).toBe(false)
    expect(await screen.findByText(/Aucune liste/)).toBeTruthy()
  })

  it("dit quand une liste est introuvable", async () => {
    renderAt("/lists/99")
    expect((await screen.findByRole("alert")).textContent).toContain("introuvable")
  })
})
