# Маркировка — встроенный React + TypeScript модуль фазы 1

Фаза 1 входит в штатный production artifact MES Line, общую навигацию и AppShell:

- Pilot: `https://pilot.mes-line.ru/?module=marking`;
- навигация: `Оперативное управление → Маркировка`;
- React-модуль: `experiments/react-migration/src/modules/marking`;
- production bundle: `dist/src/react-islands/marking.js`;
- API: `/api/v1/marking`;
- PostgreSQL: отдельные таблицы `marking_phase1_*`.

## Что работает в фазе 1

Обычный путь — React + TypeScript без возврата в legacy. Экран загружает
изолированные задания, сохраняет параметры комплектов, создаёт коды, ведёт
партии печати и их подтверждение/ошибку, повторную печать, завершение,
передачу/отмену передачи и поиск кода. Запись защищена revision и
`Idempotency-Key`.

Заголовок содержит честный маркер `REACT + TS · PHASE 1`. Режим MOCK остался
только как явный локальный `mode=mock` и не используется нормальным Pilot
путём.

## Граница прототипа

Все задания и ответы явно помечены `MOK`, `testData: true` и
`stateScope: test-state`. Они сохраняются между перезагрузками, но находятся
только в `marking_phase1_*`. Фаза 1 не меняет реальные СЗН, маршрутные карты,
производственные статусы или историю. Реальный принтер/outbox, production
traceability и окончательная employee-RBAC приёмка относятся к следующему
этапу.

## Удаление и rollback

Предыдущий immutable release остаётся рабочим rollback: он игнорирует новые
additive-таблицы. Тестовые строки изолированы и могут быть удалены отдельно без
изменения production owners. `npm run marking:cleanup:pilot` по умолчанию
выполняет только dry-run; реальное удаление требует root, `APP_ENV=pilot`,
`--execute` и точную подтверждающую фразу, которую печатает dry-run. Полное
удаление схемы выполняется отдельной
осознанной cleanup-миграцией после решения отказаться от прототипа; rollback
сам по себе данные не удаляет.

Визуальные тесты этого ускоренного checkpoint намеренно пропущены. Выполнены
только TypeScript, syntax, contract QA и production build.
