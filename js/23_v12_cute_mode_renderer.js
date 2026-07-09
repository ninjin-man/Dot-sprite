// ===== v1.2 patch: cute-mode renderer for 32x32 sprite output =====
(function(){
'use strict';
const VERSION_V12='1.2-cute-mode-renderer';
function qs2(id){ return typeof qs==='function' ? qs(id) : document.getElementById(id); }
function fit(c,w,h){ c.width=w; c.height=h; }
function px(data,x,y,rgba){ if(x<0||y<0||x>=32||y>=32)return; const i=(y*32+x)*4; data[i]=rgba[0]; data[i+1]=rgba[1]; data[i+2]=rgba[2]; data[i+3]=rgba[3] ?? 255; }
function blend(data,x,y,rgba,a=.7){ if(x<0||y<0||x>=32||y>=32)return; const i=(y*32+x)*4; const aa=Math.max(0,Math.min(1,a)); data[i]=Math.round(data[i]*(1-aa)+rgba[0]*aa); data[i+1]=Math.round(data[i+1]*(1-aa)+rgba[1]*aa); data[i+2]=Math.round(data[i+2]*(1-aa)+rgba[2]*aa); data[i+3]=Math.max(data[i+3],rgba[3] ?? 255); }
function rect(data,x,y,w,h,rgba){ for(let yy=y;yy<y+h;yy++) for(let xx=x;xx<x+w;xx++) px(data,xx,yy,rgba); }
function fillEllipse(data,cx,cy,rx,ry,rgba){ for(let y=Math.floor(cy-ry);y<=Math.ceil(cy+ry);y++) for(let x=Math.floor(cx-rx);x<=Math.ceil(cx+rx);x++){ const dx=(x-cx)/Math.max(1,rx), dy=(y-cy)/Math.max(1,ry); if(dx*dx+dy*dy<=1) px(data,x,y,rgba); } }
function fillTri(data,p1,p2,p3,rgba){
  const minx=Math.floor(Math.min(p1[0],p2[0],p3[0])), maxx=Math.ceil(Math.max(p1[0],p2[0],p3[0]));
  const miny=Math.floor(Math.min(p1[1],p2[1],p3[1])), maxy=Math.ceil(Math.max(p1[1],p2[1],p3[1]));
  function sign(p,a,b){ return (p[0]-b[0])*(a[1]-b[1]) - (a[0]-b[0])*(p[1]-b[1]); }
  for(let y=miny;y<=maxy;y++) for(let x=minx;x<=maxx;x++){
    const p=[x+.5,y+.5], d1=sign(p,p1,p2), d2=sign(p,p2,p3), d3=sign(p,p3,p1);
    const hasNeg=(d1<0)||(d2<0)||(d3<0), hasPos=(d1>0)||(d2>0)||(d3>0);
    if(!(hasNeg&&hasPos)) px(data,x,y,rgba);
  }
}
function line(data,x0,y0,x1,y1,rgba){ const dx=Math.abs(x1-x0),dy=Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1; let err=dx-dy,x=x0,y=y0; for(let i=0;i<96;i++){ px(data,x,y,rgba); if(x===x1&&y===y1)break; const e2=2*err; if(e2>-dy){ err-=dy; x+=sx; } if(e2<dx){ err+=dx; y+=sy; } } }
function outlineSoft(data){
  const src=new Uint8ClampedArray(data); const outline=[61,48,76,255];
  for(let y=1;y<31;y++) for(let x=1;x<31;x++){
    const i=(y*32+x)*4; if(src[i+3]) continue;
    let near=0;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy) continue;
      if(src[((y+dy)*32+(x+dx))*4+3]) near++;
    }
    if(near>=2){ data[i]=outline[0]; data[i+1]=outline[1]; data[i+2]=outline[2]; data[i+3]=180; }
  }
}
function getTraitsV12(res){
  const groups=res?.sprite32V10?.groups || {};
  const hairArea=groups.hair?.area || 0;
  const sleeveArea=groups.sleeve?.area || 0;
  const ornamentParts=groups.ornament?.parts || 0;
  return {
    longHair: hairArea > 2500,
    bigSleeve: sleeveArea > 400,
    ornate: ornamentParts > 0,
    elf: true,
    bodyHue: 'green'
  };
}
function readCutePaletteV12(res){
  const g=res?.sprite32V10?.groups || {};
  const parseHex=(h,fb)=>{ if(!h||h[0]!=='#') return fb; const n=parseInt(h.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255,255]; };
  const hairBase=parseHex(g.hair?.color,[155,142,188,255]);
  const bodyBase=parseHex(g.body?.color,[25,88,70,255]);
  // Cute palette: lighter, softer, more contrast in face/hair.
  return {
    outline:[64,52,80,255],
    hairDark:[108,94,141,255],
    hairMid:[hairBase[0],hairBase[1],Math.min(255,hairBase[2]+10),255],
    hairLight:[220,210,234,255],
    skin:[242,195,180,255],
    skinLight:[255,224,209,255],
    blush:[232,156,168,255],
    eyeDark:[91,72,104,255],
    eyeMid:[164,120,128,255],
    eyeHi:[248,244,248,255],
    bodyDark:[9,46,38,255],
    body:[Math.max(0,bodyBase[0]-6),Math.max(40,bodyBase[1]),Math.max(30,bodyBase[2]-6),255],
    bodyLight:[52,126,99,255],
    sleeve:[188,226,205,200],
    sleeveLight:[222,241,230,170],
    leg:[34,100,80,255],
    legLight:[54,132,104,255],
    gold:[222,177,92,255],
    goldLight:[249,219,132,255],
    shoe:[48,76,68,255],
    shadow:[98,98,114,118]
  };
}
function renderSprite32V12(res){
  const pal=readCutePaletteV12(res); const tr=getTraitsV12(res);
  const id=new ImageData(32,32), d=id.data; for(let i=0;i<d.length;i+=4){ d[i]=0; d[i+1]=0; d[i+2]=0; d[i+3]=0; }

  // Cute proportions: bigger head, softer face, slightly shorter body.
  // 0-3 hair crown, 4-13 face/head, 14-20 torso/sleeves, 21-28 legs, 29-30 shoes, 31 shadow.

  // Back hair mass.
  fillEllipse(d,16,6.5,6.5,5.5,pal.hairMid);
  fillEllipse(d,16,7,5.5,4.8,pal.hairLight);
  fillEllipse(d,16,8.5,6.7,5.2,pal.hairMid);
  // Long side hair curls.
  line(d,11,9,9,15,pal.hairDark); line(d,9,15,8,20,pal.hairMid); line(d,8,20,9,24,pal.hairDark);
  line(d,21,9,23,15,pal.hairDark); line(d,23,15,24,20,pal.hairMid); line(d,24,20,23,24,pal.hairDark);
  line(d,12,11,10,19,pal.hairMid); line(d,20,11,22,19,pal.hairMid);
  px(d,9,24,pal.hairLight); px(d,23,24,pal.hairLight); px(d,8,19,pal.hairLight); px(d,24,19,pal.hairLight);

  // Rounded elf ears.
  if(tr.elf){
    fillTri(d,[9,9],[6,10],[9,11],pal.skin); fillTri(d,[23,9],[26,10],[23,11],pal.skin);
    px(d,7,10,pal.skinLight); px(d,25,10,pal.skinLight);
  }

  // Face: rounder and cuter.
  fillEllipse(d,16,9.5,4.6,4.2,pal.skin);
  fillEllipse(d,16,8.8,4.0,2.9,pal.skinLight);
  px(d,13,12,pal.blush); px(d,19,12,pal.blush);

  // Bangs and face frame.
  rect(d,12,3,8,2,pal.hairLight);
  px(d,12,5,pal.hairLight); px(d,13,5,pal.hairMid); px(d,14,5,pal.hairLight); px(d,15,5,pal.hairDark); px(d,16,5,pal.hairMid); px(d,17,5,pal.hairLight); px(d,18,5,pal.hairMid); px(d,19,5,pal.hairDark);
  px(d,13,6,pal.hairMid); px(d,15,6,pal.hairLight); px(d,16,6,pal.hairLight); px(d,18,6,pal.hairMid);
  line(d,12,7,11,11,pal.hairMid); line(d,20,7,21,11,pal.hairMid);

  // Cute eyes with highlight.
  px(d,13,9,pal.eyeDark); px(d,14,9,pal.eyeDark); px(d,18,9,pal.eyeDark); px(d,19,9,pal.eyeDark);
  px(d,13,10,pal.eyeMid); px(d,14,10,pal.eyeMid); px(d,18,10,pal.eyeMid); px(d,19,10,pal.eyeMid);
  px(d,14,9,pal.eyeHi); px(d,19,9,pal.eyeHi);
  px(d,12,8,pal.hairDark); px(d,20,8,pal.hairDark); // soft brows/upper lids
  // Small smile.
  px(d,15,12,[181,115,123,255]); px(d,16,12,[190,120,128,255]);

  // Neck + choker.
  px(d,15,13,pal.skin); px(d,16,13,pal.skinLight); px(d,17,13,pal.skin);
  px(d,14,13,pal.gold); px(d,18,13,pal.gold); px(d,16,13,[27,125,87,255]);

  // Body: narrower shoulders, cute torso.
  rect(d,13,14,7,2,pal.bodyLight);
  rect(d,12,16,9,4,pal.bodyDark);
  rect(d,13,20,7,2,pal.body);
  px(d,12,15,pal.bodyLight); px(d,20,15,pal.bodyLight); px(d,13,17,pal.bodyLight); px(d,19,17,pal.bodyLight);
  // Gold accents simplified as cute sparkles.
  px(d,16,15,pal.goldLight); px(d,15,17,pal.gold); px(d,17,17,pal.gold); px(d,14,18,pal.goldLight); px(d,18,18,pal.goldLight); px(d,16,20,pal.gold);

  // Soft sleeves: shorter, less dominant.
  if(tr.bigSleeve){
    line(d,11,15,8,22,pal.sleeve); line(d,10,16,7,22,pal.sleeveLight); line(d,12,16,10,23,pal.sleeve);
    line(d,21,15,24,22,pal.sleeve); line(d,22,16,25,22,pal.sleeveLight); line(d,20,16,22,23,pal.sleeve);
    px(d,7,23,pal.sleeve); px(d,25,23,pal.sleeve);
  } else {
    line(d,11,15,9,20,pal.sleeve); line(d,21,15,23,20,pal.sleeve);
  }

  // Arms/hands small and cute.
  line(d,12,15,10,20,pal.sleeve); line(d,20,15,22,20,pal.sleeve);
  px(d,10,21,pal.skin); px(d,22,21,pal.skin); px(d,9,21,pal.skinLight); px(d,23,21,pal.skinLight);

  // Legs: slightly shorter and closer together.
  rect(d,14,22,2,7,pal.leg);
  rect(d,17,22,2,7,pal.leg);
  line(d,13,22,14,28,pal.bodyDark); line(d,19,22,18,28,pal.bodyDark);
  px(d,15,23,pal.legLight); px(d,18,23,pal.legLight); px(d,15,27,pal.legLight); px(d,18,27,pal.legLight);

  // Shoes rounded.
  rect(d,13,29,3,2,pal.shoe); rect(d,17,29,3,2,pal.shoe);
  px(d,14,29,pal.gold); px(d,18,29,pal.gold); px(d,13,30,pal.goldLight); px(d,19,30,pal.goldLight);

  // Hair highlight and accessories.
  px(d,11,4,pal.hairLight); px(d,20,4,pal.hairLight); px(d,12,9,pal.hairLight); px(d,20,9,pal.hairLight);
  if(tr.ornate){ px(d,21,6,pal.gold); px(d,10,6,pal.goldLight); }

  // Ground shadow.
  for(let x=11;x<=21;x++) blend(d,x,31,pal.shadow,.8);

  outlineSoft(d);
  res.sprite32V12={imageData:id,status:'ok',renderer:'cute_mode_v1_2',cute_mode:true,proportion:'big_head_cute',note:'cute renderer prioritizes readable and charming chibi proportions over direct shrink'};
  // Backward compatibility for existing save/metadata code.
  res.sprite32V11=res.sprite32V12;
  res.sprite32V10=res.sprite32V10 || {};
  res.sprite32V10.imageData=id; res.sprite32V10.status='ok-cute-v1.2';
  return id;
}
function canvasFromSpriteV12(){ const id=(state.result?.sprite32V12?.imageData) || renderSprite32V12(state.result); const c=document.createElement('canvas'); c.width=32; c.height=32; c.getContext('2d').putImageData(id,0,0); return c; }
function drawSpriteV12(){
  if(!state.result) return;
  const id=renderSprite32V12(state.result);
  const c32=qs2('cSprite32'), prev=qs2('cSpritePreview'), st=qs2('spriteStatus'), log=qs2('pixelLog');
  if(c32){ fit(c32,32,32); const ctx=c32.getContext('2d'); ctx.clearRect(0,0,32,32); ctx.putImageData(id,0,0); }
  if(prev){ fit(prev,320,320); const ctx=prev.getContext('2d'); ctx.imageSmoothingEnabled=false; ctx.fillStyle='#0b111b'; ctx.fillRect(0,0,320,320); ctx.strokeStyle='rgba(255,255,255,.08)'; for(let i=0;i<=32;i++){ ctx.beginPath(); ctx.moveTo(i*10,0); ctx.lineTo(i*10,320); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,i*10); ctx.lineTo(320,i*10); ctx.stroke(); } const t=document.createElement('canvas'); t.width=32; t.height=32; t.getContext('2d').putImageData(id,0,0); ctx.drawImage(t,0,0,320,320); }
  if(st) st.textContent='v1.2 cute mode ready';
  if(log){ log.textContent=`Sprite v1.2\nstatus=ok\nrenderer=cute_mode_v1_2\n\n改善内容:\n- 頭を大きく、脚を少し短くして可愛い頭身に変更\n- 顔を丸くして、目を2段+ハイライトで可愛く再描画\n- 頬色と小さい口を追加\n- 髪を棒状ではなく、丸い髪塊+顔フレーム型へ変更\n- 袖は短く柔らかくして主役を顔に戻す\n- 金装飾は細密模様ではなく、可愛いアクセントに再配置\n\n保存: 32x32 PNG保存 / ドット絵JSON保存`; }
}
function ensureFallbackBox(){ const log=qs2('pixelLog') || qs2('log'); if(!log) return null; let box=document.getElementById('saveLinksV12'); if(!box){ box=document.createElement('div'); box.id='saveLinksV12'; box.style.marginTop='10px'; log.parentNode.appendChild(box); } return box; }
function triggerDownloadV12(dataUrl,name,label){ try{ const a=document.createElement('a'); a.href=dataUrl; a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>a.remove(),400); }catch(e){} const box=ensureFallbackBox(); if(box){ const a=document.createElement('a'); a.href=dataUrl; a.download=name; a.target='_blank'; a.rel='noopener'; a.textContent=label||name; a.style.display='inline-block'; a.style.margin='6px 8px 0 0'; a.style.padding='8px 10px'; a.style.border='1px solid #58a6ff'; a.style.borderRadius='10px'; a.style.color='#58a6ff'; box.prepend(a); } }
function saveSprite32V12(){ if(!state.result){ alert('先に解析してください。'); return; } const c=canvasFromSpriteV12(); triggerDownloadV12(c.toDataURL('image/png'),'sprite_front_32_v1_2_cute.png','画像を開く/保存 sprite_front_32_v1_2_cute.png'); }
function pixelProjectV12(){ const res=state.result; if(!res) return {version:VERSION_V12,status:'no_result'}; if(!res.sprite32V12) renderSprite32V12(res); return {version:VERSION_V12,type:'game_sprite_32_cute_mode',output:{sprite:'sprite_front_32_v1_2_cute.png',size:{w:32,h:32}},renderer:'cute_mode_v1_2',cute_mode:true,design:{head_ratio:'large',face:'round',eyes:'highlighted',sleeves:'soft short',ornament:'accent only'},goal:'charming readable game sprite rather than direct shrink'}; }
function savePixelProjectV12(){ if(!state.result){ alert('先に解析してください。'); return; } const txt=JSON.stringify(pixelProjectV12(),null,2); triggerDownloadV12('data:application/json;charset=utf-8,'+encodeURIComponent(txt),'sprite_pixel_project_v1_2_cute.json','JSONを開く/保存 sprite_pixel_project_v1_2_cute.json'); }
function installV12(){
  window.saveSprite32V12=saveSprite32V12;
  const b1=qs2('saveSprite32'); if(b1) b1.onclick=saveSprite32V12;
  const b2=qs2('savePixelProject'); if(b2) b2.onclick=savePixelProjectV12;
  const oldAnalyze=(typeof analyze==='function') ? analyze : null;
  async function analyzeV12(){ if(oldAnalyze) await oldAnalyze(); try{ if(state.result) drawSpriteV12(); }catch(e){ console.warn('v1.2 draw failed',e); } }
  analyze=analyzeV12; window.analyzeV12=analyzeV12;
  const run=qs2('run'); if(run) run.onclick=analyzeV12;
  ['adjFace','adjShoulder','adjWaist','adjCrotch','adjAnkle'].forEach(id=>{ const el=qs2(id); if(el) el.oninput=()=>{ state.lineAdjust={face:+(qs2('adjFace')?.value||0),shoulder:+(qs2('adjShoulder')?.value||0),waist:+(qs2('adjWaist')?.value||0),crotch:+(qs2('adjCrotch')?.value||0),ankle:+(qs2('adjAnkle')?.value||0)}; analyzeV12(); }; });
  document.title='Sprite Studio Pixel Pipeline v1.2';
  const h1=document.querySelector('h1'); if(h1) h1.textContent='Sprite Studio Pixel Pipeline v1.2';
  const sub=document.querySelector('.sub'); if(sub) sub.textContent='AIなし / Canvas + localStorageのみ。v1.2: cute mode を追加し、32x32を可愛く読める頭身・顔・髪に再設計しました。';
  const footer=document.querySelector('.footer'); if(footer) footer.textContent='v1.2は cute mode レンダラ版です。解析結果を直接縮小せず、可愛い頭身・顔・目・髪・袖・装飾テンプレで32x32へ再構成します。';
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',installV12); else installV12();
if(typeof metadata092==='function'){
  const oldMeta=metadata092;
  metadata092=function(){ const m=oldMeta(); m.version=VERSION_V12; m.pixel_sprite_v12={status:state.result?.sprite32V12?.status || 'not_run',renderer:'cute_mode_v1_2',cute_mode:true}; return m; };
}
})();
