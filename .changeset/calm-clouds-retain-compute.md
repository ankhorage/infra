---
'@ankhorage/infra': patch
---

Retain compute targets and compute ownership when runtime-owned resources survive `infra destroy`, so production persistence is not orphaned by underlying host deletion. Production composition validation now runs against k3s 0.3.1+ and Kubernetes 0.7.3+, including current workload-template materialization.
