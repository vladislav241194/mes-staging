# Handoff: продолжение глобальной React + TypeScript миграции

Дата: 2026-07-19

> **Актуализация 2026-07-21.** Формулировки ниже о завершённых сценариях
> относятся к отдельным React-island-срезам, а не к полному cutover системы.
> Повторный аудит полного scope зафиксировал стартовый baseline `44%`; после
> создания исполняемого route/surface ledger, двух permanent read-only
> Pilot-поверхностей и принятого Weekly runtime consolidation текущий
> доказанный прогресс — `50%`. Текущий accelerated Pilot —
> `v.1.500.73-36727f3`; последний strict-accepted release остаётся
> `v.1.500.26-097d66c`. Fresh current-release read — `1/25`, historical
> write lifecycles — `1/22`. План до настоящих
> `100%` зафиксирован в
> `docs/frontend-react-migration/true-cutover-plan.md`. Этот документ имеет
> приоритет при оценке общего прогресса.

## Где продолжать

- Репозиторий: `/Users/vladislav/Documents/Codex/2026-05-30/mes-frontend-react`
- Ветка: `codex/frontend-react-migration`
- Main integration branch: `codex/main-weekly-evidence-port`
- Main Weekly hotfix integration: `813fabe` (cherry-pick `-x` только
  accepted hotfix `097d66c`; commit `33d7859` не cherry-picked, потому что core
  уже присутствует в main через `0354fda`).
- Main Weekly evidence integration: `fb38100`.
- Полный подготовленный integration range, включая актуализацию этих двух
  authoritative документов: `aca289f..codex/main-weekly-evidence-port`.
- Immutable Pilot acceptance source commit:
  `097d66c416ef61e091099c63b8bc272841c364f5`.
- Предыдущий брендовый checkpoint: `d60c461` (`feat: replace MES brand logo across runtime`)
- Перед работой выполнить `git status --short --branch` и `git pull --ff-only`.
- Не переносить работу обратно в старый checkout и не смешивать её с чужими dirty-файлами.

PostgreSQL authority-цель закрыта ранее (`fc71e01`), поэтому временный стоп-лист
handoff `4f0fbae` больше не блокирует frontend. При этом PostgreSQL owners,
Domain API, Shift Execution и runtime hydration нельзя переписывать ради React:
React продолжает вызывать существующих владельцев через типизированный host.

## Что уже доказано

- Все 25 сценариев имеют локальное production-shell read evidence и release rollback.
- Historical Pilot read ledger: `21/25` принятых сценариев на разных
  релизах; fresh current-release read на strict-accepted `.26` — `1/25` (только Weekly);
  Diagnostics остаётся историческим `.21` evidence; Nomenclature имеет
  historical evaluation lifecycle на `.25`, поэтому write coverage — `1/22`.
- Оставшиеся historical live-read пункты: Boards/BOM, непустые
  Responsibility Policies и Contour Admin на корректном mapped host.
- На live `v.1.500.26-097d66c` без evaluation-флагов постоянно включены
  `weeklyProductionControl` и `structureMigrationDiagnostics`.
- Weekly normal path больше не вызывает legacy model factory. Exact `25 x 11`
  row text совпал с `.25`; реальный drill `.26 -> .25 -> .26` завершён.
  Pinned legacy `.18` сохранён и проверен dry-run, без активации в этом drill.
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

Текущий main-port checkpoint прошёл:

```bash
npm run qa:weekly-production-control-react-island
npm run qa:react-cutover
npm run qa:react-runtime-policy
node scripts/weekly-production-control-runtime-consolidation-qa.mjs
git diff --check
```

QA пересчитывает ровно `50%`, `21/24` historical reads, `1/24` fresh `.26`
reads, `1/22` historical writes и accepted-live Weekly без normal legacy model
dependency. Ни push, ни deploy main-port ветки не выполнялись.

Исторический Statuses checkpoint также проходил:

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

## Текущий Pilot и rollback boundary

- Активный accelerated release: `v.1.500.73-36727f3`; immediate previous:
  `v.1.500.72-4c052bc`; pinned legacy:
  `v.1.500.18-93d02ed`.
- Local/public health — `ok`, shared state — `ready`.
- Accelerated runtime policy содержит 25 React-поверхностей, zero evaluation и
  zero legacy surfaces. Из них строгая current-release browser acceptance всё
  ещё засчитана только для permanent Weekly; Diagnostics остаётся историческим
  `.21` evidence, поэтому accelerated rollout не повышает общий процент.
- Weekly `.26` имеет fresh authenticated read `25 x 11` и exact row-text parity
  с `.25`. Diagnostics не перепроверялся на `.26`; его browser evidence
  остаётся историческим `.21`.
- Previous-release rollback/reactivation `.26 -> .25 -> .26` выполнен. Legacy
  `.18` разрешён dry-run и показывает нулевой список React surfaces, но не
  активировался в этом drill.

Не обходить root boundary через Docker group, изменение прав или ослабление
systemd. Любой следующий write rollout требует отдельного disposable lifecycle,
cleanup и явного rollback evidence. Старые `.01`/Contour Admin root-blocker
абзацы ниже являются историей выполнения, а не текущим состоянием Pilot.

## Что делать следующим

1. Продолжить strict-TS вывод активного JavaScript пакетами по `4–6`
   совместимых owners. Базовый React island host уже типизирован в `.72`;
   следующий пакет выбирать из оставшихся browser-only host wrappers после
   короткого import/QA preflight.
2. На пакет выполнять один focused QA, один commit/push, один accelerated Pilot
   release и одно обновление handoff. Не выпускать отдельный релиз на каждый
   файл.
3. Staging оставить замороженным до крупной пользовательской контрольной
   точки. Admin считать частью Pilot runtime и проверять отдельно только при
   изменении admin routing/auth/commands.
4. Не повышать evidence-weighted `50%` за механическую TS-конверсию. Следующий
   процент требует fresh authenticated Pilot read/write acceptance либо
   закрытия одного из partial production-сценариев с owner-backed parity.
5. Не заявлять live parity для Boards/BOM или Responsibility Policies на пустом
   наборе. Для записи нужен отдельный disposable record и явная cleanup-проверка.
6. Сохранять `.72` как immediate rollback и sealed `.18` как legacy baseline;
   не добавлять evaluation flags и не обходить compatibility guard.

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

## Продолжение: Responsibility Policies archive audit

- Archive не реализован: existing generic owner формирует `isActive=false` и
  `archivedAt`, но `system_responsibility_policies` и PostgreSQL repository не
  сохраняют и не гидратируют эти lifecycle fields. После server round-trip
  политика снова выглядела бы активной.
- Это owner/schema gap, а не React UI scope. В рамках миграции запрещено
  подменять его локальной кнопкой или переносить operational authority.
- Create/edit остаётся доказанным local-only scope, legacy rollback сохранён,
  Pilot write не выполнялся. Следующий безопасный lifecycle-кандидат — Employees,
  где owner атомарно деактивирует сотрудника и закрывает primary assignment, а
  оба поля уже персистятся PostgreSQL repository.

## Продолжение: Structure Employees archive checkpoint

- Employees получил typed archive с ID-bound подтверждением через existing
  compound `archiveSystemDomainEntity("employees", ...)` owner. Обычный save
  больше не может менять lifecycle state; reactivation остаётся legacy.
- Host до PUT отклоняет сотрудника с active secondary employment assignment,
  schedule assignment, role assignment или active responsibility-policy link.
  QA использует baseline master с role assignment для доказательства отказа без
  mutation, затем архивирует только созданного disposable employee.
- Owner одной revision-checked командой ставит employee `isActive=false` и
  закрывает active primary assignment датой. QA доказывает сохранность hidden
  employee/primary fields и уже завершённого secondary assignment, ID-bound
  confirmation, archived 77-row legacy read-back и byte-identical `0600`
  compatibility snapshot.
- Pilot write не выполнялся. Размеры: independent `218171 / 66062 B`; bundled
  production `210420 / 65517 / 56580 B`; full lab `556633 / 126135 B`; first
  commit `36.60 ms`.

## Продолжение: Pilot read-only recheck после lifecycle checkpoint

- Живой `https://pilot.mes-line.ru` открыт 2026-07-19 через штатный auth picker;
  legacy Planning загрузился без console warning/error. Данные и Ops-команды не
  изменялись.
- Публичный `window.MES_APP_CONFIG` подтверждает `APP_ENV=pilot` и `false` для
  всех React feature/read-only flags, включая Contour Admin. На проверенном пути
  React island не смонтирован; legacy rollback фактически активен.
- Загружен immutable asset `src/app.js?v=fc9b4a6309bb-v.1.500.01`. Локальные
  archive checkpoint-коммиты этой продолженной ветки в Pilot не выпускались.
- Contour Admin read acceptance по-прежнему нельзя заявить: root-controlled
  drop-in не активирован, а обход root boundary запрещён. Переданные доступы не
  сохранены в репозитории или документации.

## Продолжение: канонический MES LINE logo и Pilot release

- Переданный `mes_logo_high_quality.svg` сохранён как канонический source asset
  `assets/brand/mes_logo_high_quality.svg`; его видимое содержимое byte-for-byte
  совпадает с runtime `favicon.svg` после нормализации завершающего перевода
  строки. Contour favicon теперь явно строится из канонического source asset.
- `scripts/brand-logo-qa.mjs` fail-closed проверяет runtime alias, sidebar,
  public/admin login, startup error, служебный icon registry и все три contour
  favicon. Старый текстовый `<text>MES</text>` contour mark запрещён тестом.
- Версия поднята до `v.1.500.02`; кодовый checkpoint `05bd646` опубликован в
  `origin/codex/frontend-react-migration`. Локально прошли syntax, build,
  `qa:brand-logo`, `qa:icons`, dist/runtime probe и `git diff --check`.
- Штатный staged release `v.1.500.02-05bd646` собран из fresh-upstream Git
  provenance, проверен manifest-ом и активирован с автоматическим health/
  rollback guard. Предыдущий pointer
  `/srv/mes/pilot/releases/v.1.500.01-16e0e86/app` сохранён как rollback target.
- Live после активации: health `ok`, shared state `ready`, service `active`,
  `/srv/mes/pilot/app` указывает на `v.1.500.02-05bd646`; public login ссылается
  на `/favicon.svg`, live favicon содержит канонический `512 x 512` vector и не
  содержит старый text mark. Все `49/49` опубликованных React flags остаются
  `false`, поэтому legacy rollback/default path сохранён; Pilot writes и Ops не
  выполнялись.

## Продолжение: Gantt command proof и sidebar Pilot identity

- Local-only Gantt write evaluation завершает один typed `reschedule-slot`
  через существующий revision-checked `changeSlotSchedule` owner. Host повторно
  проверяет PostgreSQL projection, RBAC, slot/route/operation binding, lock и
  дату; Pilot write gate не добавлен. Production-shell QA доказывает locked и
  invalid fail-closed, conflict/retry, один revision advance, сохранение
  длительности и legacy geometry read-back. Checkpoint `ac310be` опубликован;
  default Pilot path остаётся legacy.
- Sidebar больше не использует contour favicon с красной подложкой: он напрямую
  загружает `assets/brand/mes_logo_high_quality.svg`. Подписи сокращены до
  `Pilot` и динамического `APP_VERSION`; desktop знак увеличен до `40 x 40 px`,
  padding brand-блока убран без увеличения его итоговой высоты и без
  горизонтального overflow. Favicon вкладки сохраняет contour-маркер.
- Версия поднята до `v.1.500.03`; checkpoint `190fdf8` опубликован. Прошли
  syntax, build, `qa:brand-logo`, 26-module browser smoke и отдельная локальная
  geometry/screenshot проверка (`40 x 40`, padding `0`, source canonical SVG).
- Staged release `v.1.500.03-190fdf8` собран с `fresh-upstream-fetch`, manifest
  проверен и релиз активирован штатным health/rollback guard. Live service
  `active`, `/srv/mes/pilot/app` указывает на новый immutable release; rollback
  target сохранён как `/srv/mes/pilot/releases/v.1.500.02-05bd646/app`.
- Authenticated live UI показывает `Pilot` / `v.1.500.03`, загруженный
  прозрачный SVG `40 x 40`, padding `0`, zero horizontal overflow и обычный
  legacy Gantt; React targets на проверенном пути `0`. Ни Pilot data write, ни
  Ops-команда не выполнялись.

## Продолжение: Boards/BOM quantity command checkpoint

- Следующим owner-backed scope выбран edit количества одной существующей строки
  BOM. Planning start-date отклонён как кандидат из-за compatibility-only
  `persistState()` без revision-checked work-order owner; Roles read-only также
  не выбран, потому что это не существующая legacy UI-команда.
- React показывает компактный quantity editor только в локальном write-evaluation
  contour. Host повторно проверяет `nomenclature:edit`, существование платы и
  строки, целое неотрицательное значение и полный expected-row signature, затем
  делегирует существующему `updateBomImportCell` и читает результат обратно у
  владельца. Excel import, другие BOM cells и удаление строк остаются legacy.
- Production-shell QA доказывает invalid rejection без изменения state-файла,
  успешное `10 -> 12`, сохранность остальных восьми значений строки, трёх
  соседних строк, hidden board metadata и Planning, а затем legacy input
  read-back значения `12`. Board create/edit/delete regression остаётся зелёным.
- Полный `npm run qa:boards-react-island` прошёл: typed QA, runtime/rollout
  policy, production build и browser functional flow. First commit `20.20 ms`;
  island `216117 / 66259 B`, full lab `556666 / 126148 B`, бюджеты сохранены.
- Pilot write/release не выполнялся, server write flag отсутствует. Live Pilot
  остаётся на `v.1.500.03-190fdf8`, все React flags выключены, legacy rollback
  target — `v.1.500.02-05bd646`.
- После этого блока доказательная оценка глобальной миграции: примерно `85%`
  выполнено, примерно `15%` осталось (`+1 п.п.`). Процент отражает закрытие
  bounded owner-backed slice, а не объявляет готовыми оставшиеся команды Boards,
  Planning/Gantt, role lifecycle и Pilot acceptance.

## Продолжение 2026-07-20: Boards/BOM row-delete checkpoint

- Следующим настоящим legacy-only scope выбрано удаление одной строки BOM.
  Legacy UI уже делегировал его `deleteBomImportRow`; React не получил ни
  persistence, ни normalization authority и вызывает того же lazy Products owner.
- Write-evaluation payload имеет отдельную exact-boolean `bomRowDelete`
  capability. React показывает действие только при ней, сохраняет полный снимок
  таблицы и требует доступное подтверждение. Host повторно проверяет RBAC,
  board/index и все строки authoritative BOM до удаления; changed/missing target
  fail closed. После owner-команды host читает точный remaining-row projection.
- Production-shell QA на disposable `0600` snapshot доказывает byte-identical
  cancel, удаление только четвёртой строки, сохранность первых трёх строк,
  quantity `12`, hidden board metadata, independently addressable component
  Nomenclature и Planning. Legacy затем читает три строки и не показывает
  удалённый `HDR-2`; board create/edit/delete regression также остаётся зелёным.
- Performance gate зелёный: Boards island `217946 / 66517 B`, full lab
  `556703 / 126154 B`; final first commit `20.80 ms` при gate
  `2000 ms`. Excel import и остальные восемь BOM fields остаются отдельными
  legacy-only scopes.
- Pilot write/release/flag change не выполнялся; server write flag по-прежнему
  отсутствует, legacy rollback сохранён. После этого блока доказательная оценка
  глобальной миграции: примерно `86%` выполнено, примерно `14%` осталось
  (`+1 п.п.`); критические owner gaps и Pilot acceptance не переоценены.

## Продолжение 2026-07-20: Boards/BOM all-cell edit checkpoint

- Закрыт весь оставшийся existing-row cell-edit scope: typed
  `update-bom-cell` допускает только non-quantity columns
  `0,1,2,3,4,5,7,8`; column `6` остаётся отдельной integer-командой. Host
  повторно проверяет RBAC, board/index, expected visible row и тип значения,
  затем вызывает существующий `updateBomImportCell` и принимает только полный
  owner-normalized row-back. Persistence/normalization/Nomenclature authority в
  React не переносились.
- React показывает controlled text inputs только при exact-boolean
  `bomRowEdit`; blur/Enter выполняет typed-команду, owner result возвращает
  нормализованное значение. Read-only payload по-прежнему рендерит буквальные
  девять ячеек без command UI.
- Production-shell QA последовательно изменяет все восемь полей первой строки,
  доказывает `805 -> 0805`, итоговые девять A:I values, сохранность трёх
  соседних строк, hidden board/Nomenclature fields и Planning. Legacy читает
  всю итоговую строку; quantity, row-delete и board create/edit/delete regression
  остаются зелёными.
- При owner-аудите восстановлен пропущенный ledger item: отдельная команда
  `addNomenclatureToBom` ещё legacy-only. Вместе с Excel import это два
  оставшихся Boards command scopes; compatibility component counters не
  объявляются React-командой.
