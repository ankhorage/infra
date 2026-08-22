---
'@ankhorage/infra': patch
---

Derive Minikube app runtime resources and canonical forward groups from enabled app deployment targets, and retry transient post-restart forwarding failures, so native-only apps can recover provider endpoints without a nonexistent app Service.
