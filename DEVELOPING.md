# Developing

## Prerequisites

- **Java 17+**
- **Node 20+**
- **Rust** (stable)
- [Tauri OS prerequisites](https://tauri.app/start/prerequisites/)

## Clone

```bash
git clone https://github.com/TheovanKraay/multiclouddb-data-explorer.git
cd multiclouddb-data-explorer
```

## Run from source

```bash
# 1. Build the backend jar
cd sidecar && mvn -DskipTests package && cd ..

# 2. Install frontend deps and run the app
cd frontend
npm install
npm run tauri dev
```

## Build installers locally

```bash
cd frontend && npm run tauri build
```

Installers land in `frontend/src-tauri/target/release/bundle/`.

## Releases (CI)

Installers are built by GitHub Actions (`.github/workflows/build.yml`) on a
3-OS matrix. To cut a release, push a version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

CI builds the sidecar jar, the frontend, and the Tauri installers for Windows,
macOS, and Linux, then publishes them as assets on a GitHub Release named after
the tag. The one-line install scripts (`install.sh` / `install.ps1`) read the
`latest` release, so a new tag is all that's needed to ship an update.

You can also trigger the workflow manually from the **Actions** tab (installers
are uploaded as workflow artifacts in that case).

**Users never need Rust.** It's only required to build the app, which happens in
CI. End users get an installer and only need a JRE (Java 17+) at runtime.
