export type ContourAdminTone = "primary" | "warning" | "critical" | "neutral";

export interface ContourAdminProductionContour {
  id: string;
  label: string;
  title: string;
  domain: string;
  targetDomain: string;
  service: string;
  port: string;
  dataPolicy: string;
  releasePolicy: string;
  statusLabel: string;
  statusTone: ContourAdminTone;
}

export interface ContourAdminProductionScenario {
  id: string;
  label: string;
  source: string;
  target: string;
  owner: string;
  risk: string;
  status: string;
  tone: ContourAdminTone;
  result: string;
  actionLabel?: string;
  actionId?: string;
  precheckLabel?: string;
  precheckActionId?: string;
  requiresConfirm?: boolean;
}

export interface ContourAdminProductionSpeedRow {
  id: string;
  scenario: string;
  reference: string;
  current: string;
  delta: string;
  command: string;
  note: string;
}

export interface ContourAdminProductionModel {
  contours: ContourAdminProductionContour[];
  scenarios: ContourAdminProductionScenario[];
  speedRows: ContourAdminProductionSpeedRow[];
  guardrails: string[];
}

// This is the production React read model. It intentionally has no import from
// the legacy Contour Admin renderer, the mixed app shell or a browser store.
// The legacy renderer keeps its own immutable rollback model.
export function buildContourAdminProductionModel(): ContourAdminProductionModel {
  return {
    contours: [
      {
        id: "pilot",
        label: "Pilot",
        title: "Рабочий контур Codex",
        domain: "pilot.mes-line.ru",
        targetDomain: "mes-pilot.ru",
        service: "mes-pilot.service",
        port: "4175",
        dataPolicy: "Берет копию данных stage по ручному сценарию. Обратно данные не пишет.",
        releasePolicy: "Кодекс и разработка могут обновлять этот контур первыми.",
        statusLabel: "рабочий",
        statusTone: "primary",
      },
      {
        id: "stage",
        label: "Stage",
        title: "Тестирование пользователями",
        domain: "staging.mes-line.ru",
        targetDomain: "stage.mes-line.ru",
        service: "mes-dev.service",
        port: "4174",
        dataPolicy: "Источник данных для тестировщиков. Перед опасными операциями обязателен backup.",
        releasePolicy: "Обновляется только после проверки pilot и ручного подтверждения.",
        statusLabel: "пользователи",
        statusTone: "primary",
      },
      {
        id: "prod",
        label: "Prod",
        title: "Будущий промышленный контур",
        domain: "не подключен",
        targetDomain: "mes-line.ru",
        service: "будет отдельный сервис",
        port: "будет отдельный порт",
        dataPolicy: "Нельзя создавать до стабилизации stage, ролей, бэкапов и регламента релизов.",
        releasePolicy: "Только через отдельный release-gate после пользовательского тестирования.",
        statusLabel: "позже",
        statusTone: "neutral",
      },
    ],
    scenarios: [
      {
        id: "backup-stage",
        label: "Сделать backup stage",
        source: "stage",
        target: "backup",
        owner: "Админ",
        risk: "низкий",
        status: "Ops API готов",
        tone: "warning",
        actionLabel: "Backup",
        actionId: "backup-stage-shared-state",
        result: "Архив shared-state и метаданные версии перед изменениями.",
      },
      {
        id: "sync-stage-to-pilot",
        label: "Забрать БД из stage в pilot",
        source: "stage",
        target: "pilot",
        owner: "Codex / админ",
        risk: "средний",
        status: "Ops API готов",
        tone: "primary",
        actionLabel: "Забрать",
        actionId: "sync-stage-to-pilot",
        requiresConfirm: true,
        result: "Pilot получает свежую копию данных тестировщиков без обратной синхронизации.",
      },
      {
        id: "deploy-to-pilot",
        label: "Залить изменения в pilot",
        source: "git main",
        target: "pilot",
        owner: "Codex / root-оператор",
        risk: "средний",
        status: "заявка в audit",
        tone: "primary",
        actionLabel: "Создать заявку",
        actionId: "request-deploy-to-pilot",
        result: "Создаётся постоянная audit-заявка; браузер сам ничего не разворачивает.",
      },
      {
        id: "promote-pilot-to-stage",
        label: "Перенести проверенный pilot в stage",
        source: "pilot commit",
        target: "stage",
        owner: "Админ",
        risk: "высокий",
        status: "Ops API готов",
        tone: "warning",
        precheckLabel: "Проверить",
        precheckActionId: "dry-promote-pilot-to-stage",
        actionLabel: "Промоут",
        actionId: "promote-pilot-to-stage",
        requiresConfirm: true,
        result: "Stage получает проверенный код без потери пользовательских данных.",
      },
      {
        id: "rollback-stage",
        label: "Откатить stage",
        source: "backup / commit",
        target: "stage",
        owner: "Админ",
        risk: "высокий",
        status: "dry-run готов",
        tone: "critical",
        actionLabel: "Проверить",
        actionId: "rollback-stage-dry-run",
        result: "Stage возвращается к последней стабильной версии после инцидента.",
      },
    ],
    speedRows: [
      { id: "pilot-css-dist", scenario: "Pilot CSS/dist итерация", reference: "1.26 с", current: "0.69 с", delta: "быстрее в 1.8x", command: "npm run deploy:pilot:dist -- --module=products", note: "Референс — ручной CSS deploy; текущее значение — fast dist deploy." },
      { id: "pilot-full-static", scenario: "Pilot static deploy с source+dist", reference: "1.86 с", current: "0.85 с", delta: "быстрее в 2.2x", command: "npm run deploy:pilot -- --module=contourAdmin", note: "Source/dist копируются одним скриптом, без ручного набора команд." },
      { id: "promote-dist", scenario: "Promote pilot -> stage", reference: "не было", current: "0.63 с", delta: "новый сценарий", command: "npm run promote:pilot-to-staging", note: "Управляемый перенос dist с backup stage перед заменой." },
      { id: "rollback-dry", scenario: "Rollback stage dry-run", reference: "не было", current: "0.46 с", delta: "новый сценарий", command: "npm run rollback:staging:last-dist -- --dry-run", note: "Проверяет возможность отката, не меняя stage." },
      { id: "admin-deploy-verify", scenario: "Admin deploy после restart", reference: "ложный fail 404/502", current: "3.65 с · pass", delta: "verify исправлен", command: "npm run deploy:pilot -- --module=contourAdmin --restart", note: "Verify проверяет admin-host и допускает auth-status 401/302/200." },
    ],
    guardrails: [
      "Pilot можно ломать и быстро обновлять; stage нельзя ломать во время пользовательского тестирования.",
      "Данные stage копируются в pilot только в одну сторону: pilot никогда не перезаписывает stage своими тестовыми данными.",
      "Перед копированием данных, промоутом или откатом stage нужен backup с понятной меткой версии.",
      "Промоут pilot в stage делается только после ручного QA и фиксации проверенного commit.",
      "Prod появится отдельным контуром после стабилизации stage и регламента релизов.",
    ],
  };
}
