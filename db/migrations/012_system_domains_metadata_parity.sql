-- Preserve the complete normalized metadata envelope. It is small, auditable
-- provenance rather than an operational registry, and retaining it makes a
-- read projection byte-for-byte compatible with the current snapshot.
ALTER TABLE system_domain_sets
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO mes_schema_migrations(version) VALUES ('012_system_domains_metadata_parity') ON CONFLICT (version) DO NOTHING;
