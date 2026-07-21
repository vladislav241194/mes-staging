-- Migration 030 originally proved only that named triggers existed. A marker
-- can therefore survive an interrupted/disposable candidate whose trigger
-- functions were later replaced with no-op bodies. Reinstall the complete
-- rollback guard contract independently of marker 030 and keep every runner
-- invocation self-healing.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

DO $migration$
BEGIN
  EXECUTE $ddl$
    CREATE OR REPLACE FUNCTION public.specifications2_capture_legacy_revision_identity()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = public, pg_temp
    AS $function$
    BEGIN
      UPDATE public.specifications2_revisions revision
      SET revision_title = COALESCE(NULLIF(revision.revision_title, ''), NULLIF(NEW.name, '')),
          revision_designation = COALESCE(NULLIF(revision.revision_designation, ''), NULLIF(NEW.designation, '')),
          revision_identity_state = 'legacy-derived'
      WHERE revision.id = NEW.specification_revision_id
        AND revision.revision_identity_state = 'legacy-unverified'
        AND (NULLIF(NEW.name, '') IS NOT NULL OR NULLIF(NEW.designation, '') IS NOT NULL);
      RETURN NEW;
    END;
    $function$
  $ddl$;

  DROP TRIGGER IF EXISTS specifications2_capture_legacy_revision_identity_trigger
    ON public.specifications2_revision_items;
  CREATE TRIGGER specifications2_capture_legacy_revision_identity_trigger
    AFTER INSERT ON public.specifications2_revision_items
    FOR EACH ROW
    WHEN (NEW.parent_source_row_id = '')
    EXECUTE FUNCTION public.specifications2_capture_legacy_revision_identity();

  EXECUTE $ddl$
    CREATE OR REPLACE FUNCTION public.specifications2_verify_work_order_revision_identity()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = public, pg_temp
    AS $function$
    DECLARE
      expected_name TEXT;
      expected_designation TEXT;
      actual_name TEXT;
      actual_designation TEXT;
      identity_verified BOOLEAN;
      route_name_known BOOLEAN;
      route_designation_known BOOLEAN;
    BEGIN
      SELECT
        COALESCE(
          NULLIF(btrim(route.product_label), ''),
          CASE WHEN revision.revision_identity_state IN ('authoritative', 'legacy-derived')
            THEN NULLIF(btrim(revision.revision_title), '') END,
          'Изделие'
        ),
        COALESCE(
          NULLIF(btrim(route.designation), ''),
          CASE WHEN revision.revision_identity_state IN ('authoritative', 'legacy-derived')
            THEN NULLIF(btrim(revision.revision_designation), '') END,
          ''
        ),
        btrim(work_order.name),
        btrim(work_order.designation),
        revision.revision_identity_state IN ('authoritative', 'legacy-derived'),
        NULLIF(btrim(route.product_label), '') IS NOT NULL,
        NULLIF(btrim(route.designation), '') IS NOT NULL
      INTO expected_name, expected_designation, actual_name, actual_designation,
           identity_verified, route_name_known, route_designation_known
      FROM public.specifications2_revisions revision
      JOIN public.specifications2_route_documents route
        ON route.id = NEW.route_document_id
       AND route.specification_revision_id = revision.id
      JOIN public.work_orders work_order ON work_order.id = NEW.work_order_id
      WHERE revision.id = NEW.specification_revision_id;

      IF NOT FOUND OR (
        NOT COALESCE(identity_verified, false)
        AND (
          NOT COALESCE(route_name_known, false)
          OR NOT COALESCE(route_designation_known, false)
        )
      ) THEN
        RAISE EXCEPTION 'Specifications 2.0 work order requires verified immutable revision/route identity'
          USING ERRCODE = 'check_violation';
      END IF;
      IF actual_name IS DISTINCT FROM expected_name
        OR actual_designation IS DISTINCT FROM expected_designation THEN
        RAISE EXCEPTION 'Specifications 2.0 work order identity differs from its immutable revision/route'
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END;
    $function$
  $ddl$;

  DROP TRIGGER IF EXISTS specifications2_verify_work_order_revision_identity_trigger
    ON public.specifications2_work_order_sources;
  CREATE TRIGGER specifications2_verify_work_order_revision_identity_trigger
    BEFORE INSERT ON public.specifications2_work_order_sources
    FOR EACH ROW
    EXECUTE FUNCTION public.specifications2_verify_work_order_revision_identity();

  EXECUTE $ddl$
    CREATE OR REPLACE FUNCTION public.specifications2_require_v6_publication_outbox()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = public, pg_temp
    AS $function$
    DECLARE
      payload_digest TEXT;
      fingerprint JSONB;
    BEGIN
      IF NEW.aggregate_type = 'specifications2_revision'
        AND NEW.command_type = 'publish_revision' THEN
        payload_digest := NEW.payload ->> 'compatibilityPayloadDigest';
        IF payload_digest IS NULL OR payload_digest !~ '^sha256:[0-9a-f]{64}$' THEN
          RAISE EXCEPTION 'Specifications 2.0 publication outbox requires a v6 compatibility payload digest'
            USING ERRCODE = 'check_violation';
        END IF;
        IF jsonb_typeof(NEW.payload -> 'compatibilityEntry') <> 'object' THEN
          RAISE EXCEPTION 'Specifications 2.0 publication outbox requires a compatibility entry'
            USING ERRCODE = 'check_violation';
        END IF;
        BEGIN
          fingerprint := (NEW.payload #>> '{compatibilityEntry,publication,fingerprint}')::jsonb;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'Specifications 2.0 publication outbox fingerprint is invalid'
            USING ERRCODE = 'check_violation';
        END;
        IF COALESCE((fingerprint ->> 'adapterVersion')::integer, 0) <> 6 THEN
          RAISE EXCEPTION 'Specifications 2.0 publication outbox requires fingerprint adapter v6'
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $function$
  $ddl$;

  DROP TRIGGER IF EXISTS specifications2_require_v6_publication_outbox_trigger
    ON public.domain_change_log;
  CREATE TRIGGER specifications2_require_v6_publication_outbox_trigger
    BEFORE INSERT OR UPDATE OF payload, aggregate_type, command_type
    ON public.domain_change_log
    FOR EACH ROW
    EXECUTE FUNCTION public.specifications2_require_v6_publication_outbox();

  INSERT INTO public.mes_schema_migrations(version)
  VALUES ('031_specifications2_guard_function_repair')
  ON CONFLICT (version) DO NOTHING;
END
$migration$;