- Performance gate зелёный: Boards island `218822 / 66754 B`, full lab
  `556703 / 126149 B`; final first commit `25.90 ms`. Pilot
  write/release/flag change не выполнялся, legacy rollback сохранён.
- После блока доказательная оценка глобальной миграции: примерно `87%`
  выполнено, примерно `13%` осталось (`+1 п.п.`). Оценка не включает два
  оставшихся Boards scopes, Planning/Gantt/role lifecycle и внешние Pilot gates.

## Продолжение 2026-07-20: Boards/BOM add-from-Nomenclature checkpoint

- Закрыт последний ручной row-create scope Boards: typed
  `add-bom-nomenclature-row` несёт board ID, Nomenclature ID и полный
  expected-table snapshot. Host повторно проверяет local write gate, RBAC,
  существование платы/позиции, точный РЭА-тип и конкурентное изменение, затем
  делегирует существующему `addNomenclatureToBom`.
- React не создаёт строку и не вычисляет sequence/note/totals. Успех принимается
  только после owner read-back: прежний префикс неизменен, добавлена ровно одна
  строка и её `nomenclatureId` совпадает. Host projection показывает только
  eligible options; exact boolean `bomRowAdd` остаётся fail-closed.
- Production-shell QA добавляет `rea-add` на пустую вторую плату, доказывает
  owner values, примечание `Добавлено из номенклатуры`, sequence `1`, корпусной
  total, сохранность hidden Nomenclature field/source link и Planning. Legacy
  читает полную новую строку. Обнаруженная потеря выбора второй платы после
  authoritative rerender исправлена через существующий `ui.activeBomId`.
- Quantity, все девять BOM cells, row delete и board create/edit/delete проходят
  тем же regression. Performance gate зелёный: Boards `220698 / 67136 B`, full
  lab `557071 / 126284 B`; first commit `20.70 ms` при gate `2000 ms`.
- Excel import теперь единственный оставшийся Boards command scope. Pilot
  write/release/flags не менялись, legacy rollback сохранён. После блока
  доказательная оценка глобальной миграции: примерно `88%` выполнено, примерно
  `12%` осталось (`+1 п.п.`).

## Продолжение 2026-07-20: Boards/BOM XLSX import checkpoint

- Закрыт последний известный Boards command gap. Typed `import-bom-xlsx`
  передаёт исходный browser `File` и expected board-ID snapshot; host проверяет
  local write/RBAC, расширение и concurrent list, затем вызывает существующий
  `importBomFromXlsxFile`. ZIP/XML parsing, headers/rows normalization, totals,
  board/result/component Nomenclature и persistence остались в owner.
- Успех принимается только по owner read-back непустой платы с совпадающим
  `sourceFileName`; `ui.activeBomId` возвращает импортированную плату в React.
  Exact boolean `bomImport` fail-closed; read-only по-прежнему показывает
  disabled action без file input.
- Production-shell QA строит минимальный настоящий stored-ZIP XLSX в памяти.
  `invalid.txt` byte-stable отклоняется, затем `Плата Excel QA.xlsx` создаёт две
  строки, девять заголовков, sheet `QA BOM`, totals `SOD-123=2`/`0603=4`, result
  и component Nomenclature. Planning неизменен; legacy читает обе строки A:I.
- Все прежние Boards regressions остаются зелёными. Performance: Boards
  `221436 / 67304 B`, full lab `557101 / 126296 B`; first commit `20.30 ms`.
  Локальных известных command gaps у Boards больше нет.
- Pilot write/release/flags не менялись, legacy rollback сохранён. После блока
  доказательная оценка глобальной миграции: примерно `89%` выполнено, примерно
  `11%` осталось (`+1 п.п.`); остаток относится к другим модулям и внешним
  Pilot gates, а не к локальному Boards command parity.

## Продолжение 2026-07-20: Structure Employees reactivation checkpoint

- Закрыт последний известный локальный lifecycle gap Employees. React получил
  отдельную typed `reactivate` команду с ID-bound двухшаговым подтверждением;
  обычный save по-прежнему не может менять `isActive`.
- Host повторно проверяет local write gate, RBAC и существование архивного
  сотрудника, затем делегирует существующему
  `upsertSystemDomainEntity("employees", ...)` owner и принимает успех только
  после authoritative read-back с `isActive=true` и очищенным `archivedAt`.
  PostgreSQL/API/business
  authority в React не переносились.
- Восстановление возвращает только employee identity: primary assignment,
  закрытый archive-командой, не открывается самовольно. Hidden employee fields,
  уже завершённый secondary assignment и compatibility snapshot сохраняются.
- Production-shell QA доказывает create/edit/archive/reactivate, exact revision
  и write counts, dependency rejection, conflict retry, If-Match, ID-bound
  confirmations и reactivated `77`-row legacy read-back. First commit
  `22.10 ms`; Structure Employees artifact `219262 / 66162 B`, full lab
  `557101 / 126296 B`; performance gates зелёные.
- Pilot write/deploy/version/flags не менялись; legacy остаётся default-off
  rollback. После блока доказательная оценка глобальной миграции: примерно
  `90%` выполнено, примерно `10%` осталось (`+1 п.п.`). Прирост относится к
  локально завершённому employee lifecycle; внешняя Pilot write acceptance и
  другие legacy-only модули не переоценены.

## Продолжение 2026-07-20: Structure Org Units reactivation checkpoint

- Закрыт Org Units lifecycle gap. Обычная typed save-команда больше не несёт и
  UI не показывает `isActive`; archive/reactivate остаются отдельными командами
  с ID-bound двухшаговым подтверждением.
- Reactivation повторно проверяет архивный target и активного parent, затем
  делегирует existing `upsertSystemDomainEntity("orgUnits", ...)` owner с
  `isActive=true`/`archivedAt=""`. Успех принимается только после authoritative
  active read-back без archive marker; parent и hidden fields сохраняются.
- Production-shell QA доказывает lifecycle-neutral save, create/edit,
  hierarchy-cycle и referenced-parent rejection, conflict/retry,
  archive/reactivate, exact revision/If-Match/idempotency и active 20-row legacy
  read-back. Snapshot byte-identical; first commit `22.00 ms`.
- Performance: independent Org Units `214972 / 65451 B`, bundled production
  `207866 / 64977 / 56032 B`, full lab `557101 / 126296 B`; gates зелёные.
  Pilot write/deploy/version/flags не менялись, legacy rollback сохранён.
- После блока доказательная оценка глобальной миграции: примерно `91%`
  выполнено, примерно `9%` осталось (`+1 п.п.`). Прирост относится к полностью
  замкнутому локальному Org Units lifecycle; Pilot write acceptance и другие
  legacy-only scopes остаются вне этой оценки.

## Продолжение 2026-07-20: Structure Work Centers reactivation checkpoint

- Закрыт Work Centers lifecycle gap: typed save больше не несёт `isActive`, а
  UI не позволяет менять lifecycle через обычный editor. Archive/reactivate —
  отдельные ID-bound двухшаговые команды.
- Reactivation валидирует архивный target, активные organization/parent refs и
  делегирует existing `upsertSystemDomainEntity("workCenters", ...)` owner с
  `isActive=true`/`archivedAt=""`. Authoritative read-back обязателен; hidden,
  hierarchy и explicit Planning/Gantt flags сохраняются.
- Production-shell QA доказывает lifecycle-neutral save, hierarchy/dependency
  rejection, conflict/retry, archive/reactivate, exact revision/If-Match/
  idempotency и active 20-row legacy read-back. Отдельный impact QA доказывает
  возврат reactivated opted-in центра в Planning/Gantt без переписывания
  employee/Shift stable IDs. First commit `20.10 ms`.
- Performance: independent `217407 / 65683 B`, bundled production
  `209584 / 65205 / 56301 B`, full lab `557101 / 126296 B`; gates зелёные.
  Pilot write/deploy/version/flags не менялись, legacy rollback сохранён.
- После блока доказательная оценка глобальной миграции: примерно `92%`
  выполнено, примерно `8%` осталось (`+1 п.п.`). Прирост относится к замкнутому
  локальному Work Centers lifecycle; Pilot write acceptance и прочие
  legacy-only scopes не переоценены.

## Продолжение 2026-07-20: Structure Equipment reactivation checkpoint

- Аудит подтвердил lifecycle bypass в ordinary Equipment editor. Typed save
  больше не несёт `isActive`; archive/reactivate стали отдельными ID-bound
  двухшаговыми командами.
- Reactivation валидирует архивный target и active organization/work-center/
  schedule refs, затем вызывает existing `upsertSystemDomainEntity("equipment",
  ...)` owner с `isActive=true`/`archivedAt=""`. Успех принимается только после
  authoritative active read-back; quantity, refs и hidden fields сохраняются.
- Production-shell QA доказывает lifecycle-neutral save, invalid quantity
  rejection, create/edit, conflict/retry, archive/reactivate, exact revision/
  If-Match/idempotency и active 7-row legacy read-back. Scheduling commands не
  переносились в React. First commit `17.40 ms`.
- Performance: independent `216206 / 65655 B`, bundled production
  `209011 / 65176 / 56294 B`, full lab `557101 / 126296 B`; gates зелёные.
  Pilot write/deploy/version/flags не менялись, legacy rollback сохранён.
- После блока доказательная оценка глобальной миграции: примерно `93%`
  выполнено, примерно `7%` осталось (`+1 п.п.`). Прирост относится к замкнутому
  локальному Equipment lifecycle; scheduling/Pilot write acceptance и другие
  legacy-only scopes остаются отдельно.

## Продолжение 2026-07-20: Structure Positions reactivation checkpoint

- Фактический аудит Positions выявил тот же lifecycle bypass: ordinary typed
  save несла `isActive`. Поле удалено из draft/UI; archive/reactivate теперь
  отдельные ID-bound двухшаговые команды.
- Reactivation валидирует архивный target и active organization/work-center/
  base-schedule refs, вызывает existing `upsertSystemDomainEntity("positions",
  ...)` owner с `isActive=true`/`archivedAt=""` и требует authoritative active
  read-back. Employment assignments не создаются и не возобновляются.
- Production-shell QA доказывает lifecycle-neutral save, referenced-position
  archive rejection до PUT, create/edit, conflict/retry, archive/reactivate,
  exact revision/If-Match/idempotency и active 50-row legacy read-back. First
  commit `26.50 ms`.
- Performance: independent `216543 / 65712 B`, bundled production
  `209245 / 65222 / 56302 B`, full lab `557101 / 126296 B`; gates зелёные.
  Pilot write/deploy/version/flags не менялись, legacy rollback сохранён.
- После блока доказательная оценка глобальной миграции: примерно `94%`
  выполнено, примерно `6%` осталось (`+1 п.п.`). Прирост относится к замкнутому
  локальному Positions lifecycle; assignment/Pilot acceptance и остальные
  legacy-only scopes не переоценены.

## Продолжение 2026-07-20: Roles unassigned lifecycle checkpoint

- Аудит разделил два advertised поля: `system_access_roles.is_active`
  персистится и участвует в fail-closed enforcement, а `readOnly` текущий
  PostgreSQL repository не сохраняет. Поэтому `readOnly` не переносился.
- React получил отдельные typed `deactivate-role` / `reactivate-role` с
  двухшаговым подтверждением exact stable ID. Host повторно проверяет
  `roles:configure`, PostgreSQL command readiness и делегирует existing
  `updateAccessRole` на revision-checked `access-control` surface.
- Деактивация разрешена только для роли без явных назначений и никогда для
  effective role текущего пользователя. Grants, assignments, ordinary metadata
  и hidden fields не меняются; inactive role немедленно даёт fail-closed grants.
- Production-shell QA доказывает disabled assigned-role path без PUT,
  conflict/retry деактивации, inactive React/legacy read-back, ID-bound
  reactivation, exact revision/If-Match/idempotency и восстановление исходных
  grants. First commit `17.90 ms`.
- Performance: independent `219016 / 66400 B`, bundled production
  `211411 / 66049 / 56889 B`, full lab `557139 / 126312 B`; gates зелёные.
  Pilot write/deploy/version/flags не менялись, legacy rollback сохранён.
- После блока доказательная оценка глобальной миграции: примерно `95%`
  выполнено, примерно `5%` осталось (`+1 п.п.`). Прирост относится только к
  unassigned-role lifecycle; assignments, scopes, `readOnly`, assigned-role
  lifecycle, Pilot acceptance и остальные legacy-only scopes не переоценены.

## Продолжение 2026-07-20: Specifications 2.0 server-primary publication checkpoint

- React получил typed `publish-draft` поверх существующего server-first owner:
  двухшаговое подтверждение exact stable ID, expected previous revision,
  cancel, `409` conflict/retry и fail-closed проверку следующей ревизии.
- После server ack короткий read cache принудительно инвалидируется. Успех
  принимается только после PostgreSQL read-back той же ревизии; затем React и
  legacy показывают ревизию 8 и одно опубликованное дерево.
- Исправлен owner gap: fingerprint и публикация используют актуальные
  `editorRows`, а не stale `treeRows`. Подтверждённые строки становятся новым
  legacy baseline; concurrent newer draft не теряется.
- Production-shell QA доказывает cancel без API, один конфликт и один retry,
  exact ID/revision/idempotency, PostgreSQL + legacy read-back, ровно одну
  compatibility-запись черновика и clean console. First commit `17.20 ms`.
- Performance: independent `215962 / 65770 B`, bundled production
  `209860 / 65493 / 56412 B`, full lab `559658 / 126669 B`; production limits
  не менялись, aggregate-only raw headroom `561000 B`. Pilot write/deploy/
  version/flags не менялись, legacy rollback сохранён.
- Planning Workbench dates/labor audited but intentionally not migrated: они
  всё ещё используют local `persistState()` без revision-checked PostgreSQL
  owner. Сначала нужен настоящий server owner/schema contract.
- После блока доказательная оценка глобальной миграции: примерно `96%`
  выполнено, примерно `4%` осталось (`+1 п.п.`). Прирост относится только к
  локально замкнутой server-primary publication; Pilot write acceptance,
  Specifications attachments/routes/work orders и другие owner gaps не
  переоценены.

## Продолжение 2026-07-20: Specifications 2.0 exact-revision work-order checkpoint

- React получил typed `create-work-order` только после existing capability
  подтверждает `workOrderCreationEnabled` и PostgreSQL-primary authority.
- Двухшаговое подтверждение привязано к immutable revision ID. Host повторно
  проверяет selected entry, revision, published route, целое положительное
  quantity и генерирует idempotency key перед existing server owner.
- Legacy work-order form переведена на тот же валидирующий owner; отдельного
  обходного пути не осталось. Attachment upload не переносился: он пока
  browser-storage-first и требует отдельного server-first owner repair.
- Production-shell QA доказывает cancel без API и ровно один POST с exact
  `revision-kt7-8`, `route-root`, quantity `1` и idempotency key; публикация,
  PostgreSQL/legacy read-back и compatibility-write инварианты сохранены.
  First commit `7.60 ms`.
- Performance: independent `218918 / 66198 B`, bundled production
  `212193 / 65914 / 56703 B`, full lab `562628 / 127063 B`; production limits
  неизменны, aggregate-only budget `564000 / 128000 B`. Pilot не менялся,
  legacy rollback сохранён.
- После блока доказательная оценка глобальной миграции: примерно `97%`
  выполнено, примерно `3%` осталось (`+1 п.п.`). Прирост относится только к
  exact-revision work-order creation; Pilot write acceptance, attachments,
  route editing и owner gaps других модулей не переоценены.

## Продолжение 2026-07-20: Roles exact-employee assignment checkpoint

- React получил typed `set-assignment` для immediate replace/clear одного
  явного назначения. Диалог привязан к exact stable employee ID и передаёт
  expected previous role; cancel не выполняет PUT.
- Host повторно проверяет PostgreSQL/access-control readiness,
  employee-scoped `roles:assign`, существование сотрудника, активность target
  role и expected previous role. Self-mutation и несколько явных строк
  отклоняются до PUT; owner остаётся единственной точкой записи.
- Immediate-команда использует пустую нижнюю границу периода. Это устраняет
  найденный UTC-boundary дефект, при котором локальная дата в первые часы МСК
  считалась ещё не наступившей в legacy effective-date read model.
- Production-shell QA доказывает exact-ID confirmation, cancel, conflict/retry,
  replace `master -> reserve`, PostgreSQL и legacy read-back, cleanup
  `reserve -> master`, неизменные hidden fields и дальнейший unassigned-role
  lifecycle. First commit `28.60 ms`; compact/production UI и console clean.
- Performance: independent `222758 / 66971 B`, bundled production
  `214423 / 66615 / 57356 B`, full lab `563255 / 127281 B`; production и
  aggregate budgets зелёные. Pilot write/deploy/version/flags не менялись,
  legacy rollback сохранён.
