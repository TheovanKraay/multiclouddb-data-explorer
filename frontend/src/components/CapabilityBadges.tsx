// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import type { Capability } from "../api";

export function CapabilityBadges({ capabilities }: { capabilities: Capability[] }) {
  if (!capabilities.length) return null;
  return (
    <div className="capabilities">
      <h3>Capabilities</h3>
      <div className="badge-row">
        {capabilities.map((c) => (
          <span
            key={c.name}
            className={`badge ${c.supported ? "on" : "off"}`}
            title={c.notes || (c.supported ? "Supported" : "Not supported")}
          >
            {c.supported ? "✓" : "✗"} {c.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Helper the panels use to gate features on a capability name. */
export function isSupported(caps: Capability[], name: string): boolean {
  return caps.some((c) => c.name === name && c.supported);
}
