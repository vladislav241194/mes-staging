-- A schema migration survives application rollback. Releases predating
-- revision-scoped identity still insert the immutable root item after the
-- revision row, so capture that root identity without reading mutable document
-- metadata. Publication itself must be disabled before rolling back to a
-- release whose compatibility outbox predates the canonical effective-rows
-- contract.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM mes_schema_migrations
    WHERE version = '030_specifications2_legacy_revision_identity_guard'
  ) THEN
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
      END
      $function$
    $ddl$;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgrelid = 'public.specifications2_revision_items'::regclass
        AND tgname = 'specifications2_capture_legacy_revision_identity_trigger'
        AND NOT tgisinternal
    ) THEN
      CREATE TRIGGER specifications2_capture_legacy_revision_identity_trigger
      AFTER INSERT ON public.specifications2_revision_items
      FOR EACH ROW
      WHEN (NEW.parent_source_row_id = '')
      EXECUTE FUNCTION public.specifications2_capture_legacy_revision_identity();
    END IF;

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
      END
      $function$
    $ddl$;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgrelid = 'public.specifications2_work_order_sources'::regclass
        AND tgname = 'specifications2_verify_work_order_revision_identity_trigger'
        AND NOT tgisinternal
    ) THEN
      CREATE TRIGGER specifications2_verify_work_order_revision_identity_trigger
      BEFORE INSERT ON public.specifications2_work_order_sources
      FOR EACH ROW
      EXECUTE FUNCTION public.specifications2_verify_work_order_revision_identity();
    END IF;

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
      END
      $function$
    $ddl$;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgrelid = 'public.domain_change_log'::regclass
        AND tgname = 'specifications2_require_v6_publication_outbox_trigger'
        AND NOT tgisinternal
    ) THEN
      CREATE TRIGGER specifications2_require_v6_publication_outbox_trigger
      BEFORE INSERT OR UPDATE OF payload, aggregate_type, command_type
      ON public.domain_change_log
      FOR EACH ROW
      EXECUTE FUNCTION public.specifications2_require_v6_publication_outbox();
    END IF;

    INSERT INTO mes_schema_migrations(version)
    VALUES ('030_specifications2_legacy_revision_identity_guard');
  END IF;
END
$migration$;