- После блока доказательная оценка глобальной миграции: примерно `98%`
  выполнено, примерно `2%` осталось (`+1 п.п.`). Прирост относится только к
  immediate single-assignment parity; multiple/effective-window assignments,
  personal/assignment scopes, `readOnly`, assigned-role lifecycle, Pilot write
  acceptance и остальные owner gaps не переоценены.

## Аудит остатка 2026-07-20: доказательная граница 98%

- После checkpoint `eb37993` повторно проверены оставшиеся legacy-only scopes.
  Без нового backend owner/schema контракта безопасного следующего React write
  slice не найдено.
- PostgreSQL System Domains repository для `system_access_roles` не пишет и не
  читает `readOnly`; `system_role_assignments` не round-trip-ит effective
  windows; отдельного persistence contract для access responsibility scopes
  нет. Поэтому `readOnly`, multiple/effective-window assignments и personal/
  assignment scopes остаются fail-closed.
- `system_responsibility_policies` сохраняет subject/mode/targets, но не
  lifecycle. React archive нельзя строить поверх поля, которое исчезнет после
  PostgreSQL read-back.
- Specifications 2.0 attachment blob upload/download server-primary и включён
  на Pilot, но привязка `serverAttachmentId` к operation/route draft всё ещё
  сначала сохраняется в browser registry/localStorage. Route drafts, structural
  add/remove/reparent и нормы имеют ту же browser-owned границу. Нельзя выдавать
  blob storage за завершённый server-owned attachment lifecycle.
- Planning Workbench quantity и Gantt start-time уже используют revision-checked
  owners. Оставшиеся даты/трудоёмкость route-level модели продолжают писать
  через local `persistState()` и не имеют эквивалентного PostgreSQL command.
- Read-only Pilot audit по-прежнему показывает `v.1.500.03`, `49` React flags,
  `0` enabled, `0` rollout targets и destructive actions `false`. Ни deploy, ни
  Pilot write, ни изменение реальных данных не выполнялись.
- Следующий прирост требует отдельного решения: (a) согласованный backend
  owner/schema block для одного из перечисленных scopes либо (b) явное
  разрешение на disposable Pilot write-acceptance с заранее определённым
  cleanup. До этого общая оценка остаётся `98%` (`+0 п.п.`, осталось `2%`).

## Продолжение 2026-07-20: Shift Work Orders fact/correction checkpoint

- Code checkpoint `ad51783` добавляет в Журнал СЗН один ограниченный typed
  command `save-fact` для точной строки текущего PostgreSQL-окна. Assignment и
  переход в Мастерскую остаются legacy.
- React получает только host-computed capability и fact context по stable row
  ID. Host заново строит Shift Master Board model, проверяет
  `shiftMasterBoard:edit`, существование canonical server assignment,
  целочисленные границы и `defect <= actual`, затем вызывает тот же Shift
  Execution fact/carryover owner, который уже использует Мастерская. API,
  PostgreSQL, RBAC и lifecycle authority в React не переносились.
- Редактор факта вынесен в отдельный lazy chunk. Он получает hooks и
  `ModalOverlay` основного island-runtime, поэтому в production нет второй
  несовместимой копии React. Base entry явно проверяется на отсутствие полей
  редактора.
- Production-shell QA доказывает default legacy, read-only `0` writes, ленивую
  загрузку, Escape/cancel без команды, коррекцию `58 -> 59`, ровно один POST в
  `/assignments/assignment-react-qa/facts`, React и legacy read-back, cleanup
  `59 -> 58` вторым fact-only POST, отсутствие assignment/carryover writes,
  byte-stable `0600` state и clean console.
- Регрессия общего owner проверена полным Shift Master Board flow: date/master/
  focus, assignment, fact, canonical carryover create/navigate/cancel, typed
  transfer и SZN print остаются зелёными.
- Performance: independent base `223677 / 67703 B`, lazy fact
  `5269 / 2098 B`, production base `216974 / 67343 / 63914 B`, production lazy
  fact `4097 / 1928 / 1797 B`; production gate остался неизменным
  `225000 / 68000 B`. Development-only aggregate `565019 / 127686 B` проходит
  `566000 / 128000 B`.
- Pilot не деплоился и не изменялся: `v.1.500.03`, все React flags/targets
  остаются выключены, destructive actions выключены, реальных записей не было.
  Legacy rollback сохранён; server/Pilot write activation для этого среза
  отсутствует.
- После блока доказательная оценка глобальной миграции: примерно `99%`
  выполнено, примерно `1%` осталось (`+1 п.п.`). Прирост относится только к
  локально доказанному fact/correction scope Журнала СЗН. Assignment,
  подтверждённые owner/schema gaps и любые Pilot write-acceptance не
  переоценены.

## Продолжение 2026-07-20: Shift Work Orders assignment checkpoint

- Code checkpoint `699b4ad` добавляет typed `save-assignment` для точной строки
  текущего Журнала СЗН. Контекст исполнителей загружается только по клику из
  текущей Shift Master Board row и не попадает в базовый journal payload.
- Общий helper повторно проверяет `shiftMasterBoard:assign`, membership в
  access matrix, доступность по Табелю, unique employee IDs, положительные
  целые количества и суммарный план. После этого он вызывает существующие
  `saveShiftMasterBoardAssignment` и revision-checked Shift Execution
  create/update owner; React не владеет RBAC, availability или persistence.
- Assignment и fact используют один lazy command bundle с hooks и
  `ModalOverlay` основного React runtime. Base bundle проверяется на отсутствие
  обоих editor markers; production-entry gate `225000 / 68000 B` не повышался.
- Production-shell QA доказывает default legacy и `0` writes в read-only,
  assignment Escape/cancel без PATCH, correction `58 -> 57`, React и legacy
  read-back, cleanup `57 -> 58`, затем прежний fact flow `58 -> 59 -> 58`.
  Выполнено ровно два assignment PATCH и два fact POST; carryover writes нет,
  temporary `0600` state byte-stable, console clean.
- Полный Shift Master Board regression снова зелёный: date/master/focus,
  assignment, fact, canonical carryover create/navigate/cancel, transfer и SZN
  print используют тот же owner без регрессии.
- Performance: independent base `224968 / 67925 B`, lazy command
  `9370 / 3020 B`, production base `217934 / 67553 / 64100 B`, production lazy
  command `6943 / 2817 / 2661 B`; development-only aggregate
  `566267 / 127918 B` проходит `567000 / 128000 B`.
- Pilot не деплоился и не изменялся; write activation по-прежнему существует
  только в localhost QA, legacy rollback сохранён.
- После блока доказательная оценка глобальной миграции: примерно `99.5%`
  выполнено, примерно `0.5%` осталось (`+0.5 п.п.`). Прирост относится только
  к локально доказанному assignment scope Журнала СЗН. Оставшийся объём —
  подтверждённые owner/schema gaps и отдельно разрешаемые Pilot write/default-
  on решения; их нельзя закрыть одной frontend-реализацией.

## Финальный доступный остаток 2026-07-20

- Повторная сверка executable command matrix: `22` production scenarios имеют
  `local-complete`, два продуктовых read-only scenarios — `not-applicable`, ни
  одного implicit/pending command status нет; у всех `24` сохранён legacy
  rollback.
- Устаревшие next-scope формулировки в JSON синхронизированы с фактическим
  состоянием: Statuses, Weekly Control, Shift Master Board и Employee Desktop
  уже имеют Pilot read baseline; Roles immediate assignment и Specifications
  exact-revision work-order локально завершены и больше не перечисляются как
  полностью legacy.
- Оставшиеся frontend-visible команды без безопасного owner на момент этого
  аудита подтверждались кодом: Responsibility Policy lifecycle; Roles `readOnly`,
  multiple/effective-window и personal/assignment scopes; Planning dates/labor;
  Specifications attachment binding/route structure; Gantt dependency editing,
  drag/resize/optimization и Workshop manual lane movement. Responsibility
  Policy lifecycle позднее закрыт отдельным owner checkpoint ниже.
- Остальные next scopes — не frontend implementation: root-gated Pilot read,
  отдельно разрешаемые disposable write/cleanup acceptance и default-on
  решения. Без новой authority их выполнять нельзя.
- Финальная live read-only проверка: Pilot health `ok`, version `v.1.500.03`,
  shared state `ready`. Deploy, flags, targets и Pilot data этим продолжением не
  менялись.
- Implementation checkpoint `2386934` уже был чисто отправлен в origin с
  divergence `0/0`; финальная ledger-синхронизация оформляется отдельным docs
  checkpoint.
- Доказательная оценка остаётся `99.5%` (`+0 п.п.`, осталось `0.5%`), потому что
  финальный аудит исправляет ledger, но не выдаёт внешний owner/approval за
  реализованный React scope.

## Pilot closure continuation 2026-07-20: safe Nomenclature write candidate

- Pilot release `v.1.500.07-5839c94` is healthy and contains the integrated
  Marking Phase 1 demo. A new `v.1.500.08` candidate is prepared locally but is
  not yet a live release.
- The owner explicitly approved a disposable Pilot write evaluation. Live
  authenticated audit still reports Nomenclature `0`, Boards/BOM `0` and
  Responsibility Policies `0`; no non-empty parity claim was made.
- Root enabled the isolated Contour Admin read-only drop-in, but browser
  acceptance is blocked at the external Admin IP perimeter: Caddy returns
  `403 Forbidden` before `/admin-login`. The in-app browser is additionally
  blocked with `ERR_BLOCKED_BY_CLIENT`. No Ops action was invoked. Verify that
  `deactivate-react-contour-admin-evaluation.sh` (or its scheduled rollback)
  removed both Contour Admin flags before any other evaluation.
- The `v.1.500.08` candidate adds an independent root-controlled Nomenclature
  write rollout. It refuses to activate while any other `MES_REACT_*=1` flag is
  effective, keeps the read-only flag off, requires an explicit authenticated
  session request and rechecks `directories:edit` both for capability exposure
  and immediately before command dispatch.
- Full `npm run qa:nomenclature-react-island` is green, including the frozen
  backend guard, production build and disposable `0600` create/edit/legacy
  read-back/cancel/delete lifecycle. The frozen guard only permits the already
  reviewed exact Specifications authority assertion rename from `entryId` to
  `normalizedEntryId`; every other backend-contract diff remains forbidden.
- After deployment, the only permitted live write procedure is: prove all
  evaluation flags off; activate
  `activate-react-nomenclature-write-evaluation.sh`; use one uniquely named
  disposable row in an authenticated `directories:edit` session with
  `react-nomenclature-write-evaluation=1`; verify React and legacy read-back;
  delete that exact ID; prove its absence; immediately run
  `deactivate-react-nomenclature-write-evaluation.sh`; prove health and every
  React rollout flag false. Legacy remains the default and rollback surface.

## Local continuation 2026-07-20: Responsibility Policies owner lifecycle

- The previously documented owner/schema gap is closed locally in the separate
  `v.1.500.09` candidate. Migration
  `026_system_responsibility_policy_lifecycle` adds only
  `is_active BOOLEAN NOT NULL DEFAULT TRUE` and nullable `archived_at`; no
  existing policy is deactivated.
- The PostgreSQL repository persists and hydrates `isActive`, and domain
  preflight now refuses a release that has not applied migration 026. The frozen
  backend guard permits only the exact migration, repository mapping, preflight
  requirement and additive schema assertions.
- Responsibility Policies React now supports lifecycle-neutral create/edit and
  stable-ID-bound two-step archive/reactivation through the existing System
  Domains owner. Missing employees, duplicate masters and stale revisions fail
  closed; reactivation verifies linked active employees and clears `archivedAt`.
- Production-shell QA proves create/edit/archive/reactivate, PostgreSQL revision
  counts, lifecycle persistence, hidden/target preservation, active legacy
  read-back, unchanged temporary `0600` snapshot and clean console. Latest first
  commit: `18.50 ms`; production artifact: `209489 / 65490 / 56527 B`
  raw/gzip/Brotli.
- This is not Pilot acceptance. Migration 026 has not been applied live and the
  Responsibility Policies rollout remains default-off with legacy rollback.

## Pilot closure 2026-07-20: release `.09` and migration 026

- The scheduled Contour Admin rollback completed before the new release: the
  root-owned `91-react-contour-admin-evaluation.conf` drop-in is absent and the
  effective `mes-pilot` environment contains no `MES_REACT_*` flags.
- Release `v.1.500.09-c633b91` is active and healthy. Both activation records
  point to commit `c633b91c710c...`; the explicit rollback target remains
  `v.1.500.07-5839c94`. Local and public health checks report `ok`, application
  version `v.1.500.09` and shared state `ready`.
- The already authorized `mes-pilot-domain-migrate.service` oneshot completed
  successfully and applied `026_system_responsibility_policy_lifecycle.sql`.
  Its final `inactive (dead)` state is the normal completed state for this
  oneshot, not a failure.
- Browser smoke on the public Pilot confirms sidebar version `v.1.500.09`, the
  integrated Marking module inside the existing MES shell, explicit
  `DEMO / MOCK / memory-only` labeling, no horizontal overflow and no console
  warnings or errors. The default Nomenclature route still opens the legacy
  surface with `Новая позиция`; no evaluation flag was enabled and no write was
  made.
- The separately approved disposable Nomenclature create/edit/delete acceptance
  is still blocked before activation: `deploy` cannot execute
  `activate-react-nomenclature-write-evaluation.sh` through non-interactive
  sudo (`sudo: a password is required`). No localhost QA bypass, permission
  weakening, drop-in edit or live write was attempted. A lawful root operator
  must run the prepared activation/deactivation pair before that final live
  write evidence can exist.
- Evidence-based global progress after this block: approximately `99.9%`
  complete (`+0.4 p.p.` from the last `99.5%` checkpoint). The remaining
  approximately `0.1%` is the root-gated disposable Nomenclature lifecycle plus
  its cleanup proof and the subsequent default-on decision. Legacy remains the
  live default and rollback surface; Blueprint is not used.

## Pilot closure 2026-07-20: release `.15` and exact browser-write blocker

- The lawful root boundary is no longer a blocker. Release
  `v.1.500.15-3f173ac` was staged from exact pushed commit
  `3f173acc017477b13777a4fabe53ac77ab3eba7e` with
  `fresh-upstream-fetch` provenance and activated by the standard release
  health/rollback guard. Local and public health are `ok`, shared state is
  `ready`, migration 026 remains applied, and the explicit rollback target is
  `v.1.500.14-6715bd9`.
- The `.15` runtime sends a durable Nomenclature mutation as only the three
  reviewed directory compatibility keys and requests a compact acknowledgement.
  The server preserves unrelated Planning/specification values and returns only
  revision metadata on success or CAS conflict. Full Nomenclature QA, production
  build, runtime rebase QA, endpoint functional QA and `git diff --check` pass;
  the endpoint test proves Planning remains byte-identical.
- Root successfully enabled the isolated Nomenclature write evaluation with a
  20-minute automatic rollback. Exactly
  `MES_REACT_NOMENCLATURE=1` and
  `MES_REACT_NOMENCLATURE_WRITE_EVALUATION=1` were effective. The authenticated
  Technology session mounted the real React create/edit/delete surface on
  `.15`; no localhost QA route or permission bypass was used.
- Live create could not reach the owner endpoint because the only controllable
  browser in this task blocks the same-origin URL
  `https://pilot.mes-line.ru/api/shared-state` with
  `ERR_BLOCKED_BY_CLIENT`. The UI therefore failed closed after six bounded
  attempts. Server evidence agrees: no new Nomenclature audit event, shared
  revision stayed `44701`, and exact article `QA-NOM-202607201435` is absent.
  This is now an exact client-environment blocker, not a root, release, database,
  owner, cleanup or response-size blocker.
- Evaluation was immediately deactivated and its transient rollback timer was
  stopped. No React evaluation drop-in or effective `MES_REACT_*` value remains;
  health is still `ok`, the exact QA match count is `0`, and a fresh `.15`
  Nomenclature route renders legacy with zero rows. Legacy rollback is therefore
  proved after the attempted acceptance.
- The default-on decision is **do not enable yet**. Nomenclature still lacks one
  successful authenticated Pilot create/edit/legacy-read/delete lifecycle, and
  critical modules in the command matrix retain separately gated Pilot write
  acceptance. Keeping all flags off is a deliberate acceptance decision, not an
  unresolved root action.
- Next exact action: repeat the already-authorized lifecycle in a normal browser
  that permits same-origin `/api/shared-state`; verify the created stable ID and
  edit on the server, deactivate to prove legacy read-back, reactivate only long
  enough to delete that same ID, prove zero matches, then deactivate again.
  Do not replay the write with curl, localhost or an unauthenticated API call.
- Evidence-based global progress remains approximately `99.9%` (`+0 p.p.`).
  The final approximately `0.1%` is only the successful browser lifecycle and
  its cleanup proof; no data residue exists. Blueprint is not used.

## Pilot closure continuation 2026-07-20: strict TypeScript and release `.17`

