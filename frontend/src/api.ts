// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// Typed client over the Tauri `sidecar_request` command. Every call is proxied
// through Rust, which attaches the bearer token — the frontend never sees it.

import { invoke } from "@tauri-apps/api/core";

export interface ProviderField {
  key: string;
  label: string;
  required: boolean;
  secret: boolean;
  hint: string;
  placeholder: string;
}

export interface ProviderDescriptor {
  id: string;
  displayName: string;
  identitySupported: boolean;
  identityNote: string;
  fields: ProviderField[];
}

export interface Capability {
  name: string;
  supported: boolean;
  notes: string;
}

export interface QueryDiagnostics {
  provider: string | null;
  requestCharge: number | null;
}

export interface QueryResult {
  items: Record<string, unknown>[];
  continuationToken: string | null;
  diagnostics?: QueryDiagnostics;
}

export interface DocumentReadResult {
  found: boolean;
  document?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

async function call<T>(path: string, body: unknown): Promise<T> {
  return invoke<T>("sidecar_request", { req: { path, body } });
}

export async function sidecarInfo(): Promise<{
  port: number;
  ready: boolean;
  error?: string | null;
}> {
  return invoke("sidecar_info");
}

export async function listProviders(): Promise<ProviderDescriptor[]> {
  const res = await call<{ providers: ProviderDescriptor[] }>("/providers", {});
  return res.providers;
}

export interface ConnectResult {
  connectionId: string;
  provider: string;
  capabilities: Capability[];
}

export async function connect(
  provider: string,
  properties: Record<string, string>,
): Promise<ConnectResult> {
  return call<ConnectResult>("/connect", { provider, properties });
}

export async function disconnect(connectionId: string): Promise<void> {
  await call("/disconnect", { connectionId });
}

export async function getCapabilities(connectionId: string): Promise<Capability[]> {
  const res = await call<{ capabilities: Capability[] }>("/capabilities", {
    connectionId,
  });
  return res.capabilities;
}

export interface DocAddress {
  connectionId: string;
  database: string;
  collection: string;
  partitionKey: string;
  sortKey?: string;
}

export async function readDocument(addr: DocAddress): Promise<DocumentReadResult> {
  return call<DocumentReadResult>("/document/read", addr);
}

export async function writeDocument(
  op: "create" | "upsert" | "update",
  addr: DocAddress,
  document: Record<string, unknown>,
): Promise<void> {
  await call(`/document/${op}`, { ...addr, document });
}

export async function deleteDocument(addr: DocAddress): Promise<void> {
  await call("/document/delete", addr);
}

export interface QueryParams {
  connectionId: string;
  database: string;
  collection: string;
  expression?: string;
  nativeExpression?: string;
  parameters?: Record<string, unknown>;
  pageSize?: number;
  continuationToken?: string;
  partitionKey?: string;
  limit?: number;
  orderByField?: string;
  orderByDirection?: "ASC" | "DESC";
}

export async function runQuery(params: QueryParams): Promise<QueryResult> {
  return call<QueryResult>("/query", params);
}

export async function provisionSchema(
  connectionId: string,
  schema: Record<string, string[]>,
): Promise<void> {
  await call("/provision", { connectionId, schema });
}

/** Normalize a Rust error string (which may wrap a JSON body) into a message. */
export function errorMessage(e: unknown): string {
  if (typeof e === "string") {
    try {
      const parsed = JSON.parse(e);
      if (parsed?.error?.message) return parsed.error.message;
      if (parsed?.error) return JSON.stringify(parsed.error);
      return e;
    } catch {
      return e;
    }
  }
  return String(e);
}
