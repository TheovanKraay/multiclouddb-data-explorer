// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

package com.microsoft.multiclouddb.explorer.sidecar;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.multiclouddb.api.Capability;
import com.multiclouddb.api.CapabilitySet;
import com.multiclouddb.api.DocumentResult;
import com.multiclouddb.api.MulticloudDbClient;
import com.multiclouddb.api.MulticloudDbException;
import com.multiclouddb.api.MulticloudDbKey;
import com.multiclouddb.api.QueryPage;
import com.multiclouddb.api.QueryRequest;
import com.multiclouddb.api.ResourceAddress;
import com.multiclouddb.api.SortDirection;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Embedded HTTP bridge exposing the MultiCloudDB SDK to the desktop UI.
 * <p>
 * Uses the JDK's built-in {@link HttpServer} (no framework) to keep the sidecar
 * small and bundle-friendly. Binds to loopback only. A per-process bearer token
 * (printed on stdout as {@code SIDECAR_READY <port> <token>}) guards every route
 * so no other local process can drive the databases through the bridge.
 */
final class SidecarServer {

    private final ObjectMapper mapper = new ObjectMapper();
    private final ConnectionRegistry registry = new ConnectionRegistry();
    private final String token;
    private HttpServer server;

    SidecarServer(String token) {
        this.token = token;
    }

