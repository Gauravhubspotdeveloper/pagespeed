const API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const PAGESPEED_API_KEY = "AIzaSyB7QAAoFRC-scjd_nQf5k4tjyUs2IdSOow";
let reportData = null;

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const scoreClass = n => n >= 90 ? "good" : n >= 50 ? "average" : "poor";
const scoreLabel = n => n >= 90 ? "Good" : n >= 50 ? "Needs improvement" : "Poor";
const fmt = (v, unit="") => v == null ? "Not available" : `${v}${unit}`;
function setStatus(message, error=false){const s=$("status");s.textContent=message;s.className="status show"+(error?" error":"");}
function categoryScore(lhr, key){const v=lhr?.categories?.[key]?.score;return v==null?null:Math.round(v*100);}
function auditValue(a){if(!a)return "Not available";if(a.displayValue)return a.displayValue;if(a.numericValue!=null)return `${Math.round(a.numericValue*100)/100}${a.numericUnit||""}`;return a.scoreDisplayMode==="binary"?(a.score===1?"Pass":"Fail"):"Not available";}
function metricBlock(lhr, id, label){
 const a=lhr?.audits?.[id]; if(!a)return "";
 const value=a.displayValue||auditValue(a); const sc=a.score==null?null:Math.round(a.score*100);
 const thresholds={"first-contentful-paint":"Good ≤ 1.8s · Poor > 3.0s","speed-index":"Good ≤ 3.4s · Poor > 5.8s","largest-contentful-paint":"Good ≤ 2.5s · Poor > 4.0s","total-blocking-time":"Good ≤ 200ms · Poor > 600ms","cumulative-layout-shift":"Good ≤ 0.1 · Poor > 0.25","interaction-to-next-paint":"Good ≤ 200ms · Poor > 500ms"};
 return `<div class="metric"><span>${esc(label)}<small class="metric-detail">${esc(thresholds[id]||"Lab metric")}</small></span><span class="${sc==null?"":scoreClass(sc)}">${esc(value)}${sc==null?"":` · ${sc}/100`}</span></div>`;
}
function renderDevice(name, data){
 const lhr=data.lighthouseResult||{}, score=categoryScore(lhr,"performance"), audits=lhr.audits||{};
 const metrics=[
  ["first-contentful-paint","First Contentful Paint"],
  ["speed-index","Speed Index"],
  ["largest-contentful-paint","Largest Contentful Paint"],
  ["total-blocking-time","Total Blocking Time"],
  ["cumulative-layout-shift","Cumulative Layout Shift"],
  ["interaction-to-next-paint","Interaction to Next Paint"]
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
function auditItems(lhr, ids, emptyText){
 const audits=lhr?.audits||{};
 const items=ids.map(id=>audits[id]).filter(a=>a && a.score!==null && a.score<1 && a.scoreDisplayMode!=="notApplicable");
 if(!items.length)return `<div class="empty">${emptyText}</div>`;
 return items.slice(0,10).map(a=>{
  const savings=a.details?.overallSavingsMs?`${Math.round(a.details.overallSavingsMs)} ms estimated potential reduction`:(a.details?.overallSavingsBytes?`${Math.round(a.details.overallSavingsBytes/1024)} KiB estimated transfer savings`:"Review implementation impact");
  return `<div class="item"><strong>${esc(a.title)}</strong><p>${esc(a.description?.replace(/\[.*?\]\(.*?\)/g,"").slice(0,260)||"Review this audit for implementation guidance.")}</p>${a.displayValue?`<span class="tag">${esc(a.displayValue)}</span> `:""}<span class="tag">${esc(savings)}</span></div>`;
 }).join("");
}
function renderReport(data){
 const lhr=data.mobile.lighthouseResult||{}, dlhr=data.desktop.lighthouseResult||{};
 const dscore=categoryScore(dlhr,"performance"), mscore=categoryScore(lhr,"performance");
 $("summary").innerHTML=[
  ["Desktop score",dscore],["Mobile score",mscore],
  ["Desktop SEO",categoryScore(dlhr,"seo")],["Mobile SEO",categoryScore(lhr,"seo")]
 ].map(([label,value])=>`<div class="stat"><small>${label}</small><strong class="${value==null?"":scoreClass(value)}">${value==null?"—":value}</strong><span>${value==null?"Not available":scoreLabel(value)}</span></div>`).join("");
 renderDevice("Desktop",data.desktop);renderDevice("Mobile",data.mobile);
 const overview=(deviceName,lhr)=>{const categories=["performance","accessibility","best-practices","seo"].map(key=>{const score=categoryScore(lhr,key);return `<div class="category-row"><strong>${key.replace(/-/g," ").replace(/\b\w/g,c=>c.toUpperCase())}</strong><div class="mini-bar"><i style="width:${score??0}%;background:${score==null?"#98a2b3":score>=90?"#16865b":score>=50?"#d69e2e":"#c0392b"}"></i></div><strong class="${score==null?"":scoreClass(score)}">${score??"—"}</strong></div>`;}).join("");const settings=lhr.environment||{},config=lhr.configSettings||{};return `<div><h3>${deviceName} audit</h3><div class="detail-grid three"><div class="detail-item"><small>Network</small><strong>${esc(settings.networkType||"Lighthouse lab")}</strong></div><div class="detail-item"><small>Device emulation</small><strong>${esc(config.screenEmulation?.mobile?"Mobile":"Desktop")}</strong></div><div class="detail-item"><small>CPU slowdown</small><strong>${esc(settings.hostedMode?"Hosted mode":"Lab simulation")}</strong></div></div><div class="section"><h3>Category scores</h3>${categories}</div></div>`;};
 const mobileEnvironment=lhr.environment?.host||"Mobile emulation",desktopEnvironment=dlhr.environment?.host||"Desktop emulation";
 $("overviewContent").innerHTML=`<div class="detail-grid"><div class="detail-item"><small>Analyzed URL</small><strong>${esc(data.url)}</strong></div><div class="detail-item"><small>Generated</small><strong>${esc(data.generatedAt.toLocaleString())}</strong></div><div class="detail-item"><small>Mobile runtime</small><strong>${esc(lhr.userAgent?.split(" ").slice(-1)[0]||"Lighthouse")}</strong></div><div class="detail-item"><small>Lighthouse</small><strong>${esc(lhr.lighthouseVersion||"Current API version")}</strong></div></div><div class="twocol" style="margin-top:18px"><div>${overview("Mobile",lhr)}</div><div>${overview("Desktop",dlhr)}</div></div>`;
 const mobileAudits=lhr.audits||{}, desktopAudits=dlhr.audits||{};
 const oppIds=[...new Set([...Object.keys(mobileAudits),...Object.keys(desktopAudits)])].filter(id=>{
  const a=mobileAudits[id]||desktopAudits[id];return a?.details?.type==="opportunity" && a.score!==null && a.score<1;
 });
 $("opportunities").innerHTML=auditItems(lhr,oppIds,"No scored opportunities were returned for the Mobile audit.")+
 `<div class="note">Mobile opportunities are shown first because mobile performance is often more constrained. Review Desktop results as well.</div>`;
 const diagIds=Object.keys(mobileAudits).filter(id=>mobileAudits[id]?.details?.type==="table" && mobileAudits[id]?.score!==null && mobileAudits[id]?.score<1);
 $("diagnostics").innerHTML=auditItems(lhr,diagIds,"No notable diagnostics were returned for the Mobile audit.");
 const recs=[];
 const add=(id,title,detail)=>{if(mobileAudits[id]?.score!==null&&mobileAudits[id]?.score<1)recs.push({title,detail,display:mobileAudits[id].displayValue||""});};
 add("largest-contentful-paint","Improve Largest Contentful Paint","Prioritize the main above-the-fold element. Optimize the hero image, preload the correct asset, reduce server response time, and avoid late-loading overlays.");
 add("render-blocking-resources","Reduce render-blocking resources","Defer non-critical JavaScript, inline only essential critical CSS, and load non-critical styles asynchronously where appropriate.");
 add("uses-optimized-images","Optimize image delivery","Serve appropriately sized next-generation images and compress large assets without visibly reducing quality.");
 add("uses-text-compression","Enable text compression","Ensure HTML, CSS, JavaScript, and other text assets are served with Brotli or Gzip compression.");
 add("unused-javascript","Reduce unused JavaScript","Remove unnecessary scripts and load third-party tools only when needed.");
 add("uses-responsive-images","Serve responsive images","Use responsive image sources and avoid downloading desktop-sized assets on mobile.");
 add("dom-size-insight","Reduce excessive DOM size","Simplify deeply nested markup and remove redundant elements where possible.");
 add("total-blocking-time","Reduce main-thread blocking","Break up long tasks, defer non-essential scripts, and reduce the amount of JavaScript executed during initial load.");
 if(!recs.length)recs.push({title:"Review the audit details",detail:"No specific failed priority audits were identified. Review the metrics and diagnostics above, then validate changes with another run.",display:""});
 $("recommendations").innerHTML=recs.slice(0,8).map((r,i)=>`<div class="item"><strong>${i+1}. ${esc(r.title)}</strong><p>${esc(r.detail)}</p>${r.display?`<span class="tag">${esc(r.display)}</span>`:""}</div>`).join("");
 $("results").classList.add("show");
 initSimulator(data);
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
$("batchResults").addEventListener("click",event=>{
 const button=event.target.closest(".view-report-btn");
 if(!button)return;
 const url=decodeURIComponent(button.dataset.reportUrl);
 const report=pageReports.get(url);
 if(!report)return;
 reportData=report;
 $("selectedPageName").textContent=url;
 $("results").classList.remove("batch-only");
 $("backToPagesBtn").hidden=false;
 renderReport(report);
 document.querySelectorAll(".view-report-btn").forEach(item=>item.classList.remove("active"));
 button.classList.add("active");
 $("summary").scrollIntoView({behavior:"smooth",block:"start"});
});
$("backToPagesBtn").addEventListener("click",()=>{
 $("results").classList.add("batch-only");
 $("backToPagesBtn").hidden=true;
 window.scrollTo({top:$("batchResults").getBoundingClientRect().top+window.scrollY-18,behavior:"smooth"});
});
$("startOverBtn").addEventListener("click",()=>{
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
 $("selectedPageName").textContent="Select a URL";
 $("backToPagesBtn").hidden=true;
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
$("backToPagesBtn").hidden=true;
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
 $("batchResultsCount").textContent=`${pageReports.size} ${pageReports.size===1?"report":"reports"} ready`;
if(latest){
 $("results").classList.add("show","batch-only");
 document.querySelector(".url-panel").hidden=true;
 $("results").classList.remove("batch-only");
 reportData=latest;
 $("selectedPageName").textContent=latest.url;
 renderReport(latest);
 $("backToPagesBtn").hidden=false;
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
 {id:"first-contentful-paint",label:"First Contentful Paint",weight:10},
 {id:"speed-index",label:"Speed Index",weight:10},
 {id:"largest-contentful-paint",label:"Largest Contentful Paint",weight:25},
 {id:"total-blocking-time",label:"Total Blocking Time",weight:30},
 {id:"cumulative-layout-shift",label:"Cumulative Layout Shift",weight:25},
 {id:"interaction-to-next-paint",label:"Interaction to Next Paint",weight:0}
];
let simulatorDevice="desktop",simulatorValues={},simulatorBaseline={};
function initSimulator(data){
 simulatorDevice="desktop";
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
 $("desktopSimulatorBtn").classList.add("active");
 $("mobileSimulatorBtn").classList.remove("active");
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
  if(value==null)return `<div class="metric-slider"><div class="metric-label"><strong>${esc(metric.label)}</strong><span>Not available</span></div><div class="metric-impact">This metric has no lab score for the selected audit.</div></div>`;
  return `<div class="metric-slider"><div class="metric-label"><strong>${esc(metric.label)}</strong><span><b id="value-${metric.id}">${value}</b>/100</span></div><input id="slider-${metric.id}" type="range" min="0" max="100" value="${value}" data-metric="${metric.id}" aria-label="${esc(metric.label)} score"><div class="metric-impact" id="impact-${metric.id}"></div></div>`;
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
$("desktopSimulatorBtn").addEventListener("click",()=>{simulatorDevice="desktop";$("desktopSimulatorBtn").classList.add("active");$("mobileSimulatorBtn").classList.remove("active");renderSimulator();});
$("mobileSimulatorBtn").addEventListener("click",()=>{simulatorDevice="mobile";$("mobileSimulatorBtn").classList.add("active");$("desktopSimulatorBtn").classList.remove("active");renderSimulator();});
$("resetSimulatorBtn").addEventListener("click",()=>{if(reportData)initSimulator(reportData);});
$("pdfBtn").addEventListener("click",()=>{
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
 doc.setFontSize(8);rgb([170,170,170]);doc.text(`Generated ${reportData.generatedAt.toLocaleString()}`,margin+10,y+5);
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
  [["first-contentful-paint","First Contentful Paint"],["speed-index","Speed Index"],["largest-contentful-paint","Largest Contentful Paint"],["total-blocking-time","Total Blocking Time"],["cumulative-layout-shift","Cumulative Layout Shift"],["interaction-to-next-paint","Interaction to Next Paint"]].forEach(([id,label])=>{
   const a=l.audits?.[id];if(!a)return;
   const metricScore=a.score==null?null:Math.round(a.score*100);addPageIfNeeded(12);
   fill(soft);doc.roundedRect(margin,y-5,width,10,2,2,"F");doc.setFont("helvetica","normal");doc.setFontSize(8);rgb(ink);doc.text(label,margin+4,y+1);
   fill(scoreColor(metricScore));doc.roundedRect(pageW-margin-48,y-3,44,6,2,2,"F");doc.setFont("helvetica","bold");doc.setFontSize(8);rgb(white);doc.text(`${auditValue(a)}${metricScore==null?"":`  ·  ${metricScore}/100`}`,pageW-margin-26,y+1,{align:"center"});
   y+=12;
  });
  y+=5;
 });
 heading("Mobile opportunities and diagnostics");
 const audits=reportData.mobile.lighthouseResult.audits;
 const opportunities=Object.values(audits).filter(a=>a?.details?.type==="opportunity"&&a.score!==null&&a.score<1).slice(0,8);
 if(!opportunities.length)paragraph("No scored opportunities were returned for the Mobile audit.");
 opportunities.forEach((a,i)=>{addPageIfNeeded(22);fill(i%2===0?soft:white);doc.roundedRect(margin,y-5,width,17,2,2,"F");doc.setFont("helvetica","bold");doc.setFontSize(9);rgb(ink);const titleLines=doc.splitTextToSize(a.title||"Opportunity",width-50);doc.text(titleLines,margin+4,y+1);doc.setFont("helvetica","normal");doc.setFontSize(8);rgb(muted);const detail=a.displayValue||a.description?.replace(/\[.*?\]\(.*?\)/g,"").slice(0,120)||"Review audit details.";doc.text(detail,pageW-margin-4,y+1,{align:"right",maxWidth:42});y+=20;});
 heading("Recommended priorities");
 [
 ["Improve Largest Contentful Paint","Optimize the hero element, preload the correct image, and reduce late-loading content."],
 ["Reduce render-blocking resources","Defer non-critical JavaScript and minimize critical rendering dependencies."],
 ["Optimize images","Use responsive dimensions, modern formats, and appropriate compression."],
 ["Reduce JavaScript execution","Remove unused code and delay non-essential third-party scripts."]
 ].forEach(([t,d],i)=>{addPageIfNeeded(16);fill(yellow);doc.circle(margin+3,y,3,"F");doc.setFont("helvetica","bold");doc.setFontSize(8);rgb(ink);doc.text(String(i+1),margin+3,y+1,{align:"center"});doc.setFontSize(9);doc.text(t,margin+10,y+1);doc.setFont("helvetica","normal");doc.setFontSize(8);rgb(muted);doc.text(d,margin+10,y+6,{maxWidth:width-10});y+=15;});
 paragraph("Source: Google PageSpeed Insights API. Lighthouse lab scores can vary between runs. Field data availability depends on Chrome UX Report coverage.",8);
 pageFooter();
 doc.save("website-performance-report.pdf");
});