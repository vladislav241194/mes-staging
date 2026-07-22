# MES Line: честный план React + TypeScript cutover до 100%

Дата повторного аудита: 2026-07-21
Основная ветка миграции: `codex/frontend-react-migration`
Main integration branch: `codex/main-weekly-evidence-port`
Main Weekly integration commits: `813fabe`, `fb38100`
Полный integration range с current-truth docs: `aca289f..codex/main-weekly-evidence-port`
Immutable Pilot acceptance commit: `097d66c416ef61e091099c63b8bc272841c364f5`
Последний strict-accepted Pilot release: `v.1.500.26-097d66c`

## Исправление прежней оценки

Прежняя оценка `99.5–100%` описывала готовность выбранных React-island-срезов:
typed adapter, локальный production-shell QA, reversible evaluation и legacy
rollback. Она не означала, что вся MES Line постоянно работает на React, что
все пользовательские команды перенесены и что legacy-runtime выведен из
обычного пути.

По полным критериям cutover повторный аудит зафиксировал стартовые **44%**.
После создания исполняемого route/surface ledger и устранения двусмысленного
`local-complete` доказанная готовность на той контрольной точке составляла
**46%**. Это рабочая контрольная точка, а не оценка по строкам кода.

После permanent default-on приёмки первого production-среза — Weekly Production
Control на `v.1.500.19-53022a2` — доказанная готовность составляет **48%**.
Прибавлены только два консервативных балла: один за 1/24 постоянно включённых
production-сценариев и один за удаление legacy из обычного пути этого модуля.
Pilot-read балл не повышен: на текущем release по-прежнему принят только один
сценарий из 24. Маркировка остаётся MOCK и в расчёт production-готовности не
входит.

После локального production-shell закрытия трёх owner-backed переходов — выбор
сотрудника в Employee Desktop, навигация периода Timesheet и точный переход
Shift Work Orders в Workshop — функциональный parity вырос ещё на один
консервативный балл. Доказанная готовность на этой контрольной точке составляла
**49%**. Pilot,
permanent-runtime и legacy-consolidation баллы не повышены: этот срез ещё не
опубликован и не принят на Pilot.

После permanent default-on приёмки Structure Migration Diagnostics на
`v.1.500.21-8fb92d9` первоначально было заявлено **50%**. Повторный аудит
mixed runtime показал, что эта цифра была завышена: у Weekly действительно
нет видимого legacy renderer, но production React payload всё ещё строился
через `getWeeklyProductionControlModel()` из legacy `render.js`. После
разделения `visibleLegacyRendererPath` и `runtimeLegacyModelDependency`
accepted-live прогресс исправлен до **48%**. Diagnostics добавляет второй
permanent-runtime балл, но ни он, ни Weekly пока не дают баллов вывода legacy
из normal runtime принятого Pilot release.

На последующем live release `v.1.500.25-1f8369c` выполнена свежая
аутентифицированная evaluation-приёмка Nomenclature через новый server owner:
create -> owner read-back -> edit -> reload/read-back -> delete -> zero cleanup.
Все три команды намеренно выполнялись после истечения пятисекундного cache TTL,
что отдельно доказывает исправление capability-refresh race. После теста
удалены credential, PIN-файлы, systemd drop-ins, evaluation flags и rollback
timer. Это обязательное Foundation-доказательство, но не permanent default-on,
поэтому общий прогресс честно остаётся **48%**.

На `v.1.500.26-097d66c` Weekly consolidation принят на реальном Pilot: React
получает явный raw DTO из bounded Planning Period API, proven server System
Domains и runtime-owner fact/report stores; strict TypeScript самостоятельно
строит недельную модель. Import-graph QA и browser resource proof запрещают
загрузку Weekly/Structure legacy renderer в постоянном React-пути, а model
parity сохраняет `25 x 11`. После fresh authenticated read, точного сравнения
всех строк с `.25` и реального immutable drill `.26 -> .25 -> .26` Weekly
получил два legacy-consolidation балла. Доказанный глобальный прогресс теперь
составляет **50%**; остальные критерии не переоценивались.

## Ускоренный implementation checkpoint 2026-07-22

Отдельный показатель реализации составляет **99%**, тогда как строгая
evidence-weighted Pilot acceptance остаётся **50%**. Все **16/16**
верхнеуровневых маршрутов уже имеют React UI: **11 complete**, **4 partial** и
**1 явный Phase 1 prototype**. Маркер `React TS` показывается только на complete
модулях; partial и prototype не выдаются за завершённые.

- Complete: Nomenclature, Weekly Production Control, Shift Master Board,
  Shift Work Orders, Dispatch (read-only scope), Production Structure Matrix,
  Directories, Auth Prototype, Contour Admin, Timesheet, Auth Session Prototype.
- Partial: Specifications 2, Planning, Gantt, Roles.
- Prototype: Marking.

