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
 if(SE.mode==='end'){seToEnd();/* the end time is what you came to set, so its box starts open */SE.bd='end';SE.bd0=seEnd()}
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
/* delete row i: the row before (or after) takes its time; move a row: the times follow, the shift keeps its length */
function seDel(i){const B=SE.B;if(B.length<2||B[i].run)return;const b=B[i];if(i>0)B[i-1].len+=b.len;else{B[1].len+=b.len}B.splice(i,1);SE.open=null;SE.dirty=true}
function seMove(i,j){const B=SE.B,last=seRun()?B.length-2:B.length-1;if(B[i].run)return;j=Math.max(0,Math.min(last,j));if(i===j)return;const[b]=B.splice(i,1);B.splice(j,0,b);if(SE.open===i)SE.open=j;SE.dirty=true}

function seBar(E){const tot={};E.forEach(x=>{const k=x.t==='x'?'d':x.t;tot[k]=(tot[k]||0)+x.e-x.s});
 return `<div class="sek">${['d','w','p','r'].filter(k=>tot[k]).map(k=>`<span><i class="k-${k}"></i>${k==='d'?'Driving':SEN[k]} ${seF(tot[k])}</span>`).join('')}</div><div class="tkb" aria-hidden="true">${E.map(x=>`<i class="k-${x.t==='x'?'d':x.t}" style="flex:${Math.max(1,Math.round((x.e-x.s)/M))} 0 0"></i>`).join('')}</div>`}
function seRules(E){const W=E.filter(x=>x.t!=='r').map(x=>({s:x.s,e:x.e,t:x.t}));if(!W.length||typeof audRules!=='function')return '';const R=audRules(W);
 return R.length?`<div class="wn" style="margin-top:10px"><b>⚠ This breaks the rules:</b><br>${R.map(r=>'• '+r[0]).join('<br>')}<br><span class="note">If this is what really happened, save it so your record is honest.</span></div>`:`<div class="note ok" style="margin-top:10px">✓ No rules broken in this shift.</div>`}
/* ---- the new editing tools ----
   Change-overs: the time between two entries is a button; moving it changes the end of one and the start of the next, nothing
   else. Add: something you forgot (a break, some driving) put in at a time, cutting into what was logged there; nothing else
   moves. Split into pieces: one entry becomes several, in order, the last one taking what is left. Each shows what changes
   (before and after) before you apply it. SE.bd: the change-over being moved (row index i = between i and i+1, -1 = shift start,
   'end' = shift end), SE.bd0 its time when opened. SE.pan: {k:'add', t, s, len} or {k:'split', i, P:[{t,len}]}. */
const seStepBtns=(k,steps)=>`<div class="sesteps">${steps.map(d=>`<button type="button" data-sk="${k}:${d}">${d<0?'−'+(-d):'+'+d}</button>`).join('')}</div>`;
const seBdTime=k=>k===-1?SE.S:k==='end'?seEnd():seStarts()[k]+SE.B[k].len;
function seBdSet(k,ts){if(k===-1)seSetStart(0,ts);else if(k==='end')seSetShiftEnd(ts);else seSetEnd(k,ts)}
/* entries with their source details, for cutting and rebuilding */
function seList(){const S=seStarts();return SE.B.map((b,i)=>({s:S[i],e:S[i]+b.len,t:b.t,o:b.o,run:b.run}))}
function seFromList(L){L.sort((a,b)=>a.s-b.s);const B=[];let pe=null;L.forEach(x=>{if(x.e-x.s<3e4)return;if(pe!==null&&x.s>pe+3e4)B.push({t:'r',len:x.s-pe,o:null});
  const l=B[B.length-1];if(l&&l.t===x.t&&!l.run&&!x.run&&JSON.stringify(l.o||null)===JSON.stringify(x.o||null)&&pe===x.s)l.len+=x.e-x.s;else B.push({t:x.t,len:x.e-x.s,o:x.o||null,run:!!x.run});pe=x.e});
 return{S:L.length?L[0].s:SE.S,B}}
/* put t from s to e into a list of entries, cutting what is there (driving cut in pieces loses its distance) */
function seCarve(L,s,e,t){const out=[];L.forEach(x=>{if(x.e<=s||x.s>=e){out.push(x);return}
  const cut=o=>o?Object.assign({},o,{d:0,a:null,z:null}):null;if(x.s<s)out.push(Object.assign({},x,{e:s,run:false,o:cut(x.o)}));if(x.e>e)out.push(Object.assign({},x,{s:e,o:cut(x.o)}))});
 out.push({s,e,t,o:null});return out}