- The React migration previously used esbuild to transpile `136` `.ts/.tsx`
  sources but had no project `tsconfig`, TypeScript compiler or React type
  declarations. A real strict gate is now installed and mandatory:
  `npm run typecheck:react` runs TypeScript `7.0.2` with `strict: true` and
  `noEmit: true`; `qa:stabilize` and the Nomenclature island suite both invoke
  it. The React migration QA guards the compiler, config and script wiring so
  the gate cannot silently disappear.
- The first strict run exposed five real errors. They are fixed without
  widening types or removing rollback: optional `ModulePage.sidebar` now has a
  safe `null` default; Responsibility Policies read models hydrate lifecycle
  status and fail closed for archive capability; Work Centers read models also
  fail closed for archive capability. Strict typecheck, the focused
  Nomenclature/Responsibility Policies/Work Centers suites and the full
  `qa:stabilize` pipeline pass.
- Release `v.1.500.17-3725611` was staged from exact pushed commit
  `3725611de0417cb54480fce73cf92f995b0a2f22` with
  `fresh-upstream-fetch` provenance. The stage produced matching immutable
  source/dist digests; activation passed manifest verification and both health
  gates. Local and public `/healthz` report `ok`, application version
  `v.1.500.17` and shared state `ready`. Chrome also renders sidebar version
  `.17` in the real Pilot MES shell.
- The active release record retains the explicit rollback target
  `/srv/mes/pilot/releases/v.1.500.16-2687058/app`. The service is active, both
  Nomenclature and Contour Admin evaluation drop-ins are absent, and the
  effective service environment contains no `MES_REACT_*` flags. Migration
  service evidence still records applied
  `026_system_responsibility_policy_lifecycle.sql`; the `.17` server preflight
  also passed its required-migration gate.
- A disposable owner-backed record now exists from the successful normal-Chrome
  create/edit acceptance: stable ID `nom-df67ec7e`, article
  `QA-NOM-CU-20260720-2307`, shared revision `44704`. The exact row is visible
  after a full `.17` reload and authoritative shared-state inspection confirms
  one match. Its legacy delete dialog reports zero specification and BOM
  references, but deletion was cancelled because permanent deletion requires
  explicit action-time confirmation and the required React delete evaluation
  cannot currently be activated by `deploy`.
- The remaining blocker is exact and operational: no activation systemd unit
  exists, `deploy` is not allowed to run the root-only
  `activate-react-nomenclature-write-evaluation.sh`, and the current sudo
  allowlist does not include that script. Do not use Docker membership,
  localhost QA, direct shared-state edits or default-on flags to bypass this
  boundary. A lawful root operator must activate the prepared evaluation; then
  delete only `nom-df67ec7e` in the authenticated React surface, prove zero
  matches in shared state, and immediately run the paired deactivation script.
- Evidence-based global progress is `99.95%`. The remaining `0.05%` is the
  root-gated React delete plus cleanup proof and the final default-on decision.
  Legacy remains the live default and explicit rollback surface. No Blueprint
  UI dependency or design was introduced.

## Final Pilot acceptance 2026-07-21: Nomenclature lifecycle and cleanup

- A lawful root session activated only the prepared Nomenclature write
  evaluation on active release `v.1.500.17-3725611`. Effective environment was
  exactly `MES_REACT_NOMENCLATURE=1` plus
  `MES_REACT_NOMENCLATURE_WRITE_EVALUATION=1`; service health remained `ok`,
  version `.17`, shared state `ready`.
- Normal Chrome authenticated as the Technology test employee and mounted the
  real `React · create/edit/delete evaluation` surface. It read back the exact
  previously created/edited stable record `nom-df67ec7e` / article
  `QA-NOM-CU-20260720-2307` through the production owner boundary.
- After explicit action-time confirmation, React deleted only that disposable
  record through the existing legacy owner command. The React surface changed
  from one row to zero. Authoritative shared-state revision advanced from
  `44704` to `44705`; exact ID matches and exact article matches are both zero.
  Total Pilot Nomenclature returned to its original zero-row baseline.
- Root immediately ran the paired deactivation script. The evaluation drop-in
  is absent, the effective service environment contains no `MES_REACT_*`
  values, and both local and public health report `ok`, `.17`, `ready`.
  Reloading the same URL while retaining the evaluation query parameter renders
  the legacy Nomenclature surface with zero rows, proving server-side fail-close
  and rollback rather than relying on URL cleanup or browser state.
- The immutable active-release record remains `.17` at exact commit
  `3725611de0417cb54480fce73cf92f995b0a2f22`; explicit rollback remains
  `/srv/mes/pilot/releases/v.1.500.16-2687058/app`. No unrelated Pilot record,
  PostgreSQL schema, release artifact or Ops surface was changed.
- Final default-on decision: **do not enable automatically in this closure**.
  The current permanent feature flag would mount React read UI without granting
  permanent writes; edit actions would intentionally fall back to legacy and
  recreate the layout switching already observed by the owner. A future
  default-on cutover therefore needs its own explicit production-write policy
  and user-facing rollout decision. This is not missing migration
  implementation or failed Pilot acceptance; it is the retained reversible
  rollout boundary required by this handoff.
- The scoped React + TypeScript migration implementation and its authorised
  Pilot acceptance are now `100%` complete. Legacy rollback is preserved and no
  Blueprint UI dependency or design is used.

## Actual full-cutover checkpoint 2026-07-21: permanent Diagnostics and release `.21`

The preceding `100%` statement is retained as historical evidence for the
scoped Nomenclature/island closure only. It must not be used as the percentage
of the global MES Line React cutover. The executable full-scope accounting now
records an honest `50%`: typed scope `14`, functional parity `18`, Pilot
acceptance `9`, permanent runtime `2`, legacy consolidation `2`, quality
controls `5`.

- At this permanent-acceptance checkpoint the Pilot release was
  `v.1.500.21-8fb92d9`, immediate previous was
  `v.1.500.20-a4d8b2f`, and pinned legacy baseline is
  `v.1.500.18-93d02ed`. Local/public health are `ok` and shared state is
  `ready`.
- Runtime policy permanently enables exactly `structureMigrationDiagnostics`
  and `weeklyProductionControl`. No evaluation drop-in, active evaluation
  surface or effective `MES_REACT_*` evaluation value remains.
- Authenticated Diagnostics desktop acceptance reached `ready`/`react` with
  `aria-busy=false`, `152 x 5`, 51 source fields, metrics
  `152 / 76 / 19 / 49 / 0 / 0`, four issue groups including two ignored rows,
  seven registry links, zero inputs/write controls, no page overflow, query
  isolation and no accessible browser warning/error. Employees remained a
  76-row legacy registry; Org Units and an invalid registry value canonicalized
  to the 19-row Org Units registry.
- Diagnostics narrow Pilot is not accepted or rejected: the controllable
  platform could not resize the authenticated tab. Do not convert this
  limitation into a responsive-pass claim.
- Weekly `.21` desktop recheck reached `ready`/`react`, cleared `aria-busy`,
  retained `25 x 11`, exposed no input/write control or page overflow, preserved
  query isolation and produced no accessible warning/error. Weekly narrow
  remains historical accepted evidence from `.19`, not a new `.21` narrow run.
- Exact immutable rollback/reactivation chain:
  `.21 -> .20 -> .21 -> .18 -> .19 -> .20 -> .21`. Exact `.20` reproduced its
  known Diagnostics `aria-busy=true`; `.18` exposed zero React surfaces,
  canonical 19-row legacy Org Units for the Diagnostics deep link and legacy
  Weekly `25 x 11`. Final state is `.21` active, `.20` previous, `.18` pinned
  legacy, with no evaluation residue and no Pilot write.

This block raises permanent/current-release coverage from `1/24` to `2/24` and
global progress from `49%` to `50%`. It does not make the top-level
`productionStructureMatrix` production-ready: its six writable registries still
use normal legacy paths and require their own Pilot lifecycle and permanent
cutover evidence. Blueprint UI remains absent and the immutable legacy rollback
is preserved.

## Nomenclature command-owner Foundation checkpoint 2026-07-21

Release candidate `v.1.500.22` adds the fail-closed foundation needed for an
authenticated, RBAC-gated Nomenclature server command owner: additive migration
`027_employee_auth_credentials.sql`, signed scoped employee sessions,
create/update/delete idempotency and CAS, authoritative projection refresh,
root-managed evaluation/rollback scripts and focused browser/architecture QA.
The normal Pilot login remains the perimeter; employee PIN elevation is scoped
to a write session and does not replace it.

This candidate is deliberately **evaluation-only**. Nomenclature, Nomenclature
Types, Boards/BOM and Specifications still share one legacy Directory JSON
projection. Enabling Nomenclature command-primary permanently before all
writers in that cluster have server owners would either block legitimate
adjacent writes or allow an unsafe split authority. Therefore the release
policy keeps `nomenclature: evaluation`, the accepted permanent policy remains
exactly the `.21` policy, and no candidate/default-on evidence is recorded in
the cutover ledger.

The next lawful step is a controlled `.22` Pilot evaluation only: stage and
activate the immutable release, apply migration 027, provision a disposable
employee credential through root-private files, enable the coordinated auth +
command-owner + React evaluation stack, complete one disposable
create/edit/reload/delete/zero-cleanup lifecycle, then deactivate the whole
stack and prove that all flags/drop-ins are absent. This evidence validates the
Foundation but must not raise the global percentage by itself. Permanent
Nomenclature cutover remains blocked until Nomenclature Types, Boards/BOM and
all Specifications/cross-writer paths use the same authoritative command
kernel. Legacy release rollback remains pinned and Blueprint UI is not used.

## Nomenclature Foundation Pilot acceptance 2026-07-21: release `.25`

The Foundation procedure described above is now complete on the real Pilot.
Current live release is `v.1.500.25-1f8369c` at exact commit
`1f8369cb6725a53e029acd0d66d57a764289a79d`; activation record points to
`v.1.500.24-200ba06` as immediate rollback and retains
`v.1.500.18-93d02ed` as the pinned immutable legacy baseline. Local/public
health are `ok`. Runtime policy SHA-256 remains
`bf7af8065ad83206742725a003c5cc11f6eefaf21b314220f45f6c24480674b4`
and permanently exposes only `structureMigrationDiagnostics` and
`weeklyProductionControl`.

- Clean release QA exposed and fixed three real production gaps before final
  acceptance: missing preview-runtime owner wiring (`6684534`), ESM symlink
  entrypoint handling in the root credential CLI (`200ba06`), and the
  five-second capability-cache race in outer and inner React dispatch
  prechecks (`1755e83`, regression coverage `1f8369c`).
- Authenticated employee elevation then created exactly one disposable row:
  ID `nom-70a3f62d-93d0-46d3-b012-2c56def8e0d7`, article
  `MOCK-QA-V25-20260721-0740`, initial name
  `MOCK QA Номенклатура v25 20260721-0740`.
- Authoritative owner read-back proved that exact row. Edit changed its name to
  `MOCK QA Номенклатура v25 EDIT 20260721-0740`; full reload and server owner
  read-back proved the edited value persisted.
- Create, edit and delete were each deliberately attempted after more than five
  seconds. Every command succeeded once, proving the capability refresh fix in
  the real Pilot rather than only in local QA.
- Delete impact was exactly zero Specifications and zero BOM rows. After the
  explicit destructive confirmation, UI and owner read-back both returned to
  zero total Nomenclature rows, zero exact ID matches and zero exact article
  matches.
- Root disabled the complete evaluation stack. Effective `MES_REACT_*`
  evaluation values and managed evaluation drop-ins are absent; rollback timer
  is inactive; the temporary employee credential is deleted; sessions are
  revoked; remote/local PIN files are gone; normal Nomenclature again uses the
  legacy-default path.

This closes the Nomenclature command-owner Foundation block at 100%, but adds
zero global cutover points: the evidence is temporary evaluation, not permanent
default-on. Honest global progress remains `50%`. The next block must put
Nomenclature Types, Boards/BOM and every Specifications/background writer on
one atomic Directory command boundary before any cluster-wide permanent
rollout. Legacy rollback is preserved and Blueprint UI remains absent.

## Current Weekly consolidation acceptance 2026-07-21: release `.26`

This is the authoritative current-state block. The `.21` Diagnostics and `.25`
Nomenclature sections above remain unchanged historical evidence.

- Active Pilot release is `v.1.500.26-097d66c` at exact source commit
  `097d66c416ef61e091099c63b8bc272841c364f5`; immediate previous is
  `v.1.500.25-1f8369c`, and pinned legacy is
  `v.1.500.18-93d02ed`.
- Manifest provenance is exact: source tree
  `5e18604248301baac1226a16f7107efb88ad699687efc85a6c2d8c1853197845`, dist
  tree `af65df86efa81557f3d2f5d4a805d1c1da9f40f57b0a4ee8d7ad5b3bcd1485d2`.
  Local/public health are `ok`, shared state is `ready`, evaluation residue is
  zero and command-owner hashes are unchanged from `.25`.
- Weekly now builds its typed production read-model without a normal dependency
  on the legacy Weekly runtime. Legacy remains lazy-loadable only through the
  explicit rollback selector.
- Authenticated `.26` browser acceptance reached React `ready`,
  `aria-busy=false` and exact `25 x 11`; every row text matched immutable `.25`.
  The live DOM/error state was clean. Live-console capture was unavailable and
  query-isolation was not repeated, so neither is claimed as fresh `.26`
  evidence.
- The real immutable drill was `.26 -> .25 -> .26`, with exact Weekly rows after
  rollback and reactivation. Legacy `.18` was resolved only by dry-run, showed
  zero React surfaces in its pinned manifest and was not activated.
- Weekly is read-only: `pilotWrite` and cleanup remain `not-applicable`. No
  application record was created, edited or deleted.
- Fresh current-release browser acceptance is `1/24` (Weekly only). Historical
  Pilot reads remain `21/24`; historical write lifecycles remain `1/22`
  (Nomenclature `.25`). Diagnostics remains historical `.21` browser evidence.

The evidence-weighted global result is exactly **50%** with vector
`14 / 18 / 9 / 2 / 2 / 5`. Main integration is the complete range
`aca289f..codex/main-weekly-evidence-port`, including hotfix commit `813fabe`,
evidence commit `fb38100` and the current-truth docs reconciliation at branch
HEAD. Commit `33d7859` was not cherry-picked because its core is already present
in main through `0354fda`. No push or deploy of the main-port branch has been
performed. Legacy rollback is preserved and Blueprint UI is not used.

## Accelerated Marking Phase 1 checkpoint 2026-07-22: release `.47`

This block supersedes earlier statements that Marking is memory-only and is
the authoritative current live Pilot pointer. It does not supersede the
strict accepted-evidence baseline above.

- Active Pilot candidate is `v.1.500.47-37f7ecb` at exact commit
  `37f7ecb4e99507071b67903d3e69651610fa7ebd`; immediate previous is
  `v.1.500.46-7a359c4` and pinned legacy remains
  `v.1.500.18-93d02ed`.
- Source/dist SHA-256 are
  `ede2f4841449e81454c31dc57d718d0fca6fdbbc94ec8dac18e9c8d743ec84f5` and
  `bf87595aa648c54375d9965016400a51602f5c587042733148278ec3f99b1b8e`.
- Migration `035_marking_phase1_prototype` completed with systemd
  `Result=success`, exit `0`; the marker count is `1` and exactly seven
  `marking_phase1_*` tables exist.
- Local/public health report `ok`, version `v.1.500.47`, shared state `ready`,
  no active evaluation surfaces and no effective `MES_REACT_*` flags.
- Normal Marking routing is React + TypeScript and fail-closed without legacy
  fallback. A typed host port calls `/api/v1/marking`; PostgreSQL stores only
  explicit `test-state` / `testData:true` rows. Configure, add kits/codes,
  print/confirm/error/reprint, complete, transfer/cancel and code lookup are
  implemented. Existing production SZN, routes, statuses and history are not
  mutated.
- The visible module marker is `REACT + TS · PHASE 1`; it is deliberately not
  the global `React TS` completion marker. Production traceability, printer
  outbox, employee-RBAC acceptance and a live lifecycle remain open.
- Accelerated implementation is now `99%`; evidence-weighted acceptance stays
  exactly `50%` because browser/visual and authenticated lifecycle QA were
  explicitly deferred.
- Previous-release dry-run resolves `.46` successfully. Pinned legacy `.18`
  remains immutable and its manifest verifies, but direct dry-run is currently
  blocked until the active Specifications 2 Work Orders/publication command
  owners (and any subsequent incompatible owners reported by the guard) are
  deliberately deactivated. Do not bypass this guard.
- No visual/browser tests were run in this accelerated block. TypeScript,
  syntax, Marking contract QA, cutover QA, runtime-policy QA, deterministic
  build and diff checks passed. Blueprint UI was not introduced.

## Accelerated mixed-runtime cut 2026-07-22: release `.48`

This block supersedes `.47` only as the current live Pilot pointer. It does not
claim browser or write-lifecycle acceptance and therefore does not replace the
strict accepted-evidence baseline.