Marking Phase 1 больше не является memory-only экраном: нормальный путь
использует typed React port, `/api/v1/marking` и изолированные PostgreSQL
таблицы `marking_phase1_*`. Доступны конфигурация, комплекты/коды, партии
печати, подтверждение/ошибка, reprint, завершение, передача/отмена и поиск
кода. Данные остаются явно тестовыми и не меняют production owners;
production traceability, реальный принтер/outbox и Pilot lifecycle acceptance
не засчитаны. Поэтому реализация выросла до 99%, а строгий показатель остаётся
50%.

Auth Session Prototype / Employee Desktop теперь строит рабочие задания,
маршрутный контекст, факты и Report-сводки собственной strict TypeScript
моделью из raw production projections. Обычный React-путь не загружает
`auth_render`; legacy renderer остаётся только за явной rollback-веткой.
Ввод факта использует отдельный command owner и подтверждает общий факт через
существующего PostgreSQL Shift Execution owner. Визуальная и Pilot lifecycle
приёмка намеренно отложены и не повышают строгий показатель 50%.

Planning Workbench остаётся `PARTIAL` с маркером `React TS · MVP`, но его
обычный read-path уже не загружает `planning_workbench/render.js`: strict
TypeScript строит очередь, дерево операций, пять метрик, даты и ревизии напрямую
из PostgreSQL work-order/detail и подтверждённой runtime projection. Изменение
тиража и времени выбранного уже размещённого слота подключены fail-closed к
существующим signed PostgreSQL owners и включаются только при точных server
capabilities. Трудозатраты, первичное размещение и отмена не подменяются моками
или legacy-командами: typed формы/команды уже присутствуют, но строго
заблокированы до появления PostgreSQL owners.

Auth Prototype также больше не загружает `auth_render` в постоянном React-пути:
strict TypeScript строит иерархию сотрудников из raw PostgreSQL System Domains,
а PIN передаётся напрямую подписанному server-session owner с повторной
проверкой сотрудника и actor-bound elevation. Legacy picker сохранён только в
явной fallback/rollback-ветке; Pilot PIN lifecycle остаётся отложенным.

Shift Master Board и Shift Work Orders теперь строят production-модели из raw
Planning, PostgreSQL Shift Execution, System Domains и Timesheet, а обычные
assignment/fact/carryover/navigation команды обслуживает отдельный владелец без
загрузки старой board-модели. Остатки предыдущей смены намеренно read-only до
выпуска нового СЗН, чтобы ускоренный optimistic UI не создавал ложную запись.

Dispatch закрыт как production-backed read-only React TS срез: он строит
таблицу смены из PostgreSQL Planning, bounded Shift Execution и System Domains,
показывает standalone carryovers и fail-closed отказывается помечать
частичную проекцию как production. Обычный путь не загружает
`dispatch/render.js`; маркер `React TS · read-only` появляется только после
полной server-authoritative загрузки. Pilot read отложен.

Nomenclature/Boards получили typed production adapters и отдельного владельца
обычных CRUD/BOM-команд; XLSX-import временно отключён и явно помечен как
отложенный, поэтому клик больше не загружает `products/render.js`. Четыре
Directory-поверхности теперь выбирают permanent React до загрузки большого
`routes/render.js`; старый renderer остался только в rollback-ветке. Новые
завершённые normal-path поверхности имеют видимый маркер `React TS`.

Дополнительно из startup graph убраны rollback-only Planning work-item helper,
ZIP/XML XLSX parser, legacy Directory modal/form/delete и QA-only Shift Work
Orders seed implementation. Они загружаются только за существующими lazy
rollback/action/QA boundaries и не попадают в normal React boot; общий
Directory mutation core остаётся статическим только для React-команд. Следующая
короткая волна также вынесла legacy dense-select, Shift Calendar и Employee
Desktop command owner; последний загружается только перед owner-backed командой.

Production Structure больше не загружает legacy matrix renderer даже для
диагностики: read-only экран получает только компактные исходные строки и
серверный migration report, тогда как полный старый модуль доступен исключительно
после явного отклонения permanent React.

Gantt permanent path теперь получает raw PostgreSQL runtime projection и строит
строки, упрощённую геометрию и последовательные зависимости собственной strict
TypeScript моделью. Он возвращается до загрузки `gantt_runtime/render.js`.
Маркер в заголовке честно показывает `React TS · прототип`: точные календари,
physical split slots, resize, dependency editing и optimization отложены.
Перетаскивание старта физического слота теперь использует существующий signed
`reschedule-slot` owner; отдельная кнопка обновляет только PostgreSQL-проекцию,
не выдавая её за отсутствующий пересчёт производственных календарей.

Specifications 2.0 permanent path больше не загружает
`specifications2/render.js`: реестр и immutable PostgreSQL revision читает typed
production model, а выбор, повторную публикацию существующей ревизии и создание
заказ-наряда обслуживают отдельные server owners. Чтобы ускоренный cutover не
создавал ложную parity, первая публикация без существующей revision, mutable
draft edit, структурные операции, маршруты и привязка вложений явно
заблокированы до независимых server owners. Evaluation/legacy ветка сохранена
только для rollback.

