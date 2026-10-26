import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { normalizeRoute, statusClass } from "../src/http/metrics.ts"
import { ACCOUNT, fetchPath, loginRaw, seedAccount, TestServer } from "./harness.ts"

describe("normalisation des routes", () => {
  it("remplace les identifiants et ne garde que les routes connues", () => {
    expect(normalizeRoute("/recipes/42")).toBe("/recipes/:id")
    expect(normalizeRoute("/recipes/42/image")).toBe("/recipes/:id/image")
    expect(normalizeRoute("/lists/7/checks/12?x=1")).toBe("/lists/:id/checks/:id")
    expect(normalizeRoute("/lists/7/finalize")).toBe("/lists/:id/finalize")
    expect(normalizeRoute("/lists/7/reopen")).toBe("/lists/:id/reopen")
    expect(normalizeRoute("/lists/7/suggestions?count=6")).toBe("/lists/:id/suggestions")
    expect(normalizeRoute("/lists/7/recipes/random")).toBe("other")
    expect(normalizeRoute("/lists/7/recipes/3/replace")).toBe("/lists/:id/recipes/:id/replace")
    expect(normalizeRoute("/recipes?search=creme&limit=3")).toBe("/recipes")
    expect(normalizeRoute("/docs/openapi.json")).toBe("/docs")
    expect(normalizeRoute("/wp-admin.php")).toBe("other")
    expect(normalizeRoute("/recipes/abc")).toBe("other")
  })

  it("classe les statuts par centaine", () => {
    expect(statusClass(204)).toBe("2xx")
    expect(statusClass(404)).toBe("4xx")
    expect(statusClass(500)).toBe("5xx")
  })
})

describe("GET /metrics", () => {
  it.layer(TestServer)("scrape", (it) => {
    it.effect("expose les métriques Prometheus sans session", () =>
      Effect.gen(function* () {
        yield* fetchPath("/recipes")
        const response = yield* fetchPath("/metrics")

        expect(response.status).toBe(200)
        expect(response.headers.get("content-type")).toContain("text/plain")
        const body = yield* Effect.promise(() => response.text())
        expect(body).toContain("recettes_api_process_cpu_user_seconds_total")
        expect(body).toMatch(
          /recettes_api_http_request_duration_seconds_count\{route="\/recipes",method="GET",status_class="4xx"\} \d+/
        )
      }))

    it.effect("compte les connexions par résultat", () =>
      Effect.gen(function* () {
        yield* seedAccount()
        yield* loginRaw(ACCOUNT.email, "faux")
        yield* loginRaw(ACCOUNT.email, ACCOUNT.password)

        const body = yield* fetchPath("/metrics").pipe(
          Effect.flatMap((r) => Effect.promise(() => r.text()))
        )
        const count = (result: string) =>
          Number(new RegExp(`recettes_api_logins_total\\{result="${result}"\\} (\\d+)`).exec(body)?.[1])
        expect(count("failure")).toBeGreaterThanOrEqual(1)
        expect(count("success")).toBeGreaterThanOrEqual(1)
      }))
  })
})
