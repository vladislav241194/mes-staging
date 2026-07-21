# MES Line: честный план React + TypeScript cutover до 100%

Дата повторного аудита: 2026-07-21  
Рабочая ветка: `codex/frontend-react-migration`  
Immutable permanent-acceptance commit: `8fb92d9`

Текущий live Pilot commit: `1f8369c`

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
`v.1.500.21-8fb92d9` доказанная готовность составляет **50%**. Добавлен
только один балл permanent runtime: теперь без evaluation/query-флагов
постоянно работают два read-only сценария из 24. Pilot acceptance
остаётся 9 баллов, а legacy consolidation — 2: Diagnostics входит в
смешанный `productionStructureMatrix`, где шесть соседних реестров
по-прежнему имеют normal legacy path.

На последующем live release `v.1.500.25-1f8369c` выполнена свежая
аутентифицированная evaluation-приёмка Nomenclature через новый server owner:
create -> owner read-back -> edit -> reload/read-back -> delete -> zero cleanup.
Все три команды намеренно выполнялись после истечения пятисекундного cache TTL,
что отдельно доказывает исправление capability-refresh race. После теста
удалены credential, PIN-файлы, systemd drop-ins, evaluation flags и rollback
timer. Это обязательное Foundation-доказательство, но не permanent default-on,
поэтому общий прогресс честно остаётся **50%**.

## Что проверено 2026-07-21

- Текущий live Pilot release `v.1.500.25-1f8369c` прошёл полный чистый QA,
  release staging и активацию; immediate previous —
  `v.1.500.24-200ba06`.
- Pilot здоров по local и public health. Activation record привязан к commit
  `1f8369cb6725a53e029acd0d66d57a764289a79d`, source SHA-256
  `b78458eda659099c50957b29c96a396adcaa6667497caa329a24f96cba12bc20`
  и dist SHA-256
  `dc12962a4ec775d247f6750eb9a8bb5002c1e1c39e9428e89829da8b6726b4b3`.
- Принятый permanent baseline остаётся `v.1.500.21-8fb92d9`; его исторический
  immediate previous — `v.1.500.20-a4d8b2f`.
- Runtime сообщает ровно две permanent React-поверхности:
  `structureMigrationDiagnostics` и `weeklyProductionControl`; active evaluation
  surfaces отсутствуют.
- Эффективные evaluation flags и systemd drop-ins отсутствуют.
- На реальном аутентифицированном Pilot Diagnostics проверен в desktop:
  152 строки, 5 заголовков, 51 исходное поле, метрики
  `152 / 76 / 19 / 49 / 0 / 0`, 4 issue groups с двумя ignored rows,
  7 registry links, `aria-busy=false`, нулевое число inputs/write controls,
  отсутствие page overflow, query isolation, чистый accessible browser log и
  переходы в соседние legacy-реестры.
  Narrow Pilot не засчитан: platform restriction не позволил изменить
  viewport в управляемой Pilot-сессии.
- Weekly повторно проверен на `.21` в desktop: 25 строк, 11
  заголовков, React `ready`, `aria-busy=false`, нулевое число inputs/write
  controls, отсутствие page overflow, query isolation и чистый accessible browser
  log. Narrow приёмка Weekly
  остаётся исторически доказанной на `.19`, а не повторно засчитанной
  на `.21`.
- Выполнен реальный rollback drill: `.21 -> .20 -> .21`, затем
  `.21 -> .18 -> .19 -> .20 -> .21`. Pinned legacy release
  `v.1.500.18-93d02ed` вернул нулевую policy: Diagnostics deep link
  канонизировался в 19-строчный legacy Org Units, Weekly стал legacy `25 x 11`.
  Финальная реактивация `.21` восстановила две permanent React-поверхности.
- Legacy rollback сохранён как отдельный immutable release; он не смешан с
  обычным runtime двух permanent-сценариев.
- Полный QA, TypeScript, архитектурные и release provenance проверки проходят.
- Employee Desktop person selection/reload/RBAC, Timesheet week/month/period
  navigation с принудительным mount-error rollback и Shift Work Orders exact
  Workshop source/date navigation со stale/RBAC fail-closed проверками проходят
  в isolated и production-shell QA.
- В верхнем реестре системы 16 модулей.
- В коде 25 React islands: 24 сценария command-parity и отдельная Маркировка.
- 22 из 24 сценариев имели двусмысленный статус `local-complete`; после аудита
  он заменён на `slice-complete`. Два read-only сценария имеют статус
  `not-applicable`. Этот статус означает завершение выбранного среза, а не всей
  функциональности модуля.
- Во всех 24 сценариях сохраняется legacy rollback.
- По накопленному журналу Pilot meaningful read evidence есть у 21/24
  сценариев, но оно собрано на разных релизах. На принятом permanent baseline
  `v.1.500.21-8fb92d9` fresh read доказан для Weekly Production Control
  и Structure Migration Diagnostics — 2/24. Nomenclature дополнительно принят
  в evaluation на текущем `.25`, но не засчитан как permanent read.
- Полный Pilot create/edit/read-back/delete/cleanup доказан только для
  Номенклатуры на текущем `v.1.500.25-1f8369c`: 1 из 22 write-сценариев.
  Точная disposable запись `nom-70a3f62d-93d0-46d3-b012-2c56def8e0d7` /
  `MOCK-QA-V25-20260721-0740` удалена; итоговый owner read-back — 0 строк и
  0 точных совпадений. Это evaluation-доказательство не превращено в
  default-on acceptance.
- Permanent rollout доказан для Weekly Production Control и Structure
  Migration Diagnostics; остальные 22 production-сценария не засчитаны
  как default-on.
