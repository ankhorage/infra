---
"@ankhorage/infra": patch
---

Make project Infra destroy idempotent when no stored ownership state exists, avoiding provider resolution for never-provisioned or already-destroyed environments.