- Active Pilot is `v.1.500.48-e02dbb0` at commit
  `e02dbb0dd78fbdeb34457feb411f7877eb7acf11`; source/dist SHA-256 are
  `2357701b920506ddd39e3a6e150199f1efecfd864d051655123b0616e22e3b12` and
  `bb224f2115bee1b77fe7b079340926f55633432ea97e7565250817a406ede4d9`.
  Immediate previous is `v.1.500.47-37f7ecb`; pinned legacy remains
  `v.1.500.18-93d02ed`.
- Public health is `ok`, version is `v.1.500.48`, shared state is `ready`,
  runtime-policy SHA is
  `38bfa8a0a5cddacc7f550b53d15fdf84a7fbbb8bb3c9c620a598d4d7b592cd8c`,
  and active evaluation surfaces are empty. The service is active/running and
  `/srv/mes/pilot/app` resolves to the `.48` release.
- Current runtime no longer imports or renders the legacy Shift Work Orders,
  Timesheet or Contour Admin renderers. Their existing `React TS` completion
  markers remain the visible completion marker. A React failure stays inside
  a fail-closed shell; operational rollback is the previous immutable release.
- Shift Work Orders now shares one active TypeScript production model between
  the React island and journal consumers. Auth role resolution no longer comes
  from the Products renderer. Server-configured Nomenclature Types skips its
  legacy delete-usage calculation.
- Gantt now supports owner-backed same-lane drag of slot start and bounded
  PostgreSQL projection refresh. Planning and Roles expose typed controls for
  their deferred commands but keep capabilities `false` until PostgreSQL
  owners exist. Specifications 2 enables existing-revision publication and
  work-order creation through server owners while mutable draft, first
  publication, routes and attachment binding remain partial/fail-closed.
- Marking cleanup was run in dry-run mode only and reported zero tasks, kits,
  codes, print batches/items, audit events and command requests. No production
  or test rows were deleted.
- Rollback dry-run to immediate previous `.47` passed with verified manifest,
  exact version and policy. Pinned legacy `.18` remains immutable; its known
  command-owner compatibility guard must still be respected rather than
  bypassed.
- Reduced nonvisual verification passed: strict React TypeScript, recursive
  syntax, cutover/completion policy, runtime policy including built dist,
  narrow module owner tests, Marking contract, deterministic build and
  `git diff --check`. Browser/visual tests were deliberately skipped. Blueprint
  UI was not introduced.
- Accelerated implementation remains `99%`; strict accepted evidence remains
  `50%`. There are 11/16 top-level modules and 21/26 audited surfaces with the
  complete React marker. Partial modules are Specifications 2, Planning, Gantt,
  Roles and Marking.

## Accelerated mixed-runtime cut 2026-07-22: release `.49`

This block supersedes `.48` as the live Pilot pointer, but deliberately does
not claim browser, visual or authenticated lifecycle acceptance.

- Active Pilot is `v.1.500.49-df23074` at exact commit
  `df23074faf0343e4b6e9c42b231ce452e1bb2c07`; immediate previous is
  `v.1.500.48-e02dbb0` and pinned legacy remains
  `v.1.500.18-93d02ed`.
- Source/dist SHA-256 are
  `39283e43a8b643c6fc764c273917587c538e32461a009078c069c7f22567b751` and
  `0bcf8b3115adf980295eb4fbff18bee51f19ca386386e6e34721a73171576b55`.
  Git provenance is `fresh-upstream-fetch`; the accelerated stage performed
  strict TypeScript, recursive syntax, cutover/runtime-policy gates and two
  deterministic production builds.
- Local/public health report `ok`, version `v.1.500.49`, shared state `ready`,
  runtime-policy SHA
  `38bfa8a0a5cddacc7f550b53d15fdf84a7fbbb8bb3c9c620a598d4d7b592cd8c`,
  and zero active evaluation surfaces. `mes-pilot.service` is active and the
  release pointer resolves to `.49`.
- Current runtime no longer imports, loads, renders or binds the legacy
  `Weekly Production Control`, `Nomenclature/Boards`, `Authorization` or
  `Employee Desktop` renderer/event paths. All five routes render their
  fail-closed React hosts. Existing API/command owners, RBAC, signed employee
  session and the `bomLists` deep link were retained.
- Feature/module ownership metadata now identifies React hosts and TypeScript
  scenarios. Complete modules retain the visible `React TS` marker. Large
  legacy renderer files remain only as unreachable checkout artifacts for a
  later bounded deletion; rollback is the previous immutable release rather
  than a same-release UI fallback.
- Immediate previous `.48` passed rollback dry-run without changing the live
  pointer. Pinned legacy `.18` manifest remains valid, but its dry-run was
  correctly blocked by active Specifications 2 attachments, Work Orders and
  publication command-owner drop-ins. The compatibility guard was not
  bypassed.
- Browser/visual QA was deliberately skipped. Implementation remains `99%`
  and strict accepted evidence remains `50%`; this release records code and
  runtime consolidation, not final product acceptance. Blueprint UI was not
  introduced.

## Physical retired-renderer cleanup 2026-07-22: release `.50`

This block supersedes `.49` as the live Pilot pointer. It deletes source
artifacts only after `.49` proved that the current routes no longer reach them.

- Active Pilot is `v.1.500.50-8e8a384` at exact commit
  `8e8a38431119f7612ca6f8b3733725b848f45605`; immediate previous is
  `v.1.500.49-df23074` and pinned legacy remains
  `v.1.500.18-93d02ed`.
- Source/dist SHA-256 are
  `cec1413eef1b4f2a847cac25d7cc5d30fd250ce5a1a893630abf60edd65dfc65` and
  `b8c436e4aa9561e27a2eef147a314781d5643bdae60276ca167bad4632ffca5b`.
  Git provenance is `fresh-upstream-fetch`; accelerated staging passed strict
  TypeScript, recursive syntax, cutover/runtime-policy gates, server preflight
  and two deterministic production builds.
- Local/public health report `ok`, version `v.1.500.50`, shared state `ready`,
  policy SHA
  `38bfa8a0a5cddacc7f550b53d15fdf84a7fbbb8bb3c9c620a598d4d7b592cd8c`,
  and zero active evaluation surfaces. Service and release pointer resolve to
  `.50`.
- Deleted from the current source tree: Auth renderer/events (2,096 lines),
  Nomenclature renderer (553 lines) and Weekly Production Control renderer
  (700 lines), for 3,349 retired legacy source lines total. Contract tests now
  target React production models/owners and assert physical artifact removal.
- The generated icon registry dropped only `camera` and
  `pin-backspace-apple`, both orphaned by deletion of the Auth renderer. An
  initial stage of `v.1.500.50-96e1613` was correctly refused because the
  build changed this tracked generated registry. The generated output was
  committed, a new immutable release ID was used, and the refused candidate
  was never activated.
- Immediate previous `.49` passed rollback dry-run without changing the live
  pointer. Operational rollback remains immutable-release switching; no
  same-release legacy renderer was reintroduced.
- Browser/visual QA was deliberately skipped. Implementation remains `99%`
  and strict accepted evidence remains `50%`. Blueprint UI was not introduced.

## Completed-module fallback cut 2026-07-22: release `.51`

This block supersedes `.50` as the live Pilot pointer. It removes same-release
legacy UI fallback from modules that already carry complete React markers,
without upgrading any partial module to complete.

- Active Pilot is `v.1.500.51-6ec4524` at exact commit
  `6ec45246b1e87b166948a819270e2a2ae9810f1b`; immediate previous is
  `v.1.500.50-8e8a384` and pinned legacy remains
  `v.1.500.18-93d02ed`.
- Source/dist SHA-256 are
  `436a9a9be80d67b1d071d57de1f71e58ab6f391d4742752de62ed8570b3ba7b6` and
  `6ff1ce0eb27c9c234c0f5c12c1e654d774f3a293137f1e500f476a08ed7a0025`.
  Git provenance is `fresh-upstream-fetch`; accelerated staging passed strict
  TypeScript, recursive syntax, cutover/runtime-policy gates, module contract
  QA, server preflight and two deterministic production builds.
- Local/public health report `ok`, version `v.1.500.51`, shared state `ready`,
  runtime-policy SHA
  `38bfa8a0a5cddacc7f550b53d15fdf84a7fbbb8bb3c9c620a598d4d7b592cd8c`,
  and zero active evaluation surfaces. `mes-pilot.service` is active and the
  release pointer resolves to `.51`.
- Shift Master Board, all four Directories sections and all seven Production
  Structure registries now return fail-closed React targets from their current
  routes. Legacy modal/bind/action fallback bridges were removed. Existing
  server owners, RBAC, navigation, print/fact behavior and complete markers
  remain in place.
- `requestLegacyRender` usage in `src/app.js` fell from 17 to 5. The five
  remaining bridges belong only to partial Planning, Marking, Specifications
  2, Gantt and Roles surfaces. Large Shift Master/Production Structure source
  files remain solely where shared models, helpers or compatibility QA still
  consume them; the current UI routes do not load their legacy renderers.
- Immediate previous `.50` passed rollback dry-run without changing the live
  pointer. Operational rollback remains immutable-release switching; the
  pinned `.18` baseline is preserved.
- Browser/visual QA was deliberately skipped. Implementation remains `99%`
  and strict accepted evidence remains `50%`. Blueprint UI was not introduced.

## Partial-module fail-closed cut 2026-07-22: release `.52`

This block supersedes `.51` as the live Pilot pointer. It removes ordinary UI
fallback where the missing parity can be expressed explicitly inside React,
without misclassifying any partial module as complete.

- Active Pilot is `v.1.500.52-ee9cfd5` at exact commit
  `ee9cfd5f3083e5b7e417736a54f925bb148e20ab`; immediate previous is
  `v.1.500.51-6ec4524` and pinned legacy remains
  `v.1.500.18-93d02ed`.
- Source/dist SHA-256 are
  `7c2589795b93905b817496c3a0a3fab00dfc8de10479e257f8742a180b42ceee` and
  `2e421fcb6262b89bc790ddd310faa32998f482d6ad77738857b4c9b868895d80`.
  Git provenance is `fresh-upstream-fetch`; accelerated staging passed strict
  TypeScript, recursive syntax, cutover/runtime-policy gates, targeted module
  contracts, server preflight and two deterministic production builds.
- Local/public health report `ok`, version `v.1.500.52`, shared state `ready`,
  runtime-policy SHA
  `38bfa8a0a5cddacc7f550b53d15fdf84a7fbbb8bb3c9c620a598d4d7b592cd8c`,
  and zero active evaluation surfaces. `mes-pilot.service` is active and the
  release pointer resolves to `.52`.
- Planning and Marking routes now always return fail-closed React targets.
  Planning's renderer and selection helpers were physically removed (2,155
  source lines). Labor, initial Gantt transfer and cancellation remain
  explicitly disabled with `owner-unavailable` until PostgreSQL owners exist.
  Marking no longer imports its in-memory mock client into the production
  island; the module remains partial because its backend is isolated
  `marking_phase1_*` test-state, not production assignments/traceability/print.
- Roles gained an owner-backed immediate second-role add through the existing
  PostgreSQL access-control aggregate, with exact assignment-set, stable-ID,
  duplicate, employee RBAC, self-mutation, window and scope guards. Effective
  windows, responsibility scopes and durable `readOnly` persistence remain
  fail-closed; Roles stays partial.
- `requestLegacyRender` usage in `src/app.js` fell from 5 to 3. The remaining
  bridges belong only to partial Specifications 2, Gantt and Roles. Completion
  markers were not promoted.
- Immediate previous `.51` passed rollback dry-run without changing the live
  pointer. Operational rollback remains immutable-release switching and the
  pinned `.18` baseline is preserved.
- Browser/visual QA was deliberately skipped. Implementation remains `99%`
  and strict accepted evidence remains `50%`. Blueprint UI was not introduced.

## Gantt and Specifications 2 legacy retirement 2026-07-22: release `.53`

This block supersedes `.52` as the live Pilot pointer. It removes both
remaining Gantt/Specifications 2 same-release UI fallbacks without promoting
either partial module to complete.

- Active Pilot is `v.1.500.53-a82f24e` at exact commit
  `a82f24e0011a471264c7dec49355bd21e99d353f`; immediate previous is
  `v.1.500.52-ee9cfd5` and pinned legacy remains
  `v.1.500.18-93d02ed`.
- Source/dist SHA-256 are
  `f9f2d462ca9cb48e6a697d95447925e7abd98c453e6821cbee708888db7f8f9f` and
  `bbe83cd0a8ce14b723237b1802dff2173903f6bc83e65bbe4563d773ff606bc2`.
  Git provenance is `fresh-upstream-fetch`; the release manifest, root seals,
  service pointer and activation record all resolve to the same commit.
- Local/public health report `ok`, version `v.1.500.53`, shared state `ready`,
  policy SHA
  `38bfa8a0a5cddacc7f550b53d15fdf84a7fbbb8bb3c9c620a598d4d7b592cd8c`,
  and zero active evaluation surfaces. `mes-pilot.service` is active and the
  release pointer resolves to `.53`.
- Deleted runtime source: `gantt_runtime/render.js` (5,850 lines),
  `gantt_runtime/lazy_facade.js` (46), `specifications2/render.js` (4,019)
  and `specifications2/publish_flow.js` (195), or 10,110 retired runtime lines.
  The normal Gantt and Specifications 2 routes are permanent React/fail-closed.
  `requestLegacyRender` in `src/app.js` fell from three to one; Roles owns the
  last remaining bridge.
- Gantt now validates exact projection slot identity/revision, forces
  PostgreSQL projection read-back, persists safe display navigation, restores
  selected/active routes and exposes explicit ownerless actions instead of
  falling back. It stays `PARTIAL` until dependency edit, resize, working-
  calendar recalculation and optimization have real server owners.
- Specifications 2 now prepares the canonical N+1 revision and exact draft
  fingerprint before mutation, suppresses the compatibility snapshot ACK,
  and requires forced PostgreSQL read-back of the exact new revision. It stays
  `PARTIAL`: historical local-vs-PostgreSQL relational-digest parity and the
  remaining mutable owner surfaces are not claimed.
- Shared React `Panel` now emits a direct `PanelBody`, so React screens obey
  the same MES UI contract. Broad browser gates now build and inspect the
  release `dist` instead of trying to execute raw TypeScript imports in Chrome;
  their Gantt checks wait for the asynchronous island/runtime mount.
- Strict React TypeScript, recursive syntax, cutover/runtime policy, Gantt and
  Specifications 2 model/owner/runtime QA, boot QA, deterministic build,
  built-dist policy and narrow production-shell module smoke all passed.
  Visual snapshots and authenticated Pilot lifecycle were deliberately not
  run. The full all-modules smoke has a separate pre-existing Planning empty-
  fixture failure; do not misclassify it as a `.53` Gantt/Specifications 2
  regression.
- Immediate previous `.52` passed rollback dry-run. The pinned legacy `.18`
  manifest remains valid, but a direct legacy-baseline dry-run is correctly
  blocked while these PostgreSQL command owners are ON:
  `50-specifications2-attachments.conf`,
  `63-specifications2-work-orders.conf`, and
  `64-specifications2-publication.conf`. A real legacy drill must first run the
  active sealed release's root-owned deactivation scripts under the rollout
  lock:
  `ops/postgres/deactivate-specifications2-attachments.sh`,
  `ops/postgres/deactivate-specifications2-work-orders.sh`, and
  `ops/postgres/deactivate-specifications2-publication.sh`. Do not bypass the
  compatibility guard.
- Implementation remains `99%`; strict accepted evidence remains `50%`.
  Blueprint UI was not introduced.

## Roles legacy retirement 2026-07-22: release `.54`

This block supersedes `.53` as the live Pilot pointer and removes the final
app-level same-release legacy-render callback without claiming a missing
access-control write owner.

- Active Pilot is `v.1.500.54-48ee37f` at exact commit
  `48ee37f8d72363180f53c0e6bb595cdddc3b07b4`; immediate previous is
  `v.1.500.53-a82f24e` and pinned legacy remains
  `v.1.500.18-93d02ed`.
- Source/dist SHA-256 are
  `b0022836ac6be0457593385e85bf661a2ee24ce28596d1afb4918b033391044b` and
  `d62be48181b52b632fde64a7203d1925b6bd3af07df9c3a128985f451a833f86`.
  Git provenance is `fresh-upstream-fetch`; staging and activation resolved
  the same sealed commit and runtime-policy SHA
  `38bfa8a0a5cddacc7f550b53d15fdf84a7fbbb8bb3c9c620a598d4d7b592cd8c`.
- Local/public health report `ok`, version `v.1.500.54`, shared state `ready`,
  zero active evaluation surfaces and zero runtime legacy surfaces. The
  service is active and `/srv/mes/pilot/app` resolves to `.54`.
- Deleted production compatibility source:
  `src/modules/access_roles/render.js` (672 lines) and `service.js` (225), plus
  their lazy loader, event binder and obsolete local writers. Mocked browser
  PUT/readback QA and the deleted legacy Roles functional QA were retired.
  The complete cut removes 2,597 lines and adds 293 focused React/server-
  contract lines.
