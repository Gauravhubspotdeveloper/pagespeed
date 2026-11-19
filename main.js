const API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const PAGESPEED_API_KEY = "AIzaSyB7QAAoFRC-scjd_nQf5k4tjyUs2IdSOow";
let reportData = null;

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const scoreClass = n => n >= 90 ? "good" : n >= 50 ? "average" : "poor";
const scoreLabel = n => n >= 90 ? "Good" : n >= 50 ? "Needs improvement" : "Poor";
const fmt = (v, unit="") => v == null ? "Not available" : `${v}${unit}`;
const lighthouseMetricWeights = {
 "first-contentful-paint":10,
 "speed-index":10,
 "largest-contentful-paint":25,
 "total-blocking-time":30,
 "cumulative-layout-shift":25
};
let reportDevice="desktop";
let reportSection="performance";
let pageWeightFilter="All";
let recommendationCategory="performance";
let performanceMetricFilter="all";
function formatBytes(bytes){
 if(!Number.isFinite(bytes)||bytes<=0)return "0 KB";
 if(bytes>=1024*1024)return `${(bytes/1024/1024).toFixed(bytes>=10*1024*1024?1:2)} MB`;
 return `${Math.max(1,Math.round(bytes/1024))} KB`;
}
function formatDuration(seconds){
 if(!Number.isFinite(seconds)||seconds<0)return "—";
 return seconds>=1?`${seconds.toFixed(2)} s`:`${Math.round(seconds*1000)} ms`;
}
function networkDurationSeconds(item){
 const start=item.startTime,end=item.endTime;
 if(Number.isFinite(start)&&Number.isFinite(end)&&end>=start)return end-start;
 const requestStart=item.networkRequestTime,requestEnd=item.networkEndTime;
 if(Number.isFinite(requestStart)&&Number.isFinite(requestEnd)&&requestEnd>=requestStart)return (requestEnd-requestStart)/1000;
 const networkStart=item.networkStartTime,networkEnd=item.networkEndTime;
 if(Number.isFinite(networkStart)&&Number.isFinite(networkEnd)&&networkEnd>=networkStart)return (networkEnd-networkStart)/1000;
 for(const duration of [item.networkDuration,item.durationMs,item.requestDurationMs]){
  if(Number.isFinite(duration)&&duration>=0)return duration/1000;
 }
 return null;
}
function renderPageWeight(lhr){
 pageWeightFilter="All";
 const network=lhr?.audits?.["network-requests"];
 const items=network?.details?.items||[];
 if(!items.length){
  $("pageWeightContent").innerHTML='<div class="empty">Network resource data unavailable.</div>';
  return;
 }
 const lcpAudit=lhr.audits?.["largest-contentful-paint-element"];
 const lcpUrls=new Set();
 (lcpAudit?.details?.items||[]).forEach(item=>{
  const snippet=item.node?.snippet||item.url||"";
  const match=snippet.match(/(?:src|href)=["']([^"']+)/i);
  if(match)lcpUrls.add(match[1]);
 });
 const resources=items.map(item=>{
  const url=item.url||"";
  let pathname=url;
  try{pathname=new URL(url).pathname;}catch(e){}
  const rawType=(item.resourceType||item.mimeType||"Document").toString();
  const mime=String(item.mimeType||"").toLowerCase();
  const lowerUrl=url.toLowerCase();
  let category="Other";
  if(/^(image|img|media)$/i.test(rawType)||mime.startsWith("image/")||/\.(avif|webp|png|jpe?g|gif|svg|ico)(\?|$)/.test(lowerUrl))category="Images";
  else if(/^(script|javascript)$/i.test(rawType)||mime.includes("javascript")||/\.(mjs|js)(\?|$)/.test(lowerUrl))category="JavaScript";
  else if(/^(stylesheet|css)$/i.test(rawType)||mime.includes("css")||/\.css(\?|$)/.test(lowerUrl))category="CSS";
  else if(/^(font)$/i.test(rawType)||mime.includes("font")||/\.(woff2?|ttf|otf|eot)(\?|$)/.test(lowerUrl))category="Fonts";
  else if(/^(document|html)$/i.test(rawType)||mime.includes("html")||/\.(html?|php)(\?|$)/.test(lowerUrl))category="HTML";
  else if(mime.startsWith("video/")||mime.startsWith("audio/")||/\.(mp4|webm|mov|mp3|wav|ogg)(\?|$)/.test(lowerUrl))category="Media";
  const type=rawType.replace(/^(Script|Stylesheet)$/i,m=>m==="Script"?"JavaScript":m==="Stylesheet"?"CSS":m);
  const duration=networkDurationSeconds(item);
  const rawSize=item.transferSize??item.resourceSize??0;
  const size=Number.isFinite(rawSize)&&rawSize>0?rawSize:0;
  return {url,pathname,type,category,priority:item.priority||"—",duration,size};
 }).sort((a,b)=>b.size-a.size);
 const total=resources.reduce((sum,item)=>sum+item.size,0);
 const categories=["All","Images","JavaScript","CSS","Fonts","HTML","Media","Other"];
 const categoryColors={
  Images:"#7c5ce7",
  JavaScript:"#f0a32f",
  CSS:"#4385f5",
  Fonts:"#18a886",
  HTML:"#ec6b62",
  Media:"#d65db1",
  Other:"#9aa3b2"
 };
 const categoryTotals=categories.slice(1).map(category=>({
  name:category,
  size:resources.filter(item=>item.category===category).reduce((sum,item)=>sum+(Number.isFinite(item.size)&&item.size>0?item.size:0),0)
 })).filter(item=>item.size>0);
 const renderTable=()=>{
  const filtered=pageWeightFilter==="All"?resources:resources.filter(item=>item.category===pageWeightFilter);
  const filteredTotal=filtered.reduce((sum,item)=>sum+item.size,0);
  $("pageWeightContent").innerHTML=`
  <section class="page-weight-share" aria-label="Page weight by resource type">
   <div class="page-weight-share-head">
    <div class="page-weight-share-title"><span>RESOURCE BREAKDOWN</span><strong>Page transfer composition</strong><small>Share of total data transferred by resource type</small></div>
    <div class="page-weight-share-total"><strong>${formatBytes(total)}</strong><span>Total transferred</span></div>
   </div>
   ${total>0?`<div class="page-weight-share-bar" role="img" aria-label="${categoryTotals.map(item=>`${item.name} ${Math.round(item.size/total*100)}%`).join(", ")}">${categoryTotals.map(item=>`<span class="page-weight-share-segment" style="flex:${item.size} 1 0%;background:${categoryColors[item.name]}" title="${esc(item.name)}: ${Math.round(item.size/total*100)}%"></span>`).join("")}</div>
   <div class="page-weight-share-legend">${categoryTotals.map(item=>{
    const share=item.size/total*100;
    return `<div class="page-weight-share-item"><div class="page-weight-share-label"><i style="background:${categoryColors[item.name]}"></i><span>${esc(item.name)}</span></div><strong>${Math.round(share)}%</strong><div class="page-weight-share-track"><i style="width:${share}%;background:${categoryColors[item.name]}"></i></div><small>${formatBytes(item.size)}</small></div>`;
   }).join("")}</div>`:'<div class="page-weight-share-empty">No transferable resource size data is available.</div>'}
  </section>
  <div class="page-weight-tabs" role="tablist" aria-label="Page resource types">${categories.map(category=>{
   const count=category==="All"?resources.length:resources.filter(item=>item.category===category).length;
   return `<button type="button" role="tab" class="page-weight-tab ${pageWeightFilter===category?"active":""}" data-page-weight-filter="${category}" aria-selected="${pageWeightFilter===category?"true":"false"}">${category}<span>${count}</span></button>`;
  }).join("")}</div>
  <div class="page-weight-summary"><span><strong>${formatBytes(filteredTotal)}</strong> ${pageWeightFilter==="All"?"total transfer":esc(pageWeightFilter.toLowerCase()+" transfer")}</span><span><strong>${filtered.length}</strong> resources</span></div>
  <div class="weight-table-wrap"><table class="weight-table"><thead><tr><th>Resource</th><th>Type</th><th>Priority</th><th>Time</th><th>Size</th></tr></thead><tbody>${filtered.map(item=>{
  let host="";
  try{host=new URL(item.url).host;}catch(e){}
  const name=item.pathname.split("/").filter(Boolean).pop()||item.url;
  const isLcp=[...lcpUrls].some(lcpUrl=>item.url===lcpUrl||item.url.includes(lcpUrl));
  const lcpTag=isLcp?'<b class="resource-tag lcp">LCP</b>':"";
  return `<tr title="${esc(item.url)}"><td><strong class="resource-name">${esc(name)}</strong><span class="resource-host">${esc(host||item.url)}</span>${lcpTag?`<span class="resource-tags">${lcpTag}</span>`:""}</td><td><span class="resource-type">${esc(item.type)}</span></td><td><span class="priority priority-${esc(String(item.priority).toLowerCase().replace(/[^a-z]/g,""))}">${esc(item.priority)}</span></td><td>${item.duration==null?"Not reported":formatDuration(item.duration)}</td><td><strong>${formatBytes(item.size)}</strong></td></tr>`;
 }).join("")||`<tr><td colspan="5" class="empty">No ${esc(pageWeightFilter.toLowerCase())} resources found.</td></tr>`}</tbody></table></div>`;
 };
 renderTable();
 $("pageWeightContent").onclick=event=>{
  const tab=event.target.closest("[data-page-weight-filter]");
  if(!tab)return;
  pageWeightFilter=tab.dataset.pageWeightFilter;
  renderTable();
 };
}
function setStatus(message, error=false){const s=$("status");s.textContent=message;s.className="status show"+(error?" error":"");}
function categoryScore(lhr, key){const v=lhr?.categories?.[key]?.score;return v==null?null:Math.round(v*100);}
function auditValue(a){if(!a)return "Not available";if(a.displayValue)return a.displayValue;if(a.numericValue!=null)return `${Math.round(a.numericValue*100)/100}${a.numericUnit||""}`;return a.scoreDisplayMode==="binary"?(a.score===1?"Pass":"Fail"):"Not available";}
function metricBlock(lhr, id, label){
 const a=lhr?.audits?.[id]; if(!a)return "";
 const value=a.displayValue||auditValue(a); const sc=a.score==null?null:Math.round(a.score*100);
 const thresholds={"first-contentful-paint":"Good ≤ 1.8s · Poor > 3.0s","speed-index":"Good ≤ 3.4s · Poor > 5.8s","largest-contentful-paint":"Good ≤ 2.5s · Poor > 4.0s","total-blocking-time":"Good ≤ 200ms · Poor > 600ms","cumulative-layout-shift":"Good ≤ 0.1 · Poor > 0.25"};
 const weight=lighthouseMetricWeights[id]??0;
 return `<div class="metric"><span>${esc(label)}<small class="metric-detail">${esc(thresholds[id]||"Lab metric")} · Score weight: ${weight}%</small></span><span class="${sc==null?"":scoreClass(sc)}">${esc(value)}${sc==null?"":` · ${sc}/100`}</span></div>`;
}
function renderDevice(name, data){
 const lhr=data.lighthouseResult||{}, score=categoryScore(lhr,"performance"), audits=lhr.audits||{};
 const metrics=[
  ["first-contentful-paint","First Contentful Paint"],
  ["speed-index","Speed Index"],
  ["largest-contentful-paint","Largest Contentful Paint"],
  ["total-blocking-time","Total Blocking Time"],
  ["cumulative-layout-shift","Cumulative Layout Shift"]
 ];
 const metricHtml=metrics.map(([id,label])=>metricBlock(lhr,id,label)).join("");
 const field=lhr?.audits?.["loading-experience"]?.displayValue || "";
 const el=$(name.toLowerCase()+"Panel");
 el.innerHTML=`<div class="scorehead"><div><h2>${name} performance</h2><div class="note" style="margin:0">Lighthouse lab assessment</div></div><div class="score ${score==null?"":scoreClass(score)}">${score==null?"—":score}</div></div>
 <div class="bar"><i style="width:${score??0}%;background:${score>=90?"#16865b":score>=50?"#d69e2e":"#c0392b"}"></i></div>
 <div class="note" style="margin:8px 0 12px">${score==null?"Performance score unavailable":scoreLabel(score)}</div>
 <h3>Key metrics</h3>${metricHtml||'<div class="empty">Metric data unavailable.</div>'}
 <div class="section"><h3>Field data</h3><div class="empty">${field?esc(field):"Chrome UX Report field data is not available for this URL or device."}</div></div>`;
}
function recommendationStatus(lhr, auditIds){
 const audits=lhr?.audits||{};
 let found=false;
 for(const id of auditIds){
  const audit=audits[id];
  if(!audit || audit.scoreDisplayMode==="notApplicable")continue;
  if(audit.score==null)continue;
  if(["informative","manual"].includes(audit.scoreDisplayMode))continue;
  found=true;
  if(audit.score<1)return "Needs attention";
 }
 return found?"Fixed":"Manual review";
}
function recommendationSpecificItems(audits, auditIds, fallback){
 const items=[];
 for(const id of auditIds){
  const audit=audits?.[id];
  if(!audit)continue;
  const auditItems=Array.isArray(audit.details?.items)?audit.details.items:[];
  auditItems.forEach(detail=>{
   const label=detail.url||detail.source?.url||detail.node?.snippet||detail.filename||detail.label||detail.heading||detail.entity||detail.value||detail.displayValue;
   if(label && !items.includes(label))items.push(String(label));
  });
  if(!auditItems.length && audit.displayValue){
   const label=`${audit.title||id}: ${audit.displayValue}`;
   if(!items.includes(label))items.push(label);
  }
  if(items.length>=6)break;
 }
 return items.length?items:[fallback];
}
function buildRecommendations(mobileLhr={},desktopLhr={}){
 const desktopAudits=desktopLhr.audits||{};
 const mobileAudits=mobileLhr.audits||{};
 const refs=(desktopLhr.categories?.performance?.auditRefs||[])
  .filter(ref=>ref.group!=="metrics");
 if(!refs.length){
  Object.keys(desktopAudits).forEach(id=>{
   const audit=desktopAudits[id];
   if(!audit||["notApplicable"].includes(audit.scoreDisplayMode)||audit.score==null)return;
   refs.push({id,group:audit.scoreDisplayMode==="metric"? "metrics":"load"});
  });
 }
 const seen=new Set();
 return refs.map(ref=>{
  if(ref.group==="metrics")return null;
  const audit=desktopAudits[ref.id];
  if(!audit||seen.has(ref.id))return null;
  seen.add(ref.id);
  if(["notApplicable","manual"].includes(audit.scoreDisplayMode))return null;
  if(audit.score==null)return null;
  const mobileAudit=mobileAudits[ref.id];
  const desktopStatus=audit.score>=1?"Fixed":"Needs attention";
  const mobileStatus=!mobileAudit||["notApplicable","informative","manual"].includes(mobileAudit.scoreDisplayMode)||mobileAudit.score==null
   ?"Manual review"
   :mobileAudit.score>=1?"Fixed":"Needs attention";
  const status=desktopStatus==="Needs attention"
   ?"Needs attention"
   :desktopStatus==="Fixed"?"Fixed":"Manual review";
  const detail=audit.description?.replace(/\[.*?\]\(.*?\)/g,"").replace(/\s+/g," ").trim()||"Review this Lighthouse recommendation.";
  return {
   title:audit.title||ref.id,
   detail,
   ids:[ref.id],
   status,
   mobileStatus,
   desktopStatus,
   mobileItems:recommendationSpecificItems(mobileAudits,[ref.id],detail),
   desktopItems:recommendationSpecificItems(desktopAudits,[ref.id],detail)
  };
 }).filter(Boolean);
}
let currentRecommendations=[];
let currentDeviceLhr=null;
let showFixedRecommendations=true;
const performanceMetricFilters=[
 {id:"all",label:"All metrics"},
 {id:"first-contentful-paint",label:"First Contentful Paint",keywords:["first contentful paint","first-contentful-paint","render"]},
 {id:"speed-index",label:"Speed Index",keywords:["speed index","speed-index"]},
 {id:"largest-contentful-paint",label:"Largest Contentful Paint",keywords:["largest contentful paint","largest-contentful-paint","lcp"]},
 {id:"total-blocking-time",label:"Total Blocking Time",keywords:["total blocking time","total-blocking-time","main thread","blocking"]},
 {id:"cumulative-layout-shift",label:"Cumulative Layout Shift",keywords:["cumulative layout shift","layout shift","cumulative-layout-shift","cls"]}
];
function renderRecommendationList(categoryKey=null){
  const statusClass=status=>status==="Fixed"?"fixed":status==="Needs attention"?"attention":"manual";
  const statusBadge=status=>`<span class="recommendation-status ${statusClass(status)}" title="${esc(status)}">${status==="Fixed"?"Complete":status==="Needs attention"?"Needs attention":"Manual"}</span>`;
  let selectedRecommendations=[];
  if(categoryKey&&categoryKey==="performance"){
   selectedRecommendations=currentRecommendations.map(item=>({...item,status:reportDevice==="mobile"?item.mobileStatus:item.desktopStatus}));
  }else if(categoryKey){
   const auditRefs=currentDeviceLhr?.categories?.[categoryKey]?.auditRefs||[];
   const audits=currentDeviceLhr?.audits||{};
   selectedRecommendations=auditRefs.map(ref=>{
    const audit=audits[ref.id];
    if(!audit)return null;
    const score=audit.score;
    const status=["notApplicable","informative","manual"].includes(audit.scoreDisplayMode)||score==null
     ?"Manual review"
     :score>=1?"Fixed":"Needs attention";
     const items=(Array.isArray(audit.details?.items)?audit.details.items:[])
      .map(detail=>detail.url||detail.source?.url||detail.node?.snippet||detail.filename||detail.label||detail.heading||detail.entity||detail.value||detail.displayValue)
      .filter(Boolean)
      .slice(0,6)
      .map(String);
     return {
      title:audit.title||ref.id,
      detail:audit.description?.replace(/\[.*?\]\(.*?\)/g,"").slice(0,300)||"Review this Lighthouse audit.",
      items:items.length?items:[audit.displayValue||"Review this Lighthouse audit."],
      status
     };
    }).filter(Boolean);
   }else{
    selectedRecommendations=currentRecommendations.map(item=>({...item,status:reportDevice==="mobile"?item.mobileStatus:item.desktopStatus}));
   }
  const categoryLabel=categoryKey?categoryKey==="best-practices"?"Best practices":categoryKey==="seo"?"SEO":categoryKey[0].toUpperCase()+categoryKey.slice(1):"All recommendations";
  const pendingRecommendations=selectedRecommendations.filter(item=>item.status==="Needs attention"||item.status==="Manual review");
  const fixedRecommendations=selectedRecommendations.filter(item=>item.status==="Fixed");
 const accordion=(item,index, fixed=false)=>{
   const items=reportDevice==="mobile"?item.mobileItems||item.items||[]:item.desktopItems||item.items||[];
   const isReRender=item.title==="Avoid larger re-renders of existing content";
   const isForcedReflow=item.title==="Avoid forced reflows";
   const explanation=isReRender
    ?`Re-rendering large elements can lead to an increased LCP score.`
    :isForcedReflow
     ?`Forced synchronous layout calculations happen when JavaScript code reads layout-related properties that may have changed recently.`
    :item.detail;
   const assessment=item.status==="Fixed"
    ?(isReRender?"No large content re-renders detected.":isForcedReflow?"No forced reflows detected.":"This check passed during the Lighthouse audit.")
    :item.status==="Manual review"
     ?(isReRender?"No large content re-renders detected.":"No Lighthouse audit result was available for this check.")
     :`This check needs attention. Review the affected items listed below.`;
   const advice=isReRender
    ?`Ensure content remains the same size if it re-renders.`
    :isForcedReflow
     ?`Avoid repeatedly reading layout properties.`
    :item.detail;
   const statusIcon=item.status==="Fixed"?"✓":item.status==="Needs attention"?"!":"i";
   const sourceRows=items.slice(0,6).map(value=>{
    return `<div class="recommendation-source-row"><span>${esc(value)}</span><strong>Review</strong></div>`;
   }).join("")||`<div class="recommendation-source-row"><span>No specific items detected</span><strong>—</strong></div>`;
   return `<details class="recommendation-accordion${fixed?" fixed-row":""}"${index===0&&!fixed?" open":""}>
    <summary>
     <span class="recommendation-status-icon ${fixed?"fixed":item.status==="Needs attention"?"attention":"manual"}">${statusIcon}</span>
     <span class="recommendation-title"><strong>${esc(item.title)}</strong></span>
     <span class="recommendation-status-label">${statusBadge(item.status)}</span>
     <span class="recommendation-chevron" aria-hidden="true"></span>
    </summary>
    <div class="recommendation-details">
     <div class="recommendation-info-table">
      <div><span><i>⚙</i> Explanation</span><p>${esc(explanation)}${isReRender?' <a href="https://www.debugbear.com/blog/content-rerenders-largest-contentful-paint" target="_blank" rel="noopener">Learn More</a>.':isForcedReflow?' <a href="https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing" target="_blank" rel="noopener">Learn More</a>.':""}</p></div>
      <div><span><i>▣</i> Assessment</span><p>${esc(assessment)}</p></div>
      <div><span><i>▱</i> Advice</span><p>${esc(advice)}</p></div>
     </div>
     <div class="recommendation-source-table">
      <div class="recommendation-source-head"><span>Source</span><strong>Impact</strong></div>
      ${sourceRows}
     </div>
    </div>
   </details>`;
 };
  $("recommendations").innerHTML=`<div class="recommendation-summary screenshot-summary" aria-label="Recommendation status summary"><button type="button" class="recommendation-fixed-toggle" id="toggleFixedRecommendations" aria-expanded="${showFixedRecommendations}">${showFixedRecommendations?"Hide":"Show"} Complete (${fixedRecommendations.length}) · ${fixedRecommendations.length}/${fixedRecommendations.length+pendingRecommendations.length} met</button>${categoryKey?'<button type="button" class="recommendation-clear" id="clearRecommendationFilter">Show all</button>':""}</div>`+
  `<div class="recommendation-filter-label">${esc(categoryLabel)}</div>`+
  `<div class="recommendation-table">`+
  (pendingRecommendations.length?pendingRecommendations.map((item,index)=>accordion(item,index,false)).join(""):`<div class="empty">No pending recommendations. All available checks passed or do not require action.</div>`)+
  (showFixedRecommendations&&fixedRecommendations.length?`<div class="fixed-recommendations-title">Complete</div>`+fixedRecommendations.map((item,index)=>accordion(item,index,true)).join(""):"")+
  `</div>`;
  $("clearRecommendationFilter")?.addEventListener("click",()=>renderRecommendationList());
  $("toggleFixedRecommendations")?.addEventListener("click",()=>{
   showFixedRecommendations=!showFixedRecommendations;
   renderRecommendationList(categoryKey);
  });
}
function renderCategoryRecommendations(categoryKey){
 const lhr=reportDevice==="mobile"
  ?(reportData?.mobile?.lighthouseResult||reportData?.desktop?.lighthouseResult||{})
  :(reportData?.desktop?.lighthouseResult||reportData?.mobile?.lighthouseResult||{});
 currentDeviceLhr=lhr;
 const audits=lhr.audits||{};
 const auditRefs=lhr.categories?.[categoryKey]?.auditRefs||[];
 const categoryLabel=categoryKey==="best-practices"?"Best practices":categoryKey==="seo"?"SEO":categoryKey==="accessibility"?"Accessibility":"Performance";
 $("recommendationsTitle").textContent=`${categoryLabel} recommendations`;
 $("recommendationsSubtitle").textContent="Lighthouse audit opportunities and diagnostics";

 $("recommendationCategoryTabs").innerHTML=[
  ["performance","Performance"],
  ["seo","SEO"],
  ["accessibility","Accessibility"],
  ["best-practices","Best practices"]
 ].map(([id,label])=>`<button type="button" role="tab" class="recommendation-category-tab ${categoryKey===id?"active":""}" data-recommendation-category="${id}" aria-selected="${categoryKey===id?"true":"false"}">${esc(label)}</button>`).join("");

 const metricTabs=$("performanceMetricTabs");
 metricTabs.hidden=categoryKey!== "performance";
 if(categoryKey==="performance"){
  metricTabs.innerHTML=performanceMetricFilters.map(metric=>`<button type="button" role="tab" class="recommendation-category-tab ${performanceMetricFilter===metric.id?"active":""}" data-performance-metric="${metric.id}" aria-selected="${performanceMetricFilter===metric.id?"true":"false"}">${esc(metric.label)}</button>`).join("");
 }

 const seenAuditIds=new Set();
 let recommendations=auditRefs.flatMap(ref=>{
  if(ref.group==="metrics"||seenAuditIds.has(ref.id))return [];
  seenAuditIds.add(ref.id);
  const audit=audits[ref.id];
  if(!audit||["notApplicable","informative","manual"].includes(audit.scoreDisplayMode)||!Number.isFinite(audit.score))return [];
  const title=String(audit.title||String(ref.id||"Lighthouse audit").replace(/-/g," ")).trim();
  const detail=String(audit.description||audit.explanation||"")
   .replace(/\[([^\]]+)\]\([^)]+\)/g,"$1")
   .replace(/\s+/g," ")
   .trim()||"Lighthouse did not provide a description for this audit.";
  const itemLabel=detail=>{
   if(typeof detail==="string")return detail.trim();
   if(!detail||typeof detail!=="object")return "";
   const candidates=[
    detail.url,detail.source?.url,detail.node?.snippet,detail.node?.nodeLabel,
    detail.node?.selector,detail.node?.path,detail.filename,detail.label,
    detail.heading,detail.entity,detail.value,detail.displayValue,detail.snippet
   ];
   return candidates.find(value=>typeof value==="string"&&value.trim())?.trim()||"";
  };
  const items=[...new Set((Array.isArray(audit.details?.items)?audit.details.items:[])
   .map(itemLabel).filter(Boolean))].slice(0,5);
  return [{
   id:ref.id,
   title,
   detail,
   status:audit.score>=1?"Passed":"Needs attention",
   items,
   group:ref.group||""
  }];
 });

 if(categoryKey==="performance"&&performanceMetricFilter!== "all"){
  const metric=performanceMetricFilters.find(item=>item.id===performanceMetricFilter);
  recommendations=recommendations.filter(item=>{
   const searchable=`${item.id} ${item.title} ${item.detail}`.toLowerCase();
   return metric.keywords.some(keyword=>searchable.includes(keyword));
  });
 }

 const passed=recommendations.filter(item=>item.status==="Passed");
 const pending=recommendations.filter(item=>item.status!== "Passed");
 if(!recommendations.length){
  $("recommendations").innerHTML=`<div class="recommendation-summary"><strong>0 need attention</strong><span>0 passed</span><span>0 checks shown</span></div><div class="empty">No recommendations are available for this category and device.</div>`;
  return;
 }
 $("recommendations").innerHTML=`
  <div class="recommendation-summary"><strong>${pending.length} need attention</strong><span>${passed.length} passed</span><span>${recommendations.length} checks shown</span></div>
  <div class="recommendation-table">
   ${pending.map((item,index)=>`<details class="recommendation-accordion"${index===0?" open":""}>
    <summary><span class="recommendation-status-icon attention">!</span><span class="recommendation-title"><strong>${esc(item.title)}</strong></span><span class="recommendation-chevron"></span></summary>
    <div class="recommendation-details"><div class="recommendation-info-table"><div><span><i>⚙</i> Recommendation</span><p>${esc(item.detail)}</p></div></div>
    ${item.items.length?`<div class="recommendation-source-table"><div class="recommendation-source-head"><span>Affected items</span><strong>Review</strong></div>${item.items.map(value=>`<div class="recommendation-source-row"><span>${esc(value)}</span><strong>Needs attention</strong></div>`).join("")}</div>`:'<div class="empty">Lighthouse did not provide item-level details for this audit.</div>'}</div>
   </details>`).join("")||'<div class="empty">No pending recommendations were found for this view.</div>'}
   ${passed.length?`<div class="fixed-recommendations-title">Passed checks</div>${passed.map(item=>`<details class="recommendation-accordion fixed-row"><summary><span class="recommendation-status-icon fixed">✓</span><span class="recommendation-title"><strong>${esc(item.title)}</strong></span><span class="recommendation-status-label"><span class="recommendation-status fixed">Passed</span></span><span class="recommendation-chevron"></span></summary><div class="recommendation-details"><div class="recommendation-info-table"><div><span><i>✓</i> Assessment</span><p>This Lighthouse check passed.</p></div></div></div></details>`).join("")}`:""}
  </div>`;
}
const cruxMetricDefinitions=[
 {id:"FIRST_CONTENTFUL_PAINT_MS",label:"First Contentful Paint",unit:"ms",thresholds:[1800,3000]},
 {id:"LARGEST_CONTENTFUL_PAINT_MS",label:"Largest Contentful Paint",unit:"ms",thresholds:[2500,4000]},
 {id:"CUMULATIVE_LAYOUT_SHIFT_SCORE",label:"Cumulative Layout Shift",unit:"score",thresholds:[0.1,0.25]},
 {id:"INTERACTION_TO_NEXT_PAINT",label:"Interaction to Next Paint",unit:"ms",thresholds:[200,500]},
 {id:"FIRST_INPUT_DELAY_MS",label:"First Input Delay",unit:"ms",thresholds:[100,300]},
 {id:"EXPERIMENTAL_TIME_TO_FIRST_BYTE",label:"Time to First Byte",unit:"ms",thresholds:[800,1800]}
];
function cruxCategoryName(category){
 return ({FAST:"Good",AVERAGE:"Needs improvement",SLOW:"Poor"})[category]||"";
}
function formatCruxValue(value,unit){
 if(!Number.isFinite(value))return "Not available";
 if(unit==="score")return value.toFixed(3).replace(/0+$/,"").replace(/\.$/,"");
 return value>=1000?`${(value/1000).toFixed(2)} s`:`${Math.round(value)} ms`;
}
function renderCruxData(data){
 const responses=[data?.desktop,data?.mobile].filter(Boolean);
 const hasMetrics=experience=>Object.keys(experience?.metrics||{}).length>0;
 const urlExperience=responses.map(response=>response.loadingExperience).find(hasMetrics);
 const experience=urlExperience||responses.map(response=>response.originLoadingExperience).find(hasMetrics);
 const isOrigin=!urlExperience&&Boolean(experience);
 const metrics=cruxMetricDefinitions.flatMap(definition=>{
  const metric=experience?.metrics?.[definition.id];
  if(!metric||!Number.isFinite(metric.percentile))return [];
  let category=cruxCategoryName(metric.category);
  if(!category){
   category=metric.percentile<=definition.thresholds[0]?"Good"
    :metric.percentile<=definition.thresholds[1]?"Needs improvement":"Poor";
  }
  return [{...definition,percentile:metric.percentile,category}];
 });
 const overallCategory=cruxCategoryName(experience?.overall_category);
 const categoryElement=$("cruxCategory");
 categoryElement.hidden=!overallCategory;
 categoryElement.textContent=overallCategory?`Overall: ${overallCategory}`:"";
 $("cruxDescription").textContent=experience
  ?`${isOrigin?"Site-wide data":"This URL"} · Real user experience over the last 28 days`
  :"Real-user data collected from Chrome over the last 28 days";
 if(!metrics.length){
  $("cruxMetrics").innerHTML='<div class="empty">CrUX field data is not available for this URL or origin. Chrome UX Report coverage is required to show real-user metrics.</div>';
  return;
 }
 const metricCards=metrics.map(metric=>{
  const statusClass=metric.category==="Good"?"good":metric.category==="Poor"?"poor":"average";
  return `<article class="crux-metric-card ${statusClass}"><div class="crux-metric-card-head"><h3>${esc(metric.label)}</h3><span class="crux-status ${statusClass}">${esc(metric.category)}</span></div><strong class="crux-metric-value">${esc(formatCruxValue(metric.percentile,metric.unit))}</strong></article>`;
 }).join("");
 $("cruxMetrics").innerHTML=`<p class="crux-summary">75th percentile: 3 out of 4 visits were this value or better. Lower is better for time and layout shift.</p><div class="crux-metric-grid">${metricCards}</div>`;
}
function renderReport(data){
 const lhr=data.mobile.lighthouseResult||{}, dlhr=data.desktop.lighthouseResult||{};
 const selected=reportDevice==="mobile"?(lhr||dlhr):(dlhr||lhr);
 $("summary").innerHTML=[
  ["performance","Performance",categoryScore(selected,"performance")],
  ["seo","SEO",categoryScore(selected,"seo")],
  ["accessibility","Accessibility",categoryScore(selected,"accessibility")],
  ["best-practices","Best practices",categoryScore(selected,"best-practices")]
 ].map(([key,label,value])=>`<div class="stat" data-category="${key}" role="button" tabindex="0" aria-label="View ${esc(label)} recommendations"><small>${label}</small><strong class="${value==null?"":scoreClass(value)}">${value==null?"—":value}</strong><span>${value==null?"Not available":scoreLabel(value)}</span></div>`).join("");
 $("summary").querySelectorAll("[data-category]").forEach(stat=>{
  stat.addEventListener("click",()=>activateRecommendationSection(stat.dataset.category));
  stat.addEventListener("keydown",event=>{
   if(!["Enter"," "].includes(event.key))return;
   event.preventDefault();
   activateRecommendationSection(stat.dataset.category);
  });
 });
 const metrics=[
  ["first-contentful-paint","First Contentful Paint"],
  ["speed-index","Speed Index"],
  ["largest-contentful-paint","Largest Contentful Paint"],
  ["total-blocking-time","Total Blocking Time"],
  ["cumulative-layout-shift","Cumulative Layout Shift"]
 ];
 const metricCards=[
  ...metrics.map(([id,label])=>{
   const audit=selected.audits?.[id];
   return {id,label,value:auditValue(audit),score:audit?.score==null?null:Math.round(audit.score*100),weight:lighthouseMetricWeights[id]??0};
  })
 ];
 const metricDescriptions={
  "first-contentful-paint":"Time until first text or image renders",
  "speed-index":"How quickly content is visually populated",
  "largest-contentful-paint":"Time until the main content renders",
  "total-blocking-time":"Time the main thread was blocked",
  "cumulative-layout-shift":"Unexpected movement of visible content"
 };
 $("performanceMetricCards").innerHTML=`
  <table class="metric-table">
   <thead><tr><th>Metric</th><th>Measured value</th><th>Status</th><th>Score</th><th>Weight</th></tr></thead>
   <tbody>${metricCards.map(metric=>{
    const status=metric.score==null?"Informational":metric.score>=90?"Good":metric.score>=50?"Needs improvement":"Poor";
    const statusClass=metric.score==null?"informational":scoreClass(metric.score);
    const metricId=metric.id||"";
    const description=metricDescriptions[metricId]||"Lighthouse lab metric";
    return `<tr>
     <td><div class="metric-name"><strong>${esc(metric.label)}</strong><small>${esc(description)}</small></div></td>
     <td><strong class="metric-value ${statusClass}">${esc(metric.value)}</strong></td>
     <td><span class="metric-status ${statusClass}"><i></i>${esc(status)}</span></td>
     <td>${metric.score==null?'<span class="metric-na">—</span>':`<div class="metric-score"><strong>${metric.score}</strong><span>/100</span><div class="metric-score-track"><i class="${statusClass}" style="width:${metric.score}%"></i></div></div>`}</td>
     <td>${metric.weight?`<span class="metric-weight-badge">${metric.weight}%</span>`:'<span class="metric-na">—</span>'}</td>
    </tr>`;
   }).join("")}</tbody>
  </table>`;
 $("results").classList.add("show");
 $("results").classList.add("score-only");
 if(!["desktop","mobile"].includes(reportDevice))reportDevice="desktop";
 if(simulatorData!==data)initSimulator(data);
 $("performanceMetricsLabel").textContent="Lighthouse lab results";
 renderCruxData(data);
 renderPageWeight(selected);
 currentRecommendations=buildRecommendations(lhr,dlhr);
 $("desktopReportBtn")?.classList.toggle("active",reportDevice==="desktop");
 $("mobileReportBtn")?.classList.toggle("active",reportDevice==="mobile");
 $("desktopReportBtn")?.setAttribute("aria-selected",reportDevice==="desktop"?"true":"false");
 $("mobileReportBtn")?.setAttribute("aria-selected",reportDevice==="mobile"?"true":"false");
 const recommendationsVisible=!($("recommendationsSection")?.hidden);
 if(recommendationsVisible)activateRecommendationSection(recommendationCategory);
 else activateReportSection(reportSection);
}
function activateReportSection(section){
 if(section==="recommendations"){
  activateRecommendationSection("performance");
  return;
 }
 reportSection=["performance","crux","page-weight","seo","accessibility","best-practices"].includes(section)?section:"performance";
 document.querySelectorAll(".sidebar-link").forEach(link=>{
  const active=link.dataset.sidebarSection===reportSection;
  link.classList.toggle("active",active);
  if(active)link.setAttribute("aria-current","page");else link.removeAttribute("aria-current");
 });
 const pageWeight=document.querySelector(".page-weight-section");
 const crux=document.querySelector(".crux-section");
 const recommendations=document.querySelector(".recommendations-section");
 const performance=document.querySelector(".performance-metrics");
 if(pageWeight)pageWeight.hidden=reportSection!=="page-weight";
 if(pageWeight)pageWeight.style.display=pageWeight.hidden?"none":"block";
 if(crux){crux.hidden=reportSection!=="crux";crux.style.display=crux.hidden?"none":"block";}
 if(performance){performance.hidden=reportSection!=="performance";performance.style.display=performance.hidden?"none":"block";}
 if(recommendations){recommendations.hidden=true;recommendations.style.display="none";}
 const target=reportSection==="page-weight"?pageWeight:reportSection==="crux"?crux:performance||$("summary");
 if(target)target.scrollIntoView({behavior:"smooth",block:"start"});
}
function activateRecommendationSection(category){
 recommendationCategory=["performance","seo","accessibility","best-practices"].includes(category)?category:"performance";
 if(recommendationCategory==="performance")performanceMetricFilter="all";
 const pageWeight=$("pageWeightContent")?.closest(".page-weight-section");
 const crux=document.querySelector(".crux-section");
 const performance=document.querySelector(".performance-metrics");
 const recommendations=$("recommendationsSection");
 if(pageWeight){pageWeight.hidden=true;pageWeight.style.display="none";}
 if(crux){crux.hidden=true;crux.style.display="none";}
 if(performance){performance.hidden=true;performance.style.display="none";}
 if(recommendations){
  recommendations.hidden=false;
  recommendations.removeAttribute("hidden");
  recommendations.style.display="block";
  renderCategoryRecommendations(recommendationCategory);
  window.requestAnimationFrame(()=>recommendations.scrollIntoView({behavior:"smooth",block:"start"}));
 }
 document.querySelectorAll(".sidebar-link").forEach(link=>{
  const active=link.dataset.sidebarSection==="recommendations";
  link.classList.toggle("active",active);
  if(active)link.setAttribute("aria-current","page");else link.removeAttribute("aria-current");
 });
}
async function fetchDevice(url,strategy){
 const params=new URLSearchParams({url,strategy,category:"performance",key:PAGESPEED_API_KEY});
 ["seo","accessibility","best-practices"].forEach(c=>params.append("category",c));
 const response=await fetch(`${API}?${params.toString()}`);
 const json=await response.json();
 if(!response.ok)throw new Error(json?.error?.message||`PageSpeed API request failed (${response.status})`);
 if(!json.lighthouseResult)throw new Error(`${strategy} audit returned no Lighthouse result.`);
 return json;
}
function getPastedUrls(){
const raw=$("urlList").value;
return raw.split(/[\r\n,]+/).map(value=>value.trim()).filter(Boolean);
}
function updateUrlCount(){
const count=new Set(getPastedUrls()).size;
$("urlCount").textContent=`${count} ${count===1?"URL":"URLs"} detected`;
}
$("urlList").addEventListener("input",updateUrlCount);
function batchScoreCard(label,value){
return `<div class="batch-score"><small>${esc(label)}</small><strong class="${value==null?"":scoreClass(value)}">${value==null?"—":value}</strong></div>`;
}
function batchCard(url,data,error){
if(error)return `<article class="batch-card batch-card-error"><span class="page-url" title="${esc(url)}">${esc(url)}</span><span class="batch-error">Audit failed</span></article>`;
return `<button type="button" class="batch-card view-report-btn" data-report-url="${encodeURIComponent(url)}"><span class="page-url" title="${esc(url)}">${esc(url)}</span><span class="page-arrow" aria-hidden="true">→</span></button>`;
} 
let pageReports=new Map();
$("batchResults")?.addEventListener("click",event=>{
 const button=event.target.closest(".view-report-btn");
 if(!button)return;
 const url=decodeURIComponent(button.dataset.reportUrl);
 const report=pageReports.get(url);
 if(!report)return;
 reportData=report;
 if($("selectedPageName"))$("selectedPageName").textContent=url;
 $("results").classList.remove("batch-only");
 if($("backToPagesBtn"))$("backToPagesBtn").hidden=false;
 renderReport(report);
 document.querySelectorAll(".view-report-btn").forEach(item=>item.classList.remove("active"));
 button.classList.add("active");
 $("summary").scrollIntoView({behavior:"smooth",block:"start"});
});
$("backToPagesBtn")?.addEventListener("click",()=>{
 $("results").classList.add("batch-only");
 $("backToPagesBtn").hidden=true;
 window.scrollTo({top:$("batchResults").getBoundingClientRect().top+window.scrollY-18,behavior:"smooth"});
});
$("startOverBtn")?.addEventListener("click",()=>{
 document.querySelector(".url-panel").hidden=false;
 $("results").classList.remove("show","batch-only");
 $("urlList").value="";
 $("urlCount").textContent="0 URLs detected";
 $("status").className="status";
 $("status").textContent="";
 reportData=null;
 pageReports=new Map();
 $("batchResults").innerHTML="";
 $("batchResultsCount").textContent="";
 if($("backToPagesBtn"))$("backToPagesBtn").hidden=true;
 window.scrollTo({top:0,behavior:"smooth"});
 $("urlList").focus();
});
$("runBtn").addEventListener("click",async()=>{
const urls=[];
const entries=getPastedUrls();
if(!entries.length){setStatus("Enter at least one website URL.",true);$("urlList").focus();return;}
for(const raw of entries){
 try{
  const url=new URL(raw);
  if(!["http:","https:"].includes(url.protocol))throw new Error();
  if(!urls.includes(url.href))urls.push(url.href);
 }catch(e){setStatus(`Invalid URL: ${raw}. Use URLs beginning with https:// or http://.`,true);$("urlList").focus();return;}
}
const btn=$("runBtn");btn.disabled=true;btn.textContent="Running audits…";$("results").classList.remove("show");
if($("backToPagesBtn"))$("backToPagesBtn").hidden=true;
$("batchResults").innerHTML=`<div class="batch-status">Starting ${urls.length} ${urls.length===1?"audit":"audits"}…</div>`;
setStatus(`Running Desktop and Mobile PageSpeed audits for ${urls.length} ${urls.length===1?"URL":"URLs"}.`);
const cards=[];
let latest=null;
 pageReports=new Map();
for(let index=0;index<urls.length;index++){
 const url=urls[index];
 try{
  setStatus(`Auditing ${index+1} of ${urls.length}: ${url}`);
  const [desktop,mobile]=await Promise.all([fetchDevice(url,"desktop"),fetchDevice(url,"mobile")]);
  latest={url,desktop,mobile,generatedAt:new Date()};
  reportData=latest;
  pageReports.set(url,latest);
  cards.push(batchCard(url,latest,""));
 }catch(err){cards.push(batchCard(url,null,err.message||"Unable to complete this PageSpeed audit."));}
 $("batchResults").innerHTML=cards.join("");
}
 $("batchResultsCount")?.replaceChildren(document.createTextNode(`${pageReports.size} ${pageReports.size===1?"report":"reports"} ready`));
if(latest){
 $("results").classList.add("show","batch-only");
 document.querySelector(".url-panel").hidden=true;
 $("results").classList.remove("batch-only");
 reportData=latest;
 if($("selectedPageName"))$("selectedPageName").textContent=latest.url;
 renderReport(latest);
 if($("backToPagesBtn"))$("backToPagesBtn").hidden=false;
 const firstButton=document.querySelector(".view-report-btn");
 if(firstButton)firstButton.classList.add("active");
 setStatus(`Analysis complete for ${urls.length} ${urls.length===1?"URL":"URLs"}.`);
}else{
 $("results").classList.add("show");
 setStatus("All audits failed. Review the errors below.",true);
}
btn.disabled=false;btn.textContent="Run analysis";
});
function pdfText(doc,text,x,y,maxWidth,lineHeight=5){
 const lines=doc.splitTextToSize(String(text||""),maxWidth);doc.text(lines,x,y);return y+lines.length*lineHeight;
}
const simulatorMetrics=[
 {id:"first-contentful-paint",label:"First Contentful Paint",weight:lighthouseMetricWeights["first-contentful-paint"]},
 {id:"speed-index",label:"Speed Index",weight:lighthouseMetricWeights["speed-index"]},
 {id:"largest-contentful-paint",label:"Largest Contentful Paint",weight:lighthouseMetricWeights["largest-contentful-paint"]},
 {id:"total-blocking-time",label:"Total Blocking Time",weight:lighthouseMetricWeights["total-blocking-time"]},
 {id:"cumulative-layout-shift",label:"Cumulative Layout Shift",weight:lighthouseMetricWeights["cumulative-layout-shift"]}
];
let simulatorDevice="desktop",simulatorValues={},simulatorBaseline={},simulatorData=null;
function initSimulator(data){
 simulatorData=data;
 simulatorDevice=reportDevice;
 simulatorValues={};
 simulatorBaseline={};
 ["desktop","mobile"].forEach(device=>{
  const lhr=data[device].lighthouseResult||{},audits=lhr.audits||{};
  simulatorValues[device]={};
  simulatorBaseline[device]={};
  simulatorMetrics.forEach(metric=>{
   const score=audits[metric.id]?.score;
   const value=score==null?null:Math.round(score*100);
   simulatorValues[device][metric.id]=value;
   simulatorBaseline[device][metric.id]=value;
  });
 });
 renderSimulator();
}
function renderSimulator(){
 const data=reportData?.[simulatorDevice];
 if(!data)return;
 const lhr=data.lighthouseResult||{},audits=lhr.audits||{};
 const base=categoryScore(lhr,"performance")??0;
 const current=simulatorValues[simulatorDevice]||{};
 $("simulatorMetrics").innerHTML=simulatorMetrics.map(metric=>{
  const audit=audits[metric.id],value=current[metric.id];
  if(value==null)return `<div class="metric-slider"><div class="metric-label"><strong>${esc(metric.label)} <small class="metric-weight">Weight: ${metric.weight}%</small></strong><span>Not available</span></div><div class="metric-impact">This metric has no lab score for the selected audit.</div></div>`;
  return `<div class="metric-slider"><div class="metric-label"><strong>${esc(metric.label)} <small class="metric-weight">Weight: ${metric.weight}%</small></strong><span><b id="value-${metric.id}">${value}</b>/100</span></div><input id="slider-${metric.id}" type="range" min="0" max="100" value="${value}" data-metric="${metric.id}" aria-label="${esc(metric.label)} score"><div class="metric-impact" id="impact-${metric.id}"></div></div>`;
 }).join("");
 simulatorMetrics.forEach(metric=>{
  const slider=$( `slider-${metric.id}`);
  if(!slider)return;
  slider.addEventListener("input",event=>{
   const value=Number(event.target.value);
   simulatorValues[simulatorDevice][metric.id]=value;
   $(`value-${metric.id}`).textContent=value;
   updateSimulatorEstimate();
  });
 });
 updateSimulatorEstimate();
}
function updateSimulatorEstimate(){
 const data=reportData?.[simulatorDevice];
 if(!data)return;
 const lhr=data.lighthouseResult||{};
 const base=categoryScore(lhr,"performance")??0;
 const values=simulatorValues[simulatorDevice]||{};
 const baseline=simulatorBaseline[simulatorDevice]||{};
 const active=simulatorMetrics.filter(metric=>values[metric.id]!=null&&metric.weight>0);
 const weightedDelta=active.reduce((sum,metric)=>sum+metric.weight*((values[metric.id]-baseline[metric.id])/100),0);
 const availableWeight=active.reduce((sum,metric)=>sum+metric.weight,0);
 const estimated=Math.max(0,Math.min(100,Math.round(base+(availableWeight?weightedDelta:0))));
 $("estimatedScore").textContent=estimated;
 $("estimatedScore").className=`${scoreClass(estimated)} estimated-score-value`;
 $("estimatedLabel").textContent=`Estimated ${simulatorDevice} performance score`;
 const impacts=active.map(metric=>{
  const current=values[metric.id];
  const improvement=Math.max(0,100-current);
  const delta=Math.round(improvement*(metric.weight/100));
  const slider=$( `impact-${metric.id}`);
  if(slider)slider.textContent=`Maximum modeled gain: +${delta} points`;
  return {label:metric.label,delta};
 }).sort((a,b)=>b.delta-a.delta);
 $("simulatorImpacts").innerHTML=`<div class="metric-label"><strong>Largest possible metric gains</strong></div>`+impacts.slice(0,5).map(item=>`<div class="impact-row"><span>${esc(item.label)}</span><strong>+${item.delta}</strong></div>`).join("");
}
$("resetSimulatorBtn")?.addEventListener("click",()=>{if(reportData)initSimulator(reportData);});
$("closeSimulatorBtn")?.addEventListener("click",()=>{$("simulatorPopup").close();});
$("simulatorPopup")?.addEventListener("click",event=>{
 if(event.target===event.currentTarget)event.currentTarget.close();
});
$("openSimulatorBtn")?.addEventListener("click",()=>{
 if(!reportData)return;
 simulatorDevice=reportDevice;
 renderSimulator();
 $("simulatorPopup").showModal();
});
$("performanceMetricTabs")?.addEventListener("click",event=>{
 const tab=event.target.closest("[data-performance-metric]");
 if(!tab)return;
 performanceMetricFilter=tab.dataset.performanceMetric;
 renderCategoryRecommendations("performance");
});
$("summary")?.addEventListener("click",event=>{
 const stat=event.target.closest("[data-category]");
 if(stat)activateRecommendationSection(stat.dataset.category);
});
$("summary")?.addEventListener("keydown",event=>{
 if(!["Enter"," "].includes(event.key))return;
 const stat=event.target.closest("[data-category]");
 if(!stat)return;
 event.preventDefault();
 activateRecommendationSection(stat.dataset.category);
});
$("recommendationCategoryTabs")?.addEventListener("click",event=>{
 const tab=event.target.closest("[data-recommendation-category]");
 if(!tab)return;
 activateRecommendationSection(tab.dataset.recommendationCategory);
});
$("mobileReportBtn")?.addEventListener("click",()=>{
 if(!reportData)return;reportDevice="mobile";
 $("mobileReportBtn").classList.add("active");$("desktopReportBtn").classList.remove("active");
 renderReport(reportData);
});
$("desktopReportBtn")?.addEventListener("click",()=>{
 if(!reportData)return;reportDevice="desktop";
 $("desktopReportBtn").classList.add("active");$("mobileReportBtn").classList.remove("active");
 renderReport(reportData);
});
document.querySelectorAll(".sidebar-link").forEach(link=>{
 link.addEventListener("click",()=>{
  if(!reportData)return;
  activateReportSection(link.dataset.sidebarSection);
 });
});
$("pdfBtn")?.addEventListener("click",()=>{
 if(!reportData)return;
 if(!window.jspdf){setStatus("PDF library could not be loaded. Check your internet connection and try again.",true);return;}
 const {jsPDF}=window.jspdf,doc=new jsPDF({unit:"mm",format:"a4"});
 const pageW=210,margin=16,width=pageW-margin*2;let y=19;
 const ds=categoryScore(reportData.desktop.lighthouseResult,"performance"),ms=categoryScore(reportData.mobile.lighthouseResult,"performance");
 const dseo=categoryScore(reportData.desktop.lighthouseResult,"seo"),mseo=categoryScore(reportData.mobile.lighthouseResult,"seo");
 const ink=[27,27,27],yellow=[255,221,47],white=[255,255,255],muted=[100,104,112],line=[228,230,232];
 const green=[22,129,106],amber=[183,121,31],red=[198,83,80],soft=[248,248,245];
 const rgb=c=>doc.setTextColor(c[0],c[1],c[2]);
 const fill=c=>doc.setFillColor(c[0],c[1],c[2]);
 const stroke=c=>doc.setDrawColor(c[0],c[1],c[2]);
 const scoreColor=n=>n==null?muted:n>=90?green:n>=50?amber:red;
 const addPage=()=>{doc.addPage();y=18;pageHeader();};
 const addPageIfNeeded=needed=>{if(y+needed>278)addPage();};
 const heading=(t)=>{addPageIfNeeded(12);doc.setFont("helvetica","bold");doc.setFontSize(14);rgb(ink);doc.text(t,margin,y);y+=8;};
 const paragraph=(t,size=9)=>{doc.setFont("helvetica","normal");doc.setFontSize(size);rgb(muted);y=pdfText(doc,t,margin,y,width,4.5)+3;};
 const pageHeader=()=>{fill(ink);doc.rect(0,0,pageW,12,"F");fill(yellow);doc.rect(0,0,5,12,"F");doc.setFont("helvetica","bold");doc.setFontSize(9);rgb(white);doc.text("PAGESPEED  /  PERFORMANCE REPORT",margin,8);};
 const pageFooter=()=>{const total=doc.getNumberOfPages();for(let i=1;i<=total;i++){doc.setPage(i);stroke(line);doc.line(margin,282,pageW-margin,282);doc.setFont("helvetica","normal");doc.setFontSize(8);rgb(muted);doc.text(`Generated ${reportData.generatedAt.toLocaleDateTimeString?.()||reportData.generatedAt.toLocaleString()}`,margin,288);doc.text(`${i} / ${total}`,pageW-margin,288,{align:"right"});}};
 const gauge=(x,y,score,label,color)=>{fill([238,239,236]);doc.circle(x,y,9,"F");fill(color);doc.circle(x,y,6,"F");fill(white);doc.circle(x,y,4.5,"F");doc.setFont("helvetica","bold");doc.setFontSize(15);rgb(color);doc.text(score==null?"—":String(score),x,y+1,{align:"center"});doc.setFontSize(8);rgb(ink);doc.text(label,x,y+13,{align:"center"});};
 const scoreCard=(x,w,title,value)=>{fill(soft);stroke(line);doc.roundedRect(x,y,w,31,3,3,"FD");doc.setFont("helvetica","bold");doc.setFontSize(8);rgb(muted);doc.text(title.toUpperCase(),x+4,y+7);gauge(x+15,y+19,value,title,scoreColor(value));doc.setFont("helvetica","normal");doc.setFontSize(7);rgb(scoreColor(value));doc.text(value==null?"Not available":value>=90?"GOOD":value>=50?"NEEDS IMPROVEMENT":"POOR",x+w-4,y+7,{align:"right"});};
 const bar=(label,value,x,y,w,labelWidth=35)=>{const c=scoreColor(value);doc.setFont("helvetica","normal");doc.setFontSize(8);rgb(ink);doc.text(label,x,y);fill([234,236,233]);doc.roundedRect(x+labelWidth,y-3,w-labelWidth-10,3,1.5,1.5,"F");fill(c);doc.roundedRect(x+labelWidth,y-3,(w-labelWidth-10)*(value||0)/100,3,1.5,1.5,"F");doc.setFont("helvetica","bold");doc.setFontSize(8);rgb(c);doc.text(value==null?"—":String(value),x+w,y,{align:"right"});};

 pageHeader();
 fill(ink);doc.roundedRect(margin,y,178,38,4,4,"F");fill(yellow);doc.rect(margin,y,4,38,"F");
 doc.setFont("helvetica","bold");doc.setFontSize(20);rgb(white);doc.text("Website Performance Report",margin+10,y+13);
 doc.setFont("helvetica","normal");doc.setFontSize(9);rgb([210,210,210]);y=pdfText(doc,reportData.url,margin+10,y+20,150,4.5);
 y+=31;
 heading("Score summary");
 scoreCard(margin,85,"Desktop Performance",ds);scoreCard(110,84,"Mobile Performance",ms);y+=38;
 scoreCard(margin,85,"Desktop SEO",dseo);scoreCard(110,84,"Mobile SEO",mseo);y+=38;

 heading("Category comparison");
 ["Desktop","Mobile"].forEach(device=>{
  const lhr=reportData[device.toLowerCase()].lighthouseResult;
  doc.setFont("helvetica","bold");doc.setFontSize(10);rgb(ink);doc.text(device,margin,y);y+=6;
  ["performance","accessibility","best-practices","seo"].forEach(key=>{
   bar(key.replace(/-/g," ").replace(/\b\w/g,c=>c.toUpperCase()),categoryScore(lhr,key),margin,y,width,52);y+=8;
  });
  y+=3;
 });

 heading("Core web metrics");
 ["Desktop","Mobile"].forEach(device=>{
  const d=reportData[device.toLowerCase()],l=d.lighthouseResult,score=categoryScore(l,"performance");
  addPageIfNeeded(35);doc.setFont("helvetica","bold");doc.setFontSize(11);rgb(ink);doc.text(`${device} audit`,margin,y);y+=7;
  [["first-contentful-paint","First Contentful Paint"],["speed-index","Speed Index"],["largest-contentful-paint","Largest Contentful Paint"],["total-blocking-time","Total Blocking Time"],["cumulative-layout-shift","Cumulative Layout Shift"]].forEach(([id,label])=>{
   const a=l.audits?.[id];if(!a)return;
   const metricScore=a.score==null?null:Math.round(a.score*100);addPageIfNeeded(12);
   fill(soft);doc.roundedRect(margin,y-5,width,10,2,2,"F");doc.setFont("helvetica","normal");doc.setFontSize(8);rgb(ink);doc.text(`${label} - Weight: ${lighthouseMetricWeights[id]??0}%`,margin+4,y+1);
   fill(scoreColor(metricScore));doc.roundedRect(pageW-margin-48,y-3,44,6,2,2,"F");doc.setFont("helvetica","bold");doc.setFontSize(8);rgb(white);doc.text(`${auditValue(a)}${metricScore==null?"":`  ·  ${metricScore}/100`}`,pageW-margin-26,y+1,{align:"center"});
   y+=12;
  });
  y+=5;
 });
  heading("Page weight breakdown");
  ["Desktop","Mobile"].forEach(device=>{
   const audit=reportData[device.toLowerCase()].lighthouseResult?.audits?.["network-requests"];
   const resources=(audit?.details?.items||[]).map(item=>({url:item.url||"",size:item.transferSize??item.resourceSize??0,priority:item.priority||"—"})).sort((a,b)=>b.size-a.size);
   addPageIfNeeded(resources.length?resources.length*9+12:12);
   doc.setFont("helvetica","bold");doc.setFontSize(10);rgb(ink);doc.text(`${device} resources`,margin,y);y+=7;
   if(!resources.length){paragraph("Network resource data unavailable.",8);return;}
   resources.forEach(resource=>{
    addPageIfNeeded(9);let host=resource.url;
    try{host=new URL(resource.url).host+"/"+new URL(resource.url).pathname.split("/").filter(Boolean).pop();}catch(e){}
    fill(soft);doc.roundedRect(margin,y-5,width,8,2,2,"F");
    doc.setFont("helvetica","normal");doc.setFontSize(7);rgb(ink);
    doc.text(host,margin+3,y,{maxWidth:width-68});
    doc.text(`${resource.priority}   ${formatBytes(resource.size)}`,pageW-margin-3,y,{align:"right"});
    y+=9;
   });
   y+=3;
  });
 paragraph("Source: Google PageSpeed Insights API. Lighthouse lab scores can vary between runs. Field data availability depends on Chrome UX Report coverage.",8);
 pageFooter();
 doc.save("website-performance-report.pdf");
});
