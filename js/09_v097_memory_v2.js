// ===== v0.9.7 patch: correction_memory v2 / safer memory scoring =====
(function(){
'use strict';
const VERSION_097='0.9.7.2';
const MEMORY_KEY_097='sprite_studio_correction_memory_v097';
const MEMORY_KEY_LEGACY='sprite_studio_correction_memory_v091';
const PREPROCESSOR_VERSION_097='v0.4-restored-stable+inner-recovery+guards+distance-scores+edge-texture+face-detail+eye-tuning+validated-eye-pair+label-review-export+zoom-preview+memory-v2+storage-safe+quality-version-sync';
function safeQS(id){ return typeof qs==='function' ? qs(id) : document.getElementById(id); }
function nowISO(){ try{return new Date().toISOString();}catch(e){return '';} }
function safeParse(raw){ try{return JSON.parse(raw);}catch(e){return null;} }

const __MEM_FALLBACK_097={};
function storageGet097(k){ try{return window.localStorage.getItem(k);}catch(e){return Object.prototype.hasOwnProperty.call(__MEM_FALLBACK_097,k)?__MEM_FALLBACK_097[k]:null;} }
function storageSet097(k,v){ try{window.localStorage.setItem(k,v);return true;}catch(e){__MEM_FALLBACK_097[k]=String(v);return false;} }
function storageRemove097(k){ try{window.localStorage.removeItem(k);return true;}catch(e){delete __MEM_FALLBACK_097[k];return false;} }

function clampV(v,min,max){ return Math.max(min,Math.min(max,v)); }
function sampleType(s){ return s && (s.feedback_type || s.type || 'unknown'); }
function sampleLabel(s){ return s && (s.final_label || s.auto_label || s.label || 'unknown'); }
function weightForSample097(s){
  const t=sampleType(s);
  if(t==='corrected_by_freehand') return 12;
  if(t==='rejected') return -12;
  if(t==='corrected_by_circle') return 4; // deprecated / weak
  if(t==='accepted') return 3;            // weak positive
  if(t==='skipped') return 0;
  return 0;
}
function normalizeSample097(s,idx=0){
  const t=sampleType(s);
  const label=sampleLabel(s);
  const oldId=s.id || ('legacy_'+idx);
  const isCircle=!!s.user_circle || t==='corrected_by_circle';
  const isFreehand=!!s.user_path || t==='corrected_by_freehand';
  return {
    ...s,
    id: oldId,
    schema_version:2,
    feedback_type:t,
    final_label:label,
    memory_weight:weightForSample097(s),
    source_ui:isFreehand?'freehand':(isCircle?'circle_deprecated':'button'),
    deprecated_circle:!!isCircle,
    created_at:s.created_at||null
  };
}
function summarizeMemory097(mem){
  const samples=(mem&&mem.samples)||[];
  const byType={}, byLabel={};
  for(const s of samples){
    const t=sampleType(s), l=sampleLabel(s);
    byType[t]=(byType[t]||0)+1; byLabel[l]=(byLabel[l]||0)+1;
  }
  return {sample_count:samples.length,by_type:byType,by_label:byLabel,pending:(state.pendingFeedback&&state.pendingFeedback.length)||0};
}
function normalizeMemory097(mem){
  const legacyVersion=(mem&&mem.version)||'legacy';
  const samples=((mem&&Array.isArray(mem.samples))?mem.samples:[]).map(normalizeSample097);
  return {version:VERSION_097,schema_version:2,preset:(mem&&mem.preset)||'front_fantasy_character',legacy_version:legacyVersion,key:MEMORY_KEY_097,migrated_from:mem&&mem.key?mem.key:null,samples};
}
function readMemory097(){
  const v2=safeParse(storageGet097(MEMORY_KEY_097)||'');
  if(v2&&Array.isArray(v2.samples)) return normalizeMemory097(v2);
  const legacy=safeParse(storageGet097(MEMORY_KEY_LEGACY)||'');
  return normalizeMemory097(legacy||{version:'empty',samples:[]});
}
function writeMemory097(mem){
  const out=normalizeMemory097(mem);
  out.saved_at=nowISO();
  storageSet097(MEMORY_KEY_097,JSON.stringify(out));
}
const prevLoadMemory=(typeof loadMemory==='function')?loadMemory:null;
const prevSaveMemory=(typeof saveMemory==='function')?saveMemory:null;
try{
  loadMemory=function(){ return readMemory097(); };
  saveMemory=function(mem){ return writeMemory097(mem); };
}catch(e){}
function featureSimilarity097(a,b){
  if(typeof featureSimilarity==='function') return featureSimilarity(a,b);
  if(!a||!b) return 0;
  let score=1;
  if(a.visual_zone&&b.visual_zone&&a.visual_zone!==b.visual_zone) score-=0.22;
  if(a.origin_zone&&b.origin_zone&&a.origin_zone!==b.origin_zone) score-=0.18;
  if(a.mean_lab&&b.mean_lab){
    const d=Math.hypot((a.mean_lab[0]-b.mean_lab[0])/100,(a.mean_lab[1]-b.mean_lab[1])/80,(a.mean_lab[2]-b.mean_lab[2])/80);
    score-=Math.min(.35,d*.55);
  }
  if(a.relative_center&&b.relative_center){
    const d=Math.hypot(a.relative_center[0]-b.relative_center[0],a.relative_center[1]-b.relative_center[1]);
    score-=Math.min(.35,d*.8);
  }
  return clampV(score,0,1);
}
function safeExtract097(r,img,lines){
  try{ return r.features || (typeof extractFeatures==='function'?extractFeatures(r,img,lines):null); }catch(e){ return r.features||null; }
}
function applyMemoryV2ToCandidates097(candidates,imgData,lines){
  const mem=readMemory097();
  const samples=(mem.samples||[]).filter(s=>s.features && weightForSample097(s)!==0);
  for(const r of candidates||[]){
    const f=safeExtract097(r,imgData,lines); if(!f) continue;
    let best=null,bestAbs=0,bestDelta=0,bestSim=0;
    for(const s of samples){
      const w=weightForSample097(s); if(!w) continue;
      const t=sampleType(s); let relevant=false;
      if(t==='rejected') relevant=(s.auto_label===r.label || s.final_label===r.label);
      else relevant=(sampleLabel(s)===r.label);
      if(!relevant) continue;
      const sim=featureSimilarity097(f,s.features);
      const threshold=t==='corrected_by_freehand'?0.70:0.76;
      if(sim<threshold) continue;
      const raw=w*(sim>=0.86?1:0.55);
      const delta=Math.round(raw);
      if(Math.abs(delta)>bestAbs){best=s;bestAbs=Math.abs(delta);bestDelta=delta;bestSim=sim;}
    }
    const base=Number(r.base_confidence||r.scores?.confidence||r.confidence||r.conf||0);
    if(best){
      r.memoryScore=clampV(bestDelta,-12,12);
      r.memoryScoreV2=r.memoryScore;
      r.memoryMatchV2={id:best.id,type:sampleType(best),label:sampleLabel(best),sim:+bestSim.toFixed(3),weight:weightForSample097(best)};
      r.feedbackStatus='memory_v2_applied';
      r.feedbackId=best.id||null;
      r.finalConfidence=clampV(Math.round(base+r.memoryScore),0,100);
      r.conf=r.confidence=r.finalConfidence;
      if(r.memoryScore<0) r.needsReview=true;
      else if(r.finalConfidence>=86 && !['hair_soft','detail_candidate','face_detail','unknown_soft','ambiguous_overlap'].includes(r.label)) r.needsReview=false;
    }else{
      r.memoryScoreV2=r.memoryScore||0;
    }
  }
}
if(typeof applyMemoryToCandidates==='function'){
  const prevApply=applyMemoryToCandidates;
  applyMemoryToCandidates=function(candidates,imgData,lines){
    try{ prevApply(candidates,imgData,lines); }catch(e){}
    applyMemoryV2ToCandidates097(candidates,imgData,lines);
  };
}
function makeSample097(region,type,extra={}){
  const img=state.result&&state.result.imgData, lines=state.result&&state.result.lines;
  const id='fb2_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
  const features=safeExtract097(region,img,lines);
  return normalizeSample097({
    id, schema_version:2, created_at:nowISO(), image_hash:(typeof imageHash==='function'&&img)?imageHash(img):null,
    part_id:region&&(region.mid||region.id), auto_label:region&&region.label,
    final_label:(type==='rejected'?'rejected':(region&&region.label)), feedback_type:type,
    confidence_before:region&&(region.confidence||region.conf||0), features, ...extra
  });
}
function queueSample097(sample){
  if(!sample || sample.feedback_type==='skipped') return null;
  if(state.pendingFeedback && Array.isArray(state.pendingFeedback)){
    state.pendingFeedback.push(sample);
    try{ clearTimeout(window.__memorySaveTimer097); }catch(e){}
    window.__memorySaveTimer097=setTimeout(()=>{
      const mem=readMemory097(); mem.samples.push(...state.pendingFeedback.splice(0)); writeMemory097(mem);
      const log=safeQS('log'); if(log) log.textContent += `\nMemory v2 saved: ${mem.samples.length}`;
    },90);
  }else{
    const mem=readMemory097(); mem.samples.push(sample); writeMemory097(mem);
  }
  return sample;
}
if(typeof saveFeedback==='function'){
  saveFeedback=function(region,type,ellipse=null){
    if(type==='skipped'){ if(region) region.feedbackStatus='skipped'; return null; }
    if(!state.result||!state.result.pre||state.result.pre.score<60){ const log=safeQS('log'); if(log) log.textContent='pre.score < 60 のため補正記憶は保存しません。'; return null; }
    const extra=ellipse?{user_circle:{cx:+ellipse.cx.toFixed(2),cy:+ellipse.cy.toFixed(2),rx:+ellipse.rx.toFixed(2),ry:+ellipse.ry.toFixed(2)},deprecated_circle:true}:{};
    const sample=makeSample097(region,type,extra);
    queueSample097(sample);
    if(region){ region.feedbackStatus=type; region.feedbackId=sample.id; }
    return sample;
  };
}
// Wrap freehand save if the original helper exists. It is a function declaration in the previous patch.
try{
  if(typeof ss_saveFeedbackFreehand==='function'){
    const prevFree=ss_saveFeedbackFreehand;
    ss_saveFeedbackFreehand=function(region,path){
      if(!state.result||!state.result.pre||state.result.pre.score<60){ const log=safeQS('log'); if(log) log.textContent='pre.score < 60 のため補正記憶は保存しません。'; return null; }
      let features=null;
      try{ features=ss_extractFeaturesFreehand(region,state.result.imgData,state.result.lines,ss_simplifyPath(path,80)); }catch(e){ features=safeExtract097(region,state.result.imgData,state.result.lines); }
      const simple=(typeof ss_simplifyPath==='function'?ss_simplifyPath(path,80):path||[]);
      const sample=makeSample097(region,'corrected_by_freehand',{user_path:simple.map(p=>({x:+p.x.toFixed(1),y:+p.y.toFixed(1)})),features});
      queueSample097(sample);
      if(region){ region.feedbackStatus='corrected_by_freehand'; region.feedbackId=sample.id; }
      return sample;
    };
  }
}catch(e){}
if(typeof metadata092==='function'){
  const prevMeta=metadata092;
  metadata092=function(){
    const m=prevMeta();
    m.version=VERSION_097;
    if(m.quality_v096) m.quality_v096.version=VERSION_097;
    if(m.export_v096) m.export_v096.memory_v2=true;
    m.preprocessor=m.preprocessor||{}; m.preprocessor.version=PREPROCESSOR_VERSION_097;
    const mem=readMemory097();
    m.memory_v097={...summarizeMemory097(mem),key:MEMORY_KEY_097,schema_version:2,weights:{accepted:3,rejected:-12,corrected_by_circle:4,corrected_by_freehand:12},legacy_key:MEMORY_KEY_LEGACY};
    if(Array.isArray(m.parts)){
      for(const p of m.parts){
        const live=(state.result?.candidates||[]).find(r=>(r.mid||r.id)===p.id);
        if(live){ p.memory_score_v2=live.memoryScoreV2||0; p.memory_match_v2=live.memoryMatchV2||null; p.feedback_status=live.feedbackStatus||p.feedback_status; p.feedback_id=live.feedbackId||p.feedback_id; }
      }
    }
    return m;
  };
}
if(typeof logResult==='function'){
  const prevLog=logResult;
  logResult=function(){
    prevLog();
    const log=safeQS('log'); if(!log) return;
    const sum=summarizeMemory097(readMemory097());
    log.textContent += `\n[v0.9.7 memory v2]\nsamples=${sum.sample_count} pending=${sum.pending} types=${Object.entries(sum.by_type).map(([k,v])=>k+':'+v).join(', ')||'-'}\n`;
  };
}
try{
  document.title='Sprite Studio Region Viewer v0.9.7.2';
  const h1=document.querySelector('h1'); if(h1) h1.textContent='Sprite Studio Region Viewer v0.9.7.2';
  const sub=document.querySelector('.sub'); if(sub) sub.textContent='AIなし / Canvas + localStorageのみ。v0.9.7.2: correction_memory v2・品質レポート版数整合・補正履歴JSONを追加。';
  const json=safeQS('json'); if(json) json.onclick=()=>{if(!state.result)return;downloadBlob(JSON.stringify(metadata092(),null,2),'sprite_region_metadata_v0_9_7_2.json','application/json');};
  const summary=safeQS('summary'); if(summary) summary.onclick=()=>{let cards=[canvases.original,canvases.cutout,canvases.analysis,canvases.masks,canvases.lines,canvases.cluster,canvases.before,canvases.after,canvases.cand,canvases.unknownBefore,canvases.unknownAfter,canvases.part].filter(Boolean);let titles=['Original','Background Removed / Checker','Analysis','Masks','Base Lines','Color Cluster','Region Before','Region After','Candidates','Unknown Before','Unknown After','Part'];let W=960,H=1850,c=document.createElement('canvas');c.width=W;c.height=H;let ctx=c.getContext('2d');ctx.fillStyle='#0f1520';ctx.fillRect(0,0,W,H);ctx.fillStyle='#e8eef8';ctx.font='26px sans-serif';ctx.fillText('Sprite Studio Region Viewer v0.9.7.2 Summary',20,36);let cellW=290,cellH=320;for(let i=0;i<cards.length;i++){let cc=cards[i],col=i%3,row=(i/3)|0,x=20+col*(cellW+20),y=60+row*(cellH+35);ctx.fillStyle='#202a3a';ctx.fillRect(x,y,cellW,32);ctx.fillStyle='#e8eef8';ctx.font='16px sans-serif';ctx.fillText(titles[i],x+8,y+22);ctx.drawImage(cc,x,y+36,cellW,Math.min(cellH-38,cellW*cc.height/cc.width));}c.toBlob(b=>downloadBlob(b,'sprite_region_summary_v0_9_7_2.png','image/png'));};
  const memBtn=safeQS('memoryJson'); if(memBtn) memBtn.onclick=()=>downloadBlob(JSON.stringify(readMemory097(),null,2),'correction_memory_v0_9_7_2.json','application/json');
  const clear=safeQS('clearMemory'); if(clear) clear.onclick=()=>{if(confirm('補正履歴 v2 / legacy を削除しますか？')){storageRemove097(MEMORY_KEY_097);storageRemove097(MEMORY_KEY_LEGACY);const log=safeQS('log'); if(log) log.textContent='補正履歴を削除しました。';}};
}catch(e){ console.warn('v0.9.7 setup failed',e); }
})();
