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

  it("signale les listes en brouillon", async () => {
    renderAt("/lists", [shoppingList({ status: "draft" }), shoppingList({ id: 4, name: "1 octobre 2026" })])
    const draft = (await screen.findByText("23 septembre 2026")).closest("li")!
    expect(within(draft).getByText("Brouillon")).toBeTruthy()
    const ready = screen.getByText("1 octobre 2026").closest("li")!
    expect(within(ready).queryByText("Brouillon")).toBeNull()
  })

  it("créer tire 5 repas par défaut et ouvre la préparation", async () => {
    const { router, lists } = renderAt("/lists", [])
    await screen.findByText(/Aucune liste/)

    expect(screen.getByLabelText("Nombre de repas")).toHaveProperty("value", "5")
    await userEvent.click(screen.getByRole("button", { name: "Créer une liste" }))

    await waitFor(() => expect(router.state.location.pathname).toBe("/lists/1/plats"))
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

  it("créer avec 0 repas ouvre une préparation vide, impossible à valider", async () => {
    const { router } = renderAt("/lists", [])
    await screen.findByText(/Aucune liste/)

    const meals = screen.getByLabelText("Nombre de repas")
    await userEvent.clear(meals)
    await userEvent.type(meals, "0")
    await userEvent.click(screen.getByRole("button", { name: "Créer une liste" }))

    await waitFor(() => expect(router.state.location.pathname).toBe("/lists/1/plats"))
    expect(await screen.findByText("Aucun plat pour l'instant.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Valider les plats" })).toHaveProperty("disabled", true)
  })

  it("refuse de créer sans nombre de repas valide", async () => {
    const { lists } = renderAt("/lists", [])
    await screen.findByText(/Aucune liste/)

    await userEvent.clear(screen.getByLabelText("Nombre de repas"))
    await userEvent.click(screen.getByRole("button", { name: "Créer une liste" }))

    expect(lists.calls.filter((c) => c.startsWith("create"))).toEqual([])
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

  it("modifier les plats rouvre la liste et mène à la préparation", async () => {
    const { router, lists } = renderAt("/lists/3")
    await screen.findByRole("heading", { name: "23 septembre 2026" })

    await userEvent.click(screen.getByRole("button", { name: "Modifier les plats" }))

    await waitFor(() => expect(router.state.location.pathname).toBe("/lists/3/plats"))
    expect(lists.calls).toContain("reopen 3")
    expect(await screen.findByRole("button", { name: "Valider les plats" })).toBeTruthy()
  })

  it("une liste en brouillon ouvre la préparation, une liste prête les courses", async () => {
    const draft = renderAt("/lists/3", [shoppingList({ status: "draft" })])
    await waitFor(() => expect(draft.router.state.location.pathname).toBe("/lists/3/plats"))
    document.body.replaceChildren()

    const ready = renderAt("/lists/3/plats")
    await waitFor(() => expect(ready.router.state.location.pathname).toBe("/lists/3"))
    expect(await screen.findByRole("heading", { name: "À acheter" })).toBeTruthy()
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

const draft = (over: Partial<ShoppingList> = {}) => shoppingList({ status: "draft", ...over })

describe("préparation d'une liste", () => {
  it("affiche les plats avec leurs ingrédients phares", async () => {
    renderAt("/lists/3/plats", [draft()])

    expect(await screen.findByText("Bowl de pastèque")).toBeTruthy()
    expect(screen.getByText("lentilles corail, lait de coco")).toBeTruthy()
    expect(screen.getByText("2 plats")).toBeTruthy()
  })

  it("retire un plat", async () => {
    const { lists } = renderAt("/lists/3/plats", [draft()])
    await screen.findByText("Curry de lentilles")

    await userEvent.click(screen.getByRole("button", { name: "Retirer Curry de lentilles" }))

    await waitFor(() => expect(lists.calls).toContain("removeRecipe 3 2"))
    await waitFor(() => expect(screen.queryByText("Curry de lentilles")).toBeNull())
  })

  it("remplace un plat par une proposition choisie dans le drawer", async () => {
    const { lists } = renderAt("/lists/3/plats", [draft()])
    await screen.findByText("Curry de lentilles")

    await userEvent.click(screen.getByRole("button", { name: "Remplacer Curry de lentilles" }))

    const drawer = await screen.findByRole("dialog")
    expect(within(drawer).getByText("Remplacer Curry de lentilles")).toBeTruthy()
    await userEvent.click(await within(drawer).findByRole("button", { name: /Plat proposé 1/ }))

    await waitFor(() => expect(lists.calls).toContain("replaceRecipe 3 2 201"))
    expect(await screen.findByText("Recette 201")).toBeTruthy()
    await waitFor(() => expect(screen.queryByText("Curry de lentilles")).toBeNull())
  })

  it("autres propositions relance un tirage", async () => {
    const { lists } = renderAt("/lists/3/plats", [draft()])
    await screen.findByText("Curry de lentilles")
    await userEvent.click(screen.getByRole("button", { name: "Ajouter un plat" }))
    const drawer = await screen.findByRole("dialog")
    await within(drawer).findByText("Plat proposé 6")

    await userEvent.click(within(drawer).getByRole("button", { name: "Autres propositions" }))

    expect(await within(drawer).findByText("Plat proposé 12")).toBeTruthy()
    expect(within(drawer).queryByText("Plat proposé 1")).toBeNull()
    expect(lists.calls.filter((c) => c === "suggestions 3")).toHaveLength(2)
  })

  it("une recherche montre les plats déjà présents sans les rendre choisissables", async () => {
    const [bowl] = shoppingList().recipes
    const { lists } = renderAt("/lists/3/plats", [draft({ recipes: [bowl!] })])
    await screen.findByText("Bowl de pastèque")
    await userEvent.click(screen.getByRole("button", { name: "Ajouter un plat" }))
    const drawer = await screen.findByRole("dialog")

    await userEvent.type(within(drawer).getByLabelText("Chercher un plat"), "bowl")

    const present = await within(drawer).findByRole("button", { name: /Bowl de pastèque/ })
    expect(present).toHaveProperty("disabled", true)
    expect(within(present).getByText("Déjà dans la liste")).toBeTruthy()

    await userEvent.click(within(drawer).getByRole("button", { name: /Curry de lentilles/ }))
    await waitFor(() => expect(lists.calls).toContain("addRecipe 3 2"))
  })

  it("valider passe la liste en prête et mène aux courses", async () => {
    const { router, lists } = renderAt("/lists/3/plats", [draft()])
    await screen.findByText("Curry de lentilles")

    await userEvent.click(screen.getByRole("button", { name: "Valider les plats" }))

    await waitFor(() => expect(router.state.location.pathname).toBe("/lists/3"))
    expect(lists.calls).toContain("finalize 3")
    expect(await screen.findByRole("heading", { name: "À acheter" })).toBeTruthy()
  })

  it("dit quand une liste en préparation est introuvable", async () => {
    renderAt("/lists/99/plats")
    expect((await screen.findByRole("alert")).textContent).toContain("introuvable")
  })
})