/* what the add panel would make: the new list, and the clamped start and end */
function seAddCalc(P){const L=seList(),lo=Math.max(SE.lo,SE.S-6*H),run=seRun(),hiE=run?Date.now():Math.max(seEnd(),Math.min(seMaxEnd(),seEnd()+6*H));
 let s=Math.max(lo,P.s),e=Math.min(run?hiE-M:hiE,s+P.len*M);if(e-s<M)return null;const L2=seCarve(L,s,e,P.t);
 /* a gap left between a new start and the old first entry, or the old end and a new last one, is a break */
 return{L:L2,s,e}}
/* what the split panel would make */
function seSplitCalc(P){const L=seList(),x=L[P.i];if(!x)return null;const used=P.P.slice(0,-1).reduce((q,p)=>q+p.len*M,0);if(used>=x.e-x.s-M+1)return null;let c=x.s;
 const parts=P.P.map((p,k)=>{const len=k<P.P.length-1?p.len*M:x.e-c,y={s:c,e:c+len,t:p.t,o:p.t===x.t&&k===0?x.o:x.o?Object.assign({},x.o,{d:0,a:null,z:null}):null,run:k===P.P.length-1?x.run:false};c+=len;return y});
 return{L:L.slice(0,P.i).concat(parts,L.slice(P.i+1)),parts,x}}
const seLine=x=>`<div class="sedf"><i class="k-${x.t==='x'?'d':x.t}"></i>${SEI[x.t]} ${SEN[x.t]} <span>${hm(x.s)}–${x.run?'now':hm(x.e)}</span><b>${seF(x.e-x.s)}</b></div>`;
function seDiff(A,B,s,e){/* the entries touching s..e, before and after */const near=x=>x.e>s-1&&x.s<e+1;const a=A.filter(near),b=B.filter(near);
 return `<div class="sedif"><div><div class="sedh">Before</div>${a.map(seLine).join('')||'<div class="note">Nothing logged then</div>'}</div><div><div class="sedh">After</div>${b.map(seLine).join('')}</div></div>`}
function sePanel(){const P=SE.pan,typeChips=(cur,k)=>`<div class="fchips fsm">${seKinds(null).map(t=>`<button type="button" class="fchip${t===cur?' on':''}" data-sk="${k}:${t}">${SEI[t]} ${SEN[t]}</button>`).join('')}</div>`;
 if(P.k==='add'){const C=seAddCalc(P);
  return `<div class="sepan"><h3>Add something you forgot</h3><p class="note">It goes in at the time you set and takes the place of whatever was logged then. Nothing else moves.</p>
  <div class="sepl">What was it?</div>${typeChips(P.t,'at')}
  <div class="sepl">When did it start?</div><div class="tr"><input type="time" data-se="as" value="${hm(P.s)}"></div>${seStepBtns('as',[-15,-5,-1,1,5,15])}
  <div class="sepl">How long?</div><div class="fchips fsm">${[5,10,15,20,30,45,60,90].map(m=>`<button type="button" class="fchip${P.len===m?' on':''}" data-sk="al:${m}">${seF(m*M)}</button>`).join('')}</div><div class="tcv"><b>${seF(P.len*M)}</b></div>${seStepBtns('ad',[-15,-5,-1,1,5,15])}
  ${C?seDiff(seList(),C.L.slice().sort((a,b)=>a.s-b.s),C.s,C.e):'<div class="note bad">That does not fit. Change the time.</div>'}
  <div class="sebtn"><button type="button" class="tg big fpri" data-sk="pa:go"${C?'':' disabled'}>Add it</button><button type="button" class="tg big" data-sk="pa:x">Back</button></div></div>`}
 const C=seSplitCalc(P),x=seList()[P.i];
 return `<div class="sepan"><h3>Split into pieces</h3><p class="note">${SEI[x.t]} ${SEN[x.t]} ${hm(x.s)}–${x.run?'now':hm(x.e)} (${seF(x.e-x.s)}). Set each piece in order; the last one takes what is left.</p>
 ${P.P.map((p,k)=>{const last=k===P.P.length-1,len=C?C.parts[k].e-C.parts[k].s:p.len*M;return `<div class="sepc"><div class="sepch"><b>Piece ${k+1}</b>${C?`<span>${hm(C.parts[k].s)}–${last&&x.run?'now':hm(C.parts[k].e)}</span>`:''}${P.P.length>2?`<button type="button" class="tg" data-sk="pr:${k}" aria-label="Remove piece">✕</button>`:''}</div>${typeChips(p.t,'pt:'+k)}
  ${last?`<div class="note">The rest: <b>${seF(len)}</b></div>`:`<div class="tcv"><b>${seF(p.len*M)}</b></div>${seStepBtns('pl:'+k,[-15,-5,-1,1,5,15])}`}</div>`}).join('')}
 <button type="button" class="tg big sespb" data-sk="pp:add">＋ Add another piece</button>
 ${C?seDiff([x],C.parts,x.s,x.e):'<div class="note bad">The pieces are longer than the entry. Make one shorter.</div>'}
 <div class="sebtn"><button type="button" class="tg big fpri" data-sk="pp:go"${C?'':' disabled'}>Split it</button><button type="button" class="tg big" data-sk="pp:x">Back</button></div></div>`}
