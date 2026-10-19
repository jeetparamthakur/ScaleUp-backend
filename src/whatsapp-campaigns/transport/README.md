# WhatsApp campaign transports

- **OpenWA** (`openwa-whatsapp-transport.ts`): V1 — QR-linked personal/business numbers via the platform OpenWA gateway.
- **Meta Cloud API** (`meta-cloud-whatsapp-transport.ts`): Phase 2 placeholder — implement WABA token + template sends here without duplicating campaign tables.

Campaign rows use `transport` (`openwa` | `meta`) and sender assignment references the appropriate connection id.