- `src/app.js` now has zero `requestLegacyRender` definitions. Roles always
  renders the React fail-closed target. The full typed public command port is
  preserved, but every client write is classified `serverBlocked`: the real
  server still rejects `access-control` until bounded delta invariants, actor
  authorization and durable `readOnly`/effective-window/scope storage exist.
  The module remains honestly `PARTIAL`, `productionReady:false`.
- All three broad asynchronous smoke gates now wait for the Roles island
  `ready` commit and a `hard-v1` `ModulePage`, preventing the loading shell
  from being accepted as module coverage. Independent review returned GO.
- Strict React TypeScript, recursive syntax (621 JS/MJS files), Roles
  classification/runtime/domain/authorization gates, deterministic build,
  cutover ledger, built-dist runtime policy, UI contract, feature registry and
  `git diff --check` passed. Visual/browser acceptance was deliberately not
  run under the accelerated profile.
- Immediate previous `.53` passed rollback dry-run. The sealed legacy `.18`
  manifest also verifies, but its switch remains correctly blocked by the
  active Specifications 2 attachments/Work Orders/publication command owners;
  do not bypass this compatibility guard.
- Implementation remains `99%`; strict accepted evidence remains `50%`.
  Blueprint UI was not introduced.

## Shift Master Board legacy retirement 2026-07-22: release `.55`

This block supersedes `.54` as the live Pilot pointer and removes the orphaned
same-release Workshop renderer without changing the permanent React route or
its PostgreSQL command owners.

- Active Pilot is `v.1.500.55-6b14e93` at exact commit
  `6b14e93a71fd365f655f1b47af738cbfd02a1652`; immediate previous is
  `v.1.500.54-48ee37f` and pinned legacy remains
  `v.1.500.18-93d02ed`.
- Source/dist SHA-256 are
  `9547157f7303d66b6cfebf63f1ea1d4b731619ab988d23eb4b29db362e16b93a` and
  `a10e22aedc199025ef74dbc257c159d78ab30d548854a77b9a45bfbff0d7c016`.
  Runtime-policy SHA remains
  `38bfa8a0a5cddacc7f550b53d15fdf84a7fbbb8bb3c9c620a598d4d7b592cd8c`.
- Local/public health report `ok`, version `v.1.500.55`, shared state `ready`,
  zero active evaluation surfaces and zero runtime legacy surfaces. The
  service is active, `/srv/mes/pilot/app` resolves to `.55`, no effective
  `MES_REACT_*` variables or evaluation drop-ins exist, and the retired
  renderer is absent from the sealed release.
- `src/modules/shift_master_board/render.js` (3,818 lines), its dead factory/
  loader and two renderer-specific browser QA scripts were physically
  removed. The complete cut deletes 5,425 lines and adds 118 focused owner,
  policy and registry lines.
- The normal route still always returns the fail-closed React target with the
  `React TS` completion marker. Shared consumers now read the command-owner
  production model; the sidebar badge counts `intake` rows from `allRows` or
  `rows` instead of the retired renderer's `lanes` projection. Quantity/date
  normalization and assignment/fact/carryover server owners retain parity.
- Strict React TypeScript, recursive syntax, runtime policy, command owner,
  server command/bridge, carryover lifecycle, feature registry, UI contract,
  deterministic build, mixed-runtime gate and `git diff --check` passed.
  Two independent reviews returned GO with P0/P1 = 0. Visual/browser QA was
  deliberately skipped under the accelerated profile.
- Immediate previous `.54` passed rollback dry-run. The sealed legacy `.18`
  manifest verifies, while its switch remains correctly blocked by active
  Specifications 2 attachments/Work Orders/publication command owners; do not
  bypass that compatibility guard.
- Implementation remains `99%`; strict accepted evidence remains `50%`.
  Blueprint UI was not introduced.

## Routes legacy retirement 2026-07-22: release `.56`

This block supersedes `.55` as the live Pilot pointer and removes an orphaned
Routes UI layer while preserving the still-live route event owner.

- Active Pilot is `v.1.500.56-238c5c4` at exact commit
  `238c5c4741f7d218069e8bcd85a6ba6e79fcec15`; immediate previous is
  `v.1.500.55-6b14e93` and pinned legacy remains
  `v.1.500.18-93d02ed`.
- Source/dist SHA-256 are
  `446f86a4d29de7c0e61702146be336fd62d20485c75d972ee6dfed18fd3f37d8` and
  `145e1e5df4b5d8267bf9a59bf1c3b8adc238edc420627c40ec979c86f3edaa9b`;
  runtime-policy SHA remains
  `38bfa8a0a5cddacc7f550b53d15fdf84a7fbbb8bb3c9c620a598d4d7b592cd8c`.
- Local/public health report `ok`, version `v.1.500.56`, shared state `ready`,
  zero active evaluation/legacy surfaces and no effective `MES_REACT_*`
  flags. The service is active and `/srv/mes/pilot/app` resolves to `.56`.
- `src/modules/routes/render.js` (1,955 lines), its dead app loader/factory,
  and the orphaned `directory_presentation.js` (273 lines) were physically
  removed. The complete cut deletes 2,572 lines and adds 81 focused owner,
  navigation, generator and contract lines. The live `routes/events.js`
  dynamic single-flight loader remains present in the sealed release.
- Exact `getRouteTaskTypeLabel` precedence moved to the operational production
  owner. A Planning failure can no longer navigate to the retired `routes`
  module; it stays in Planning or opens the owning Specifications 2 entry.
- A pre-commit review caught a rollback-only `trash` icon regression. The icon
  generator now recognizes nested literal calls and custom-icon fallbacks,
  retains indirect `edit`/`filter` bindings, and deterministically reproduces
  the same 53-icon registry. The sealed Pilot release resolves the rollback
  directory delete icon.
- Strict TypeScript, syntax, Routes events, Directory permanent React,
  Planning/Gantt owners, feature registry, UI contract, icon system,
  deterministic build, mixed-runtime and diff gates passed. Independent
  review returned GO. Visual/browser QA was deliberately skipped.
- Immediate previous `.55` passed rollback dry-run. The sealed legacy `.18`
  pointer remains protected by the existing Specifications 2 compatibility
  guard.
- Implementation remains `99%`; strict accepted evidence remains `50%`.
  Blueprint UI was not introduced.

## Shift Work Orders legacy retirement 2026-07-22: release `.57`

This block supersedes `.56` as the live Pilot pointer and removes the orphaned
Journal renderer while preserving its React read/write and print owners.

- Active Pilot is `v.1.500.57-0b8953d` at exact commit
  `0b8953d5f8b14f5d2f32895008d1059925171858`; immediate previous is
  `v.1.500.56-238c5c4` and pinned legacy remains
  `v.1.500.18-93d02ed`.
- Source/dist SHA-256 are
  `7100e3a164a77b8f40eca5281bcb6baae858338a0376a2067c63ddff288b3cbd` and
  `5d0abf3118d79dd9a9b7039f4b6a5dcdb8047c9c8a0e06bc07386df83f8ae947`;
  runtime-policy SHA remains
  `38bfa8a0a5cddacc7f550b53d15fdf84a7fbbb8bb3c9c620a598d4d7b592cd8c`.
- Local/public health report `ok`, version `v.1.500.57`, shared state `ready`,
  zero active evaluation/legacy surfaces and no effective `MES_REACT_*`
  flags. The service is active and `/srv/mes/pilot/app` resolves to `.57`.
- `src/modules/shift_work_orders/render.js` (1,136 lines) and the stale
  same-release legacy-origin browser QA (194 lines) were physically removed.
  The full cut deletes 1,339 lines and adds 42 production ownership and policy
  lines.
- The permanent React route, `journal_owner.js`, both typed production models,
  assignment/fact/carryover RBAC/server owners, lazy fact editor, lazy print
  renderer and app print-package builder are preserved. Module/feature
  registries now point to those real React/TypeScript owners.
- The former overlay probe referenced only the removed renderer. The React
  `Печать СЗН` action now exposes a stable trigger contract and policy guard;
  no legacy overlay edge was reintroduced.
- Strict TypeScript, syntax, Shift Work Orders runtime/model, Shift Master
  command/server bridge, module blueprint, feature registry, icon system,
  deterministic build, mixed-runtime and diff gates passed. Independent
  review returned GO. Visual/browser QA was deliberately skipped.
- Immediate previous `.56` passed rollback dry-run. The sealed legacy `.18`
  pointer remains protected by the existing Specifications 2 compatibility
  guard.
- Implementation remains `99%`; strict accepted evidence remains `50%`.
  Blueprint UI was not introduced.

## Timesheet legacy retirement 2026-07-22: release `.58`

This block supersedes `.57` as the live Pilot pointer and marks Timesheet as
`✅ FULL REACT` in the accelerated renderer-retirement track.

- Active Pilot is `v.1.500.58-1ce73a7` at exact commit
  `1ce73a75a9ec3f5997d26e338c7ec64224cf50b7`; immediate previous is
  `v.1.500.57-0b8953d` and pinned legacy remains
  `v.1.500.18-93d02ed`.
- Source/dist SHA-256 are
  `cdc078a63abf1658a025ad333c30c2624242b39ccb6688d366ea34ff923d23b9` and
  `efc05170b450b6b23383efc7910cac3715c1c657d3cd3a53c85310e247774e92`;
  runtime-policy SHA remains
  `38bfa8a0a5cddacc7f550b53d15fdf84a7fbbb8bb3c9c620a598d4d7b592cd8c`.
- Local/public health report `ok`, version `v.1.500.58`, shared state `ready`,
  zero active evaluation/legacy surfaces and no effective `MES_REACT_*` flags
  or React systemd drop-ins. The service is active and `/srv/mes/pilot/app`
  resolves to `.58`.
- `src/modules/timesheet/render.js` and three stale legacy/browser QA files were
  physically removed. The full cut deletes 2,090 lines and adds 85 focused
  owner, fail-closed and executable authorization lines.
- Production callbacks can no longer hand a day or schedule action to a
  same-release legacy renderer. Invalid activation now renders a deterministic
  `react-required` shell; module/feature registries point to the real
  React/TypeScript model, adapter, command and scenario owners.
- The former browser gate expected the deleted legacy DOM. `qa:timesheet` is
  now a direct nonvisual React/model/delta/RBAC gate. Its signed-session fixture
  is time-stable and the executable Timesheet authorization QA is mandatory.
- Strict React TypeScript, production model, Personnel Calendar, bounded
  Timesheet delta, executable/static authorization, UI contract, module and
  feature registry, deterministic build, mixed-runtime and diff gates passed.
  Independent review returned GO. Visual/browser QA was deliberately skipped.
- Immediate previous `.57` passed rollback dry-run. The sealed legacy `.18`
  pointer remains preserved behind the existing compatibility guards.
- Implementation remains `99%`; strict accepted evidence remains `50%`.
  Blueprint UI was not introduced.

## Contour Admin legacy retirement 2026-07-22: release `.59`

This block supersedes `.58` as the live Pilot pointer and marks Contour Admin
as `✅ FULL REACT` in the accelerated renderer-retirement track.

- Active Pilot is `v.1.500.59-77464c0` at exact commit
  `77464c04fa647679f115207478669d26ef02c200`; immediate previous is
  `v.1.500.58-1ce73a7` and pinned legacy remains
  `v.1.500.18-93d02ed`.
- Source/dist SHA-256 are
  `bd13732319c598e1594f4258a5d39b56666b1acc1c81d41fa4f657ca003bb8a3` and
  `76baf4f38cd9c79191a503359e56b70ba683823de2cb6107321fea7ec41032a2`;
  runtime-policy SHA remains
  `38bfa8a0a5cddacc7f550b53d15fdf84a7fbbb8bb3c9c620a598d4d7b592cd8c`.
- Local/public health report `ok`, version `v.1.500.59`, shared state `ready`,
  zero active evaluation/legacy surfaces and no effective `MES_REACT_*` flags
  or React systemd drop-ins. The service is active and `/srv/mes/pilot/app`
  resolves to `.59`.
- `src/modules/contour_admin/render.js`, stale island browser QA and unused
  production legacy callback ports were removed. The full cut deletes 631
  lines and adds 61 focused owner/fail-closed lines.
- `ADMIN_ONLY`, public/admin navigation filtering, protected endpoint, server
  owner, command allowlist, admin auth/route guards, durable audit fsync and
  root-owned evaluation scripts remain present and guarded.
- Invalid activation stays in a React-owned `react-required` error shell;
  public-host access fails closed as `admin-host-required`. There is no
  same-release renderer or callback.
- Strict React TypeScript, runtime/RBAC/origin/confirmation/durable-request,
  rollout ops, UI contract, module/feature registry, deterministic build,
  mixed-runtime and diff gates passed. Independent review returned GO.
  Visual/browser QA was deliberately skipped.
- Immediate previous `.58` passed rollback dry-run. The sealed legacy `.18`
  pointer remains preserved behind the existing compatibility guards.
- Implementation remains `99%`; strict accepted evidence remains `50%`.
  Blueprint UI was not introduced.

Next accelerated cut: inventory the remaining normal-runtime JavaScript owners
and select the smallest cut that removes real legacy without deleting the
intentional immutable-release rollback boundary.

## Structure and archived renderer retirement 2026-07-22: release `.60`

This block supersedes `.59` as the live Pilot pointer and marks Structure and
employees as `✅ FULL REACT` in the accelerated renderer-retirement track.

- Active Pilot is `v.1.500.60-af0cd28` at exact commit
  `af0cd28170c4015d6cd4fa90ae10ea183597eedb`; immediate previous is
  `v.1.500.59-77464c0` and pinned legacy remains
  `v.1.500.18-93d02ed`.
- Source/dist SHA-256 are
  `d5d98241c9c059791d9108344b3f0d46c20ea052a74d7dc444899fba3156e98c` and
  `aee18d5815bb055bce5b0633e4070ac3ccd130ee0e9c0c160fa226f4a9f884e3`;
  runtime-policy SHA remains
  `38bfa8a0a5cddacc7f550b53d15fdf84a7fbbb8bb3c9c620a598d4d7b592cd8c`.
- Public health reports `ok`, version `v.1.500.60`, shared state `ready`, zero
  active evaluation/legacy surfaces and no effective `MES_REACT_*` flags or
  React systemd drop-ins. Service is active and `/srv/mes/pilot/app` resolves
  to `.60`.
- The retired Structure renderer/legacy QA and orphan renderers for
  `employees`, `planning_table`, `shop_map`, `supply`, and `visual_system`
  are absent from both sealed source and dist. The cut deletes 3,189 lines and
  adds 104 focused ownership/QA/rollback-contract lines.
- Module and feature metadata point to the React host, server capabilities and
  seven typed islands. `qa:structure` executes consolidation, all seven
  fail-closed host factories and strict React TypeScript.
- Independent review found the retained Dispatch rollback renderer no longer
  satisfied its required header/page contract. It now renders an explicit
  ModuleHeader, disabled SystemState and both existing rollback CSS owners;
  its executable smoke and source guard pass.
- Structure/auth, UI table, module/feature, legacy/syntax, deterministic build,
  mixed-runtime and diff gates passed. Independent review returned GO.
  Visual/browser QA was deliberately skipped.
- Immediate previous `.59` passed rollback dry-run. The sealed legacy `.18`
  record remains pinned, but a direct legacy-baseline dry-run is intentionally
  blocked while the active Specifications 2 attachment/work-order/publication
  command drop-ins are ON. A real legacy switch must first use the active
  release's root-owned deactivation scripts and prove those commands OFF.
- Implementation remains `99%`; strict accepted evidence remains `50%`.
  Blueprint UI was not introduced.

Next accelerated cut: prune and rename the live
`src/modules/products/render.js` compatibility runtime without claiming a new
FULL REACT module, then move Nomenclature save/delete ownership to a typed
command owner. Do not delete the file wholesale: Planning, Routes, Auth and BOM
still consume 49 of its exported bindings.

## Products compatibility runtime prune 2026-07-22: release `.61`

This block supersedes `.60` as the live Pilot pointer. It deliberately does not
claim another `FULL REACT` module: it removes misleading renderer ownership and
dead compatibility code shared by several already migrated routes.

- Active Pilot is `v.1.500.61-80b143c` at exact commit
  `80b143cbddbf3835f120ade554eeca4b1dfc0a2e`; immediate previous is
  `v.1.500.60-af0cd28` and pinned legacy remains
  `v.1.500.18-93d02ed`.
- Source/dist SHA-256 are
  `6f382e85758224d37adac150407be27bfae0d553dc6816e6eee2fa3f200a25ad` and
  `014b2b5b233d52909c3a3daa208fc67495d0a28932ed57743be51226643cf68f`;
  runtime-policy SHA remains
  `38bfa8a0a5cddacc7f550b53d15fdf84a7fbbb8bb3c9c620a598d4d7b592cd8c`.
