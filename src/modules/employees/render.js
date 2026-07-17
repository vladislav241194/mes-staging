function ze(M={}){const{PRODUCTION_RESOURCE_TYPE_LABELS:j,UNIT_TYPE_LABELS:H,escapeAttribute:y,escapeHtml:u,getCalendarWorkCenterId:ee,getMesCustomIconNameForRuntimeId:z,getProductionResourceWorkCenterId:S,getProductionResources:re,getProductionStructureEmployees:te,getProductionStructureMatrixRuntimeOverrides:Y,getProductionStructureWorkCenters:ne,getRuntimePlanningState:oe,getShiftMasterEmployeeRows:ae,getShiftMasterProfiles:R,icon:P,isPlanningWorkCenter:ie,mapLegacyWorkCenterId:O,normalizeLookupText:h,renderUiModulePage:se,renderUiPanel:le,renderUiPanelBody:ce,shiftMasterProfileOwnsWorkCenter:pe}=M,me=M.getApp||(()=>null),ue=M.getPlanningState||(()=>({})),F={querySelector:(...e)=>me()?.querySelector?.(...e)||null};let E=0;const X=new Proxy({},{get(e,r){return ue()?.[r]}});function de(){const e=ye();return se({ariaLabel:"Структура",className:"employees-page is-diagram-only",workspaceClassName:"employees-workspace",contentClassName:"employees-content",visualContract:"headerless-module",content:le({title:"Диаграмма подчиненности",meta:"начальник производства → отделы → вложенные уровни → ресурсы",className:"employees-org-panel",body:ce({body:`
            <div class="employees-org-chart">
              ${$e(e)}
              <svg class="employee-hierarchy-connectors" data-employee-hierarchy-connectors aria-hidden="true" focusable="false"></svg>
              ${we(e)}
            </div>
            <div class="employees-org-annotation" aria-label="Аннотация к диаграмме подчиненности">
              <strong>Аннотация</strong>
              <span><i class="is-production"></i> отделы, участки и вложенные подразделения</span>
              <span><i class="is-person"></i> мастера и линейные сотрудники</span>
              <span><i class="is-capacity"></i> доступность по табелю</span>
              <span><i class="is-resource"></i> оборудование и посты</span>
              <em>Стрелки показывают подчиненность сверху вниз; узлы одного уровня расположены на общей горизонтали внутри своего поддерева.</em>
            </div>
          `})})})}function ye(){const e=[...X.workCenters||[]].filter(i=>i?.id).sort(he),r=new Map(e.map(i=>[i.id,i])),t=e.reduce((i,l)=>{const g=l.parentWorkCenterId&&r.has(l.parentWorkCenterId)?l.parentWorkCenterId:"";return i.has(g)||i.set(g,[]),i.get(g).push(l),i},new Map),n=N(ae()),a=N([...R().map(i=>({...i,personKind:"master"})),...n.map(i=>({...i,personKind:"employee"}))]).map(i=>({...i,homeWorkCenterId:fe(i.workCenterIds||[],r)})).filter(i=>i.homeWorkCenterId),o=re({includeInactive:!0}),s=new Set(e.map(i=>String(i.owner||"").trim()).filter(Boolean)),p=e.map(i=>({center:i,typeLabel:H[i.unitType]||"Отдел",owner:String(i.owner||"").trim(),masters:A(i.id),employees:_(i,n),resources:o.filter(l=>S(l)===i.id)}));return{childrenByParent:t,employeeRows:n,personRows:a,matrixRows:p,orgWorkCenters:e,resourceRows:o,topWorkCenters:t.get("")||[],workCenterCount:e.length,ownerCount:s.size,masterCount:R().length,employeeCount:a.length,resourceCount:o.length}}function he(e,r){const t=e.parentWorkCenterId?1:0,n=r.parentWorkCenterId?1:0;return t-n||String(e.parentWorkCenterId||"").localeCompare(String(r.parentWorkCenterId||""),"ru")||String(e.name||"").localeCompare(String(r.name||""),"ru")}function qe(e=""){const r=h(e);return r?(X.workCenters||[]).filter(t=>h(t.name)===r||h(t.code)===r||h(t.id)===r).map(t=>t.id):[]}function ge(e=[]){const r=e.map(o=>O(o)).filter(Boolean),t=oe({workCenters:ne(Y())})?.workCenters||[],n=r.map(o=>t.find(s=>s.id===o)).find(Boolean);return n&&((n.parentWorkCenterId?t.find(o=>o.id===n.parentWorkCenterId):null)?.name||n.name)||""}function N(e=[]){const r=new Set;return e.filter(t=>{const n=String(t.name||"").trim();if(!n)return!1;const a=`${h(n)}::${h(t.role||"")}`;return r.has(a)?!1:(r.add(a),!0)})}function A(e){return R().filter(r=>pe(r,e))}function _(e,r=[]){const t=new Set([e.id]);return e.parentWorkCenterId&&t.add(e.parentWorkCenterId),r.filter(n=>{const a=new Set(n.workCenterIds||[]);if([...t].some(s=>a.has(s)))return!0;const o=h(n.department||"");return o&&(o===h(e.name)||o===h(e.code))})}function fe(e=[],r=new Map){const t=[...new Set(e.map(o=>O(ee(o)||o)).filter(o=>o&&r.has(o)))];if(!t.length)return"";if(t.length===1)return t[0];const n=t.map(o=>r.get(o)?.parentWorkCenterId||"").filter(o=>o&&r.has(o)),a=[...new Set(n)];return a.length===1?a[0]:t[0]}function $e(e){return`
      <article class="employee-root-card is-root" data-hierarchy-root>
        <strong>Начальник производства</strong>
      </article>
    `}function ke(){D()}function D(){E&&window.cancelAnimationFrame(E),E=window.requestAnimationFrame(()=>{E=0,be()})}function be(){const e=F.querySelector(".employees-org-chart"),r=F.querySelector("[data-employee-hierarchy-connectors]");if(!e||!r)return;const t=e.getBoundingClientRect(),n=new Map([...e.querySelectorAll(".employee-hierarchy-node[data-hierarchy-id]")].map(l=>[l.dataset.hierarchyId,l])),a=e.querySelector("[data-hierarchy-root]"),o=new Map;n.forEach(l=>{const g=l.dataset.parentId||"",k=g?n.get(g):a;if(!k)return;const d=g||"root";o.has(d)||o.set(d,{groupId:d,parent:k,children:[]}),o.get(d).children.push(l)});const s=Math.max(Math.ceil(e.scrollWidth),Math.ceil(t.width)),p=Math.max(Math.ceil(e.scrollHeight),Math.ceil(t.height));r.setAttribute("viewBox",`0 0 ${s} ${p}`),r.setAttribute("width",String(s)),r.setAttribute("height",String(p));const i=[...o.values()].flatMap(({groupId:l,parent:g,children:k})=>{const d=g.getBoundingClientRect(),W=d.left-t.left+d.width/2,C=d.bottom-t.top+3,b=k.map(c=>{const f=c.getBoundingClientRect();return{child:c,x:f.left-t.left+f.width/2,y:f.top-t.top-3,tone:c.classList.contains("is-resource")?"resource":c.classList.contains("is-capacity")?"capacity":c.classList.contains("is-person")?"person":"unit"}}).sort((c,f)=>c.x-f.x);if(!b.length)return[];const Te=Math.min(...b.map(c=>c.y)),Ue=Math.max(Te-C,1),L=C+Ue/2,v=[],$=y(l);if(l==="root")return b.map(c=>{const f=y(c.child.dataset.hierarchyId||""),w=C+Math.max((c.y-C)*.45,18);return`<path class="employee-hierarchy-connector is-root-drop is-${c.tone}" data-visual-qa-target="employee-connector" data-connector-kind="root-drop" data-connector-from="${$}" data-connector-to="${f}" aria-label="Связь оргструктуры ${$} → ${f}" d="M ${m(W)} ${m(C)} C ${m(W)} ${m(w)} ${m(c.x)} ${m(w)} ${m(c.x)} ${m(c.y)}" marker-end="url(#employeeHierarchyArrow)" />`});const J=b[0].x,V=b[b.length-1].x;return v.push(`<path class="employee-hierarchy-connector is-trunk" data-visual-qa-target="employee-connector" data-connector-kind="trunk" data-connector-from="${$}" aria-label="Связь оргструктуры от ${$}" d="M ${m(W)} ${m(C)} L ${m(W)} ${m(L)}" />`),Math.abs(V-J)>2&&v.push(`<path class="employee-hierarchy-connector is-bus" data-visual-qa-target="employee-connector" data-connector-kind="bus" data-connector-from="${$}" aria-label="Горизонтальная связь оргструктуры от ${$}" d="M ${m(J)} ${m(L)} L ${m(V)} ${m(L)}" />`),b.forEach(c=>{const f=c.tone==="resource"?"employeeHierarchyArrowResource":c.tone==="capacity"?"employeeHierarchyArrowCapacity":c.tone==="person"?"employeeHierarchyArrowPerson":"employeeHierarchyArrow",w=y(c.child.dataset.hierarchyId||"");v.push(`<path class="employee-hierarchy-connector is-drop is-${c.tone}" data-visual-qa-target="employee-connector" data-connector-kind="drop" data-connector-from="${$}" data-connector-to="${w}" aria-label="Связь оргструктуры ${$} → ${w}" d="M ${m(c.x)} ${m(L)} L ${m(c.x)} ${m(c.y)}" marker-end="url(#${f})" />`)}),v}).join("");r.innerHTML=`${Ce()}${i}`}function Ce(){return`
      <defs>
        <marker id="employeeHierarchyArrow" markerWidth="5" markerHeight="5" refX="4.2" refY="2.5" orient="auto" markerUnits="strokeWidth">
          <path d="M 0.6 0.7 L 4.4 2.5 L 0.6 4.3 z" />
        </marker>
        <marker id="employeeHierarchyArrowResource" markerWidth="5" markerHeight="5" refX="4.2" refY="2.5" orient="auto" markerUnits="strokeWidth">
          <path d="M 0.6 0.7 L 4.4 2.5 L 0.6 4.3 z" />
        </marker>
        <marker id="employeeHierarchyArrowPerson" markerWidth="5" markerHeight="5" refX="4.2" refY="2.5" orient="auto" markerUnits="strokeWidth">
          <path d="M 0.6 0.7 L 4.4 2.5 L 0.6 4.3 z" />
        </marker>
        <marker id="employeeHierarchyArrowCapacity" markerWidth="5" markerHeight="5" refX="4.2" refY="2.5" orient="auto" markerUnits="strokeWidth">
          <path d="M 0.6 0.7 L 4.4 2.5 L 0.6 4.3 z" />
        </marker>
      </defs>
    `}function m(e){return Number(e||0).toFixed(1)}function we(e){const r=Se(e);return r.length?`
      <div class="employee-hierarchy-forest" aria-label="Поддеревья оргструктуры по верхним отделам">
        ${r.map(t=>`
          <article class="employee-hierarchy-branch ${y(t.sizeClass)}" data-hierarchy-branch="${y(t.id)}">
            <header class="employee-hierarchy-branch-head">
              <div>
                <span>Поддерево</span>
                <strong>${u(t.title)}</strong>
              </div>
              <small>${u(t.meta)}</small>
            </header>
            <div class="employee-hierarchy-map is-branch" aria-label="Иерархия: ${y(t.title)}">
              ${t.layers.map(n=>`
                <section class="employee-hierarchy-layer is-level-${Number(n.level)} is-${y(n.kind)}">
                  <div class="employee-hierarchy-layer-label">
                    <strong>${u(n.title)}</strong>
                    <small>${Number(n.nodes.length||0).toLocaleString("ru-RU")}</small>
                  </div>
                  <div class="employee-hierarchy-row" style="--employee-grid-columns:${Number(n.totalColumns||1)}">
                    ${n.nodes.map(a=>Pe(a)).join("")}
                  </div>
                </section>
              `).join("")}
            </div>
          </article>
        `).join("")}
      </div>
    `:""}function Se(e){return(e.topWorkCenters?.length?e.topWorkCenters:e.orgWorkCenters||[]).map(t=>Ee(t,e)).filter(Boolean)}function Ee(e,r){if(!e)return null;const t=x(e,null,0,r);B(t,1);const n=Math.max(Number(t.gridSpan||t.leafSpan||1),1),a=new Map;T(t,a);const o=[...a.entries()].sort(([i],[l])=>i-l).map(([i,l])=>({level:i,title:i===0?"Отдел":K(l),kind:Q(l),totalColumns:n,nodes:l})),s=Ie(t),p=[`${s.units.toLocaleString("ru-RU")} подраздел.`,`${s.people.toLocaleString("ru-RU")} чел.`,`${(s.resources+s.capacity).toLocaleString("ru-RU")} ресурсов`].join(" · ");return{id:t.id,title:t.label,meta:p,layers:o,totalColumns:n,sizeClass:n>=22?"is-wide":n>=12?"is-medium":"is-compact"}}function Ie(e){return[e,...(e.children||[]).flatMap(r=>G(r))].reduce((r,t)=>(t.kind==="unit"?r.units+=1:t.kind==="person"?r.people+=1:t.kind==="capacity"?r.capacity+=1:t.kind==="resource"&&(r.resources+=1),r),{units:0,people:0,capacity:0,resources:0})}function G(e){return[e,...(e.children||[]).flatMap(r=>G(r))]}function je(e){const r=e.topWorkCenters?.length?e.topWorkCenters:e.orgWorkCenters||[];if(!r.length)return[];const t=r.map(s=>x(s,null,0,e));let n=1;t.forEach(s=>{n=B(s,n)});const a=Math.max(n-1,1),o=new Map;return t.forEach(s=>T(s,o)),[...o.entries()].sort(([s],[p])=>s-p).map(([s,p])=>({level:s,title:s===0?"Отделы":K(p),kind:Q(p),totalColumns:a,nodes:p}))}function x(e,r,t,n){const a=We(e,r,t),o=n.childrenByParent.get(e.id)||[],s=(n.personRows||[]).filter(i=>i.homeWorkCenterId===e.id).map(i=>ve(i,a,t+1,i.personKind||"employee")),p=n.resourceRows.filter(i=>S(i)===e.id);return a.children=[...o.map(i=>x(i,a,t+1,n)),...s,...p.map(i=>Le(i,a,t+1))],a.leafSpan=a.children.length?a.children.reduce((i,l)=>i+Math.max(Number(l.leafSpan||1),1),0):1,a}function B(e,r){e.gridStart=r,e.gridSpan=Math.max(Number(e.leafSpan||1),1);let t=r;return(e.children||[]).forEach(n=>{t=B(n,t)}),r+e.gridSpan}function T(e,r){const t=Number(e.level||0);r.has(t)||r.set(t,[]),r.get(t).push(e),(e.children||[]).forEach(n=>T(n,r))}function K(e=[]){const r=e.filter(o=>o.kind==="unit").length,t=e.filter(o=>o.kind==="person").length,n=e.filter(o=>o.kind==="capacity").length,a=e.filter(o=>o.kind==="resource").length;return r&&(t||n||a)?"Участки / люди":r?"Вложенные участки":t&&(n||a)?"Люди / доступность":t?"Люди":n&&a?"Доступность / ресурсы":n?"Доступность":"Ресурсы"}function Q(e=[]){const r=e.filter(o=>o.kind==="unit").length,t=e.filter(o=>o.kind==="person").length,n=e.filter(o=>o.kind==="capacity").length,a=e.filter(o=>o.kind==="resource").length;return[r,t,n,a].filter(Boolean).length>1?"mixed":r?"units":t?"people":n?"capacity":"resources"}function We(e,r=null,t=0){const n=H[e.unitType]||"Отдел",a=U(e.name||e.code||"Отдел"),o=r?.label||"",s=Me(e);return{id:`center-${e.id}`,parentId:r?.id||"",kind:"unit",level:t,label:a,leadLabel:s,parentLabel:o,title:`${e.name||"Отдел без названия"} · ${n}${o?` · родитель: ${o}`:""}`,subtitle:t===0?n:`от ${o}`,tone:Z(e),source:e}}function Le(e,r,t=0){const n=j[e.type]||"Ресурс",a=e.type==="staff",o=a?"Доступность":U(e.name||e.code||"Ресурс"),s=r?.label||"",p=[e.name||"",e.capacity||""].filter(Boolean).join(" · ");return{id:`resource-${e.id}`,parentId:r?.id||"",kind:a?"capacity":"resource",level:t,label:o,leadLabel:a?p:"",parentLabel:s,title:`${e.name||"Ресурс без названия"} · ${n}${s?` · родитель: ${s}`:""}`,subtitle:s?`от ${s}`:n,tone:a?"capacity":"resource",source:e,children:[],leafSpan:1}}function ve(e,r,t=0,n="employee"){const a=String(e.role||(n==="master"?"Мастер":"Сотрудник")).trim(),o=U(e.name||"Сотрудник без имени"),s=r?.label||"",p=String(e.id||`${n}-${o}`).replace(/[^a-zA-Z0-9_-]+/g,"-");return{id:`person-${n}-${p}-${r?.id||"root"}`,parentId:r?.id||"",kind:"person",level:t,label:o,leadLabel:a,parentLabel:s,title:`${o} · ${a}${s?` · родитель: ${s}`:""}`,subtitle:s?`от ${s}`:a,tone:n==="master"?"master":"employee",source:e,children:[],leafSpan:1}}function Me(e={}){const r=String(e.owner||"").trim();if(r)return`${He(e,r)}: ${r}`;const t=A(e.id||"");return t.length?t.map(a=>{const o=String(a.name||"").trim();return o?`${String(a.role||"Мастер").trim()}: ${o}`:""}).filter(Boolean).join(", "):""}function He(e={},r=""){const t=Re(r);if(t&&h(t)!==h("Сотрудник"))return t;const n=String(e.name||"").trim();return e.unitType==="warehouse"||/склад/i.test(n)?"Заведующий складом":/участок/i.test(n)?"Начальник участка":/отдел/i.test(n)?"Начальник отдела":"Ответственный"}function Re(e=""){const r=h(e);if(!r)return"";const t=te(Y()).find(n=>h(n.name)===r);return String(t?.role||"").trim()}function U(e){return String(e||"").replace(/SMT участок\s*(\d+)/gi,"Участок поверхностного монтажа $1").replace(/SMT линия\s*(\d+)/gi,"Линия поверхностного монтажа $1").replace(/АОИ-установка/g,"Установка автоматической оптической инспекции").replace(/Ручная малая ванна УЗ/g,"Ручная малая ванна ультразвуковой отмывки").replace(/Большая ванна УЗ/g,"Большая ванна ультразвуковой отмывки").replace(/Комплекс УЗ/g,"Комплекс ультразвуковой отмывки").replace(/\bSMT\b/gi,"Поверхностный монтаж").replace(/\bTHT\b/gi,"Ручной монтаж").replace(/\bAOI\b/gi,"Оптический контроль").replace(/\bWH\b/gi,"Склад").replace(/\bQC\b/gi,"Контроль").replace(/\bBBA\b/gi,"Сборка").replace(/\bPRG\b/gi,"Программная подготовка").replace(/\bLAB\b/gi,"Маркировка").replace(/\bPE\b/gi,"Подготовка").replace(/\bUW\b/gi,"Отмывка").replace(/\bCC\b/gi,"Влагозащита").replace(/АОИ/g,"Автоматическая оптическая инспекция").replace(/УЗ/g,"Ультразвуковой").replace(/\s+/g," ").trim()}function Pe(e){return`
      <article class="employee-hierarchy-node is-${y(e.kind)} is-${y(e.tone)}" style="grid-column:${Number(e.gridStart||1)} / span ${Number(e.gridSpan||1)}" data-hierarchy-id="${y(e.id)}" data-parent-id="${y(e.parentId||"")}" title="${y(e.title)}">
        <strong>${u(e.label)}</strong>
        ${e.leadLabel?`<small>${u(e.leadLabel)}</small>`:""}
      </article>
    `}function Ne(e,r,t=0,n={}){const a=r.childrenByParent.get(e.id)||[],o=n.includeChildren!==!1,s=r.resourceRows.filter(d=>S(d)===e.id),p=A(e.id),i=_(e,r.employeeRows),l=H[e.unitType]||"Отдел",g=Z(e),k=String(e.owner||"").trim();return`
      <article class="employee-org-unit is-${y(g)}" style="--employee-level:${Number(t||0)}">
        <header class="employee-org-unit-head">
          <span class="employee-node-icon">${P(Ae(e))}</span>
          <div>
            <strong>${u(e.name||"Отдел без названия")}</strong>
            <small>${u(l)} · ${u(e.code||"код не задан")} · ${ie(e)?"участвует в планировании":"не плановый ресурс"}</small>
          </div>
          <em>${Number(s.length||0).toLocaleString("ru-RU")} рес.</em>
        </header>
  
        <div class="employee-org-unit-flow">
          <section class="employee-org-stage is-owner">
            <span class="employee-stage-label">Руководитель</span>
            <div class="employee-org-stage-items">
              ${k?q({name:k,role:"Руководитель отдела",source:"owner отдела"},"owner"):I("Руководитель не назначен","Поле owner в справочнике отдела пустое.")}
            </div>
          </section>
  
          <section class="employee-org-stage is-master">
            <span class="employee-stage-label">Мастера</span>
            <div class="employee-org-stage-items">
              ${p.length?p.map(d=>q(d,"master")).join(""):I("Мастера не назначены","Для участка нет профиля мастерской.")}
            </div>
          </section>
  
          <section class="employee-org-stage is-employee">
            <span class="employee-stage-label">Исполнители</span>
            <div class="employee-org-stage-items">
              ${i.length?i.map(d=>q(d,"employee")).join(""):I("Исполнители не назначены","В текущих данных нет сотрудников для этого участка.")}
            </div>
          </section>
  
          <section class="employee-org-stage is-resource">
            <span class="employee-stage-label">Ресурсы</span>
            <div class="employee-org-stage-items">
              ${s.length?s.map(d=>xe(d)).join(""):I("Ресурсы не заведены","В справочнике ресурсов нет строки для этого участка.")}
            </div>
          </section>
        </div>
  
        ${o&&a.length?`
          <div class="employee-org-children">
            ${a.map(d=>Ne(d,r,t+1,n)).join("")}
          </div>
        `:""}
      </article>
    `}function Z(e={}){return e.parentWorkCenterId?"section":"production"}function Ae(e={}){const r=z(e.id);return r||(e.unitType==="warehouse"?"warehouse":e.unitType==="quality"?"monitor":e.unitType==="administrative"?"settings":e.parentWorkCenterId?"operation":"map")}function q(e={},r="employee"){const t=r==="owner"?"Руководитель":r==="master"?"Мастер":"Исполнитель";return`
      <article class="employee-person-card is-${y(r)}">
        <span class="employee-avatar">${u(Be(e.name))}</span>
        <div>
          <strong>${u(e.name||"Сотрудник без имени")}</strong>
          <small>${u(e.role||t)}${e.source?` · ${u(e.source)}`:""}</small>
        </div>
        <em>${u(t)}</em>
      </article>
    `}function xe(e={}){const r=j[e.type]||e.type||"Ресурс",t=z(S(e));return`
      <article class="employee-resource-card is-${y(e.type||"resource")}">
        <span class="employee-node-icon">${P(t||(e.type==="staff"?"worker":"settings"))}</span>
        <div>
          <strong>${u(e.name||"Ресурс без названия")}</strong>
          <small>${u(r)} · ${u(e.capacity||e.inventory||"параметр не задан")}</small>
        </div>
        <em>${u(e.status||"статус")}</em>
      </article>
    `}function I(e,r){return`
      <article class="employee-empty-card">
        ${P("info")}
        <span>
          <strong>${u(e)}</strong>
          <small>${u(r)}</small>
        </span>
      </article>
    `}function Be(e=""){const r=String(e||"").trim().split(/\s+/).filter(Boolean);return r.length?r.slice(0,2).map(t=>t[0]).join("").toUpperCase():"—"}return{bindEmployeeHierarchyEvents:ke,dedupeEmployeeOrgRows:N,getEmployeeDepartmentLabelForWorkCenters:ge,renderEmployeesPage:de,scheduleEmployeeHierarchyConnectorRender:D}}export{ze as createEmployeesModule};
