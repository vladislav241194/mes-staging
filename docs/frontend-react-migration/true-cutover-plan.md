# MES Line: честный план React + TypeScript cutover до 100%

Дата повторного аудита: 2026-07-21  
Рабочая ветка: `codex/frontend-react-migration`  
Аудитируемый локальный commit: `24f992256da4106035ba8627833ac6d599bd2610`

## Исправление прежней оценки

Прежняя оценка `99.5–100%` описывала готовность выбранных React-island-срезов:
typed adapter, локальный production-shell QA, reversible evaluation и legacy
rollback. Она не означала, что вся MES Line постоянно работает на React, что
все пользовательские команды перенесены и что legacy-runtime выведен из
обычного пути.

По полным критериям cutover повторный аудит зафиксировал стартовые **44%**.
После создания исполняемого route/surface ledger и устранения двусмысленного
`local-complete` текущая доказанная готовность составляет **46%**. Это рабочая
контрольная точка, а не оценка по строкам кода.

## Что проверено 2026-07-21

- Git clean, ветка совпадает с upstream (`0/0`).
- Локальная версия: `v.1.500.17`.
- Pilot здоров, активный release: `v.1.500.17-3725611`.
- Все эффективные `MES_REACT_*` flags выключены.
- Rollback release сохранён: `v.1.500.16-2687058`.
- `npm run typecheck:react` проходит.
- `node experiments/react-migration/qa.mjs` проходит: 136 typed sources.
- В верхнем реестре системы 16 модулей.
- В коде 25 React islands: 24 сценария command-parity и отдельная Маркировка.
- 22 из 24 сценариев имели двусмысленный статус `local-complete`; после аудита
  он заменён на `slice-complete`. Два read-only сценария имеют статус
  `not-applicable`. Этот статус означает завершение выбранного среза, а не всей
  функциональности модуля.
- Во всех 24 сценариях сохраняется legacy rollback.
- По накопленному журналу Pilot meaningful read evidence есть у 21/24
  сценариев, но оно собрано на разных релизах. На текущем `v.1.500.17`
  read/write/cleanup заново доказаны только для Номенклатуры — 1/24.
- Полный Pilot create/edit/read-back/delete/cleanup доказан только для
  Номенклатуры: 1 из 22 write-сценариев.
- На сервере нет постоянного React rollout-контура: есть 25 временных
  evaluation-конфигураций и 0 permanent rollout-конфигураций.
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
| Функциональный parity без обычного возврата в legacy | 25 | 17 | В Roles, Planning, Boards/BOM, Shift Work Orders, Shift Master, Employee Desktop, Specifications 2.0 и Gantt остаются legacy-only команды |
| Реальная Pilot read/write приёмка | 20 | 9 | Read примерно 21/24; полный write lifecycle только 1/22 |
| Постоянный default-on React runtime | 20 | 0 | Все React-контуры evaluation/default-off |
| Вывод legacy из обычного runtime | 15 | 1 | Rollback подготовлен, но mixed runtime и action fallback остаются |
| Strict QA, release и rollback-контроли | 5 | 5 | Typecheck, архитектурный QA, release provenance и rollback существуют |
| **Итого** | **100** | **46** | |

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
- переход Workshop в Shift Work Orders;
- переключение сотрудника и недостающая persistence-приёмка Employee Desktop.

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
Pilot reads, 1/24 current-release reads, 1/22 Pilot writes и доказанные 46%.
Ledger также сверяет все 25 island entry points, deep-link aliases,
implemented/missing commands, normal-action fallback и отсутствие зависимости
Blueprint UI. Dispatch помечен как placeholder до ТЗ, Marking — как
`mock-not-production`; ни один из них не увеличивает production completion.

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