- `requestLegacyRender` остаётся в 29 host/runtime местах.
- `dispatch` не имеет React-island и остаётся видимым placeholder-модулем.
- `marking` всегда открывается через React, но пока явно является
  `memory-only MOCK`: без API, БД и сохранения.
- Strict TypeScript покрывает React-island-дерево, но не весь активный
  frontend-runtime: в `src` остаётся примерно 83 тыс. строк legacy JavaScript,
  включая `src/app.js` размером более 10 тыс. строк.

## Формула прогресса

| Критерий полного cutover | Вес | Доказано | Почему не максимум |
| --- | ---: | ---: | --- |
| Полный scope и typed React-поверхность | 15 | 14 | Все routes/islands/aliases/commands учтены; Dispatch без island, Marking — MOCK, TypeScript ещё не покрывает весь runtime |
| Функциональный parity без обычного возврата в legacy | 25 | 18 | В Roles, Planning, Boards/BOM, Shift Master, Employee Desktop, Specifications 2.0 и Gantt остаются legacy-only команды |
| Реальная Pilot read/write приёмка | 20 | 9 | Historical read 21/24; permanent-baseline read 2/24; полный write lifecycle только 1/22 и пока evaluation-only |
| Постоянный default-on React runtime | 20 | 2 | Permanent приняты Weekly и Diagnostics: 2/24 production-сценариев; остальные не засчитаны |
| Вывод legacy из обычного runtime | 15 | 2 | Weekly больше не использует legacy в normal path; Diagnostics — permanent-остров внутри смешанного Structure route, поэтому новый legacy-removal балл не начислен |
| Strict QA, release и rollback-контроли | 5 | 5 | Полный QA/stage, immutable provenance и реальный rollback/reactivation drill доказаны |
| **Итого** | **100** | **50** | Weekly дал первые 2 permanent/legacy балла; три owner-backed перехода — 1 functional балл; Diagnostics — второй permanent-runtime балл |

Расчёт прироста в целочисленной ведомости: permanent runtime —
`round(20 × 2/24) = 2`; legacy consolidation остаётся 2, потому что
Diagnostics не выводит из legacy весь верхнеуровневый
`productionStructureMatrix`. Pilot acceptance остаётся 9 баллов: permanent-
baseline coverage остаётся 2/24, а свежий Nomenclature lifecycle `.25` всё ещё
evaluation-only, поэтому следующий консервативный порог не пройден. Functional
parity остаётся 18.
Итого: `14 + 18 + 9 + 2 + 2 + 5 = 50`.

Процент меняется только после появления перечисленного доказательства. Зелёный
локальный тест сам по себе не увеличивает Pilot/default-on/legacy-removal часть.

## Неполные функциональные области

### Roles и доступ

- multiple и effective-window assignments;
- personal/assignment responsibility scopes;
- lifecycle `readOnly` / `active` и связанные owner-контракты.

### Planning и производственное исполнение

- даты запуска, трудозатраты, перенос в Gantt, отмена;
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
- drag/resize;
- оптимизация и связанные write-контракты.

### Marking

- утвердить production owner и API;
- заменить memory-only MOCK настоящим чтением/записью;
- выполнить traceability, reload, cleanup и RBAC-приёмку.

### Dispatch

- либо утвердить ТЗ и реализовать React-модуль;
- либо формально исключить placeholder из текущего cutover scope.

Исключение считается допустимым только после явного решения владельца продукта;
оно не должно незаметно повышать процент.

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
`npm run qa:react-cutover` сверяет 16 маршрутов, 24 сценария, 21/24 historical
Pilot reads, 2/24 current-release reads, 1/22 Pilot writes, две permanent
React-поверхности и доказанные 50% при сохранённой контрольной точке 46%.
Ledger также сверяет все 25 island entry points, deep-link aliases,
implemented/missing commands, normal-action fallback, immutable release
evidence и отсутствие зависимости Blueprint UI. Dispatch помечен как
placeholder до ТЗ, Marking — как `mock-not-production`; ни один из них не
увеличивает production completion.

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
pinned legacy rollback выполнен и проверен. Блок не закрыт глобально:
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

Статус волны A 2026-07-21: Weekly Production Control и Structure Migration
Diagnostics приняты на реальном Pilot release `v.1.500.21-8fb92d9`.
Weekly повторно проверен на `.21` в desktop; его narrow-доказательство
получено ранее на `.19`. Diagnostics принят в desktop; narrow не
засчитан из-за platform restriction. Волны B и C остаются незакрытыми.

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

Статус 2026-07-21: частичный rollback drill двух permanent-сценариев
исторически выполнен по цепочкам `.21 -> .20 -> .21` и
`.21 -> .18 -> .19 -> .20 -> .21`. Текущий live release — `.25`, его
activation record указывает immediate rollback `.24`, а pinned immutable legacy
остался `.18`. Evaluation stack `.25` полностью выключен. Отдельный фактический
drill `.25 -> .24 -> .25`, финальный drill всей системы и вывод mixed runtime
ещё не закрыты.

## Определение настоящих 100%

Задача считается выполненной на 100% только одновременно при выполнении всех
условий:

- каждый route верхнего реестра реализован на React или явно исключён из scope;
- все обычные действия остаются внутри React и имеют owner-backed parity;
- все применимые read/write сценарии приняты на реальном Pilot с cleanup;
- React постоянно включён, а не активируется evaluation/query-флагом;
- переходы и reload не переключают пользователя между двумя верстками;
- весь активный frontend проходит строгую TypeScript-проверку;
- memory-only Marking MOCK не считается production-модулем;
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
