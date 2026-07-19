# Authorization picker React QA

Date: 2026-07-19
Status: integrated locally, disabled by default, not deployed

## Security boundary

The migrated scenario is strictly `department -> unit -> employee`. The host
passes an allowlisted PostgreSQL System Domains projection containing only IDs,
names, roles and organizational placement. React never receives PIN digits,
PIN draft, attempt counters, validation callbacks, role activation, gate unlock
or session storage.

Selecting an employee unmounts React, copies only the selected organizational
IDs into the existing UI state, clears PIN feedback and opens the unchanged
legacy PIN screen. The extracted legacy PIN renderer now receives its private
draft/keypad state through explicit getter/setter dependencies instead of
undeclared ES-module globals.

Production activation requires both false-by-default flags, PostgreSQL System
Domains status `server`, a locked auth gate, an empty PIN/person state and an
explicit evaluation request. The loopback `qa=auth-functional` allowance is a
local-only browser-test override and still requires the PostgreSQL-primary
tombstone fixture.

## Evidence

`npm run qa:auth-picker-react-island` proves the static security boundary,
typed adapter, build and production shell. Browser QA rendered nine departments,
confirmed that React contains no PIN keypad, selected an employee, opened a
clean ten-key legacy PIN screen with zero entered digits, performed zero System
Domains writes and produced no console errors.

The production artifact is `199,896 B` raw / `62,906 B` gzip / `54,098 B`
Brotli. The isolated entry is `202,893 B` raw / `63,121 B` gzip under the
unchanged `225,000 B / 68,000 B` production budget.

No Pilot/Admin deploy, version bump, PIN policy change or feature activation
was performed.
