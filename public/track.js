/* TachoGuard: accounting for your time, the easy way.
   One screen, acctAsk, turns rough answers ("about 2 hours of driving, a 15 and a 30 minute break") into log entries in a sensible
   order, with the breaks where the rules want them, and says what the rules make of it. It is used when:
   - you start a shift later than you really started (tkStartAsk: when did you start?),
   - you come back to the app after a while in the middle of a shift (tkAway: what did you do since?),
   - you log a whole shift afterwards (tkQuick).
   Settings: st.rsl = minutes after a planned start to ask if you started (0 off, 30 by default),
             st.awy = minutes away from the app, during a shift, before it asks what you did (0 off, 60 by default). */
const TKSEEN='tachoguard.seen';
const tkSeen=()=>{try{return +localStorage.getItem(TKSEEN)||0}catch(e){return 0}};
const tkMark=()=>{try{localStorage.setItem(TKSEEN,String(Date.now()))}catch(e){}};
const tkRsl=()=>st.rsl===undefined?30:+st.rsl||0,tkAwy=()=>st.awy===undefined?60:+st.awy||0;
const tkF=m=>{m=Math.round(m);const h=Math.floor(m/60),r=m%60;return h?h+'h'+(r?' '+r+'m':''):r+'m'};
const tkLow=k=>k==='p'?'POA':TKN[k].toLowerCase(),TKN={d:'Driving',w:'Other work',p:'POA',r:'Break'},TKI={d:'🚛',w:'⚒',p:'◪',r:'🛏'};

/* Location (st.gloc on): a rough snapshot of where you are each time the app is opened, kept on this phone only (tachoguard.loc,
   the last 3 days), and saved places (st.places: [{id, n, lat, lon}]), so the questions can say how far you have moved and
   suggest a driving time. Nothing here tracks you in the background: it only looks while the app is open. */
const TKLOC='tachoguard.loc';
/* the job a stretch is logged against, when it is not the current one (filling in a planned shift) */
let tkJ=null;
const tkLocs=()=>{try{return JSON.parse(localStorage.getItem(TKLOC)||'[]')}catch(e){return[]}};
const tkLocOn=()=>!!st.gloc&&!!navigator.geolocation;
function tkLocAdd(c){const L=tkLocs().filter(x=>x.t>Date.now()-3*864e5),l=L[L.length-1];if(l&&c.t-l.t<5*M&&hav(l,c)<300)L[L.length-1]=c;else L.push(c);try{localStorage.setItem(TKLOC,JSON.stringify(L.slice(-80)))}catch(e){}}
/* where you are now (null if location is off, blocked or too slow); also saved as a snapshot */
function tkPos(maxAge,force){return new Promise(res=>{if(!(force?navigator.geolocation:tkLocOn()))return res(null);let done=false;const fin=v=>{if(!done){done=true;clearTimeout(tm);res(v)}},tm=setTimeout(()=>fin(null),9000);
 try{navigator.geolocation.getCurrentPosition(p=>{if(p.coords.accuracy>2000)return fin(null);const c={t:Date.now(),lat:p.coords.latitude,lon:p.coords.longitude,a:Math.round(p.coords.accuracy)};tkLocAdd(c);fin(c)},e=>{tkLocErr=e&&e.code===1?'blocked':'nofix';fin(null)},{enableHighAccuracy:false,maximumAge:maxAge===undefined?60000:maxAge,timeout:8500})}catch(e){fin(null)}})}
let tkLocErr='';
/* the snapshot taken nearest before time t (up to 45 minutes before, or 5 after) */
const tkLocAt=t=>{const L=tkLocs().filter(x=>x.t<=t+5*M&&x.t>=t-45*M);return L.length?L[L.length-1]:null};
const tkMi=(a,b)=>hav(a,b)/1609.34,tkMiTxt=m=>m<10?m.toFixed(1).replace(/\.0$/,''):String(Math.round(m));
const tkNear=c=>{if(!c)return null;let b=null;(st.places||[]).forEach(p=>{const d=hav(p,c);if(d<1000&&(!b||d<b.d))b={p,d}});return b?b.p:null};
/* a rough driving time for a straight-line distance: roads are about a quarter longer, at about 40 mph on average */
const tkDrv=mi=>Math.max(15,Math.round(mi*1.25/40*60/15)*15);
/* what to say about the distance, and the driving to suggest: a = where you were (a place or snapshot), b = here */
function tkGeo(a,b,name,fill){if(!a||!b)return null;const m=tkMi(a,b),nm=name||'where you were at '+hm(a.t);
 if(m<1.5)return{txt:`📍 You are still near ${esc(nm)}.`,d:0,mi:m};
 const d=tkDrv(m);return{txt:`📍 You are about <b>${tkMiTxt(m)} miles</b> from ${esc(nm)} (in a straight line). That is roughly <b>${tkF(d)}</b> of driving${fill?', so it is filled in below. Change it if it is wrong':''}.`,d:fill?d:0,mi:m}}
/* Save a place: name it, and it is stored where you are now */
function tkPlaceAdd(back){const go=back||moX;
 mo(`<h3>Save This Place</h3><p>Saves where you are now, so when you start a shift you can tap it to say where you started. TachoGuard then works out how far you have come.</p><div class="fchips">${['Home','Depot','Yard','Base'].map(x=>`<button type="button" class="fchip" data-k="q${x}">${x}</button>`).join('')}</div><label class="fother">Name<input id="tkpn" maxlength="30" placeholder="For example Depot"></label><div class="note bad" id="tkpe"></div><button class="tg big fpri" data-k="ok">Save where I am now</button><button class="tg big" data-k="no">Cancel</button>`);
 mcb={no:go,ok:async()=>{const n=$('tkpn').value.trim();if(!n){$('tkpe').textContent='Give it a name.';return}$('tkpe').textContent='Finding where you are…';const c=await tkPos(0,true);
  if(!c){$('tkpe').textContent=tkLocErr==='blocked'?'Location is blocked. Allow location for this site in Chrome, then try again.':'Could not get a location fix. Try again outside or by a window.';return}
  st.places=(st.places||[]).filter(x=>x.n.toLowerCase()!==n.toLowerCase()).concat([{id:Date.now().toString(36),n,lat:+c.lat.toFixed(5),lon:+c.lon.toFixed(5)}]).slice(-12);if(!st.gloc)st.gloc=true;save();live();go()}};
 ['Home','Depot','Yard','Base'].forEach(x=>mcb['q'+x]=()=>{$('tkpn').value=x})}
/* a short wait while it finds where you are */
function tkWait(msg,p,then){let done=false;mo(`<h3>One Moment</h3><p>📍 ${msg}</p><button class="tg big" data-k="no">Skip this</button>`);mcb={no:()=>{done=true;then(null)}};p.then(v=>{if(!done){done=true;then(v)}})}

/* Lay rough amounts over a stretch of time. Breaks first (one break in the advised window, several spread evenly), then the work
   in this order: a little other work to start (checks), driving, POA, then the rest as the main activity (def). */