Visual QA и широкие локальные browser-lifecycle fixtures на этой ускоренной
волне отложены владельцем и не засчитываются как Pilot acceptance. До
настоящих 100% остаются: закрыть action/owner parity и
legacy data/model dependencies в partial-модулях; подключить к готовому
Marking Phase 1 API production traceability, printer outbox и employee RBAC;
перевести активный runtime на strict
TypeScript; пройти Pilot read/write lifecycle с cleanup; затем выполнить
permanent default-on, soak и rollback/reactivation acceptance.

Ops checkpoint `v.1.500.46-7a359c4` активирован на Pilot с зелёным
local/public health. Все 25 runtime-поверхностей имеют режим `react`,
evaluation/legacy surfaces отсутствуют, штатные command owners остаются `ON`.
Dry-run на immediate previous `.45` прошёл. Pinned legacy `.18` сохранён;
его отдельный dry-run был доказан на предыдущей волне после контролируемого
временного отключения несовместимых owners. Реальный rollback не выполнялся,
release pointer остался на `.46`.

Следующий accelerated checkpoint `v.1.500.47-37f7ecb` активирован на Pilot:
local/public health `ok`, shared state `ready`, migration
`035_marking_phase1_prototype` применена (marker `1`, семь таблиц), active
evaluation surfaces и effective `MES_REACT_*` flags отсутствуют. Immediate
previous `.46` успешно разрешается dry-run. Pinned legacy `.18` и его manifest
сохранены, но новый dry-run корректно остановлен compatibility guard до
контролируемого отключения Specifications 2 command owners; guard не
обходился. Визуальная и authenticated lifecycle-приёмка `.47` пропущены по
ускоренному режиму, поэтому strict acceptance остаётся 50%.

Accelerated release `v.1.500.48-e02dbb0` продолжает именно удаление mixed
runtime без визуальной полировки. Он активирован на Pilot: local/public health
`ok`, shared state `ready`, active evaluation surfaces отсутствуют, release
pointer ведёт на `.48`. У полностью отмеченных `Shift Work Orders`, `Timesheet` и
`Contour Admin` удалены достижимые current-release legacy renderer imports,
страницы, overlays и event fallback: ошибка React теперь остаётся в
fail-closed React shell, а возврат обеспечивается предыдущим immutable
release. Общая Shift Work Orders production model перенесена в активный
`src` как TypeScript и используется React island и journal consumers без
`shift_work_orders/render.js`. Auth role resolver вынесен из большого
`products/render.js`; server-configured Nomenclature Types больше не считает
legacy delete usage. Planning и Roles получили typed controls для оставшихся
команд, но capability остаётся `false` до появления PostgreSQL owners, поэтому
их маркеры честно остаются `MVP/partial`. Specifications 2 повторно публикует
существующую ревизию через server owner; mutable draft/first publish/routes и
attachment binding остаются partial. Визуальные проверки кандидата пропущены,
implementation-показатель остаётся 99%, strict acceptance — 50% до Pilot
lifecycle. Marking cleanup dry-run показал ноль строк во всех семи isolated
Phase 1 таблицах; destructive cleanup не запускался. Immediate previous `.47`
успешно прошёл rollback dry-run.

Release `v.1.500.49-df23074` активирован на Pilot и расширяет тот же
ускоренный cut без визуальной полировки: current runtime больше не загружает
legacy renderer/events для
`Weekly Production Control`, `Номенклатуры`, `Плат/BOM`, `Авторизации` и
`Рабочего стола исполнителя`. Все пять маршрутов принадлежат fail-closed
React-host; командные owners, RBAC, signed employee session и переход
`bomLists` сохранены. Реестры владения указывают на React-host и TypeScript
сценарии, а завершённые модули продолжают показывать маркер `React TS`.
Большие legacy-файлы пока остаются недостижимыми артефактами текущего checkout;
операционный rollback обеспечивается предыдущим immutable release. Browser и
visual QA намеренно не выполнялись, поэтому strict acceptance остаётся 50%.
Local/public health `ok`, shared state `ready`, evaluation surfaces пусты;
source/dist SHA-256 —
`39283e43a8b643c6fc764c273917587c538e32461a009078c069c7f22567b751` и
`0bcf8b3115adf980295eb4fbff18bee51f19ca386386e6e34721a73171576b55`.
Dry-run immediate rollback на `.48` прошёл. Pinned legacy `.18` сохранён, но
его dry-run ожидаемо остановлен compatibility guard трёх включённых
Specifications 2 command-owner drop-ins; guard не обходился.

