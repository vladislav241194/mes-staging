function Pt(B={}){const{DAY_MS:A,PRODUCTION_FLOW_STAGE_DEFINITIONS:D,PRODUCTION_RESOURCE_TYPE_LABELS:k,SHOP_FLOOR_PLAN_ASSET:V,SHOP_FLOOR_PLAN_META:y,UNIT_TYPE_LABELS:H,addMs:q,escapeAttribute:p,escapeHtml:r,formatDateTimeShort:L,getDispatchSlotTone:Y,getGanttSlotStatusView:z,getOperationMapRows:U,getOperationRouteWorkCenterId:J,getPlanningState:K,getProductionResourceWorkCenterId:I,getProductionResources:N,getProjectDisplayName:Q,getRouteInstructionWorkCenterId:X,getRoutePlanningContext:Z,getRouteStepSelectedPlanningWorkCenterId:tt,getShopFloorWidgets:x,getShopMapLayoutDirty:et,getSlotDurationHours:nt,getSlotGanttWorkCenterId:at,getSlotPlanningOrderId:W,getSlotProductionContextId:ot,getSlotRouteId:st,getUi:lt,getWorkCalendarLabel:_,getWorkCenter:R,getWorkCenterCapacity:rt,icon:m,isGanttSlotCompleted:b,isGanttSlotRiskStatus:it,mapLegacyWorkCenterId:E,renderUiDemoCornerMarker:f,renderUiModalShell:ct,renderUiModuleHeader:pt,renderUiModulePage:dt,renderUiPanelBody:v,renderUiPanelHead:S,toDate:u}=B,g=new Proxy({},{get(t,a){return K()?.[a]}}),w=new Proxy({},{get(t,a){return lt()?.[a]}});function ut(t={}){return new Set((t.workCenterIds||[]).map(a=>E(a)).filter(Boolean))}function mt(t={},a=null){return[at(t),t.workCenterId,t.routeWorkCenterId,a?.workCenterId,a?tt(a,g,{currentWorkCenterId:t.workCenterId}):"",a?.planningWorkCenterId,a?.resourceId,t.resourceId].map(l=>X(l)||E(l)).filter(Boolean)}function F(t={},a=new Set,l=null){return mt(t,l).some(i=>a.has(i))}function gt(t={},a=new Map,l=new Map){const i=l.get(t.routeStepId),c=st(t,g);return a.get(c)||a.get(i?.routeId)||a.get(W(t,c))||(g.routes||[]).find(o=>o.specificationId===ot(t)||o.id===W(t,c))||null}function O(t={},a=new Map,l=new Map){const i=gt(t,a,l),c=i?Z(i):null;return Q(c)||i?.name||t.projectName||"Заказ-наряд"}function ht(t={}){return t.riskSlots.length?"critical":t.activeSlots.length?"active":t.queuedSlots.length?"warning":t.completedSlots.length&&!t.openSlots.length?"ok":"neutral"}function $t(){const t=u(w.now||new Date),a=new Map((g.routes||[]).map(o=>[o.id,o])),l=new Map((g.routeSteps||[]).map(o=>[o.id,o])),i=N({includeInactive:!0}),c=U({includeInactive:!0});return D.map(o=>{const h=ut(o),e=(g.slots||[]).filter(n=>F(n,h,l.get(n.routeStepId))).sort((n,$)=>u(n.plannedStart)-u($.plannedStart)),s=e.filter(n=>it(n)||!b(n)&&n.plannedEnd&&u(n.plannedEnd)<t),d=e.filter(n=>["in_progress","problem","overdue"].includes(z(n).value)||!b(n)&&u(n.plannedStart)<=t&&u(n.plannedEnd)>=t),C=e.filter(n=>!b(n)&&!d.includes(n)&&!s.includes(n)),P=e.filter(n=>b(n)),M=e.filter(n=>!b(n)),ft=i.filter(n=>h.has(I(n))),wt=c.filter(n=>h.has(J(n)||n.workCenterId)),T=[...h].map(n=>R(n)).filter(Boolean),G=Math.max(1,T.reduce((n,$)=>n+rt($.id),0)),It=e.reduce((n,$)=>n+nt($),0),Rt=Math.max(0,Math.min(100,Math.round((M.length+d.length*1.5)/Math.max(1,G*2)*100))),Ct=M.filter(n=>n.plannedEnd&&u(n.plannedEnd)>=q(t,-A)).sort((n,$)=>Number(s.includes($))-Number(s.includes(n))||u(n.plannedStart)-u($.plannedStart)).slice(0,3),j={...o,stageIds:h,centers:T,resources:ft,operations:wt,slots:e,riskSlots:s,activeSlots:d,queuedSlots:C,completedSlots:P,openSlots:M,nextSlots:Ct,hours:It,capacity:G,load:Rt};return{...j,flowTone:ht(j)}})}function St(t,a,l){return`
      <article class="production-flow-node is-${p(t.flowTone)} is-tone-${p(t.tone)}">
        <div class="production-flow-node-head">
          <span class="production-flow-icon">${m(t.iconName)}</span>
          <span>
            <strong>${r(t.label)}</strong>
            <small>${r(t.caption)}</small>
          </span>
        </div>
        <div class="production-flow-load" style="--flow-load:${t.load}%;">
          <span></span>
        </div>
        <div class="production-flow-metrics">
          <span><b>${t.activeSlots.length.toLocaleString("ru-RU")}</b><small>активно</small></span>
          <span><b>${t.queuedSlots.length.toLocaleString("ru-RU")}</b><small>очередь</small></span>
          <span><b>${t.riskSlots.length.toLocaleString("ru-RU")}</b><small>риск</small></span>
        </div>
        <div class="production-flow-node-foot">
          <em>${t.resources.length.toLocaleString("ru-RU")} рес.</em>
          <em>${t.operations.length.toLocaleString("ru-RU")} оп.</em>
          <em>${t.load}%</em>
        </div>
        ${t.nextSlots.length?`
          <div class="production-flow-mini-list">
            ${t.nextSlots.map(i=>`
              <span title="${p(`${O(i,a,l)} · ${i.operationName||"Операция"}`)}">
                <b>${r(i.operationName||"Операция")}</b>
                <small>${r(L(i.plannedStart))}</small>
              </span>
            `).join("")}
          </div>
        `:`
          <div class="production-flow-empty">нет открытых операций</div>
        `}
      </article>
    `}function bt(){const t=$t(),a=new Map((g.routes||[]).map(s=>[s.id,s])),l=new Map((g.routeSteps||[]).map(s=>[s.id,s])),i=t.flatMap(s=>s.openSlots),c=t.reduce((s,d)=>s+d.activeSlots.length,0),o=t.reduce((s,d)=>s+d.riskSlots.length,0),h=t.reduce((s,d)=>s+d.queuedSlots.length,0),e=i.sort((s,d)=>u(s.plannedStart)-u(d.plannedStart)).slice(0,6);return`
            <section class="module-panel shop-map-flow-panel ui-demo-marker-host" data-ui-component="Panel">
        ${f("Демо-блок: карта потока не меняет план и связи")}
        ${S({title:"Карта производственного потока",meta:"демо-слой: движение заказов по участкам на основе текущего Ганта и маршрутных операций",className:"production-flow-head",actionsClassName:"production-flow-summary",actions:`
            <span><b>${c.toLocaleString("ru-RU")}</b> активно</span>
            <span><b>${h.toLocaleString("ru-RU")}</b> в очереди</span>
            <span class="${o?"is-critical":""}"><b>${o.toLocaleString("ru-RU")}</b> риск</span>
          `})}
  
        ${v({body:`
          <div class="production-flow-lane" aria-label="Карта производственного потока">
            ${t.map(s=>St(s,a,l)).join("")}
          </div>
  
          <div class="production-flow-bottom">
            <section class="production-flow-next">
              ${S({title:"Ближайшие движения",meta:"только существующие слоты Ганта"})}
              ${e.length?`
                <div class="production-flow-next-list">
                  ${e.map(s=>{const d=l.get(s.routeStepId),C=t.find(P=>F(s,P.stageIds,d));return`
                      <article class="is-${p(Y(s))}">
                        <span>${r(C?.label||R(s.workCenterId)?.name||"Участок")}</span>
                        <strong>${r(s.operationName||"Операция")}</strong>
                        <small>${r(O(s,a,l))} · ${r(L(s.plannedStart))}</small>
                      </article>
                    `}).join("")}
                </div>
              `:`
                <div class="module-preview-empty production-flow-placeholder">
                  ${m("gantt")}
                  <strong>Открытых слотов пока нет</strong>
                  <span>После передачи заказ-наряда в Гант карта покажет ближайшие движения по потоку.</span>
                </div>
              `}
            </section>
            <section class="production-flow-legend">
              <strong>Что показывает прототип</strong>
              <span><i class="is-active"></i> активные операции и текущие окна</span>
              <span><i class="is-warning"></i> очередь перед участком</span>
              <span><i class="is-critical"></i> просрочка, пауза или проблема</span>
              <small>Карта не меняет план и не создает новые связи. Это обзорный слой для диспетчера.</small>
            </section>
          </div>
        `})}
      </section>
    `}function vt(){const t=x(),a=!!w.shopMapEditMode,l=N({includeInactive:!0}),i=l.filter(e=>!["Отключен","inactive"].includes(e.status)),c=U({includeInactive:!0}),o=l.filter(e=>I(e)),h=[{title:"SVG-план",note:`${y.source} · ${y.viewBox}`,count:"1"},{title:"Отделы",note:"виджеты из текущего справочника",count:t.length},{title:"Ресурсы",note:"линии, станки, посты и оборудование",count:l.length},{title:"Операции",note:"только счетчики по справочнику операций",count:c.length}];return dt({ariaLabel:"Карта цеха",className:`shop-map-page ${a?"is-editing":"is-viewing"}`,contentClassName:"shop-map-content",header:pt({eyebrow:"SVG-подложка и координаты виджетов",title:"Расстановка отделов и ресурсов матрицы",description:"В режиме редактирования виджеты можно двигать по SVG. Новые координаты попадут в систему только после сохранения.",cornerMarker:f("Карта цеха: визуальный слой координат"),actions:`<div class="shop-map-readonly-badge">${m(a?"edit":"lock")}<span>${a?"Редактирование":"Просмотр"}</span></div>`}),content:`
        ${bt()}
  
            <section class="module-panel shop-map-canvas-panel ui-demo-marker-host" data-ui-component="Panel">
              ${f("Демо-блок: SVG-карта и координаты виджетов")}
              ${S({title:y.title,meta:a?"перетащите виджеты и сохраните координаты":`подложка ${y.source} · виджеты поверх плана`,className:"shop-map-panel-head",actionsClassName:"shop-map-actions",actions:a?`
                  <button class="secondary-button ui-action-button" data-shop-map-cancel-layout type="button">${m("close")}<span>Отмена</span></button>
                  <button class="primary-button ui-action-button" data-shop-map-save-layout type="button" ${et()?"":"disabled"}>${m("save")}<span>Сохранить координаты</span></button>
                `:`
                  <button class="secondary-button ui-action-button" data-shop-map-edit-layout type="button">${m("edit")}<span>Редактировать карту</span></button>
                `})}
              ${v({body:`
                <div class="shop-map-canvas-frame">
                  <div class="shop-map-canvas-inner" data-shop-map-canvas>
                    <img class="shop-map-svg" src="${V}" alt="SVG-план производственной зоны" />
                    <div class="shop-map-overlay" aria-label="Виджеты отделов">
                      ${t.map(e=>`
                        <button
                          type="button"
                          class="shop-map-widget is-${p(e.layout.tone)} ${a?"is-draggable":""}"
                          data-shop-map-widget-id="${p(e.center.id)}"
                          data-shop-map-x="${Number(e.layout.x)}"
                          data-shop-map-y="${Number(e.layout.y)}"
                          data-shop-map-draggable="${a?"true":"false"}"
                          aria-label="${a?"Переместить виджет отдела":"Открыть карточку отдела"} ${p(e.center.name)}"
                          title="${p(e.center.name)}"
                          style="--shop-map-x: ${Number(e.layout.x)}%; --shop-map-y: ${Number(e.layout.y)}%;"
                        >
                          <strong title="${p(e.center.name)}">${r(e.center.name)}</strong>
                          <span>${r(_(e.center))}</span>
                          <em>${e.activeResourceCount.toLocaleString("ru-RU")} рес. · ${e.operations.length.toLocaleString("ru-RU")} оп.</em>
                          <i class="shop-map-widget-coords">${Number(e.layout.x).toFixed(1)} / ${Number(e.layout.y).toFixed(1)}</i>
                        </button>
                      `).join("")}
                    </div>
                  </div>
                </div>
              `})}
            </section>
  
              <section class="module-panel shop-map-resources-panel" data-ui-component="Panel">
              ${S({title:"Виджеты ресурсов",meta:"данные берутся из модуля сотрудники, без создания новых связей"})}
              ${v({body:l.length?`
                  <div class="directory-table-wrap shop-map-resource-table ui-table-wrap" data-layout="table" data-scroll-contract="horizontal-only" data-ui-component="TableWrap">
                    <table class="directory-table">
                      <thead>
                        <tr>
                          <th>Ресурс</th>
                          <th>Отдел</th>
                          <th>Тип</th>
                          <th>План</th>
                          <th>Расчет</th>
                          <th>Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${l.map(e=>{const s=R(I(e));return`
                            <tr>
                              <td class="primary-cell" title="${p(e.name)}">${r(e.name)}</td>
                              <td>${r(s?.name||"не привязан")}</td>
                              <td>${r(k[e.type]||e.type||"-")}</td>
                              <td>${r(e.participatesInPlanning==="no"?"Нет":"Да")}</td>
                              <td>${r(e.participatesInCalculation==="no"?"Нет":"Да")}</td>
                              <td>${r(e.status||"-")}</td>
                            </tr>
                          `}).join("")}
                      </tbody>
                    </table>
                  </div>
                `:`
                  <div class="bom-import-empty module-preview-empty">
                    ${m("map")}
                    <strong>Ресурсы матрицы не заполнены</strong>
                    <span>Когда в матрице структуры появятся ресурсы, они отобразятся в этом списке и в виджетах карты.</span>
                  </div>
                `})}
            </section>
  
              <section class="module-panel shop-map-overview-panel" data-ui-component="Panel">
              ${v({body:`
                <article>
                  <span>Отделы</span>
                  <strong>${t.length.toLocaleString("ru-RU")}</strong>
                  <small>выведены на карту</small>
                </article>
                <article>
                  <span>Ресурсы</span>
                  <strong>${i.length.toLocaleString("ru-RU")}</strong>
                  <small>активных из ${l.length.toLocaleString("ru-RU")}</small>
                </article>
                <article>
                  <span>Операции</span>
                  <strong>${c.length.toLocaleString("ru-RU")}</strong>
                  <small>из справочника операций</small>
                </article>
                <article>
                  <span>Привязка</span>
                  <strong>${o.length.toLocaleString("ru-RU")}</strong>
                  <small>ресурсов с отделом</small>
                </article>
              `})}
            </section>
  
              <section class="module-panel shop-map-next-panel ui-demo-marker-host" data-ui-component="Panel">
              ${f("Демо-блок: правила визуального слоя")}
              ${S({title:"Правила визуального слоя",meta:"координаты не вмешиваются в бизнес-логику"})}
              ${v({body:`
                <div class="shop-map-next-grid">
                  <article><b>Координаты SVG</b><span>позиции хранятся в процентах от области плана и не съезжают при масштабировании.</span></article>
                  <article><b>Только после сохранения</b><span>перетаскивание меняет черновик, а не сохраненный слой.</span></article>
                  <article><b>Без новых связей</b><span>виджет остается визуальным отображением отдела из модуля сотрудники.</span></article>
                </div>
              `})}
            </section>
      `})}function yt(){if(!w.activeShopMapWidgetId)return"";const t=x().find(o=>o.center.id===w.activeShopMapWidgetId);if(!t)return"";const a=H[t.center.unitType]||t.center.unitType||"Отдел",l=t.resources||[],i=t.operations||[],c=l.filter(o=>!["Отключен","inactive"].includes(o.status));return`
      <div class="modal-backdrop shop-map-widget-backdrop" data-shop-map-widget-backdrop>
        ${ct({className:"large-modal form-modal shop-map-widget-modal",attributes:`aria-label="Карточка отдела ${p(t.center.name)}"`,content:`
          <div class="modal-header">
            <div>
              <span class="eyebrow">Карта цеха · Виджет отдела</span>
              <h2>${r(t.center.name)}</h2>
            </div>
            <button class="icon-button ui-action-button" data-shop-map-widget-close type="button" title="Закрыть">${m("close")}</button>
          </div>
          <div class="shop-map-modal-body">
            <section class="shop-map-modal-summary">
              <article>
                <span>Тип</span>
                <strong>${r(a)}</strong>
              </article>
              <article>
                <span>График</span>
                <strong>${r(_(t.center))}</strong>
              </article>
              <article>
                <span>Ресурсы</span>
                <strong>${c.length.toLocaleString("ru-RU")} / ${l.length.toLocaleString("ru-RU")}</strong>
              </article>
              <article>
                <span>Операции</span>
                <strong>${i.length.toLocaleString("ru-RU")}</strong>
              </article>
            </section>
  
            <section class="shop-map-modal-section">
              ${S({title:"Ресурсы матрицы",meta:"линии, посты и оборудование, привязанные к отделу"})}
              ${l.length?`
                <div class="shop-map-modal-list">
                  ${l.map(o=>`
                    <article>
                      <div>
                        <strong title="${p(o.name)}">${r(o.name)}</strong>
                        <span>${r(k[o.type]||o.type||"тип не задан")}</span>
                      </div>
                      <em>${r(o.status||"статус не задан")}</em>
                    </article>
                  `).join("")}
                </div>
              `:`
                <div class="module-preview-empty shop-map-modal-empty">
                  ${m("map")}
                  <strong>Ресурсы не привязаны</strong>
                  <span>Добавьте производственные ресурсы в модуль сотрудники, чтобы они появились в этой карточке.</span>
                </div>
              `}
            </section>
  
            <section class="shop-map-modal-section">
              ${S({title:"Операции отдела",meta:"операции из справочника операций"})}
              ${i.length?`
                <div class="shop-map-modal-list">
                  ${i.map(o=>`
                    <article>
                      <div>
                        <strong title="${p(o.name)}">${r(o.name)}</strong>
                        <span>${r(o.code||o.id||"код не задан")}</span>
                      </div>
                      <em>${r(o.status||"статус не задан")}</em>
                    </article>
                  `).join("")}
                </div>
              `:`
                <div class="module-preview-empty shop-map-modal-empty">
                  ${m("route")}
                  <strong>Операции не заданы</strong>
                  <span>Заполните справочник операций с привязкой к этому отделу.</span>
                </div>
              `}
            </section>
          </div>
          <div class="modal-footer">
            <button class="secondary-button ui-action-button" data-shop-map-widget-close type="button">Закрыть</button>
          </div>
        `})}
      </div>
    `}return{renderShopFloorMapPage:vt,renderShopMapWidgetModal:yt}}export{Pt as createShopMapRenderModule};