function tkBuild(from,to,def,amt,brk,tc,pre){const T=to-from,B=brk.reduce((q,x)=>q+x,0)*M,W=T-B;if(W<0)return null;pre=pre||{d0:0,w0:0};
 const job=o=>{if(jobsOn()&&o.t!=='r'){const jj=tkJ||st.cj;if(jj)o.j=jj;o.c=o.t==='d'?1:(tkJ?jobC(tkJ).tc!==false:isTc())?1:0}return o};
 /* the work, in order */
 const others=(pre&&pre.pf?['p','d','w']:['d','w','p']).filter(k=>k!==def&&amt[k]>0).map(k=>[k,amt[k]*M]),oth=others.reduce((q,x)=>q+x[1],0);if(oth>W+6e4)return null;
 const rest=W-oth;
 /* halves: when one block of driving makes the break impossible to place legally, half of everything goes before the break and half after */
 const mk=half=>{const q=[],lead=def==='w'&&!pre.mid?Math.min(rest,15*M):0,r=rest-lead,part=(f)=>{others.forEach(([k,l])=>q.push([k,Math.round(l*f/M)*M]));q.push([def,Math.round(r*f/M)*M])};
  if(lead>0)q.push(['w',lead]);if(!half){part(1)}else{const before=q.length;part(.5);const used=q.slice(before).reduce((a,x)=>a+x[1],0);others.forEach(([k,l])=>q.push([k,l-q.slice(before).filter(x=>x[0]===k).reduce((a,x)=>a+x[1],0)]));q.push([def,r-q.slice(before).filter(x=>x[0]===def).reduce((a,x)=>a+x[1],0)]);void used}
  return q.filter(x=>x[1]>0)};
 let seq=mk(false);
 /* where the breaks go, worked out from when the driving and work actually fall (and what was done before this stretch):
    a full break (45, or the 30 that finishes a 15) as late as the 4h 30m driving and 6 hour work limits allow, but early enough
    that what comes after is within them too, and on a change of activity when one is in that window; a 15 before a 30 goes
    halfway to it. Times here are work time from the start of the stretch. */
 const dr=t=>{let c=0,acc=0;for(const[k,l]of seq){if(c>=t)break;const u=Math.min(l,t-c);if(k==='d')acc+=u;c+=l}return acc},Dt=dr(W);
 let bnd=[];const mkB=()=>{bnd=[];let w=0;seq.forEach((x,k)=>{w+=x[1];if(k<seq.length-1)bnd.push(w)})};mkB();
 const tAt=d=>{/* work time when driving reaches d */let c=0,acc=0;for(const[k,l]of seq){if(k==='d'){if(acc+l>=d)return c+(d-acc);acc+=l}c+=l}return Infinity};
 /* the latest work time with no more than lim of driving done: other work after reaching it is fine, the next driving is not */
 const latestD=lim=>{let c=0,acc=0;for(const[k,l]of seq){if(k==='d'){if(acc+l>lim)return c+Math.max(0,lim-acc);acc+=l}c+=l}return W};
 /* the window for the full break (nb = how many breaks in all): no more than 6 hours of work in each stretch, and with tacho driving
    of 4h 30m or more, no more than 4h 30m of driving either side of the full break */
 const win=(full,w0,d0,nb)=>{let hi=Math.min(W,6*H*nb-w0),lo=Math.max(0,W-6*H);if(full&&tc&&d0+Dt>=270*M){hi=Math.min(hi,latestD(270*M-d0));lo=Math.max(lo,Dt-270*M>0?tAt(Dt-270*M):0)}return[lo,hi]};
 const pick=(lo,hi)=>{if(lo>hi)return hi;const mid=(lo+hi)/2,c=bnd.filter(x=>x>=lo&&x<=hi);return c.length?c.reduce((m,x)=>Math.abs(x-mid)<Math.abs(m-mid)?x:m):mid};
 {/* the main break: if it cannot fit with the driving in one block, use halves */const L=brk.length?brk[brk.length-1]:0,full=L>=45||(L>=30&&(brk.length>1||pre.half));
  if(brk.length){const[lo,hi]=win(full,pre.w0,pre.d0,brk.length);if(lo>hi+6e4){seq=mk(true);mkB();/* still too much after the break: move some of the main activity from after it to before it */for(let g=0;g<3;g++){const[l2,h2]=win(full,pre.w0,pre.d0,brk.length);if(l2<=h2+6e4)break;const last=seq.length-1,fi=seq.findIndex((x,k)=>k>0&&x[0]===def&&k<last);if(fi<0||seq[last][0]!==def)break;const mv=Math.min(seq[last][1],Math.ceil((l2-h2)/M)*M);seq[fi][1]+=mv;seq[last][1]-=mv;seq=seq.filter(x=>x[1]>0);mkB()}}}}
 let P=[];/* [work time, length] */
 if(brk.length===1){const full=brk[0]>=45||(brk[0]>=30&&pre.half);const[lo,hi]=win(full,pre.w0,pre.d0,1);P=[[pick(lo,hi),brk[0]]]}
 else if(brk.length>1){const L=brk[brk.length-1],[lo,hi]=win(L>=30,pre.w0,pre.d0,2),p2=pick(lo,hi);/* the 15 only counts as the first part of a driving break once some driving has been done */const d1=tc&&Dt>0&&!pre.d0?Math.min(p2,tAt(1)+M):0;const lo1=Math.max(d1,p2-6*H),hi1=Math.min(p2,6*H-pre.w0);let p1=pick(lo1,hi1);if(p1>=p2||p1<lo1)p1=Math.min(hi1,Math.max(lo1,(lo1+hi1)/2));P=[[p1,brk[0]],[p2,L]];
  for(let i=1;i<brk.length-1;i++)P.splice(i,0,[p2*(i+1)/brk.length,brk[i]])}
 P.sort((a,b)=>a[0]-b[0]);let used=0;const br=P.map(([t,l])=>{const o={at:from+Math.round(t/M)*M+used,len:l*M};used+=l*M;return o});
 const out=[];let c=from,bi=0,q=0,left=seq.length?seq[0][1]:0;
 const put=(a,b,t)=>{if(b-a<M/2)return;const l=out[out.length-1];if(l&&l.t===t&&l.e===a)l.e=b;else out.push(job({s:a,e:b,t}))};
 while(c<to-1&&(q<seq.length||bi<br.length)){const nb=bi<br.length?br[bi].at:Infinity;
  if(c>=nb){put(c,c+br[bi].len,'r');c+=br[bi].len;bi++;continue}
  if(q>=seq.length){c=nb;continue}
  const end=Math.min(c+left,nb,to);put(c,end,seq[q][0]);left-=end-c;c=end;if(left<=1){q++;left=q<seq.length?seq[q][1]:0}}
 return out}

/* two drivers: every entry is marked as double manned, and POA as riding as the co-driver */
function tkMark2(E,on){if(E&&on)E.forEach(x=>{if(x.t!=='r'){x.mm=1;if(x.t==='p')x.cd=1}});return E}
/* the short reminder shown wherever POA is put in: what it does to the two sets of rules */
function tkPoaTip(mm){return mm?'As the passenger, your first 45 minutes counts as your <b>driving</b> break, as long as you do no work. For <b>working time</b> it is not a break: it only pauses your 6 hours. Anything you did while riding (paperwork, navigating) is other work.':'POA pauses your working time: it is not work, and it is not a break either. Only a break of 15 minutes or more counts towards your breaks.'}
/* What the rules make of a set of entries, merged into the log: problems in the shift, and when the next break is due and why */
function tkJudge(E,from,to,goingOn){const A0=all(),keep=CDC,cc=CDC.filter(([s,e])=>e<=from||s>=to),E2=[];
 /* co-driver time in these answers counts the same way all() counts it: its first 45 minutes is a driving break, not a working time one */
 E.forEach(x=>{if(x.t==='p'&&x.cd){const s2=x.s+45*M;cc.push([x.s,Math.min(x.e,s2)]);if(x.e>s2)E2.push(Object.assign({},x,{s:s2}))}else E2.push(x)});CDC=cc;
 try{const A=A0.filter(x=>x.t!=='r'&&(x.e<=from||x.s>=to)).map(x=>Object.assign({},x)).concat(E2.filter(x=>x.t!=='r')).sort((a,b)=>a.s-b.s);
 if(!A.length)return{bad:[],next:''};let i=A.length-1;while(i>0&&A[i].s-A[i-1].e<9*H)i--;const S=A.slice(i).filter(x=>x.s<to+1);
 const bad=typeof audRules==='function'?audRules(S).map(r=>r[0]):[];let next='';CDC=cc;
 if(goingOn){const tc=isTc();let d=0,p=false,rn=0,tot=0,brkT=0;S.forEach((x,k)=>{if(k){const g=x.s-S[k-1].e,gw=wg(S[k-1].e,x.s);if(g>=45*M||(p&&g>=30*M)){d=0;p=false}else if(g>=15*M&&d>0)p=true;if(gw>=15*M){brkT+=gw;rn=0}}if(x.t==='d')d+=x.e-x.s;if(x.t!=='p'){rn+=x.e-x.s;tot+=x.e-x.s}});
  const L=[];if(tc&&d>0)L.push([270*M-d,'you reach 4h 30m of driving since your last full break',p?'30 minutes, to finish the 15 you had':'45 minutes, or 15 now and 30 later']);
  L.push([6*H-rn,'you reach 6 hours of work in a row','at least 15 minutes']);L.sort((a,b)=>a[0]-b[0]);const k=L[0];
  next=k[0]<=0?`☕ Take a break now: ${k[1].replace('you reach','you have reached')}. It needs to be ${k[2]}.`:`☕ Next break by <b>${hm(to+k[0])}</b>, because by then ${k[1]}. It needs to be ${k[2]}.`;
  const need=tot>9*H?45:tot>6*H?30:0;if(need&&brkT<need*M)next+=` Over ${need===45?'9':'6'} hours of work you need ${need} minutes of breaks in all; you have had ${Math.round(brkT/M)}.`}
 return{bad,next}}finally{CDC=keep}}

