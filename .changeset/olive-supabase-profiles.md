---
'@ankhorage/infra': patch
---

Make generated local Supabase profile schema deterministic by separating immutable migrations from generated reconciliation, applying profile desired state during local startup, and verifying the live database schema.