- Public health reports `ok`, version `v.1.500.61`, shared state `ready`, zero
  active evaluation/legacy surfaces and no effective `MES_REACT_*` flags or
  React systemd drop-ins. Service is active and `/srv/mes/pilot/app` resolves
  to `.61`.
- `products/render.js` is absent from sealed source/dist. Its remaining live
  logic is `products/compatibility_runtime.js`: 1,456 lines, no UI-render
  dependencies, exactly 49 app bindings. Active JavaScript fell from 64,982 to
  63,934 lines; main bundle also shrank.
- The code commit has 284 additions and 1,134 deletions. Most additions are the
  executable runtime contract and rewired QA; the runtime itself lost the dead
  Auth/UI/BOM branches and 34 unused public bindings.
- First independent review returned NO-GO after finding four live helpers
  removed by static pruning. Three BOM helpers and the scoped-route helper were
  restored; slot helpers are injected from app. Behavior QA now executes BOM
  result merge, component update through the lazy XLSX boundary and scoped
  route selection. Focused checkJs has no unresolved-name diagnostics.
- React cutover, Products contract, Nomenclature runtime/write boundary, lazy
  XLSX, Routes/Planning, TypeScript, syntax, deterministic build, mixed-runtime
  and diff gates passed. Final independent review returned GO. Visual/browser
  QA was deliberately skipped.
- Immediate previous `.60` passed rollback dry-run. The sealed legacy `.18`
  record remains pinned behind the unchanged Specifications 2 compatibility
  guards.
- Implementation remains `99%`; strict accepted evidence remains `50%`.
  Blueprint UI was not introduced.

Next accelerated cut: remove the always-loaded obsolete
`src/modules/app_interactions/directory_legacy.js` path and rename the remaining
`app_interactions/render.js` service only after preserving global navigation,
logout, confirm dispatch and Directory read-model helpers. Keep
`saveDirectoryRow` / `deleteDirectoryStateRow` React command ownership.

## Directory legacy interaction purge 2026-07-22: release `.62`

This block supersedes `.61` as the live Pilot pointer. It does not claim a new
`FULL REACT` module because the four Directory surfaces were already marked;
it removes their remaining unreachable same-release interaction fallback.

- Active Pilot is `v.1.500.62-7c0664f` at exact commit
  `7c0664fc5180ee4876f18abb02988a31c9dcc1bd`; immediate previous is
  `v.1.500.61-80b143c` and pinned legacy remains `v.1.500.18-93d02ed`.
- Source/dist SHA-256 are
  `52865b79b51e714979855fde4c176a32509563cb88e4de137a3c5838cb1d2262` and
  `ac7bf81ca27a42553e777a29cc95b608531b4a6bf75699637f927c8a302cda82`;
  runtime-policy SHA remains
  `38bfa8a0a5cddacc7f550b53d15fdf84a7fbbb8bb3c9c620a598d4d7b592cd8c`.
- `app_interactions/directory_legacy.js` is absent from sealed source/dist.
  Its loader, modal/form/delete proxies, dense-select state and app facades are
  gone. Active JavaScript fell from 63,934 to 62,953 lines.
- Live Directory command owners `saveDirectoryRow` and
  `deleteDirectoryStateRow` remain, together with enriched reads, formatting,
  global navigation, canonical logout and generic confirm dispatch.
- A cold Nomenclature command executes through the real lazy Routes and
  Products modules with one load each. The dist contains the Routes chunk and
  no Directory legacy markers or chunk.
- Removing the legacy literal exposed generated-registry coupling for dynamic
  `save`/`trash` icons. The generator and icon contract were fixed; both SVGs
  survive deterministic builds.
- React cutover, Directory permanent/runtime and server-command gates,
  Nomenclature write boundary, TypeScript, syntax, build, mixed-runtime and
  diff checks passed. Independent review returned GO with no P0/P1. Visual and
  browser QA were deliberately skipped.
- Public health reports `ok`, version `v.1.500.62`, shared state `ready`, zero
  evaluation/legacy surfaces, no effective `MES_REACT_*` flags and no React
  systemd drop-ins. Service and pointer resolve to `.62`.
- Immediate previous `.61` passed rollback dry-run. Sealed legacy `.18` is
  still attested, but its dry-run correctly refuses while root-owned
  Specifications 2 attachment, Work Order and publication commands are ON;
  do not bypass that compatibility guard.
- Implementation remains `99%`; strict accepted evidence remains `50%`.
  Blueprint UI was not introduced.

## Production Structure full-matrix runtime retirement 2026-07-22: release `.63`

This block supersedes `.62` as the live Pilot pointer. It does not claim a new
`FULL REACT` module: Production Structure was already marked, while this cut
removes a large diagnostic-only legacy data artifact from the browser graph.

- Active Pilot is `v.1.500.63-f0e68dc` at exact commit
  `f0e68dca2a14a699e0e1d4ec345879858a080f3e`; immediate previous is
  `v.1.500.62-7c0664f` and pinned legacy remains
  `v.1.500.18-93d02ed`.
- Source/dist SHA-256 are
  `85523018ad3df5562426703b4c3c52c2bc512edf62bdea3765e1289283080b88` and
  `1611b5d4baa48ce3f70533d715c1f5f95b117cf5b0bb8c0b957a8c9892501036`;
  runtime-policy SHA remains
  `38bfa8a0a5cddacc7f550b53d15fdf84a7fbbb8bb3c9c620a598d4d7b592cd8c`.
- The 9,217-line full matrix moved from `src` to a test-only fixture under
  `scripts/fixtures`; app Diagnostics now lazy-loads the compact generated
  projection. Inventory JavaScript fell from 62,953 to 53,740 lines; the
  reachable import graph fell from 56,536 to 47,323 lines, both by 9,213.
- The executable parity gate proves all 152 rows, ordered 51-column schema,
  six displayed diagnostic fields, byte-equivalent serialized System Domains
  and an identical migration report. A fresh build emits the compact boundary
  and no full-matrix chunk.
- Permanent Weekly read errors now stay inside its React-owned fail-closed
  shell instead of selecting `compatibility-fallback`.
- Fresh Structure build, strict React TypeScript, syntax, bundle budget,
  feature registry, React cutover and mixed-runtime gates passed. Independent
  review returned GO after its two clean-build findings were fixed. Visual and
  browser QA were deliberately skipped.
- Local/public health report `ok`, version `v.1.500.63`, shared state `ready`,
  all 25 policy surfaces are React, evaluation/legacy surfaces are empty,
  effective `MES_REACT_*` flags are absent and service/pointer resolve to `.63`.
- Immediate previous `.62` passed rollback dry-run. Sealed legacy `.18`
  remains attested; its dry-run correctly refuses while Specifications 2
  attachment, Work Order and publication command drop-ins `50`, `63`, `64`
  are ON. Do not bypass that guard.
- Implementation remains `99%`; strict accepted evidence remains `50%`.
  Blueprint UI was not introduced.

## Specifications 2 strict production owner 2026-07-22: release `.64`

This block supersedes `.63` as the live Pilot pointer. It advances strict
TypeScript coverage without claiming that the still-partial Specifications 2
module is complete.

- Active Pilot is `v.1.500.64-94b6375` at exact commit
  `94b63756504672f30cb4951fadbc6ee6ff9a6a8e`; immediate previous is
  `v.1.500.63-f0e68dc` and pinned legacy remains
  `v.1.500.18-93d02ed`.
- Source/dist SHA-256 are
  `140420fd9fb16c8562459ee6183af3892550ce2e6034ce186d1a0930cd8e0f3d` and
  `cc71a559ba7dcffb5126e18c8162a79a37a7c9978b4c5d07373a50c8b5092d46`;
  runtime-policy SHA remains
  `38bfa8a0a5cddacc7f550b53d15fdf84a7fbbb8bb3c9c620a598d4d7b592cd8c`.
- `src/modules/specifications2/production_owner.js` is absent from sealed
  source. Its strict `production_owner.ts` replacement preserves server-first
  publication, exact fingerprint/revision guards, suppressed snapshot ACK,
  forced PostgreSQL read-back, concurrent-edit preservation and fail-closed
  recovery. Runtime and registries import only the TypeScript owner.
- A structural `.d.ts` boundary types the still-JavaScript publication client
  with `unknown`; no `any`, `ts-ignore` or data-stripping cast was added.
  Active JavaScript fell from 53,740 to 53,422 lines.
- Executable owner QA bundle the TypeScript owner to temporary Node 20 ESM.
  Both passed on exact Node `20.19.5`; strict TypeScript, production-model,
  server-first, publication authority/runtime policy, module/feature,
  mixed-runtime, syntax, clean build and dist-policy gates passed. Independent
  review returned GO with no P1/P2. Visual/browser QA was deliberately skipped.
- Local/public health report `ok`, version `v.1.500.64`, shared state `ready`,
  all 25 policy surfaces are React, evaluation/legacy surfaces are empty, and
  no effective `MES_REACT_*` flags or React evaluation drop-ins remain.
- Immediate previous `.63` passed rollback dry-run. Sealed legacy `.18`
  remains attested; its dry-run correctly refuses while Specifications 2
  attachment, Work Order and publication command drop-ins `50`, `63`, `64`
  are ON. The guard was not bypassed.
- Specifications 2 remains `PARTIAL`; no new `FULL REACT` marker is assigned.
  Implementation remains `99%`; strict accepted evidence remains `50%`.
  Blueprint UI was not introduced.

Next accelerated cut: replace the Specifications 2 API client JavaScript
boundary with strict TypeScript: publication commands, revision read model and
work-order commands. Remove the temporary publication `.d.ts` shim and keep
Node 20 executable QA through esbuild bundles.

## Specifications 2 strict API clients and Structure CSS contract 2026-07-22: release `.65`

This block supersedes `.64` as the live Pilot pointer. It reduces the active
JavaScript boundary and fixes a concrete Pilot styling regression, but it does
not claim that the still-partial Specifications 2 module is complete.

- Active Pilot is `v.1.500.65-bf92a5b` at exact commit
  `bf92a5b62ab34457331bf00ee98b6165f6003517`; immediate previous is
  `v.1.500.64-94b6375` and pinned legacy remains
  `v.1.500.18-93d02ed`.
- Source/dist SHA-256 are
  `7e369d101f6a074d4303207243c4aba4f329a849ea6686af5e1729a8bc71203a` and
  `07b8a7e62163d14c9cba199bb4866463ad82fb1259a19b55a10f1cd9201abc56`;
  runtime-policy SHA remains
  `38bfa8a0a5cddacc7f550b53d15fdf84a7fbbb8bb3c9c620a598d4d7b592cd8c`.
- Publication commands, revision reads and Work Order commands now execute
  from strict `.ts` clients. Their three old `.js` files and the temporary
  publication `.d.ts` shim are absent. `production_owner.ts`, lazy imports,
  strict tsconfig, ownership registries and executable QA all reference the
  TypeScript implementations. Active JavaScript fell from 53,422 to 53,226
  lines; the strict inventory now contains six TypeScript files.
- All three executable client QA bundle to temporary Node 20 ESM, pass on exact
  Node `20.19.5` and remove their temporary directories. Strict typecheck,
  client/lazy/production/server-first/authority/runtime-policy, mixed-runtime,
  syntax, module/feature and clean-build gates passed. Independent review
  returned GO with no P1/P2.
- The `.64` Structure screens did not lose the global stylesheet. Their new
  registry roots were missing from the common CSS scope, so shell/table rules
  coexisted with native-looking sidebar buttons. `.65` extends every common
  selector to all seven Structure roots, including Migration Diagnostics, and
  adds a static coverage gate. Live `.65` computed-style evidence shows the
  affected sidebar button as `display:flex` with `border:0` and MES padding,
  while the module layout is again a grid. No redesign or Blueprint UI was
  introduced.
- Standard release staging remains red on pre-existing global `qa:flow`
  contract failures unrelated to this diff. Under the explicitly accepted
  accelerated/nonvisual policy, the repository's `accelerated` release profile
  passed, including immutable double build, built runtime-policy verification,
  root sealing and remote preflight.
- Local/public health report `ok`, version `v.1.500.65`, shared state `ready`,
  all 25 policy surfaces are React, evaluation/legacy surfaces are empty,
  effective `MES_REACT_*` flags are absent and service/pointer resolve to `.65`.
- Immediate previous `.64` passed rollback dry-run. Sealed legacy `.18`
  remains attested; its dry-run correctly refuses while Specifications 2
  attachment, Work Order and publication command drop-ins `50`, `63`, `64`
  are ON. The guard was not bypassed.
- Specifications 2 remains `PARTIAL`; no new `FULL REACT` marker is assigned.
  Implementation remains `99%`; strict accepted evidence remains `50%`.

Next accelerated cut: audit and type the remaining Specifications 2 read-model
boundary, beginning with `work_orders_read_model.js`, while preserving the
existing PostgreSQL owner and fail-closed lazy runtime.

## Planning Work Order read model strict TypeScript 2026-07-22: release `.66`

This block supersedes `.65` as the live Pilot pointer. It removes a shared
Planning normal-runtime JavaScript boundary without claiming completion of the
still-partial Planning module.

- Active Pilot is `v.1.500.66-7783dcb` at exact commit
  `7783dcbb0721f43d2910e4f03d2bd2c35be9828a`; immediate previous is
  `v.1.500.65-bf92a5b` and pinned legacy remains
  `v.1.500.18-93d02ed`.
- Source/dist SHA-256 are
  `98ef3daa06898c306fee2050c42969a26f5ab330da24f28f90e6a0a7835767b5` and
  `480edcf1c5565b261fd7ab2e41b52348a730204059008219b15bb5a377241faa`;
  runtime-policy SHA remains
  `38bfa8a0a5cddacc7f550b53d15fdf84a7fbbb8bb3c9c620a598d4d7b592cd8c`.
- `src/modules/domain_api/work_orders_read_model.js` is absent. Its strict
  `.ts` replacement preserves list/detail/summary caching, separate ETags,
  combined-bootstrap capability fallback, request-sequence/data-epoch race
  guards, quantity/start-date/physical-slot commands, idempotency and exact
  compatibility receipts. Malformed truthy `payload.item` values now fail
  closed instead of being treated as work orders.
- Runtime imports, strict tsconfig, Planning feature/module ownership and all
  exact source-path QA reference the TypeScript file. Active JavaScript fell
  from 53,226 to 52,770 lines; the strict inventory now contains seven
  TypeScript files.
- Node-executable domain read-model/snapshot QA bundle the TypeScript boundary
  to temporary Node 20 ESM and clean it in `finally`. Exact Node `20.19.5`,
  strict typecheck, bootstrap/lazy/deferred-command, mixed-runtime,
  module/feature, syntax, clean build and built runtime-policy gates passed.
  Independent review returned GO with no P1/P2.
- Two broader baseline assertions remain stale outside this cut: the aggregate
  domain-read-model script expects a removed schedule source string, and the
  full experiment QA expects an old print-view-model call. They were not
  weakened or counted as passing. The accepted accelerated release profile
  and all focused owner/cache gates are green.
- Local/public health report `ok`, version `v.1.500.66`, shared state `ready`,
  all 25 policy surfaces are React, evaluation/legacy surfaces are empty,
  effective `MES_REACT_*` flags are absent and service/pointer resolve to `.66`.
- Immediate previous `.65` passed rollback dry-run. Sealed legacy `.18`
  remains attested; its dry-run correctly refuses while Specifications 2
  attachment, Work Order and publication command drop-ins `50`, `63`, `64`
  are ON. The guard was not bypassed.
- Planning remains `PARTIAL`; no new `FULL REACT` marker is assigned.
  Implementation remains `99%`; strict accepted evidence remains `50%`.
  Blueprint UI was not introduced.

Next accelerated batch: convert the low-risk browser-only leaves `data.js`,
`types.js`, Contour Admin command contract/client, Shift Work Orders journal
owner and long-task overlay to strict TypeScript. Estimated removable active
JavaScript: 201 lines, without backend/schema or UI redesign.

## Shared browser runtime leaf TypeScript batch 2026-07-22: release `.67`

This block supersedes `.66` as the live Pilot pointer. It removes six small
normal-runtime JavaScript leaves without changing layout, API authority or
module completion markers.

- Active Pilot is `v.1.500.67-6983dcd` at exact commit
  `6983dcdfcac146ed4a04ee81c6cf2f4576bb1365`; immediate previous is
  `v.1.500.66-7783dcb` and pinned legacy remains
  `v.1.500.18-93d02ed`.
- Source/dist SHA-256 are
  `73b988b312f810edbdcf8e704b660a43d3a4dedd449cc73382540bbd0f789c7d` and
  `d3cbdd20bf70341c4660c7ab61841e7571d6614c78fe119d88565f62affc44ae`;
  runtime-policy SHA remains
  `38bfa8a0a5cddacc7f550b53d15fdf84a7fbbb8bb3c9c620a598d4d7b592cd8c`.
