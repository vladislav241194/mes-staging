# Authorization picker React QA

Date: 2026-07-19
Status: integrated locally, disabled by default, not deployed

## Security boundary

The migrated scenario is `department -> unit -> employee -> PIN`. The host
passes an allowlisted PostgreSQL System Domains projection containing only IDs,
names, roles and organizational placement plus the non-secret remaining-attempt
count. React keeps entered digits only in component memory and sends them once
through the typed `submit-pin` command. It receives no validation function,
role activation, gate-unlock primitive or session storage handle.

Read-only selection still unmounts React and opens the unchanged legacy PIN
screen. Local write evaluation instead shows a shuffled keypad and delegates
the fifth digit to the existing auth owner. That owner validates employee and
PIN, updates the attempt counter and either returns failed-attempt feedback or
creates the ordinary role-bound session. The PIN is never copied into legacy
draft state, localStorage, shared-state or the session record.

Production activation requires both false-by-default flags, PostgreSQL System
Domains status `server`, a locked auth gate, an empty PIN/person state and an
explicit evaluation request. The loopback `qa=auth-functional` allowance is a
local-only browser-test override and still requires the PostgreSQL-primary
tombstone fixture.

## Evidence

`npm run qa:auth-picker-react-island` proves the static security boundary,
typed adapter, build and production shell. Browser QA rendered nine departments,
confirmed that read-only React contains no PIN keypad, selected an employee and
opened a clean ten-key legacy PIN screen. The local write scenario rejected
`00000` with four attempts left, stayed in React, then accepted the correct PIN
through the owner and created the session for the selected employee. Both PINs
were absent from persistent UI/session state; System Domains writes stayed zero.

The production artifact is `202,559 B` raw / `63,740 B` gzip / `54,990 B`
Brotli. The isolated entry is `206,680 B` raw / `64,127 B` gzip under the
unchanged `225,000 B / 68,000 B` production budget.

No Pilot/Admin deploy, version bump, PIN policy change or feature activation
was performed.
