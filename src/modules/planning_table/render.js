function Jt(O={}){const{addMs:L,DAY_MS:m,escapeAttribute:R,escapeHtml:l,formatShortDate:_,formatDateTimeShort:u,formatDuration:b,fromDateInput:w,getGanttResourceForSlot:z=()=>null,getGanttSlotStatusView:A=()=>({label:"план",tone:"neutral"}),getMesStatusView:Xt=(n="",t="",e={})=>({label:String(t||e.label||""),tone:e.tone||"neutral"}),getSlotGanttWorkCenterId:V=()=>"",getSlotRoute:H=()=>null,getSlotWorkingDurationMs:X=()=>0,getSlotCalendarDurationMs:K=()=>0,getRouteStepPlanningTask:Y=()=>null,getPlanningOrderObjectLabel:J=()=>"",getPlanningState:P,getRoutePlanningContext:Kt,getSlotRouteId:Z,getSlotWarnings:tt,getUi:v,getWorkCenter:U=()=>null,icon:nt,joinUiClasses:et=(...n)=>n.flat().filter(Boolean).join(" "),mapLegacyWorkCenterId:at=n=>n,normalizeQuantity:rt=(n,t=0)=>Number(n)||t,normalizeShiftMasterFactQuantity:G=(n=0)=>Number(n||0)||0,normalizeUiTone:lt=(n="neutral")=>String(n||"neutral"),renderUiDemoBadge:st=()=>"",renderUiDemoCornerMarker:d,renderUiEmptyState:ot,renderUiModuleHeader:it,renderUiModulePage:dt,renderUiModuleSidebar:ut=()=>"",renderUiPanel:c,renderUiPanelBody:g,renderUiSidebarItem:ct=()=>"",renderUiStatusToken:p,renderUiTableWrap:h,slotMatchesPlanningOrder:Yt,startOfDay:$,toDate:W,toDateInput:gt}=O,f=new Proxy({},{get(n,t){return P()?.[t]},set(n,t,e){const a=P();return a&&(a[t]=e),!0}}),C=new Proxy({},{get(n,t){return v()?.[t]},set(n,t,e){const a=v();return a&&(a[t]=e),!0}});function D(){const n=new Map((f.routeSteps||[]).map(a=>[a.id,a])),e=tt(f).slotWarningMap||{};return(f.slots||[]).map(a=>{const r=n.get(a.routeStepId)||null,s=H(a),o=s?.id||Z(a,f),i=s&&r?Y(s,r):null,y=A(a),N=at(V(a)||a.workCenterId||r?.workCenterId||""),F=U(N)||U(a.workCenterId)||null,_t=z(a),zt=W(a.plannedStart),At=W(a.plannedEnd),Vt=(e[a.id]||[]).length,Ht=rt(a.quantity||s?.planningQuantity||1,1);return{id:a.id,slot:a,step:r,route:s,task:i,status:y,warningCount:Vt,plannedStart:zt,plannedEnd:At,quantity:Ht,unit:a.unit||i?.unit||"шт.",routeLabel:J(s)||s?.name||"Заказ-наряд",routeName:s?.name||o||"Маршрутная карта не найдена",taskLabel:i?[i.number,i.title].filter(Boolean).join(" · "):r?.specTaskName||"Общий маршрут",operationName:a.operationName||r?.operationName||"Операция",workCenterId:N,workCenterLabel:F?.name||N||"Участок не задан",resourceLabel:_t?.name||F?.name||"Ресурс не назначен",workingMs:X(a),calendarMs:K(a)}}).sort((a,r)=>a.plannedStart-r.plannedStart||a.workCenterLabel.localeCompare(r.workCenterLabel,"ru")||a.operationName.localeCompare(r.operationName,"ru"))}function pt(n=[]){const t=n.length?n.reduce((s,o)=>new Date(Math.min(s.getTime(),o.plannedStart.getTime())),n[0].plannedStart):null,e=$(w(C.windowStart)),a=n.some(s=>s.plannedStart<L(e,14*m)&&s.plannedEnd>e),r=$(a?e:t||e);return Array.from({length:14},(s,o)=>{const i=L(r,o*m);return{id:gt(i),date:i,end:L(i,m),label:_(i),weekday:i.toLocaleDateString("ru-RU",{weekday:"short"}),isWeekend:i.getDay()===0||i.getDay()===6}})}function I(){const n=D(),t=pt(n),e=E(n),a=x(n),r=n.reduce((o,i)=>o+i.workingMs,0),s=n.reduce((o,i)=>o+i.warningCount,0);return{rows:n,days:t,resourceGroups:e,issueRows:Ct(n,t),dailyLoads:Q(n,t),queueRows:Tt(n),orderGroups:Nt(n),bufferRows:Pt(n),planFactRows:vt(n),densityDays:wt(n,t),dependencyRows:Ut(n),statusGroups:a,totalWorkingMs:r,warningCount:s}}function E(n=[]){const t=new Map;return n.forEach(e=>{t.has(e.workCenterId||e.workCenterLabel)||t.set(e.workCenterId||e.workCenterLabel,{id:e.workCenterId||e.workCenterLabel,label:e.workCenterLabel,resourceLabel:e.resourceLabel,rows:[],totalWorkingMs:0});const a=t.get(e.workCenterId||e.workCenterLabel);a.rows.push(e),a.totalWorkingMs+=e.workingMs}),[...t.values()].sort((e,a)=>a.totalWorkingMs-e.totalWorkingMs||e.label.localeCompare(a.label,"ru"))}function x(n=[]){const t=new Map;return n.forEach(e=>{t.set(e.status.value,{status:e.status,count:(t.get(e.status.value)?.count||0)+1})}),[...t.values()].sort((e,a)=>a.count-e.count)}function bt(n,t,e={}){const a=Array.isArray(e.days)&&e.days.length?e.days:n.days;return{...n,rows:t,days:a,resourceGroups:E(t),statusGroups:x(t),totalWorkingMs:t.reduce((r,s)=>r+s.workingMs,0),warningCount:t.reduce((r,s)=>r+s.warningCount,0)}}function M(n,t){return n.plannedStart<t.end&&n.plannedEnd>t.date}function ht(){const n=I(),t=st("Демо-представление","читает Gantt, не меняет план"),e=ut({eyebrow:"UX-макет",title:"План-таблица",className:"planning-table-sidebar",cornerMarker:d("План-таблица: read-only UX-представление Gantt"),body:`
        <div class="ui-sidebar-list planning-table-sidebar-stack">
          ${k("Слотов Gantt",n.rows.length.toLocaleString("ru-RU"),"операции текущего плана")}
          ${k("Ресурсов",n.resourceGroups.length.toLocaleString("ru-RU"),"по участкам и линиям")}
          ${k("Рабочее время",b(n.totalWorkingMs),"с учетом календарей ресурсов")}
          ${k("Сигналов",n.warningCount.toLocaleString("ru-RU"),"конфликты и предупреждения")}
        </div>
        <div class="planning-table-status-list">
          <div class="ui-sidebar-label">Статусы слотов</div>
          ${n.statusGroups.length?n.statusGroups.map(({status:a,count:r})=>`
            <div class="planning-table-status-row">
              ${p(a.label,a.tone)}
              <strong>${r.toLocaleString("ru-RU")}</strong>
            </div>
          `).join(""):'<span class="planning-table-muted">Нет слотов</span>'}
        </div>
      `});return dt({ariaLabel:"Планирование таблицей",className:"planning-table-page",sidebar:e,workspaceClassName:"planning-table-workspace",contentClassName:"planning-table-content",header:it({eyebrow:"Альтернативное представление планирования",title:"Gantt как таблица",description:"Те же слоты планирования показаны как матрица ресурсов по дням и как плотный реестр операций.",actions:t,className:"directory-header planning-table-header",cornerMarker:d("План-таблица: читает Gantt, не меняет план")}),content:n.rows.length?`
        ${yt(n)}
        ${Gt(n)}
        ${Dt(n)}
        ${It(n)}
        ${Et(n)}
        ${xt(n)}
        ${jt(n)}
        ${qt(n)}
        ${Qt(n)}
        ${Bt(n)}
        ${Ft(n)}
      `:c({title:"План пока пуст",meta:"нет размещенных слотов Gantt",className:"planning-table-empty-panel",cornerMarker:d("Демо-панель: пустое состояние План-таблицы"),body:g({body:ot({iconName:"gantt",title:"Нет данных для табличного представления",text:"Передай заказ-наряд в планирование, чтобы увидеть те же операции в виде таблицы."})})})})}function k(n,t,e){return ct({title:n,meta:e,badge:t,badgeTone:"neutral",tag:"article",className:"planning-table-summary-item"})}function yt(n,t={}){const e=Number.isFinite(t.dayLimit)?Math.max(1,Number(t.dayLimit)):null,a=Number.isFinite(t.groupLimit)?Math.max(1,Number(t.groupLimit)):null,r=e?n.days.slice(0,e):n.days,s=a?n.resourceGroups.slice(0,a):n.resourceGroups,o=r[r.length-1],i=Math.max(0,n.resourceGroups.length-s.length);return c({title:t.title||"Матрица ресурсов по дням",meta:[t.meta||"",`${r[0]?.label||""}-${o?.label||""}`].filter(Boolean).join(" · "),className:et("planning-table-matrix-panel",t.className||""),cornerMarker:d("Read-only матрица: отображает слоты без изменения плана"),body:g({body:h({className:"planning-table-matrix-wrap",body:`
            <table class="planning-table-matrix">
              <thead>
                <tr>
                  <th>Ресурс / участок</th>
                  ${r.map(y=>`<th class="${y.isWeekend?"is-weekend":""}"><strong>${l(y.label)}</strong><span>${l(y.weekday)}</span></th>`).join("")}
                </tr>
              </thead>
              <tbody>
                ${s.map(y=>$t(y,r)).join("")}
              </tbody>
            </table>
            ${i?`<p class="planning-table-matrix-note">Показаны первые ${s.length.toLocaleString("ru-RU")} участков из ${n.resourceGroups.length.toLocaleString("ru-RU")}.</p>`:""}
          `})})})}function mt(n){const t=I(),e=t.rows.filter(s=>shiftMasterProfileOwnsWorkCenter(n.activeProfile,s.workCenterId)),a=$(n.window?.start||w(C.windowStart)),r=t.days.filter(s=>s.date>=a).slice(0,7);return bt(t,e,{days:r.length?r:t.days.slice(0,7)})}function $t(n,t){return`
      <tr>
        <th>
          <strong>${l(n.label)}</strong>
          <span>${n.rows.length.toLocaleString("ru-RU")} сл. · ${l(b(n.totalWorkingMs))}</span>
        </th>
        ${t.map(e=>ft(n,e)).join("")}
      </tr>
    `}function ft(n,t){const e=n.rows.filter(a=>M(a,t));return`
      <td class="${t.isWeekend?"is-weekend":""} ${e.length?"has-slots":""}">
        ${e.slice(0,3).map(a=>`
          <span class="planning-table-mini-slot is-${R(lt(a.status.tone))}" title="${R(`${a.operationName} · ${u(a.plannedStart)}-${u(a.plannedEnd)}`)}">
            <strong>${l(a.operationName)}</strong>
            <small>${l(a.quantity.toLocaleString("ru-RU"))} ${l(a.unit)}</small>
          </span>
        `).join("")}
        ${e.length>3?`<em>+${e.length-3}</em>`:""}
      </td>
    `}function Mt(n){const t=new Map;return(n.rows||[]).forEach(e=>{t.set(e.status.value,{status:e.status,count:(t.get(e.status.value)?.count||0)+1})}),[...t.values()].sort((e,a)=>a.count-e.count||e.status.label.localeCompare(a.status.label,"ru"))[0]||null}function kt(n){const t=n.rows||[];return t.length?t.reduce((e,a)=>({start:!e.start||a.plannedStart<e.start?a.plannedStart:e.start,end:!e.end||a.plannedEnd>e.end?a.plannedEnd:e.end}),{start:null,end:null}):{start:null,end:null}}function T(n){const t=new Map;(n.rows||[]).forEach(r=>{const s=r.unit||"шт.";t.set(s,(t.get(s)||0)+Number(r.quantity||0))});const e=[...t.entries()].filter(([,r])=>r>0);if(!e.length)return"—";if(e.length===1){const[r,s]=e[0];return`${s.toLocaleString("ru-RU")} ${r}`}const a=e.slice(0,2).map(([r,s])=>`${s.toLocaleString("ru-RU")} ${r}`);return`${a.join(" · ")}${e.length>a.length?` · +${e.length-a.length}`:""}`}function j(n){return n.route?.id||n.slot?.routeId||n.routeLabel||n.routeName||"unknown-route"}function St(n=[]){return n.length?n.reduce((t,e)=>({start:!t.start||e.plannedStart<t.start?e.plannedStart:t.start,end:!t.end||e.plannedEnd>t.end?e.plannedEnd:t.end}),{start:null,end:null}):{start:null,end:null}}function q(n=[]){const t=new Map;return n.forEach(e=>{t.set(e.status.value,{status:e.status,count:(t.get(e.status.value)?.count||0)+1})}),[...t.values()].sort((e,a)=>a.count-e.count||e.status.label.localeCompare(a.status.label,"ru"))[0]?.status||null}function Lt(n,t){return M(n,t)?Math.max(0,Math.min(n.plannedEnd.getTime(),t.end.getTime())-Math.max(n.plannedStart.getTime(),t.date.getTime())):0}function Rt(n,t){const e=Lt(n,t);if(!e)return 0;const a=Math.max(1,n.calendarMs||n.plannedEnd.getTime()-n.plannedStart.getTime()||e);return Math.round((n.workingMs||0)*Math.min(1,e/a))}function Q(n=[],t=[]){return t.map(e=>{const a=n.filter(o=>M(o,e)),r=new Set(a.map(o=>o.workCenterId||o.workCenterLabel).filter(Boolean)),s={rows:a};return{day:e,rows:a,slotCount:a.length,resourceCount:r.size,workingMs:a.reduce((o,i)=>o+Rt(i,e),0),quantityLabel:T(s),status:q(a)}})}function wt(n=[],t=[]){const e=Q(n,t),a=Math.max(1,...e.map(r=>r.workingMs||0));return e.map(r=>{const s=Math.max(0,Math.min(1,(r.workingMs||0)/a)),o=s>=.78?"risk":s>=.48?"warning":r.slotCount?"ready":"neutral";return{...r,ratio:s,tone:o}})}function Ct(n=[],t=[]){const e=[];return n.forEach(a=>{a.warningCount>0&&e.push({row:a,tone:"warning",label:`${a.warningCount} сигн.`,reason:"Есть предупреждения Gantt"}),(!a.workCenterId||a.workCenterLabel==="Участок не задан")&&e.push({row:a,tone:"blocked",label:"Нет участка",reason:"Слот не привязан к производственному участку"}),(!a.resourceLabel||a.resourceLabel==="Ресурс не назначен")&&e.push({row:a,tone:"manual",label:"Нет ресурса",reason:"Не выбран конкретный ресурс выполнения"}),a.calendarMs>a.workingMs*3&&a.workingMs>0&&e.push({row:a,tone:"risk",label:"Длинное окно",reason:"Календарное окно заметно больше рабочего времени"}),t.some(r=>r.isWeekend&&M(a,r))&&e.push({row:a,tone:"warning",label:"Выходные",reason:"Операция пересекает выходной день в текущем окне"})}),e.sort((a,r)=>a.row.plannedStart-r.row.plannedStart||a.label.localeCompare(r.label,"ru")).slice(0,12)}function Tt(n=[]){const t=$(w(C.windowStart));return n.filter(e=>e.plannedEnd>=t).sort((e,a)=>e.plannedStart-a.plannedStart||e.operationName.localeCompare(a.operationName,"ru")).slice(0,12)}function Nt(n=[]){const t=new Map;return n.forEach(e=>{const a=j(e);t.has(a)||t.set(a,{id:a,label:e.routeLabel,routeName:e.routeName,rows:[]}),t.get(a).rows.push(e)}),[...t.values()].map(e=>{const a=St(e.rows);return{...e,status:q(e.rows),resourceCount:new Set(e.rows.map(r=>r.workCenterId||r.workCenterLabel).filter(Boolean)).size,totalWorkingMs:e.rows.reduce((r,s)=>r+s.workingMs,0),quantityLabel:T(e),start:a.start,end:a.end}}).sort((e,a)=>(e.start||0)-(a.start||0))}function B(n=[]){const t=new Map;return n.forEach(e=>{const a=j(e);t.has(a)||t.set(a,[]),t.get(a).push(e)}),[...t.values()].map(e=>e.sort((a,r)=>a.plannedStart-r.plannedStart))}function Pt(n=[]){return B(n).flatMap(t=>t.slice(1).flatMap((e,a)=>{const r=t[a],s=e.plannedStart.getTime()-r.plannedEnd.getTime();return s<=0?[]:[{id:`${r.id}-${e.id}`,routeLabel:e.routeLabel,previous:r,row:e,gapMs:s}]})).sort((t,e)=>e.gapMs-t.gapMs).slice(0,12)}function vt(n=[]){return n.slice(0,14).map(t=>{const a=G(void 0),r=G(void 0),s=a-t.quantity;return{row:t,fact:null,actualQuantity:a,defectQuantity:r,deltaQuantity:s,status:{label:"Факт не внесен",tone:"neutral"}}})}function Ut(n=[]){return B(n).flatMap(t=>t.slice(1).map((e,a)=>{const r=t[a],s=e.plannedStart.getTime()-r.plannedEnd.getTime();return{id:`${r.id}->${e.id}`,routeLabel:e.routeLabel,previous:r,row:e,gapMs:s,relation:s>0?"после буфера":s<0?"пересечение":"сразу после",tone:s<0?"risk":s>m?"warning":"ready"}})).slice(0,18)}function Gt(n){return c({title:"Сводка загрузки ресурсов",meta:`${n.resourceGroups.length.toLocaleString("ru-RU")} групп · read-only`,className:"planning-table-summary-panel",cornerMarker:d("Read-only блок: сводка загрузки ресурсов"),body:g({body:`
          <div class="planning-table-summary-grid">
            ${n.resourceGroups.map(Wt).join("")}
          </div>
        `})})}function Wt(n){const t=Mt(n),e=kt(n),a=(n.rows||[]).reduce((o,i)=>o+Number(i.warningCount||0),0),r=T(n),s=e.start&&e.end?`${u(e.start)}-${u(e.end)}`:"—";return`
      <article class="planning-table-summary-card">
        <header>
          <div>
            <strong>${l(n.label)}</strong>
            <span>${l(n.resourceLabel||"Ресурс не назначен")}</span>
          </div>
          ${t?p(t.status.label,t.status.tone):""}
        </header>
        <dl>
          <div>
            <dt>Слоты</dt>
            <dd>${n.rows.length.toLocaleString("ru-RU")}</dd>
          </div>
          <div>
            <dt>Работа</dt>
            <dd>${l(b(n.totalWorkingMs))}</dd>
          </div>
          <div>
            <dt>Объем</dt>
            <dd>${l(r)}</dd>
          </div>
        </dl>
        <footer>
          <span>${l(s)}</span>
          ${a?p(`${a} сигн.`,"warning"):"<span>без сигналов</span>"}
        </footer>
      </article>
    `}function S(n,t,e="info"){return`
      <div class="planning-table-inline-empty">
        ${nt(e)}
        <strong>${l(n)}</strong>
        <span>${l(t)}</span>
      </div>
    `}function Dt(n){return c({title:"Проблемные места плана",meta:n.issueRows.length?`${n.issueRows.length.toLocaleString("ru-RU")} сигналов`:"критичных сигналов нет",className:"planning-table-compact-panel planning-table-issues-panel",cornerMarker:d("Read-only блок: сигналы плана без изменения данных"),body:g({body:n.issueRows.length?h({className:"planning-table-compact-wrap",body:`
            <table class="planning-table-compact-table">
              <thead>
                <tr>
                  <th>Сигнал</th>
                  <th>Операция</th>
                  <th>Ресурс</th>
                  <th>Причина</th>
                  <th>Старт</th>
                </tr>
              </thead>
              <tbody>
                ${n.issueRows.map(t=>`
                  <tr>
                    <td>${p(t.label,t.tone)}</td>
                    <td><strong>${l(t.row.operationName)}</strong><span>${l(t.row.routeLabel)}</span></td>
                    <td>${l(t.row.workCenterLabel)}</td>
                    <td>${l(t.reason)}</td>
                    <td>${l(u(t.row.plannedStart))}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          `}):S("План без явных проблем","В текущем окне нет предупреждений, пустых ресурсов и пересечений с выходными.","check")})})}function It(n){return c({title:"Загрузка по дням",meta:`${n.dailyLoads.length.toLocaleString("ru-RU")} дней · относительная оценка`,className:"planning-table-compact-panel planning-table-daily-panel",cornerMarker:d("Read-only блок: дневная нагрузка"),body:g({body:`
          <div class="planning-table-day-grid">
            ${n.dailyLoads.map(t=>`
              <article class="planning-table-day-card ${t.day.isWeekend?"is-weekend":""}">
                <header>
                  <strong>${l(t.day.label)}</strong>
                  <span>${l(t.day.weekday)}</span>
                </header>
                <dl>
                  <div><dt>Слоты</dt><dd>${t.slotCount.toLocaleString("ru-RU")}</dd></div>
                  <div><dt>Работа</dt><dd>${l(b(t.workingMs))}</dd></div>
                  <div><dt>Участки</dt><dd>${t.resourceCount.toLocaleString("ru-RU")}</dd></div>
                </dl>
                <footer>${t.status?p(t.status.label,t.status.tone):"<span>нет слотов</span>"}</footer>
              </article>
            `).join("")}
          </div>
        `})})}function Et(n){return c({title:"Очередь ближайших операций",meta:`${n.queueRows.length.toLocaleString("ru-RU")} строк из текущего окна`,className:"planning-table-compact-panel planning-table-queue-panel",cornerMarker:d("Read-only блок: очередь ближайших операций"),body:g({body:h({className:"planning-table-compact-wrap",body:`
            <table class="planning-table-compact-table">
              <thead>
                <tr>
                  <th>Старт</th>
                  <th>Операция</th>
                  <th>Объект</th>
                  <th>Ресурс</th>
                  <th>Кол-во</th>
                </tr>
              </thead>
              <tbody>
                ${n.queueRows.map(t=>`
                  <tr>
                    <td>${l(u(t.plannedStart))}</td>
                    <td><strong>${l(t.operationName)}</strong><span>${l(t.routeLabel)}</span></td>
                    <td>${l(t.taskLabel)}</td>
                    <td>${l(t.workCenterLabel)}</td>
                    <td>${t.quantity.toLocaleString("ru-RU")} ${l(t.unit)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          `})})})}function xt(n){return c({title:"Разрез по заказ-нарядам",meta:`${n.orderGroups.length.toLocaleString("ru-RU")} документов`,className:"planning-table-compact-panel planning-table-orders-panel",cornerMarker:d("Read-only блок: разрез по заказ-нарядам"),body:g({body:h({className:"planning-table-compact-wrap",body:`
            <table class="planning-table-compact-table">
              <thead>
                <tr>
                  <th>Документ</th>
                  <th>Слоты</th>
                  <th>Работа</th>
                  <th>Окно</th>
                  <th>Рес.</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                ${n.orderGroups.map(t=>`
                  <tr>
                    <td><strong>${l(t.label)}</strong><span>${l(t.routeName)}</span></td>
                    <td>${t.rows.length.toLocaleString("ru-RU")}</td>
                    <td>${l(b(t.totalWorkingMs))}</td>
                    <td>${t.start&&t.end?`${l(u(t.start))}-${l(u(t.end))}`:"—"}</td>
                    <td>${t.resourceCount.toLocaleString("ru-RU")}</td>
                    <td>${t.status?p(t.status.label,t.status.tone):"—"}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          `})})})}function jt(n){return c({title:"Буфер / ожидание между операциями",meta:n.bufferRows.length?`${n.bufferRows.length.toLocaleString("ru-RU")} разрывов`:"разрывов нет",className:"planning-table-compact-panel planning-table-buffers-panel",cornerMarker:d("Read-only блок: буферы между операциями"),body:g({body:n.bufferRows.length?h({className:"planning-table-compact-wrap",body:`
            <table class="planning-table-compact-table">
              <thead>
                <tr>
                  <th>После</th>
                  <th>Перед</th>
                  <th>Буфер</th>
                  <th>Документ</th>
                </tr>
              </thead>
              <tbody>
                ${n.bufferRows.map(t=>`
                  <tr>
                    <td><strong>${l(t.previous.operationName)}</strong><span>${l(u(t.previous.plannedEnd))}</span></td>
                    <td><strong>${l(t.row.operationName)}</strong><span>${l(u(t.row.plannedStart))}</span></td>
                    <td>${p(b(t.gapMs),t.gapMs>m?"warning":"neutral")}</td>
                    <td>${l(t.routeLabel)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          `}):S("Операции идут без положительных буферов","В текущем наборе нет пауз между соседними операциями одного документа.","check")})})}function qt(n){return c({title:"План-факт заготовка",meta:"демо · факт из диспетчерской",className:"planning-table-compact-panel planning-table-planfact-panel",cornerMarker:d("Демо-блок: план-факт заготовка без влияния на систему"),body:g({body:h({className:"planning-table-compact-wrap",body:`
            <table class="planning-table-compact-table">
              <thead>
                <tr>
                  <th>Операция</th>
                  <th>План</th>
                  <th>Факт</th>
                  <th>Брак</th>
                  <th>Откл.</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                ${n.planFactRows.map(t=>`
                  <tr>
                    <td><strong>${l(t.row.operationName)}</strong><span>${l(t.row.taskLabel)}</span></td>
                    <td>${t.row.quantity.toLocaleString("ru-RU")} ${l(t.row.unit)}</td>
                    <td>${t.actualQuantity.toLocaleString("ru-RU")}</td>
                    <td>${t.defectQuantity.toLocaleString("ru-RU")}</td>
                    <td>${t.deltaQuantity===0?"—":t.deltaQuantity.toLocaleString("ru-RU")}</td>
                    <td>${p(t.status.label,t.status.tone)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          `})})})}function Qt(n){return c({title:"Календарная плотность",meta:"тепловая карта текущего окна",className:"planning-table-compact-panel planning-table-density-panel",cornerMarker:d("Read-only блок: календарная плотность"),body:g({body:`
          <div class="planning-table-density-grid">
            ${n.densityDays.map(t=>`
              <article class="planning-table-density-day is-${R(t.tone)}" style="--planning-table-density:${Math.round(t.ratio*100)}%">
                <header>
                  <strong>${l(t.day.label)}</strong>
                  <span>${l(t.day.weekday)}</span>
                </header>
                <div><span></span></div>
                <footer>
                  <strong>${l(b(t.workingMs))}</strong>
                  <span>${t.slotCount.toLocaleString("ru-RU")} сл.</span>
                </footer>
              </article>
            `).join("")}
          </div>
        `})})}function Bt(n){return c({title:"Зависимости операций",meta:`${n.dependencyRows.length.toLocaleString("ru-RU")} связей · read-only`,className:"planning-table-compact-panel planning-table-dependencies-panel",cornerMarker:d("Read-only блок: зависимости операций"),body:g({body:n.dependencyRows.length?h({className:"planning-table-compact-wrap",body:`
            <table class="planning-table-compact-table">
              <thead>
                <tr>
                  <th>От</th>
                  <th>К</th>
                  <th>Связь</th>
                  <th>Буфер</th>
                </tr>
              </thead>
              <tbody>
                ${n.dependencyRows.map(t=>`
                  <tr>
                    <td><strong>${l(t.previous.operationName)}</strong><span>${l(t.previous.taskLabel)}</span></td>
                    <td><strong>${l(t.row.operationName)}</strong><span>${l(t.row.taskLabel)}</span></td>
                    <td>${p(t.relation,t.tone)}</td>
                    <td>${t.gapMs===0?"—":`${t.gapMs<0?"-":""}${l(b(Math.abs(t.gapMs)))}`}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          `}):S("Связей не найдено","Для зависимостей нужно минимум две операции внутри одного документа.","link")})})}function Ft(n){return c({title:"Реестр слотов Gantt",meta:`${n.rows.length.toLocaleString("ru-RU")} строк · read-only`,className:"planning-table-register-panel",cornerMarker:d("Read-only блок: реестр слотов Gantt"),body:g({body:h({className:"planning-table-register-wrap",body:`
            <table class="directory-table planning-table-register">
              <thead>
                <tr>
                  <th>Статус</th>
                  <th>Документ</th>
                  <th>Объект</th>
                  <th>Операция</th>
                  <th>Ресурс</th>
                  <th>Начало</th>
                  <th>Конец</th>
                  <th>Длит.</th>
                  <th>Кол-во</th>
                  <th>Сигн.</th>
                </tr>
              </thead>
              <tbody>
                ${n.rows.map(Ot).join("")}
              </tbody>
            </table>
          `})})})}function Ot(n){return`
      <tr>
        <td>${p(n.status.label,n.status.tone)}</td>
        <td>
          <strong>${l(n.routeLabel)}</strong>
          <span>${l(n.routeName)}</span>
        </td>
        <td>${l(n.taskLabel)}</td>
        <td>${l(n.operationName)}</td>
        <td>
          <strong>${l(n.workCenterLabel)}</strong>
          <span>${l(n.resourceLabel)}</span>
        </td>
        <td>${l(u(n.plannedStart))}</td>
        <td>${l(u(n.plannedEnd))}</td>
        <td>${l(b(n.workingMs))}</td>
        <td>${n.quantity.toLocaleString("ru-RU")} ${l(n.unit)}</td>
        <td>${n.warningCount?p(`${n.warningCount} сигн.`,"warning"):"—"}</td>
      </tr>
    `}return{getPlanningTableSlotRows:D,getShiftMasterPlanningTableMatrixModel:mt,renderPlanningTableInlineEmpty:S,renderPlanningTablePage:ht}}export{Jt as createPlanningTableModule};
