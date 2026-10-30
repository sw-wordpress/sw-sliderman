# REST API `sw-sliderman/v1`

Cookie authentication needs the `X-WP-Nonce` header. Errors are `WP_Error` JSON with stable `code`, translated `message` and `data.status`.

| Route | Method | Capability | Body / result |
| --- | --- | --- | --- |
| `/sliders?page&perPage&search` | GET | `sws_edit_sliders` | list of summaries (`id, title, status, version, modifiedGmt, publishedGmt, shortcode`), `X-WP-Total` |
| `/sliders` | POST | `sws_edit_sliders` | `{title}` → 201 detail |
| `/sliders/{id}` | GET | `sws_edit_sliders` | detail = summary + `document`, `published`, `media` (preview URLs); `Cache-Control: no-store` |
| `/sliders/{id}` | PUT | `sws_edit_sliders` | `{title, expectedVersion, document}` → `{version}` |
| `/sliders/{id}/publish` | POST | `sws_edit_sliders` + `sws_publish_sliders` | `{version}` → `{version, publishedGmt}` |
| `/sliders/{id}` | DELETE | `sws_edit_sliders` | moves to trash |
| `/fonts/catalog` | GET | edit or `sws_manage_fonts` | local catalog with `installed` flags and `offline` |
| `/fonts` | GET | edit or `sws_manage_fonts` | installations incl. `inUse`, `filesPresent`, same-origin stylesheet/license URLs, `originMismatch` |
| `/fonts` | POST | `sws_manage_fonts` | `{familyId, variants:[{weight, style}], subsets:[...]}` → 201 installation |
| `/fonts/{installationId}` | DELETE | `sws_manage_fonts` | only when unreferenced |

Status codes: 400 unreadable body, 401/403 auth/permission, 404 unknown object, 409 `sws_revision_conflict` (`data.currentVersion`), `sws_busy`, font lock/in use/offline, 413 `sws_too_large`, 422 `sws_invalid_document` (`data.issues: [{path, code}]`, includes `missing_resource`, `immutable`, `no_enabled_slide`), 502 font download/verification failures, 500 `sws_internal` with `data.correlationId`.

## M1 recovery and duplication

All routes below require current slider-edit capability plus the object-specific `edit_post` check. Cookie requests require the WordPress REST nonce; Application Password authentication follows WordPress core. Collection results and revision lists are private/no-store.

- `POST /sliders/{id}/duplicate` `{title}` → 201 slider detail; new document/slide/layer/font-reference IDs, same installed media/font resources, no live snapshot.
- `GET /sliders/{id}/revisions` → up to 100 newest revision summaries `{id,title,modifiedGmt,autosave}`; no raw revision document in the list.
- `POST /sliders/{id}/restore` `{revisionId,expectedVersion}` → `{version}`; validates parent membership, schema and identity, then saves a new draft. Live output is unchanged.
- `POST /sliders/{id}/autosave` `{title,document,expectedVersion}` → `{revisionId}`; keeps a separate user-specific recovery revision without advancing the parent version.
- `POST /sliders/{id}/migrate` `{expectedVersion}` → `{version}`; explicit migration dispatch. v1 is unchanged, unknown versions are rejected without modifying their source.

Slider detail additionally contains `previewUrl`, an authenticated, nonce-bound HTML URL for the saved draft. It is a navigation URL, not a public share token. Unsaved in-memory changes are not part of that preview.

A competing version still returns 409 `sws_revision_conflict`. An unavailable named lock returns 409 `sws_busy`; durable storage failures return 500 `sws_storage_failed`. Failed publication cannot replace the old active snapshot. Resource validation now checks actual local attachment files and font-file hashes plus the generated local font stylesheet, not just registry entries.

## M2 font management

All routes require `sws_manage_fonts`. `POST /fonts/settings` accepts `{offline:boolean}`; GET returns the current state. `POST /fonts/import` accepts `{family,weight,style,subset,licenseId,licenseText,fileBase64}` (one static WOFF2 up to 2 MiB) → 201 `{id}`; works offline.

`POST /fonts/jobs` accepts `{kind:"install",familyId,variants,subsets}` or `{kind:"catalog"}` → 202 job. GET lists the latest 100 jobs. `/fonts/jobs/{uuid}` supports GET and DELETE (cooperative cancellation); POST `/run` provides the cron fallback, POST `/retry` creates a new explicit job. Responses expose `{id,kind,familyId,state,updatedGmt,result,error}`, never internal owner/payload/leases. The previous synchronous install endpoint remains compatible. Bounds and recovery: [ADR 0004](adr/0004-jobs-and-limits.md).