Release `v.1.500.50-8e8a384` активирован на Pilot и физически удаляет из
current checkout четыре уже недостижимых legacy-файла: Auth render/events,
Weekly Production Control
renderer и Nomenclature renderer — суммарно 3 349 строк legacy source.
Сохранённые contract-QA теперь проверяют React production models, owners и
физическое отсутствие retired artifacts. Runtime-поведение, API, RBAC,
PostgreSQL owners и completion-маркеры не меняются. Операционный rollback
по-прежнему выполняется переключением на предыдущий immutable release, а не
возвратом к удалённому renderer внутри нового bundle. Browser/visual QA для
этого cleanup намеренно не выполнялся; strict acceptance остаётся 50%.
Local/public health `ok`, shared state `ready`, evaluation surfaces пусты;
source/dist SHA-256 —
`cec1413eef1b4f2a847cac25d7cc5d30fd250ce5a1a893630abf60edd65dfc65` и
`b8c436e4aa9561e27a2eef147a314781d5643bdae60276ca167bad4632ffca5b`.
Immediate rollback dry-run на `.49` прошёл. Первая попытка stage с commit
`96e1613` была безопасно остановлена immutable-source guard: build обновлял
tracked icon registry после удаления двух legacy-only иконок. Generated diff
включён в `8e8a384`; незавершённый кандидат не активировался.

Release `v.1.500.51-6ec4524` активирован на Pilot из точного commit
`6ec45246b1e87b166948a819270e2a2ae9810f1b`. Он удаляет same-release UI
fallback ещё у трёх полностью отмеченных модулей: `Мастерская`,
`Справочники` (4/4 раздела) и `Структура и сотрудники` (7/7 реестров). Их
маршруты всегда возвращают fail-closed React target; legacy modals/bind и
action-level fallback-мосты удалены. Количество `requestLegacyRender` в app
shell снижено с 17 до 5; пять оставшихся относятся только к честно
partial-модулям Planning, Marking, Specifications 2, Gantt и Roles. Большие
legacy-файлы Мастерской/Структуры пока сохранены как shared model/helper
compatibility source, но current route их больше не загружает как UI. Server
owners, RBAC, навигация, print/fact и completion-маркеры сохранены.
Local/public health `ok`, версия `v.1.500.51`, shared state `ready`, active
evaluation surfaces пусты; service и release pointer указывают на `.51`.
Source/dist SHA-256 —
`436a9a9be80d67b1d071d57de1f71e58ab6f391d4742752de62ed8570b3ba7b6` и
`6ff1ce0eb27c9c234c0f5c12c1e654d774f3a293137f1e500f476a08ed7a0025`.
Immediate rollback dry-run разрешён и точно возвращает предыдущий immutable
release `v.1.500.50-8e8a384`; pinned legacy `.18` сохранён. Browser/visual QA
намеренно не выполнялся; implementation остаётся 99%, strict acceptance —
50%.

Release `v.1.500.52-ee9cfd5` активирован на Pilot из точного commit
`ee9cfd5f3083e5b7e417736a54f925bb148e20ab`. Planning и Marking теперь
всегда возвращают fail-closed React target и не имеют same-release UI
fallback. Из checkout физически удалены Planning renderer и legacy selection
helpers — 2 155 строк; `requestLegacyRender` в app shell снижен с 5 до 3 и
остался только у partial Specifications 2, Gantt и Roles. Planning явно
блокирует `labor`, `transfer-to-gantt` и `cancel` кодом `owner-unavailable`, а
Marking production bundle больше не импортирует memory-only mock client.
Roles получил owner-backed немедленное добавление второй роли через
PostgreSQL access-control aggregate с exact assignment-set/stable-ID/RBAC
guards; effective window, scopes и durable `readOnly` остаются partial.
Маркеры partial/complete намеренно не повышались. Local/public health `ok`,
версия `v.1.500.52`, shared state `ready`, evaluation surfaces пусты; service
и release pointer указывают на `.52`. Source/dist SHA-256 —
`7c2589795b93905b817496c3a0a3fab00dfc8de10479e257f8742a180b42ceee` и
`2e421fcb6262b89bc790ddd310faa32998f482d6ad77738857b4c9b868895d80`.
Immediate rollback dry-run точно возвращает `v.1.500.51-6ec4524`; pinned
legacy `.18` сохранён. Browser/visual QA намеренно не выполнялся;
implementation остаётся 99%, strict acceptance — 50%.

Release `v.1.500.53-a82f24e` активирован на Pilot из точного commit
`a82f24e0011a471264c7dec49355bd21e99d353f`. Specifications 2 и Gantt теперь
всегда остаются внутри fail-closed React runtime; их same-release legacy
renderers физически удалены. Удалено 10 110 строк runtime source:
`gantt_runtime/render.js`, `gantt_runtime/lazy_facade.js`,
`specifications2/render.js` и `specifications2/publish_flow.js`.
`requestLegacyRender` в app shell снижен с 3 до 1; последний bridge относится
к partial Roles. Gantt получил точный PostgreSQL projection/physical-slot
read-back, безопасную навигацию и явные blocked owners. Specifications 2
публикует только подготовленный N+1 fingerprint и подтверждает результат
forced PostgreSQL read-back без повторной совместимой snapshot-записи.
Оба модуля остаются `PARTIAL`: у Gantt нет owners для dependency edit/resize/
calendar recalculation/optimization, у Specifications 2 не закрыта полная
историческая relational-digest parity и mutable owner-поверхности.

