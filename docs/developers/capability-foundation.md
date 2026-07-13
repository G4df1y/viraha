# Viraha Capability Foundation

Capability is a first-class Viraha Core contract. It defines what a digital
individual can perceive or do, the permissions required, and the observable
result. Installing code never grants permission.

## Current Supported Path

1. Define a portable `CapabilityManifest` with `defineCapability()`.
2. Install the manifest and handler into `CapabilityRuntime`.
3. Grant each required `read`, `act`, `remember`, or `background` permission.
4. Invoke by Capability id or expose it to AgentPipeline as a Provider tool.
5. Read `CapabilityObservation` records for outcome, duration, grants, and side
   effects.
6. Revoke a permission to block future invocations immediately.

## Deliberate Limits Of This Slice

- Grants and observations use in-memory ports; persistence is not supported yet.
- No untrusted dynamic code loading or sandbox exists yet.
- No official Registry, signature verification, developer CLI, or publish command
  exists yet.
- Legacy Skills and plugins remain supported but are not automatically trusted
  as Capabilities.
- Mobile permission UI and Viraha Control Layer arrive in a separate plan.

These limits are explicit so no developer mistakes a successful local handler
for a production-safe third-party extension system.
