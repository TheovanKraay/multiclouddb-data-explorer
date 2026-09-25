// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

package com.microsoft.multiclouddb.explorer.sidecar;

import java.security.SecureRandom;
import java.util.Base64;

/**
 * Entrypoint for the MultiCloudDB Data Explorer Java sidecar.
 * <p>
 * The Tauri shell launches this process, reads the {@code SIDECAR_READY <port> <token>}
 * line from stdout, and thereafter calls the loopback HTTP API with the bearer token.
 * <p>
 * Args:
 * <pre>
 *   --port &lt;n&gt;   bind port (default 0 = ephemeral; the chosen port is reported on stdout)
 *   --token &lt;s&gt;  bearer token (default: a fresh random token, reported on stdout)
 * </pre>
 */
public final class SidecarMain {

    public static void main(String[] args) throws Exception {
        int port = 0;
        String token = null;
        for (int i = 0; i < args.length - 1; i++) {
            if ("--port".equals(args[i])) {
                port = Integer.parseInt(args[i + 1]);
            } else if ("--token".equals(args[i])) {
                token = args[i + 1];
            }
        }
        if (token == null || token.isBlank()) {
            byte[] raw = new byte[32];
            new SecureRandom().nextBytes(raw);
            token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        }

        SidecarServer server = new SidecarServer(token);
        Runtime.getRuntime().addShutdownHook(new Thread(server::stop));
        server.start(port);

        // Keep the process alive until killed by the parent (Tauri) or a signal.
        Thread.currentThread().join();
    }
}
