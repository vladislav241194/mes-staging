SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM mes_schema_migrations
    WHERE version = '035_marking_phase1_prototype'
  ) THEN
    -- Phase 1 is an isolated, durable test contour. Source identifiers are
    -- copied as text on purpose: no production order, assignment, route or
    -- status row can be changed through this schema.
    CREATE TABLE marking_phase1_tasks (
      id TEXT PRIMARY KEY,
      prototype_scope TEXT NOT NULL DEFAULT 'isolated-test',
      source_assignment_id TEXT NOT NULL UNIQUE,
      source_work_order_id TEXT NOT NULL,
      source_operation_id TEXT NOT NULL,
      source_work_center_id TEXT NOT NULL,
      assigned_employee_id TEXT NOT NULL,
      product_id TEXT NOT NULL DEFAULT '',
      product_name TEXT NOT NULL DEFAULT '',
      work_order_number TEXT NOT NULL DEFAULT '',
      task_title TEXT NOT NULL DEFAULT '',
      planned_board_quantity INTEGER NOT NULL DEFAULT 0 CHECK (planned_board_quantity >= 0),
      source_started BOOLEAN NOT NULL DEFAULT FALSE,
      phase1_state TEXT NOT NULL DEFAULT 'draft',
      configured_kit_count INTEGER NOT NULL DEFAULT 0 CHECK (configured_kit_count >= 0),
      boards_per_kit INTEGER NOT NULL DEFAULT 0 CHECK (boards_per_kit >= 0),
      master_label_width_mm NUMERIC(8,2) NOT NULL DEFAULT 100 CHECK (master_label_width_mm > 0),
      master_label_height_mm NUMERIC(8,2) NOT NULL DEFAULT 60 CHECK (master_label_height_mm > 0),
      individual_label_width_mm NUMERIC(8,2) NOT NULL DEFAULT 30 CHECK (individual_label_width_mm > 0),
      individual_label_height_mm NUMERIC(8,2) NOT NULL DEFAULT 20 CHECK (individual_label_height_mm > 0),
      next_work_center_id TEXT NOT NULL DEFAULT '',
      revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
      created_by TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ,
      transferred_at TIMESTAMPTZ,
      transfer_cancelled_at TIMESTAMPTZ,
      CHECK (prototype_scope = 'isolated-test'),
      CHECK (phase1_state IN ('draft', 'configured', 'in_progress', 'completed', 'transferred'))
    );

    CREATE INDEX marking_phase1_tasks_employee_state_idx
      ON marking_phase1_tasks (assigned_employee_id, phase1_state, updated_at DESC, id DESC);

    CREATE TABLE marking_phase1_kits (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES marking_phase1_tasks(id) ON DELETE CASCADE,
      sequence_no INTEGER NOT NULL CHECK (sequence_no >= 1),
      boards_per_kit INTEGER NOT NULL CHECK (boards_per_kit >= 1),
      added_after_start BOOLEAN NOT NULL DEFAULT FALSE,
      exceeds_plan BOOLEAN NOT NULL DEFAULT FALSE,
      print_state TEXT NOT NULL DEFAULT 'not_sent',
      first_confirmed_at TIMESTAMPTZ,
      last_printed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (task_id, sequence_no),
      CHECK (print_state IN ('not_sent', 'awaiting_confirmation', 'confirmed', 'error', 'reprinted'))
    );

    CREATE INDEX marking_phase1_kits_task_sequence_idx
      ON marking_phase1_kits (task_id, sequence_no);

    CREATE TABLE marking_phase1_codes (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES marking_phase1_tasks(id) ON DELETE CASCADE,
      kit_id TEXT NOT NULL REFERENCES marking_phase1_kits(id) ON DELETE CASCADE,
      code_value TEXT NOT NULL UNIQUE,
      code_type TEXT NOT NULL,
      board_index INTEGER,
      ever_printed BOOLEAN NOT NULL DEFAULT FALSE,
      last_printed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (code_type IN ('master', 'individual')),
      CHECK (
        (code_type = 'master' AND board_index IS NULL)
        OR (code_type = 'individual' AND board_index >= 1)
      )
    );

    CREATE UNIQUE INDEX marking_phase1_codes_one_master_idx
      ON marking_phase1_codes (kit_id) WHERE code_type = 'master';
    CREATE UNIQUE INDEX marking_phase1_codes_board_idx
      ON marking_phase1_codes (kit_id, board_index) WHERE code_type = 'individual';
    CREATE INDEX marking_phase1_codes_task_kit_idx
      ON marking_phase1_codes (task_id, kit_id, code_type, board_index);

    CREATE TABLE marking_phase1_print_batches (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES marking_phase1_tasks(id) ON DELETE CASCADE,
      source_batch_id TEXT REFERENCES marking_phase1_print_batches(id) ON DELETE RESTRICT,
      print_mode TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      scope_target_id TEXT NOT NULL DEFAULT '',
      print_state TEXT NOT NULL DEFAULT 'awaiting_confirmation',
      item_count INTEGER NOT NULL CHECK (item_count >= 1),
      requested_by TEXT NOT NULL,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_by TEXT NOT NULL DEFAULT '',
      resolved_at TIMESTAMPTZ,
      error_message TEXT NOT NULL DEFAULT '',
      CHECK (print_mode IN ('initial', 'reprint')),
      CHECK (scope_type IN ('task', 'selection', 'batch', 'kit', 'master', 'individual')),
      CHECK (print_state IN ('awaiting_confirmation', 'confirmed', 'error'))
    );

    CREATE INDEX marking_phase1_print_batches_task_created_idx
      ON marking_phase1_print_batches (task_id, requested_at DESC, id DESC);

    CREATE TABLE marking_phase1_print_items (
      batch_id TEXT NOT NULL REFERENCES marking_phase1_print_batches(id) ON DELETE CASCADE,
      code_id TEXT NOT NULL REFERENCES marking_phase1_codes(id) ON DELETE RESTRICT,
      kit_id TEXT NOT NULL REFERENCES marking_phase1_kits(id) ON DELETE RESTRICT,
      label_type TEXT NOT NULL,
      PRIMARY KEY (batch_id, code_id),
      CHECK (label_type IN ('master', 'individual'))
    );

    CREATE INDEX marking_phase1_print_items_code_history_idx
      ON marking_phase1_print_items (code_id, batch_id);

    CREATE TABLE marking_phase1_audit_events (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES marking_phase1_tasks(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      task_revision INTEGER NOT NULL CHECK (task_revision >= 1),
      related_entity_id TEXT NOT NULL DEFAULT '',
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (jsonb_typeof(payload) = 'object'),
      CHECK (octet_length(payload::text) <= 262144)
    );

    CREATE INDEX marking_phase1_audit_task_created_idx
      ON marking_phase1_audit_events (task_id, created_at DESC, id DESC);

    CREATE TABLE marking_phase1_command_requests (
      actor_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      command_type TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL,
      task_id TEXT NOT NULL REFERENCES marking_phase1_tasks(id) ON DELETE CASCADE,
      result_payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (actor_id, idempotency_key),
      CHECK (char_length(idempotency_key) BETWEEN 1 AND 160),
      CHECK (jsonb_typeof(result_payload) = 'object'),
      CHECK (octet_length(result_payload::text) <= 524288)
    );

    CREATE INDEX marking_phase1_command_requests_task_idx
      ON marking_phase1_command_requests (task_id, created_at DESC);

    INSERT INTO mes_schema_migrations(version)
    VALUES ('035_marking_phase1_prototype');
  END IF;
END
$migration$;
