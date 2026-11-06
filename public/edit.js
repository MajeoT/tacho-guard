/* TachoGuard: Edit Shift. The whole shift as a lineup of blocks (driving, other work, POA, breaks) laid end to end from the
   shift start, so it can be put right in one place: drag a block by its handle to change the order (the times follow and the
   shift keeps its length), tap a block to change its type, its start or end, or its length, or to split, add, move or delete it.
   Nothing is saved until Save, and Save has an undo. End Shift opens the same screen with the end time ready.
   SE = { S: shift start, B: [{t, len, o (the entry it came from), run (still running)}], open (the open row), mode ('edit' or
   'end'), S0/E0 (the stretch it replaces), pre (a line at the top) } */
let SE=null;
const SEN={d:'Driving',x:'Driving (no tacho)',w:'Other work',p:'POA',r:'Break'},SEI={d:'🚛',x:'🚚',w:'⚒',p:'◪',r:'🛏'};
const seF=ms=>{const m=Math.round(ms/M),h=Math.floor(m/60),r=m%60;return h?h+'h'+(r?' '+r+'m':''):r+'m'};

/* The shift at time t (or the latest one): logged entries plus what is running now, split where there is 9 hours or more off */
function seShift(t){const n=Date.now(),L=st.sessions.filter(x=>(x.t||'d')!=='r'&&x.e>x.s).map(x=>Object.assign({t:'d'},x));
 if(st.active&&st.act&&n>st.active)L.push({s:st.active,e:n,t:st.act,live:1,j:st.cj});
 const A=lay(L);if(!A.length)return null;const C=[];let cur=[];A.forEach(x=>{if(cur.length&&x.s-cur[cur.length-1].e>=9*H){C.push(cur);cur=[]}cur.push(x)});C.push(cur);
 if(t==null)return C[C.length-1];return C.find(c=>t>=c[0].s-H&&t<=c[c.length-1].e+H)||C.filter(c=>c[0].s<=t).pop()||C[0]}

/* the shift's entries as blocks end to end: gaps of a minute or more are breaks, and a break running now is part of it */
function seBlocks(c){const B=[];let pe=null;c.forEach(x=>{if(pe!==null){const g=x.s-pe;if(g>=M)B.push({t:'r',len:g,o:null});else if(g>0&&B.length)B[B.length-1].len+=g}
  const o=Object.assign({},x);delete o.s;delete o.e;delete o.live;B.push({t:x.t||'d',len:x.e-x.s,o,run:!!x.live});pe=x.e});
 if(st.active&&st.act==='r'&&!c[c.length-1].live&&st.active>=pe){const n=Date.now();if(st.active-pe>=M)B.push({t:'r',len:st.active-pe,o:null});B.push({t:'r',len:n-st.active,o:{},run:true})}
 return B}
