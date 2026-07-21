-- Historical revisions predate revision-scoped title/designation storage.
-- Recover only values that are present in that revision's own immutable root
-- item and mark them as derived; never label current document metadata as
-- authoritative history.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

DO $migration$
BEGIN
  -- Re-running all migration files is normal for the current runner. Once the
  -- marker is committed, skip the historical scan entirely: repeated UPDATEs
  -- would create useless MVCC versions and contend with revision readers.
  IF NOT EXISTS (
    SELECT 1 FROM mes_schema_migrations
    WHERE version = '029_specifications2_revision_identity_backfill'
  ) THEN
    WITH revision_roots AS (
      SELECT DISTINCT ON (item.specification_revision_id)
        item.specification_revision_id,
        NULLIF(item.name, '') AS derived_title,
        NULLIF(item.designation, '') AS derived_designation
      FROM specifications2_revision_items item
      WHERE item.parent_source_row_id = ''
      ORDER BY item.specification_revision_id, item.source_row_id
    ), revision_candidates AS (
      SELECT
        revision.id,
        NULLIF(revision.source_payload ->> 'revisionTitle', '') AS payload_title,
        NULLIF(revision.source_payload ->> 'revisionDesignation', '') AS payload_designation,
        root.derived_title,
        root.derived_designation
      FROM specifications2_revisions revision
      LEFT JOIN revision_roots root ON root.specification_revision_id = revision.id
      WHERE revision.revision_identity_state <> 'authoritative'
    )
    UPDATE specifications2_revisions revision
    SET revision_title = COALESCE(
          revision.revision_title,
          candidate.payload_title,
          candidate.derived_title
        ),
        revision_designation = COALESCE(
          revision.revision_designation,
          candidate.payload_designation,
          candidate.derived_designation
        ),
        revision_identity_state = CASE
          WHEN COALESCE(
            revision.revision_title,
            revision.revision_designation,
            candidate.payload_title,
            candidate.payload_designation,
            candidate.derived_title,
            candidate.derived_designation
          ) IS NOT NULL THEN 'legacy-derived'
          ELSE 'legacy-unverified'
        END
    FROM revision_candidates candidate
    WHERE candidate.id = revision.id;

    INSERT INTO mes_schema_migrations(version)
    VALUES ('029_specifications2_revision_identity_backfill');
  END IF;
END
$migration$;
