// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

package com.microsoft.multiclouddb.explorer.sidecar;

import com.multiclouddb.api.MulticloudDbClient;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Holds live {@link MulticloudDbClient} instances keyed by an opaque connection id.
 * The UI opens a connection once, then references it by id on subsequent calls.
 */
final class ConnectionRegistry {

    private final Map<String, Entry> connections = new ConcurrentHashMap<>();

    record Entry(String id, String provider, MulticloudDbClient client) {
    }

    String open(ConnectionSpec spec) {
        MulticloudDbClient client = ClientFactory.create(spec);
        String id = UUID.randomUUID().toString();
        connections.put(id, new Entry(id, spec.provider(), client));
        return id;
    }

    Entry get(String id) {
        Entry e = connections.get(id);
        if (e == null) {
            throw new IllegalArgumentException("No such connection: " + id);
        }
        return e;
    }

    void close(String id) {
        Entry e = connections.remove(id);
        if (e != null) {
            try {
                e.client().close();
            } catch (Exception ignored) {
                // best-effort close
            }
        }
    }

    void closeAll() {
        for (String id : Map.copyOf(connections).keySet()) {
            close(id);
        }
    }
}
