// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

package com.microsoft.multiclouddb.explorer.sidecar;

import com.multiclouddb.api.MulticloudDbClient;
import com.multiclouddb.api.MulticloudDbClientConfig;
import com.multiclouddb.api.MulticloudDbClientFactory;
import com.multiclouddb.api.ProviderId;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Builds a {@link MulticloudDbClient} from a connection request coming off the wire.
 * <p>
 * Critically, this reproduces the SDK's <em>non-uniform</em> connection/auth split
 * (verified against the provider adapters):
 * <ul>
 *   <li><b>cosmos</b> — reads {@code endpoint, key, tenantId, connectionMode,
 *       consistencyLevel} from <b>connection()</b>; never touches auth().
 *       Identity auth (DefaultAzureCredential) is triggered by an <em>absent/blank key</em>.</li>
 *   <li><b>dynamo</b> — {@code region, endpoint} from connection(); {@code accessKeyId,
 *       secretAccessKey} from <b>auth()</b>. Absent keys ⇒ AWS default credential chain.</li>
 *   <li><b>spanner</b> — {@code projectId, instanceId, databaseId, emulatorHost} from
 *       connection() only; identity-only (GCP ADC), emulatorHost bypasses auth.</li>
 * </ul>
 * The UI sends a flat property bag; this class routes each property to the correct
 * map so the underlying adapter reads it where it expects.
 */
final class ClientFactory {

    private ClientFactory() {
    }

    /** Property keys the UI may send, per provider — used for validation/echo. */
    static MulticloudDbClient create(ConnectionSpec spec) {
        ProviderId provider = ProviderId.fromId(spec.provider());
        String p = spec.provider().toLowerCase(Locale.ROOT);

        Map<String, String> connection = new HashMap<>();
        Map<String, String> auth = new HashMap<>();

        Map<String, String> in = spec.properties() != null ? spec.properties() : Map.of();

        switch (p) {
            case "cosmos" -> {
                // All Cosmos properties (including the key + tenantId) live in connection().
                putIfPresent(connection, in, "endpoint");
                putIfPresent(connection, in, "key");            // blank/absent ⇒ DefaultAzureCredential
                putIfPresent(connection, in, "tenantId");
                putIfPresent(connection, in, "connectionMode"); // direct | gateway
                putIfPresent(connection, in, "consistencyLevel");
            }
            case "dynamo" -> {
                putIfPresent(connection, in, "region");
                putIfPresent(connection, in, "endpoint");
                // accessKeyId + secretAccessKey belong in auth(); both absent ⇒ default chain.
                putIfPresent(auth, in, "accessKeyId");
                putIfPresent(auth, in, "secretAccessKey");
            }
            case "spanner" -> {
                putIfPresent(connection, in, "projectId");
                putIfPresent(connection, in, "instanceId");
                putIfPresent(connection, in, "databaseId");
                putIfPresent(connection, in, "emulatorHost"); // set ⇒ emulator, bypasses ADC
            }
            default -> throw new IllegalArgumentException("Unknown provider: " + spec.provider());
        }

        MulticloudDbClientConfig config = MulticloudDbClientConfig.builder()
                .provider(provider)
                .connection(connection)
                .auth(auth)
                .userAgentSuffix("multiclouddb-data-explorer/0.1.0")
                .build();

        return MulticloudDbClientFactory.create(config);
    }

    private static void putIfPresent(Map<String, String> target, Map<String, String> src, String key) {
        String v = src.get(key);
        if (v != null && !v.isBlank()) {
            target.put(key, v);
        }
    }
}