    void start(int port) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.createContext("/health", this::handleHealth);
        server.createContext("/providers", guard(this::handleProviders));
        server.createContext("/connect", guard(this::handleConnect));
        server.createContext("/disconnect", guard(this::handleDisconnect));
        server.createContext("/capabilities", guard(this::handleCapabilities));
        server.createContext("/provision", guard(this::handleProvision));
        server.createContext("/document/read", guard(this::handleRead));
        server.createContext("/document/create", guard(this::handleWrite));
        server.createContext("/document/upsert", guard(this::handleWrite));
        server.createContext("/document/update", guard(this::handleWrite));
        server.createContext("/document/delete", guard(this::handleDelete));
        server.createContext("/query", guard(this::handleQuery));
        server.setExecutor(java.util.concurrent.Executors.newFixedThreadPool(8));
        server.start();
        int boundPort = server.getAddress().getPort();
        // Contract line the Tauri launcher waits for on stdout:
        System.out.println("SIDECAR_READY " + boundPort + " " + token);
        System.out.flush();
    }

    void stop() {
        registry.closeAll();
        if (server != null) {
            server.stop(0);
        }
    }

    // ── Handlers ─────────────────────────────────────────────────────────────

    private void handleHealth(HttpExchange ex) throws IOException {
        writeJson(ex, 200, Map.of("status", "ok", "service", "multiclouddb-explorer-sidecar"));
    }

    private void handleProviders(HttpExchange ex) throws IOException {
        // Static provider metadata that drives the connection forms in the UI.
        writeJson(ex, 200, Map.of("providers", ProviderCatalog.all()));
    }

    private void handleConnect(HttpExchange ex) throws IOException {
        JsonNode body = readBody(ex);
        ConnectionSpec spec = mapper.treeToValue(body, ConnectionSpec.class);
        String id = registry.open(spec);
        MulticloudDbClient client = registry.get(id).client();
        // Eagerly surface capabilities so the UI can gate features immediately.
        writeJson(ex, 200, Map.of(
                "connectionId", id,
                "provider", spec.provider(),
                "capabilities", capabilityList(client.capabilities())));
    }

    private void handleDisconnect(HttpExchange ex) throws IOException {
        JsonNode body = readBody(ex);
        registry.close(body.get("connectionId").asText());
        writeJson(ex, 200, Map.of("status", "closed"));
    }

    private void handleCapabilities(HttpExchange ex) throws IOException {
        MulticloudDbClient client = client(readBody(ex));
        writeJson(ex, 200, Map.of("capabilities", capabilityList(client.capabilities())));
    }

    private void handleProvision(HttpExchange ex) throws IOException {
        JsonNode body = readBody(ex);
        MulticloudDbClient client = client(body);
        Map<String, List<String>> schema = new LinkedHashMap<>();
        JsonNode schemaNode = body.get("schema");
        if (schemaNode != null) {
            schemaNode.fieldNames().forEachRemaining(db -> {
                List<String> collections = new ArrayList<>();
                schemaNode.get(db).forEach(c -> collections.add(c.asText()));
                schema.put(db, collections);
            });
        }
        client.provisionSchema(schema);
        writeJson(ex, 200, Map.of("status", "provisioned"));
    }

    private void handleRead(HttpExchange ex) throws IOException {
        JsonNode body = readBody(ex);
        MulticloudDbClient client = client(body);
        DocumentResult result = client.read(address(body), key(body));
        if (result == null) {
            writeJson(ex, 404, Map.of("found", false));
            return;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("found", true);
        out.put("document", result.document());
        if (result.metadata() != null) {
            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("lastModified", String.valueOf(result.metadata().lastModified()));
            meta.put("ttlExpiry", String.valueOf(result.metadata().ttlExpiry()));
            meta.put("version", result.metadata().version());
            out.put("metadata", meta);
        }
        writeJson(ex, 200, out);
    }

    @SuppressWarnings("unchecked")
    private void handleWrite(HttpExchange ex) throws IOException {
        JsonNode body = readBody(ex);
        MulticloudDbClient client = client(body);
        String op = ex.getHttpContext().getPath(); // /document/{create|upsert|update}
        Map<String, Object> document = mapper.convertValue(body.get("document"), Map.class);
        ResourceAddress addr = address(body);
        MulticloudDbKey k = key(body);
        if (op.endsWith("create")) {
            client.create(addr, k, document);
        } else if (op.endsWith("update")) {
            client.update(addr, k, document);
        } else {
            client.upsert(addr, k, document);
        }
        writeJson(ex, 200, Map.of("status", "ok"));
    }

    private void handleDelete(HttpExchange ex) throws IOException {
        JsonNode body = readBody(ex);
        MulticloudDbClient client = client(body);
        client.delete(address(body), key(body));
        writeJson(ex, 200, Map.of("status", "ok"));
    }

    private void handleQuery(HttpExchange ex) throws IOException {
        JsonNode body = readBody(ex);
        MulticloudDbClient client = client(body);
        QueryRequest.Builder qb = QueryRequest.builder();

        JsonNode expr = body.get("expression");
        JsonNode nativeExpr = body.get("nativeExpression");
        if (nativeExpr != null && !nativeExpr.isNull() && !nativeExpr.asText().isBlank()) {
            qb.nativeExpression(nativeExpr.asText());
        } else if (expr != null && !expr.isNull() && !expr.asText().isBlank()) {
            qb.expression(expr.asText());
        }

        JsonNode params = body.get("parameters");
        if (params != null && params.isObject()) {
            params.fieldNames().forEachRemaining(name ->
                    qb.parameter(name, jsonToJava(params.get(name))));
        }
        if (has(body, "pageSize")) {
            qb.maxPageSize(body.get("pageSize").asInt());
        }
        if (has(body, "continuationToken")) {
            qb.continuationToken(body.get("continuationToken").asText());
        }
        if (has(body, "partitionKey")) {
            qb.partitionKey(body.get("partitionKey").asText());
        }
        if (has(body, "limit")) {
            qb.limit(body.get("limit").asInt());
        }
        if (has(body, "orderByField")) {
            String dir = has(body, "orderByDirection") ? body.get("orderByDirection").asText() : "ASC";
            qb.orderBy(body.get("orderByField").asText(),
                    "DESC".equalsIgnoreCase(dir) ? SortDirection.DESC : SortDirection.ASC);
        }

        QueryPage page = client.query(address(body), qb.build());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", page.items());
        out.put("continuationToken", page.continuationToken());
        if (page.diagnostics() != null) {
            Map<String, Object> diag = new LinkedHashMap<>();
            diag.put("provider", page.diagnostics().provider() != null
                    ? page.diagnostics().provider().id() : null);
            diag.put("requestCharge", page.diagnostics().requestCharge());
            out.put("diagnostics", diag);
        }
        writeJson(ex, 200, out);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private MulticloudDbClient client(JsonNode body) {
        return registry.get(body.get("connectionId").asText()).client();
    }

    private ResourceAddress address(JsonNode body) {
        return new ResourceAddress(body.get("database").asText(), body.get("collection").asText());
    }

    private MulticloudDbKey key(JsonNode body) {
        String pk = body.get("partitionKey").asText();
        JsonNode sk = body.get("sortKey");
        if (sk != null && !sk.isNull() && !sk.asText().isBlank()) {
            return MulticloudDbKey.of(pk, sk.asText());
        }
        return MulticloudDbKey.of(pk);
    }

    private List<Map<String, Object>> capabilityList(CapabilitySet caps) {
        List<Map<String, Object>> list = new ArrayList<>();
        for (Capability c : caps.all()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", c.name());
            m.put("supported", c.supported());
            m.put("notes", c.notes());
            list.add(m);
        }
        return list;
    }

    private Object jsonToJava(JsonNode n) {
        if (n.isTextual()) return n.asText();
        if (n.isBoolean()) return n.asBoolean();
        if (n.isInt() || n.isLong()) return n.asLong();
        if (n.isFloatingPointNumber()) return n.asDouble();
        return n.asText();
    }

    private boolean has(JsonNode body, String field) {
        JsonNode n = body.get(field);
        return n != null && !n.isNull();
    }

    // ── HTTP plumbing ────────────────────────────────────────────────────────

    private com.sun.net.httpserver.HttpHandler guard(ThrowingHandler handler) {
        return ex -> {
            try {
                if (!"POST".equalsIgnoreCase(ex.getRequestMethod())
                        && !ex.getHttpContext().getPath().equals("/providers")) {
                    writeJson(ex, 405, Map.of("error", "method_not_allowed"));
                    return;
                }
                String auth = ex.getRequestHeaders().getFirst("Authorization");
                if (auth == null || !auth.equals("Bearer " + token)) {
                    writeJson(ex, 401, Map.of("error", "unauthorized"));
                    return;
                }
                handler.handle(ex);
            } catch (MulticloudDbException e) {
                Map<String, Object> err = new LinkedHashMap<>();
                err.put("error", "provider_error");
                err.put("category", e.error() != null ? String.valueOf(e.error().category()) : null);
                err.put("message", e.getMessage());
                writeJson(ex, 400, err);
            } catch (IllegalArgumentException e) {
                writeJson(ex, 400, Map.of("error", "bad_request", "message", String.valueOf(e.getMessage())));
            } catch (Exception e) {
                writeJson(ex, 500, Map.of("error", "internal", "message", String.valueOf(e.getMessage())));
            }
        };
    }

    @FunctionalInterface
    private interface ThrowingHandler {
        void handle(HttpExchange ex) throws Exception;
    }

    private JsonNode readBody(HttpExchange ex) throws IOException {
        try (InputStream in = ex.getRequestBody()) {
            byte[] bytes = in.readAllBytes();
            if (bytes.length == 0) {
                return mapper.createObjectNode();
            }
            return mapper.readTree(bytes);
        }
    }

    private void writeJson(HttpExchange ex, int status, Object payload) throws IOException {
        byte[] bytes = mapper.writeValueAsBytes(payload);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(bytes);
        }
    }
}
