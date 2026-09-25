// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

package com.microsoft.multiclouddb.explorer.sidecar;

import java.util.Map;

/**
 * A provider + flat property bag sent by the UI to open a connection.
 * The {@link ClientFactory} routes each property into the SDK's connection()
 * or auth() map as the target adapter expects.
 */
record ConnectionSpec(String provider, Map<String, String> properties) {
}
