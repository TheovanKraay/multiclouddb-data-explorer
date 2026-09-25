# Architecture

The Data Explorer is a Tauri desktop app with three layers: a **React/TypeScript
frontend**, a **Rust shell**, and a **Java sidecar** that wraps the MultiCloudDB SDK.

```
┌──────────────────────────────────────────────┐
│  Tauri window                                 │
│  ┌────────────────────┐                       │
│  │ React + TS frontend│  invoke()             │
│  │ (Vite build)       │ ───────────┐          │
│  └────────────────────┘            ▼          │
│                          ┌───────────────────┐│
│                          │ Rust shell        ││
│                          │ - spawns sidecar  ││
│                          │ - holds the token ││
│                          │ - proxies requests││
│                          └─────────┬─────────┘│
└────────────────────────────────────┼──────────┘
                                      │ HTTP (localhost, bearer token)
                              ┌───────▼─────────┐
                              │ Java sidecar    │
                              │ (fat-jar)       │
                              │ REST bridge over│
                              │ MultiCloudDB SDK│
                              └───────┬─────────┘
                                      │ SDK
                        ┌─────────────┼─────────────┐
                        ▼             ▼             ▼
                    Cosmos DB     DynamoDB       Spanner
```

## Components

### Java sidecar (`sidecar/`)

- A fat-jar (built with the Maven Shade plugin) bundling the MultiCloudDB `api`
  module and all three providers (Cosmos, DynamoDB, Spanner).
- Exposes a small REST bridge over the SDK: `/health`, `/providers` (connection-form
  catalog), connect/disconnect, query, and document CRUD.
- Binds to an ephemeral port (`--port 0`) and prints a handshake line on stdout:
  `SIDECAR_READY <port> <token>`.
- Every request must carry the bearer token; without it the sidecar returns `401`.
  This prevents any other local process from driving the SDK.

### Rust shell (`frontend/src-tauri/`)

- On startup, `sidecar.rs` locates the bundled jar (packaged as a Tauri resource,
  with a dev fallback to `sidecar/target/`), launches `java -jar <jar> --port 0`,
  and blocks until it reads the `SIDECAR_READY` handshake.
- Holds the port + token in Rust state. The frontend never sees the token.
- Exposes a single `sidecar_request` Tauri command that the frontend calls; the
  shell attaches the bearer token and proxies to the sidecar over localhost HTTP.

### Frontend (`frontend/src/`)

- React + TypeScript, built with Vite.
- `api.ts` — typed client wrapping the `sidecar_request` command.
- Components: `ConnectionForm` (driven by the `/providers` catalog),
  `CapabilityBadges`, `QueryPanel`, `DocumentPanel`, `ResultsTable`, `DslEditor`.

## The query DSL

The SDK has two query paths, both surfaced in the explorer:

1. **Portable DSL** — the SDK's provider-agnostic expression language, mapped to
   `QueryRequest.expression(...)`. Always available. The explorer's `DslEditor`
   provides:
   - **Syntax highlighting** via a tokenizer (`dslTokens.ts`) that mirrors the SDK's
     lexer.
   - **Autocomplete** for the five portable functions (`starts_with`, `contains`,
     `field_exists`, `string_length`, `collection_size`), keywords
     (`AND/OR/NOT/IN/BETWEEN`), and (once sampled) document field paths.
   - **Inline validation** (`dsl.ts`) mirroring the tokenizer for fast feedback;
     the SDK's parser remains the authority and its errors surface verbatim on run.
   - **`@parameter` editor** wired to `QueryRequest.parameter(...)`, with number/bool
     coercion.
   - **Schema-aware field autocomplete** — a "Sample schema" action runs a small
     query and infers field paths (`schema.ts`), then flags unknown fields softly.

   The DSL definitions in `dsl.ts` / `dslTokens.ts` are transcribed directly from the
   SDK's `ExpressionParser.java` grammar and `PortableFunction.java` enum. Keep them
   in sync if the SDK grammar changes.

2. **Native SQL** — provider-native query text, gated on the `native_sql_query`
   capability reported at connect time.

## Build & release

`.github/workflows/build.yml` runs a 3-OS matrix. Each job:

1. Installs the Tauri OS prerequisites (Linux only).
2. Builds the sidecar jar (`mvn package`).
3. Builds the frontend (`npm ci`).
4. Runs `tauri-action` to produce installers.
5. Uploads them as artifacts.

**Users never need Rust.** The Rust toolchain is only required to *build* the app,
which happens in CI. End users get a signed installer and only need a JRE (Java 17+)
at runtime.

The sidecar jar is bundled into the installer via the `bundle.resources` entry in
`tauri.conf.json`, so it ships inside the packaged app.
