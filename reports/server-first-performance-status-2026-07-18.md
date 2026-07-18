# MES: статус стабилизации производительности и server-first миграции

Дата: 18 июля 2026
Статус: **в работе; безопасный checkpoint создан, полная цель не завершена**.

## Краткий итог

За текущую серию работ создана устойчивая основа перехода от общего snapshot-хранилища к серверным доменным read-models. Ускорены несколько дорогих клиентских путей, добавлен безопасный bounded Gantt API и поднята PostgreSQL-доменная база. Измеренно доказать ускорение реального авторизованного перехода пользователя «Планирование → Gantt» пока нельзя: клиент ещё не использует новый bounded endpoint, а последняя пилотная версия не менялась в рамках checkpoint.

## Что уже выполнено

| Контур | Результат | Доказательство / состояние |
| --- | --- | --- |
| Git и выпуск | Серия изменений сохранена отдельными коммитами, а не только на сервере. | `32477ae`, `ec2eeea`, `49d0e1e`, checkpoint `3fb5468`. |
| Runtime Planning | Маршрутные события вынесены из горячего старта, добавлено кэширование planning projection. | Коммиты `32477ae`, `ec2eeea`. |
| Directories | Шаблоны представления отложены до фактического открытия. | `49d0e1e`, пилот `v.1.499.66`. |
| PostgreSQL / Domain API | Есть доменные репозитории, read-models, snapshot fallback и проверки parity. | Это фундамент, не полное переключение потребителей. |
| Bounded Gantt API | Добавлен `GET /api/v1/planning/gantt-window` с физическими слотами, continuation-маркерами и ETag. | `3fb5468`; клиент пока не подключён. |
| Защита split-слотов | PostgreSQL не используется для Gantt при compatibility snapshot, пока не доказана parity всех физических слотов. | `fallbackReason: postgres-gantt-window-physical-slots-unverified`; есть split-slot QA. |
| Пилот | Пилот отвечает здоровьем. | `/healthz` → `status: ok, version: v.1.499.66, sharedState: ready`. |

## Что намеренно не заявляется завершённым

1. Не доказано пользовательское ускорение в авторизованном браузере.
2. Gantt UI ещё не читает `gantt-window`; endpoint является foundation, а не переключением продукта.
3. Shared-state snapshot всё ещё compatibility source для части контуров.
4. Server command/read-back путь критичных доменов не мигрирован полностью.
5. PostgreSQL не может быть единственным источником для Gantt до отдельной проверки parity физических split-слотов.

## Измерения и вывод

Собранный профиль текущего пилота показал:

- полный shared-state snapshot: около **944 KB raw / 66 KB gzip**;
- крупнейшие значения — Planning и Specifications 2.0;
- штатный healthy boot не обязан загружать полный snapshot: используются компактные BFF/read-model запросы;
- серверные BFF ответы занимают миллисекунды, тогда как значимая часть воспринимаемой задержки находится в статических ресурсах, разборе/исполнении JavaScript и рендеринге;
- холодный статический набор до renderer-модулей составлял примерно **389 KB brotli**.

Следствие: переход на PostgreSQL сам по себе не гарантирует видимого ускорения. Следующий шаг должен иметь пользовательский критерий — авторизованный переход «Планирование → Gantt», а не только локальный benchmark API.

## Непринятый эксперимент

Проводился эксперимент по объединению двух стартовых shared-state запросов. Он **не вошёл** в `3fb5468` и не должен публиковаться:

- tombstone `null` фильтровался до записи в localStorage и мог оставить устаревшую локальную System Domains матрицу;
- metadata не различала «активная удалённая compatibility матрица» и «ключ отсутствует», поэтому при недоступности server API новый браузер мог загрузить bundled legacy и потенциально перезаписать актуальный remote snapshot;
- callback не срабатывал на настроенном shared-state с версией `0`.

Правильное продолжение — переделать срез test-first с явным metadata состоянием `retired | active | absent`, fail-closed режимом для неизвестного состояния и targeted hydration active compatibility payload до legacy fallback.

## Проверки checkpoint `3fb5468`

В отдельном чистом worktree успешно выполнены:

    npm run qa:planning-gantt-window
    node scripts/domain-api-qa.mjs
    node scripts/planning-period-api-qa.mjs
    npm run qa:domain-repositories
    npm run qa:domain-read-repository-pooling
    npm run build
    git diff --check

Это доказывает корректность foundation-контракта и сборки. Это **не** заменяет авторизованную пилотную приёмку производительности.

## Ближайший правильный порядок

1. В чистом worktree реализовать безопасный metadata state для System Domains и его failure-path QA.
2. Внедрить dedicated physical-slot parity/shadow comparison для Gantt.
3. Под флагом подключить Gantt UI к bounded endpoint, не заменяя глобальное Planning/editor state.
4. Замерить реальный авторизованный пользовательский путь до и после переключения.
5. Только после измеримого выигрыша продолжать миграцию server commands/read-back и сокращать snapshot.

## Риск-контроль

- Не применять `git reset`, `git checkout --` или `git clean` к исходной пользовательской папке: там 452 несвязанных изменения.
- Не переносить экспериментальные shared-state правки из другого worktree.
- Не публиковать новый release без visible version bump, чистой сборки, нужных QA и health check.
- Не считать зелёный unit/smoke тест доказательством скорости в браузере.