- Default Planning data, shared runtime types, Contour Admin command contract
  and server client, Shift Work Orders journal owner and the long-task overlay
  now execute from strict `.ts` sources. All normal imports, generator paths,
  strict tsconfig, feature/module ownership, mixed-runtime and legacy inventory
  references were updated; the six old `.js` files are absent.
- Contour Admin and Shift Work Orders executable policy QA bundle the real
  TypeScript sources to temporary Node 20 ESM and clean the directories in
  `finally`. Two independent reviews returned GO with no P1/P2; exact Node 20,
  strict typecheck, completion/mixed-runtime/legacy inventory, module/feature,
  syntax, clean build and built runtime-policy gates passed.
- Active JavaScript fell from 52,770 to 52,569 lines and from 126 to 120 files;
  the strict inventory now contains 13 TypeScript files. The change is
  browser-only: PostgreSQL, schema, service command owners and UI design were
  not changed. Blueprint UI was not introduced.
- Local/public health report `ok`, version `v.1.500.67`, shared state `ready`,
  all 25 policy surfaces are React, evaluation/legacy surfaces are empty,
  effective `MES_REACT_*` flags are absent and service/pointer resolve to `.67`.
- Immediate previous `.66` passed rollback dry-run. The sealed legacy `.18`
  pointer remains unchanged; its compatibility guard and the three active
  Specifications 2 command drop-ins were not bypassed.
- No module moved from `PARTIAL` to `FULL REACT`; implementation remains `99%`
  and strict accepted evidence remains `50%`.

Next accelerated candidate: type the remaining broad browser UI helpers
`ui/html.js` and `ui/formatters.js` as a separately reviewed 114-line batch, or
take the global `react_runtime_policy.js` boundary in its own release.

## Shared HTML and formatter helpers strict TypeScript 2026-07-22: release `.68`

This block supersedes `.67` as the live Pilot pointer. It removes the shared
HTML-escaping and runtime-formatting JavaScript helpers without changing their
rendered-value contract or performing a visual redesign.

- Active Pilot is `v.1.500.68-5539716` at exact commit
  `55397164a6036ed2009d3aafafcd3c049a97b92c`; immediate previous is
  `v.1.500.67-6983dcd` and pinned legacy remains
  `v.1.500.18-93d02ed`.
- Source/dist SHA-256 are
  `5ff993c4fc6d7e69f0fbd4a4314cafac5c73b73d86f9c7039533f1b213570352` and
  `1775fa836793835a68e078d7c02f0dd16bb4b0cb2e7c7ac5d41c75d536dab454`;
  runtime-policy SHA remains
  `38bfa8a0a5cddacc7f550b53d15fdf84a7fbbb8bb3c9c620a598d4d7b592cd8c`.
- `src/ui/html.js` and `src/ui/formatters.js` are absent. Their strict `.ts`
  replacements preserve escaping, attribute/text coercion, falsy/null values,
  number/date display, Russian plural forms and employee-name formatting.
  Seven active consumers, strict tsconfig, runtime/feature maps, mixed-runtime
  inventory and semantic QA use only the TypeScript paths.
- Three executable semantic QA bundle the TypeScript helpers for Node 20 and
  clean temporary directories in `finally`. Exact Node `20.19.5`, strict
  typecheck, UI/formatter contracts, module/feature, mixed-runtime, syntax,
  clean build and built runtime-policy gates passed. Independent review
  returned GO with no P1/P2.
- Active JavaScript fell from 52,569 to 52,468 lines and from 120 to 118 files;
  the strict inventory now contains 15 TypeScript files. The historical Phase
  6 runtime-map artifacts were deliberately not regenerated: the current
  generator has no deterministic `--check` mode and would overwrite the
  recorded 1,699-function baseline with an unrelated full refresh.
- One broad pre-existing UI-hardening assertion still expects a removed Gantt
  opened-modal marker. It was not weakened or counted as passing; the focused
  HTML/formatter behavior contracts are green.
- Local/public health report `ok`, version `v.1.500.68`, shared state `ready`,
  all 25 policy surfaces are React, evaluation/legacy surfaces are empty,
  effective `MES_REACT_*` flags are absent and service/pointer resolve to `.68`.
- Immediate previous `.67` passed rollback dry-run. The sealed legacy `.18`
  pointer remains unchanged and its compatibility guard was not bypassed.
- No module completion marker changed. Implementation remains `99%`; strict
  accepted evidence remains `50%`. Blueprint UI was not introduced.

Next accelerated candidate: migrate `react_runtime_policy.js` in its own
high-blast-radius strict TypeScript cut, or select the next browser-only owner
from the active mixed-runtime inventory.

## React runtime policy strict TypeScript 2026-07-22: release `.69`

This block supersedes `.68` as the live Pilot pointer. It removes the shared
browser policy JavaScript boundary while preserving the exact fail-closed
choice between React, evaluation and the sealed legacy release.

- Active Pilot is `v.1.500.69-4308c08` at exact commit
  `4308c088da9f808d38d65ab03b1ec444e7318382`; immediate previous is
  `v.1.500.68-5539716` and pinned legacy remains
  `v.1.500.18-93d02ed`.
- Source/dist SHA-256 are
  `917c345d8dba7bb217f427853be441e7731ddd417e79eedf0f4fcfff5af16164` and
  `228ede3d04da893c65519ebe2ed5d911c18605f796452835e2bef46a5d0d1ce1`;
  runtime-policy SHA remains
  `38bfa8a0a5cddacc7f550b53d15fdf84a7fbbb8bb3c9c620a598d4d7b592cd8c`.
- `src/modules/react_runtime_policy.js` is absent. Its strict `.ts`
  replacement types runtime modes, access modes, public policy shape and the
  immutable activation decision. Missing, unknown or malformed policy values
  still resolve to legacy; permanent React cannot be disabled by evaluation
  flags.
- Every active browser import, direct policy QA, strict tsconfig and the
  mixed-runtime inventory uses the TypeScript path. Executable policy QA
  bundles the real TS source for Node 20, removes the temporary directory in
  `finally`, and passed on exact Node `20.19.5`.
- Strict typecheck, focused policy/permanent-runtime contracts, mixed-runtime,
  legacy inventory, module/feature, syntax, clean build and built-policy gates
  passed. An independent review returned GO with no P1/P2 and confirmed that
  the delivered browser graph contains the typed source.
- Active JavaScript fell from 52,468 to 52,438 lines and from 118 to 117 files;
  the strict inventory now contains 16 TypeScript files.
- Activation completed through the fixed root boundary. The service is active,
  the pointer resolves to `.69`, all 25 policy surfaces remain React and no
  effective `MES_REACT_*` evaluation flags are configured.
- Immediate previous `.68` passed rollback dry-run. The sealed legacy `.18`
  release remains attested; its compatibility guard correctly refuses a switch
  while Specifications 2 command drop-ins `50`, `63` and `64` are ON. The
  guard was not bypassed.
- No module completion marker changed. Implementation remains `99%`; strict
  accepted evidence remains `50%`. Blueprint UI was not introduced.

Next accelerated batch: convert the six browser-only Domain API clients for
System Domains, Planning and Shift Execution (701 JavaScript lines). They have
no production server/Node consumer and are the best remaining LOC-to-blast
ratio before the shared UI renderer and React-host batches.

## Browser Domain API clients strict TypeScript 2026-07-22: release `.70`

This block supersedes `.69` as the live Pilot pointer. It removes six
browser-only API client/read-model JavaScript files without changing backend
schema, command authority, layout or user-visible behavior.

- Active Pilot is `v.1.500.70-fb09aa4` at exact commit
  `fb09aa4218bf27709a86ee5d99fbf73697ac1689`; immediate previous is
  `v.1.500.69-4308c08` and pinned legacy remains
  `v.1.500.18-93d02ed`.
- Source/dist SHA-256 are
  `a92db5ce566823f77cc90cd9a5a53bb78e020a985c9644bb6f1e34ee1fc13342` and
  `92c8fc7936414497e7c1b3aa7eadd5f0ac36dc4eb6badfe044dc2d7c53aea48c`;
  runtime-policy SHA remains
  `38bfa8a0a5cddacc7f550b53d15fdf84a7fbbb8bb3c9c620a598d4d7b592cd8c`.
- System Domains commands/read model, Planning period/runtime projection and
  Shift Execution commands/dispatch projection now execute from strict `.ts`.
  All six old `.js` files are absent; static and lazy app imports, strict
  tsconfig, exact path assertions and mixed-runtime inventory use the typed
  paths.
- Behavior contracts remain intentionally different where required: System
  Domains returns structured transport/auth/RBAC failures, Shift commands
  reject for outbox retry except explicit 409 conflict, and idempotency keys,
  quoted `If-Match`, ETag/304/TTL, single-flight caches, Weekly empty rows and
  Dispatch scope/coverage authority are preserved.
- A shared executable QA loader bundles each real TypeScript client for Node
  20 in a unique temporary directory and removes it in `finally`. All six
  client suites passed on exact Node `20.19.5`; no temporary directories
  remained.
- Strict typecheck, lazy/wiring contracts, mixed-runtime, focused client QA,
  syntax, clean build and built-policy gates passed. Independent contract and
  implementation reviews returned GO with no P1/P2. The broad historical
  `experiments/react-migration/qa.mjs` still stops earlier on its pre-existing
  stale print-view-model assertion; it was not weakened or counted as green.
- Active JavaScript fell from 52,438 to 51,737 lines and from 117 to 111 files;
  the strict inventory now contains 22 TypeScript files.
- Activation completed through the fixed root boundary. The service is active,
  the pointer resolves to `.70`, all 25 policy surfaces remain React and no
  effective `MES_REACT_*` evaluation flags are configured.
- Immediate previous `.69` passed rollback dry-run. The sealed legacy `.18`
  pointer and its compatibility guard remain unchanged; no guard was bypassed.
- No module completion marker changed. Implementation remains `99%`; strict
  accepted evidence remains `50%`. Blueprint UI was not introduced.

Next accelerated batch: type the shared browser renderer helpers
`src/ui/components.js` and `src/ui/module_patterns.js` (595 JavaScript lines)
without altering generated HTML or design. The broader React island-host layer
follows after those shared contracts are typed.

## Shared UI runtime strict TypeScript batch 2026-07-22: release `.71`

This block supersedes `.70` as the live Pilot pointer and applies the new
batched-release rule: five compatible owners were migrated and published in one
release rather than one release per file.

- Active Pilot is `v.1.500.71-dc067b3` at exact commit
  `dc067b3dd1b19dab2f925cb42e1e7b1b9d85686c`; immediate previous is
  `v.1.500.70-fb09aa4`, pinned legacy remains `v.1.500.18-93d02ed`, and
  Staging remains `v.1.499.70-c3b4059`.
- Source/dist SHA-256 are
  `1b7e87efedb337fb3550cb42234fd1a42dc14008b29ba11a1da3ecb9b386bfb5` and
  `880a97c2d37e5544f12aa526bd6b6b251a722d07957c64634a66df2e38e14458`.
- `src/ui/components`, `src/ui/module_patterns`,
  `src/ui/tree_table_visual`, Roles `multiple_assignment_owner` and auth
  `access_role_resolver` now execute from strict `.ts`; all five old `.js`
  files are absent. Active imports, tsconfig, exact Node QA loaders and
  module/feature ownership registries use the typed paths.
- Active JavaScript fell from `51,737` to `50,942` lines and from `111` to
  `106` files; strict production inventory grew from `22` to `27` TypeScript
  files. HTML, design, API/schema, PostgreSQL authority and command behavior
  were not changed.
- Strict typecheck, syntax, focused owner/tree/auth/UI contracts, React
  cutover/runtime policy, module/feature registries, clean build and
  `git diff --check` passed. Independent review returned `GO` with no P1/P2.
- The two pre-existing broad UI failures were not weakened: hardening still
  expects the removed Gantt opened-modal marker, and strict visual-unification
  still reports historical adoption thresholds after legacy renderer cleanup.
  No visual/browser test was claimed for this accelerated batch.
- Live health reports `ok`, version `v.1.500.71`, shared state `ready`, all 25
  policy surfaces React, zero evaluation/legacy surfaces, no effective
  `MES_REACT_*` flags and no evaluation drop-ins. `.70` passed exact rollback
  dry-run; `.18` remains sealed and unchanged.
- No completion marker or accepted Pilot scenario changed. Implementation
  remains `99%`; honest evidence-weighted progress remains `50%`. Blueprint UI
  was not introduced.

Next accelerated batch: type the shared base React island host and `4–5`
compatible browser-only host leaves in one release, then perform one focused
QA/review/release/handoff cycle.

## React island host strict TypeScript batch 2026-07-22: release `.72`

This block supersedes `.71` as the live Pilot pointer. It types the shared
island lifecycle boundary and five compatible leaf hosts without changing
layout, backend authority or command behavior.

- Active Pilot is `v.1.500.72-4c052bc` at exact commit
  `4c052bc76517e21bcb979d7d4dd7a1654b5f1a8c`; immediate previous is
  `v.1.500.71-dc067b3`, pinned legacy remains `v.1.500.18-93d02ed`, and
  Staging remains `v.1.499.70-c3b4059`.
- Source/dist SHA-256 are
  `408dd44894aea98a216d7fe7574dead7ef5e28b62b9e0b2952cf5f8164078808` and
  `41b4d794de87686b3cfdf34295a621162094d6ee51912d2644778740b15b0de4`.
- The shared React island host plus Marking, Dispatch, Employee Desktop,
  Specifications 2 and Timesheet hosts now execute from strict `.ts`; the six
  old `.js` files are absent. All remaining JS host wrappers import the typed
  base, while app/build/registry paths use the typed leaves.
- Active JavaScript fell from `50,942` to `50,504` lines and from `106` to
  `100` files; strict production inventory grew from `27` to `33` TypeScript
  files. No module completion marker changed.
- Direct and mega-QA host imports now use the shared esbuild loader so the
  typed graph is executable on Node 20. Strict typecheck, syntax, focused host
  contracts, React cutover/runtime policy, module/feature registries, clean
  build and `git diff --check` passed. Independent review returned `GO`.
- Two pre-existing stale assertions were not weakened: the broad migration QA
  still expects a removed print-view-model call, and Diagnostics QA expects an
  evaluation legacy fallback that the current fail-closed host forbids. No
  visual/browser QA was claimed for this mechanical batch.
- Local/public health report `ok`, version `v.1.500.72`, shared state `ready`,
  all 25 surfaces React, zero evaluation/legacy surfaces, no effective
  `MES_REACT_*` flags and no evaluation drop-ins. `.71` passed rollback
  dry-run; sealed `.18` remains unchanged.
- Implementation remains `99%`; honest evidence-weighted progress remains
  `50%`. Blueprint UI was not introduced.

Next accelerated batch: type `4–6` of the remaining browser-only island host
wrappers, keeping one focused QA/review/release/handoff cycle.

## React policy host strict TypeScript batch 2026-07-22: release `.73`

This block supersedes `.72` as the live Pilot pointer. It moves five policy
wrappers to strict TypeScript without changing their layout, activation policy,
fallback rules, command authority or module completion status.

- Active Pilot is `v.1.500.73-36727f3` at exact commit
  `36727f3de5b12dd1ba29f0929be2c04aae19efa3`; immediate previous is
  `v.1.500.72-4c052bc`, pinned legacy remains `v.1.500.18-93d02ed`, and
  Staging remains `v.1.499.70-c3b4059`.
- Source/dist SHA-256 are
  `584fbdd2de01f8ef25719d00e44d748e75d1ea9dacd7affb581447413b8be54a` and
  `b71cf09c4ba7782b0115d52d7c522f86c7511fb98f4418c0ee3de346f23d22bb`.
- Contour Admin, Auth Picker, Gantt, Planning Workbench and Weekly Production
  Control hosts now execute from strict `.ts`; their five old `.js` files are
  absent. App, build, ownership registries and direct source-path QA use the
  typed paths.
- Active JavaScript fell from `50,504` to `50,155` lines and from `100` to
  `95` files; strict production inventory grew from `33` to `38` TypeScript
  files. No module completion marker changed.
- Strict typecheck, syntax, focused policy/lazy/runtime contracts, React
  cutover/runtime policy, module/feature registries, clean build, artifact
  marker/specifier checks and `git diff --check` passed. Independent review
  returned `GO` with no P1/P2. No visual/browser QA was claimed for this
  mechanical batch.
- Local/public health report `ok`, version `v.1.500.73`, shared state `ready`,
  all 25 surfaces React, zero evaluation/legacy surfaces, no effective
  `MES_REACT_*` flags and no evaluation drop-ins. `.72` passed rollback
  dry-run; sealed `.18` remains unchanged.
- Implementation remains `99%`; honest evidence-weighted progress remains
  `50%`. Blueprint UI was not introduced.

Next accelerated batch: type the compatible Shift Execution, Roles and
Nomenclature/Boards host wrappers in one bounded release; keep Directories and
the larger Production Structure host as separate follow-up scopes if the
focused preflight confirms their dynamic mount contracts need isolation.
