# MultiCloudDB Data Explorer

A desktop app for connecting to a cloud database (Cosmos DB, DynamoDB, or Spanner)
through the MultiCloudDB SDK and running queries, browsing documents, and inspecting
capabilities.

## Install

Download the installer for your OS from the [latest release](../../releases/latest):

| OS      | File            |
| ------- | --------------- |
| Windows | `.msi`          |
| macOS   | `.dmg`          |
| Linux   | `.deb` / `.AppImage` |

Run the installer and launch **MultiCloudDB Data Explorer** like any other app.

> **Requirement:** Java 17+ must be installed and on your `PATH`
> ([download](https://adoptium.net/)). The app uses it to talk to the database.

## Use

1. Launch the app.
2. Pick your provider and fill in the connection details.
3. Click **Connect**.
4. Use the **Query** tab to run queries and the **Document** tab to read/write documents.

## Run from source (developers)

Prerequisites: **Java 17+**, **Node 20+**, **Rust** (stable), and the
[Tauri OS prerequisites](https://tauri.app/start/prerequisites/).

```bash
# 1. Build the backend jar
cd sidecar && mvn -DskipTests package && cd ..

# 2. Install frontend deps and run the app
cd frontend
npm install
npm run tauri dev
```

To build installers locally:

```bash
cd frontend && npm run tauri build
```

Installers land in `frontend/src-tauri/target/release/bundle/`.

---

Architecture and internals: see [ARCHITECTURE.md](ARCHITECTURE.md).