-- The first version of migration 030 may already have committed its marker in
-- a disposable or interrupted candidate environment. Keep this additive block
-- idempotent and outside the historical marker guard: readiness requires the
-- live columns, validated constraint and trigger, not the marker alone.
DO $work_order_idempotency$
BEGIN
  ALTER TABLE public.specifications2_work_order_sources
    ADD COLUMN IF NOT EXISTS request_fingerprint TEXT,
    ADD COLUMN IF NOT EXISTS request_quantity NUMERIC(14, 3),
    ADD COLUMN IF NOT EXISTS request_actor_scope TEXT;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.specifications2_work_order_sources'::regclass
      AND conname = 'specifications2_work_order_request_contract_check'
  ) THEN
    ALTER TABLE public.specifications2_work_order_sources
      ADD CONSTRAINT specifications2_work_order_request_contract_check
      CHECK (
        (
          request_fingerprint IS NULL
          AND request_quantity IS NULL
          AND request_actor_scope IS NULL
        )
        OR (
          request_fingerprint IS NOT NULL
          AND request_quantity IS NOT NULL
          AND request_actor_scope IS NOT NULL
          AND request_fingerprint ~ '^sha256:[0-9a-f]{64}$'
          AND request_quantity > 0
          AND request_quantity = trunc(request_quantity)
          AND request_actor_scope = btrim(request_actor_scope)
          AND request_actor_scope <> ''
        )
      ) NOT VALID;
  END IF;
  ALTER TABLE public.specifications2_work_order_sources
    VALIDATE CONSTRAINT specifications2_work_order_request_contract_check;

  -- Migration 010 scoped the raw key only by revision and route. That hidden
  -- cross-employee namespace contradicts the authenticated actor contract and
  -- can turn a valid second employee command into a 23505/503. Drop only the
  -- exact generated constraint we reviewed; fail closed if that name was
  -- repurposed or the same route-only invariant survives under another name.
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.specifications2_work_order_sources'::regclass
      AND conname = 'specifications2_work_order_so_specification_revision_id_rou_key'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.specifications2_work_order_sources'::regclass
      AND conname = 'specifications2_work_order_so_specification_revision_id_rou_key'
      AND contype = 'u'
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.specifications2_work_order_sources'::regclass AND attname = 'specification_revision_id' AND NOT attisdropped),
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.specifications2_work_order_sources'::regclass AND attname = 'route_document_id' AND NOT attisdropped),
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.specifications2_work_order_sources'::regclass AND attname = 'idempotency_key' AND NOT attisdropped)
      ]
  ) THEN
    RAISE EXCEPTION 'Unexpected Specifications 2.0 migration 010 route-only idempotency constraint contract'
      USING ERRCODE = 'check_violation';
  END IF;

  ALTER TABLE public.specifications2_work_order_sources
    DROP CONSTRAINT IF EXISTS specifications2_work_order_so_specification_revision_id_rou_key;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.specifications2_work_order_sources'::regclass
      AND contype = 'u'
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.specifications2_work_order_sources'::regclass AND attname = 'specification_revision_id' AND NOT attisdropped),
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.specifications2_work_order_sources'::regclass AND attname = 'route_document_id' AND NOT attisdropped),
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.specifications2_work_order_sources'::regclass AND attname = 'idempotency_key' AND NOT attisdropped)
      ]
  ) THEN
    RAISE EXCEPTION 'Specifications 2.0 route-only idempotency constraint remains after actor-scope migration'
      USING ERRCODE = 'check_violation';
  END IF;

  -- An idempotency key is global to one authenticated actor across the whole
  -- create-from-Specifications2 command surface. This partial index lets
  -- historical NULL-actor receipts remain unchanged and forces every new
  -- actor-bound retry to resolve one previously committed request before it
  -- can insert, while different employees retain independent key spaces.
  CREATE UNIQUE INDEX IF NOT EXISTS specifications2_work_order_actor_idempotency_uidx
    ON public.specifications2_work_order_sources (request_actor_scope, idempotency_key)
    WHERE request_actor_scope IS NOT NULL;

  EXECUTE $ddl$
    CREATE OR REPLACE FUNCTION public.specifications2_verify_work_order_request_fingerprint()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = public, pg_temp
    AS $function$
    DECLARE
      persisted_quantity NUMERIC(14, 3);
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        IF NEW.work_order_id IS DISTINCT FROM OLD.work_order_id
          OR NEW.specification_revision_id IS DISTINCT FROM OLD.specification_revision_id
          OR NEW.route_document_id IS DISTINCT FROM OLD.route_document_id
          OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
          OR NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint
          OR NEW.request_quantity IS DISTINCT FROM OLD.request_quantity
          OR NEW.request_actor_scope IS DISTINCT FROM OLD.request_actor_scope THEN
          RAISE EXCEPTION 'Specifications 2.0 Work Order idempotency request is immutable'
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;

      IF NEW.request_fingerprint IS NULL
        OR NEW.request_fingerprint !~ '^sha256:[0-9a-f]{64}$'
        OR NEW.request_quantity IS NULL
        OR NEW.request_quantity <= 0
        OR NEW.request_quantity <> trunc(NEW.request_quantity)
        OR NULLIF(btrim(NEW.request_actor_scope), '') IS NULL
        OR NEW.request_actor_scope <> btrim(NEW.request_actor_scope) THEN
        RAISE EXCEPTION 'Specifications 2.0 Work Order requires an exact request fingerprint, quantity and actor scope'
          USING ERRCODE = 'check_violation';
      END IF;

      SELECT work_order.quantity
      INTO persisted_quantity
      FROM public.work_orders work_order
      WHERE work_order.id = NEW.work_order_id;
      IF NOT FOUND OR persisted_quantity IS DISTINCT FROM NEW.request_quantity THEN
        RAISE EXCEPTION 'Specifications 2.0 Work Order request quantity differs from the atomically persisted order'
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END
    $function$
  $ddl$;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.specifications2_work_order_sources'::regclass
      AND tgname = 'specifications2_verify_work_order_request_fingerprint_trigger'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER specifications2_verify_work_order_request_fingerprint_trigger
    BEFORE INSERT OR UPDATE ON public.specifications2_work_order_sources
    FOR EACH ROW
    EXECUTE FUNCTION public.specifications2_verify_work_order_request_fingerprint();
  END IF;
END
$work_order_idempotency$;
