# Authorization picker React QA

Date: 2026-07-19
Status: authenticated Pilot read-only acceptance complete on `v.1.500.01-1a8a9a4`; disabled by default

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

Production activation requires both false-by-default flags, a locked auth gate,
an empty PIN/person state and an explicit evaluation request. Before installing
the temporary permission, the root-only rollout verifies
`MES_DOMAIN_STORAGE=postgres`. The authenticated System Domains API and
shared-state authority marker intentionally remain inaccessible before PIN;
React therefore consumes only the same allowlisted pre-auth directory
projection already rendered by legacy. The loopback `qa=auth-functional`
allowance is a local-only browser-test override.

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

## Pilot acceptance

Authenticated read-only acceptance completed on immutable release
`v.1.500.01-1a8a9a4` through the real user path: authorized MES -> `Выйти` ->
locked pre-PIN gate. React rendered 9 departments and 76 employees, reached
revision 1 in `526 ms`, had no document overflow and exposed zero PIN digit
buttons. After selecting `Административный отдел` and `Алексеев Егор`, React
unmounted and the unchanged legacy owner rendered exactly 10 keypad buttons,
zero filled digits and five remaining attempts. No PIN was entered.

Live `.99` and `.500.00` evaluations were rejected while the gate remained
unlocked or depended on a protected pre-auth API/tombstone. Both fell back to
legacy without mounting React, accepting PIN input or changing data. The final
rollout keeps those resources protected and makes the PostgreSQL storage check
inside the root activation boundary instead.

Before and after acceptance System Domains remained at revision 2 with 76
employees and 19 org units. The `88-react-auth-picker-evaluation.conf` drop-in
is removed, health is `ok`, and a retained-query reload again renders the
legacy 9-department screen with zero React targets. PIN policy, attempts and
session authority were not changed.