function seDraw(){const el=$('sed');if(!el||!SE)return;const S=seStarts(),E=seEntries(),end=seEnd(),run=seRun(),day=t=>sod(t)===sod(SE.S)?hm(t):hm(t)+' (+'+Math.round((sod(t)-sod(SE.S))/864e5)+')';
 const top=`<div class="setop"><button type="button" class="tg" data-sk="close">✕ Close</button><div><b>${SE.mode==='end'?'End Shift':'Edit Shift'}</b><div class="note">${new Date(SE.S).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'})}</div></div></div>`;
 if(SE.pan){el.innerHTML=`<div class="sew">${top}${sePanel()}</div>`;return}
 /* a change-over: the time between two entries (or the start or end of the shift), and the box to move it */
 const bd=(k,lab)=>{const t=seBdTime(k),op=SE.bd===k,was=op&&SE.bd0!=null&&Math.abs(SE.bd0-t)>=M?` (was ${hm(SE.bd0)})`:'';
  const what=k===-1?`The shift starts at <b>${hm(t)}</b>${was}. The first entry follows; nothing else moves.`:k==='end'?`The shift ends at <b>${hm(t)}</b>${was}. The last entry follows; nothing else moves.`:`${SEI[SE.B[k].t]} ${SEN[SE.B[k].t]} ends and ${SEI[SE.B[k+1].t]} ${SEN[SE.B[k+1].t]} starts at <b>${hm(t)}</b>${was}. Nothing else moves.`;
  return `<button type="button" class="sebd${op?' op':''}" data-sk="bd:${k}" aria-expanded="${op}"><span>${lab||''}</span><b>${day(t)}</b><span class="sebdi">${op?'▴':'✎'}</span></button>${op?`<div class="sebs">${seStepBtns('bm:'+k,[-15,-5,-1,1,5,15])}<div class="tr"><label>Or type the time<input type="time" data-se="bd:${k}" value="${hm(t)}"></label></div><div class="note">${what}</div></div>`:''}`};
 const row=(b,i)=>{const op=SE.open===i,s=S[i],e=s+b.len;return `<div class="ser${op?' op':''}${b.run?' run':''}" data-row="${i}"><div class="serh">${b.run?'<span class="seh off" aria-hidden="true">●</span>':`<span class="seh" data-drag="${i}" aria-label="Drag to move" role="button" tabindex="0">≡</span>`}<button type="button" class="serb" data-sk="o:${i}" aria-expanded="${op}"><i class="k-${b.t==='x'?'d':b.t}"></i><span class="sen">${SEI[b.t]} ${SEN[b.t]}${b.run?' <small>running</small>':''}</span><span class="set">${day(s)}–${b.run?'now':day(e)}</span><span class="sel">${seF(b.len)}</span></button></div>
  ${op?`<div class="sep"><div class="fchips fsm">${seKinds(b).map(k=>`<button type="button" class="fchip${k===b.t?' on':''}" data-sk="t:${i}:${k}">${SEI[k]} ${SEN[k]}</button>`).join('')}</div>
  <div class="sea">${b.len>=2*seMin?`<button type="button" class="tg" data-sk="sp2:${i}">✂ Split into pieces</button>`:''}<button type="button" class="tg" data-sk="addin:${i}">＋ Add something in it</button>${b.run?'':`<button type="button" class="tg" data-sk="u:${i}"${i===0?' disabled':''} aria-label="Move up">↑</button><button type="button" class="tg" data-sk="dn:${i}"${i>=SE.B.length-(run?2:1)?' disabled':''} aria-label="Move down">↓</button>`}${b.run||SE.B.length<2?'':`<button type="button" class="tg bad" data-sk="x:${i}" aria-label="Delete">🗑</button>`}</div></div>`:''}</div>`};
 const list=bd(-1,'Started')+SE.B.map((b,i)=>row(b,i)+(i<SE.B.length-1?bd(i):'')).join('')+(run?`<div class="note seend">● ${SEN[run.t]} is running now. Tap End shift below to finish the shift.</div>`:bd('end',SE.mode==='end'?'End the shift at':'Ended'));
 const rest=SE.mode==='end'?`<div class="note" style="margin-top:6px">After ending at ${hm(end)} you can start again at ${tt(end+11*H)} (an 11 hour rest), or ${tt(end+9*H)} with a reduced 9 hour rest.</div>`:'';
 el.innerHTML=`<div class="sew">${top}${SE.pre?`<div class="note warn" style="margin-bottom:8px">${SE.pre}</div>`:''}
 <p class="note" style="margin:0 0 8px">Tap a time to move it. Tap an entry to change what it was, split it into pieces, or add something in it. Drag ≡ to reorder.</p>
 ${seBar(E)}<button type="button" class="tg big seadd" data-sk="pan:add">＋ Add something I forgot</button><div id="sel">${list}</div>${rest}${seRules(E)}
 <div class="sebtn"><button type="button" class="tg big fpri" data-sk="save">${SE.mode==='end'?'End shift at '+hm(end):'Save changes'}</button>${SE.mode!=='end'&&run?`<button type="button" class="tg big" data-sk="toend">End shift…</button>`:''}<button type="button" class="tg big" data-sk="close">Cancel</button>${SE.mode==='end'?'':`<button type="button" class="tg big bad" data-sk="clr">Clear this shift</button>`}</div></div>`}

