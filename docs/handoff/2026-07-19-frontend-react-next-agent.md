# Handoff: продолжение глобальной React + TypeScript миграции

Дата: 2026-07-19

## Где продолжать

- Репозиторий: `/Users/vladislav/Documents/Codex/2026-05-30/mes-frontend-react`
- Ветка: `codex/frontend-react-migration`
- Завершённый кодовый checkpoint: `9d33401` (`feat: complete Timesheet schedule command parity`)
- Предыдущий брендовый checkpoint: `d60c461` (`feat: replace MES brand logo across runtime`)
- Перед работой выполнить `git status --short --branch` и `git pull --ff-only`.
- Не переносить работу обратно в старый checkout и не смешивать её с чужими dirty-файлами.

PostgreSQL authority-цель закрыта ранее (`fc71e01`), поэтому временный стоп-лист
handoff `4f0fbae` больше не блокирует frontend. При этом PostgreSQL owners,
Domain API, Shift Execution и runtime hydration нельзя переписывать ради React:
React продолжает вызывать существующих владельцев через типизированный host.

## Что уже доказано

- Все 24 сценария имеют локальное production-shell read evidence и legacy rollback.
- Последний зафиксированный Pilot read ledger: `20/24` принятых сценариев.
- Оставшиеся live-read пункты: Nomenclature, Boards/BOM и Responsibility
  Policies требуют непустых данных; Contour Admin имеет измеримый набор данных.
- Blueprint исключён из целевой системы и не должен возвращаться.
- Statuses теперь локально завершён по create/edit/delete для пользовательских
  строк. Системные, forged, missing и RBAC-denied удаления fail closed.
- Statuses destructive QA доказал byte-identical cancel, removal persistence,
  legacy read-back без тестовой строки и неизменные Planning routes/steps/slots.
- Adjacent destructive suites Operations и Nomenclature Types зелёные.
- Новый логотип используется в sidebar, public/admin auth, startup error,
  contour favicon и служебном icon registry.

Ключевые документы:

- `docs/handoff/2026-07-19-frontend-react-master.md`
- `docs/frontend-react-migration/command-parity-matrix.md`
- `docs/frontend-react-migration/ui-contract-matrix.md`
- `docs/frontend-react-migration/pilot-readiness-2026-07-19.md`
- `docs/frontend-react-migration/statuses-lab-qa.md`
- `docs/handoff/2026-07-19-postgres-frontend-coordination.md`

## Последние проверки

Прошли:

```bash
node scripts/directory-statuses-react-runtime-policy-qa.mjs
node scripts/directory-statuses-react-rollout-ops-qa.mjs
node experiments/react-migration/qa.mjs
npm run build
node scripts/directory-statuses-react-island-functional-qa.mjs
node scripts/directory-operations-react-runtime-policy-qa.mjs
node scripts/directory-operations-react-island-functional-qa.mjs
node scripts/directory-nomenclature-types-react-runtime-policy-qa.mjs
node scripts/directory-nomenclature-types-react-island-functional-qa.mjs
git diff --check
```

Измерения Statuses:

- independent island: `213503 B` raw / `65173 B` gzip;
- production artifact: `207032 B` raw / `64632 B` gzip / `55697 B` Brotli;
- first commit: `19.40 ms`;
- aggregate lab: `556444 B` raw / `126042 B` gzip при потолке
  `558000 / 127000`; отдельные production islands сохраняют потолок
  `225000 / 68000`.

## Pilot и внешний блокер

Последнее подтверждённое в этом чате состояние, которое нужно перепроверить
live перед любым действием:

- активный релиз Pilot: `v.1.500.01-16e0e86`;
- health `ok`, shared state `ready`;
- оба Contour Admin rollout-флага `false`;
- root-only activation подготовлена по пути
  `/srv/mes/pilot/app/ops/frontend/activate-react-contour-admin-evaluation.sh`;
- `deploy` может restart/status, но не может установить systemd drop-in;
- `sudo -n` требует пароль, `root@mes-line` не разрешён.

Не обходить root boundary через Docker group, изменение прав или ослабление
systemd. Если root-доступ реально появился, сначала прочитать activation script,
проверить текущий release/health/flags, включить только Contour Admin read-only,
сравнить один и тот же Admin projection с legacy, записать commit time/rows/
actions/console, затем немедленно деактивировать и доказать legacy restoration.
Ни одной Ops-команды не выполнять в read acceptance.

## Что делать следующим

1. Сверить Git, Pilot health, active release и runtime flags с текущим live
   состоянием; старые номера релизов не считать актуальными без проверки.
