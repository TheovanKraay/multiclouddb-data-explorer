# MultiCloudDB Data Explorer

A desktop app for connecting to a cloud database (Cosmos DB, DynamoDB, or Spanner)
and running queries, browsing documents, and inspecting capabilities.

## Install

**macOS / Linux**

```bash
curl -fsSL https://raw.githubusercontent.com/TheovanKraay/multiclouddb-data-explorer/main/install.sh | bash
```

**Windows** (PowerShell)

```powershell
irm https://raw.githubusercontent.com/TheovanKraay/multiclouddb-data-explorer/main/install.ps1 | iex
```

> Requires **Java 17+** on your `PATH` ([download](https://adoptium.net/)).

## Use

1. Launch **MultiCloudDB Data Explorer**.
2. Pick your provider, enter connection details, and click **Connect**.
3. Use the **Query** tab to run queries and the **Document** tab to read/write documents.

---

Building from source: see [DEVELOPING.md](DEVELOPING.md).
Architecture: see [ARCHITECTURE.md](ARCHITECTURE.md).
