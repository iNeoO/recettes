import type { ShoppingList } from "@recettes/contract"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useListsApi } from "./api.ts"

export const listKey = (id: number) => ["list", id] as const
export const listsKey = ["lists"] as const

/**
 * Une liste et la façon de la modifier : chaque mutation du serveur rend la
 * liste complète, on l'écrit directement dans le cache plutôt que de la
 * redemander. L'énumération des listes est invalidée au passage.
 */
export const useShoppingList = (id: number) => {
  const lists = useListsApi()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: listKey(id), queryFn: () => lists.byId(id) })

  const mutation = useMutation({
    mutationFn: (run: () => Promise<ShoppingList>) => run(),
    onSuccess: (list) => {
      queryClient.setQueryData(listKey(id), list)
      void queryClient.invalidateQueries({ queryKey: listsKey })
    },
  })

  return { ...query, mutate: mutation.mutate, pending: mutation.isPending }
}