Local/public health `ok`, версия `v.1.500.53`, shared state `ready`, evaluation
surfaces пусты; service и release pointer указывают на `.53`. Source/dist
SHA-256 — `f9f2d462ca9cb48e6a697d95447925e7abd98c453e6821cbee708888db7f8f9f`
и `bbe83cd0a8ce14b723237b1802dff2173903f6bc83e65bbe4563d773ff606bc2`.
Immediate rollback dry-run точно возвращает `v.1.500.52-ee9cfd5`. Pinned
legacy `v.1.500.18-93d02ed` остаётся запечатанным, но его dry-run правильно
заблокирован включёнными Specifications 2 attachments/Work Orders/publication
command owners; перед реальным legacy drill их необходимо штатно отключить
root-owned скриптами, а guard обходить нельзя. Узкие production-shell smoke
Gantt и Specifications 2, strict TypeScript, syntax, owner/runtime QA, fresh
dist и boot QA прошли. Visual snapshot QA и authenticated Pilot lifecycle
намеренно не выполнялись; полный all-modules smoke отдельно упирается в старый
Planning empty-fixture contract. Implementation остаётся 99%, strict
acceptance — 50%. Blueprint UI не используется.

## Что проверено 2026-07-21

- Текущий live Pilot release `v.1.500.26-097d66c` прошёл полный чистый QA,
  release staging и активацию; immediate previous —
  `v.1.500.25-1f8369c`, pinned legacy — `v.1.500.18-93d02ed`.
- Pilot здоров по local/public health, shared state — `ready`. Activation
  record привязан к commit
  `097d66c416ef61e091099c63b8bc272841c364f5`, source SHA-256
  `5e18604248301baac1226a16f7107efb88ad699687efc85a6c2d8c1853197845`
  и dist SHA-256
  `af65df86efa81557f3d2f5d4a805d1c1da9f40f57b0a4ee8d7ad5b3bcd1485d2`.
- Runtime сообщает ровно две permanent React-поверхности:
  `structureMigrationDiagnostics` и `weeklyProductionControl`; active evaluation
  surfaces отсутствуют.
- Эффективные evaluation flags и systemd drop-ins отсутствуют.
- Историческая аутентифицированная приёмка Diagnostics остаётся привязанной к
  `.21`, а не выдаётся за свежую `.26`-проверку. На `.21` в desktop проверены:
  152 строки, 5 заголовков, 51 исходное поле, метрики
  `152 / 76 / 19 / 49 / 0 / 0`, 4 issue groups с двумя ignored rows,
  7 registry links, `aria-busy=false`, нулевое число inputs/write controls,
  отсутствие page overflow, query isolation, чистый accessible browser log и
  переходы в соседние legacy-реестры.
  Narrow Pilot не засчитан: platform restriction не позволил изменить
  viewport в управляемой Pilot-сессии.
- Weekly проверен на `.26` в desktop: React `ready`, `aria-busy=false`, таблица
  `25 x 11`, и текст каждой строки точно совпал с immutable `.25`. Live
  DOM/error state чистый; live-console capture был недоступен, поэтому чистый
  live console не заявляется. Query-isolation на `.26` отдельно не повторялся;
  narrow приёмка остаётся исторически доказанной на `.19`.
- Выполнен реальный previous-release rollback drill `.26 -> .25 -> .26`:
  после rollback и реактивации Weekly сохранил точный `25 x 11` и тот же текст
  строк. Pinned legacy `v.1.500.18-93d02ed` разрешён dry-run-проверкой и имеет
  нулевой список React surfaces, но в этом drill не активировался.
- Legacy rollback сохранён как отдельный immutable release; он не смешан с
  обычным runtime двух permanent-сценариев.
- Полный QA, TypeScript, архитектурные и release provenance проверки проходят.
- Employee Desktop person selection/reload/RBAC, Timesheet week/month/period
  navigation с принудительным mount-error rollback и Shift Work Orders exact
  Workshop source/date navigation со stale/RBAC fail-closed проверками проходят
  в isolated и production-shell QA.
- В верхнем реестре системы 16 модулей.
- В коде 26 React islands: 25 сценариев command-parity и отдельная Маркировка.
- 22 из 24 сценариев имели двусмысленный статус `local-complete`; после аудита
  он заменён на `slice-complete`. Два read-only сценария имеют статус
  `not-applicable`. Этот статус означает завершение выбранного среза, а не всей
  функциональности модуля.
- Во всех 25 сценариях сохраняется legacy rollback.
- По накопленному журналу Pilot meaningful read evidence есть у 21/25
  сценариев, но оно собрано на разных релизах. На текущем
  `v.1.500.26-097d66c` fresh browser read доказан только для Weekly Production
  Control — 1/25; Diagnostics остаётся историческим `.21` evidence.
- Полный Pilot create/edit/read-back/delete/cleanup доказан только для
  Номенклатуры на историческом `v.1.500.25-1f8369c`: 1 из 22 write-сценариев.
  Точная disposable запись `nom-70a3f62d-93d0-46d3-b012-2c56def8e0d7` /
  `MOCK-QA-V25-20260721-0740` удалена; итоговый owner read-back — 0 строк и
  0 точных совпадений. Это evaluation-доказательство не превращено в
  default-on acceptance.
