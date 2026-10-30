# ADR 0004 – Bounded jobs and operation locks (M1.05/M1.18)

Status: decided in M1. This defines the job boundary; M2/M5 implement their asynchronous font/import runners.

- Use WordPress single cron events as the default trigger; a manually invoked runner uses the same application operation. No shell executable, system cron, external queue server or mandatory daemon is required.
- Job records must be non-autoloaded, per site and bounded to 512 KiB. Store IDs, owner, operation, status and relative resource references; never credentials, nonce values or binary payloads. Recheck the owner's current capabilities before executing a queued administrative operation.
- States: queued → running → completed/failed/cancelled. Atomic compare-and-swap claims a job; bounded leases use owner tokens. Only the owner may release or renew its lock. Claim/retry logic must be idempotent and must not activate partial files. Cancellation is cooperative between bounded work steps.
- Serialize work per target (font family or import target), not per browser tab. Retain the existing per-family token lock and synchronous installer until M2 introduces the runner; slider writes keep the connection-owned named lock and InnoDB transaction (ADR 0001).
- Maximum WOFF2 file: 2 MiB, complete font job: 20 MiB, at most 60 font files. Current downloader/installer enforce these. A future archive endpoint must enforce 25 MiB compressed, 100 MiB extracted and 500 entries before activating anything, in addition to traversal/symlink and per-resource checks. These bounds are declared in the shared PHP/TS Limits contract; archive import does not exist yet.
- Installer and importer must remain in-process PHP operations. An optional PHP extension such as ZipArchive may be capability-detected; missing support must produce a clear bounded failure, never a silent shell fallback.

M2 implements the font runner and retry/cancel UI: at most 100 retained records, 300-second renewable leases, a 180-second wall-clock checkpoint bound and at most three crash-recovery attempts. In-flight HTTP requests have independent bounded timeouts; cancellation applies at the next checkpoint. Cron and the explicit browser fallback use the same runner; retries restart the idempotent installation. Archive import remains M5 work.
