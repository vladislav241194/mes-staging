function Ee(B={}){const{SUPPLY_CONTROL_STATUS_OPTIONS:R,SUPPLY_CONTROL_STORAGE_KEY:F,DAY_MS:q,SUPPLY_DAY_COUNT:H,SUPPLY_DAY_WIDTH:J,addMs:x,buildTimeScale:Dt,escapeAttribute:i,escapeHtml:o,formatDate:$,formatReportNumber:y=(t=0)=>Number(t||0).toLocaleString("ru-RU"),formatShortDate:w=t=>$?.(t)||"",fromDateInput:A,getActiveRoute:ve,getBomList:ke,getBomImportRowNomenclatureItem:Qt=()=>null,getBomImportRows:Rt=()=>[],getBomNomenclatureItem:De,getBomResultNomenclatureItem:Mt=()=>null,getPlanningRouteTransferSummary:V=()=>null,getPlanningRouteQuantity:X=()=>0,getProjectDisplayName:Z=()=>"",getRouteBomList:tt=()=>null,getRouteModuleSelectionName:et=()=>"",getRouteProductionContext:L=()=>null,getRoutesForModule:Nt=()=>[],getRouteSpecification:at=()=>null,getSpecificationBomEntries:Bt=()=>[],getRouteTransferSummary:Qe,getSupplyControlState:f,icon:h,normalizeLookupText:Re,normalizeBoardsPerPanel:Lt=(t=1,e=1)=>Number(t||0)||e,normalizePlainRecord:Me,normalizeQuantity:Ct=(t=0,e=0)=>Number(t||0)||e,normalizeSmtComponentKeyPart:Pt=(t="")=>String(t||"").trim().toLowerCase(),persistUiState:lt,render:v,renderModulePreviewEmpty:j,renderUiActionButton:Ne,renderUiDemoBadge:Be=()=>"",renderUiDemoCornerMarker:C=()=>"",renderUiEmptyState:Le,renderUiModuleHeader:Tt,renderUiModulePage:Et,renderUiModuleSidebar:Ot=()=>"",renderUiPanel:nt,renderUiPanelBody:rt,renderUiSidebarItem:qt=()=>"",renderUiStatusToken:xt,renderUiTableWrap:Ce,renderUiToolbar:Pe,round:P=(t=0)=>Math.round(Number(t||0)*100)/100,scheduleSharedStatePush:wt,setSupplyControlState:At,startOfDay:U,startOfWeek:K,toDate:g,toDateInput:it,getWeekNumber:jt=()=>0}=B,ot=B.getApp||(()=>null),Ut=B.getPlanningState||(()=>({})),st=B.getUi||(()=>({})),k={querySelector:(...t)=>ot()?.querySelector?.(...t)||null,querySelectorAll:(...t)=>ot()?.querySelectorAll?.(...t)||[]},Te=new Proxy({},{get(t,e){return Ut()?.[e]}}),d=new Proxy({},{get(t,e){return st()?.[e]},set(t,e,a){const l=st();return l&&typeof l=="object"&&(l[e]=a),!0}});function _(t={}){return!t||typeof t!="object"||Array.isArray(t)?{}:Object.fromEntries(Object.entries(t).flatMap(([e,a])=>{const l=Array.isArray(a)?[...new Set(a.map(n=>String(n||"").trim()).filter(Boolean))]:[];return e&&l.length?[[String(e),l]]:[]}))}function Kt(t=""){const e=String(t||"").trim();return R.some(a=>a.id===e)?e:"not_purchased"}function ut(t){if(t===""||t===null||typeof t>"u")return 0;const e=Number(String(t).replace(",","."));return!Number.isFinite(e)||e<0?0:Math.round(e*1e3)/1e3}function G(t=""){const e=String(t||"").trim();if(!e)return"";const a=e.includes("T")?g(e):g(A(e));return Number.isNaN(a.getTime())?"":it(a)}function S(t={}){return{status:Kt(t.status),erpDoc:String(t.erpDoc||"").trim(),purchasedQuantity:ut(t.purchasedQuantity),deliveredQuantity:ut(t.deliveredQuantity),plannedDate:G(t.plannedDate),actualDate:G(t.actualDate),supplier:String(t.supplier||"").trim(),comment:String(t.comment||"").trim()}}function z(t={}){const e=S(t);return e.status==="not_purchased"&&!e.erpDoc&&e.purchasedQuantity<=0&&e.deliveredQuantity<=0&&!e.plannedDate&&!e.actualDate&&!e.supplier&&!e.comment}function T(t={}){const e=t&&typeof t=="object"&&t.rows&&typeof t.rows=="object"?t.rows:{};return{rows:Object.fromEntries(Object.entries(e).map(([a,l])=>[String(a),S(l)]).filter(([,a])=>!z(a)))}}function _t(){try{return T(JSON.parse(localStorage.getItem(F)||"{}"))}catch{return T()}}function pt(){At(T(f())),localStorage.setItem(F,JSON.stringify(f())),wt("supply-control")}function Gt(t={},e={}){return`${t?.id||"route"}::${e?.id||"row"}`}function dt(t=""){return S(f().rows?.[t]||{})}function zt(t={},e={}){const a=S(t);if(a.status==="blocked")return"blocked";const l=Math.max(0,Number(e.requiredQuantity||0));return l>0&&a.deliveredQuantity>=l?"delivered":a.deliveredQuantity>0?"partial":a.status!=="not_purchased"?a.status:a.purchasedQuantity>0||a.erpDoc?"ordered":a.plannedDate||a.supplier?"requested":"not_purchased"}function It(t="not_purchased"){return R.find(e=>e.id===t)||R[0]}function Wt(t,e=[]){return e.map(a=>{const l=Gt(t,a),n=dt(l),r=zt(n,a),p=It(r);return{...a,controlKey:l,control:n,erpDocs:n.erpDoc?[n.erpDoc]:[],purchasedQuantity:n.purchasedQuantity,deliveredQuantity:n.deliveredQuantity,controlStatus:r,controlStatusLabel:p.label,controlTone:p.tone}})}function Yt(t="",e="",a=""){if(!t||!e)return;const l=dt(t),n=S({...l,[e]:a});z(n)?delete f().rows[t]:f().rows[t]=n,pt(),v()}function Ft(t=""){if(!t)return;const e=`${t}::`;Object.keys(f().rows||{}).forEach(a=>{a.startsWith(e)&&delete f().rows[a]}),pt(),v()}function Ht(t=""){const e=G(t);if(!e)return null;const a=g(A(e));return Number.isNaN(a.getTime())?null:U(a)}function ct(){return Nt().filter(t=>t?.id).filter(t=>L(t)||at(t)||tt(t))}function Jt(t=ct()){const e=t.find(a=>a.id===d.activeSupplyRouteId)||t.find(a=>a.id===d.activeRouteId)||t[0]||null;return e&&d.activeSupplyRouteId!==e.id&&(d.activeSupplyRouteId=e.id),e}function M(t=null){const a=L(t)?.dueDate||t?.dueDate||"";if(!a)return null;const l=String(a).includes("T")?g(a):g(A(a));return Number.isNaN(l.getTime())?null:U(l)}function Vt(t=null){const e=M(t),a=K(d.now||new Date),l=e&&e<a?K(e):a;return{...Dt("days",l,H),cellWidth:J,width:H*J}}function Xt(t,e=null){if(!t)return[];const a=Ct(e?.planningQuantity||X(t)),l=at(t);if(l)return Bt(l.id).map(r=>{const p=Math.max(1,Math.round(a*Math.max(1,Number(r.quantity||1))));return{...r,sourceId:r.structureItemId||r.bom.id,boardQuantity:p}});const n=tt(t);return n?[{bom:n,quantity:1,boardsPerPanel:Lt(t.boardsPerPanel,1),slot:"PCB",structureItemId:n.id,sourceId:n.id,boardQuantity:Math.max(1,a)}]:[]}function Zt(t={},e=null,a=null,l=0){if(e?.id)return`rek:${e.id}`;const n=[t.manufacturerPart,t.description,t.manufacturer,t.package].map(r=>Pt(r)).filter(Boolean);return n.length?`rek:${n.join(":")}`:`rek:${a?.id||"bom"}:${l+1}`}function te(t={},e=0){const a=Mt(t.bom?.id),l=t.bom?.name||t.bom?.boardCode||BOARD_SPEC_TERM,n=a?.name||t.bom?.resultItem||t.bom?.boardCode||t.bom?.name||"Печатная плата";return{id:`board:${t.sourceId||t.structureItemId||t.bom?.id||e+1}`,title:n,article:a?.article||t.bom?.boardCode||"",sourceLabel:l,quantity:Math.max(0,Number(t.boardQuantity||0)),order:e}}function ee(t){if(!t)return[];const e=V(t),a=Xt(t,e),l=a.map((s,c)=>te(s,c)),n=a.map((s,c)=>{const u=l[c];return{id:`pcb:${s.sourceId}`,groupId:u.id,groupTitle:u.title,groupArticle:u.article,groupSourceLabel:u.sourceLabel,groupBoardQuantity:u.quantity,groupOrder:u.order,kind:"pcb",typeLabel:"Печатная плата",title:u.title,article:u.article,package:"PCB",manufacturer:"",sourceLabel:u.sourceLabel,bomLabels:[u.sourceLabel],designators:"",requiredQuantity:s.boardQuantity,boardQuantity:s.boardQuantity,perBoardQuantity:1,unit:"шт.",erpDocs:[],purchasedQuantity:0,deliveredQuantity:0,stockQuantity:0,tone:"warning"}}),r=new Map,p=a.length>1;a.forEach((s,c)=>{const u=l[c];Rt(s.bom).filter(m=>Number(m.quantity||0)>0).forEach((m,ht)=>{const D=Qt(m,s.bom),vt=Zt(m,D,s.bom,ht),Y=p?`${vt}::${s.sourceId||u.id}`:vt,kt=Math.max(0,Number(m.quantity||0)),Q=r.get(Y)||{id:Y,groupId:u.id,groupTitle:u.title,groupArticle:u.article,groupSourceLabel:u.sourceLabel,groupBoardQuantity:u.quantity,groupOrder:u.order,kind:"rek",typeLabel:"РЭК",title:D?.name||m.description||m.manufacturerPart||`Компонент BOM ${m.sequence||ht+1}`,article:D?.article||m.manufacturerPart||"",package:D?.package||m.package||"",manufacturer:D?.manufacturer||m.manufacturer||"",sourceSet:new Set,designatorSet:new Set,requiredQuantity:0,unit:D?.unit||"шт.",erpDocs:[],purchasedQuantity:0,deliveredQuantity:0,stockQuantity:0,tone:"warning",bomRowCount:0,boardQuantity:s.boardQuantity,perBoardQuantity:0};Q.sourceSet.add(u.sourceLabel),m.designator&&Q.designatorSet.add(m.designator),Q.requiredQuantity+=kt*s.boardQuantity,Q.perBoardQuantity+=kt,Q.bomRowCount+=1,r.set(Y,Q)})});const b=[...r.values()].map(s=>{const c=[...s.sourceSet].filter(Boolean),u=[...s.designatorSet].filter(Boolean);return{...s,sourceLabel:c.slice(0,3).join(", ")+(c.length>3?` +${c.length-3}`:""),bomLabels:c,designators:u.slice(0,3).join(", ")+(u.length>3?` +${u.length-3}`:""),requiredQuantity:Math.round(s.requiredQuantity*1e3)/1e3,perBoardQuantity:Math.round(s.perBoardQuantity*1e3)/1e3}});return[...n,...b].filter(s=>s.requiredQuantity>0).sort((s,c)=>s.groupOrder!==c.groupOrder?Number(s.groupOrder||0)-Number(c.groupOrder||0):s.kind!==c.kind?s.kind==="pcb"?-1:1:String(s.title||"").localeCompare(String(c.title||""),"ru"))}function yt(t=[]){const e=[],a=new Map;return t.forEach(l=>{const n=l.groupId||l.id||"board";let r=a.get(n);r||(r={id:n,title:l.groupTitle||l.title||"Печатная плата",article:l.groupArticle||"",sourceLabel:l.groupSourceLabel||l.sourceLabel||BOARD_SPEC_TERM,boardQuantity:Number(l.groupBoardQuantity||0),order:Number(l.groupOrder||e.length),rows:[]},a.set(n,r),e.push(r)),r.rows.push(l),l.kind==="pcb"&&(r.pcbRow=l,r.boardQuantity=Number(l.requiredQuantity||r.boardQuantity||0))}),e.sort((l,n)=>l.order-n.order)}function mt(t={}){const e=String(t.title||"").toLowerCase(),a=String(t.sourceLabel||"");return[a&&e.includes(a.toLowerCase())?"":a,t.article&&t.article!==t.sourceLabel?`PN: ${t.article}`:"",`${y(t.boardQuantity)} плат`,`${t.rows?.filter(n=>n.kind==="rek").length||0} поз. РЭК`].filter(Boolean).join(" · ")}function ae(t=null){const e=String(t?.id||""),a=_(d.supplyCollapsedGroups||{});return new Set(e&&Array.isArray(a[e])?a[e]:[])}function I(t=null,e={}){return ae(t).has(String(e.id||""))}function le(t="",e=""){const a=String(t||"").trim(),l=String(e||"").trim();if(!a||!l)return;const n=_(d.supplyCollapsedGroups||{}),r=new Set(n[a]||[]);r.has(l)?r.delete(l):r.add(l);const p=[...r];p.length?n[a]=p:delete n[a],d.supplyCollapsedGroups=n,lt(),v()}function bt(t){const e=Wt(t,ee(t));return{rows:e,total:e.length,pcb:e.filter(a=>a.kind==="pcb").length,rek:e.filter(a=>a.kind==="rek").length,pending:e.filter(a=>!a.erpDocs.length).length,controlled:e.filter(a=>!z(a.control)).length,erpDocs:e.filter(a=>a.erpDocs.length).length,deliveries:e.filter(a=>Number(a.deliveredQuantity||0)>0||a.control?.plannedDate||a.control?.actualDate).length,blocked:e.filter(a=>a.controlStatus==="blocked").length,delivered:e.filter(a=>a.controlStatus==="delivered").length,purchasedQuantity:e.reduce((a,l)=>a+Number(l.purchasedQuantity||0),0),requiredQuantity:e.reduce((a,l)=>a+Number(l.requiredQuantity||0),0)}}function ne(){const t=ct(),e=Jt(t),a=L(e),l=e?V(e):null,n=bt(e),r=n.rows,p=Vt(e),b=M(e),s=e?Z(a)||et(e)||e.name||"Заказ-наряд":"Заказ-наряд не выбран",c=e?[e.name||"маршрутная карта",`${Number(l?.planningQuantity||X(e)||0).toLocaleString("ru-RU")} шт.`,b?`срок ${$(b)}`:"срок не задан"].join(" · "):"Выберите заказ-наряд, чтобы увидеть потребность BOM.";return Et({ariaLabel:"Снабжение",className:"supply-page",workspaceClassName:"supply-workspace",contentClassName:"supply-content",sidebar:Ot({eyebrow:"Закупочный контур",title:"Снабжение",className:"supply-sidebar",body:`
          <div class="ui-sidebar-list supply-route-list">
            <div class="ui-sidebar-label">Заказ-наряды</div>
            ${t.length?t.map(u=>re(u,u.id===e?.id)).join(""):j({iconName:"calendar",title:"Заказ-нарядов нет",text:"Снабжение строится от сохраненных маршрутных карт и заказ-нарядов."})}
          </div>
        `}),header:Tt({eyebrow:"Синтетический контроль",title:s,description:c,className:"directory-header supply-header",cornerMarker:C("Снабжение: синтетический контроль без влияния на систему"),actions:`<span class="supply-readonly-badge">${h("edit")}<span>не влияет на систему</span></span>`}),content:`
        ${nt({title:"Гант снабжения",meta:"дневной горизонт с группировкой по неделям; строки закупки считаются из BOM заказ-наряда",className:"supply-gantt-panel",cornerMarker:C("Демо-блок: Гант снабжения не меняет производственный план"),actions:xt(n.blocked?"есть проблемы":n.pending?"часть без счета":"контроль заполнен",n.blocked?"danger":n.pending?"warning":"ok","supply-status-pill"),body:rt({body:r.length?ie(e,r,p):j({iconName:"bom",title:"BOM-потребность не найдена",text:"У выбранного заказ-наряда нет плат или строк BOM для закупочного контроля."})})})}
  
        ${nt({title:"Реестр потребности",meta:r.length?`${r.length} строк к контролю`:"нет строк",className:"supply-table-panel",cornerMarker:C("Демо-блок: реестр снабжения хранит синтетический контроль"),actions:`<button class="secondary-button supply-clear-button ui-action-button" data-supply-clear-route="${i(e?.id||"")}" type="button" ${n.controlled?"":"disabled"}>${h("refresh")}<span>Очистить контроль</span></button>`,body:rt({body:r.length?ge(e,r):j({iconName:"package",title:"Компоненты не рассчитаны",text:"После привязки BOM здесь появятся платы и РЭК без создания закупочных записей."})})})}
  
        <section class="supply-kpi-grid is-bottom ui-demo-marker-host" aria-label="Итоги снабжения">
          ${C("Демо-блок: итоги снабжения не влияют на систему")}
          ${E("Печатные платы",n.pcb,"тиражи из BOM","pcb")}
          ${E("РЭК",n.rek,"компоненты BOM","rek")}
          ${E("ERP документы",n.erpDocs,n.erpDocs?"внесено вручную":"счета не внесены",n.erpDocs?"primary":"warning")}
          ${E("Поставки",n.deliveries,n.delivered?`${n.delivered} закрыто`:"контроль план/факт",n.deliveries?"ok":"neutral")}
        </section>
        ${Se(e,r)}
      `})}function re(t,e=!1){const a=L(t),l=M(t),n=bt(t),r=Z(a)||et(t)||t.name||"Заказ-наряд";return qt({title:r,meta:`${t.name||"маршрутная карта"} · ${l?$(l):"срок не задан"}`,badge:n.total.toLocaleString("ru-RU"),active:e,className:"supply-route-card",attributes:`data-supply-route-open="${i(t.id)}" type="button"`})}function E(t,e,a,l="neutral"){const n=l==="pcb"?"bom":l==="rek"?"package":l==="warning"?"alert":"supply";return`
      <article class="supply-kpi-card is-${i(l)}">
        <span>${h(n)}</span>
        <div>
          <small>${o(t)}</small>
          <strong>${o(String(e))}</strong>
          <em>${o(a)}</em>
        </div>
      </article>
    `}function ie(t,e,a){const l=yt(e);return`
      <div class="supply-gantt-shell" style="--supply-left-width: 260px; --supply-day-count: ${a.ticks.length}; --supply-day-width: ${a.cellWidth}px; --supply-timeline-width: ${a.width}px;">
        <div class="supply-timeline-row">
          <div class="supply-timeline-corner">
            <strong>Компоненты</strong>
            <span>дни внутри недель</span>
          </div>
          <div class="supply-timeline-cells">
            <div class="supply-week-group-row">
              ${ue(a).map(n=>pe(n,a)).join("")}
            </div>
            <div class="supply-day-row">
              ${a.ticks.map((n,r)=>de(n,r,a)).join("")}
            </div>
          </div>
        </div>
        <div class="supply-gantt-body">
          ${l.map(n=>oe(t,n,a)).join("")}
        </div>
        <div class="supply-gantt-legend">
          <span><i class="is-demand"></i>потребность BOM</span>
          <span><i class="is-weekend"></i>выходные; праздничный календарь не подключен</span>
          <span><i class="is-empty"></i>поставки и ERP-документы не подключены</span>
        </div>
      </div>
    `}function oe(t,e,a){const l=mt(e),n=I(t,e),r=t?.id||"";return`
      <section class="supply-gantt-group ${n?"is-collapsed":""}" aria-label="${i(e.title)}">
        <div class="supply-gantt-group-row">
          <div class="supply-gantt-group-label">
            <button
              class="icon-button supply-group-toggle ui-action-button"
              data-supply-group-toggle="${i(e.id)}"
              data-supply-route-id="${i(r)}"
              type="button"
              aria-expanded="${n?"false":"true"}"
              title="${n?"Раскрыть группу":"Свернуть группу"}"
            >
              ${h(n?"chevronRight":"chevronDown")}
            </button>
            <b>Плата</b>
            <span>
              <strong>${o(e.title)}</strong>
              <small>${o(l)}</small>
            </span>
          </div>
          <div class="supply-group-lane">
            ${$t(a)}
          </div>
        </div>
        ${n?"":e.rows.map(p=>be(t,p,a)).join("")}
      </section>
    `}function N(t,e){const a=Math.max(1,Number(e?.width||1));return`${P(Math.max(0,Math.min(a,t))/a*100)}%`}function O(t,e){const a=g(e?.start),l=g(e?.end),n=g(t),r=Math.max(1,l.getTime()-a.getTime());return(n.getTime()-a.getTime())/r*Number(e?.width||0)}function W(t,e){return`${P(t/Math.max(1,e.ticks.length)*100)}%`}function gt(t){return`${P(100/Math.max(1,t.ticks.length))}%`}function se(t,e){return`${P(t/Math.max(1,e.ticks.length)*100)}%`}function ue(t){const e=[];return t.ticks.forEach((a,l)=>{const n=K(a.start),r=it(n),p=e[e.length-1];!p||p.key!==r?e.push({key:r,start:n,startIndex:l,dayCount:1}):p.dayCount+=1}),e}function pe(t,e){const a=x(t.start,(t.dayCount-1)*q);return`
      <div class="supply-week-group" style="left:${W(t.startIndex,e)}; width:${se(t.dayCount,e)};">
        <strong>Н${jt(t.start)}</strong>
        <small>${o(w(t.start))}-${o(w(a))}</small>
      </div>
    `}function de(t,e,a){const l=t.start.getDay()===0||t.start.getDay()===6,n=t.start.getDay()===1||e===0;return`
      <div class="supply-day-cell ${l?"is-weekend":""} ${n?"is-week-start":""}" style="left:${W(e,a)}; width:${gt(a)};" title="${i($(t.start))}">
        <strong>${o(w(t.start))}</strong>
      </div>
    `}function ce(t,e){const a=M(t),l=e.start,n=e.end,r=a&&a>l?x(a,q):n,p=new Date(Math.min(n.getTime(),Math.max(x(l,7*q).getTime(),r.getTime()))),b=8,s=Math.max(44,Math.min(e.width-b-8,O(p,e)-b));return`left:${N(b,e)};width:${N(s,e)};`}function ye(t,e){const a=M(t);if(!a||a<e.start||a>e.end)return"";const l=Math.max(0,Math.min(e.width,O(a,e)));return`<span class="supply-due-marker" style="left:${N(l,e)};" title="Срок заказ-наряда: ${i($(a))}"></span>`}function me(t){const e=U(d.now||new Date);if(e<t.start||e>t.end)return"";const a=Math.max(0,Math.min(t.width,O(e,t)));return`<span class="supply-today-marker" style="left:${N(a,t)};" title="Сегодня"></span>`}function $t(t){return t.ticks.map((e,a)=>`
      <span
        class="supply-lane-day ${e.start.getDay()===0||e.start.getDay()===6?"is-weekend":""} ${e.start.getDay()===1||a===0?"is-week-start":""}"
        style="left:${W(a,t)}; width:${gt(t)};"
        title="${i($(e.start))}"
      >
      </span>
    `).join("")}function ft(t,e,a,l,n=""){const r=Ht(t.control?.[a]||"");if(!r||r<e.start||r>e.end)return"";const p=Math.max(0,Math.min(e.width,O(r,e)));return`
      <span
        class="supply-delivery-marker ${n}"
        style="left:${N(p,e)};"
        title="${i(`${l}: ${$(r)}`)}"
      >
        <i>${o(l)}</i>
      </span>
    `}function be(t,e,a){const l=e.kind==="rek"&&Number(e.perBoardQuantity||0)>0?`на плату ${y(e.perBoardQuantity)}`:"",n=[e.article?`PN: ${e.article}`:"",e.package,l,e.sourceLabel].filter(Boolean).join(" · ")||e.typeLabel,r=e.kind==="pcb"?"PCB":"РЭК",p=Number(e.purchasedQuantity||0)>0?`${y(e.purchasedQuantity)} / ${y(e.requiredQuantity)} ${e.unit||"шт."}`:`${y(e.requiredQuantity)} ${e.unit||"шт."}`;return`
      <article class="supply-gantt-row is-${i(e.kind)}">
        <div class="supply-gantt-label">
          <b>${o(r)}</b>
          <span>
            <strong>${o(e.title)}</strong>
            <small>${o(n)}</small>
          </span>
          <em>${o(y(e.requiredQuantity))} ${o(e.unit||"шт.")}</em>
        </div>
        <div class="supply-lane">
          ${$t(a)}
          ${me(a)}
          ${ye(t,a)}
          ${ft(e,a,"plannedDate","план")}
          ${ft(e,a,"actualDate","факт","is-actual")}
          <button
            class="supply-demand-bar is-${i(e.controlTone||"warning")} ${d.activeSupplyDemandRowId===e.id?"is-active":""}"
            data-supply-demand-open="${i(e.id)}"
            type="button"
            style="${ce(t,a)}"
            title="${i(`Двойное нажатие: ${e.title}`)}"
          >
            <strong>${o(p)}</strong>
            <small>${o(e.controlStatusLabel||"Не закуплено")}</small>
          </button>
          <span class="supply-no-delivery">${e.deliveredQuantity?`принято ${o(y(e.deliveredQuantity))}`:"поставок нет"}</span>
        </div>
      </article>
    `}function ge(t,e){return`
      <div class="supply-table-wrap ui-table-wrap" data-layout="table" data-scroll-contract="horizontal-only" data-ui-component="TableWrap">
        <table class="supply-table">
          <thead>
            <tr>
              <th>Позиция</th>
              <th>BOM / источник</th>
              <th>Потребность</th>
              <th>Статус</th>
              <th>ERP / поставщик</th>
              <th>Закуплено</th>
              <th>Поставка</th>
              <th>Комментарий</th>
            </tr>
          </thead>
          <tbody>
            ${yt(e).map(l=>`
              ${$e(t,l)}
              ${I(t,l)?"":l.rows.map(n=>fe(n)).join("")}
            `).join("")}
          </tbody>
        </table>
      </div>
    `}function $e(t,e){const a=mt(e),l=I(t,e);return`
      <tr class="supply-table-group-row ${l?"is-collapsed":""}">
        <th colspan="8">
          <span>
            <button
              class="icon-button supply-group-toggle ui-action-button"
              data-supply-group-toggle="${i(e.id)}"
              data-supply-route-id="${i(t?.id||"")}"
              type="button"
              aria-expanded="${l?"false":"true"}"
              title="${l?"Раскрыть группу":"Свернуть группу"}"
            >
              ${h(l?"chevronRight":"chevronDown")}
            </button>
            <b>Плата</b>
            <strong>${o(e.title)}</strong>
            <small>${o(a)}</small>
          </span>
        </th>
      </tr>
    `}function fe(t){const e=t.control||S(),a=St(t);return`
              <tr>
                <td class="primary-cell">
                  <strong>${o(t.title)}</strong>
                  <small>${o([t.typeLabel,t.article?`PN: ${t.article}`:"",t.package].filter(Boolean).join(" · "))}</small>
                </td>
                <td>${o(a)}</td>
                <td>${o(y(t.requiredQuantity))} ${o(t.unit||"шт.")}</td>
                <td>
                  <select class="supply-control-field" data-supply-control-key="${i(t.controlKey)}" data-supply-control-field="status" aria-label="Статус закупки">
                    ${R.map(l=>`
                      <option value="${i(l.id)}" ${l.id===(t.controlStatus||e.status)?"selected":""}>${o(l.label)}</option>
                    `).join("")}
                  </select>
                </td>
                <td>
                  <div class="supply-control-stack">
                    <input class="supply-control-field" data-supply-control-key="${i(t.controlKey)}" data-supply-control-field="erpDoc" value="${i(e.erpDoc)}" placeholder="счет / заказ 1С" aria-label="ERP документ" />
                    <input class="supply-control-field" data-supply-control-key="${i(t.controlKey)}" data-supply-control-field="supplier" value="${i(e.supplier)}" placeholder="поставщик" aria-label="Поставщик" />
                  </div>
                </td>
                <td>
                  <label class="supply-quantity-field">
                    <input class="supply-control-field" data-supply-control-key="${i(t.controlKey)}" data-supply-control-field="purchasedQuantity" type="number" min="0" step="1" value="${i(e.purchasedQuantity||"")}" aria-label="Закупленное количество" />
                    <span>/ ${o(y(t.requiredQuantity))}</span>
                  </label>
                </td>
                <td>
                  <div class="supply-control-stack is-delivery">
                    <label><span>план</span><input class="supply-control-field" data-supply-control-key="${i(t.controlKey)}" data-supply-control-field="plannedDate" type="date" value="${i(e.plannedDate)}" aria-label="Плановая поставка" /></label>
                    <label><span>факт</span><input class="supply-control-field" data-supply-control-key="${i(t.controlKey)}" data-supply-control-field="actualDate" type="date" value="${i(e.actualDate)}" aria-label="Фактическая поставка" /></label>
                    <label><span>принято</span><input class="supply-control-field" data-supply-control-key="${i(t.controlKey)}" data-supply-control-field="deliveredQuantity" type="number" min="0" step="1" value="${i(e.deliveredQuantity||"")}" aria-label="Принятое количество" /></label>
                  </div>
                </td>
                <td>
                  <input class="supply-control-field" data-supply-control-key="${i(t.controlKey)}" data-supply-control-field="comment" value="${i(e.comment)}" placeholder="комментарий снабжения" aria-label="Комментарий снабжения" />
                </td>
              </tr>
            `}function St(t={}){return t.kind==="rek"&&Number(t.perBoardQuantity||0)>0?`${t.sourceLabel||"-"} · на плату ${y(t.perBoardQuantity)}`:t.sourceLabel||"-"}function Se(t,e=[]){if(!d.activeSupplyDemandRowId)return"";const a=e.find(s=>s.id===d.activeSupplyDemandRowId);if(!a)return"";const l=a.control||S(),n=St(a),r=[a.typeLabel,a.article?`PN: ${a.article}`:"",a.package].filter(Boolean).join(" · "),p=a.kind==="rek"&&Number(a.perBoardQuantity||0)>0?`на плату ${y(a.perBoardQuantity)} ${a.unit||"шт."}`:a.kind==="pcb"?"тираж платы":"",b=a.deliveredQuantity?`принято ${y(a.deliveredQuantity)} ${a.unit||"шт."}`:"план / факт / принято";return`
      <div class="supply-demand-popover-layer" role="presentation">
        <button class="supply-demand-popover-backdrop" data-supply-detail-close type="button" aria-label="Закрыть карточку потребности"></button>
        <section class="supply-demand-popover" role="dialog" aria-modal="true" aria-label="Потребность снабжения">
          <header class="supply-demand-popover-head">
            <div>
              <span class="eyebrow">Потребность компонента</span>
              <strong>${o(a.title)}</strong>
              <small>${o([a.groupTitle,n].filter(Boolean).join(" · "))}</small>
            </div>
            <button class="icon-button ui-action-button" data-supply-detail-close type="button" title="Закрыть">${h("close")}</button>
          </header>
  
          <div class="supply-detail-grid">
            <article class="supply-detail-cell is-wide">
              <span>Позиция</span>
              <strong>${o(a.title)}</strong>
              <small>${o(r||"позиция BOM")}</small>
            </article>
  
            <article class="supply-detail-cell">
              <span>BOM / источник</span>
              <strong>${o(n)}</strong>
              <small>${o(a.designators||a.groupTitle||"")}</small>
            </article>
  
            <article class="supply-detail-cell">
              <span>Потребность</span>
              <strong>${o(y(a.requiredQuantity))} ${o(a.unit||"шт.")}</strong>
              <small>${o(p)}</small>
            </article>
  
            <label class="supply-detail-cell is-control">
              <span>Статус</span>
              <select class="supply-control-field" data-supply-control-key="${i(a.controlKey)}" data-supply-control-field="status" aria-label="Статус закупки">
                ${R.map(s=>`
                  <option value="${i(s.id)}" ${s.id===(a.controlStatus||l.status)?"selected":""}>${o(s.label)}</option>
                `).join("")}
              </select>
            </label>
  
            <article class="supply-detail-cell is-wide">
              <span>ERP / поставщик</span>
              <div class="supply-detail-inline-fields">
                <input class="supply-control-field" data-supply-control-key="${i(a.controlKey)}" data-supply-control-field="erpDoc" value="${i(l.erpDoc)}" placeholder="счет / заказ 1С" aria-label="ERP документ" />
                <input class="supply-control-field" data-supply-control-key="${i(a.controlKey)}" data-supply-control-field="supplier" value="${i(l.supplier)}" placeholder="поставщик" aria-label="Поставщик" />
              </div>
            </article>
  
            <article class="supply-detail-cell">
              <span>Закуплено</span>
              <label class="supply-detail-quantity">
                <input class="supply-control-field" data-supply-control-key="${i(a.controlKey)}" data-supply-control-field="purchasedQuantity" type="number" min="0" step="1" value="${i(l.purchasedQuantity||"")}" aria-label="Закупленное количество" />
                <small>/ ${o(y(a.requiredQuantity))}</small>
              </label>
            </article>
  
            <article class="supply-detail-cell is-wide">
              <span>Поставка</span>
              <div class="supply-detail-delivery-fields">
                <label><small>план</small><input class="supply-control-field" data-supply-control-key="${i(a.controlKey)}" data-supply-control-field="plannedDate" type="date" value="${i(l.plannedDate)}" aria-label="Плановая поставка" /></label>
                <label><small>факт</small><input class="supply-control-field" data-supply-control-key="${i(a.controlKey)}" data-supply-control-field="actualDate" type="date" value="${i(l.actualDate)}" aria-label="Фактическая поставка" /></label>
                <label><small>принято</small><input class="supply-control-field" data-supply-control-key="${i(a.controlKey)}" data-supply-control-field="deliveredQuantity" type="number" min="0" step="1" value="${i(l.deliveredQuantity||"")}" aria-label="Принятое количество" /></label>
              </div>
              <small>${o(b)}</small>
            </article>
  
            <label class="supply-detail-cell is-comment">
              <span>Комментарий</span>
              <textarea class="supply-control-field" data-supply-control-key="${i(a.controlKey)}" data-supply-control-field="comment" rows="3" placeholder="комментарий снабжения" aria-label="Комментарий снабжения">${o(l.comment)}</textarea>
            </label>
          </div>
        </section>
      </div>
    `}function he(){k.querySelectorAll("[data-supply-route-open]").forEach(t=>{t.addEventListener("click",()=>{const e=t.dataset.supplyRouteOpen||"";e&&(d.activeSupplyRouteId=e,d.activeRouteId=e,d.activeSupplyDemandRowId="",lt(),v())})}),k.querySelectorAll("[data-supply-demand-open]").forEach(t=>{const e=a=>{a.preventDefault(),d.activeSupplyDemandRowId=t.dataset.supplyDemandOpen||"",v()};t.addEventListener("click",a=>{a.detail<2||e(a)}),t.addEventListener("dblclick",a=>{e(a)})}),k.querySelectorAll("[data-supply-detail-close]").forEach(t=>{t.addEventListener("click",e=>{e.preventDefault(),d.activeSupplyDemandRowId="",v()})}),k.querySelectorAll("[data-supply-group-toggle]").forEach(t=>{t.addEventListener("click",e=>{e.preventDefault(),le(t.dataset.supplyRouteId||d.activeSupplyRouteId||"",t.dataset.supplyGroupToggle||"")})}),k.querySelectorAll("[data-supply-control-field]").forEach(t=>{const e=()=>{Yt(t.dataset.supplyControlKey||"",t.dataset.supplyControlField||"",t.value)};t.addEventListener("change",e),t.addEventListener("keydown",a=>{a.key==="Enter"&&(a.preventDefault(),t.blur(),e())})}),k.querySelector("[data-supply-clear-route]")?.addEventListener("click",t=>{t.preventDefault(),Ft(t.currentTarget.dataset.supplyClearRoute||"")})}return{bindSupplyEvents:he,loadSupplyControlState:_t,normalizeSupplyCollapsedGroups:_,normalizeSupplyControlState:T,renderSupplyPage:ne}}export{Ee as createSupplyModule};