function seClick(e){const b=e.target.closest('[data-sk]');if(!b||!SE)return;SE.redraw=false;const[k,a,v]=b.dataset.sk.split(':'),i=+a,P=SE.pan;
 if(k==='close'){if(SE.dirty){mo(`<h3>Leave Without Saving?</h3><p>Your changes to this shift will be lost.</p><button class="tg big bad" data-k="ok">Leave without saving</button><button class="tg big" data-k="no">Keep editing</button>`);mcb={no:moX,ok:()=>{moX();seClose()}};return}seClose();return}
 const bk=a==='end'?'end':i;
 if(k==='o'){SE.open=SE.open===i?null:i;SE.bd=null}
 else if(k==='bd'){SE.bd=SE.bd===bk?null:bk;SE.bd0=SE.bd===null?null:seBdTime(bk);SE.open=null}
 else if(k==='bm'){seBdSet(bk,seBdTime(bk)+(+v)*M)}
 else if(k==='t'){SE.B[i].t=v;SE.dirty=true}
 else if(k==='u')seMove(i,i-1);else if(k==='dn')seMove(i,i+1);else if(k==='x')seDel(i);
 else if(k==='sp2'){const x=SE.B[i],oth=x.t==='r'?(seTcOf(x)?'d':'x'):'r';SE.pan={k:'split',i,P:[{t:x.t,len:Math.max(1,Math.min(60,Math.round(x.len/2/M)))},{t:oth,len:15},{t:x.t,len:0}]};if(x.len<=(SE.pan.P[0].len+16)*M)SE.pan.P=[{t:x.t,len:Math.max(1,Math.round(x.len/2/M))},{t:oth,len:0}]}
 else if(k==='pan'||k==='addin'){const run=seRun(),s0=k==='addin'?seStarts()[i]+Math.min(30*M,Math.round(SE.B[i].len/3/M)*M):(run?Date.now():seEnd())-60*M;SE.pan={k:'add',t:'r',s:Math.max(SE.S,Math.round(s0/M)*M),len:15}}
 else if(P&&k==='at')P.t=a;else if(P&&k==='as')P.s+=(+a)*M;else if(P&&k==='al')P.len=+a;else if(P&&k==='ad')P.len=Math.max(1,P.len+(+a));
 else if(P&&k==='pa'){if(a==='go'){const C=seAddCalc(P);if(!C)return;const R=seFromList(C.L);SE.S=R.S;SE.B=R.B;SE.dirty=true;SE.open=null}SE.pan=null}
 else if(P&&k==='pt')P.P[i].t=v;else if(P&&k==='pl')P.P[i].len=Math.max(1,P.P[i].len+(+v));else if(P&&k==='pr')P.P.splice(i,1);
 else if(P&&k==='pp'){if(a==='add')P.P.splice(P.P.length-1,0,{t:'r',len:15});else{if(a==='go'){const C=seSplitCalc(P);if(!C)return;const R=seFromList(C.L);SE.S=R.S;SE.B=R.B;SE.dirty=true;SE.open=null}SE.pan=null}}
 else if(k==='toend'){seToEnd();SE.dirty=true}
 else if(k==='save'){seSave();return}else if(k==='clr'){const ss=SE.S;seClose();clearShift(ss,all());return}
 seDraw();if(k==='sp2'||k==='pan'||k==='addin'||(P&&(k==='pa'||(k==='pp'&&a!=='add')))){const el=$('sed');if(el)el.scrollTop=0}}