2. Если доступен законный root boundary — завершить Contour Admin read-only
   Pilot acceptance и вернуть все флаги в `false`.
3. Если root по-прежнему недоступен — не застревать. Взять следующий настоящий
   legacy-only command scope из `command-parity-matrix.md`, сначала доказать его
   существование в owner-коде и выбрать один измеримый вертикальный сценарий.
4. Не заявлять live parity для Nomenclature, Boards/BOM или Responsibility
   Policies на пустом наборе. Для записи нужен отдельный disposable record и
   явная cleanup-проверка; реальные данные Pilot не загрязнять.
5. Каждый следующий срез: typed adapter -> existing owner -> React UI ->
   fail-closed policy QA -> production-shell functional QA -> legacy read-back
   -> performance budget -> docs -> отдельный commit/push.
6. Default-on не включать автоматически. Каждый Pilot experiment должен быть
   session-scoped, one-island-only, reversible и завершаться legacy rollback.

## Важные ограничения

- Не переносить бизнес-логику, SQL, API authority или data normalization в React.
- Не менять PostgreSQL schema ради UI-среза.
- Не включать Pilot write flags, которых нет в репозитории.
- Не создавать тестовые записи в реальных данных без отдельного разрешённого
  disposable/cleanup сценария.
- Сохранять legacy интерфейс как rollback до отдельного default-on решения.
- Не использовать Blueprint.

## Продолжение после handoff

- Live preflight повторён: Pilot здоров на `v.1.500.01`, shared state `ready`,
  активный artifact `v.1.500.01-16e0e86`, оба Contour Admin флага `false`.
  `deploy` по-прежнему не имеет passwordless root, прямой root SSH закрыт;
  activation script не запускался.
- Checkpoint среза: `9d33401` (`feat: complete Timesheet schedule command parity`).
  Следующим доказанным legacy-only scope выбран постоянный график Timesheet.
  React теперь локально завершает typed save/remove через существующие
  `saveScheduleAssignment` / `removeScheduleAssignment` и revision-checked
  `timesheet` System Domains owner. PostgreSQL/API/RBAC/normalization не
  перенесены в React.
- Production-shell QA доказывает invalid-offset-before-PUT, save, legacy
  read-back, remove, сохранность unrelated hidden assignment/event fields,
  неизменный `0600` snapshot и default legacy. Артефакт Timesheet:
  `214632 B` raw / `65508 B` gzip; latest first commit `213.50 ms`.
- Pilot write не выполнялся, rollout flags не менялись, legacy rollback
  сохранён. Следующий локальный command scope нужно снова выбирать из реально
  существующего owner-кода; Pilot write остаётся отдельным разрешённым
  disposable/cleanup checkpoint.

## Продолжение: Roles grants checkpoint

- После Timesheet выбран следующий подтверждённый owner-backed scope: один
  grant роли. React теперь отправляет typed `set-grant`, а host повторно
  проверяет `roles:configure`, существование роли/модуля/action, read-only
  ограничение и зависимость `view`, затем вызывает существующий
  `setAccessGrant` на revision-checked поверхности `access-control`.
- QA обнаружил и закрыл прежнюю потерю канонического `readOnly` при
  legacy-to-System-Domains миграции; authority, API и schema не менялись.
- Production-shell QA доказал conflict без мутации, retry, React и legacy
  read-back, cleanup к исходному effective deny, неизменные посторонние grants,
  assignments и hidden role field, default legacy и чистую консоль.
- Последние размеры: Roles independent `214116 / 65691 B` raw/gzip;
  production `208250 / 65235 / 56291 B` raw/gzip/Brotli; latest first commit
  `120.90 ms` при локальном gate `2000 ms`. Full lab `556476 / 126054 B`.
- Pilot writes/flags не выполнялись и не менялись. В остатке Roles явно остаются
  assignments, responsibility scopes и lifecycle (`readOnly`/`active`); каждый
  из них требует отдельного вертикального среза и собственного cleanup proof.

## Продолжение: Roles default-scope checkpoint

- Assignment scope был проверен первым и сознательно не мигрирован: текущий
  `setSubjectRoleAssignment` при replace/clear удаляет все строки сотрудника, а
  PostgreSQL repository не сохраняет advertised `validFrom`/`validTo`. Это
  owner/persistence gap, который нельзя маскировать React-selectом.
- Вместо него завершён безопасный role default scope: typed
  `set-default-scope` принимает только `factory`, `department`, `workCenter`
  или `self`; host повторно проверяет `roles:configure` и вызывает существующий
  `setResponsibilityScope -> updateAccessRole` на `access-control` surface.
