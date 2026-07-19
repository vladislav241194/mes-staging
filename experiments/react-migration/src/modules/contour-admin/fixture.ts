export const contourAdminFixture = { model: {
  contours: [
    { id: "pilot", label: "Pilot", title: "Рабочий контур Codex", domain: "pilot.mes-line.ru", targetDomain: "mes-pilot.ru", service: "mes-pilot.service", port: "4175", dataPolicy: "Копия данных stage только для проверки.", releasePolicy: "Обновляется первым.", statusLabel: "рабочий", statusTone: "primary" },
    { id: "stage", label: "Stage", title: "Тестирование пользователями", domain: "staging.mes-line.ru", targetDomain: "stage.mes-line.ru", service: "mes-dev.service", port: "4174", dataPolicy: "Перед опасными операциями обязателен backup.", releasePolicy: "Только после проверки Pilot.", statusLabel: "пользователи", statusTone: "primary" },
    { id: "prod", label: "Prod", title: "Будущий промышленный контур", domain: "не подключен", targetDomain: "mes-line.ru", service: "будет отдельный сервис", port: "будет отдельный порт", dataPolicy: "Не создавать до стабилизации Stage.", releasePolicy: "Отдельный release-gate.", statusLabel: "позже", statusTone: "neutral" },
  ],
  scenarios: [
    { id: "backup-stage", label: "Сделать backup stage", source: "stage", target: "backup", owner: "Админ", risk: "низкий", status: "Ops API готов", tone: "warning", result: "Архив и метаданные версии." },
    { id: "sync-stage-to-pilot", label: "Забрать БД из stage в pilot", source: "stage", target: "pilot", owner: "Codex / админ", risk: "средний", status: "Ops API готов", tone: "primary", result: "Pilot получает копию данных." },
    { id: "deploy-to-pilot", label: "Залить изменения в pilot", source: "git main", target: "pilot", owner: "Codex", risk: "средний", status: "основной путь", tone: "primary", result: "Pilot обновлён." },
    { id: "promote-pilot-to-stage", label: "Перенести проверенный pilot в stage", source: "pilot commit", target: "stage", owner: "Админ", risk: "высокий", status: "Ops API готов", tone: "warning", precheckActionId: "dry", result: "Stage получает проверенный код." },
    { id: "rollback-stage", label: "Откатить stage", source: "backup / commit", target: "stage", owner: "Админ", risk: "высокий", status: "dry-run готов", tone: "critical", result: "Возврат стабильной версии." },
  ],
  speedRows: [
    { id: "pilot-css-dist", scenario: "Pilot CSS/dist итерация", reference: "1.26 с", current: "0.69 с", delta: "быстрее в 1.8x", command: "npm run deploy:pilot:dist", note: "Fast dist deploy" },
    { id: "promote-dist", scenario: "Promote pilot -> stage", reference: "не было", current: "0.63 с", delta: "новый сценарий", command: "npm run promote:pilot-to-staging", note: "Backup перед заменой" },
  ],
  guardrails: ["Stage нельзя ломать во время пользовательского тестирования.", "Данные движутся только Stage -> Pilot.", "Перед промоутом нужен backup и ручной QA."],
} };
export const contourAdminUpdateFixture = { model: { ...contourAdminFixture.model, contours: contourAdminFixture.model.contours.map((item) => item.id === "pilot" ? { ...item, statusLabel: "проверен" } : item), speedRows: contourAdminFixture.model.speedRows.map((item) => item.id === "pilot-css-dist" ? { ...item, current: "0.62 с", delta: "быстрее в 2x" } : item) } };