- Permanent rollout доказан для Weekly Production Control и Structure
  Migration Diagnostics; остальные 23 production-сценария не засчитаны
  как default-on.
- Accepted Pilot Weekly больше не имеет runtime dependency от legacy model
  factory в normal path. Legacy Weekly runtime сохранён только в явном lazy
  rollback selector.
- `requestLegacyRender` остаётся в 25 явных host/runtime definitions.
- `dispatch` имеет production-backed read-only React-island; свежая Pilot read-приёмка отложена.
- `marking` всегда открывается через React и имеет durable Phase 1 API/БД в
  отдельном `test-state`; production traceability и printer owner ещё не
  подключены.
- Strict TypeScript покрывает React-island-дерево и новый Weekly read-model, но
  не весь активный frontend-runtime: исполняемый audit сейчас видит 150
  JavaScript-файлов и около 94 тыс. строк кода в `src`. Две production
  TypeScript boundary уже находятся в `src`: Marking API client и общий
  Shift Work Orders production model; остальная typed boundary пока остаётся
  в `experiments/react-migration`.

## Формула прогресса

| Критерий полного cutover | Вес | Доказано | Почему не максимум |
| --- | ---: | ---: | --- |
| Полный scope и typed React-поверхность | 15 | 14 | Все routes/islands/aliases/commands учтены; Dispatch закрыт в read-only scope, Marking остаётся изолированной Phase 1, TypeScript ещё не покрывает весь runtime |
| Функциональный parity без обычного возврата в legacy | 25 | 18 | В Roles, Planning, Boards/BOM, Shift Master, Employee Desktop, Specifications 2.0 и Gantt остаются owner/schema gaps; React показывает их fail-closed, а не вызывает legacy |
| Реальная Pilot read/write приёмка | 20 | 9 | Historical read 21/25; fresh current-release read 1/25; полный write lifecycle только 1/22 и на историческом `.25` |
| Постоянный default-on React runtime | 20 | 2 | Permanent приняты Weekly и Diagnostics: 2/25 production-сценариев; остальные не засчитаны |
| Вывод legacy из обычного runtime | 15 | 2 | Weekly больше не использует legacy model factory в normal path; Diagnostics остаётся внутри смешанного Structure route |
| Strict QA, release и rollback-контроли | 5 | 5 | Полный QA/stage, immutable provenance, previous-release rollback/reactivation и legacy dry-run доказаны |
| **Итого** | **100** | **50** | `.26` добавил только 2 балла за доказанный вывод Weekly production read-model из normal legacy runtime |

Расчёт прироста в целочисленной ведомости: permanent runtime —
`round(20 × 2/25) = 2`; legacy consolidation становится 2 только после `.26`,
потому что Weekly теперь не зависит от legacy read-model, а Diagnostics не
выводит из legacy весь верхнеуровневый `productionStructureMatrix`. Pilot
acceptance остаётся 9 баллов: fresh current-release coverage составляет 1/25,
а historical write coverage — 1/22; следующий консервативный порог не пройден.
Functional parity остаётся 18.
Итого: `14 + 18 + 9 + 2 + 2 + 5 = 50`.

Процент меняется только после появления перечисленного доказательства. Зелёный
локальный тест сам по себе не увеличивает Pilot/default-on/legacy-removal часть.

## Неполные функциональные области

### Roles и доступ

- Pilot acceptance и cleanup для targeted immediate multiple-assignment owner;
- durable persistence для effective-window assignments;
- System Domains registry/owner/persistence для subject/assignment responsibility scopes;
- durable `readOnly` owner/persistence; role-default `self` уже реализован;
- assigned/current-role deactivation остаётся fail-closed invariant, пока
  владелец продукта явно не определит атомарную replacement-семантику;
- полный reset access control не является parity gap: это compatibility-only
  destructive operation, которую Pilot/staging/user-testing/production
  блокируют до мутации при `MES_ALLOW_DESTRUCTIVE_ACTIONS=false`.

### Planning и производственное исполнение

- Pilot lifecycle для локально готовых owner-backed даты старта, количества и
  переноса слота; трудозатраты, первичное размещение и отмена остаются typed,
  но заблокированными scope без owners;
- ручное перемещение lane в Shift Master;
- durable Report persistence и Pilot lifecycle Employee Desktop;
- Pilot assignment/fact lifecycle Shift Work Orders.

### Specifications 2.0 и Boards/BOM

- add/remove/reparent дерева;
- привязка вложений;
- полная структура маршрута;
- непустая Pilot read/write-приёмка.

### Gantt

- редактирование зависимостей;
- resize и точная physical-slot геометрия (drag старта уже owner-backed);
- пересчёт по рабочим календарям (обычный projection refresh уже есть);
- оптимизация и связанные write-контракты.

### Marking

- утвердить production owner поверх готового Phase 1 API;
- подключить реальный printer outbox и production traceability;
- выполнить cleanup, employee-RBAC и Pilot lifecycle-приёмку.

### Dispatch

