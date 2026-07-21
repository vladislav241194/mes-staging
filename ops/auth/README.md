# Pilot employee-auth and Nomenclature command rollout

This is a temporary, root-controlled rollout. It does not contain or generate
real secrets, and every command must run from the current foundation release.
The Stage 1 drop-in publishes employee-auth as available, but it does not set
`MES_REQUIRE_EMPLOYEE_AUTH_GATE=1`; normal Pilot login remains unchanged. A
single provisioned QA employee therefore does not block other Pilot users.
Only the currently selected employee with a valid credential and current RBAC
may elevate a Nomenclature session to write access. Keep the write evaluation
time-bounded, and do not mass-provision employee PINs without an approved
employee rollout and communication plan.

1. Activate the foundation release with employee-auth and commands OFF.
2. Run migration 027 through the normal domain migrator.
3. Copy `mes-pilot-employee-auth.env.example` to a root-only temporary file,
   add a high-entropy session secret, then install it with
   `install-pilot-employee-auth-env.sh --source=/absolute/private/path`.
4. Provision each reviewed employee PIN with
   `provision-pilot-employee-pin.sh set-pin EMPLOYEE_ID`. The prompt is hidden;
   the PIN is sent over stdin and only its scrypt hash reaches PostgreSQL.
5. Before enabling any temporary layer, schedule a root fail-safe, for example:
   `schedule-pilot-nomenclature-evaluation-auto-rollback.sh --delay=20m`.
   It pins the rollback executable to the current immutable release and creates
   a one-shot systemd timer without copying the employee-auth secret.
6. Run `activate-pilot-employee-auth.sh` and verify the employee login flow.
7. Run `activate-pilot-nomenclature-command-owner.sh`. It creates a shared-state
   backup before installing the command-owner drop-in.
8. Run `activate-react-nomenclature-write-evaluation.sh`. It refuses to enable
   the UI evaluation unless migration 027, employee-auth and command-owner
   readiness are all proven through the internal capabilities endpoint.
9. Complete authenticated create/edit/read-back/delete/cleanup acceptance.
10. Immediately run `deactivate-pilot-nomenclature-evaluation-stack.sh`. The
    helper is idempotent and attempts every shutdown layer even if an earlier
    step reports a problem. It finishes successfully only after proving the
    service healthy and the complete evaluation stack OFF.

Rollback ordering is mandatory. Run
`prepare-pilot-nomenclature-release-rollback.sh` from the current release. It
turns the React write evaluation OFF first, then commands, then employee-auth.
It is safe to rerun when Stage 1 or Stage 2 is already absent. Only after it
proves the current service healthy and every temporary flag OFF may the
immutable release pointer be rolled back. Shared-state backups are recovery
artifacts and are never restored automatically over potentially newer
production data.

The manual emergency order is the same:

1. `deactivate-react-nomenclature-write-evaluation.sh`
2. `deactivate-pilot-nomenclature-command-owner.sh`
3. `deactivate-pilot-employee-auth.sh`

Prefer `deactivate-pilot-nomenclature-evaluation-stack.sh`, because it performs
the complete ordered shutdown and final proof in one root command.