/* The screen: o = {from, to, def (the main activity, other work if not given), title, lead, ok (button text), done(E), back, quick} */
function acctAsk(o){tkJ=o.j||null;const tc=o.j?jobC(o.j).tc!==false:isTc(),T=(o.to-o.from)/M,def=o.def||'w';
 /* driving and work since the last full break, up to the start of this stretch, so the breaks it suggests count them */
 const pre=(()=>{const A=all().filter(x=>x.t!=='r'&&x.s<o.from).map(x=>Object.assign({},x,{e:Math.min(x.e,o.from)}));if(!A.length||o.from-A[A.length-1].e>=9*H)return{d0:0,w0:0,half:false};
  let i=A.length-1;while(i>0&&A[i].s-A[i-1].e<9*H)i--;const S=A.slice(i);let d=0,p=false,rn=0;S.forEach((x,k)=>{if(k){const g=x.s-S[k-1].e;if(g>=45*M||(p&&g>=30*M)){d=0;p=false}else if(g>=15*M&&d>0)p=true;if(wg(S[k-1].e,x.s)>=15*M)rn=0}if(x.t==='d')d+=x.e-x.s;if(x.t!=='p')rn+=x.e-x.s});
  const g=o.from-S[S.length-1].e;if(g>=45*M||(p&&g>=30*M)){d=0;p=false}if(wg(S[S.length-1].e,o.from)>=15*M)rn=0;return{d0:d,w0:rn,half:p}})();pre.mid=!!o.mid;
 const amt={d:0,w:0,p:0},on={d:false,w:false,p:false,r:false};let brk=[],mm2=!!(o.init&&o.init.mm)&&tc,pf=!!(o.init&&o.init.pf);
 if(o.init){['d','w','p'].forEach(k=>{if(o.init[k]>0&&k!==def&&(k!=='d'||tc)){on[k]=true;amt[k]=Math.min(Math.round(o.init[k]/15)*15||15,T)}});if(o.init.brk&&o.init.brk.length){brk=o.init.brk.slice();on.r=true}}
 if(o.geo&&o.geo.d&&tc&&def!=='d'){on.d=true;amt.d=Math.min(o.geo.d,Math.floor(T/15)*15)}
 if(o.quick&&!(o.init&&o.init.brk)){/* a whole shift: suggest the breaks the law needs, so they only have to be changed if wrong */const w=T;if(w>9*60+45)brk=[45];else if(w>6*60+30)brk=[30];if(brk.length)on.r=true}
 const kinds=[...(tc?['d']:[]),'w','p'].filter(k=>k!==def);
 const chips={d:[15,30,45,60,90,120,180,240],w:[15,30,60,90,120,180],p:[15,30,60,90,120]},bchips=[[15],[30],[45],[15,15],[15,30],[60]];
 const draw=()=>{const B=brk.reduce((q,x)=>q+x,0),oth=kinds.reduce((q,k)=>q+(on[k]?amt[k]:0),0),rest=T-(on.r?B:0)-oth,E=rest>=0?tkMark2(tkBuild(o.from,o.to,def,{d:on.d?amt.d:0,w:on.w?amt.w:0,p:on.p?amt.p:0},on.r?brk:[],tc,Object.assign({},pre,{pf:mm2&&pf})),mm2):null,J=E?tkJudge(E,o.from,o.to,!o.quick):null;
  const pch=mm2?[30,60,90,120,180,240,300]:chips.p;
  const row=k=>`<div class="acr${on[k]?' on':''}"><label class="fsw" style="margin:0"><span>${TKI[k]} ${k==='w'?'Did you do other work?':k==='d'?'Did you drive?':mm2?'Time as the passenger (POA)?':'Did you have POA (waiting time)?'}</span><span class="swt"><input type="checkbox" data-ak="t:${k}"${on[k]?' checked':''} aria-label="${TKN[k]}"><i></i></span></label>${on[k]?`<div class="fsub">Roughly how long?</div><div class="fchips fsm">${(k==='p'?pch:chips[k]).filter(m=>m<=T).map(m=>`<button type="button" class="fchip${amt[k]===m?' on':''}" data-ak="a:${k}:${m}">${tkF(m)}</button>`).join('')}</div><div class="fstep"><button type="button" data-ak="s:${k}:-5" aria-label="5 minutes less">−5</button><span><b>${tkF(amt[k])}</b></span><button type="button" data-ak="s:${k}:5" aria-label="5 minutes more">+5</button></div>${k==='p'?`<div class="note" style="margin-top:6px">${tkPoaTip(mm2)}</div>`:''}`:''}</div>`;
  mo(`<h3>${o.title}</h3><p>${o.lead||''} That is <b>${tkF(T)}</b> to account for, from ${hm(o.from)} to ${hm(o.to)}. Turn on what you did. ${def==='w'&&!o.mid?'Anything left over counts as other work, which is how most shifts start.':'Anything left over stays as '+tkLow(def)+'.'}</p>${o.geo?`<div class="note" style="margin:-4px 0 10px">${o.geo.txt}</div>`:''}<div class="acq">
  ${o.quick&&tc?`<div class="acr${mm2?' on':''}"><label class="fsw" style="margin:0"><span>👥 Two drivers (double manning)?</span><span class="swt"><input type="checkbox" data-ak="t:m"${mm2?' checked':''} aria-label="Two drivers"><i></i></span></label>${mm2?`<div class="note" style="margin-top:4px">Put in your own driving, and your time as the passenger as POA. You then need 9 hours of rest within 30 hours of starting.</div>${on.d&&on.p?`<div class="fsub">Who drove first?</div><div class="fchips fsm"><button type="button" class="fchip${pf?'':' on'}" data-ak="f:0">Me</button><button type="button" class="fchip${pf?' on':''}" data-ak="f:1">The other driver</button></div>`:''}`:''}</div>`:''}
  ${kinds.map(row).join('')}
  <div class="acr${on.r?' on':''}"><label class="fsw" style="margin:0"><span>🛏 Did you have a break?</span><span class="swt"><input type="checkbox" data-ak="t:r"${on.r?' checked':''} aria-label="Break"><i></i></span></label>${on.r?`<div class="fsub">Which?</div><div class="fchips fsm">${bchips.filter(b=>b.reduce((q,x)=>q+x,0)<T).map(b=>`<button type="button" class="fchip${brk.join('+')===b.join('+')?' on':''}" data-ak="b:${b.join('+')}">${b.map(x=>x+' min').join(' + ')}</button>`).join('')}</div>`:''}</div>
  </div><div class="fsum">${rest<0?`<span class="bad">That adds up to more than ${tkF(T)}. Take some off.</span>`:`${TKI[def]} ${TKN[def]}: <b>${tkF(rest)}</b> (the rest)`}</div>
  ${E?tkLogView(E,o.from,o.to):''}
  ${J&&J.bad.length?`<div class="wn" style="margin-top:8px"><b>⚠ With these answers:</b> ${J.bad.join('. ')}. If this is what really happened, save it so your record is honest.</div>`:''}
  ${J&&J.next?`<div class="note" style="margin-top:8px">${J.next}</div>`:''}
  <div class="note bad" id="akerr"></div><button class="tg big fpri" data-k="ok"${rest<0?' disabled':''}>${o.ok||'Save'}</button>${o.back?'<button class="tg big" data-k="bk">← Back</button>':''}<button class="tg big" data-k="no">Cancel</button>`);
  mcb={no:o.cancel||undo,bk:o.back,ok:()=>{if(!E){$('akerr').textContent='Those times do not fit. Check the amounts.';return}o.done(E)}}};
 const ev=e=>{const b=e.target.closest('[data-ak]');if(!b||!$('mo').contains(b))return;const[k,a,v]=b.dataset.ak.split(':');
  if(k==='t'&&a==='m'){mm2=b.tagName==='INPUT'?b.checked:!mm2;if(mm2&&!on.p){on.p=true;amt.p=Math.min(180,Math.floor(T/15)*15)||15}}
  else if(k==='f')pf=a==='1';
  else if(k==='t'){on[a]=b.tagName==='INPUT'?b.checked:!on[a];if(a!=='r'&&on[a]&&!amt[a])amt[a]=Math.min(a==='d'?60:30,Math.floor(T/15)*15)||15;if(a==='r'&&on.r&&!brk.length)brk=T>9*60?[45]:T>6*60?[30]:[15]}
  else if(k==='a')amt[a]=+v;else if(k==='s')amt[a]=Math.max(0,Math.min(T,amt[a]+ +v));else if(k==='b')brk=a.split('+').map(Number);draw()};
 tkEv=ev;draw()}
/* the toggles and chips of acctAsk (the pop-up's own buttons still go through its usual handler) */
let tkEv=null;
document.addEventListener('click',e=>{const b=e.target.closest('[data-ak]');if(tkEv&&b&&b.tagName!=='INPUT'&&!$('mo').hidden)tkEv(e)});
document.addEventListener('change',e=>{if(tkEv&&e.target.closest&&e.target.closest('[data-ak]')&&!$('mo').hidden)tkEv(e)});

/* The entries as they will go in the log: a bar from start to finish in the activity colours, then one line per entry */
function tkLogView(E,from,to){const L=E.slice().sort((a,b)=>a.s-b.s),seg=[];let c=from;
 L.forEach(x=>{if(x.s>c+M/2)seg.push({s:c,e:x.s,t:'r',gap:1});seg.push(x);c=Math.max(c,x.e)});if(to>c+M/2)seg.push({s:c,e:to,t:'r',gap:1});
 const tot=k=>seg.filter(x=>x.t===k).reduce((q,x)=>q+x.e-x.s,0);
 return `<div class="tkl"><div class="tkh"><b>How it goes in your log</b><span>${['d','w','p','r'].filter(k=>tot(k)>0).map(k=>`<span class="tkk"><i class="k-${k}"></i>${TKN[k]} ${tkF(tot(k)/M)}</span>`).join('')}</span></div>
 <div class="tkb" aria-hidden="true">${seg.map(x=>`<i class="k-${x.t}" style="flex:${Math.max(1,Math.round((x.e-x.s)/M))} 0 0"></i>`).join('')}</div><div class="tkt"><span>${hm(from)}</span><span>${hm(to)}</span></div>
 ${seg.map(x=>`<div class="tkr${x.t==='r'?' br':''}"><i class="k-${x.t}"></i><span>${TKI[x.t]} ${TKN[x.t]}</span><span class="tm">${hm(x.s)}–${hm(x.e)}<small>${tkF((x.e-x.s)/M)}</small></span></div>`).join('')}
 <div class="tkn">The order is a best guess. Once saved, tap the shift on Today, or the day in the Plan, to drag the blocks into the order you really did them.</div></div>`}

/* Put the entries in: everything logged in that stretch is replaced */
function tkPut(E,from,to){clear(from,to,1);E.forEach(x=>st.sessions.push(x));if(st.rs&&from<st.rs)st.rs=from}

