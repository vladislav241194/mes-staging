export function createContourAdminModule(dependencies = {}) {
  const {
    appendLocalDataSafetyAudit = () => {},
    escapeAttribute,
    escapeHtml,
    notifySaveSuccess = () => {},
    renderUiActionButton,
    renderUiInfoGrid,
    renderUiModuleHeader,
    renderUiModulePage,
    renderUiPanel,
    renderUiPanelBody,
    renderUiStatusToken,
    renderUiTableWrap,
  } = dependencies;
  const getApp = dependencies.getApp || (() => null);
  const app = {
    querySelector: (...args) => getApp()?.querySelector?.(...args) || null,
    querySelectorAll: (...args) => getApp()?.querySelectorAll?.(...args) || [],
  };

  function getContourAdminContours() {
    return [
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
    ];
  }
  
  function getContourAdminScenarios() {
    return [
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
        confirmMessage: "Забрать БД из stage в pilot?\n\nPilot будет перезаписан копией stage shared-state. Перед заменой pilot получит backup. Stage не изменится.",
        result: "Pilot получает свежую копию данных тестировщиков без обратной синхронизации.",
      },
      {
        id: "deploy-to-pilot",
        label: "Залить изменения в pilot",
        source: "git main",
        target: "pilot",
        owner: "Codex",
        risk: "средний",
        status: "основной путь",
        tone: "primary",
        result: "Pilot обновлен, stage остается стабильным для пользователей.",
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
    ];
  }
  
  function renderContourAdminScenarioActionButton(scenario, options = {}) {
    const apiActionId = options.apiActionId || "";
    return renderUiActionButton({
      label: options.label || "Создать заявку",
      iconName: options.iconName || "settings",
      tone: apiActionId ? (options.requiresConfirm ? "primary" : "secondary") : "secondary",
      attributes: `data-contour-admin-action="${escapeAttribute(scenario.id)}" ${apiActionId ? `data-contour-admin-api-action="${escapeAttribute(apiActionId)}"` : ""} ${options.requiresConfirm ? "data-contour-admin-confirm=\"true\"" : ""} type="button"`,
    });
  }
  
  function renderContourAdminScenarioActions(scenario) {
    if (!scenario.precheckActionId) {
      return renderContourAdminScenarioActionButton(scenario, {
        label: scenario.actionLabel || "Создать заявку",
        apiActionId: scenario.actionId || "",
        requiresConfirm: Boolean(scenario.requiresConfirm),
      });
    }
  
    return `
      <div class="contour-admin-action-stack">
        ${renderContourAdminScenarioActionButton(scenario, {
          label: scenario.precheckLabel || "Проверить",
          apiActionId: scenario.precheckActionId,
        })}
        ${renderContourAdminScenarioActionButton(scenario, {
          label: scenario.actionLabel || "Выполнить",
          apiActionId: scenario.actionId || "",
          requiresConfirm: Boolean(scenario.requiresConfirm),
        })}
      </div>
    `;
  }
  
  function getContourAdminSpeedRows() {
    return [
      {
        id: "pilot-css-dist",
        scenario: "Pilot CSS/dist итерация",
        reference: "1.26 с",
        current: "0.69 с",
        delta: "быстрее в 1.8x",
        command: "npm run deploy:pilot:dist -- --module=products",
        note: "Референс — ручной CSS deploy; текущее значение — fast dist deploy.",
      },
      {
        id: "pilot-full-static",
        scenario: "Pilot static deploy с source+dist",
        reference: "1.86 с",
        current: "0.85 с",
        delta: "быстрее в 2.2x",
        command: "npm run deploy:pilot -- --module=contourAdmin",
        note: "Source/dist теперь копируются одним скриптом, без ручного набора команд.",
      },
      {
        id: "promote-dist",
        scenario: "Promote pilot -> stage",
        reference: "не было",
        current: "0.63 с",
        delta: "новый сценарий",
        command: "npm run promote:pilot-to-staging",
        note: "Появился управляемый перенос dist с backup stage перед заменой.",
      },
      {
        id: "rollback-dry",
        scenario: "Rollback stage dry-run",
        reference: "не было",
        current: "0.46 с",
        delta: "новый сценарий",
        command: "npm run rollback:staging:last-dist -- --dry-run",
        note: "Проверяет, что откат возможен, не меняя stage.",
      },
      {
        id: "admin-deploy-verify",
        scenario: "Admin deploy после restart",
        reference: "ложный fail 404/502",
        current: "3.65 с · pass",
        delta: "verify исправлен",
        command: "npm run deploy:pilot -- --module=contourAdmin --restart",
        note: "Для contourAdmin verify проверяет admin-host и допускает auth-status 401/302/200.",
      },
    ];
  }
  
  function getContourAdminGuardrails() {
    return [
      "Pilot можно ломать и быстро обновлять; stage нельзя ломать во время пользовательского тестирования.",
      "Данные stage копируются в pilot только в одну сторону: pilot никогда не перезаписывает stage своими тестовыми данными.",
      "Перед копированием данных, промоутом или откатом stage нужен backup с понятной меткой версии.",
      "Промоут pilot в stage делается только после ручного QA и фиксации проверенного commit.",
      "Prod появится отдельным контуром после стабилизации stage и регламента релизов.",
    ];
  }
  
  function renderContourAdminPage() {
    return renderUiModulePage({
      ariaLabel: "Админ-панель контуров",
      className: "contour-admin-page",
      workspaceClassName: "contour-admin-workspace",
      contentClassName: "contour-admin-content",
      visualContract: "ops-soft-v1 admin-shell",
      header: renderUiModuleHeader({
        eyebrow: "Система",
        title: "Контуры",
        description: "Админ-панель для управления моделью pilot -> stage -> prod: разработка, пользовательское тестирование и будущий промышленный контур.",
        className: "directory-header contour-admin-header",
        actions: `
          ${renderUiStatusToken("pilot: Codex", "primary")}
          ${renderUiStatusToken("stage: пользователи", "primary")}
          ${renderUiStatusToken("prod: позже", "neutral")}
        `,
      }),
      content: `
        ${renderUiInfoGrid({
          className: "contour-admin-hero",
          items: [
            { label: "Текущий рабочий контур", value: "pilot.mes-line.ru", meta: "Codex, прототипирование, быстрые проверки" },
            { label: "Пользовательское тестирование", value: "staging.mes-line.ru", meta: "реальные данные, только проверенные обновления" },
            { label: "Ключевое правило", value: "Stage -> Pilot", meta: "копия данных только в одну сторону" },
          ],
        })}
        <div class="contour-admin-main-grid">
          <div class="contour-admin-left-stack">
            ${renderContourAdminOverview()}
            ${renderContourAdminFlowPanel()}
            ${renderContourAdminSpeedPanel()}
          </div>
          <div class="contour-admin-right-stack">
            ${renderContourAdminScenarioPanel()}
            ${renderContourAdminGuardrailsPanel()}
            ${renderContourAdminOpsApiPanel()}
          </div>
        </div>
      `,
    });
  }
  
  function renderContourAdminOverview() {
    const contours = getContourAdminContours();
    return renderUiPanel({
      title: "Карта контуров",
      meta: "текущее подключение и целевая схема",
      className: "contour-admin-panel contour-admin-overview-panel",
      body: renderUiPanelBody({
        body: `
          <div class="contour-admin-card-grid">
            ${contours.map((contour) => `
              <article class="contour-admin-card is-${escapeAttribute(contour.id)}">
                <header>
                  <span>${escapeHtml(contour.label)}</span>
                  ${renderUiStatusToken(contour.statusLabel, contour.statusTone)}
                </header>
                <strong>${escapeHtml(contour.title)}</strong>
                <dl>
                  <div><dt>Сейчас</dt><dd>${escapeHtml(contour.domain)}</dd></div>
                  <div><dt>Цель</dt><dd>${escapeHtml(contour.targetDomain)}</dd></div>
                  <div><dt>Сервис</dt><dd>${escapeHtml(contour.service)}</dd></div>
                  <div><dt>Порт</dt><dd>${escapeHtml(contour.port)}</dd></div>
                </dl>
                <p>${escapeHtml(contour.dataPolicy)}</p>
                <small>${escapeHtml(contour.releasePolicy)}</small>
              </article>
            `).join("")}
          </div>
        `,
      }),
    });
  }
  
  function renderContourAdminFlowPanel() {
    return renderUiPanel({
      title: "Рабочий поток",
      meta: "данные и код движутся по разным правилам",
      className: "contour-admin-panel contour-admin-flow-panel",
      body: renderUiPanelBody({
        body: `
          <div class="contour-admin-flow">
            <article>
              <span>Данные</span>
              <strong>Stage -> Pilot</strong>
              <small>односторонняя копия для отладки, без обратной синхронизации</small>
            </article>
            <i aria-hidden="true"></i>
            <article>
              <span>Код</span>
              <strong>Git -> Pilot -> Stage</strong>
              <small>Codex обновляет pilot; stage получает только проверенную версию</small>
            </article>
            <i aria-hidden="true"></i>
            <article>
              <span>Будущее</span>
              <strong>Stage -> Prod</strong>
              <small>после тестирования, регламента релизов и отдельного production-gate</small>
            </article>
          </div>
        `,
      }),
    });
  }
  
  function renderContourAdminSpeedPanel() {
    const rows = getContourAdminSpeedRows();
    return renderUiPanel({
      title: "Скорость итераций",
      meta: "первичные значения остаются референсом, новые проходы добавляются в колонку как стало",
      className: "contour-admin-panel contour-admin-speed-panel",
      body: renderUiPanelBody({
        body: renderUiTableWrap({
          className: "contour-admin-speed-table-wrap",
          body: `
            <table class="directory-table contour-admin-speed-table">
              <thead>
                <tr>
                  <th>Сценарий</th>
                  <th>Было · референс</th>
                  <th>Как стало</th>
                  <th>Эффект</th>
                  <th>Команда</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((row) => `
                  <tr>
                    <td class="primary-cell">
                      <strong>${escapeHtml(row.scenario)}</strong>
                      <span>${escapeHtml(row.note)}</span>
                    </td>
                    <td>${escapeHtml(row.reference)}</td>
                    <td class="contour-admin-speed-current">${escapeHtml(row.current)}</td>
                    <td>${escapeHtml(row.delta)}</td>
                    <td><code>${escapeHtml(row.command)}</code></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          `,
        }),
      }),
    });
  }
  
  function renderContourAdminScenarioPanel() {
    const scenarios = getContourAdminScenarios();
    return renderUiPanel({
      title: "Сценарии управления",
      meta: "критичные операции выполняются через защищенный Ops API",
      className: "contour-admin-panel contour-admin-scenarios-panel",
      body: renderUiPanelBody({
        body: renderUiTableWrap({
          className: "contour-admin-scenarios-table-wrap",
          body: `
            <table class="directory-table contour-admin-scenarios-table">
              <thead>
                <tr>
                  <th>Сценарий</th>
                  <th>Направление</th>
                  <th>Ответственный</th>
                  <th>Риск</th>
                  <th>Статус</th>
                  <th>Действие</th>
                </tr>
              </thead>
              <tbody>
                ${scenarios.map((scenario) => `
                  <tr>
                    <td class="primary-cell">
                      <strong>${escapeHtml(scenario.label)}</strong>
                      <span>${escapeHtml(scenario.result)}</span>
                    </td>
                    <td>${escapeHtml(`${scenario.source} -> ${scenario.target}`)}</td>
                    <td>${escapeHtml(scenario.owner)}</td>
                    <td>${renderUiStatusToken(scenario.risk, scenario.tone)}</td>
                    <td>${escapeHtml(scenario.status)}</td>
                    <td class="actions-cell">
                      ${renderContourAdminScenarioActions(scenario)}
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          `,
        }),
      }),
    });
  }
  
  function renderContourAdminGuardrailsPanel() {
    const guardrails = getContourAdminGuardrails();
    return renderUiPanel({
      title: "Правила безопасности",
      meta: "что нельзя нарушать при пользовательском тестировании",
      className: "contour-admin-panel contour-admin-guardrails-panel",
      body: renderUiPanelBody({
        body: `
          <ol class="contour-admin-rule-list">
            ${guardrails.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}
          </ol>
        `,
      }),
    });
  }
  
  function renderContourAdminOpsApiPanel() {
    const endpoints = [
      "POST /api/contour-admin/action · backup-stage-shared-state",
      "POST /api/contour-admin/action · sync-stage-to-pilot",
      "POST /api/contour-admin/action · dry-promote-pilot-to-stage",
      "POST /api/contour-admin/action · promote-pilot-to-stage",
      "POST /api/contour-admin/action · rollback-stage-dry-run",
    ];
    return renderUiPanel({
      title: "Защищенный Ops API",
      meta: "только admin host, cookie-сессия и whitelist действий",
      className: "contour-admin-panel contour-admin-ops-panel",
      actions: renderUiStatusToken("данные и dist подключены", "primary"),
      body: renderUiPanelBody({
        body: `
          <div class="contour-admin-ops-grid">
            <article>
              <strong>Что уже можно делать</strong>
              <span>Сделать backup stage, забрать shared-state из stage в pilot, проверить promote, перенести dist pilot в stage после QA, проверить возможность rollback stage.</span>
            </article>
            <article>
              <strong>Ограничение</strong>
              <span>Синхронизация данных разрешена только stage -> pilot. Обратное направление намеренно не подключено.</span>
            </article>
          </div>
          <div class="contour-admin-action-result" data-contour-admin-action-result>
            <strong>Результат операции</strong>
            <span>Пока действий не было в этой сессии.</span>
          </div>
          <ul class="contour-admin-endpoint-list">
            ${endpoints.map((endpoint) => `<li><code>${escapeHtml(endpoint)}</code></li>`).join("")}
          </ul>
        `,
      }),
    });
  }
  
  function formatContourAdminDuration(ms) {
    const value = Number(ms);
    if (!Number.isFinite(value)) return "";
    return `${(value / 1000).toFixed(2)} с`;
  }
  
  function setContourAdminActionResult(payload = {}) {
    const result = app.querySelector("[data-contour-admin-action-result]");
    if (!result) return;
    const ok = payload.ok !== false;
    const title = payload.label || payload.action || "Операция";
    const duration = payload.durationMs ? ` · ${formatContourAdminDuration(payload.durationMs)}` : "";
    result.classList.toggle("is-error", !ok);
    result.classList.toggle("is-ok", ok);
    result.innerHTML = `
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(ok ? `Выполнено${duration}` : `Ошибка${duration}: ${payload.error || payload.stderr || "неизвестная причина"}`)}</span>
    `;
  }
  
  async function runContourAdminAction(actionId, button, scenario = {}) {
    const requiresConfirm = button.dataset.contourAdminConfirm === "true";
    if (requiresConfirm) {
      const confirmed = window.confirm(scenario.confirmMessage || `${scenario.label || actionId}?\n\nОперация требует ручного подтверждения.`);
      if (!confirmed) return;
    }
  
    button.disabled = true;
    button.classList.add("is-loading");
    setContourAdminActionResult({ ok: true, label: scenario.label || actionId, durationMs: 0 });
    try {
      const response = await fetch("/api/contour-admin/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: actionId,
          confirm: requiresConfirm ? actionId : "",
        }),
      });
      const payload = await response.json().catch(() => ({ ok: false, error: "Не удалось прочитать ответ сервера" }));
      setContourAdminActionResult(payload);
      appendLocalDataSafetyAudit("contourAdminActionExecuted", {
        actionId,
        scenarioId: scenario.id || "",
        ok: Boolean(payload.ok),
        code: payload.code ?? "",
        durationMs: payload.durationMs ?? "",
      });
      notifySaveSuccess(payload.ok
        ? `${scenario.label || actionId}: ${formatContourAdminDuration(payload.durationMs) || "готово"}`
        : `${scenario.label || actionId}: ошибка выполнения`);
    } catch (error) {
      setContourAdminActionResult({ ok: false, label: scenario.label || actionId, error: error?.message || "сетевая ошибка" });
      notifySaveSuccess(`${scenario.label || actionId}: сетевая ошибка`);
    } finally {
      button.disabled = false;
      button.classList.remove("is-loading");
    }
  }
  
  function bindContourAdminEvents() {
    app.querySelectorAll("[data-contour-admin-action]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const actionId = button.dataset.contourAdminAction || "";
        const scenario = getContourAdminScenarios().find((item) => item.id === actionId);
        const apiAction = button.dataset.contourAdminApiAction || "";
        if (apiAction) {
          void runContourAdminAction(apiAction, button, scenario);
          return;
        }
        appendLocalDataSafetyAudit("contourAdminActionRequest", {
          status: "requested",
          actionId,
          label: scenario?.label || actionId,
          source: scenario?.source || "",
          target: scenario?.target || "",
        });
        notifySaveSuccess(`Заявка создана: ${scenario?.label || actionId}. Выполнение подключим через защищенный Ops API.`);
      });
    });
  }

  return {
    bindContourAdminEvents,
    renderContourAdminPage,
  };
}
