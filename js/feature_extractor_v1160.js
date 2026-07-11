(function(root,factory){
  'use strict';
  root.SpriteFeatureExtractor=factory();
})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  var VERSION='v1.16.0';

  function count(mask){var n=0;for(var i=0;i<mask.length;i++)if(mask[i])n++;return n;}
  function bbox(mask,w,h){var minx=w,miny=h,maxx=-1,maxy=-1,n=0;for(var y=0;y<h;y++)for(var x=0;x<w;x++){var p=y*w+x;if(!mask[p])continue;n++;if(x<minx)minx=x;if(y<miny)miny=y;if(x>maxx)maxx=x;if(y>maxy)maxy=y;}return n?{x:minx,y:miny,w:maxx-minx+1,h:maxy-miny+1,minx:minx,miny:miny,maxx:maxx,maxy:maxy,count:n}:{x:0,y:0,w:0,h:0,minx:0,miny:0,maxx:-1,maxy:-1,count:0};}
  function rowSpan(mask,w,y,minx,maxx){var lo=maxx+1,hi=minx-1,n=0,sum=0;for(var x=minx;x<=maxx;x++){if(mask[y*w+x]){if(x<lo)lo=x;if(x>hi)hi=x;n++;sum+=x;}}return n?{min:lo,max:hi,width:hi-lo+1,count:n,cx:sum/n}:{min:0,max:-1,width:0,count:0,cx:null};}
  function colSpan(mask,w,h,x,miny,maxy){var lo=maxy+1,hi=miny-1,n=0,sum=0;for(var y=miny;y<=maxy;y++){if(mask[y*w+x]){if(y<lo)lo=y;if(y>hi)hi=y;n++;sum+=y;}}return n?{min:lo,max:hi,height:hi-lo+1,count:n,cy:sum/n}:{min:0,max:-1,height:0,count:0,cy:null};}
  function smooth(values,r){var out=new Float32Array(values.length);for(var i=0;i<values.length;i++){var s=0,n=0;for(var j=Math.max(0,i-r);j<=Math.min(values.length-1,i+r);j++){s+=values[j];n++;}out[i]=s/n;}return out;}
  function percentile(arr,q){if(!arr.length)return 0;var a=arr.slice().sort(function(x,y){return x-y;});return a[Math.max(0,Math.min(a.length-1,Math.floor((a.length-1)*q)))];}

  function analyze(mask,w,h,options){
    options=options||{};var b=bbox(mask,w,h);if(!b.count)throw new Error('Structure Mask is empty');
    var rows=[],widths=[],centers=[];for(var y=b.miny;y<=b.maxy;y++){var s=rowSpan(mask,w,y,b.minx,b.maxx);rows.push(s);widths.push(s.width);centers.push(s.cx===null?NaN:s.cx);}
    var sw=smooth(widths,Math.max(1,Math.round(b.h*.012)));var nonzero=[];for(var i=0;i<sw.length;i++)if(sw[i]>0)nonzero.push(sw[i]);var wide=percentile(nonzero,.82),median=percentile(nonzero,.5);
    var topLimit=Math.max(3,Math.round(b.h*.38)),headEnd=Math.max(1,Math.round(b.h*.18));
    for(i=Math.round(b.h*.10);i<topLimit;i++){
      var prev=sw[Math.max(0,i-Math.max(1,Math.round(b.h*.035)))],cur=sw[i],next=sw[Math.min(sw.length-1,i+Math.max(1,Math.round(b.h*.035)))];
      if(cur<prev*.78&&cur<next*.86&&cur<median*.95){headEnd=i;break;}
    }
    var headY0=b.miny,headY1=Math.min(b.maxy,b.miny+headEnd);var headMask=new Uint8Array(mask.length);for(y=headY0;y<=headY1;y++)for(var x=b.minx;x<=b.maxx;x++){var p=y*w+x;if(mask[p])headMask[p]=1;}var hb=bbox(headMask,w,h);
    if(!hb.count){hb={x:b.x,y:b.y,w:b.w,h:Math.max(1,Math.round(b.h*.22)),minx:b.minx,miny:b.miny,maxx:b.maxx,maxy:b.miny+Math.round(b.h*.22),count:0};}
    var centerSamples=[];for(i=0;i<centers.length;i++){if(!isNaN(centers[i])&&i>headEnd*.35&&i<rows.length*.94)centerSamples.push(centers[i]);}var centerX=percentile(centerSamples,.5)||b.x+b.w/2;
    var shoulderSearchStart=Math.min(rows.length-1,headEnd+1),shoulderSearchEnd=Math.min(rows.length-1,Math.round(b.h*.48)),shoulderI=shoulderSearchStart,shoulderW=0;
    for(i=shoulderSearchStart;i<=shoulderSearchEnd;i++){if(sw[i]>shoulderW){shoulderW=sw[i];shoulderI=i;}}
    var shoulderY=b.miny+shoulderI,shoulderSpan=rows[shoulderI];
    var waistStart=Math.min(rows.length-1,shoulderI+Math.round(b.h*.08)),waistEnd=Math.min(rows.length-1,Math.round(b.h*.72)),waistI=waistStart,waistW=Infinity;
    for(i=waistStart;i<=waistEnd;i++){if(sw[i]>0&&sw[i]<waistW){waistW=sw[i];waistI=i;}}
    var waistY=b.miny+waistI,waistSpan=rows[waistI];
    var footY=b.maxy,lowest=[];for(x=b.minx;x<=b.maxx;x++){var cs=colSpan(mask,w,h,x,b.miny,b.maxy);if(cs.count&&cs.max>=b.maxy-Math.max(2,Math.round(b.h*.025)))lowest.push(x);}var footX=lowest.length?percentile(lowest,.5):centerX;
    var aspect=b.w/Math.max(1,b.h),verticality=b.h/Math.max(1,b.w),centerDrift=0,validPairs=0;for(i=1;i<centers.length;i++){if(!isNaN(centers[i])&&!isNaN(centers[i-1])){centerDrift+=Math.abs(centers[i]-centers[i-1]);validPairs++;}}centerDrift=validPairs?centerDrift/validPairs:0;
    var bottomWidth=0,bottomN=0;for(i=Math.round(rows.length*.72);i<rows.length;i++){bottomWidth+=sw[i];bottomN++;}bottomWidth/=Math.max(1,bottomN);
    var pose='standing',poseConfidence=.65;
    if(aspect>1.12){pose='lying';poseConfidence=Math.min(.98,.65+(aspect-1.12)*.35);}else if(verticality<1.35||bottomWidth>wide*.82||Math.abs(footX-centerX)>b.w*.23){pose='sitting';poseConfidence=.72;}else{poseConfidence=Math.min(.95,.68+(verticality-1.35)*.12);}
    var normalized={centerX:(centerX-b.x)/Math.max(1,b.w),headBottom:(headY1-b.y)/Math.max(1,b.h),shoulderY:(shoulderY-b.y)/Math.max(1,b.h),waistY:(waistY-b.y)/Math.max(1,b.h),footX:(footX-b.x)/Math.max(1,b.w)};
    var quality=100;quality-=Math.min(18,centerDrift/Math.max(1,b.w)*220);quality-=b.count/(b.w*b.h)<.12?18:0;quality-=headEnd<Math.round(b.h*.09)||headEnd>Math.round(b.h*.36)?12:0;quality=Math.max(0,Math.min(100,quality));
    return {version:VERSION,pose:pose,poseConfidence:+poseConfidence.toFixed(2),quality:+quality.toFixed(1),bbox:b,centerLine:{x:+centerX.toFixed(1),top:b.miny,bottom:b.maxy},head:{bbox:hb,center:{x:+(hb.x+hb.w/2).toFixed(1),y:+(hb.y+hb.h/2).toFixed(1)},bottomY:headY1},shoulders:{y:shoulderY,left:shoulderSpan.min,right:shoulderSpan.max,width:shoulderSpan.width},waist:{y:waistY,left:waistSpan.min,right:waistSpan.max,width:waistSpan.width},feet:{groundY:footY,centerX:+footX.toFixed(1)},metrics:{maskArea:count(mask),fillRatio:+(b.count/Math.max(1,b.w*b.h)).toFixed(3),aspect:+aspect.toFixed(3),verticality:+verticality.toFixed(3),centerDrift:+centerDrift.toFixed(2),medianWidth:+median.toFixed(1),wideWidth:+wide.toFixed(1)},normalized:normalized};
  }

  function drawOverlay(canvas,features){
    if(!canvas||!features)return;var ctx=canvas.getContext('2d'),sx=canvas.width/features.bboxSourceW,sy=canvas.height/features.bboxSourceH;ctx.save();ctx.lineWidth=Math.max(1,canvas.width/256);ctx.font=Math.max(10,canvas.width/28)+'px sans-serif';
    function line(x1,y1,x2,y2,style){ctx.strokeStyle=style;ctx.beginPath();ctx.moveTo(x1*sx,y1*sy);ctx.lineTo(x2*sx,y2*sy);ctx.stroke();}
    function rect(b,style){ctx.strokeStyle=style;ctx.strokeRect(b.x*sx,b.y*sy,b.w*sx,b.h*sy);}
    rect(features.bbox,'rgba(255,255,255,.9)');rect(features.head.bbox,'rgba(255,210,0,.95)');line(features.centerLine.x,features.centerLine.top,features.centerLine.x,features.centerLine.bottom,'rgba(0,255,255,.9)');line(features.shoulders.left,features.shoulders.y,features.shoulders.right,features.shoulders.y,'rgba(0,255,120,.95)');line(features.waist.left,features.waist.y,features.waist.right,features.waist.y,'rgba(255,80,200,.95)');line(features.bbox.minx,features.feet.groundY,features.bbox.maxx,features.feet.groundY,'rgba(255,120,80,.95)');ctx.fillStyle='rgba(0,0,0,.72)';ctx.fillRect(4,4,Math.min(canvas.width-8,210),24);ctx.fillStyle='#fff';ctx.fillText(features.pose+' '+Math.round(features.poseConfidence*100)+'%',8,21);ctx.restore();
  }

  function process(input){if(!input||!input.structureMask||!input.w||!input.h)throw new Error('SpriteFeatureExtractor.process: invalid input');var f=analyze(input.structureMask,input.w,input.h,input.options);f.bboxSourceW=input.w;f.bboxSourceH=input.h;return f;}
  return {VERSION:VERSION,process:process,drawOverlay:drawOverlay};
});