/* Starting a shift: when did you really start? (and, with location on, where) */
function tkStartAsk(t,o){const n=Date.now(),A=all(),pe=A.length?A[A.length-1].e:0,ps=o?o.S:0,opts=[],PL=tkLocOn()?(st.places||[]):[];
 if(o&&ps<n-5*M&&ps>=pe)opts.push([ps,`I started at ${hm(ps)}, as planned`]);
 [15,30,60,120].forEach(m=>{const x=n-m*M;if(x>pe)opts.push([x,`${m<60?m+' minutes':m/60+(m===60?' hour':' hours')} ago (${hm(x)})`])});
 let sel=PL.length===1?PL[0].id:'';
 const plc=()=>PL.length?`<div class="fsub" style="margin-top:10px">Where did you start? <span class="note">(so it can work out how far you have driven)</span></div><div class="fchips fsm" id="tkpl">${PL.map(p=>`<button type="button" class="fchip${sel===p.id?' on':''}" data-k="p_${p.id}">📍 ${esc(p.n)}</button>`).join('')}<button type="button" class="fchip${sel==='h'?' on':''}" data-k="p_h">Right here</button></div>`:'';
 mo(`<h3>When Did You Start?</h3><p>${o?`You had <b>${esc(jobC(o.j).n)}</b> planned from <b>${o.s.slice(0,5)}</b>. `:''}If your shift started before now, say when, and TachoGuard asks what you did since, so your hours and breaks count from the right time.</p><button class="tg big fpri" data-k="now">I am starting now (${hm(n)})</button>${opts.map(([x,l],i)=>`<button class="tg big" data-k="o${i}">${l}</button>`).join('')}<div class="tr" style="margin-top:12px"><label>Or I started at<input type="time" id="tkst"></label><button class="tg" data-k="at">Use time</button></div>${plc()}<div class="note bad" id="tkerr"></div>${tkLocOn()&&!tkNear(tkLocAt(Date.now()))?`<button class="tg" data-k="sp" style="margin-top:8px">⭐ Save where I am as a place</button>`:''}<button class="tg big" data-k="no">Cancel</button>`);
 const ask=(x,geo)=>acctAsk({from:x,to:n,def:'w',geo,title:'Since '+hm(x),lead:`You started at <b>${hm(x)}</b> and are starting ${tkLow(t==='x'?'d':t)} now.`,ok:'Save and start my shift',back:()=>tkStartAsk(t,o),
   done:E=>{begin(t,1);tkPut(E,x,n);st.active=n;st.act=t;save();render();tkMark()}});
 const go=x=>{if(n-x<5*M){begin(t,1);return}
  if(!tkLocOn()||sel==='h'){ask(x,sel==='h'?{txt:'📍 You started right here.',d:0}:null);return}
  const pl=PL.find(p=>p.id===sel),then=c=>{if(!c){ask(x,null);return}const a=pl||tkLocAt(x);ask(x,tkGeo(a,c,pl?pl.n:a?'where you were at '+hm(a.t):'',true))};
  if(!pl&&!tkLocAt(x)){ask(x,null);return}
  tkWait('Checking where you are, to see how far you have come…',tkPos(0),then)};
 mcb={no:undo,now:()=>begin(t,1),sp:()=>tkPlaceAdd(()=>tkStartAsk(t,o)),at:()=>{const v=$('tkst').value;if(!v){$('tkerr').textContent='Enter the time you started.';return}const x=prevT(v,n);
  if(x<pe){$('tkerr').textContent='That is before your last activity ended ('+hm(pe)+'). Pick a later time.';return}if(n-x>16*H){$('tkerr').textContent='That is more than 16 hours ago. Check the time.';return}go(x)}};
 opts.forEach(([x],i)=>mcb['o'+i]=()=>go(x));
 PL.concat([{id:'h'}]).forEach(p=>mcb['p_'+p.id]=()=>{sel=sel===p.id?'':p.id;$('tkpl').querySelectorAll('[data-k]').forEach(b=>b.classList.toggle('on',b.dataset.k==='p_'+sel))})}

/* Back in the app after a while, in the middle of a shift: was it all what the app has been counting? With location on, it
   also says how far you have moved since you last had the app open. */
function tkAway(){const prev=tkSeen(),n=Date.now(),thr=tkAwy();tkMark();if($('mo').hidden&&tkRunCheck())return;
 if(!thr||!prev||!st.active||!$('mo').hidden||n-prev<thr*M||n-prev>18*H){tkGeoCheck();return}
 const from=Math.max(prev,st.active),act=st.act==='x'?'d':st.act;if(n-from<thr*M)return;
 const a=tkLocOn()?tkLocAt(prev):null;
 if(!a){tkAwayAsk(prev,from,act,null);return}
 tkPos(0).then(c=>{if(!$('mo').hidden||tkSeen()>n+60000)return;tkAwayAsk(prev,from,act,c?tkGeo(a,c,'where you were at '+hm(a.t),act!=='d'):null)})}
/* A timer still running from before entries that are logged after it started (left on, then the day filled in another way):
   it would count again on top of them. Ask whether it carried on, or stop it where the log ends. Returns 1 if it asked. */