function seChange(e){const x=e.target.closest('[data-se]');if(!x||!SE||x.value==='')return;const[k,a]=x.dataset.se.split(':');
 if(k==='as'&&SE.pan)SE.pan.s=nearT(x.value,SE.pan.s);
 else if(k==='bd'){const bk=a==='end'?'end':+a;seBdSet(bk,nearT(x.value,seBdTime(bk)))}
 /* redraw after the box has finished losing focus; if a finger is down (you tapped a button straight after typing), wait until
    the tap is done, so the button you tapped is still there to take it */
 if(sePtr)SE.redraw=true;else setTimeout(seDraw,0)}
let sePtr=false;
document.addEventListener('pointerdown',e=>{if(e.target.closest&&e.target.closest('#sed'))sePtr=true},true);
document.addEventListener('pointerup',()=>{if(!sePtr)return;setTimeout(()=>{sePtr=false;if(SE&&SE.redraw){SE.redraw=false;seDraw()}},60)},true);
document.addEventListener('pointercancel',()=>{sePtr=false},true);

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
function seSave(){const sv=JSON.stringify(st),E=seEntries(),n=Date.now(),from=Math.min(SE.S0,SE.S),endN=seEnd(),to=Math.min(SE.hi,Math.max(SE.E0,endN,SE.mode==='end'||seRun()?n:0)),/* never past the start of the next shift */mainJ=(()=>{const c={};SE.B.forEach(b=>{if(b.o&&b.o.j)c[b.o.j]=(c[b.o.j]||0)+b.len});const k=Object.keys(c).sort((a,b)=>c[b]-c[a])[0];return k||st.cj})();
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
  h=`<div class="shl"><div class="shlh"><b>This shift</b><button class="tg" data-sh="edit">✎ Edit</button></div>${show.length<R.length?`<button class="shr" data-sh="all" style="justify-content:center;display:block;text-align:center;color:var(--acc)">Show all ${R.length} entries</button>`:''}${show.map(({b,s})=>`<button class="shr${b.run?' run':''}" data-sh="${s+1}"><i class="k-${b.t==='x'?'d':b.t}"></i><span>${SEI[b.t]} ${SEN[b.t]}</span><span class="tm">${hm(s)}–${b.run?'now':hm(s+b.len)}</span><span class="ln">${seF(b.len)}</span><span class="ch">›</span></button>`).join('')}${B.some(b=>b.t==='p')&&!(st.active&&st.act==='p')?`<div class="note shp">◪ POA pauses your working time but is not a break${c.some(x=>x.cd)?'. As the passenger, the first 45 minutes counts as a driving break only':''}. <button class="tg" data-lrg="poa">What counts?</button></div>`:''}</div>`}}
 set(sl,h)}
document.addEventListener('click',e=>{const q=e.target.closest('[data-ec]');if(q){const l=ecqLast();if(!l)return;const k=q.dataset.ec;
  if(k==='y'){const sv=JSON.stringify(st);if(st.active&&st.act==='r'){st.active=null;st.act=null}st.se=l.e;save();render();usnap=sv;snap=sv;flash='Shift ended at '+hm(l.e)+'. Your daily rest counts from then. <button class="tg" data-ua="1" style="margin-left:6px">Undo</button>';setTimeout(()=>{if(usnap===sv){flash='';live()}},12000);live()}
  else if(k==='t')seOpen(null,'end');else{st.ebq=l.e;save();live()}return}
 const r=e.target.closest('[data-sh]');if(!r)return;const v=r.dataset.sh;if(v==='all'){shlAll=true;live();return}if(v==='edit'){seOpen(null,'edit');return}const t=+v;seOpen(t,'edit',null,t)});