- read-only production scope локально закрыт на React TS;
- осталась current-release Pilot read-приёмка;
- write-функции не включены в утверждённый read-only scope и не скрыто засчитываются.

## План закрытия

### Блок 0. Исправить реестр и метрики — цель 46%

1. Создать единый route/module registry для всех 16 верхнеуровневых модулей.
2. Для каждого модуля перечислить экраны, команды, owner, read/write,
   Pilot evidence, runtime mode и legacy fallback.
3. Заменить двусмысленный `local-complete` на отдельные состояния:
   `slice-complete`, `module-partial`, `pilot-accepted`, `default-on`.
4. Отдельно классифицировать Dispatch и production-границу Marking.
5. Добавить исполняемый QA, который пересчитывает этот ledger и запрещает
   объявлять 100% при пропущенном route/command.

Готово, когда: все пользовательские маршруты и действия имеют строку в ledger,
а итоговый процент воспроизводится командой QA.

Статус 2026-07-21: исполняемый ledger добавлен в
`experiments/react-migration/cutover-ledger.json`; команда
`npm run qa:react-cutover` сверяет 16 маршрутов, 25 сценариев, 21/25 historical
Pilot reads, 1/25 current-release reads, 1/22 historical Pilot writes, две
permanent React-поверхности и доказанные 50% при сохранённой контрольной точке
46%.
Ledger также сверяет все 26 island entry points, deep-link aliases,
implemented/missing commands, normal-action fallback, immutable release
evidence и отсутствие зависимости Blueprint UI. Dispatch помечен как
`read-only-complete`, но не как Pilot-accepted; Marking остаётся `mock-not-production`.

Mixed-runtime schema хранит accepted-live
`runtimeLegacyModelDependency=false`, exact `.26` provenance, fresh Pilot read
и rollback/reactivation evidence. Pending candidate-поля удалены; два
legacy-consolidation балла защищены исполняемым QA и не могут появиться только
из локального typecheck/model-parity/import-graph результата.

Блок 0 завершён.

### Блок 1. Закрыть полный функциональный parity — цель 60%

1. Реализовать перечисленные выше legacy-only команды вертикальными срезами.
2. Для каждого среза соблюдать цепочку: typed adapter -> существующий owner ->
   React UI -> fail-closed policy QA -> legacy read-back -> cleanup proof.
3. Не переносить authority, SQL, RBAC или нормализацию данных в React.
4. Обычное пользовательское действие не должно вызывать
   `requestLegacyRender`; runtime fallback разрешён только при ошибке mount.

Готово, когда: у каждого in-scope модуля все команды React-complete или
обоснованно `not-applicable`, без скрытого возврата к legacy по клику.

### Блок 2. Создать production runtime contract — цель 70%

1. Заменить набор временных boolean/query evaluation-флагов явным режимом
   модуля: `legacy | evaluation | react`.
2. Write capabilities получать из RBAC и server owner, а не из URL-флага.
3. Добавить telemetry: mount success, fallback reason, command result,
   latency/error rate, release commit.
4. Подготовить один root-managed permanent rollout-конфиг и точный обратимый
   switch на предыдущий immutable release.

Готово, когда: React можно постоянно включить для выбранного модуля без
session/query-флага, а rollback не требует изменения данных или кода.

Статус 2026-07-21: production runtime contract доказан на двух read-only
сценариях. `weeklyProductionControl` и `structureMigrationDiagnostics`
постоянно включены policy release, не зависят от query/evaluation flags, а
previous-release rollback `.26 -> .25 -> .26` выполнен. Pinned legacy `.18`
сохранён и проверен dry-run, без активации в текущем drill. Блок не закрыт глобально:
остальные 22 production-сценария ещё не прошли permanent rollout.

### Блок 3. Пройти Pilot acceptance волнами — цель 85%

Волна A — read-only и минимальный риск:

- Weekly Production Control;
- migration diagnostics и другие действительно read-only экраны.

Волна B — справочники:

- Component Types, Operations, Nomenclature Types, Statuses;
- Boards/BOM;
- Structure registries;
- Timesheet и Nomenclature.

Волна C — критические рабочие процессы:

- Roles;
- Planning;
- Shift Work Orders и Shift Master;
- Employee Desktop;
- Specifications 2.0;
- Gantt;
- Auth и Contour Admin;
- production Marking после появления owner/API.

Каждый write-сценарий требует: disposable create -> read-back -> edit -> reload
-> delete/archive -> cleanup -> legacy/release rollback. Реальные рабочие записи
не используются. Для destructive шага сохраняется отдельное подтверждение.

Оставшиеся обязательные read-наборы: непустые Boards/BOM, Responsibility
Policies и реальный Contour Admin на корректном mapped host.

Статус волны A 2026-07-21: Weekly Production Control принят на текущем
`v.1.500.26-097d66c`; Structure Migration Diagnostics имеет историческую
desktop-приёмку `.21` и на `.26` отдельно не перепроверялся. Weekly narrow
доказательство получено ранее на `.19`. Diagnostics narrow не засчитан из-за
platform restriction. Волны B и C остаются незакрытыми.