function tkRunCheck(){if(!st.active||!st.act||st.act==='r')return 0;const n=Date.now(),L=st.sessions.filter(x=>x.t!=='r'&&x.e>st.active+M&&x.e<=n+M);if(!L.length)return 0;
 const e=Math.min(n,Math.max(...L.map(x=>x.e))),a0=st.active,act=st.act==='x'?'d':st.act,day=t=>(sod(t)===sod(n)?'today ':sod(t)===sod(n)-864e5||sod(t)===sod(sod(n)-1)?'yesterday ':'on '+new Date(t).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'})+' ')+'at '+hm(t);
 if(n-e<5*M){st.active=e;save();render();return 0}
 mo(`<h3>Is ${TKN[act]} Still Going?</h3><p>TachoGuard still has <b>${tkLow(act)}</b> running since ${day(a0)}, but your log already has entries up to <b>${day(e)}</b>.</p><p>Did you finish then?</p><button class="tg big fpri" data-k="fin">Yes, I finished ${day(e)}</button><button class="tg big" data-k="on">No, I am still on ${tkLow(act)} now</button>`);
 mcb={no:moX,fin:()=>{const sv=JSON.stringify(st);if(st.act==='d')gpsOff();st.active=null;st.act=null;st.ad=0;st.as=st.ae=null;st.se=e;save();moX();render();flash=`${TKN[act]} stopped. Your shift ended ${day(e)}. <button class="tg" data-ua="1" style="margin-left:6px">Undo</button>`;usnap=sv;snap=sv;setTimeout(()=>{flash='';live()},12000);live()},
  on:()=>{st.active=e;save();moX();render();if(n-e>=30*M)tkSince(e,act,null,`${TKN[act]} carries on from ${hm(e)}, the end of your log. Turn on anything else you did since.`)}};return 1}
/* Every time the app is opened (and every 10 minutes while it is open): where are you? If you have moved a fair way during a
   shift while it has you on something other than driving, ask if you drove. */
let tkGC=0;
function tkGeoCheck(){if(!tkLocOn()||document.hidden||Date.now()-tkGC<20000)return;tkGC=Date.now();const L=tkLocs(),last=L[L.length-1];
 tkPos(0).then(c=>{const n=Date.now();if(!c||!last||!st.active||!$('mo').hidden||document.hidden)return;const act=st.act==='x'?'d':st.act;const ss0=typeof shiftStart==='function'?shiftStart(all()):st.active;if(act==='d'||last.t<Math.min(ss0,st.active)-15*M)return;
  /* far enough to be more than a weak fix wandering: 2 miles, or more when the fixes are rough */
  const m=tkMi(last,c),thr=Math.max(2,((last.a||0)+(c.a||0))/1609.34*1.5),from=Math.max(last.t,st.active);if(m<thr||n-from<5*M)return;
  tkMovedAsk(from,act,tkGeo(last,c,'where you were at '+hm(last.t),true))})}
function tkMovedAsk(from,act,geo){
 mo(`<h3>Did You Drive?</h3><p>${geo.txt.replace(', so it is filled in below. Change it if it is wrong','')}</p><p>Since ${hm(from)} TachoGuard has had you on <b>${tkLow(act)}</b>.${act==='r'?' If you drove, that break was cut short.':''}</p><button class="tg big fpri" data-k="y">Yes, I drove</button><button class="tg big" data-k="dn">I am driving now</button><button class="tg big" data-k="no">No, I did not drive</button><div class="note">For example as a passenger, or on a ferry or train.</div>`);
 mcb={no:moX,dn:()=>{moX();setAct('d')},y:()=>tkSince(from,act,geo,'TachoGuard had you on '+tkLow(act)+' since '+hm(from)+'.')}}
/* fill in from a time up to now, during a shift, keeping the current activity running afterwards */
function tkSince(from,act,geo,lead){const n=Date.now();acctAsk({from,to:n,def:act,geo,mid:true,title:'Since '+hm(from),lead,ok:'Save',cancel:moX,
  done:E=>{snap=JSON.stringify(st);const a0=st.active,t0=st.act;if(from>a0){st.act=t0;st.sessions.push(rec(a0,from))}st.active=n;st.act=t0;tkPut(E,from,n);save();moX();render();
   flash=`Saved. ${TKN[act]} carries on from now: if you are doing something else now, tap it below. <button class="tg" data-ua="1" style="margin-left:6px">Undo</button>`;usnap=snap;setTimeout(()=>{flash='';live()},12000);live()}})}
function tkAwayAsk(prev,from,act,geo){const n=Date.now(),moved=geo&&geo.mi>=1.5,still=geo&&geo.mi<1.5&&act==='d'&&n-from>=45*M;
 const hint=moved&&act!=='d'?`<p>You have moved since then, so you may have been driving.</p>`:still?`<p>You have hardly moved, so you may have been on a break or doing other work.</p>`:'';
 const yes=`<button class="tg big${moved&&act!=='d'||still?'':' fpri'}" data-k="y">Yes, ${tkLow(act)} the whole time</button>`,nn=`<button class="tg big${moved&&act!=='d'||still?' fpri':''}" data-k="nn">No, I did other things too</button>`;
 mo(`<h3>Welcome Back</h3><p>You last had TachoGuard open at <b>${hm(prev)}</b>, ${tkF((n-prev)/M)} ago. Since ${hm(from)} it has been counting <b>${TKN[act]}</b>.</p>${geo?`<p>${geo.txt.replace(', so it is filled in below. Change it if it is wrong','')}</p>`:''}${hint}<p>Is that what you were doing all that time?</p>${moved&&act!=='d'||still?nn+yes:yes+nn}${isTc()?'<button class="tg big" data-k="tc">🔍 Check against my tacho instead</button><button class="tg big" data-k="dw">🧭 Fill in my day drop by drop</button>':''}<button class="tg big" data-k="no">Ask me later</button>`);
 mcb={no:()=>{try{localStorage.setItem(TKSEEN,String(prev))}catch(e){}moX()},y:moX,tc:()=>{moX();tcCheck()},dw:()=>{moX();tkDrops()},nn:()=>tkSince(from,act,geo,`TachoGuard had you on ${tkLow(act)} since ${hm(from)}.`)}}

/* A whole shift in a few taps. pre (from a day in the Plan) = {day, s, e ('HH:MM'), j, dr (hours), br (minutes), oid, name}:
   the times start as planned, and what you did starts from what is already logged, else from the plan. */
function tkQuick(pre){const n=Date.now(),td=sod(n);let day=pre&&pre.day?pre.day:td;
 const draw=()=>{mo(`<h3>${pre&&pre.oid?'What Did You Do?':'Log a Shift Quickly'}</h3><p>${pre&&pre.oid?`<b>${esc(pre.name||'')}</b>, planned ${pre.ps||pre.s} to ${pre.pe||pre.e}. Change the times to when you really started and finished, then say what you did. It replaces anything logged in that time.`:'For a shift you did not log as you went. Say when it started and finished, then what you did.'}</p>${pre&&pre.oid?`<p><b>${new Date(day).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</b></p>`:`<div class="fchips">${[0,1,2].map(k=>{const d=td-k*864e5,dd=sod(d);return `<button type="button" class="fchip${dd===day?' on':''}" data-k="d${k}">${k===0?'Today':k===1?'Yesterday':new Date(dd).toLocaleDateString('en-GB',{weekday:'long'})}</button>`}).join('')}</div><label class="fother">Or another day<input type="date" id="tqd" value="${ymd(day)}"></label>`}<div class="tr" style="margin-top:10px"><label>Started<input type="time" id="tqs"></label><label>Finished<input type="time" id="tqe"></label></div><div class="note bad" id="tqerr"></div><button class="tg big fpri" data-k="ok">Next</button>${pre&&pre.back?'<button class="tg big" data-k="bk">← Back</button>':''}<button class="tg big" data-k="no">Cancel</button>`);mcb={};
  [0,1,2].forEach(k=>mcb['d'+k]=()=>{day=sod(td-k*864e5);keep()});if($('tqd'))$('tqd').onchange=e=>{if(e.target.value){day=pdt(e.target.value);keep()}};$('tqs').value=sv;$('tqe').value=ev;mcb.ok=ok;mcb.no=moX;if(pre&&pre.back)mcb.bk=pre.back};
 let sv=pre&&pre.s||'',ev=pre&&pre.e||'';const keep=()=>{sv=$('tqs').value;ev=$('tqe').value;draw()};
 const ok=()=>{const a=$('tqs').value,b=$('tqe').value,er=m=>{$('tqerr').textContent=m};if(!a||!b){er('Enter when it started and finished.');return}sv=a;ev=b;
  const s=plAt(day,a);let e=plAt(day,b);if(e<=s)e=plAt(nxd(day),b);if(e>n){er('That finishes after now. If you are still working, start your shift on the Today screen instead.');return}if(e-s>21*H){er('That is over 21 hours. Check the times.');return}
  const ov=all().filter(x=>x.e>s&&x.s<e),ow=ov.filter(x=>x.t!=='r');
  /* start from what is logged in that time (so a fix only needs the changes), else from the plan */
  let init=null;if(ow.length){const sum=t=>ov.filter(x=>x.t===t).reduce((q,x)=>q+Math.min(x.e,e)-Math.max(x.s,s),0)/M,br=[];
   const W=ov.slice().sort((x,y)=>x.s-y.s);W.forEach((x,k)=>{if(x.t==='r'&&x.e-x.s>=15*M)br.push(Math.round((Math.min(x.e,e)-Math.max(x.s,s))/M/15)*15);if(k&&x.s-W[k-1].e>=15*M&&x.t!=='r'&&W[k-1].t!=='r')br.push(Math.round((x.s-W[k-1].e)/M/15)*15)});
   const fd=W.find(x=>x.t==='d'),fp=W.find(x=>x.t==='p');init={d:sum('d'),p:sum('p'),brk:br.filter(x=>x>=15),mm:ov.some(x=>x.mm||x.cd),pf:!!(fd&&fp&&fp.s<fd.s)}}
  else if(pre&&pre.oid){init={d:(pre.dr||0)*60,brk:pre.br?(pre.br>=45&&e-s>9*H+45*M&&pre.dr>=4.5?[45]:[pre.br]):[]}}
  acctAsk({from:s,to:e,def:'w',quick:true,j:pre&&pre.j,init,title:pre&&pre.oid?'What You Did':'Your Shift',lead:`${new Date(s).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'})}, ${hm(s)} to ${hm(e)}.${ow.length?' It starts from what is already logged in that time, and replaces it.':pre&&pre.oid?' It starts from what was planned.':''}`,ok:'Save this shift',back:draw,cancel:moX,
   done:E=>{const sv2=JSON.stringify(st);tkPut(E,s,e);if(pre&&pre.oid)st.pls=Object.assign({},st.pls,{[pre.oid]:'done'});/* the latest shift, nothing running after it: it has ended at its finish */if(!st.active&&!st.sessions.some(x=>(x.t||'d')!=='r'&&x.s>=e)&&!(st.se&&st.se>=e))st.se=e;tkJ=null;save();moX();render();flash=`Shift saved: ${hm(s)} to ${hm(e)}. <button class="tg" data-ua="1" style="margin-left:6px">Undo</button>`;usnap=sv2;snap=sv2;setTimeout(()=>{flash='';live()},12000);live();tkRunCheck()}})};
 draw()}
/* From a day in the Plan: fill in what you really did on a planned shift (o, an occurrence), or on a day with nothing planned */
function tkFill(o,d,back){if(o){const L=all().filter(x=>!x.live&&x.e>o.S-H&&x.s<o.E+H&&x.t!=='r'),s=L.length?Math.min(...L.map(x=>x.s)):o.S,e=L.length?Math.max(...L.map(x=>x.e)):o.E;
  tkQuick({day:sod(s),s:hm(s),e:hm(Math.min(e,Date.now())),j:o.j,dr:jobC(o.j).tc!==false?o.dr||0:0,br:o.br||0,oid:o.oid,name:jobC(o.j).n,ps:o.s.slice(0,5),pe:o.e.slice(0,5),back})}
 else{const L=all().filter(x=>!x.live&&x.t!=='r'&&x.s<nxd(d)&&x.e>d);tkQuick(L.length?{day:d,s:hm(Math.min(...L.map(x=>x.s))),e:hm(Math.max(...L.map(x=>x.e))),back}:{day:d,back})}}

/* The next break when no planned shift is giving advice: for the Today card */
/* With no planned shift (so no finish time), the next break the rules need, as the same card the planned advice uses */
function tkNextCard(){if(!st.active||st.act==='r')return '';const n=Date.now(),A=all(),ss=shiftStart(A),
 /* a planned shift that has reached its finish (you are running over): say so, rather than that nothing is planned */
 over=typeof plOcc==='function'?plOcc(ss-4*H,n).filter(o=>o.st!=='skip'&&o.S<n&&o.E<=n+15*M&&o.E>ss&&Math.abs(o.S-ss)<4*H).pop():null,S=A.filter(x=>x.s>=ss),b=dsbFix(cnt(A,45,x=>x.t==='d'),A),WT=wtS(S,n),act=st.act==='x'?'w':st.act,tc=isTc();
 /* the same clocks as the top of Today: what you are doing now decides which limit comes next */
 const L=[];if(act==='d'&&tc)L.push({at:n+270*M-b.d,len:b.q?30:45,why:'4h 30m of driving since your last full break',dk:1});if(act==='d'||act==='w')L.push({at:n+6*H-WT.rn,len:15,why:'6 hours of work in a row'});L.sort((x,y)=>x.at-y.at);const x=L[0];
 const item=(len,t,c)=>`<div class="bki"><span class="bkn${c?' '+c:''}">${len}<small>min</small></span><span class="bkt">${t}</span></div>`,need=WT.tot>9*H?45:WT.tot>6*H?30:0,had=Math.round(WT.brk/M);
 const side=[];if(tc&&act!=='d'&&b.d>0)side.push(`Driving: ${fmt(Math.max(0,270*M-b.d))} left before a ${b.q?30:45} minute break.`);if(act==='p')side.push('POA pauses your work clock, so nothing is building up right now.');if(need&&had<need*M/M)side.push(`Over ${need===45?9:6} hours of work you need ${need} minutes of breaks in all; you have had ${had}.`);
 side.push(over?`You are past your planned finish (${hm(Math.max(over.E,ss+(over.E-over.S)))}), so this is your next break only. The 6 hour and 4h 30m limits still apply however long you carry on.`:'No planned shift, so this is the next break only. Add the shift to your Plan to see every break up to your finish.');
 if(!x)return `<div class="bkh"><span>☕ Your breaks</span></div>${side.map(t=>`<div class="bkn2">${t}</div>`).join('')}`;const due=x.at<=n+6e4;
 return `<div class="bkh"><span>☕ Your breaks</span><span class="bkc${due?' due':''}">${due?'Due now':'Next by '+hm(x.at)}</span></div><div class="bkr">${item(x.len,due?'<b class="bkx">now</b>':'by '+hm(x.at),due?'bkx':'')}<div class="bkn2" style="margin-top:4px">${due?'You have reached':'When you reach'} ${x.why}.${x.dk&&!b.q&&!due?` Or 15 now and 30 by ${hm(x.at)}.`:x.dk&&b.q?' In one go: it finishes the 15 you had.':''}</div></div>${side.map(t=>`<div class="bkn2">${t}</div>`).join('')}`}

document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(tkAway,400);else tkMark()});
setInterval(()=>{if(!document.hidden&&$('mo').hidden){tkMark();if(tkLocOn()){const l=tkLocs().pop();if(!l||Date.now()-l.t>10*M)tkGeoCheck()}}},30000);
/* once: offer location check-ins (they need the phone's permission, so they cannot just be on) */
setTimeout(()=>{if(st.gloc!==undefined||st.glq||!navigator.geolocation||!$('mo').hidden)return;
 mo(`<h3>Turn On Location Check-ins?</h3><p>Each time you open TachoGuard it notes roughly where you are. If you have moved a fair way while it has you on other work, POA or a break, it asks if you drove, so your driving is not missed.</p><p class="note">Kept on this phone only, for 3 days. It never tracks you while the app is closed. Your phone will ask to allow location.</p><button class="tg big fpri" data-k="ok">Turn on</button><button class="tg big" data-k="no">Not now</button>`);
 mcb={no:()=>{st.glq=1;save();moX()},ok:async()=>{st.glq=1;st.gloc=true;save();moX();live();const c=await tkPos(0,true);if(!c&&tkLocErr==='blocked'){st.gloc=false;save();live();flash='Location is blocked, so check-ins are off. Allow location for this site in Chrome, then turn them on in Settings.';setTimeout(()=>{flash='';live()},9000);live()}}}},6000);
