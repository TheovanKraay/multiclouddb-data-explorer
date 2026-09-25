// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

package com.microsoft.multiclouddb.explorer.sidecar;

import java.util.List;
import java.util.Map;

/**
 * Static, code-grounded provider metadata that drives the connection forms in
 * the UI. Field names match exactly what the SDK adapters read (verified against
 * the provider source). The UI renders a form per provider from this catalog, so
 * property names never drift from the SDK.
 * <p>
 * Auth model note (per SDK): there is no auth-mode selector. Empty secret fields
 * ⇒ identity/credential-chain auth. Each field below carries a {@code secret}
 * flag and a {@code hint} the UI shows.
 */
final class ProviderCatalog {

    private ProviderCatalog() {
    }

    static List<Map<String, Object>> all() {
        return List.of(cosmos(), dynamo(), spanner());
    }

    private static Map<String, Object> field(String key, String label, boolean required,
                                              boolean secret, String hint, String placeholder) {
        return Map.of(
                "key", key,
                "label", label,
                "required", required,
                "secret", secret,
                "hint", hint == null ? "" : hint,
                "placeholder", placeholder == null ? "" : placeholder);
    }

    private static Map<String, Object> cosmos() {
        return Map.of(
                "id", "cosmos",
                "displayName", "Azure Cosmos DB",
                "identitySupported", true,
                "identityNote", "Leave Key empty to use Microsoft Entra ID (DefaultAzureCredential: "
                        + "Managed Identity, Azure CLI, environment). Provide a Key for shared-key auth.",
                "fields", List.of(
                        field("endpoint", "Account Endpoint", true, false,
                                "e.g. https://<account>.documents.azure.com:443/ or https://localhost:8081 for the emulator",
                                "https://localhost:8081"),
                        field("key", "Primary Key", false, true,
                                "Leave empty to authenticate with Microsoft Entra ID identity.", ""),
                        field("tenantId", "Tenant ID", false, false,
                                "Optional. Pins the Entra tenant when using identity auth.", ""),
                        field("connectionMode", "Connection Mode", false, false,
                                "gateway (default) or direct", "gateway"),
                        field("consistencyLevel", "Consistency Level", false, false,
                                "STRONG | BOUNDED_STALENESS | SESSION | CONSISTENT_PREFIX | EVENTUAL", "")));
    }

    private static Map<String, Object> dynamo() {
        return Map.of(
                "id", "dynamo",
                "displayName", "Amazon DynamoDB",
                "identitySupported", true,
                "identityNote", "Leave Access Key ID and Secret empty to use the AWS default credential "
                        + "chain (environment, shared profile, IAM role, instance profile, STS).",
                "fields", List.of(
                        field("region", "AWS Region", true, false, "e.g. us-east-1", "us-east-1"),
                        field("endpoint", "Endpoint Override", false, false,
                                "Optional. e.g. http://localhost:8000 for DynamoDB Local.", "http://localhost:8000"),
                        field("accessKeyId", "Access Key ID", false, false,
                                "Leave empty to use the AWS default credential chain.", ""),
                        field("secretAccessKey", "Secret Access Key", false, true,
                                "Leave empty to use the AWS default credential chain.", "")));
    }

    private static Map<String, Object> spanner() {
        return Map.of(
                "id", "spanner",
                "displayName", "Google Cloud Spanner",
                "identitySupported", true,
                "identityNote", "Spanner uses Google Application Default Credentials (service account / "
                        + "workload identity). Set Emulator Host to bypass auth against the Spanner emulator.",
                "fields", List.of(
                        field("projectId", "Project ID", true, false, "GCP project ID", ""),
                        field("instanceId", "Instance ID", true, false, "Spanner instance ID", ""),
                        field("databaseId", "Database ID", true, false, "Spanner database ID", ""),
                        field("emulatorHost", "Emulator Host", false, false,
                                "Optional. e.g. localhost:9010 for the Spanner emulator.", "localhost:9010")));
    }
}
