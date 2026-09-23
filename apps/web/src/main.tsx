import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { makeClients } from "./api.ts"
import { App } from "./App.tsx"
import { createSession } from "./session.ts"
import "./index.css"

const root = document.getElementById("root")
if (root === null) throw new Error("#root introuvable dans index.html")

const { recipes, auth, lists } = await makeClients()

createRoot(root).render(
  <StrictMode>
    <App api={recipes} lists={lists} session={createSession(auth)} />
  </StrictMode>
)
