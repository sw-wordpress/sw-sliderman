# ADR 0001 – Atomic, versioned draft writes (M1.13/M1.20)

**Problem.** A named lock alone serializes writers but cannot make separate document and version rows atomic. If a write fails between these rows, a newer document can otherwise retain the old version. Separate reads can also pair stale content with a newer version and permit a lost update.

**Decision.** Every existing-slider write obtains `GET_LOCK('sws_slider_<blog>_<id>_<prefix-hash>', 5)`, clears the parent's local caches and checks that the slider still exists. It starts an InnoDB transaction, reads the current version directly, compares `expectedVersion`, backs up the source as a WordPress revision, writes through `wp_update_post()` and checks the version write before committing. Failure rolls back all rows and invalidates caches. New sliders likewise commit parent and initial version together. Trash, autosave and snapshot activation share the same write lock.

Reads select the parent, version and publication in **one SQL statement**, bypassing potentially stale object caches. Thus each response contains a consistent database snapshot. Do not call the repository from inside a caller-owned transaction: WordPress normally uses autocommit; the repository owns its transaction boundary.

Publishing validates document and resources and completes an immutable CSS file before entering the activation transaction. Activation rechecks the draft version. Failed resources, file writes, version comparisons or metadata writes leave the previously active snapshot untouched. A snapshot also pins the saved title for its accessible fallback label; later draft titles cannot leak into new publications.

**Generic WordPress writes.** The internal CPT is non-public and absent from generic REST. `SliderWriteScope` rejects ordinary `wp_insert_post`/`wp_update_post` writes to slider parents outside repository operations, including the generic revision restoration path. Plugin restores validate the revision and create a versioned draft; they never publish automatically.

**Requirements.** The posts/postmeta tables must use InnoDB and the DB connection must support named locks. Writes fail explicitly when these prerequisites are missing. Readers do not acquire locks. A dead connection releases its named lock and rolls back uncommitted rows. No external server program is required by the plugin.

**Evidence.** WordPress integration tests exercise two independent PHP/DB processes starting with the same version: one returns version 2, the other a conflict with version 2. Other tests inject failed version and snapshot metadata writes and failed artifact storage, then verify the old data/publication. The private test database is separate from the development site.