function seOpen(t,mode,pre,focus){const c=seShift(t);if(!c){if(mode==='end'&&typeof endAskOld==='function'){endAskOld();return}openDay(sod(Date.now()),'today');return}
 const B=seBlocks(c);
 const E0=c[0].s+B.reduce((q,b)=>q+b.len,0),W=st.sessions.filter(x=>(x.t||'d')!=='r'&&x.e>x.s),pv=W.filter(x=>x.e<=c[0].s).reduce((m,x)=>Math.max(m,x.e),0),nx=W.filter(x=>x.s>=E0).reduce((m,x)=>Math.min(m,x.s),Infinity);
 /* lo/hi: the shift cannot be stretched over the shift before or after it */
 SE={S:c[0].s,B,open:null,mode:mode||'edit',S0:c[0].s,E0,lo:pv,hi:nx,pre:pre||'',dirty:false};
 if(focus!=null){let s=SE.S;SE.B.forEach((b,i)=>{if(focus>=s&&focus<s+b.len)SE.open=i;s+=b.len})}
 if(SE.mode==='end')seToEnd();
 let el=$('sed');if(!el){el=document.createElement('div');el.id='sed';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');document.body.appendChild(el);el.addEventListener('click',seClick);el.addEventListener('change',seChange);el.addEventListener('pointerdown',seDown)}
 el.hidden=false;document.body.classList.add('sedon');seDraw();el.scrollTop=0}
function seClose(){const el=$('sed');if(el)el.hidden=true;document.body.classList.remove('sedon');SE=null}

/* end mode: the running block stops being "running"; its end is the shift end (now to start with) */
function seToEnd(){SE.mode='end';const l=SE.B[SE.B.length-1];if(l&&l.run){l.run=false;l.wasRun=true}}
/* driving in a no-tacho job is 'x' (not counted towards the tacho limits): the choices follow the block's job */
const seTcOf=b=>{const j=b&&b.o&&b.o.j?b.o.j:st.cj;return jobsOn()?jobC(j).tc!==false:isTc()},seKinds=b=>{const ks=[seTcOf(b)?'d':'x','w','p','r'];if(b&&!ks.includes(b.t))ks.unshift(b.t);return ks};
const seMaxEnd=()=>Math.min(Date.now(),SE.hi);
const seStarts=()=>{let s=SE.S;return SE.B.map(b=>{const x=s;s+=b.len;return x})};
const seEnd=()=>SE.S+SE.B.reduce((q,b)=>q+b.len,0);
const seRun=()=>{const l=SE.B[SE.B.length-1];return l&&l.run?l:null};

/* entries as they would be saved */
function seEntries(){const S=seStarts();return SE.B.map((b,i)=>({s:S[i],e:S[i]+b.len,t:b.t,run:b.run}))}

/* ---- the changes ---- */
const seMin=M;
function seLen(i,nl){const B=SE.B,b=B[i];nl=Math.max(seMin,Math.round(nl/M)*M);const d=nl-b.len;if(!d)return;
 if(b.run){/* running: its end is now, so the start moves and the block before gives or takes the time */if(i>0){const p=B[i-1],pl=p.len-d;if(pl<seMin)return seLen(i,b.len+p.len-seMin);p.len=pl}else{if(SE.S-d<SE.lo)return seLen(i,b.len+(SE.S-SE.lo));SE.S-=d}b.len=nl}
 else if(i<B.length-1){const nx=B[i+1],nn=nx.len-d;if(nn<seMin){if(nx.run)return;return seLen(i,b.len+nx.len-seMin)}nx.len=nn;b.len=nl}
 else{/* the last block of a finished shift: the end moves (not past now or the next shift) */const e=SE.S+B.reduce((q,x)=>q+x.len,0)+d,mx=seMaxEnd();if(e>mx)nl=b.len+(mx-(e-d));b.len=Math.max(seMin,nl)}
 SE.dirty=true}
/* a start time for row i: moves the line between it and the row before */
function seSetStart(i,ts){const S=seStarts(),B=SE.B,e=S[i]+B[i].len;if(ts>=e-seMin+1)ts=e-seMin;
 if(i===0){if(ts<SE.lo)ts=SE.lo;SE.S=ts;B[0].len=e-ts}else{const ps=S[i-1];if(ts<ps+seMin)ts=ps+seMin;B[i-1].len=ts-ps;B[i].len=e-ts}SE.dirty=true}
/* an end time for row i: moves the line between it and the row after (or the shift end) */
function seSetEnd(i,ts){const S=seStarts(),B=SE.B,s=S[i];if(ts<s+seMin)ts=s+seMin;
 if(i<B.length-1){const ne=S[i+1]+B[i+1].len;if(ts>ne-seMin)ts=ne-seMin;B[i+1].len=ne-ts;B[i].len=ts-s}else{if(ts>seMaxEnd())ts=seMaxEnd();B[i].len=Math.max(seMin,ts-s)}SE.dirty=true}
/* the shift end: later adds a break at the end, earlier cuts off whatever is after it */
function seSetShiftEnd(ts){const mx=seMaxEnd();if(ts>mx)ts=mx;const B=SE.B,S=seStarts(),e=seEnd();if(ts<=SE.S+seMin)ts=SE.S+seMin;
 if(ts>e){const l=B[B.length-1];if(l.t==='r'&&!l.o)l.len+=ts-e;else B.push({t:'r',len:ts-e,o:null})}
 else{let k=B.length-1;while(k>0&&S[k]>=ts-seMin+1)k--;B.length=k+1;B[k].len=ts-S[k]}
 SE.dirty=true}
function seSplit(i){const b=SE.B[i];if(b.len<2*seMin)return;const h=Math.round(b.len/2/M)*M;SE.B.splice(i+1,0,{t:b.t,len:b.len-h,o:b.o?Object.assign({},b.o,{d:0,a:null,z:null}):null,run:b.run});b.len=h;b.run=false;SE.open=i+1;SE.dirty=true}
/* add a block next to row i, taking the time from row i, so the rest of the shift stays where it is */
function seAdd(i,t){const B=SE.B,b=B[i];if(b.len<2*seMin)return;const c=Math.min(15*M,Math.round(b.len/2/M)*M);b.len-=c;const nb={t,len:c,o:null};
 if(b.run){B.splice(i,0,nb);SE.open=i}else{B.splice(i+1,0,nb);SE.open=i+1}SE.dirty=true}
function seDel(i){const B=SE.B;if(B.length<2||B[i].run)return;const b=B[i];if(i>0)B[i-1].len+=b.len;else{B[1].len+=b.len}B.splice(i,1);SE.open=null;SE.dirty=true}
function seMove(i,j){const B=SE.B,last=seRun()?B.length-2:B.length-1;if(B[i].run)return;j=Math.max(0,Math.min(last,j));if(i===j)return;const[b]=B.splice(i,1);B.splice(j,0,b);if(SE.open===i)SE.open=j;SE.dirty=true}

/* split part of a block off as another activity: SE.sp = {t, len, at ('start' or 'end')} for the open block */
function seSpDef(b){const t=b.t==='w'?'p':'w',h=Math.max(seMin,Math.round(b.len/2/(5*M))*5*M);return{t,len:Math.min(h,b.len-seMin),at:'end'}}
function seSplitUi(b,i,s){const P=SE.sp||(SE.sp=seSpDef(b)),max=b.len-seMin,L=Math.max(seMin,Math.min(P.len,max)),a=P.at==='start'?[P.t,L,b.t,b.len-L]:[b.t,b.len-L,P.t,L];
 const ch=[15,30,45,60,90,120].filter(m=>m*M<=max);
 return `<div class="sesp"><div class="sepl">Part of it was something else?</div><div class="note" style="margin:-2px 0 6px">For example 45 minutes of this was other work. Pick what, how long and where it goes.</div>
 <div class="fchips fsm">${[seTcOf(b)?'d':'x','w','p','r'].map(k=>`<button type="button" class="fchip${P.t===k?' on':''}" data-sk="pt:${i}:${k}">${SEI[k]} ${k==='x'?'Driving (no tacho)':SEN[k]}</button>`).join('')}</div>
 <div class="sepl">How long was that part?</div><div class="fchips fsm">${ch.map(m=>`<button type="button" class="fchip${L===m*M?' on':''}" data-sk="pl:${i}:${m}">${seF(m*M)}</button>`).join('')}<button type="button" class="fchip${Math.abs(L-Math.round(b.len/2/M)*M)<M?' on':''}" data-sk="ph:${i}">Half</button></div>
 <div class="fstep sestep" style="margin-top:6px"><button type="button" data-sk="pd:${i}:-5">−5</button><span><b>${seF(L)}</b> of ${seF(b.len)}</span><button type="button" data-sk="pd:${i}:5">+5</button></div>
 <div class="sepl">Where does it go?</div><div class="seseg"><button type="button" class="fchip${P.at==='start'?' on':''}" data-sk="pa:${i}:start">↑ At the start</button><button type="button" class="fchip${P.at==='end'?' on':''}" data-sk="pa:${i}:end">↓ At the end</button></div>
 <div class="sepv"><span><i class="k-${a[0]==='x'?'d':a[0]}"></i>${SEI[a[0]]} ${SEN[a[0]]} ${hm(s)}–${hm(s+a[1])}</span><span><i class="k-${a[2]==='x'?'d':a[2]}"></i>${SEI[a[2]]} ${SEN[a[2]]} ${hm(s+a[1])}–${b.run&&P.at==='start'?'now':hm(s+b.len)}</span></div>
 <button type="button" class="tg big fpri" data-sk="pg:${i}" style="margin-top:8px">Split it</button></div>`}
function seSplitInto(i){const B=SE.B,b=B[i],P=SE.sp;if(!P)return;const L=Math.max(seMin,Math.min(P.len,b.len-seMin)),bo=b.o||{},no=P.t===b.t?Object.assign({},bo,{d:0,a:null,z:null}):Object.assign({},bo.j?{j:bo.j}:{},bo.mm?{mm:1}:{}),nb={t:P.t,len:L,o:Object.keys(no).length?no:null};b.len-=L;
 if(P.at==='start')B.splice(i,0,nb);else{B.splice(i+1,0,nb);if(b.run){b.run=false;nb.run=true;nb.o={}}}
 SE.sp=null;SE.open=null;SE.dirty=true}

/* ---- drawing ---- */
function seBar(E){const tot={};E.forEach(x=>{const k=x.t==='x'?'d':x.t;tot[k]=(tot[k]||0)+x.e-x.s});
 return `<div class="sek">${['d','w','p','r'].filter(k=>tot[k]).map(k=>`<span><i class="k-${k}"></i>${k==='d'?'Driving':SEN[k]} ${seF(tot[k])}</span>`).join('')}</div><div class="tkb" aria-hidden="true">${E.map(x=>`<i class="k-${x.t==='x'?'d':x.t}" style="flex:${Math.max(1,Math.round((x.e-x.s)/M))} 0 0"></i>`).join('')}</div>`}
function seRules(E){const W=E.filter(x=>x.t!=='r').map(x=>({s:x.s,e:x.e,t:x.t}));if(!W.length||typeof audRules!=='function')return '';const R=audRules(W);
 return R.length?`<div class="wn" style="margin-top:10px"><b>⚠ This breaks the rules:</b><br>${R.map(r=>'• '+r[0]).join('<br>')}<br><span class="note">If this is what really happened, save it so your record is honest.</span></div>`:`<div class="note ok" style="margin-top:10px">✓ No rules broken in this shift.</div>`}
function seDraw(){const el=$('sed');if(SE&&SE.open==null)SE.sp=null;if(!el||!SE)return;const S=seStarts(),E=seEntries(),end=seEnd(),run=seRun(),day=t=>sod(t)===sod(SE.S)?hm(t):hm(t)+' (+'+Math.round((sod(t)-sod(SE.S))/864e5)+')';
 const row=(b,i)=>{const op=SE.open===i,s=S[i],e=s+b.len;return `<div class="ser${op?' op':''}${b.run?' run':''}" data-row="${i}">
  <div class="serh">${b.run?'<span class="seh off" aria-hidden="true">●</span>':`<span class="seh" data-drag="${i}" aria-label="Drag to move" role="button" tabindex="0">≡</span>`}<button type="button" class="serb" data-sk="o:${i}" aria-expanded="${op}"><i class="k-${b.t==='x'?'d':b.t}"></i><span class="sen">${SEI[b.t]} ${SEN[b.t]}${b.run?' <small>running</small>':''}</span><span class="set">${day(s)}–${b.run?'now':day(e)}</span><span class="sel">${seF(b.len)}</span></button></div>
  ${op?`<div class="sep"><div class="sepl">Type</div><div class="fchips fsm">${seKinds(b).map(k=>`<button type="button" class="fchip${k===b.t?' on':''}" data-sk="t:${i}:${k}">${SEI[k]} ${SEN[k]}</button>`).join('')}</div>
  <div class="tr" style="margin:10px 0 6px"><label>Start<input type="time" data-se="s:${i}" value="${hm(s)}"></label><label>End${b.run?'<input type="text" value="now" disabled>':`<input type="time" data-se="e:${i}" value="${hm(e)}">`}</label></div>
  <div class="sepl">Length</div><div class="fstep sestep"><button type="button" data-sk="l:${i}:-15">−15</button><button type="button" data-sk="l:${i}:-5">−5</button><span><b>${seF(b.len)}</b></span><button type="button" data-sk="l:${i}:5">+5</button><button type="button" data-sk="l:${i}:15">+15</button></div>
  <div class="note" style="margin-top:4px">${b.run?'Changing the length moves its start; the block before gives or takes the time.':i<SE.B.length-1?'Changing the length moves the next block; the rest of the shift stays put.':'This is the last block, so changing it moves the end of the shift.'}</div>
  ${b.len>=2*seMin?seSplitUi(b,i,s):''}
  <div class="sea">${b.run?'':`<button type="button" class="tg" data-sk="u:${i}"${i===0?' disabled':''} aria-label="Move up">↑ Up</button><button type="button" class="tg" data-sk="dn:${i}"${i>=SE.B.length-(run?2:1)?' disabled':''} aria-label="Move down">↓ Down</button>`}${b.run||SE.B.length<2?'':`<button type="button" class="tg bad" data-sk="x:${i}">Delete</button>`}</div></div>`:''}</div>`};
 const endRow=SE.mode==='end'||!run?`<div class="tr seend"><label>${SE.mode==='end'?'End the shift at':'Shift ended at'}<input type="time" data-se="end" value="${hm(end)}"></label>${SE.mode==='end'?`<span class="note">Daily rest counts from then.</span>`:''}</div>`:`<div class="note seend">● ${SEN[run.t]} is running now. Tap End shift below to finish the shift.</div>`;
 const rest=SE.mode==='end'?`<div class="note" style="margin-top:6px">After ending at ${hm(end)}: earliest next start ${tt(end+11*H)} after an 11 hour rest, or ${tt(end+9*H)} with a reduced 9 hour rest. You cannot drive or work again before then unless it counts as part of this shift.</div>`:'';
 el.innerHTML=`<div class="sew"><div class="setop"><button type="button" class="tg" data-sk="close">✕ Close</button><div><b>${SE.mode==='end'?'End Shift':'Edit Shift'}</b><div class="note">${new Date(SE.S).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'})}</div></div></div>
 ${SE.pre?`<div class="note warn" style="margin-bottom:8px">${SE.pre}</div>`:''}
 <p class="note" style="margin:0 0 10px">Drag ≡ to change the order: the times follow and the shift keeps its length. Tap a block to change it.</p>
 <div class="tr sestart"><label>Shift started at<input type="time" data-se="start" value="${hm(SE.S)}"></label><span class="note">${seF(end-SE.S)} in all</span></div>
 ${seBar(E)}<div id="sel">${SE.B.map(row).join('')}</div>${endRow}${rest}${seRules(E)}
 <div class="sebtn"><button type="button" class="tg big fpri" data-sk="save">${SE.mode==='end'?'End shift at '+hm(end):'Save changes'}</button>${SE.mode!=='end'&&run?`<button type="button" class="tg big" data-sk="toend">End shift…</button>`:''}<button type="button" class="tg big" data-sk="close">Cancel</button>${SE.mode==='end'?'':`<button type="button" class="tg big bad" data-sk="clr">Clear this shift</button>`}</div></div>`}

/* ---- events ---- */
function seClick(e){const b=e.target.closest('[data-sk]');if(!b||!SE)return;const[k,a,v]=b.dataset.sk.split(':'),i=+a;
 if(k==='close'){if(SE.dirty){mo(`<h3>Leave Without Saving?</h3><p>Your changes to this shift will be lost.</p><button class="tg big bad" data-k="ok">Leave without saving</button><button class="tg big" data-k="no">Keep editing</button>`);mcb={no:moX,ok:()=>{moX();seClose()}};return}seClose();return}
 if(k==='o'){SE.open=SE.open===i?null:i;SE.sp=null}
 else if(k==='pt'){SE.sp.t=v}else if(k==='pl'){SE.sp.len=+v*M}else if(k==='ph'){SE.sp.len=Math.round(SE.B[i].len/2/M)*M}else if(k==='pd'){SE.sp.len=Math.max(seMin,Math.min(SE.B[i].len-seMin,SE.sp.len+(+v)*M))}else if(k==='pa'){SE.sp.at=v}else if(k==='pg')seSplitInto(i);else if(k==='t'){SE.B[i].t=v;SE.dirty=true}else if(k==='l')seLen(i,SE.B[i].len+(+v)*M);else if(k==='a')seAdd(i,v);else if(k==='sp')seSplit(i);
 else if(k==='u')seMove(i,i-1);else if(k==='dn')seMove(i,i+1);else if(k==='x')seDel(i);else if(k==='toend'){seToEnd();SE.dirty=true}
 else if(k==='save'){seSave();return}else if(k==='clr'){const ss=SE.S;seClose();clearShift(ss,all());return}
 seDraw()}
function seChange(e){const x=e.target.closest('[data-se]');if(!x||!SE||!x.value)return;const[k,a]=x.dataset.se.split(':'),i=+a,S=seStarts();
 const near=(v,ref)=>nearT(v,ref);
 if(k==='start')seSetStart(0,near(x.value,SE.S));
 else if(k==='end')seSetShiftEnd(near(x.value,seEnd()));
 else if(k==='s')seSetStart(i,near(x.value,S[i]));else if(k==='e')seSetEnd(i,near(x.value,S[i]+SE.B[i].len));
 seDraw()}

/* drag by the handle: the row follows the finger, the others make room, and it drops where it is let go */
let seDrag=null;
function seDown(e){const h=e.target.closest('[data-drag]');if(!h||!SE)return;e.preventDefault();const i=+h.dataset.drag,list=$('sel'),rows=[...list.children],row=rows[i];
 const R=rows.map(r=>{const b=r.getBoundingClientRect();return{top:b.top,h:b.height}});const lim=seRun()?SE.B.length-2:SE.B.length-1;
 seDrag={i,to:i,y0:e.clientY,sc0:$('sed').scrollTop,rows,R,row,lim,id:e.pointerId};row.classList.add('drag');try{h.setPointerCapture(e.pointerId)}catch(er){}
 h.addEventListener('pointermove',seMoveEv);h.addEventListener('pointerup',seUp);h.addEventListener('pointercancel',seUp)}
function seMoveEv(e){const D=seDrag;if(!D)return;const sed=$('sed');if(e.clientY<90)sed.scrollTop-=12;else if(e.clientY>innerHeight-90)sed.scrollTop+=12;
 const dy=e.clientY-D.y0+(sed.scrollTop-D.sc0);D.row.style.transform=`translateY(${dy}px)`;const c=D.R[D.i].top+D.R[D.i].h/2+dy;
 let to=D.i;for(let k=0;k<=D.lim;k++){const m=D.R[k].top+D.R[k].h/2;if(k<D.i&&c<m){to=k;break}if(k>D.i&&c>m)to=k}D.to=to;
 D.rows.forEach((r,k)=>{if(k===D.i)return;let t=0;if(D.i<to&&k>D.i&&k<=to)t=-D.R[D.i].h;else if(D.i>to&&k>=to&&k<D.i)t=D.R[D.i].h;r.style.transform=t?`translateY(${t}px)`:''})}
function seUp(e){const D=seDrag;if(!D)return;const h=e.currentTarget;h.removeEventListener('pointermove',seMoveEv);h.removeEventListener('pointerup',seUp);h.removeEventListener('pointercancel',seUp);seDrag=null;
 D.rows.forEach(r=>{r.style.transform=''});D.row.classList.remove('drag');if(D.to!==D.i)seMove(D.i,D.to);seDraw()}

/* ---- saving ---- */
function seSave(){const sv=JSON.stringify(st),E=seEntries(),n=Date.now(),from=Math.min(SE.S0,SE.S),endN=seEnd(),to=Math.max(SE.E0,endN,SE.mode==='end'||seRun()?n:0),mainJ=(()=>{const c={};SE.B.forEach(b=>{if(b.o&&b.o.j)c[b.o.j]=(c[b.o.j]||0)+b.len});const k=Object.keys(c).sort((a,b)=>c[b]-c[a])[0];return k||st.cj})();
 const out=[];E.forEach((x,i)=>{const b=SE.B[i];if(x.run)return;const o=Object.assign({},b.o||{});['s','e','t','live','run'].forEach(k=>delete o[k]);if(x.t!=='d'){delete o.d;delete o.a;delete o.z}
  const y=Object.assign(o,{s:x.s,e:x.e,t:x.t,chk:1});if(x.t!=='r'&&jobsOn()){y.j=o.j||mainJ;y.c=x.t==='d'?1:x.t==='x'?0:jobC(y.j).tc!==false?1:0}if(x.t==='r'){delete y.j;delete y.c;delete y.cd}if(x.t!=='p')delete y.cd;
  const l=out[out.length-1];if(l&&l.t===y.t&&l.e===y.s&&(l.j||'')===(y.j||'')&&!!l.cd===!!y.cd){l.e=y.e;if(y.d)l.d=(l.d||0)+y.d}else out.push(y)});
 clear(from,to,1);out.forEach(x=>st.sessions.push(x));if(st.rs&&from<st.rs)st.rs=from;
 const r=seRun(),ended=SE.mode==='end';
 if(r){const x=E[E.length-1];st.active=x.s;if(st.act!==r.t){st.act=r.t;if(r.t!=='p')st.pcd=0}}
 else if(st.active&&(ended||SE.B.some(b=>b.wasRun))){if(st.act==='d'&&typeof gpsOff==='function')gpsOff();st.active=null;st.act=null;st.ad=0;st.as=st.ae=null}
 if(ended)st.se=endN;else if(st.se&&Math.abs(st.se-SE.E0)<M)st.se=endN;
 seClose();save();render();usnap=sv;snap=sv;
 flash=(ended?'Shift ended at '+hm(endN)+'. Your daily rest is counting.':'Shift saved.')+' <button class="tg" data-ua="1" style="margin-left:6px">Undo</button>';setTimeout(()=>{if(usnap===sv){flash='';live()}},12000);live();
 /* nothing running and the shift not ended: has it finished? */
 if(!ended&&!st.active&&!(st.se&&st.se>=endN-6e4)&&!st.sessions.some(x=>(x.t||'d')!=='r'&&x.s>=endN)&&Date.now()-endN>=5*M){mo(`<h3>Has This Shift Ended?</h3><p>Nothing is running and the shift has not been ended, so the time since <b>${hm(endN)}</b> counts as a break, not rest.</p><button class="tg big fpri" data-k="y">Yes, it ended at ${hm(endN)}</button><button class="tg big" data-k="no">No, I am on a break</button>`);mcb={no:()=>{st.ebq=endN;save();moX();live()},y:()=>{st.se=endN;save();moX();render()}}}}

/* ---- on the Today screen ---- */
/* nothing logged for an hour or more and the shift not ended (or only a break running): did it end? */
function ecqLast(){if(st.active&&st.act!=='r')return null;const a=all(),l=a[a.length-1];if(!l||l.live)return null;const n=Date.now();if(st.se&&st.se>=l.e-6e4)return null;if(n-l.e<60*M||n-l.e>=9*H||st.ebq===l.e)return null;return l}
const ecqNeed=()=>!!ecqLast();
let shlAll=false;
function seToday(){const eq=$('ecq'),sl=$('shl');if(!eq||!sl)return;const n=Date.now(),l=ecqLast();
 set(eq,l?`<div class="ecq"><b>Did your shift end at ${hm(l.e)}?</b><span class="note">Nothing has been logged since then (${seF(n-l.e)} ago)${st.active&&st.act==='r'?' apart from a break':''}. Until you answer, TachoGuard counts it as a break, not rest, and says you could carry on.</span><div class="ecb"><button class="tg fpri" data-ec="y">Yes, at ${hm(l.e)}</button><button class="tg" data-ec="t">Another time</button><button class="tg" data-ec="b">I am on a break</button></div></div>`:'');
 /* this shift, newest last: tap an entry to change it */
 const c=seShift(null);let h='';if(c){const live=c.some(x=>x.live)||(st.active&&st.act==='r'),last=c[c.length-1].e;if(live||n-last<12*H){const B=seBlocks(c);let s=c[0].s;const R=B.map(b=>{const r={b,s};s+=b.len;return r}),show=shlAll||R.length<=5?R:R.slice(-5);
  h=`<div class="shl"><div class="shlh"><b>This shift</b><button class="tg" data-sh="edit">✎ Edit</button></div>${show.length<R.length?`<button class="shr" data-sh="all" style="justify-content:center;display:block;text-align:center;color:var(--acc)">Show all ${R.length} entries</button>`:''}${show.map(({b,s})=>`<button class="shr${b.run?' run':''}" data-sh="${s+1}"><i class="k-${b.t==='x'?'d':b.t}"></i><span>${SEI[b.t]} ${SEN[b.t]}</span><span class="tm">${hm(s)}–${b.run?'now':hm(s+b.len)}</span><span class="ln">${seF(b.len)}</span><span class="ch">›</span></button>`).join('')}</div>`}}
 set(sl,h)}
document.addEventListener('click',e=>{const q=e.target.closest('[data-ec]');if(q){const l=ecqLast();if(!l)return;const k=q.dataset.ec;
  if(k==='y'){const sv=JSON.stringify(st);if(st.active&&st.act==='r'){st.active=null;st.act=null}st.se=l.e;save();render();usnap=sv;snap=sv;flash='Shift ended at '+hm(l.e)+'. Your daily rest counts from then. <button class="tg" data-ua="1" style="margin-left:6px">Undo</button>';setTimeout(()=>{if(usnap===sv){flash='';live()}},12000);live()}
  else if(k==='t')seOpen(null,'end');else{st.ebq=l.e;save();live()}return}
 const r=e.target.closest('[data-sh]');if(!r)return;const v=r.dataset.sh;if(v==='all'){shlAll=true;live();return}if(v==='edit'){seOpen(null,'edit');return}const t=+v;seOpen(t,'edit',null,t)});
