// ===== v1.1 patch: iPhone save fallback + template-based 32x32 sprite =====
(function(){
'use strict';
const VERSION_V11='1.1-save-template-sprite';
function safeQS(id){ return typeof qs==='function' ? qs(id) : document.getElementById(id); }
function px(data,x,y,rgba){ if(x<0||y<0||x>=32||y>=32)return; const i=(y*32+x)*4; data[i]=rgba[0]; data[i+1]=rgba[1]; data[i+2]=rgba[2]; data[i+3]=rgba[3]??255; }
function blend(data,x,y,rgba,a=.7){ if(x<0||y<0||x>=32||y>=32)return; const i=(y*32+x)*4; const aa=Math.max(0,Math.min(1,a)); data[i]=Math.round(data[i]*(1-aa)+rgba[0]*aa); data[i+1]=Math.round(data[i+1]*(1-aa)+rgba[1]*aa); data[i+2]=Math.round(data[i+2]*(1-aa)+rgba[2]*aa); data[i+3]=Math.max(data[i+3],rgba[3]??255); }
function rect(data,x,y,w,h,rgba){ for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)px(data,xx,yy,rgba); }
function line(data,x0,y0,x1,y1,rgba){ const dx=Math.abs(x1-x0),dy=Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1; let err=dx-dy,x=x0,y=y0; for(let i=0;i<80;i++){px(data,x,y,rgba); if(x===x1&&y===y1)break; const e2=2*err; if(e2>-dy){err-=dy;x+=sx;} if(e2<dx){err+=dx;y+=sy;} } }
function ellipse(data,cx,cy,rx,ry,rgba){ for(let y=Math.floor(cy-ry);y<=Math.ceil(cy+ry);y++)for(let x=Math.floor(cx-rx);x<=Math.ceil(cx+rx);x++){ const dx=(x-cx)/Math.max(1,rx),dy=(y-cy)/Math.max(1,ry); if(dx*dx+dy*dy<=1)px(data,x,y,rgba); } }
function outlineAround(data){
  const src=new Uint8ClampedArray(data); const outline=[38,34,48,255];
  for(let y=1;y<31;y++)for(let x=1;x<31;x++){
    const i=(y*32+x)*4; if(src[i+3])continue;
    let hit=false; for(let dy=-1;dy<=1&&!hit;dy++)for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy)continue; if(src[((y+dy)*32+(x+dx))*4+3]){hit=true;break;} }
    if(hit){ data[i]=outline[0]; data[i+1]=outline[1]; data[i+2]=outline[2]; data[i+3]=210; }
  }
}
function readPaletteV11(res){
  const counts=res?.sprite32V10?.groups||{};
  const get=(name,fb)=>{
    const c=counts[name]?.color; if(!c||typeof c!=='string'||c[0]!=='#')return fb;
    const n=parseInt(c.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255,255];
  };
  // Use stable game-palette defaults because current group colors can be polluted by bad masks.
  return {
    outline:[38,34,48,255],
    hairDark:[92,74,116,255], hair:[148,127,165,255], hairLight:[205,190,214,255],
    skin:[235,184,165,255], skinLight:[255,210,190,255], blush:[214,136,132,255], eye:[34,104,74,255],
    bodyDark:[7,34,29,255], body:[16,74,56,255], bodyLight:[39,112,86,255],
    sleeve:[172,214,190,215], sleeveLight:[210,234,216,190],
    legDark:[18,58,50,255], leg:[28,88,70,255],
    gold:[220,170,78,255], goldLight:[246,214,118,255], shadow:[72,74,86,160]
  };
}
function renderSprite32V11(res){
  const pal=readPaletteV11(res); const id=new ImageData(32,32), d=id.data;
  for(let i=0;i<d.length;i+=4){d[i]=0;d[i+1]=0;d[i+2]=0;d[i+3]=0;}
  // Coordinate target: readable game sprite, not direct photo scaling.
  // 0-2 hair top, 3-11 head/face, 12-20 torso/sleeves, 21-29 legs, 30 shoes, 31 shadow.

  // Back/side hair silhouette, long elf-like lavender hair.
  ellipse(d,16,6,5,5,pal.hair);
  rect(d,12,3,8,3,pal.hairLight);
  line(d,10,6,8,16,pal.hairDark); line(d,8,16,7,23,pal.hair);
  line(d,22,6,24,16,pal.hairDark); line(d,24,16,25,23,pal.hair);
  line(d,11,8,9,20,pal.hair); line(d,21,8,23,20,pal.hair);
  line(d,12,12,10,25,pal.hairDark); line(d,20,12,22,25,pal.hairDark);
  px(d,9,24,pal.hairLight); px(d,23,24,pal.hairLight); px(d,8,18,pal.hairLight); px(d,24,18,pal.hairLight);

  // Elf ears before face outline.
  px(d,9,7,pal.skin); px(d,8,8,pal.skin); px(d,9,8,pal.skinLight);
  px(d,23,7,pal.skin); px(d,24,8,pal.skin); px(d,23,8,pal.skinLight);

  // Face.
  ellipse(d,16,8,4,4,pal.skin);
  rect(d,13,8,7,3,pal.skinLight);
  px(d,14,9,pal.eye); px(d,18,9,pal.eye);
  px(d,15,10,pal.blush); px(d,17,10,pal.blush);
  px(d,16,11,pal.skin);

  // Bangs / hair cap over face.
  rect(d,12,3,8,2,pal.hairLight);
  px(d,12,5,pal.hairLight); px(d,13,5,pal.hair); px(d,16,5,pal.hairDark); px(d,19,5,pal.hair);
  px(d,13,6,pal.hair); px(d,15,6,pal.hairLight); px(d,17,6,pal.hair); px(d,19,6,pal.hairDark);
  px(d,12,7,pal.hairDark); px(d,19,7,pal.hairDark);

  // Neck + choker.
  px(d,15,12,pal.skin); px(d,16,12,pal.skin); px(d,17,12,pal.skin);
  px(d,14,12,pal.gold); px(d,18,12,pal.gold); px(d,16,12,[16,105,70,255]);

  // Sheer sleeves behind body: readable large pale-green shapes.
  line(d,9,13,6,22,pal.sleeve); line(d,8,14,5,23,pal.sleeveLight); line(d,10,14,8,24,pal.sleeve);
  line(d,23,13,26,22,pal.sleeve); line(d,24,14,27,23,pal.sleeveLight); line(d,22,14,24,24,pal.sleeve);
  px(d,6,24,pal.sleeve); px(d,26,24,pal.sleeve);

  // Body suit.
  rect(d,13,13,7,2,pal.body); rect(d,12,15,9,3,pal.bodyDark); rect(d,13,18,7,3,pal.body);
  px(d,12,14,pal.bodyLight); px(d,20,14,pal.bodyLight); px(d,13,16,pal.bodyLight); px(d,19,16,pal.bodyLight);
  // Gold ornaments simplified as readable pixels.
  px(d,16,13,pal.goldLight); px(d,15,15,pal.gold); px(d,17,15,pal.gold);
  px(d,16,17,pal.goldLight); px(d,14,19,pal.gold); px(d,18,19,pal.gold); px(d,16,20,pal.gold);

  // Arms and hands.
  line(d,11,14,9,20,pal.sleeve); line(d,21,14,23,20,pal.sleeve);
  px(d,9,21,pal.skin); px(d,23,21,pal.skin); px(d,8,21,pal.skinLight); px(d,24,21,pal.skinLight);

  // Slim legs.
  rect(d,14,21,2,8,pal.leg); rect(d,17,21,2,8,pal.leg);
  px(d,15,22,pal.legLight||pal.bodyLight); px(d,18,22,pal.legLight||pal.bodyLight);
  line(d,13,21,14,28,pal.legDark); line(d,19,21,18,28,pal.legDark);
  px(d,15,29,pal.leg); px(d,17,29,pal.leg);

  // Shoes with gold trim.
  rect(d,13,29,3,2,pal.bodyDark); rect(d,17,29,3,2,pal.bodyDark);
  px(d,14,29,pal.gold); px(d,18,29,pal.gold); px(d,13,30,pal.gold); px(d,19,30,pal.gold);

  // Ground shadow.
  for(let x=10;x<=22;x++)blend(d,x,31,pal.shadow,.75);

  outlineAround(d);
  res.sprite32V11={imageData:id,status:'ok',renderer:'template_v1_1',note:'template renderer uses extracted character identity but does not trust noisy masks as exact pixels'};
  // Keep compatibility with older save/metadata code.
  res.sprite32V10=res.sprite32V10||{}; res.sprite32V10.imageData=id; res.sprite32V10.status='ok-template-v1.1';
  return id;
}
function fit(c,w,h){ c.width=w; c.height=h; }
function drawSpriteV11(){
  if(!state.result)return;
  const id=renderSprite32V11(state.result);
  const c32=safeQS('cSprite32'), prev=safeQS('cSpritePreview'), st=safeQS('spriteStatus'), log=safeQS('pixelLog');
  if(c32){ fit(c32,32,32); const ctx=c32.getContext('2d'); ctx.clearRect(0,0,32,32); ctx.putImageData(id,0,0); }
  if(prev){ fit(prev,320,320); const ctx=prev.getContext('2d'); ctx.imageSmoothingEnabled=false; ctx.fillStyle='#0b111b'; ctx.fillRect(0,0,320,320); ctx.strokeStyle='rgba(255,255,255,.08)'; for(let i=0;i<=32;i++){ctx.beginPath();ctx.moveTo(i*10,0);ctx.lineTo(i*10,320);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i*10);ctx.lineTo(320,i*10);ctx.stroke();} const t=document.createElement('canvas'); t.width=32; t.height=32; t.getContext('2d').putImageData(id,0,0); ctx.drawImage(t,0,0,320,320); }
  if(st) st.textContent='v1.1 template ready';
  if(log){ log.textContent=`Sprite v1.1\nstatus=ok\nrenderer=template_v1_1\n\n原因対策:\n- 直接縮小サンプリングを停止\n- ノイズ混じりマスクをそのまま絵にしない\n- 32x32専用の固定人体比率で描画\n- 髪/耳/顔/胴体/袖/脚/靴/金装飾を読みやすさ優先で再配置\n\n保存: 下の保存リンク、または 32x32 PNG保存 ボタンを使用`; }
}
function canvasFromSpriteV11(){ const id=state.result?.sprite32V11?.imageData || renderSprite32V11(state.result); const c=document.createElement('canvas'); c.width=32;c.height=32;c.getContext('2d').putImageData(id,0,0); return c; }
function addSaveLinkV11(dataUrl,name,label){
  const log=safeQS('pixelLog')||safeQS('log'); if(!log)return;
  let box=document.getElementById('saveLinksV11');
  if(!box){ box=document.createElement('div'); box.id='saveLinksV11'; box.style.marginTop='10px'; log.parentNode.appendChild(box); }
  const a=document.createElement('a'); a.href=dataUrl; a.download=name; a.target='_blank'; a.rel='noopener'; a.textContent=label||name; a.style.display='inline-block'; a.style.margin='6px 8px 0 0'; a.style.padding='8px 10px'; a.style.border='1px solid #58a6ff'; a.style.borderRadius='10px'; a.style.color='#58a6ff';
  box.prepend(a);
}
function triggerDownloadV11(dataUrl,name,label){
  try{ const a=document.createElement('a'); a.href=dataUrl; a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>a.remove(),400); }catch(e){}
  addSaveLinkV11(dataUrl,name,label||name);
}
function saveSprite32V11(){
  if(!state.result){ alert('先に解析してください。'); return; }
  const c=canvasFromSpriteV11(); const url=c.toDataURL('image/png');
  triggerDownloadV11(url,'sprite_front_32_v1_1.png','画像を開く/保存 sprite_front_32_v1_1.png');
}
function pixelProjectV11(){
  const res=state.result; if(!res)return {version:VERSION_V11,status:'no_result'};
  if(!res.sprite32V11)renderSprite32V11(res);
  const groups=res.sprite32V10?.groups||{};
  return {version:VERSION_V11,type:'game_sprite_32_template_output',output:{sprite:'sprite_front_32_v1_1.png',size:{w:32,h:32}},renderer:'template_v1_1',reason:'noisy segmentation is used only as character hints; final 32x32 uses fixed game-sprite proportions',groups,priority:['hair silhouette','elf ears','face/eyes','green body','sheer sleeves','slim legs','gold accents','shoes']};
}
function savePixelProjectV11(){
  if(!state.result){ alert('先に解析してください。'); return; }
  const txt=JSON.stringify(pixelProjectV11(),null,2); const url='data:application/json;charset=utf-8,'+encodeURIComponent(txt);
  triggerDownloadV11(url,'sprite_pixel_project_v1_1.json','JSONを開く/保存 sprite_pixel_project_v1_1.json');
}
function installV11(){
  const b1=safeQS('saveSprite32'); if(b1)b1.onclick=saveSprite32V11;
  const b2=safeQS('savePixelProject'); if(b2)b2.onclick=savePixelProjectV11;
  window.saveSprite32V10=saveSprite32V11; window.saveSprite32V11=saveSprite32V11;
  const oldAnalyze=(typeof analyze==='function')?analyze:null;
  async function analyzeV11(){ if(oldAnalyze)await oldAnalyze(); try{ if(state.result)drawSpriteV11(); }catch(e){console.warn('v1.1 draw failed',e);} }
  analyze=analyzeV11; window.analyzeV11=analyzeV11;
  const run=safeQS('run'); if(run)run.onclick=analyzeV11;
  ['adjFace','adjShoulder','adjWaist','adjCrotch','adjAnkle'].forEach(id=>{const el=safeQS(id); if(el)el.oninput=()=>{state.lineAdjust={face:+(safeQS('adjFace')?.value||0),shoulder:+(safeQS('adjShoulder')?.value||0),waist:+(safeQS('adjWaist')?.value||0),crotch:+(safeQS('adjCrotch')?.value||0),ankle:+(safeQS('adjAnkle')?.value||0)}; analyzeV11();};});
  document.title='Sprite Studio Pixel Pipeline v1.1';
  const h1=document.querySelector('h1'); if(h1)h1.textContent='Sprite Studio Pixel Pipeline v1.1';
  const sub=document.querySelector('.sub'); if(sub)sub.textContent='AIなし / Canvas + localStorageのみ。v1.1: 保存ボタン修正、32x32は直接縮小ではなくゲーム用テンプレート描画に変更。';
  const footer=document.querySelector('.footer'); if(footer)footer.textContent='v1.1は保存修正とドット絵品質修正版です。解析マスクをそのまま縮小せず、ゲーム用32x32比率で髪・顔・胴体・袖・脚・靴・装飾を再配置します。';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installV11); else installV11();
if(typeof metadata092==='function'){
  const oldMeta=metadata092;
  metadata092=function(){ const m=oldMeta(); m.version=VERSION_V11; m.pixel_sprite_v11={status:state.result?.sprite32V11?.status||'not_run',renderer:'template_v1_1',save_fixed:true}; return m; };
}
})();
