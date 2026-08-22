---
'@ankhorage/infra': patch
---

Derive Minikube app runtime resources and canonical forward groups from enabled app deployment targets, reconcile obsolete Web runtime resources and owned forwards during native-only upgrades, and retry transient post-restart forwarding failures so native apps can recover provider endpoints without a nonexistent app Service.
