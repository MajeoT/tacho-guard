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
 mo(`<h3>Welcome Back</h3><p>You last had TachoGuard open at <b>${hm(prev)}</b>, ${tkF((n-prev)/M)} ago. Since ${hm(from)} it has been counting <b>${TKN[act]}</b>.</p>${geo?`<p>${geo.txt.replace(', so it is filled in below. Change it if it is wrong','')}</p>`:''}${hint}<p>Is that what you were doing all that time?</p>${moved&&act!=='d'||still?nn+yes:yes+nn}<button class="tg big" data-k="no">Ask me later</button>`);
 mcb={no:()=>{try{localStorage.setItem(TKSEEN,String(prev))}catch(e){}moX()},y:moX,nn:()=>tkSince(from,act,geo,`TachoGuard had you on ${tkLow(act)} since ${hm(from)}.`)}}

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
function tkNextLine(){if(!st.active||st.act==='r')return '';const n=Date.now(),J=tkJudge([],n,n,true);return J.next}

document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(tkAway,400);else tkMark()});
setInterval(()=>{if(!document.hidden&&$('mo').hidden){tkMark();if(tkLocOn()){const l=tkLocs().pop();if(!l||Date.now()-l.t>10*M)tkGeoCheck()}}},30000);
/* once: offer location check-ins (they need the phone's permission, so they cannot just be on) */
setTimeout(()=>{if(st.gloc!==undefined||st.glq||!navigator.geolocation||!$('mo').hidden)return;
 mo(`<h3>Turn On Location Check-ins?</h3><p>Each time you open TachoGuard it notes roughly where you are. If you have moved a fair way while it has you on other work, POA or a break, it asks if you drove, so your driving is not missed.</p><p class="note">Kept on this phone only, for 3 days. It never tracks you while the app is closed. Your phone will ask to allow location.</p><button class="tg big fpri" data-k="ok">Turn on</button><button class="tg big" data-k="no">Not now</button>`);
 mcb={no:()=>{st.glq=1;save();moX()},ok:async()=>{st.glq=1;st.gloc=true;save();moX();live();const c=await tkPos(0,true);if(!c&&tkLocErr==='blocked'){st.gloc=false;save();live();flash='Location is blocked, so check-ins are off. Allow location for this site in Chrome, then turn them on in Settings.';setTimeout(()=>{flash='';live()},9000);live()}}}},6000);
setTimeout(tkAway,1500);
