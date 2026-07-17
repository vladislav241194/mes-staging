function ua(B={}){const{MES_CUSTOM_ICON_GROUPS:L,MES_CUSTOM_ICON_SOURCES:P,MES_CUSTOM_ICON_STATUSES:z,MES_SIGNAL_TYPES:M,escapeAttribute:n,escapeHtml:t,getApp:O,getMesCustomIconEntries:_,getMesCustomIconReferenceAssetPath:X,getMesCustomIconSummary:H,icon:i,normalizeLookupText:E,renderUiActionBar:V,renderUiActionButton:r,renderUiDrawerFrame:D,renderUiDropdownFrame:j,renderUiEmptyState:Q,renderUiFilterBar:R,renderUiFormField:x,renderUiGanttBar:T,renderUiModalFrame:C,renderUiPanel:o,renderUiPanelBody:c,renderUiPanelFooter:G,renderUiStatusToken:u,renderUiTableWrap:U,renderUiToolbar:A,selected:K}=B,W=O();function I(a,l=""){return a.map(d=>`<option value="${n(d)}" ${K(l,d)}>${t(d)}</option>`).join("")}function Y(a={}){const l=String(a.usage||"");return a.status==="applied"||a.status==="approved"||/\bauth\b|\bstructure\b|\bproduction-flow\b|\bUI\b/i.test(l)?"applied":/\bfuture\b/i.test(l)?"future":"reference"}function p(a,l="neutral"){return`<span class="visual-icon-chip is-${n(l)}">${t(a)}</span>`}function Z(a){return`
      <div class="visual-icon-size-stack" aria-label="Размеры иконки">
        ${[32,24,20,18,16].map(l=>`
          <span class="visual-icon-size-sample is-${l}">
            ${i(a.iconName)}
            <small>${l}</small>
          </span>
        `).join("")}
      </div>
    `}function J(a){return`
      <div class="visual-icon-state-stack" aria-label="Состояния иконки">
        ${[["default","default"],["muted","muted"],["active","active"],["warning","warning"],["danger","danger"]].map(([d,m])=>`
          <span class="visual-icon-state-sample is-${n(d)}">
            ${i(a.iconName)}
            <small>${t(m)}</small>
          </span>
        `).join("")}
      </div>
    `}function aa(a){return`
      <div class="visual-icon-context-preview" aria-label="Контекстный просмотр ${n(a.semanticSlug)}">
        <span class="visual-icon-context-sidebar">${i(a.iconName)}<b>${t(a.title)}</b></span>
        <button class="visual-icon-context-button" type="button">${i(a.iconName)}<span>Действие</span></button>
        <span class="visual-icon-context-cell"><i>${i(a.iconName)}</i><b>${t(a.semanticSlug)}</b></span>
        <span class="visual-icon-context-badge">${i(a.iconName)}<b>${t(a.status)}</b></span>
        <span class="visual-icon-context-tile">
          ${i(a.iconName)}
          <b>${t(a.title)}</b>
          <small>${t(a.group)}</small>
        </span>
      </div>
    `}function ta(a={}){return[a.semanticSlug,a.iconName,a.title,a.group,a.status,a.source,a.usage,a.note,a.runtimeIds?.join(" ")].join(" ").toLowerCase()}function q(a){return`
      data-mes-icon-record
      data-icon-search="${n(ta(a))}"
      data-icon-group="${n(a.group)}"
      data-icon-status="${n(a.status)}"
      data-icon-source="${n(a.source)}"
      data-icon-usage="${n(Y(a))}"
    `}function sa(a){return`
      <article class="visual-icon-card" ${q(a)}>
        <header>
          <span class="visual-icon-card-mark">${i(a.iconName)}</span>
          <div>
            <strong>${t(a.title)}</strong>
            <code>${t(a.semanticSlug)}</code>
          </div>
        </header>
        <div class="visual-icon-card-meta">
          ${p(a.group,"group")}
          ${p(a.status,a.status==="applied"?"applied":"neutral")}
          ${p(a.source,"source")}
        </div>
        ${Z(a)}
        ${J(a)}
        <p>${t(a.note)}</p>
        <small class="visual-icon-card-usage">iconName: ${t(a.iconName)} · ${t(a.sourceLabel||a.source)}${a.lucideComponent?` · Lucide ${t(a.lucideComponent)}`:""}</small>
        ${aa(a)}
      </article>
    `}function ea(a){const l=X(a);return l?`
      <article class="visual-icon-reference-card">
        <header>
          <strong>${t(a.semanticSlug)}</strong>
          <span>${t(a.iconName)}</span>
        </header>
        <div class="visual-icon-reference-pair">
          <figure>
            <img src="${n(l)}" alt="Visual reference ${n(a.semanticSlug)}" loading="lazy" />
            <figcaption>PNG reference</figcaption>
          </figure>
          <figure class="is-svg">
            ${i(a.iconName)}
            <figcaption>Current SVG</figcaption>
          </figure>
        </div>
        <dl>
          <div><dt>Статус</dt><dd>${t(a.status)}</dd></div>
          <div><dt>Источник</dt><dd>${t(a.sourceLabel||a.source)}</dd></div>
          <div><dt>Заметка</dt><dd>${t(a.note)}</dd></div>
        </dl>
      </article>
    `:""}function ia(a){return U({className:"visual-icon-mapping-table-wrap",body:`
        <table class="ui-table visual-icon-mapping-table" aria-label="Mapping custom MES icons">
          <thead>
            <tr>
              <th>semanticSlug</th>
              <th>iconName</th>
              <th>runtime IDs</th>
              <th>Группа</th>
              <th>Статус</th>
              <th>Где используется</th>
            </tr>
          </thead>
          <tbody>
            ${a.map(l=>`
              <tr ${q(l)}>
                <td><span class="visual-icon-table-name">${i(l.iconName)}<b>${t(l.semanticSlug)}</b></span></td>
                <td><code>${t(l.iconName)}</code></td>
                <td>${l.runtimeIds?.length?l.runtimeIds.map(d=>`<code>${t(d)}</code>`).join(" "):"—"}</td>
                <td>${t(l.group)}</td>
                <td>${p(l.status,l.status==="applied"?"applied":"neutral")}</td>
                <td>${t(l.usage)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `})}function F(){const a=_(),l=H(),d=a.filter((m,y,$)=>$.findIndex(f=>f.iconName===m.iconName)===y);return`
      <article class="visual-system-panel is-full visual-icons-panel" data-mes-icon-section data-visual-qa-target="visual-system-icons">
        <div class="visual-system-panel-title">
          ${i("palette")}
          <div><h3>Иконки MES</h3><p>Mixed registry: custom MES SVG, Lucide React для системных действий и локальный fallback для карты цеха.</p></div>
        </div>
        <div class="visual-icon-summary">
          ${p(`Всего semanticSlug ${l.semanticCount}`,"summary")}
          ${p(`Уникальных SVG ${l.uniqueSvgCount}`,"summary")}
          ${p(`Custom ${l.customCount}`,"summary")}
          ${p(`Lucide ${l.lucideCount}`,"summary")}
          ${p(`Fallback ${l.fallbackCount}`,"summary")}
          ${p(`Готово ${l.readyCount}`,"summary")}
          ${p(`Требует проверки ${l.reviewCount}`,"summary")}
          ${p(`Используется в UI ${l.appliedCount}`,"summary")}
        </div>
        <div class="visual-icon-filterbar">
          <label>
            <span>Поиск</span>
            <input data-mes-icon-search type="text" placeholder="semanticSlug, отдел, участок, iconName" />
          </label>
          <label>
            <span>Группа</span>
            <select data-mes-icon-filter="group">
              <option value="">Все</option>
              ${I(L)}
            </select>
          </label>
          <label>
            <span>Статус</span>
            <select data-mes-icon-filter="status">
              <option value="">Все</option>
              ${I(z)}
            </select>
          </label>
          <label>
            <span>Источник</span>
            <select data-mes-icon-filter="source">
              <option value="">Все</option>
              ${I(P)}
            </select>
          </label>
          <label>
            <span>Использование</span>
            <select data-mes-icon-filter="usage">
              <option value="">Все</option>
              <option value="applied">Используется в UI</option>
              <option value="future">Подготовлено на будущее</option>
              <option value="reference">Только reference</option>
            </select>
          </label>
          <output data-mes-icon-filter-count>${a.length.toLocaleString("ru-RU")} строк</output>
        </div>
        <div class="visual-icon-grid">
          ${a.map(sa).join("")}
        </div>
        <div class="visual-icon-empty" data-mes-icon-empty hidden>
          ${Q({iconName:"search",title:"Иконки не найдены",text:"Сбросьте фильтр или уточните semanticSlug."})}
        </div>
        <section class="visual-icon-reference-section" aria-label="Reference vs SVG">
          <header>
            <strong>Reference vs SVG</strong>
            <span>PNG только для ревью, production UI использует SVG из registry.</span>
          </header>
          <div class="visual-icon-reference-grid">
            ${d.map(ea).join("")}
          </div>
        </section>
        <section class="visual-icon-mapping-section" aria-label="Semantic mapping">
          <header>
            <strong>Mapping table</strong>
            <span>Единая структура для замены иконки через кодовый registry, а не через локальный хардкод.</span>
          </header>
          ${ia(a)}
        </section>
        <section class="visual-icon-review-notes">
          <strong>Правила ревью</strong>
          <ul>
            <li>PNG-референсы не используются как production-иконки.</li>
            <li>Новая иконка сначала получает semanticSlug и runtime alias в registry.</li>
            <li>Проверка обязательна в размерах 32, 24, 20, 18 и 16, а также в sidebar/button/table/badge/tile контекстах.</li>
            <li>Иконки Gantt row label пока не применяются, чтобы не менять геометрию диаграммы.</li>
          </ul>
        </section>
      </article>
    `}function la(){return na()}function na(){const a=Object.entries(M).map(([e,h])=>({id:e,label:h.label,tone:h.tone})),l=[["visual-foundations","Основы","tokens"],["visual-layout","Layout","shell"],["visual-actions","Actions","controls"],["visual-data","Таблицы","data"],["visual-gantt","Gantt","planning"],["visual-icons","Иконки","registry"],["visual-qa","QA","contracts"]],d=[["Surface","page / panel / raised","--mes-ui-surface-*"],["Text","body / muted / inverse","--mes-ui-text-*"],["Border","soft / default / strong","--mes-ui-border-*"],["Spacing","page / panel / control","--mes-space-* + density"],["Radius","xs / sm / md / lg / pill","--mes-ui-radius-*"],["Density","compact / default / touch","--mes-density-*"],["Overlay","modal / drawer / dropdown","--mes-ui-overlay-*"],["Gantt","slot / row / dependency","--mes-ui-gantt-*"]],m=[["compact","таблицы, справочники","строка плотная, действия компактные"],["default","рабочие модули MES","баланс данных и читаемости"],["touch","авторизация, рабочий стол, факт","крупные зоны для планшета"]],y=[["primary","главное действие","save"],["secondary","обычное действие","refresh"],["ghost","тихое действие","filter"],["danger","опасное действие","trash"],["compact","панель фильтров","directory"],["touch","планшетная зона","check"],["icon","иконка","focus"],["table-icon","таблица","open"]],$=[["neutral","нейтрально"],["ready","готово"],["active","в работе"],["warning","предупреждение"],["blocked","заблокировано"],["problem","проблема"],["manual","ручной ввод"],["calculated","расчет"],["demo","демо"]],f=[{id:"normal",label:"Normal",text:"базовое состояние"},{id:"hover",label:"Hover",text:"без скачка размера"},{id:"focus",label:"Focus",text:"focus-visible ring"},{id:"disabled",label:"Disabled",text:"читаемо, но недоступно"},{id:"error",label:"Error",text:"рядом с объектом"},{id:"selected",label:"Selected",text:"выбранная строка"}],w=[["Сайдбары","единый shell","Только module-data-sidebar и ui-sidebar-item, без локальных ширин."],["Панели","ui-panel","Заголовок, body и footer идут через UI-kit helpers."],["Таблицы","MES dense","Внутренний scroll только у table-wrap или временной шкалы."],["Dropdown","viewport-safe","Список не должен выходить за viewport и перекрывать shell."],["Touch","планшет","Крупные зоны только в auth/рабочем столе/fact-flow."],["Focus Mode","без потерь","Скрывает вторичное, но не меняет данные и доступные действия."]],S=[["Разрешено","таблицы","directory-table-wrap, ui-table-wrap"],["Разрешено","временная шкала","gantt-shell, supply-gantt-shell"],["Разрешено","карта производства","production-flow-lane как canvas"],["Запрещено","страница","body/app-shell/main-content без горизонтального scroll"]],N=[["Ручные кнопки","не использовать","Новые действия собираются через renderUiActionButton."],["Ручные table-wrap","не использовать","Табличные зоны идут через renderUiTableWrap."],["Дубли паспорта","удалять","Если поле уже есть в документе или карточке, второй summary-блок не нужен."],["Демо-функция","изолировать","Демо-маркер допустим только на UX-макетах без влияния на данные."]],b=()=>`
      <aside class="visual-system-topic-sidebar" aria-label="Темы UI">
        <strong>Темы UI</strong>
        <nav>
          ${l.map(([e,h,k])=>`
            <a href="#${n(e)}">
              <span>${t(h)}</span>
              <small>${t(k)}</small>
            </a>
          `).join("")}
        </nav>
      </aside>
    `,g=({id:e,iconName:h,title:k,text:s,body:v,className:ra=""})=>`
      <section id="${n(e)}" class="visual-system-section ${n(ra)}" data-visual-section="${n(e)}">
        <header class="visual-system-section-head">
          ${i(h)}
          <div>
            <h2>${t(k)}</h2>
            <p>${t(s)}</p>
          </div>
        </header>
        ${v}
      </section>
    `;return`
      <section class="visual-system-page" data-layout="main-content" data-ui-component="VisualSystemRuntime" data-ui-runtime="visual-system-v1" aria-label="MES Visual System">
        <div class="visual-system-layout">
          ${b()}
          <div class="visual-system-content">
            <header class="visual-system-hero">
              <span class="eyebrow">UI-kit · применяемый стенд</span>
              <div>
                <h2>MES Visual System</h2>
                <p>Справочник только по применяемым контрактам: foundations, layout, actions/status, таблицы, Gantt, custom icons и QA-защита.</p>
              </div>
              <div class="visual-system-hero-actions">
                <button class="secondary-button ui-action-button" data-toggle-focus-mode type="button">${i("focus")}<span>Фокус</span></button>
              </div>
            </header>
  
            ${g({id:"visual-foundations",iconName:"settings",title:"Основы UI-kit",text:"Семантические токены и плотность, от которых должны наследоваться новые модули.",className:"visual-internal-ui-kit-panel",body:`
                <div class="visual-ui-kit-foundations">
                  ${d.map(e=>`
                    <article class="visual-ui-kit-foundation-card">
                      <strong>${t(e[0])}</strong>
                      <span>${t(e[1])}</span>
                      <code>${t(e[2])}</code>
                    </article>
                  `).join("")}
                </div>
                <div class="visual-ui-kit-production-grid">
                  ${o({title:"Density",meta:"compact / default / touch",className:"visual-ui-kit-production-panel",body:c({body:`
                      <div class="visual-ui-kit-density-grid">
                        ${m.map(e=>`
                          <article class="visual-ui-kit-density-card is-${n(e[0])}">
                            <strong>${t(e[0])}</strong>
                            <span>${t(e[1])}</span>
                            <small>${t(e[2])}</small>
                          </article>
                        `).join("")}
                      </div>
                    `})})}
                  ${o({title:"System signals",meta:"MES_SIGNAL_TYPES",className:"visual-ui-kit-production-panel",body:c({body:`
                      <div class="visual-ui-kit-status-grid">
                        ${a.map(e=>u(e.label,e.tone)).join("")}
                      </div>
                    `})})}
                </div>
              `})}
  
            ${g({id:"visual-layout",iconName:"directory",title:"Layout и shell",text:"Единые правила для сайдбара, рабочей области, панелей и ownership scroll.",body:`
                <div class="visual-stabilization-grid">
                  ${w.map(e=>`
                    <div class="visual-rule-card">
                      <strong>${t(e[0])}</strong>
                      <span>${t(e[1])}</span>
                      <small>${t(e[2])}</small>
                    </div>
                  `).join("")}
                </div>
                <div class="visual-ui-kit-production-grid">
                  ${o({title:"Panel contract",meta:"renderUiPanel",className:"visual-ui-kit-production-panel",body:`${c({body:"Панель растет по содержимому, отступы не задаются локально, footer отделен контрактом."})}${G({body:r({label:"Действие",iconName:"check"})})}`})}
                  ${o({title:"Scroll ownership",meta:"страница без X-scroll",className:"visual-ui-kit-production-panel is-wide",body:c({body:`
                      <div class="visual-scroll-zone-grid">
                        ${S.map(e=>`
                          <div class="${e[0]==="Запрещено"?"is-forbidden":"is-allowed"}">
                            <strong>${t(e[0])}</strong>
                            <span>${t(e[1])}</span>
                            <small>${t(e[2])}</small>
                          </div>
                        `).join("")}
                      </div>
                    `})})}
                </div>
              `})}
  
            ${g({id:"visual-actions",iconName:"target",title:"Actions, forms, states",text:"Кнопки, статусы, поля и служебные состояния, которые уже должны идти через runtime helpers.",body:`
                <div class="visual-ui-kit-production-grid">
                  ${o({title:"Buttons / actions",meta:"renderUiActionButton",className:"visual-ui-kit-production-panel",body:c({body:`
                      <div class="visual-ui-kit-button-grid">
                        ${y.map(e=>r({label:e[0]==="icon"||e[0]==="table-icon"?"":e[1],iconName:e[2],tone:e[0],attributes:`type="button" aria-label="${n(`${e[0]}: ${e[1]}`)}"`})).join("")}
                      </div>
                    `})})}
                  ${o({title:"Status tokens",meta:"renderUiStatusToken",className:"visual-ui-kit-production-panel",body:c({body:`
                      <div class="visual-ui-kit-status-grid">
                        ${$.map(e=>u(e[1],e[0])).join("")}
                      </div>
                    `})})}
                  ${o({title:"Form fields",meta:"renderUiFormField",className:"visual-ui-kit-production-panel is-wide",body:c({body:`
                      <div class="visual-form-grid">
                        ${x({label:"Поле формы",control:'<input value="единая высота" />',hint:"input/select/textarea идут через один контракт"})}
                        ${x({label:"Select",control:"<select><option>viewport-safe</option></select>"})}
                        ${x({label:"Readonly",control:'<input value="расчетное поле" readonly />'})}
                        <label class="visual-checkbox-row"><input type="checkbox" checked /><span>Крупная touch-зона</span></label>
                      </div>
                    `})})}
                  ${o({title:"Interaction states",meta:"focus / disabled / error",className:"visual-ui-kit-production-panel is-wide",body:c({body:`
                      <div class="visual-state-grid">
                        ${f.map(e=>`
                          <button class="visual-state-card is-${n(e.id)}" type="button" ${e.id==="disabled"?"disabled":""}>
                            <strong>${t(e.label)}</strong>
                            <span>${t(e.text)}</span>
                          </button>
                        `).join("")}
                      </div>
                    `})})}
                  ${o({title:"Empty / Loading / Error",meta:"служебные состояния",className:"visual-ui-kit-production-panel",body:c({body:`
                      <div class="visual-state-stack">
                        <div class="empty-state">${i("search")}<span>Нет данных по текущему фильтру</span></div>
                        <div class="visual-loading-line is-loading"><span>Локальная загрузка строки</span></div>
                        <div class="visual-error-line">${i("alert")}<span>Ошибка рядом с объектом</span></div>
                      </div>
                    `})})}
                </div>
              `})}
  
            ${g({id:"visual-data",iconName:"directory",title:"Таблицы и карточки",text:"Оставлены применяемые паттерны: плотная таблица, дерево, выбранная строка через подъем и акцент компактной карточки через label pill.",body:`
                <div class="visual-ui-kit-production-grid">
                  ${o({title:"DataTable / TreeTable",meta:"renderUiTableWrap",className:"visual-ui-kit-production-panel is-wide",body:c({body:U({className:"visual-ui-kit-table-wrap",body:`
                          <table class="ui-table visual-ui-kit-table visual-system-table" aria-label="Applied MES table sample">
                            <thead><tr><th>Документ</th><th>Состав</th><th>План</th><th>Статус</th><th>Действия</th></tr></thead>
                            <tbody>
                              <tr class="is-group"><td><span class="visual-tree-cell" style="--level:0">${i("tree")} Заказ-наряд</span></td><td>изд. "Хуета"</td><td>1 000</td><td>${u("в работе","active")}</td><td class="actions-cell">${r({label:"",iconName:"open",tone:"table-icon",attributes:'type="button" aria-label="Открыть группу"'})}</td></tr>
                              <tr class="is-selected"><td><span class="visual-tree-cell" style="--level:1">${i("document")} СЗН-20260502-D5-07</span></td><td>Выводной монтаж</td><td>700</td><td>${u("готово","ready")}</td><td class="actions-cell">${r({label:"",iconName:"print",tone:"table-icon",attributes:'type="button" aria-label="Печать"'})}</td></tr>
                              <tr><td><span class="visual-tree-cell" style="--level:1">${i("document")} СЗН-20260502-D5-08</span></td><td>Отмывка</td><td>300</td><td>${u("риск","warning")}</td><td class="actions-cell">${r({label:"",iconName:"open",tone:"table-icon",attributes:'type="button" aria-label="Открыть"'})}</td></tr>
                            </tbody>
                          </table>
                        `})})})}
                  ${o({title:"Selected row",meta:"применяемый вариант",className:"visual-ui-kit-production-panel",body:c({body:`
                      <div class="visual-selected-row-option is-lift is-applied-only" data-visual-qa-target="visual-selected-row-option">
                        <table data-ui-component="VisualSampleTable" aria-label="Applied selected row">
                          <tbody>
                            <tr><td><span>СЗН-20260701-D5-06</span></td><td>Выводной монтаж</td><td>закрыт</td></tr>
                            <tr class="is-active"><td><span>СЗН-20260702-D5-07</span></td><td>Отмывка</td><td>в работе</td></tr>
                            <tr><td><span>СЗН-20260703-D5-08</span></td><td>Контроль</td><td>план</td></tr>
                          </tbody>
                        </table>
                      </div>
                    `})})}
                  ${o({title:"Compact card accent",meta:"применяемый вариант",className:"visual-ui-kit-production-panel",body:c({body:`
                      <article class="visual-card-accent-option is-label-pill is-applied-only" data-visual-qa-target="visual-card-accent-option">
                        <div class="visual-card-accent-preview" aria-label="Applied compact card accent">
                          <span>Заказ-наряд</span>
                          <strong>изд. "Хуета"</strong>
                          <small>Сборка в заготовку</small>
                        </div>
                      </article>
                    `})})}
                </div>
              `})}
  
            ${g({id:"visual-gantt",iconName:"gantt",title:"Gantt Design System",text:"Применяемый язык план / распределено / факт / передача для часов, дней и недель.",className:"visual-gantt-system-panel",body:`
                <div class="visual-gantt-mode-grid" aria-label="Режимы отображения Gantt-колбасок">
                  <article class="visual-gantt-mode-column is-hours">
                    <header class="visual-gantt-mode-head"><strong>Часы</strong><span>смена и короткие операции</span></header>
                    <div class="visual-gantt-row"><span>План</span><i class="visual-gantt-bar is-plan" style="--bar-width:100%"><b class="visual-gantt-resource-label">1000</b></i></div>
                    <div class="visual-gantt-row is-scenarios">
                      <span>Распределено</span>
                      <span class="visual-gantt-scenario-stack">
                        <span class="visual-gantt-bar-stack"><em class="visual-gantt-bar-meta">План 1000 шт. · Распределено 1000 шт. · откл. 0</em><i class="visual-gantt-bar is-resource-capacity is-resource-match" style="--bar-width:83.33%; --resource-progress:100%"><b class="visual-gantt-resource-fill"><span>1000</span></b></i></span>
                        <span class="visual-gantt-bar-stack"><em class="visual-gantt-bar-meta">План 1000 шт. · Распределено 700 шт. · -300</em><i class="visual-gantt-bar is-resource-capacity is-resource-negative" style="--bar-width:83.33%; --resource-progress:70%; --resource-rest-left:70%; --resource-rest-width:30%"><b class="visual-gantt-resource-fill"><span>700</span></b><b class="visual-gantt-resource-rest-fill"><span>-300</span></b></i></span>
                      </span>
                    </div>
                    <div class="visual-gantt-row"><span>Факт</span><i class="visual-gantt-bar is-fact-capacity is-fact-scenario" style="--bar-width:83.33%"><b class="visual-gantt-fact-slice is-done" style="--slice-left:0%; --slice-width:70%"><span>700</span></b><b class="visual-gantt-fact-slice is-negative" style="--slice-left:70%; --slice-width:30%"><span>-300</span></b></i></div>
                    <div class="visual-gantt-row"><span>Передача</span><i class="visual-gantt-transfer-stack" style="--bar-width:100%"><b class="visual-gantt-bar is-transfer-main"><span class="visual-gantt-transfer-total">смена</span></b><b class="visual-gantt-transfer-batches"><em style="--batch-width:22%; --batch-left:0%"><span>120</span></em><em style="--batch-width:28%; --batch-left:30%"><span>160</span></em><em style="--batch-width:18%; --batch-left:70%"><span>90</span></em></b></i></div>
                  </article>
                  <article class="visual-gantt-mode-column is-days">
                    <header class="visual-gantt-mode-head"><strong>Дни</strong><span>операции, разрывы и выходные</span></header>
                    <div class="visual-gantt-row"><span>План</span><i class="visual-gantt-bar is-plan" style="--bar-left:4%; --bar-width:82%"><b class="visual-gantt-quantity">17-23.06</b></i></div>
                    <div class="visual-gantt-row"><span>Разрыв</span><i class="visual-gantt-segmented" style="--bar-left:4%; --bar-width:82%"><b class="visual-gantt-segment is-start"><span class="visual-gantt-quantity">пн-пт</span></b><b class="visual-gantt-segment is-break"></b><b class="visual-gantt-segment is-end"></b></i></div>
                    <div class="visual-gantt-row"><span>Факт</span><i class="visual-gantt-bar is-combined is-fact-mismatch" style="--bar-left:4%; --bar-width:82%; --validation-progress:100%; --fact-progress:64%"><b class="visual-gantt-validation-fill"></b><b class="visual-gantt-fact-fill"></b><b class="visual-gantt-mismatch-label">-360</b></i></div>
                  </article>
                  <article class="visual-gantt-mode-column is-weeks">
                    <header class="visual-gantt-mode-head"><strong>Недели</strong><span>длинные окна и поток партий</span></header>
                    <div class="visual-gantt-row"><span>План</span><i class="visual-gantt-bar is-plan" style="--bar-left:10%; --bar-width:74%"><b class="visual-gantt-quantity">25-28 нед.</b></i></div>
                    <div class="visual-gantt-row"><span>Риск</span><i class="visual-gantt-bar is-combined is-validation-mismatch" style="--bar-left:10%; --bar-width:74%; --validation-progress:82%; --fact-progress:0%"><b class="visual-gantt-validation-fill"></b><b class="visual-gantt-mismatch-marker"></b><b class="visual-gantt-mismatch-label">82%</b></i></div>
                    <div class="visual-gantt-row"><span>Порции</span><i class="visual-gantt-transfer-stack" style="--bar-left:10%; --bar-width:74%"><b class="visual-gantt-bar is-transfer-main"><span class="visual-gantt-transfer-total">1000 план</span></b><b class="visual-gantt-transfer-batches"><em style="--batch-width:18%; --batch-left:0%"><span>180</span></em><em style="--batch-width:22%; --batch-left:20%"><span>220</span></em><em style="--batch-width:14%; --batch-left:45%"><span>140</span></em></b></i></div>
                  </article>
                </div>
              `})}
  
            <section id="visual-icons" class="visual-system-section visual-system-icons-section" data-visual-section="visual-icons">
              ${F()}
            </section>
  
            ${g({id:"visual-qa",iconName:"copy",title:"QA и runtime contracts",text:"Проверки, запреты старого UI и воспроизводимые сценарии визуального контроля.",body:`
                <div class="visual-ui-kit-production-grid">
                  ${o({title:"UI-kit runtime contracts",meta:"helpers only",className:"visual-ui-kit-production-panel is-wide",body:c({body:`
                      <div class="visual-stabilization-grid">
                        <div class="visual-rule-card"><strong>Toolbar / FilterBar / ActionBar</strong>${A({className:"visual-ui-kit-toolbar",attributes:'aria-label="Пример панели инструментов"',body:`${R({className:"visual-ui-kit-filterbar",attributes:'role="group" aria-label="Фильтры"',body:`${r({label:"Все",iconName:"directory",tone:"compact"})}${r({label:"Риски",iconName:"alert",tone:"compact"})}`})}${V(`${r({label:"Обновить",iconName:"refresh"})}${r({label:"Сохранить",iconName:"save",tone:"primary"})}`)}`})}</div>
                        <div class="visual-rule-card"><strong>Dropdown</strong>${j({trigger:`${i("filter")}<span>Открыть список</span>`,body:'<button class="secondary-button ui-action-button" type="button">Нормально</button><button class="secondary-button ui-action-button" type="button">Предупреждение</button><button class="secondary-button ui-action-button" type="button">Ошибка</button>'})}</div>
                        <div class="visual-rule-card"><strong>Modal / Drawer</strong>${C({title:"Модальное окно",meta:"не шире viewport",body:"Содержимое должно помещаться без горизонтального выпадения.",actions:r({label:"Закрыть",iconName:"close"}),className:"is-sample"})}${D({title:"Drawer",meta:"панель деталей",body:"Правая панель использует тот же head/body/footer.",className:"is-sample"})}</div>
                        <div class="visual-rule-card"><strong>GanttBar helper</strong>${T({label:"План / распределено / факт",meta:"план 1000 · распределено 700 · факт 400",value:"400 / 700 / 1000",segments:[{tone:"is-fact",width:"40%",label:"400"},{tone:"is-assigned",width:"30%",label:"300"},{tone:"is-gap",width:"30%",label:"-300"}]})}</div>
                      </div>
                    `})})}
                  ${o({title:"Запрет старого UI",meta:"guardrails",className:"visual-ui-kit-production-panel",body:c({body:`
                      <div class="visual-legacy-guard-list">
                        ${N.map(e=>`
                          <div>
                            <strong>${t(e[0])}</strong>
                            <span>${t(e[1])}</span>
                            <small>${t(e[2])}</small>
                          </div>
                        `).join("")}
                      </div>
                    `})})}
                  ${o({title:"Design QA Snapshots",meta:"viewport",className:"visual-ui-kit-production-panel",body:c({body:`
                      <div class="visual-snapshot-table">
                        <div><strong>macbook-air-15</strong><span>1710x1112</span><small>эталонный viewport для регулярной проверки</small></div>
                      </div>
                      <code>node scripts/design-qa-snapshots.mjs --url=http://localhost:4174/</code>
                    `})})}
                  ${o({title:"Keyboard UX",meta:"accessibility",className:"visual-ui-kit-production-panel",body:c({body:`
                      <div class="visual-keyboard-list">
                        <span><kbd>Tab</kbd> видимый focus ring</span>
                        <span><kbd>Esc</kbd> закрытие dropdown/modal</span>
                        <span><kbd>Cmd</kbd><kbd>Shift</kbd><kbd>F</kbd> Focus Mode</span>
                      </div>
                    `})})}
                </div>
              `})}
          </div>
        </div>
      </section>
    `}function da(){const a=Object.entries(M).map(([s,v])=>({id:s,label:v.label,tone:v.tone})),l=[{id:"normal",label:"Normal",text:"базовое состояние без декоративного шума"},{id:"hover",label:"Hover",text:"легкая подсветка без скачка размера"},{id:"active",label:"Active",text:"короткое нажатие, только микросдвиг"},{id:"focus",label:"Focus",text:"единый focus ring через :focus-visible"},{id:"disabled",label:"Disabled",text:"недоступно, но читаемо"},{id:"loading",label:"Loading",text:"локальная загрузка, не блокирует экран"},{id:"dirty",label:"Dirty",text:"есть несохраненное изменение"},{id:"saved",label:"Saved",text:"короткое подтверждение сохранения"},{id:"error",label:"Error",text:"ошибка рядом с проблемным объектом"},{id:"selected",label:"Selected",text:"выбранная строка или слот"}],d=[["macbook-air-15","1710x1112","единый эталонный viewport для регулярной проверки верстки"]],m=[["Сайдбары","единый shell","Только module-data-sidebar, одинаковая высота, выделение активной строки через ui-sidebar-item без старых sidebar-card паттернов."],["Типографика","плотная","Шрифт не крупнее справочников; жирность только для заголовка строки, критичных чисел и активного состояния."],["Таблицы","MES dense","Страница не скроллится по X; внутренний scroll остается только у таблицы или временной шкалы."],["Dropdown","viewport-safe","Список должен быть доступен без прокрутки всей рабочей зоны; QA ловит выход за viewport."],["Focus Mode","без потерь","Скрывает вторичные панели, но не отключает действия и не меняет данные."],["Mobile","читаемо","Плотные схемы переходят в wrapped-слои, если иначе текст превращается в нечитаемую вертикаль."]],y=[["Surface","page / panel / raised","--mes-ui-surface-*"],["Text","body / muted / inverse","--mes-ui-text-*"],["Border","soft / default / strong","--mes-ui-border-*"],["Spacing","page / panel / control","--mes-space-* + density"],["Radius","xs / sm / md / lg / pill","--mes-ui-radius-*"],["Density","compact / default / touch","--mes-density-*"],["Overlay","modal / drawer / dropdown","--mes-ui-overlay-*"],["Gantt","slot / row / dependency","--mes-ui-gantt-*"]],$=[["primary","главное действие","save"],["secondary","обычное действие","refresh"],["ghost","тихое действие","filter"],["danger","опасное действие","trash"],["compact","панель фильтров","directory"],["touch","планшетная зона","check"],["icon","иконка","focus"],["table-icon","таблица","open"]],f=[["neutral","нейтрально"],["ready","готово"],["active","в работе"],["warning","предупреждение"],["blocked","заблокировано"],["problem","проблема"],["manual","ручной ввод"],["calculated","расчет"],["demo","демо"]],w=[["compact","таблицы, справочники","строка плотная, действия компактные"],["default","рабочие модули MES","баланс данных и читаемости"],["touch","авторизация, рабочий стол, факт","крупные зоны для планшета"]],S=[["Разрешено","таблицы","directory-table-wrap, route-object-table-wrap, visual-table-wrap"],["Разрешено","временная шкала","gantt-shell, supply-gantt-shell"],["Разрешено","карта производства","production-flow-lane как внутренний canvas"],["Запрещено","страница","body/app-shell/main-content не должны получать горизонтальный scroll"]],N=[["Старые карточки сайдбара","не использовать","Новые модули не добавляют отдельные switcher-кнопки над сайдбаром."],["Плашки-счетчики без действия","удалять","KPI вида Участков 6 / Планов 2 не добавлять, если они не помогают сценарию."],["Дубли паспорта","удалять","Если информация уже есть в структуре документа, не добавлять второй summary-блок."],["Демо-функция","изолировать","Демо-плашки использовать только для UX-макетов. Рабочие расчетные поля не окрашивать как демо."]],b=[{id:"stripe",title:"Полоса",meta:"левый маркер + светлый фон"},{id:"frame",title:"Рамка",meta:"без заливки, только границы"},{id:"first-cell",title:"Первая ячейка",meta:"темный якорь в названии"},{id:"marker-text",title:"Маркер + текст",meta:"минимум цвета"},{id:"gradient",title:"Градиент",meta:"цвет уходит вправо"},{id:"key-cell",title:"Ключевая ячейка",meta:"выделяется только СЗН"},{id:"dot",title:"Точка",meta:"малый маркер без заливки"},{id:"lift",title:"Подъем",meta:"строка чуть отделена тенью"},{id:"right-rail",title:"Правый rail",meta:"выбор читается по статусу"},{id:"id-pill",title:"Плашка СЗН",meta:"акцент только на номере"},{id:"soft-fill",title:"Мягкая заливка",meta:"без бокового маркера"},{id:"double-rail",title:"Двойной rail",meta:"левый выбор + правый статус"}],g=[{id:"top-rail",title:"Верхняя линия",meta:"акцент без изменения левого края"},{id:"thin-outline",title:"Тонкая рамка",meta:"самый спокойный вариант"},{id:"corner-pin",title:"Угол",meta:"короткий маркер в правом верхнем углу"},{id:"label-pill",title:"Плашка",meta:"акцент только на типе поля"},{id:"label-underline",title:"Подчеркивание",meta:"цвет внутри заголовка"},{id:"soft-surface",title:"Мягкий фон",meta:"легкая заливка без статуса"},{id:"lift",title:"Подъем",meta:"акцент через слой и тень"},{id:"dot",title:"Точка",meta:"минимальный маркер рядом с лейблом"}],e=[{title:"Распределено совпало · 1000",rows:[{meta:"План 1000 шт. · Распределено 1000 шт. · Факт 1000 шт. · откл. 0",width:"83.33%",aria:"Факт совпал с распределенным объемом: 1000 из 1000",segments:[{tone:"is-done",left:"0%",width:"100%",text:"1000"}]},{meta:"План 1000 шт. · Распределено 1000 шт. · Факт 1200 шт. · +200 к распределению",width:"100%",aria:"Факт больше распределенного объема: 1200 из 1000",segments:[{tone:"is-done",left:"0%",width:"83.33%",text:"1000"},{tone:"is-positive",left:"83.33%",width:"16.67%",text:"+200"}]},{meta:"План 1000 шт. · Распределено 1000 шт. · Факт 700 шт. · -300 к распределению",width:"83.33%",aria:"Факт меньше распределенного объема: 700 из 1000",segments:[{tone:"is-done",left:"0%",width:"70%",text:"700"},{tone:"is-negative",left:"70%",width:"30%",text:"-300"}]},{meta:"План 1000 шт. · Распределено 1000 шт. · Факт 0 шт. · -1000 к распределению",width:"83.33%",aria:"Факт равен нулю при распределенном объеме 1000",segments:[{tone:"is-negative is-full",left:"0%",width:"100%",text:"-1000"}]}]},{title:"Распределено больше · 1200",rows:[{meta:"План 1000 шт. · Распределено 1200 шт. · Факт 1200 шт. · откл. 0",width:"85.71%",aria:"Факт совпал с увеличенным распределением: 1200 из 1200",segments:[{tone:"is-done",left:"0%",width:"83.33%",text:"1000"},{tone:"is-positive",left:"83.33%",width:"16.67%",text:"+200"}]},{meta:"План 1000 шт. · Распределено 1200 шт. · Факт 1400 шт. · +200 к распределению",width:"100%",aria:"Факт больше увеличенного распределения: 1400 из 1200",segments:[{tone:"is-done",left:"0%",width:"71.43%",text:"1000"},{tone:"is-positive",left:"71.43%",width:"14.29%",text:"+200"},{tone:"is-positive-strong",left:"85.72%",width:"14.28%",text:"+200"}]},{meta:"План 1000 шт. · Распределено 1200 шт. · Факт 900 шт. · -300 к распределению",width:"85.71%",aria:"Факт меньше увеличенного распределения: 900 из 1200",segments:[{tone:"is-done",left:"0%",width:"75%",text:"900"},{tone:"is-negative",left:"75%",width:"25%",text:"-300"}]},{meta:"План 1000 шт. · Распределено 1200 шт. · Факт 0 шт. · -1200 к распределению",width:"85.71%",aria:"Факт равен нулю при распределенном объеме 1200",segments:[{tone:"is-negative is-full",left:"0%",width:"100%",text:"-1200"}]}]},{title:"Распределено меньше · 700",rows:[{meta:"План 1000 шт. · Распределено 700 шт. · Факт 700 шт. · -300 к плану",width:"83.33%",aria:"Факт совпал с меньшим распределением: 700 из 700, план 1000",segments:[{tone:"is-done",left:"0%",width:"70%",text:"700"},{tone:"is-plan-rest",left:"70%",width:"30%",text:"-300"}]},{meta:"План 1000 шт. · Распределено 700 шт. · Факт 900 шт. · +200 к распределению · -100 к плану",width:"83.33%",aria:"Факт больше меньшего распределения: 900 из 700, план 1000",segments:[{tone:"is-done",left:"0%",width:"70%",text:"700"},{tone:"is-positive",left:"70%",width:"20%",text:"+200"},{tone:"is-plan-rest",left:"90%",width:"10%",text:"-100"}]},{meta:"План 1000 шт. · Распределено 700 шт. · Факт 250 шт. · -450 к распределению · -300 к плану",width:"83.33%",aria:"Факт меньше меньшего распределения: 250 из 700, план 1000",segments:[{tone:"is-done",left:"0%",width:"25%",text:"250"},{tone:"is-negative",left:"25%",width:"45%",text:"-450"},{tone:"is-plan-rest",left:"70%",width:"30%",text:"-300"}]},{meta:"План 1000 шт. · Распределено 700 шт. · Факт 0 шт. · -700 к распределению · -300 к плану",width:"83.33%",aria:"Факт равен нулю при меньшем распределении 700, план 1000",segments:[{tone:"is-negative",left:"0%",width:"70%",text:"-700"},{tone:"is-plan-rest",left:"70%",width:"30%",text:"-300"}]}]}],h=s=>`
      <span class="visual-gantt-bar-stack">
        <em class="visual-gantt-bar-meta">${t(s.meta)}</em>
        <i class="visual-gantt-bar is-fact-capacity is-fact-scenario" style="--bar-width:${n(s.width)}" aria-label="${n(s.aria)}">
          ${s.segments.map(v=>`<b class="visual-gantt-fact-slice ${n(v.tone)}" style="--slice-left:${n(v.left)}; --slice-width:${n(v.width)}"><span>${t(v.text)}</span></b>`).join("")}
        </i>
      </span>
    `,k=s=>`
      <span class="visual-gantt-scenario-group">
        <strong>${t(s.title)}</strong>
        ${s.rows.map(h).join("")}
      </span>
    `;return`
      <section class="visual-system-page" data-layout="main-content" data-ui-component="VisualSystemRuntime" data-ui-runtime="visual-system-v1" aria-label="MES Visual System">
        <header class="visual-system-hero">
          <span class="eyebrow">UX-макет · проверочный стенд</span>
          <div>
            <h2>MES Visual System v1 Completion</h2>
            <p>Единый экран для проверки статусов, состояний, таблиц, форм, Gantt-элементов, empty/loading/error и runtime-контрактов.</p>
          </div>
          <div class="visual-system-hero-actions">
            <button class="secondary-button ui-action-button" data-toggle-focus-mode type="button">${i("focus")}<span>Фокус</span></button>
          </div>
        </header>
  
        <section class="visual-system-grid">
          <article class="visual-system-panel is-full visual-stabilization-panel">
            <div class="visual-system-panel-title">
              ${i("target")}
              <div><h3>MES Stabilization Pass v1</h3><p>Живые правила, которые теперь обязаны использовать новые и существующие модули.</p></div>
            </div>
            <div class="visual-stabilization-grid">
              ${m.map(s=>`
                <div class="visual-rule-card">
                  <strong>${t(s[0])}</strong>
                  <span>${t(s[1])}</span>
                  <small>${t(s[2])}</small>
                </div>
              `).join("")}
            </div>
          </article>
  
          <article class="visual-system-panel is-full visual-internal-ui-kit-panel" data-visual-qa-target="visual-system-internal-ui-kit">
            <div class="visual-system-panel-title">
              ${i("settings")}
              <div><h3>Internal UI Kit MES</h3><p>Production helpers, tokens and contracts used as the source of truth for new screens.</p></div>
            </div>
            <div class="visual-ui-kit-foundations">
              ${y.map(s=>`
                <article class="visual-ui-kit-foundation-card">
                  <strong>${t(s[0])}</strong>
                  <span>${t(s[1])}</span>
                  <code>${t(s[2])}</code>
                </article>
              `).join("")}
            </div>
            <div class="visual-ui-kit-production-grid">
              ${o({title:"Buttons / actions",meta:"renderUiActionButton",className:"visual-ui-kit-production-panel",body:c({body:`
                  <div class="visual-ui-kit-button-grid">
                    ${$.map(s=>r({label:s[0]==="icon"||s[0]==="table-icon"?"":s[1],iconName:s[2],tone:s[0],attributes:`type="button" aria-label="${n(`${s[0]}: ${s[1]}`)}"`})).join("")}
                  </div>
                `})})}
              ${o({title:"Status tokens",meta:"renderUiStatusToken",className:"visual-ui-kit-production-panel",body:c({body:`
                  <div class="visual-ui-kit-status-grid">
                    ${f.map(s=>u(s[1],s[0])).join("")}
                  </div>
                `})})}
              ${o({title:"Density",meta:"compact / default / touch",className:"visual-ui-kit-production-panel",body:c({body:`
                  <div class="visual-ui-kit-density-grid">
                    ${w.map(s=>`
                      <article class="visual-ui-kit-density-card is-${n(s[0])}">
                        <strong>${t(s[0])}</strong>
                        <span>${t(s[1])}</span>
                        <small>${t(s[2])}</small>
                      </article>
                    `).join("")}
                  </div>
                `})})}
              ${o({title:"DataTable / TreeTable",meta:"renderUiTableWrap",className:"visual-ui-kit-production-panel is-wide",body:c({body:U({className:"visual-ui-kit-table-wrap",body:`
                      <table class="ui-table visual-ui-kit-table" aria-label="UI Kit table sample">
                        <thead><tr><th>Документ</th><th>Состав</th><th>План</th><th>Статус</th><th>Действия</th></tr></thead>
                        <tbody>
                          <tr class="is-group"><td><strong>Заказ-наряд</strong><small>группа дерева</small></td><td>изд. "Хуета"</td><td>1 000</td><td>${u("в работе","active")}</td><td class="actions-cell">${r({label:"",iconName:"open",tone:"table-icon",attributes:'type="button" aria-label="Открыть группу"'})}</td></tr>
                          <tr class="is-selected"><td><strong>СЗН-20260502-D5-07</strong><small>сменный заказ-наряд</small></td><td>Выводной монтаж</td><td>700</td><td>${u("готово","ready")}</td><td class="actions-cell">${r({label:"",iconName:"print",tone:"table-icon",attributes:'type="button" aria-label="Печать"'})}</td></tr>
                          <tr><td><strong>СЗН-20260502-D5-08</strong><small>сменный заказ-наряд</small></td><td>Отмывка</td><td>300</td><td>${u("риск","warning")}</td><td class="actions-cell">${r({label:"",iconName:"open",tone:"table-icon",attributes:'type="button" aria-label="Открыть"'})}</td></tr>
                        </tbody>
                      </table>
                    `})})})}
            </div>
          </article>
  
          ${F()}
  
          <article class="visual-system-panel is-full">
            <div class="visual-system-panel-title">
              ${i("directory")}
              <div><h3>UI-kit runtime contracts</h3><p>Эталонные примитивы, через которые должны собираться новые модули и прототипы.</p></div>
            </div>
            <div class="visual-stabilization-grid">
              <div class="visual-rule-card">
                <strong>Panel / body / footer</strong>
                ${o({title:"Единая панель",meta:"без локальных отступов",body:`${c({body:"Тело панели растет по содержимому и не получает собственный вертикальный scroll."})}${G({body:r({label:"Действие",iconName:"check"})})}`,className:"visual-ui-kit-sample-panel"})}
              </div>
              <div class="visual-rule-card">
                <strong>Form field</strong>
                ${x({label:"Поле формы",control:'<input value="единая высота" />',hint:"input/select/textarea идут через один контракт"})}
                ${x({label:"Select",control:"<select><option>viewport-safe</option></select>"})}
              </div>
              <div class="visual-rule-card">
                <strong>Toolbar / FilterBar / ActionBar</strong>
                ${A({className:"visual-ui-kit-toolbar",attributes:'aria-label="Пример панели инструментов"',body:`
                    ${R({className:"visual-ui-kit-filterbar",attributes:'role="group" aria-label="Фильтры"',body:`
                        ${r({label:"Все",iconName:"directory",tone:"compact"})}
                        ${r({label:"Риски",iconName:"alert",tone:"compact"})}
                      `})}
                    ${V(`
                      ${r({label:"Обновить",iconName:"refresh"})}
                      ${r({label:"Сохранить",iconName:"save",tone:"primary"})}
                    `)}
                  `})}
              </div>
              <div class="visual-rule-card">
                <strong>Dropdown</strong>
                ${j({trigger:`${i("filter")}<span>Открыть список</span>`,body:`
                    <button class="secondary-button ui-action-button" type="button">Нормально</button>
                    <button class="secondary-button ui-action-button" type="button">Предупреждение</button>
                    <button class="secondary-button ui-action-button" type="button">Ошибка</button>
                  `})}
              </div>
              <div class="visual-rule-card">
                <strong>Modal / Drawer</strong>
                ${C({title:"Модальное окно",meta:"не шире viewport",body:"Содержимое должно помещаться без горизонтального выпадения.",actions:r({label:"Закрыть",iconName:"close"}),className:"is-sample"})}
                ${D({title:"Drawer",meta:"панель деталей",body:"Правая панель использует тот же head/body/footer.",className:"is-sample"})}
              </div>
              <div class="visual-rule-card">
                <strong>GanttBar</strong>
                ${T({label:"План / распределено / факт",meta:"план 1000 · распределено 700 · факт 400",value:"400 / 700 / 1000",segments:[{tone:"is-fact",width:"40%",label:"400"},{tone:"is-assigned",width:"30%",label:"300"},{tone:"is-gap",width:"30%",label:"-300"}]})}
              </div>
              <div class="visual-rule-card">
                <strong>Status / demo marker</strong>
                <span>${u("готово","ready")} ${u("риск","risk")} ${renderUiDemoBadge("Демо","не влияет")}</span>
                <span class="ui-demo-marker-host visual-ui-kit-demo-marker-sample">Интерактивная заглушка ${renderUiDemoInlineMarker()}${renderUiDemoCornerMarker()}</span>
              </div>
            </div>
          </article>
  
          <article class="visual-system-panel">
            <div class="visual-system-panel-title">
              ${i("directory")}
              <div><h3>Запрет старого UI</h3><p>Правила для новых модулей, чтобы не возвращались старые решения.</p></div>
            </div>
            <div class="visual-legacy-guard-list">
              ${N.map(s=>`
                <div>
                  <strong>${t(s[0])}</strong>
                  <span>${t(s[1])}</span>
                  <small>${t(s[2])}</small>
                </div>
              `).join("")}
            </div>
            <div class="visual-demo-function-card">
              <span class="visual-demo-function-token">Демо</span>
              <strong>UX-макет без влияния</strong>
              <small>темная демо-плашка допустима только в тестовых модулях, не в рабочих трудозатратах</small>
            </div>
            <div class="visual-demo-marker-grid" aria-label="Примеры круглого маркера демо-элемента">
              <article class="visual-demo-marker-sample">
                <span class="visual-demo-marker-preview" aria-label="Образец значка демо-функции">D</span>
                <strong>Значок D</strong>
                <small>образец круглого маркера, а не маркировка карточки стенда</small>
              </article>
              <article class="visual-demo-marker-sample is-section-sample">
                <strong>Где ставить</strong>
                <small>на рабочих UI-заглушках, которые выглядят функциональными, но не пишут в систему</small>
              </article>
              <article class="visual-demo-marker-sample is-module-sample">
                <strong>Где не ставить</strong>
                <small>на справочных карточках UI-kit и обычных визуальных образцах</small>
              </article>
            </div>
          </article>
  
          <article class="visual-system-panel">
            <div class="visual-system-panel-title">
              ${i("alert")}
              <div><h3>Сигналы системы</h3><p>Один смысл - один визуальный язык во всех модулях.</p></div>
            </div>
            <div class="visual-signal-grid">
              ${a.map(s=>`
                <span title="${n(s.id)}">${u(s.label,s.tone)}</span>
              `).join("")}
            </div>
          </article>
  
          <article class="visual-system-panel">
            <div class="visual-system-panel-title">
              ${i("target")}
              <div><h3>Interaction States Bible</h3><p>Матрица проверяется здесь, а не только в документе.</p></div>
            </div>
            <div class="visual-state-grid">
              ${l.map(s=>`
                <button class="visual-state-card is-${n(s.id)}" type="button" ${s.id==="disabled"?"disabled":""}>
                  <strong>${t(s.label)}</strong>
                  <span>${t(s.text)}</span>
                </button>
              `).join("")}
            </div>
          </article>
  
          <article class="visual-system-panel">
            <div class="visual-system-panel-title">
              ${i("edit")}
              <div><h3>Формы и поля</h3><p>Dirty, saved, warning, error, disabled, расчетное поле.</p></div>
            </div>
            <div class="visual-form-grid">
              <label class="form-field visual-state-dirty ui-form-field">
                <span>Название</span><input value="Несохраненное изменение" />
              </label>
              <label class="form-field visual-state-saved ui-form-field">
                <span>ERP документ</span><input value="ERP-2451 сохранен" />
              </label>
              <label class="form-field visual-state-error ui-form-field">
                <span>Срок</span><input value="не помещается" aria-invalid="true" /><small>Ошибка рядом с полем</small>
              </label>
              <label class="form-field is-resource-calculation-factor is-ux-labor-test ui-form-field">
                <span>База</span><input value="42 сек/цикл" readonly />
              </label>
              <label class="form-field ui-form-field">
                <span>Статус</span><select><option>Ожидает поставки</option></select>
              </label>
              <label class="visual-checkbox-row">
                <input type="checkbox" checked /><span>Крупная touch-зона</span>
              </label>
            </div>
          </article>
  
          <article class="visual-system-panel is-wide">
            <div class="visual-system-panel-title">
              ${i("directory")}
              <div><h3>Плотные таблицы MES</h3><p>Sticky actions, tree cell, compact chips, inline edit и внутренний scroll только внутри таблицы.</p></div>
            </div>
            ${U({className:"visual-table-wrap",body:`
              <table class="visual-system-table">
                <thead>
                  <tr><th>Дерево</th><th>Тип</th><th>Состояние</th><th>Поле</th><th>Действия</th></tr>
                </thead>
                <tbody>
                  <tr class="is-selected">
                    <td><span class="visual-tree-cell" style="--level:0">${i("tree")} Финальная сборка</span></td>
                    <td>${u("узел","manual")}</td>
                    <td>${u("готово","ready")}</td>
                    <td><input value="строка выбрана" /></td>
                    <td class="actions-cell"><button class="table-icon-button ui-action-button" type="button" title="Редактировать">${i("edit")}</button></td>
                  </tr>
                  <tr>
                    <td><span class="visual-tree-cell" style="--level:1">${i("bom")} Плата BOM_ELF</span></td>
                    <td>${u("расчет","calc")}</td>
                    <td>${u("ожидание","warning")}</td>
                    <td><input value="inline edit" /></td>
                    <td class="actions-cell"><button class="table-icon-button ui-action-button" type="button" title="Удалить">${i("trashSoft")}</button></td>
                  </tr>
                  <tr>
                    <td><span class="visual-tree-cell" style="--level:2">${i("operation")} SMT монтаж</span></td>
                    <td>${u("UX","test")}</td>
                    <td>${u("риск","risk")}</td>
                    <td><input value="dropdown не должен выходить" /></td>
                    <td class="actions-cell"><button class="table-icon-button ui-action-button" type="button" title="Открыть">${i("arrowRight")}</button></td>
                  </tr>
                </tbody>
              </table>
              `})}
          </article>
  
          <article class="visual-system-panel is-full visual-selected-row-panel" data-visual-qa-target="visual-selected-row-options">
            <div class="visual-system-panel-title">
              ${i("selection")}
              <div><h3>Выделение строки таблицы</h3><p>Двенадцать вариантов для Журнала СЗН и других плотных таблиц. Сравниваем только состояние выбранной строки.</p></div>
            </div>
            <div class="visual-selected-row-grid">
              ${b.map(s=>`
                <article class="visual-selected-row-option is-${n(s.id)}" data-visual-qa-target="visual-selected-row-option">
                  <header>
                    <strong>${t(s.title)}</strong>
                    <small>${t(s.meta)}</small>
                  </header>
                  <table data-ui-component="VisualSampleTable" aria-label="${n(`Вариант выделения строки: ${s.title}`)}">
                    <tbody>
                      <tr>
                        <td><span>СЗН-20260701-D5-06</span></td>
                        <td>Выводной монтаж</td>
                        <td>1 000</td>
                        <td>закрыт</td>
                      </tr>
                      <tr class="is-active">
                        <td><span>СЗН-20260702-D5-07</span></td>
                        <td>Отмывка</td>
                        <td>700</td>
                        <td>в работе</td>
                      </tr>
                      <tr>
                        <td><span>СЗН-20260703-D5-08</span></td>
                        <td>Контроль</td>
                        <td>300</td>
                        <td>план</td>
                      </tr>
                    </tbody>
                  </table>
                </article>
              `).join("")}
            </div>
          </article>
  
          <article class="visual-system-panel is-full visual-card-accent-panel" data-visual-qa-target="visual-card-accent-options">
            <div class="visual-system-panel-title">
              ${i("directory")}
              <div><h3>Акцент компактной карточки</h3><p>Варианты замены левого маркера в карточках правой панели Журнала СЗН. Сравниваем один и тот же контент в одинаковой геометрии.</p></div>
            </div>
            <div class="visual-card-accent-grid">
              ${g.map(s=>`
                <article class="visual-card-accent-option is-${n(s.id)}" data-visual-qa-target="visual-card-accent-option">
                  <header>
                    <strong>${t(s.title)}</strong>
                    <small>${t(s.meta)}</small>
                  </header>
                  <div class="visual-card-accent-preview" aria-label="${n(`Вариант акцента карточки: ${s.title}`)}">
                    <span>Заказ-наряд</span>
                    <strong>изд. "Хуета"</strong>
                    <small>Сборка в заготовку</small>
                  </div>
                </article>
              `).join("")}
            </div>
          </article>
  
          <article class="visual-system-panel is-full visual-gantt-system-panel">
            <div class="visual-system-panel-title">
              ${i("gantt")}
              <div><h3>Gantt Design System</h3><p>Три режима масштаба: часы, дни и недели. В каждом режиме колбаска сохраняет общий язык план / распределение / факт / передача.</p></div>
            </div>
            <div class="visual-gantt-mode-grid" aria-label="Режимы отображения Gantt-колбасок">
              <article class="visual-gantt-mode-column is-hours">
                <header class="visual-gantt-mode-head"><strong>Часы</strong><span>смена и короткие операции</span></header>
                <div class="visual-gantt-row">
                  <span>План</span>
                  <i class="visual-gantt-bar is-plan" style="--bar-width:100%" aria-label="Часовой режим: в заказ-наряде запланировано 1000 изделий">
                    <b class="visual-gantt-resource-label">1000</b>
                  </i>
                </div>
                <div class="visual-gantt-row is-scenarios">
                  <span>Распределено</span>
                  <span class="visual-gantt-scenario-stack">
                    <span class="visual-gantt-bar-stack">
                      <em class="visual-gantt-bar-meta">План 1000 шт. · Распределено 1000 шт. · откл. 0</em>
                      <i class="visual-gantt-bar is-resource-capacity is-resource-match" style="--bar-width:83.33%; --resource-progress:100%" aria-label="Распределение совпало с планом: 1000 из 1000. Длина нормирована относительно максимума сценариев 1200">
                        <b class="visual-gantt-resource-fill"><span>1000</span></b>
                      </i>
                    </span>
                    <span class="visual-gantt-bar-stack">
                      <em class="visual-gantt-bar-meta">План 1000 шт. · Распределено 1200 шт. · +200</em>
                      <i class="visual-gantt-bar is-resource-capacity is-resource-positive" style="--bar-width:100%; --resource-progress:83.33%; --resource-over-left:83.33%; --resource-over-width:16.67%" aria-label="Распределение больше плана: 1200 из 1000, позитивный запас 200">
                        <b class="visual-gantt-resource-fill"><span>1000</span></b>
                        <b class="visual-gantt-resource-overfill"><span>+200</span></b>
                      </i>
                    </span>
                    <span class="visual-gantt-bar-stack">
                      <em class="visual-gantt-bar-meta">План 1000 шт. · Распределено 700 шт. · -300</em>
                      <i class="visual-gantt-bar is-resource-capacity is-resource-negative" style="--bar-width:83.33%; --resource-progress:70%; --resource-rest-left:70%; --resource-rest-width:30%" aria-label="Распределение меньше плана: 700 из 1000, дефицит 300. Длина нормирована относительно максимума сценариев 1200">
                        <b class="visual-gantt-resource-fill"><span>700</span></b>
                        <b class="visual-gantt-resource-rest-fill"><span>-300</span></b>
                      </i>
                    </span>
                    <span class="visual-gantt-bar-stack">
                      <em class="visual-gantt-bar-meta">План 1000 шт. · Распределено 0 шт. · -1000</em>
                      <i class="visual-gantt-bar is-resource-capacity is-resource-zero" style="--bar-width:83.33%; --resource-rest-left:0%; --resource-rest-width:100%" aria-label="Распределение равно нулю: 0 из 1000, вся операция не распределена. Длина нормирована относительно максимума сценариев 1200">
                        <b class="visual-gantt-resource-rest-fill is-full"><span>1000</span></b>
                      </i>
                    </span>
                  </span>
                </div>
                <div class="visual-gantt-row is-scenarios">
                  <span>Факт</span>
                  <span class="visual-gantt-scenario-stack is-fact-scenarios">
                    ${e.map(k).join("")}
                  </span>
                </div>
                <div class="visual-gantt-row">
                  <span>Передача</span>
                  <i class="visual-gantt-transfer-stack" style="--bar-width:100%" aria-label="Часовой режим: три передаточные порции внутри смены">
                    <b class="visual-gantt-bar is-transfer-main"><span class="visual-gantt-transfer-total">смена</span></b>
                    <b class="visual-gantt-transfer-batches">
                      <em style="--batch-width:22%; --batch-left:0%" title="Передано 120"><span>120</span></em>
                      <em style="--batch-width:28%; --batch-left:30%" title="Передано 160"><span>160</span></em>
                      <em style="--batch-width:18%; --batch-left:70%" title="Передано 90"><span>90</span></em>
                    </b>
                  </i>
                </div>
              </article>
  
              <article class="visual-gantt-mode-column is-days">
                <header class="visual-gantt-mode-head"><strong>Дни</strong><span>операции, разрывы и выходные</span></header>
                <div class="visual-gantt-row"><span>План</span><i class="visual-gantt-bar is-plan" style="--bar-left:4%; --bar-width:82%"><b class="visual-gantt-quantity">17-23.06</b></i></div>
                <div class="visual-gantt-row">
                  <span>Разрыв</span>
                  <i class="visual-gantt-segmented" style="--bar-left:4%; --bar-width:82%" aria-hidden="true">
                    <b class="visual-gantt-segment is-start"><span class="visual-gantt-quantity">пн-пт</span></b>
                    <b class="visual-gantt-segment is-break"></b>
                    <b class="visual-gantt-segment is-end"></b>
                  </i>
                </div>
                <div class="visual-gantt-row">
                  <span>Вал.+факт</span>
                  <i class="visual-gantt-bar is-combined is-fact-mismatch" style="--bar-left:4%; --bar-width:82%; --validation-progress:100%; --fact-progress:64%" aria-label="Дневной режим: факт меньше валидированного плана">
                    <b class="visual-gantt-validation-fill"></b>
                    <b class="visual-gantt-fact-fill"></b>
                    <b class="visual-gantt-mismatch-label">-360</b>
                  </i>
                </div>
                <div class="visual-gantt-row"><span>Завис.</span><svg class="visual-gantt-dependency" viewBox="0 0 220 34" aria-hidden="true"><path d="M 10 17 H 74 V 8 H 132 V 24 H 200" /><path class="visual-gantt-arrow" d="M 199 20 L 209 24 L 199 28" /></svg></div>
              </article>
  
              <article class="visual-gantt-mode-column is-weeks">
                <header class="visual-gantt-mode-head"><strong>Недели</strong><span>длинные окна и поток партий</span></header>
                <div class="visual-gantt-row"><span>План</span><i class="visual-gantt-bar is-plan" style="--bar-left:10%; --bar-width:74%"><b class="visual-gantt-quantity">25-28 нед.</b></i></div>
                <div class="visual-gantt-row">
                  <span>Риск</span>
                  <i class="visual-gantt-bar is-combined is-validation-mismatch" style="--bar-left:10%; --bar-width:74%; --validation-progress:82%; --fact-progress:0%" aria-label="Недельный режим: распределение меньше исходного плана">
                    <b class="visual-gantt-validation-fill"></b>
                    <b class="visual-gantt-mismatch-marker"></b>
                    <b class="visual-gantt-mismatch-label">82%</b>
                  </i>
                </div>
                <div class="visual-gantt-row">
                  <span>Порции</span>
                  <i class="visual-gantt-transfer-stack" style="--bar-left:10%; --bar-width:74%" aria-label="Недельный режим: передаточные порции между операциями">
                    <b class="visual-gantt-bar is-transfer-main"><span class="visual-gantt-transfer-total">1000 план</span></b>
                    <b class="visual-gantt-transfer-batches">
                      <em style="--batch-width:18%; --batch-left:0%" title="Передано 180"><span>180</span></em>
                      <em style="--batch-width:22%; --batch-left:20%" title="Передано 220"><span>220</span></em>
                      <em style="--batch-width:14%; --batch-left:45%" title="Передано 140"><span>140</span></em>
                      <em style="--batch-width:26%; --batch-left:66%" title="Передано 260"><span>260</span></em>
                    </b>
                  </i>
                </div>
                <div class="visual-gantt-row is-tall">
                  <span>Поток</span>
                  <i class="visual-gantt-transfer-flow" aria-label="Недельный режим: поток передаточной порции в следующую операцию">
                    <b class="visual-gantt-flow-source">
                      <span class="visual-gantt-bar is-transfer-main" title="Операция A"><em>A</em></span>
                      <span class="visual-gantt-transfer-batches">
                        <em class="is-active" style="--batch-width:30%; --batch-left:28%" title="Передаточная порция 240 идет в операцию B"><span>240</span></em>
                      </span>
                    </b>
                    <svg class="visual-gantt-transfer-arrow" viewBox="0 0 220 54" aria-hidden="true" focusable="false">
                      <path d="M 74 37 C 104 48, 127 8, 158 19" />
                      <path class="visual-gantt-arrow" d="M 156 15 L 169 20 L 156 25" />
                    </svg>
                    <b class="visual-gantt-flow-target">
                      <span class="visual-gantt-bar is-transfer-target" title="Операция B"><em>B</em></span>
                      <span class="visual-gantt-incoming-batches">
                        <em class="is-active" style="--batch-width:30%; --batch-left:0%" title="Входящая порция 240 принята"><span>240</span></em>
                      </span>
                    </b>
                  </i>
                </div>
              </article>
            </div>
          </article>
  
          <article class="visual-system-panel">
            <div class="visual-system-panel-title">
              ${i("info")}
              <div><h3>Empty / Loading / Error</h3><p>Одинаковый тон для служебных состояний.</p></div>
            </div>
            <div class="visual-state-stack">
              <div class="empty-state">${i("search")}<span>Нет данных по текущему фильтру</span></div>
              <div class="visual-loading-line is-loading"><span>Локальная загрузка строки</span></div>
              <div class="visual-error-line">${i("alert")}<span>Системная ошибка рядом с объектом</span></div>
            </div>
          </article>
  
          <article class="visual-system-panel">
            <div class="visual-system-panel-title">
              ${i("keyboard")}
              <div><h3>Keyboard UX</h3><p>Проверка профессионального поведения без мыши.</p></div>
            </div>
            <div class="visual-keyboard-list">
              <span><kbd>Tab</kbd> видимый focus ring</span>
              <span><kbd>Esc</kbd> закрытие dropdown/modal</span>
              <span><kbd>Cmd</kbd><kbd>Shift</kbd><kbd>F</kbd> Focus Mode</span>
            </div>
          </article>
  
          <article class="visual-system-panel is-wide">
            <div class="visual-system-panel-title">
              ${i("copy")}
              <div><h3>Design QA Snapshots</h3><p>Воспроизводимая проверка ключевых viewport и модулей.</p></div>
            </div>
            <div class="visual-snapshot-table">
              ${d.map(s=>`
                <div><strong>${t(s[0])}</strong><span>${t(s[1])}</span><small>${t(s[2])}</small></div>
              `).join("")}
            </div>
            <code>node scripts/design-qa-snapshots.mjs --url=http://localhost:4174/</code>
          </article>
  
          <article class="visual-system-panel is-wide">
            <div class="visual-system-panel-title">
              ${i("focus")}
              <div><h3>Scroll ownership</h3><p>Где можно оставлять внутренний scroll, а где это считается ошибкой верстки.</p></div>
            </div>
            <div class="visual-scroll-zone-grid">
              ${S.map(s=>`
                <div class="${s[0]==="Запрещено"?"is-forbidden":"is-allowed"}">
                  <strong>${t(s[0])}</strong>
                  <span>${t(s[1])}</span>
                  <small>${t(s[2])}</small>
                </div>
              `).join("")}
            </div>
          </article>
  
        </section>
      </section>
    `}function oa(a){if(!a)return;const l=E(a.querySelector("[data-mes-icon-search]")?.value||""),d=a.querySelector('[data-mes-icon-filter="group"]')?.value||"",m=a.querySelector('[data-mes-icon-filter="status"]')?.value||"",y=a.querySelector('[data-mes-icon-filter="source"]')?.value||"",$=a.querySelector('[data-mes-icon-filter="usage"]')?.value||"",f=Array.from(a.querySelectorAll("[data-mes-icon-record]"));let w=0;f.forEach(b=>{const g=!l||E(b.dataset.iconSearch||"").includes(l),e=!d||b.dataset.iconGroup===d,h=!m||b.dataset.iconStatus===m,k=!y||b.dataset.iconSource===y,s=!$||b.dataset.iconUsage===$,v=g&&e&&h&&k&&s;b.hidden=!v,v&&b.matches(".visual-icon-card")&&(w+=1)});const S=a.querySelector("[data-mes-icon-filter-count]");S&&(S.textContent=`${w.toLocaleString("ru-RU")} строк`);const N=a.querySelector("[data-mes-icon-empty]");N&&(N.hidden=w>0)}function ca(){const a=W.querySelector("[data-mes-icon-section]");if(!a)return;const l=()=>oa(a);a.querySelectorAll("[data-mes-icon-search], [data-mes-icon-filter]").forEach(d=>{d.addEventListener("input",l),d.addEventListener("change",l)}),l()}return{bindVisualSystemIconFilters:ca,renderVisualSystemPage:la}}export{ua as createVisualSystemModule};