Статус Foundation волны B 2026-07-21: live release `.25` доказал
аутентифицированный RBAC/CAS/idempotency command-owner Номенклатуры полным
одноразовым lifecycle и нулевым cleanup. Production preview wiring, root-private
employee credential CLI и capability refresh после истечения TTL также
проверены на реальном Pilot. Foundation завершён, но остаётся evaluation-only.
Постоянный default-on запрещён до объединения всех писателей общей
Directory-проекции: Типов номенклатуры, Плат/BOM, Спецификаций и их
фоновых/cross-module записей. Временная Pilot-приёмка Foundation не увеличивает
глобальный процент; она является обязательным предусловием следующего
owner-backed вертикального среза.

Готово, когда: все in-scope сценарии имеют свежую browser/Pilot приёмку на
одном и том же release, а после тестов не остаётся mock-записей.

### Блок 4. Permanent default-on и ручная унификация UI — цель 95%

1. Включать модули волнами с наблюдением и измеримым soak-периодом.
2. После включения проводить ручной аудит только итогового React-пути:
   таблицы, формы, панели, drawer/modal, empty/loading/error, клавиатура,
   accessibility и responsive-состояния.
3. Использовать существующий уникальный дизайн MES Line и его tokens/components.
   Blueprint UI не использовать.
4. Устранить переключение верстки между Номенклатурой и Типами номенклатуры:
   переход, reload и deep-link должны оставаться в одном React-shell.
5. Сохранять baseline/after screenshots и протокол принятия по модулю.

Готово, когда: все принятые модули постоянно открываются в React, не меняют
дизайн при переходе/reload и выдержали Pilot soak без критических ошибок.

Статус 2026-07-21: default-on доказан для Weekly Production Control и
Structure Migration Diagnostics. Responsive/narrow Pilot-приёмка доказана
только для Weekly; Diagnostics принят в desktop, а narrow не засчитан
из-за platform restriction. Это не означает завершение ручной унификации
остальных таблиц, форм и модулей.

### Блок 5. Убрать mixed runtime и доказать финальный rollback — цель 100%

1. После soak удалить legacy renderer/event bindings из обычного пути
   мигрированных routes.
2. Удалить временные evaluation query flags, мёртвые CSS/JS и дублирующие
   UI-реализации.
3. Довести весь активный frontend-runtime до строгой TypeScript-проверки,
   а не только React-island-дерево.
4. Сохранить rollback как предыдущий immutable release и root-controlled switch,
   а не как постоянно смешанный интерфейс.
5. Выполнить drill: новый release -> предыдущий legacy release -> новый release;
   проверить health, данные, маршруты и отсутствие миграционного residue.
6. Провести финальную ручную приёмку всех модулей владельцем продукта.

Готово, когда: normal runtime не содержит пользовательского fallback в legacy,
все in-scope routes default-on React, строгий QA зелёный, Pilot acceptance полон,
а release rollback реально выполнен и задокументирован.

Статус 2026-07-21: исторические rollback chains `.21 -> .20 -> .21` и
`.21 -> .18 -> .19 -> .20 -> .21` сохранены как evidence своей контрольной
точки. Для текущего live `.26` выполнен фактический drill
`.26 -> .25 -> .26`; pinned immutable legacy `.18` дополнительно разрешён
dry-run и не активировался. Финальный drill всей системы и вывод mixed runtime
для остальных маршрутов ещё не закрыты.

Weekly завершил первый принятый live шаг этого блока: strict TS read-model
получает только canonical System Domains, bounded Planning Period и явный raw
execution/report DTO; normal React selector не вызывает lazy legacy loader.
Legacy loader сохранён только как явный rollback path. Exact `.26` publication,
fresh authenticated Pilot read, row parity с `.25` и rollback/reactivation
зафиксированы в ledger; за это начислены ровно два legacy-consolidation балла.

## Определение настоящих 100%

Задача считается выполненной на 100% только одновременно при выполнении всех
условий:

- каждый route верхнего реестра реализован на React или явно исключён из scope;
- все обычные действия остаются внутри React и имеют owner-backed parity;
- все применимые read/write сценарии приняты на реальном Pilot с cleanup;
- React постоянно включён, а не активируется evaluation/query-флагом;
- переходы и reload не переключают пользователя между двумя верстками;
- весь активный frontend проходит строгую TypeScript-проверку;
- изолированный Marking Phase 1 test-state не считается завершённой production
  traceability;
- legacy отсутствует в normal runtime, но предыдущий release сохранён и
  проверен как rollback;
- интерфейс принят вручную и соответствует дизайну MES Line;
- Blueprint UI отсутствует.

## Правило отчётности

После каждого глобального блока отчёт должен содержать:

1. процент до и после;
2. какие пункты definition of done закрыты;
3. ссылки на commit, QA и Pilot evidence;
4. какие legacy пути ещё активны;
5. что именно необходимо для следующего процента.

Нельзя повышать процент за повторный запуск уже существующего теста, подготовку
скрипта без запуска или временное evaluation-включение без Pilot acceptance.
