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
- Оставшиеся frontend-visible команды без безопасного owner по-прежнему
  подтверждены кодом: Responsibility Policy lifecycle; Roles `readOnly`,
  multiple/effective-window и personal/assignment scopes; Planning dates/labor;
  Specifications attachment binding/route structure; Gantt dependency editing,
  drag/resize/optimization и Workshop manual lane movement.
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
