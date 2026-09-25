// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { useEffect, useState } from "react";
import "./App.css";
import { disconnect, sidecarInfo } from "./api";
import type { ConnectResult } from "./api";
import { ConnectionForm } from "./components/ConnectionForm";
import { CapabilityBadges } from "./components/CapabilityBadges";
import { QueryPanel } from "./components/QueryPanel";
import { DocumentPanel } from "./components/DocumentPanel";

type Tab = "query" | "document";

function App() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [conn, setConn] = useState<ConnectResult | null>(null);
  const [tab, setTab] = useState<Tab>("query");

  useEffect(() => {
    sidecarInfo()
      .then((info) => setReady(info.ready))
      .catch(() => setReady(false));
  }, []);

  const onDisconnect = async () => {
    if (conn) {
      try {
        await disconnect(conn.connectionId);
      } catch {
        /* best effort */
      }
      setConn(null);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>MultiCloudDB Data Explorer</h1>
        {conn && (
          <div className="conn-status">
            <span className="pill">{conn.provider}</span>
            <button className="linklike" onClick={onDisconnect}>
              Disconnect
            </button>
          </div>
        )}
      </header>

      {ready === false && (
        <div className="error-banner global">
          Backend sidecar is not running. Restart the application.
        </div>
      )}

      {!conn ? (
        <main className="connect-view">
          <ConnectionForm onConnected={setConn} />
        </main>
      ) : (
        <main className="explorer-view">
          <CapabilityBadges capabilities={conn.capabilities} />

          <nav className="tabs">
            <button
              className={tab === "query" ? "active" : ""}
              onClick={() => setTab("query")}
            >
              Query
            </button>
            <button
              className={tab === "document" ? "active" : ""}
              onClick={() => setTab("document")}
            >
              Document
            </button>
          </nav>

          {tab === "query" ? (
            <QueryPanel
              connectionId={conn.connectionId}
              capabilities={conn.capabilities}
            />
          ) : (
            <DocumentPanel connectionId={conn.connectionId} />
          )}
        </main>
      )}
    </div>
  );
}

export default App;
