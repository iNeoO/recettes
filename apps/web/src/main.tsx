import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { makeApi } from "./api.ts"
import { App } from "./App.tsx"
import "./index.css"

const root = document.getElementById("root")
if (root === null) throw new Error("#root introuvable dans index.html")

createRoot(root).render(
  <StrictMode>
    <App api={await makeApi()} />
  </StrictMode>
)