setTimeout(tkAway,1500);

/* ===== Check against my tacho =====
   Put in what the tacho shows (start of the day, total driving, driving since the last break) and the log is corrected to
   match, changing as little as it can: the start moves, other work or POA becomes driving (or the other way) next to what you
   say, and the driving since your break is remembered as the tacho's figure (dsbFix in index.html). Rough figures still help. */
function tcCheck(){const n=Date.now(),A=all(),l=A[A.length-1];if(!l)return;const ss=shiftStart(A),S=A.filter(x=>x.s>=ss);
 const sumD=L=>L.filter(x=>x.t==='d').reduce((q,x)=>q+Math.min(x.e,n)-x.s,0),logD=sumD(S),b=dsbFix(cnt(A,45,x=>x.t==='d'),A),fd=S.find(x=>x.t==='d');
 let dsbT=false,st0=ss,drv=true,tot=Math.round(logD/M),dsb=Math.round(b.d/M),dsbK=true,where='now',pre='w',fdT=fd?hm(fd.s):'';
 const step=(k,vals)=>`<div class="tcs">${vals.map(v=>`<button type="button" data-tc="${k}:${v}">${v>0?'+':'−'}${Math.abs(v)}</button>`).join('')}</div>`,hmF=m=>Math.floor(m/60)+'h '+String(m%60).padStart(2,'0')+'m';
 const draw=()=>{const dS=Math.round((ss-st0)/M),/* driving the log keeps from the new start (a later start cuts some off) */kept=Math.round(S.filter(x=>x.t==='d').reduce((q,x)=>q+Math.max(0,Math.min(x.e,n)-Math.max(x.s,st0)),0)/M),
  dD=drv?tot-kept-(st0<ss&&pre==='d'?dS:0):-kept,ch=[];
  if(dS>0)ch.push(`Start moves to <b>${hm(st0)}</b>: ${tkF(dS)} of ${pre==='d'?'driving':'other work'} added before ${hm(ss)}.`);else if(dS<0)ch.push(`Start moves to <b>${hm(st0)}</b>: anything before it is taken off.`);
  if(dD>0)ch.push(`<b>${tkF(dD)}</b> of other work or POA becomes driving, ${where==='now'?'working back from now':'from '+(fdT||hm(st0))}.`);else if(dD<0)ch.push(`<b>${tkF(-dD)}</b> of driving becomes other work, starting with the most recent.`);
  /* until you change it, driving since the break follows the total (missing driving goes in most recently) */
  if(!dsbT)dsb=Math.max(0,Math.min(tot,Math.round(b.d/M)+(where==='now'?Math.max(0,dD):0)+Math.min(0,dD)));
  if(drv&&dsbK&&dsbT&&Math.abs(dsb-Math.round(b.d/M)-(where==='now'?Math.max(0,dD):0))>=2)ch.push(`Driving since your last break counts from <b>${hmF(dsb)}</b>, your tacho's figure.`);
  mo(`<h3>Check Against Your Tacho</h3><p class="note">Put in what your tacho shows. To the minute is best, but a good guess still helps. Most tachos show today's driving and the driving since your last break on the main screen, or in the menu under driver 1.</p>
  <div class="fsec"><div class="flb">When did this shift start?</div><div class="tr"><input type="time" id="tcs0" value="${hm(st0)}"></div>${step('s',[-15,-5,-1,1,5,15])}${st0<ss?`<div class="fsub">From ${hm(st0)} to ${hm(ss)} you were:</div><div class="fchips fsm"><button type="button" class="fchip${pre==='w'?' on':''}" data-tc="p:w">Other work</button><button type="button" class="fchip${pre==='d'?' on':''}" data-tc="p:d">Driving</button></div>`:''}</div>
  <div class="fsec"><label class="fsw"><span>🚛 Have you driven this shift?</span><span class="swt"><input type="checkbox" data-tc="drv"${drv?' checked':''}><i></i></span></label>
  ${drv?`<div class="fsub">Total driving today, from your tacho</div><div class="tcv"><b>${hmF(tot)}</b> <span class="note">(your log: ${hmF(Math.round(logD/M))})</span></div>${step('t',[-15,-5,-1,1,5,15])}
  <div class="fsub">Driving since your last break, from your tacho</div><label class="fsw" style="margin:4px 0"><span>I can see it on my tacho</span><span class="swt"><input type="checkbox" data-tc="dk"${dsbK?' checked':''}><i></i></span></label>${dsbK?`<div class="tcv"><b>${hmF(dsb)}</b> <span class="note">(your log: ${hmF(Math.round(b.d/M))})</span></div>${step('b',[-15,-5,-1,1,5,15])}`:''}
  ${dD>0?`<div class="fsub">Where was the driving your log is missing?</div><div class="fchips fsm"><button type="button" class="fchip${where==='now'?' on':''}" data-tc="w:now">Most recently</button><button type="button" class="fchip${where==='st'?' on':''}" data-tc="w:st">From when I started driving</button></div>${where==='st'?`<div class="tr" style="margin-top:6px"><label>I started driving at<input type="time" id="tcfd" value="${fdT||hm(st0)}"></label></div>`:''}`:''}`:''}</div>
  <div class="fsum">${ch.length?ch.map(x=>'• '+x).join('<br>'):'✓ Your log already matches. Nothing to change.'}</div><div class="note bad" id="tcerr"></div>
  <button class="tg big fpri" data-k="ok">${ch.length?'Correct my log':'Done'}</button><button class="tg big" data-k="no">Cancel</button>`);
  const i0=$('tcs0');i0.onchange=()=>{if(i0.value){const t=prevT(i0.value,n);if(t>=n){$('tcerr').textContent='That is after now.';return}st0=t;draw()}};if($('tcfd'))$('tcfd').onchange=e=>{fdT=e.target.value};
  mcb={no:moX,ok:()=>{if(!ch.length){moX();return}apply(dS,dD)}}};
 const apply=(dS,dD)=>{const sv=JSON.stringify(st),now=Date.now();
  /* the running activity is put into the log up to now and carries on from now, so it can be changed like the rest */
  if(st.active&&st.act&&st.act!=='r'&&now-st.active>=6e4){st.sessions.push(rec(st.active,now));st.active=now}
  const T=x=>x.t||'d',inS=x=>x.e>Math.min(st0,ss)-6e4&&x.s<now+6e4&&T(x)!=='r';
  /* breaks logged before the shift's first work are tidied away with the old start */
  st.sessions=st.sessions.filter(x=>!(T(x)==='r'&&x.e>Math.min(st0,ss)-12*H&&x.s<Math.max(st0,ss)&&x.e<=Math.max(st0,ss)+6e4&&!st.sessions.some(y=>T(y)!=='r'&&y.e<=x.s&&y.e>x.s-9*H)));
  if(dS>0)st.sessions.push(Object.assign({s:st0,e:ss,t:pre,chk:1},jobsOn()?{j:st.cj,c:pre==='d'?1:isTc()?1:0}:{}));
  else if(dS<0){st.sessions=st.sessions.filter(x=>!(inS(x)&&x.e<=st0));st.sessions.forEach(x=>{if(inS(x)&&x.s<st0)x.s=st0})}
  /* change kind, minute by minute along the shift: back from now, or forward from when driving started */
  const conv=(from,to,amt,back,at)=>{let left=amt*M;const L=st.sessions.filter(x=>inS(x)&&from.includes(T(x))&&x.s>=st0-6e4).sort((a,b)=>back?b.e-a.e:a.s-b.s);
   for(const x of L){if(left<=0)break;const o0=Math.max(x.s,at||0),len=x.e-o0;if(len<=0)continue;const take=Math.min(len,left);left-=take;
    const part=Object.assign({},x,{t:to});if(to!=='p')delete part.cd;
    if(back){part.s=x.e-take;part.e=x.e;x.e=part.s}else{part.s=o0;part.e=o0+take;if(o0>x.s){const tail=Object.assign({},x,{s:part.e});x.e=o0;st.sessions.push(tail)}else x.s=part.e}
    st.sessions.push(part)}
   st.sessions=st.sessions.filter(x=>x.e-x.s>=3e4);return left};
  let miss=0;if(dD>0){const at=where==='st'&&fdT?prevT(fdT,now):0;miss=conv(['w','p'],'d',dD,where==='now',at)}else if(dD<0)conv(['d'],'w',-dD,true);
  delete st.dsb;if(drv&&dsbK&&dsbT){const A2=all(),b2=cnt(A2,45,x=>x.t==='d');if(Math.abs(dsb*M-b2.d)>=2*M)st.dsb={t:now,v:dsb*M}}
  st.sessions.sort((a,b)=>a.s-b.s);if(typeof fixOv==='function')fixOv();if(st.rs&&st0<st.rs)st.rs=st0;save();moX();render();
  usnap=sv;snap=sv;flash=`Log corrected to match your tacho.${miss>6e4?` ${tkF(miss/M)} of driving could not be placed: there was not enough other work or POA. Use Edit shift to add it.`:''} <button class="tg" data-ua="1" style="margin-left:6px">Undo</button>`;setTimeout(()=>{if(usnap===sv){flash='';live()}},15000);live()};
 const ev=e=>{const t=e.target.closest('[data-tc]');if(!t||!$('mo').contains(t))return;const[k,v]=t.dataset.tc.split(':');
  if(k==='drv'){drv=t.checked;if(!drv)tot=0}else if(k==='dk')dsbK=t.checked;else if(k==='s')st0=Math.min(n-M,st0+ +v*M);else if(k==='t')tot=Math.max(0,Math.min(15*60,tot+ +v));
  else if(k==='b'){dsbT=true;dsb=Math.max(0,Math.min(tot||600,dsb+ +v))}else if(k==='p')pre=v;else if(k==='w')where=v;draw()};
 tcEv=ev;draw()}
