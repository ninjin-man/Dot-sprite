// ===== v1.0 patch: game-group masks + 32x32 pixel sprite output =====
(function(){
'use strict';
const VERSION_V10='1.0-pixel-output';
const PREPROCESSOR_VERSION_V10='sprite-studio-pixel-pipeline-v1.0';
function safeQS(id){ return typeof qs==='function' ? qs(id) : document.getElementById(id); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function rgbHex(c){ c=c||[0,0,0]; return '#'+[c[0]||0,c[1]||0,c[2]||0].map(x=>Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,'0')).join(''); }
function box(r){ return {x:r.minx??0,y:r.miny??0,w:r.w??0,h:r.h??0,maxx:r.maxx??((r.minx??0)+(r.w??0)-1),maxy:r.maxy??((r.miny??0)+(r.h??0)-1),cx:r.cx??((r.minx??0)+(r.w??0)/2),cy:r.cy??((r.miny??0)+(r.h??0)/2)}; }
function area(r){ return r.area || Math.max(1,(r.w||0)*(r.h||0)); }
function labelName(label){ return (typeof LABELS!=='undefined' && LABELS[label]) || label; }
function ensureCanvasesV10(){
  if(typeof canvases!=='undefined'){
    canvases.sprite32=safeQS('cSprite32');
    canvases.spritePreview=safeQS('cSpritePreview');
    canvases.gameGroups=safeQS('cGameGroups');
  }
}
function addUiV10(){
  const bar=document.querySelector('.bar');
  if(bar && !safeQS('saveSprite32')){
    const b=document.createElement('button');
    b.id='saveSprite32'; b.textContent='32x32 PNG保存';
    b.onclick=()=>saveSprite32V10();
    bar.appendChild(b);
  }
  if(bar && !safeQS('savePixelProject')){
    const b=document.createElement('button');
    b.id='savePixelProject'; b.textContent='ドット絵JSON保存';
    b.onclick=()=>savePixelProjectV10();
    bar.appendChild(b);
  }
  const grid=document.querySelector('.grid');
  if(grid && !safeQS('cSprite32')){
    const result=Array.from(grid.children).find(x=>x.textContent&&x.textContent.includes('Result Log'));
    const wrap=document.createElement('div');
    wrap.className='card wide';
    wrap.innerHTML='<h2>12. 32x32 Sprite Output <span id="spriteStatus" class="pill">not run</span></h2><div class="spriteOutputGrid"><div><div class="mini">実寸32x32</div><canvas id="cSprite32" style="image-rendering:pixelated;width:128px;height:128px"></canvas></div><div><div class="mini">拡大プレビュー</div><canvas id="cSpritePreview" style="image-rendering:pixelated"></canvas></div><div><div class="mini">ゲーム用グループ</div><canvas id="cGameGroups"></canvas></div></div><div id="pixelLog" class="log" style="max-height:220px"></div>';
    if(result) grid.insertBefore(wrap,result); else grid.appendChild(wrap);
    ensureCanvasesV10();
  }
}
function gameGroupForLabelV10(label){
  if(['front_hair','side_hair_left','side_hair_right','back_hair','hair_highlight','hair_shadow','hair_accessory','hair_ornament','hair','hair_soft','hair_tip'].includes(label)) return 'hair';
  if(['face','eyes','ears','neck','chest_skin','skin','skin_candidate'].includes(label)) return 'face';
  if(['upper_cloth','lower_cloth','torso_core','pelvis','collar','cloth','sheer','transparent_cloth','cloth_detail','cloth_shadow','cloth_highlight'].includes(label)) return 'body';
  if(['sleeve_left','sleeve_right','transparent_cloth','sheer','sheer_soft'].includes(label)) return 'sleeve';
  if(['hands','hand_candidate','arms_skin','left_arm','right_arm'].includes(label)) return 'arm_hand';
  if(['left_leg','right_leg','leg','legs'].includes(label)) return 'leg';
  if(['shoe','shoes','left_foot','right_foot','shoe_ornament'].includes(label)) return 'shoe';
  if(['cloth_ornament','body_ornament','ornament','ornament_detail','ornament_candidate','necklace','belt'].includes(label)) return 'ornament';
  return 'ignore';
}
const GROUP_ORDER_V10=['hair','sleeve','leg','body','face','arm_hand','shoe','ornament'];
const GROUP_JA_V10={hair:'髪',face:'顔',body:'胴体',sleeve:'袖',arm_hand:'腕/手',leg:'脚',shoe:'靴',ornament:'装飾',ignore:'無視'};
const GROUP_COLOR_V10={
  hair:[176,156,190,255],
  face:[236,184,166,255],
  body:[18,75,58,255],
  sleeve:[174,216,190,185],
  arm_hand:[230,176,154,255],
  leg:[28,82,67,255],
  shoe:[42,68,58,255],
  ornament:[218,166,78,255],
  ignore:[0,0,0,0]
};
function getCharacterBboxV10(res){
  const pre=res.pre||{}, lines=res.lines||{};
  const b=pre.bbox || lines.bbox || {minx:0,miny:0,maxx:(res.imgData?.width||state.w||1)-1,maxy:(res.imgData?.height||state.h||1)-1,w:res.imgData?.width||state.w||1,h:res.imgData?.height||state.h||1};
  return {
    minx:Math.max(0,Math.floor(b.minx??0)),
    miny:Math.max(0,Math.floor(b.miny??0)),
    maxx:Math.min((res.imgData?.width||state.w||1)-1,Math.ceil(b.maxx??((b.minx??0)+(b.w??1)-1))),
    maxy:Math.min((res.imgData?.height||state.h||1)-1,Math.ceil(b.maxy??((b.miny??0)+(b.h??1)-1))),
    w:Math.max(1,Math.round(b.w??((b.maxx??0)-(b.minx??0)+1))),
    h:Math.max(1,Math.round(b.h??((b.maxy??0)-(b.miny??0)+1)))
  };
}
function buildGameGroupsV10(res){
  const w=res.imgData.width,h=res.imgData.height;
  const groups={};
  [...GROUP_ORDER_V10,'ignore'].forEach(g=>groups[g]={name:g,label:GROUP_JA_V10[g],mask:new Uint8Array(w*h),area:0,parts:[],color:[0,0,0],colorWeight:0});
  for(const r of res.candidates||[]){
    let g=gameGroupForLabelV10(r.label||'unknown');
    // If pixel output said omit, keep it out except important groups.
    if(r.pixelAction0914==='omit' && !['face','hair','body','leg','shoe'].includes(g)) g='ignore';
    groups[g].parts.push({id:r.mid||r.id,label:r.label,area:r.area||0,bbox:[r.minx,r.miny,r.w,r.h]});
    const color=r.mean||GROUP_COLOR_V10[g]||[0,0,0];
    const wt=Math.max(1,r.area||1);
    groups[g].color[0]+=color[0]*wt; groups[g].color[1]+=color[1]*wt; groups[g].color[2]+=color[2]*wt; groups[g].colorWeight+=wt;
    if(Array.isArray(r.pixels)){
      for(const p of r.pixels){
        if(p>=0 && p<w*h){ groups[g].mask[p]=1; }
      }
    }else{
      const b=box(r);
      for(let yy=Math.max(0,b.y);yy<=Math.min(h-1,b.maxy);yy++)for(let xx=Math.max(0,b.x);xx<=Math.min(w-1,b.maxx);xx++) groups[g].mask[yy*w+xx]=1;
    }
  }
  for(const g of Object.values(groups)){
    let n=0; for(let i=0;i<g.mask.length;i++) if(g.mask[i]) n++;
    g.area=n;
    if(g.colorWeight>0) g.color=g.color.map(x=>Math.round(x/g.colorWeight)); else g.color=(GROUP_COLOR_V10[g.name]||[120,120,120]).slice(0,3);
  }
  return groups;
}
function sampleGroupAtV10(groups, sx, sy, w, h){
  const ix=clamp(Math.round(sx),0,w-1), iy=clamp(Math.round(sy),0,h-1);
  const p=iy*w+ix;
  // Priority is important: face/ornament should draw over body, sleeve behind body.
  const priority=['ornament','face','arm_hand','shoe','body','leg','hair','sleeve'];
  for(const g of priority){ if(groups[g]&&groups[g].mask[p]) return g; }
  return null;
}
function setPx(data,x,y,rgba){
  if(x<0||y<0||x>=32||y>=32) return;
  const i=(y*32+x)*4;
  data[i]=rgba[0]; data[i+1]=rgba[1]; data[i+2]=rgba[2]; data[i+3]=rgba[3]??255;
}
function blendPx(data,x,y,rgba,alpha=1){
  if(x<0||y<0||x>=32||y>=32) return;
  const i=(y*32+x)*4, a=clamp(alpha,0,1);
  data[i]=Math.round(data[i]*(1-a)+rgba[0]*a);
  data[i+1]=Math.round(data[i+1]*(1-a)+rgba[1]*a);
  data[i+2]=Math.round(data[i+2]*(1-a)+rgba[2]*a);
  data[i+3]=Math.max(data[i+3],rgba[3]??255);
}
function quantizeColorV10(rgb, group){
  const p={
    hair:[[102,82,120],[148,128,164],[205,190,214],[72,56,92]],
    face:[[234,184,166],[255,210,190],[180,126,115]],
    body:[[9,32,28],[20,76,58],[42,112,88],[218,166,78]],
    sleeve:[[156,205,181],[198,228,208],[104,155,135]],
    arm_hand:[[232,176,154],[255,206,186],[172,118,108]],
    leg:[[17,48,43],[29,82,68],[55,118,96]],
    shoe:[[28,54,46],[63,88,68],[218,166,78]],
    ornament:[[218,166,78],[246,210,114],[95,60,36]]
  }[group] || [[rgb[0],rgb[1],rgb[2]]];
  let best=p[0], bd=1e9;
  for(const c of p){ const d=(rgb[0]-c[0])**2+(rgb[1]-c[1])**2+(rgb[2]-c[2])**2; if(d<bd){bd=d;best=c;} }
  return [best[0],best[1],best[2],255];
}
function renderSprite32V10(res){
  const img=res.imgData, w=img.width, h=img.height, groups=res.gameGroupsV10||buildGameGroupsV10(res);
  const bbox=getCharacterBboxV10(res);
  // Game sprite uses a uniform scale. Keep character around 30px high to reserve ground/shadow.
  const targetH=30;
  const scale=targetH/Math.max(1,bbox.h);
  const outW=Math.max(1,bbox.w*scale), ox=Math.round((32-outW)/2), oy=1;
  const id=new ImageData(32,32), data=id.data;
  for(let i=0;i<data.length;i+=4){ data[i]=0; data[i+1]=0; data[i+2]=0; data[i+3]=0; }
  // Base image-driven raster.
  for(let y=0;y<32;y++){
    for(let x=0;x<32;x++){
      const sx=bbox.minx+(x-ox+0.5)/scale;
      const sy=bbox.miny+(y-oy+0.5)/scale;
      if(sx<bbox.minx||sx>bbox.maxx||sy<bbox.miny||sy>bbox.maxy) continue;
      const g=sampleGroupAtV10(groups,sx,sy,w,h);
      if(!g || g==='ignore') continue;
      const si=(Math.round(sy)*w+Math.round(sx))*4;
      let rgb=[img.data[si],img.data[si+1],img.data[si+2]];
      let col=quantizeColorV10(rgb,g);
      if(g==='sleeve') col[3]=210;
      setPx(data,x,y,col);
    }
  }
  // Silhouette helpers for readability. These are not AI; they are game-sprite rules.
  const lines=res.lines||{};
  const cx=16;
  const faceY=Math.round(oy+(Math.max(bbox.miny,lines.faceTop||bbox.miny+60)-bbox.miny)*scale);
  const faceBotY=Math.round(oy+((lines.faceBot||bbox.miny+150)-bbox.miny)*scale);
  const shoulderY=Math.round(oy+((lines.shoulder||bbox.miny+160)-bbox.miny)*scale);
  const waistY=Math.round(oy+((lines.waist||bbox.miny+270)-bbox.miny)*scale);
  const ankleY=Math.round(oy+((lines.ankle||bbox.miny+445)-bbox.miny)*scale);
  // Hair mass: keep elf-like big lavender silhouette.
  for(let yy=Math.max(0,faceY-4); yy<=Math.min(23,shoulderY+6); yy++){
    const t=(yy-(faceY-4))/Math.max(1,(shoulderY+8)-(faceY-4));
    const hw=Math.round(5+5*t);
    if(yy<faceBotY+2){
      blendPx(data,cx-hw,yy,[120,96,145,255],0.65);
      blendPx(data,cx+hw,yy,[120,96,145,255],0.65);
    }else{
      blendPx(data,cx-hw-1,yy,[120,96,145,255],0.55);
      blendPx(data,cx+hw+1,yy,[120,96,145,255],0.55);
    }
  }
  // Face patch.
  for(let yy=faceY; yy<=Math.min(faceBotY,12); yy++){
    for(let xx=cx-3; xx<=cx+3; xx++) blendPx(data,xx,yy,[234,184,166,255],0.82);
  }
  // Elf ears.
  setPx(data,cx-6,Math.max(4,faceY+2),[230,165,140,255]);
  setPx(data,cx+6,Math.max(4,faceY+2),[230,165,140,255]);
  setPx(data,cx-7,Math.max(5,faceY+3),[222,148,126,255]);
  setPx(data,cx+7,Math.max(5,faceY+3),[222,148,126,255]);
  // Eyes.
  setPx(data,cx-2,Math.max(5,faceY+3),[32,78,58,255]);
  setPx(data,cx+2,Math.max(5,faceY+3),[32,78,58,255]);
  // Torso green and gold accents.
  for(let yy=Math.max(11,shoulderY); yy<=Math.min(21,waistY+2); yy++){
    const half=yy<16?3:4;
    for(let xx=cx-half; xx<=cx+half; xx++) blendPx(data,xx,yy,[9,46,36,255],0.9);
  }
  setPx(data,cx,Math.max(12,shoulderY+1),[222,174,82,255]);
  setPx(data,cx,Math.max(15,shoulderY+4),[222,174,82,255]);
  setPx(data,cx-1,Math.max(17,shoulderY+6),[222,174,82,255]);
  setPx(data,cx+1,Math.max(17,shoulderY+6),[222,174,82,255]);
  // Sheer sleeves as large pale shapes.
  for(let yy=Math.max(13,shoulderY+1); yy<=Math.min(24,waistY+7); yy++){
    const spread=Math.round((yy-shoulderY)*0.35);
    blendPx(data,cx-6-spread,yy,[170,215,190,210],0.85);
    blendPx(data,cx+6+spread,yy,[170,215,190,210],0.85);
    if(yy%2===0){
      blendPx(data,cx-7-spread,yy,[198,228,208,180],0.65);
      blendPx(data,cx+7+spread,yy,[198,228,208,180],0.65);
    }
  }
  // Slim legs.
  for(let yy=21; yy<=29; yy++){
    setPx(data,cx-2,yy,[18,68,55,255]);
    setPx(data,cx-1,yy,[23,84,68,255]);
    setPx(data,cx+1,yy,[18,68,55,255]);
    setPx(data,cx+2,yy,[23,84,68,255]);
  }
  // Shoes and gold edges.
  setPx(data,cx-3,30,[30,56,48,255]); setPx(data,cx-2,30,[218,166,78,255]); setPx(data,cx-1,30,[30,56,48,255]);
  setPx(data,cx+1,30,[30,56,48,255]); setPx(data,cx+2,30,[218,166,78,255]); setPx(data,cx+3,30,[30,56,48,255]);
  // Ground shadow.
  for(let xx=10;xx<=22;xx++) blendPx(data,xx,31,[80,82,92,160],0.55);
  res.sprite32V10={imageData:id,bbox,scale,offset:{x:ox,y:oy},groups:groupSummaryV10(groups),status:'ok'};
  return id;
}
function groupSummaryV10(groups){
  const out={};
  for(const [k,g] of Object.entries(groups)){
    out[k]={label:g.label,area:g.area,parts:g.parts.length,color:rgbHex(g.color)};
  }
  return out;
}
function drawSpriteV10(){
  if(!state.result) return;
  ensureCanvasesV10();
  const id=renderSprite32V10(state.result);
  if(canvases.sprite32){
    fitCanvas(canvases.sprite32,32,32);
    const ctx=canvases.sprite32.getContext('2d');
    ctx.clearRect(0,0,32,32);
    ctx.putImageData(id,0,0);
  }
  if(canvases.spritePreview){
    fitCanvas(canvases.spritePreview,320,320);
    const ctx=canvases.spritePreview.getContext('2d');
    ctx.imageSmoothingEnabled=false;
    ctx.clearRect(0,0,320,320);
    ctx.fillStyle='#0b111b'; ctx.fillRect(0,0,320,320);
    // grid
    ctx.strokeStyle='rgba(255,255,255,.08)'; ctx.lineWidth=1;
    for(let i=0;i<=32;i++){ ctx.beginPath(); ctx.moveTo(i*10,0); ctx.lineTo(i*10,320); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,i*10); ctx.lineTo(320,i*10); ctx.stroke(); }
    const tmp=document.createElement('canvas'); tmp.width=32; tmp.height=32; tmp.getContext('2d').putImageData(id,0,0);
    ctx.drawImage(tmp,0,0,320,320);
  }
  if(canvases.gameGroups){
    drawGameGroupsV10(canvases.gameGroups,state.result);
  }
  const st=safeQS('spriteStatus'); if(st) st.textContent='32x32 ready';
  const log=safeQS('pixelLog'); if(log){
    const s=state.result.sprite32V10;
    const groups=Object.entries(s.groups).filter(([k,v])=>v.area>0&&k!=='ignore').map(([k,v])=>`- ${v.label}: area=${v.area} parts=${v.parts} color=${v.color}`).join('\n');
    log.textContent=`Sprite v1.0\nstatus=${s.status}\nscale=${s.scale.toFixed(4)} offset=${s.offset.x},${s.offset.y}\n\nGame groups:\n${groups}\n\n出力: 32x32 PNG保存 ボタンで sprite_front_32_v1_0.png を保存します。`;
  }
}
function drawGameGroupsV10(c,res){
  const img=res.imgData, groups=res.gameGroupsV10||buildGameGroupsV10(res);
  const bbox=getCharacterBboxV10(res);
  fitCanvas(c,img.width,img.height);
  const ctx=c.getContext('2d');
  ctx.clearRect(0,0,c.width,c.height);
  ctx.drawImage(imageDataToCanvas(img),0,0);
  ctx.globalAlpha=.62;
  const overlay=ctx.createImageData(img.width,img.height);
  for(let p=0;p<img.width*img.height;p++){
    let g=null;
    for(const name of GROUP_ORDER_V10){ if(groups[name].mask[p]){ g=name; break; } }
    if(!g) continue;
    const col=GROUP_COLOR_V10[g]||[255,255,255,160];
    const i=p*4; overlay.data[i]=col[0]; overlay.data[i+1]=col[1]; overlay.data[i+2]=col[2]; overlay.data[i+3]=g==='sleeve'?105:135;
  }
  ctx.putImageData(overlay,0,0);
  ctx.globalAlpha=1;
  ctx.strokeStyle='#58dc8c'; ctx.lineWidth=2; ctx.strokeRect(bbox.minx,bbox.miny,bbox.w,bbox.h);
  ctx.font='12px sans-serif';
  let y=16;
  for(const name of GROUP_ORDER_V10){
    const g=groups[name]; if(!g.area) continue;
    const col=GROUP_COLOR_V10[name]; ctx.fillStyle=`rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.fillRect(6,y-10,10,10); ctx.fillStyle='#fff'; ctx.fillText(`${g.label} ${g.parts.length}`,20,y); y+=15;
  }
}
function saveSprite32V10(){
  if(!state.result){ alert('先に解析してください。'); return; }
  const id=state.result.sprite32V10?.imageData || renderSprite32V10(state.result);
  const c=document.createElement('canvas'); c.width=32; c.height=32;
  c.getContext('2d').putImageData(id,0,0);
  c.toBlob(b=>downloadBlob(b,'sprite_front_32_v1_0.png','image/png'));
}
function pixelProjectV10(){
  if(!state.result) return {version:VERSION_V10,status:'no_result'};
  if(!state.result.sprite32V10) renderSprite32V10(state.result);
  const s=state.result.sprite32V10;
  return {
    version:VERSION_V10,
    type:'game_sprite_32_pipeline',
    output:{sprite:'sprite_front_32_v1_0.png',size:{w:32,h:32}},
    source:{w:state.w,h:state.h,bbox:s.bbox,scale:s.scale,offset:s.offset},
    groups:s.groups,
    rule:{
      final_goal:'game pixel sprite, not perfect AI-style part decomposition',
      target_height_px:30,
      scale:'uniform',
      groups:GROUP_ORDER_V10,
      priority:['hair silhouette','elf ears','face eyes','green body','sheer sleeves','slim legs','gold accents','shoes']
    }
  };
}
function savePixelProjectV10(){
  if(!state.result){ alert('先に解析してください。'); return; }
  downloadBlob(JSON.stringify(pixelProjectV10(),null,2),'sprite_pixel_project_v1_0.json','application/json');
}
const oldAnalyze=(typeof analyze==='function')?analyze:null;
async function analyzeV10(){
  if(!oldAnalyze) return;
  await oldAnalyze();
  try{
    const res=state.result;
    if(!res) return;
    res.gameGroupsV10=buildGameGroupsV10(res);
    drawSpriteV10();
    if(typeof renderAll==='function') renderAll();
    drawSpriteV10();
  }catch(e){ console.warn('v1.0 pixel output failed',e); }
}
window.analyzeV10=analyzeV10;
window.renderSprite32V10=renderSprite32V10;
window.saveSprite32V10=saveSprite32V10;
try{
  addUiV10();
  ensureCanvasesV10();
  analyze=analyzeV10;
  const run=safeQS('run'); if(run) run.onclick=analyzeV10;
  const merge=safeQS('mergeMode'); if(merge) merge.onchange=analyzeV10;
  ['adjFace','adjShoulder','adjWaist','adjCrotch','adjAnkle'].forEach(id=>{
    const el=safeQS(id); if(el) el.oninput=()=>{ state.lineAdjust={face:+(safeQS('adjFace')?.value||0),shoulder:+(safeQS('adjShoulder')?.value||0),waist:+(safeQS('adjWaist')?.value||0),crotch:+(safeQS('adjCrotch')?.value||0),ankle:+(safeQS('adjAnkle')?.value||0)}; analyzeV10(); };
  });
  document.title='Sprite Studio Pixel Pipeline v1.0';
  const h1=document.querySelector('h1'); if(h1) h1.textContent='Sprite Studio Pixel Pipeline v1.0';
  const sub=document.querySelector('.sub'); if(sub) sub.textContent='AIなし / Canvas + localStorageのみ。v1.0: ゲーム用8グループへ整理し、32x32ドット絵PNGを出力します。';
  const footer=document.querySelector('.footer'); if(footer) footer.textContent='v1.0はドット絵出力版です。解析結果を髪/顔/胴体/袖/腕手/脚/靴/装飾にまとめ、32x32正面スプライトを生成します。';
}catch(e){ console.warn('v1.0 setup failed',e); }
if(typeof metadata092==='function'){
  const oldMeta=metadata092;
  metadata092=function(){
    const m=oldMeta();
    m.version=VERSION_V10;
    m.preprocessor=m.preprocessor||{};
    m.preprocessor.version=PREPROCESSOR_VERSION_V10;
    m.pixel_sprite_v10=state.result?.sprite32V10 ? {
      status:state.result.sprite32V10.status,
      bbox:state.result.sprite32V10.bbox,
      scale:state.result.sprite32V10.scale,
      offset:state.result.sprite32V10.offset,
      groups:state.result.sprite32V10.groups
    } : {status:'not_run'};
    return m;
  };
}
if(typeof logResult==='function'){
  const oldLog=logResult;
  logResult=function(){
    oldLog();
    const log=safeQS('log');
    if(log && state.result?.sprite32V10){
      const s=state.result.sprite32V10;
      log.textContent+=`\n[v1.0 Pixel Output]\n32x32 ready / scale=${s.scale.toFixed(4)} / offset=${s.offset.x},${s.offset.y}\n保存: 32x32 PNG保存\n`;
    }
  };
}
})();