- Production-shell QA доказал conflict без мутации, retry `workCenter -> self`,
  legacy read-back, cleanup `self -> workCenter`, неизменные assignments и
  hidden role field. Персональные и assignment scopes остались legacy.
- Последние размеры: Roles independent `215726 / 65944 B`; production
  `209296 / 65475 / 56485 B`; full lab `556520 / 126067 B`. Latest first
  commit `30.00 ms` при gate `2000 ms`.

## Продолжение: Structure Equipment archive checkpoint

- Следующим owner-backed scope выбран explicit Equipment archive. React
  показывает отдельный второй шаг `Подтвердить архивирование`; host повторно
  проверяет существование и активность equipment и делегирует существующему
  `archiveSystemDomainEntity` на revision-checked `production-structure`.
- Production-shell QA работает только с созданной внутри mock API строкой:
  create, invalid quantity rejection, edit conflict/retry, archive,
  `isActive=false` + валидный `archivedAt`, сохранность hidden marker,
  org/work-center/schedule references и quantity, затем legacy read-back
  архивной строки. Исходный `0600` compatibility snapshot byte-identical.
- Re-activation не заявлена: generic upsert сохраняет старый `archivedAt`, что
  требует отдельного owner-contract решения. Pilot write не выполнялся.
- Размеры: independent `215820 / 65636 B`; bundled production
  `208849 / 65161 / 56224 B`; full lab `556534 / 126077 B`; first commit
  `19.70 ms`.

## Продолжение: Structure Positions archive checkpoint

- Positions получил отдельную typed archive-команду с ID-bound вторым
  подтверждением и host recheck активной записи перед существующим
  `archiveSystemDomainEntity("positions", ...)`.
- Mock production-shell QA создаёт 50-ю должность, проверяет ссылки на org unit,
  work center и schedule, conflict/retry редактирования, невозможность переноса
  подтверждения на другую строку, `isActive=false` + `archivedAt`, hidden field
  и архивный legacy read-back. Compatibility snapshot не изменён.
- Pilot write не выполнялся. Влияние архива должности на действующие employment
  assignments остаётся отдельным owner/audit вопросом и не считается закрытым.
- Размеры: independent `216176 / 65692 B`; bundled production
  `209090 / 65196 / 56283 B`; full lab `556577 / 126099 B`; first commit
  `18.30 ms`.
- Corrective audit после checkpoint добавил обязательный host guard: должность
  с действующим employment assignment отклоняется до PUT. QA доказывает нулевую
  ревизию/attempt для такой команды; latest first commit `19.60 ms`.

## Продолжение: Structure Org Units archive checkpoint

- Org Units получил typed archive с ID-bound подтверждением и existing
  `archiveSystemDomainEntity("orgUnits", ...)` owner. Host отклоняет target с
  активными child org units, work centers, positions, equipment или employment
  assignments до PUT.
- QA создаёт 20-й leaf-unit, доказывает cycle rejection, conflict/retry,
  отклоняет архив родителя с активным ребёнком без mutation, затем архивирует
  leaf и проверяет `isActive=false`, `archivedAt`, parent/hidden preservation и
  архивный legacy read-back. Snapshot остаётся byte-identical.
- Pilot write не выполнялся; reactivation остаётся отдельным owner-gap из-за
  сохранения старого `archivedAt` generic upsert-ом.
- Размеры: independent `214582 / 65440 B`; bundled production
  `207704 / 64964 / 56095 B`; full lab `556607 / 126132 B`; first commit
  `16.40 ms`.

## Продолжение: Structure Work Centers archive checkpoint

- Work Centers получил typed archive с ID-bound подтверждением и existing
  `archiveSystemDomainEntity("workCenters", ...)` owner. Host отклоняет target,
  если на него ссылается активный child work center, position, equipment или
  employment assignment, до PUT.
- Production-shell QA сначала отклоняет архив referenced baseline center без
  revision/write, затем архивирует только созданный leaf. Проверены
  `isActive=false`, валидный `archivedAt`, сохранность hidden marker,
  organization, очищенного parent и Planning/Gantt flags, а также архивный
  legacy read-back. ID-bound подтверждение не переносится на другую строку;
  `0600` compatibility snapshot остаётся byte-identical.
- Pilot write не выполнялся. Reactivation не заявлена: generic upsert сохраняет
  старый `archivedAt`, поэтому это отдельный owner-contract gap.
- Размеры: independent `216718 / 65617 B`; bundled production
  `209251 / 65135 / 56225 B`; full lab `556607 / 126132 B`; first commit
  `27.30 ms`.