let tcEv=null;
document.addEventListener('click',e=>{const b=e.target.closest('[data-tc]');if(tcEv&&b&&b.tagName!=='INPUT'&&!$('mo').hidden)tcEv(e)});
document.addEventListener('change',e=>{if(tcEv&&e.target.closest&&e.target.closest('[data-tc]')&&e.target.tagName==='INPUT'&&!$('mo').hidden)tcEv(e)});

/* Fill in a shift drop by drop, for a day not logged as you went (a rough guide, not a record from the tacho).
   Step 1: when it started and finished (or up to now, if the shift is still running) and yes or no to driving, other work, breaks and two drivers.
   Step 2: how many drops, then one line per part of the day: checks and loading, each drive and drop, the drive back and the end of the day.
   Breaks go where the 4h 30m driving and 6 hour work limits need them (or spread out on a short day), and each can be moved.
   Saving replaces what is logged in that time. */
let dwEv=null;
function tkDrops(){const n0=Date.now(),td=sod(n0),run=!!(st.active&&st.act),
 ss=run?shiftStart(all().filter(x=>x.t!=='r')):0,tc=isTc();
 const R={step:1,live:run,day:td,sv:run?hm(ss):'',ev:'',dr:tc,wk:true,br:true,mm:tc&&mmOn(),nd:2,L:null,B:null,P:{}};
 let from=0,to=0;
 const T=()=>(to-from)/M,r5=m=>Math.max(0,Math.round(m/5)*5);
 /* enough break in all (30 over 6 hours of work, 45 over 9) and enough stops that no stretch passes 6 hours of work: a long day gets 15 + 30 */
 const wantB=()=>{if(!R.br)return [];const w=T(),need=w>9*60+45?45:w>6*60+30?30:15,stops=Math.max(1,Math.ceil((w-need)/360)-1);
  if(stops<=1&&w<=9*60+45)return [need];const B=[15,30];while(B.length<stops)B.push(15);return B};
 /* the parts of the day for nd drops; durations fill the time, drives a bit longer than drops */
 const mkLegs=()=>{const nd=R.nd,B=R.B||wantB(),bt=B.reduce((q,x)=>q+x,0),s0=R.wk?30:0,e0=R.wk?15:0,av=Math.max(0,T()-bt-s0-e0),u=av/((nd+1)+(R.wk?0.7:0.4)*nd),L=[];
  L.push({k:'s',lbl:'At the depot: checks and loading',m:s0});
  for(let i=1;i<=nd;i++){L.push({k:'d',lbl:'Drive to drop '+i,m:r5(u)});L.push({k:'x',lbl:'Drop '+i,m:r5(u*(R.wk?0.7:0.4)),w:0})}
  L.push({k:'d',lbl:'Drive back to the depot',m:r5(u)});L.push({k:'e',lbl:'Back at the depot: unloading, paperwork',m:e0});R.L=L;R.P={};
  /* what the rounding left goes on the drive back, so it adds up */const lf=Math.floor(T()-used());if(lf)L[L.length-2].m=Math.max(0,L[L.length-2].m+lf)};
 const legT=x=>x.m+(x.w||0),used=()=>R.L.reduce((q,x)=>q+legT(x),0)+(R.B||[]).reduce((q,x)=>q+x,0);
 /* where each break goes: before part i. Where a limit would be passed, else spread through the day */
 const autoPos=()=>{const L=R.L,B=R.B||[],pos=[],tot=L.reduce((q,x)=>q+legT(x),0);let d=0,rn=0,half=false,t=0,k=0;
  const drv=x=>x.k==='d'&&!x.co?x.m:0,wkm=x=>x.k==='d'?(x.co?0:x.m):x.m;
  for(let i=0;i<L.length;i++){const x=L[i];
   while(i>0&&k<B.length&&(d+drv(x)>270||rn+wkm(x)>360||t>=tot*(k+1)/(B.length+1))){const b=B[k];pos.push(R.P[k]!==undefined?R.P[k]:i);
    if(b>=45){d=0;rn=0;half=false}else if(b>=30){rn=0;if(half){d=0;half=false}}else{rn=0;if(d>0)half=true}k++;if(R.P[k-1]!==undefined)break}
   d+=drv(x);rn+=wkm(x);t+=legT(x)}
  while(k<B.length){pos.push(R.P[k]!==undefined?R.P[k]:L.length-1);k++}return pos};
 const build=()=>{const E=[],B=R.B||[],P=autoPos();let c=from;
  const job=o=>{if(jobsOn()&&st.cj)o.j=st.cj;if(jobsOn())o.c=1;if(R.mm)o.mm=1;return o};
  const add=(t,m,cd)=>{if(m<=0)return;const l=E[E.length-1];if(l&&l.t===t&&l.e===c&&!!l.cd===!!cd)l.e+=m*M;else{const o=job({s:c,e:c+m*M,t});if(cd)o.cd=1;E.push(o)}c+=m*M};
  R.L.forEach((x,i)=>{B.forEach((b,k)=>{if(P[k]===i)c+=b*M});add('p',x.w||0);add(x.k==='d'?(x.co?'p':'d'):'w',x.m,x.k==='d'&&x.co)});
  if(c>to+3e4)return null;if(to-c>=1000)add('w',(to-c)/M);return E};
 const times=()=>{const B=R.B||[],P=autoPos(),out=[];let c=from;R.L.forEach((x,i)=>{B.forEach((b,k)=>{if(P[k]===i)c+=b*M});out.push(c);c+=legT(x)*M});return out};
 const dwSave=E=>{const sv=JSON.stringify(st);
  if(R.live){const n=Date.now();tkPut(E.map(x=>Object.assign({},x,{e:Math.min(x.e,n)})).filter(x=>x.e>x.s),from,n);st.active=n}
  else{tkPut(E,from,to);if(!st.active&&!st.sessions.some(x=>(x.t||'d')!=='r'&&x.s>=to)&&!(st.se&&st.se>=to))st.se=to}
  st.sessions.sort((a,b)=>a.s-b.s);if(typeof fixOv==='function')fixOv();save();moX();render();usnap=sv;snap=sv;
  flash=(R.live?`Your day so far is filled in, ${hm(from)} to now. ${TKN[st.act]||NM[st.act]} carries on from now: if you are doing something else, tap it below.`:`Shift filled in: ${hm(from)} to ${hm(to)}.`)+' <button class="tg" data-ua="1" style="margin-left:6px">Undo</button>';
  setTimeout(()=>{if(usnap===sv){flash='';live()}},14000);live();if(!R.live&&typeof tkRunCheck==='function')tkRunCheck()};
 const yn=(k,q,v)=>`<div class="dwq"><span>${q}</span><span class="fchips fsm"><button type="button" class="fchip${v?' on':''}" data-dw="y:${k}:1">Yes</button><button type="button" class="fchip${v?'':' on'}" data-dw="y:${k}:0">No</button></span></div>`;
 const keepSc=f=>{const b=MO.querySelector('.mb'),y=b?b.scrollTop:0;f();const b2=MO.querySelector('.mb');if(b2)b2.scrollTop=y};
 const page1=()=>{const days=[0,1,2].map(k=>sod(td-k*864e5));
  mo(`<h3>Fill In My Day</h3><p>Did not log as you went? Answer a few questions and it builds a rough guide of your shift, drop by drop. You can change every part before saving.</p>
  ${run?`<div class="fchips"><button type="button" class="fchip${R.live?' on':''}" data-dw="l:1">This shift (still going)</button><button type="button" class="fchip${R.live?'':' on'}" data-dw="l:0">An earlier shift</button></div>`:''}
  ${R.live?`<div class="tr" style="margin-top:10px"><label>Your shift started at<input type="time" id="dws" value="${R.sv}"></label></div><p class="note">It fills in up to now (${hm(n0)}). What you are doing now carries on afterwards.</p>`
   :`<div class="fchips" style="margin-top:8px">${days.map((d,k)=>`<button type="button" class="fchip${d===R.day?' on':''}" data-dw="d:${d}">${k===0?'Today':k===1?'Yesterday':new Date(d).toLocaleDateString('en-GB',{weekday:'long'})}</button>`).join('')}</div><label class="fother">Or another day<input type="date" id="dwd" value="${ymd(R.day)}"></label><div class="tr" style="margin-top:10px"><label>Started<input type="time" id="dws" value="${R.sv}"></label><label>Finished<input type="time" id="dwe" value="${R.ev}"></label></div>`}
  <div class="acq" style="margin-top:10px">${tc?yn('dr','🚛 Did you drive?',R.dr):''}${yn('wk','⚒ Did you do other work (loading, drops, checks)?',R.wk)}${yn('br','🛏 Did you have breaks?',R.br)}${tc?yn('mm','👥 Two drivers (double manning)?',R.mm):''}</div>
  <div class="note bad" id="dwerr"></div><button class="tg big fpri" data-k="ok">Next</button><button class="tg big" data-k="no">Cancel</button>`);
  const keep=()=>{const a=$('dws'),b=$('dwe');if(a)R.sv=a.value;if(b)R.ev=b.value};if($('dwd'))$('dwd').onchange=e=>{keep();if(e.target.value){R.day=pdt(e.target.value);page1()}};
  ['dws','dwe'].forEach(id=>{if($(id))$(id).onchange=keep});
  mcb={no:moX,ok:()=>{keep();const er=m=>{$('dwerr').textContent=m},n=Date.now();if(!R.sv||(!R.live&&!R.ev)){er(R.live?'Enter when your shift started.':'Enter when it started and finished.');return}
   if(R.live){to=n;from=nearT(R.sv,n);if(from>=n)from-=864e5;if(n-from>21*H){er('That is over 21 hours ago. Check the time.');return}}
   else{from=plAt(R.day,R.sv);to=plAt(R.day,R.ev);if(to<=from)to=plAt(nxd(R.day),R.ev);if(to>n){er(run?'That finishes after now. If you are still on this shift, pick This shift (still going).':'That finishes after now. If you are still working, start your shift on the Today screen first.');return}if(to-from>21*H){er('That is over 21 hours. Check the times.');return}}
   if(to-from<30*M){er('That is under 30 minutes. Check the times.');return}
   if(!R.dr){/* no driving: the simple screen, with the time split into work, POA and breaks */acctAsk({from,to,def:'w',quick:!R.live,mid:R.live,title:'Your Day',lead:`${hm(from)} to ${R.live?'now':hm(to)}.`,ok:'Save',back:page1,cancel:moX,done:dwSave});return}
   R.B=wantB();mkLegs();R.step=2;page2()}};
  dwEv=e=>{const b=e.target.closest('[data-dw]');const[k,a,v]=b.dataset.dw.split(':');keep();if(k==='l')R.live=a==='1';else if(k==='d')R.day=+a;else if(k==='y')R[a]=v==='1';page1()}};
 const stp=(i,f,m,lab)=>`<span class="dws"><button type="button" data-dw="m:${i}:${f}:-15" aria-label="15 minutes less">−15</button><button type="button" data-dw="m:${i}:${f}:-5" aria-label="5 minutes less">−5</button><b aria-label="${lab}">${tkF(m)}</b><button type="button" data-dw="m:${i}:${f}:5" aria-label="5 minutes more">+5</button><button type="button" data-dw="m:${i}:${f}:15" aria-label="15 minutes more">+15</button></span>`;
 const page2=()=>{const tm=times(),B=R.B||[],P=autoPos(),u=used(),left=T()-u,E=left>=0?build():null,J=E?tkJudge(E,from,to,R.live):null;
  const ico={s:'⚒',d:'🚛',x:'📦',e:'⚒'};
  const rows=R.L.map((x,i)=>{const bs=B.map((b,k)=>P[k]===i?`<div class="dwb">🛏 ${b} minute break${R.L.length>1?` <select data-dwp="${k}" aria-label="Move this break">${R.L.map((y,j)=>j?`<option value="${j}"${j===P[k]?' selected':''}>before ${esc(y.lbl.toLowerCase())}</option>`:'').join('')}</select>`:''}</div>`:'').join('');
   const st0=tm[i],en=st0+legT(x)*M;
   return bs+`<div class="dwl dw-${x.k}"><div class="dwh"><span>${ico[x.k]} ${esc(x.lbl)}</span><small>${legT(x)?hm(st0)+'–'+hm(en):'none'}</small></div>
   ${stp(i,'m',x.m,x.lbl)}
   ${x.k==='d'&&R.mm?`<div class="fchips fsm" style="margin-top:6px"><button type="button" class="fchip${x.co?'':' on'}" data-dw="c:${i}:0">I drove</button><button type="button" class="fchip${x.co?' on':''}" data-dw="c:${i}:1">My co-driver drove</button></div>`:''}
   ${x.k==='x'?(x.w?`<div class="fsub">Waiting first (POA)</div>${stp(i,'w',x.w,'Waiting')}`:`<button type="button" class="dwa" data-dw="w:${i}">+ I was kept waiting here (POA)</button>`):''}</div>`}).join('');
  mo(`<h3>Your Drops</h3><p>${new Date(from).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'})}, ${hm(from)} to ${R.live?'now ('+hm(to)+')':hm(to)}: <b>${tkF(T())}</b> to fill. Set roughly how long each part took. Set a part to 0 if you did not do it.</p>
  <div class="dwq"><span>📦 How many drops or collections?</span><span class="dws"><button type="button" data-dw="n:-1" aria-label="One fewer drop">−</button><b>${R.nd}</b><button type="button" data-dw="n:1" aria-label="One more drop">+</button></span></div>
  ${R.br?`<div class="fsub">Your breaks</div><div class="fchips fsm">${[[15],[30],[45],[15,30],[15,15],[60]].map(b=>`<button type="button" class="fchip${B.join('+')===b.join('+')?' on':''}" data-dw="b:${b.join('+')}">${b.map(x=>x+' min').join(' + ')}</button>`).join('')}</div>`:''}
  <div class="dwlist">${rows}</div>
  <div class="fsum">${left<0?`<span class="bad">That is ${tkF(-left)} more than the ${tkF(T())} you worked. Take some off, or tap Fit to my times.</span>`:left>=1?`Adds up to ${tkF(u)}. The other <b>${tkF(left)}</b> goes on the end as other work.`:`Adds up to your ${tkF(T())}.`}${Math.abs(left)>=5?' <button type="button" class="tg" data-dw="fit:1" style="margin-left:4px">Fit to my times</button>':''}</div>
  ${E?tkLogView(E,from,to):''}
  ${J&&J.bad.length?`<div class="wn" style="margin-top:8px"><b>⚠ With these answers:</b> ${J.bad.join('. ')}. Move a break or change the times if that is not right. If it is what really happened, save it so your record is honest.</div>`:''}
  ${J&&J.next?`<div class="note" style="margin-top:8px">${J.next}</div>`:''}
  <p class="note">This is a rough guide built from your answers. Your tacho is the real record: check it against your printout if you can.</p>
  <button class="tg big fpri" data-k="ok"${E?'':' disabled'}>Save my day</button><button class="tg big" data-k="bk">← Back</button><button class="tg big" data-k="no">Cancel</button>`);
  MO.querySelectorAll('[data-dwp]').forEach(s=>s.onchange=()=>{R.P[+s.dataset.dwp]=+s.value;keepSc(page2)});
  mcb={no:moX,bk:()=>{R.step=1;page1()},ok:()=>{const E2=build();if(E2)dwSave(E2)}};
  dwEv=e=>{const b=e.target.closest('[data-dw]');const p=b.dataset.dw.split(':'),k=p[0];
   if(k==='m'){const x=R.L[+p[1]];x[p[2]]=Math.max(0,Math.min(16*60,(x[p[2]]||0)+ +p[3]))}
   else if(k==='w'){R.L[+p[1]].w=15}
   else if(k==='c'){R.L[+p[1]].co=p[2]==='1'}
   else if(k==='n'){const nd=Math.max(1,Math.min(20,R.nd+ +p[1]));if(nd!==R.nd){R.nd=nd;mkLegs()}}
   else if(k==='b'){R.B=p[1].split('+').map(Number);R.P={}}
   else if(k==='fit'){/* share the difference over the drives and drops */const lf=T()-used(),D=R.L.filter(x=>x.k==='d'||x.k==='x'),tot=D.reduce((q,x)=>q+x.m,0);
    if(tot>0){let rem=lf;D.forEach((x,j)=>{const ch=j===D.length-1?rem:r5(lf*x.m/tot);const nm=Math.max(0,x.m+ch);rem-=nm-x.m;x.m=nm})}else if(D.length)D[0].m=Math.max(0,D[0].m+lf)}
   keepSc(page2)}};
 page1()}
document.addEventListener('click',e=>{const b=e.target.closest('[data-dw]');if(dwEv&&b&&!$('mo').hidden&&$('mo').contains(b))dwEv(e)});
