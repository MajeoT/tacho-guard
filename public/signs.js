/* Simplified drawings of common UK road signs for the Signs tab. Meanings follow the Highway Code and the Traffic Signs Manual. */
(function(){
const R='#d4151b',BL='#0a58b3',AM='#f5a300';
const ring=i=>`<circle cx="50" cy="50" r="45" fill="#fff" stroke="${R}" stroke-width="9"/>${i}`;
const blue=i=>`<circle cx="50" cy="50" r="47" fill="${BL}"/>${i}`;
const tri=i=>`<polygon points="50,8 93,85 7,85" fill="#fff" stroke="${R}" stroke-width="8" stroke-linejoin="round"/>${i}`;
const box=i=>`<rect x="6" y="6" width="88" height="88" rx="8" fill="#111"/>${i}`;
const t=(s,x,y,z,f='#111')=>`<text x="${x}" y="${y}" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="${z}" text-anchor="middle" fill="${f}">${s}</text>`;
const lorry=(x,y,s,c='#111')=>`<g transform="translate(${x} ${y}) scale(${s})" fill="${c}"><rect width="30" height="16" rx="1"/><path d="M32 4h9l5 6v6H32z"/><circle cx="9" cy="18" r="3.6"/><circle cx="38" cy="18" r="3.6"/></g>`;
const car=(x,y,s,c='#111')=>`<g transform="translate(${x} ${y}) scale(${s})" fill="${c}"><path d="M2 12l4-8h16l5 8h5v6H0v-6z"/><circle cx="8" cy="18" r="3.4"/><circle cx="25" cy="18" r="3.4"/></g>`;
const arrowUp='<path d="M50 18L74 46H59V82H41V46H26Z" fill="#fff"/>';
const S=[];
const add=(g,n,s,m,h)=>S.push({g,n,s,m,h:h||''});

/* Orders */
add('Orders','Stop',`<polygon points="31,4 69,4 96,31 96,69 69,96 31,96 4,69 4,31" fill="${R}" stroke="#fff" stroke-width="3"/>${t('STOP',50,60,26,'#fff')}`,'You must stop at the line, then give way to traffic on the major road before you go on.','Stop even if the road looks clear. Check your mirrors and the trailer swing before pulling out.');
add('Orders','Give Way',`<polygon points="7,14 93,14 50,92" fill="#fff" stroke="${R}" stroke-width="8" stroke-linejoin="round"/>${t('GIVE WAY',50,38,12)}`,'Give way to traffic on the major road. Be ready to stop at the line.','A long vehicle needs a bigger gap to pull out. Wait for it.');
add('Orders','No Entry',`<circle cx="50" cy="50" r="47" fill="${R}"/><rect x="17" y="41" width="66" height="18" fill="#fff"/>`,'No vehicles may enter. It is usually the exit of a one way street.','Do not follow a satnav down a no entry road. Plan the route for a vehicle your size.');
add('Orders','No Vehicles',ring(''),'No vehicles of any kind are allowed through. Pedal cycles being pushed are allowed.','');
add('Orders','No Overtaking',ring(`${car(14,40,.8)}${car(54,40,.8,R)}`),'You must not overtake the vehicle in front. It applies from the sign until the end sign.','');
add('Orders','No Overtaking by Goods Vehicles',ring(`${lorry(13,38,.52)}${car(52,40,.8,R)}`),'Goods vehicles over the weight shown on the sign, or over 7.5 tonnes if none is shown, must not overtake.','Check the plate under the sign for the weight and for times.');
add('Orders','Speed Limit',ring(t('50',50,64,40)),'The maximum speed in mph. It applies until you pass a different limit sign or the national speed limit sign.','Always use the limit for your vehicle type if it is lower than the sign.');
add('Orders','National Speed Limit',`<circle cx="50" cy="50" r="46" fill="#fff" stroke="#111" stroke-width="4"/><line x1="24" y1="76" x2="76" y2="24" stroke="#111" stroke-width="9"/>`,'The national speed limit applies.','Goods vehicle up to 7.5 tonnes: 50 mph on single carriageways, 60 on dual carriageways and 70 on motorways. Goods vehicle over 7.5 tonnes: 50, 60 and 60. Vehicles towing a trailer have their own limits.');
add('Orders','No Stopping (Clearway)',`<circle cx="50" cy="50" r="45" fill="${BL}" stroke="${R}" stroke-width="8"/><path d="M29 29L71 71M71 29L29 71" stroke="${R}" stroke-width="10"/>`,'You must not stop on the carriageway or verge, even to load or unload, except in an emergency or if traffic forces you to.','A red cross on blue means no stopping at all.');
add('Orders','No Waiting',`<circle cx="50" cy="50" r="45" fill="${BL}" stroke="${R}" stroke-width="8"/><path d="M27 73L73 27" stroke="${R}" stroke-width="10"/>`,'You must not wait here at the times on the plate. Loading and unloading may be allowed, so read the plate.','');

/* Mandatory */
add('Mandatory','Ahead Only',blue(arrowUp),'You must go straight on. A blue circle gives an order.','');
add('Mandatory','Turn Left',blue('<path d="M18 50L44 26V40H80V60H44V74Z" fill="#fff"/>'),'You must turn left ahead.','');
add('Mandatory','Keep Left',blue(`<g transform="rotate(-135 50 50)">${arrowUp}</g>`),'Pass the sign on the left side.','');
add('Mandatory','Minimum Speed',blue(t('30',50,63,38,'#fff')),'You must drive at the speed shown or faster, unless it is unsafe.','');

/* Warning */
add('Warning','Low Bridge',tri('<path d="M30 78V60a20 20 0 0 1 40 0v18" fill="none" stroke="#111" stroke-width="7"/>'),'A low bridge ahead. The plate or a nearby sign shows the headroom in feet and metres.','Check the height of your vehicle and load against the sign. Use the height marker in the cab. If you are too tall, find another route before you reach the bridge. Bridge strikes cost lives and a lot of money.');
add('Warning','Crosswinds',tri(`<path d="M30 74V36" stroke="#111" stroke-width="5"/><path d="M32 38h38l-8 9 8 9H32z" fill="#111"/>`),'You may meet strong side winds, for example on a bridge or an open road.','High sided and empty vehicles are hit hardest. Slow down, keep a firm grip and expect gusts when you pass gaps or leave shelter.');
add('Warning','Steep Hill Downwards',tri(`<path d="M24 56L76 76H24Z" fill="#111"/>${t('10%',60,52,17)}`),'A steep downhill ahead. The figure shows the gradient.','Select a low gear before the top and use the retarder or exhaust brake. Riding the brakes can make them fade.');
add('Warning','Steep Hill Upwards',tri(`<path d="M24 76L76 56V76Z" fill="#111"/>${t('10%',38,52,17)}`),'A steep uphill ahead. The figure shows the gradient.','Change down early and keep the engine in its power band. Leave a bigger gap to the vehicle in front.');
add('Warning','Road Narrows',tri('<path d="M34 78Q46 63 46 53Q46 41 34 31M66 78Q54 63 54 53Q54 41 66 31" fill="none" stroke="#111" stroke-width="6"/>'),'The road narrows ahead on both sides. Be ready to give way or to slow down.','');
add('Warning','Slippery Road',tri(`${car(34,42,.75)}<path d="M28 78q6-7 11 0t11 0t11 0t11 0" fill="none" stroke="#111" stroke-width="4"/>`),'The road surface may be slippery. Slow down and brake gently.','');
add('Warning','Traffic Signals Ahead',tri(`<rect x="40" y="29" width="20" height="50" rx="5" fill="#111"/><circle cx="50" cy="40" r="6" fill="#e53935"/><circle cx="50" cy="54" r="6" fill="${AM}"/><circle cx="50" cy="68" r="6" fill="#2e9e4f"/>`),'Traffic lights ahead. Be ready to stop.','');
add('Warning','Crossroads',tri('<rect x="46" y="30" width="8" height="48" fill="#111"/><rect x="26" y="50" width="48" height="8" fill="#111"/>'),'A crossroads ahead. Look for traffic from both sides.','');
add('Warning','T Junction',tri('<rect x="26" y="36" width="48" height="8" fill="#111"/><rect x="46" y="36" width="8" height="42" fill="#111"/>'),'A T junction ahead. The road you are on ends.','');
add('Warning','Roundabout',tri(`<circle cx="50" cy="58" r="14" fill="none" stroke="#111" stroke-width="5"/><path d="M50 36l-6 9h12zM69 62l-10-2 8-6zM32 62l10-2-8-6z" fill="#111"/>`),'A roundabout ahead. Give way to traffic from the right unless signs say otherwise.','Keep the trailer in lane. On a large roundabout use the left lane and swing wide only if it is safe to do so.');
add('Warning','Level Crossing with Barrier',tri('<rect x="26" y="40" width="5" height="38" fill="#111"/><rect x="69" y="40" width="5" height="38" fill="#111"/><rect x="26" y="46" width="48" height="9" fill="#111"/><path d="M38 46v9M50 46v9M62 46v9" stroke="#fff" stroke-width="3"/>'),'A level crossing with a gate or barrier ahead. Stop when the lights flash or the barrier lowers.','Never stop on the crossing. Make sure there is room for the whole vehicle on the far side. If it is long, low or slow, use the telephone at a user worked crossing and follow the notice.');
add('Warning','Queues Likely',tri(`${car(30,38,.6)}${car(30,56,.6)}`),'Traffic is likely to queue ahead. Slow down early.','Do not rely on the traffic ahead being able to stop quickly. Leave extra room and use your hazards for a queue at speed.');
add('Warning','Other Danger',tri(t('!',50,76,54)),'There is a danger that is not covered by another sign. The plate underneath tells you what.','');

/* Lorry limits */
add('Lorry Limits','Weight Limit',ring(t('7.5t',50,62,28)),'No vehicles over this maximum gross weight. The limit is the vehicle weight shown on its plate, not what it carries.','If your plated weight is over the limit you cannot use the road, even if you are empty. Plates under the sign may allow access for loading.');
add('Lorry Limits','Goods Vehicles Over Weight',ring(`${lorry(27,28,.9)}${t('7.5t',50,74,22)}`),'No goods vehicles over the maximum gross weight shown. A plate may add except for loading or access.','Plan the whole route before you leave and read the plate. A delivery inside a weight limit zone may be allowed, but only for the loading or unloading the plate permits.');
add('Lorry Limits','Height Limit',ring(`<path d="M34 22v56M27 30l7-8 7 8M27 70l7 8 7-8" fill="none" stroke="#111" stroke-width="4"/>${t('4.5m',66,57,17)}`),'No vehicles taller than the height shown.','Measure from the road to the highest point, including a fridge unit, aerials or roof equipment. Set the cab height marker for every load and trailer.');
add('Lorry Limits','Width Limit',ring(`<path d="M18 50h64M26 42l-8 8 8 8M74 42l8 8-8 8" fill="none" stroke="#111" stroke-width="4"/>`),'No vehicles wider than the width shown.','Remember mirrors and loads that overhang the body.');
add('Lorry Limits','Length Limit',ring(`<path d="M16 50h68M24 42l-8 8 8 8M76 42l8 8-8 8" fill="none" stroke="#111" stroke-width="4"/>${t('10m',50,72,17)}`),'No vehicles longer than the length shown.','An artic or a lorry with a drawbar trailer counts its full length.');

/* Motorway */
add('Motorway','Red Cross Lane Signal',box(`<path d="M24 24L76 76M76 24L24 76" stroke="${R}" stroke-width="12"/>`),'Do not use this lane. It is closed. Move to another lane in good time.','If you pass under a red cross on a smart motorway you can be fined and get points.');
add('Motorway','Move Left or Lane Closed Ahead',box(`<g transform="rotate(-135 50 50)"><path d="M50 18L74 46H59V82H41V46H26Z" fill="${AM}"/></g>`),'Move to the lane the arrow points to. A lane is closed ahead.','Start moving over early. A heavy vehicle needs time to merge safely.');
add('Motorway','Variable Speed Limit',box(`<circle cx="50" cy="50" r="34" fill="#fff" stroke="${R}" stroke-width="8"/>${t('50',50,62,30)}`),'A mandatory speed limit set for the conditions. It applies to the lane under the sign.','A limit with a red ring is the law and is often enforced by cameras.');
add('Motorway','Flashing Amber Lights',box(`<circle cx="32" cy="50" r="14" fill="${AM}"/><circle cx="68" cy="50" r="14" fill="${AM}"/>`),'There is a hazard ahead. Slow down and be ready to stop. Look for the message on the sign.','');
/* Roadworks */
const rw=i=>`<rect x="6" y="6" width="88" height="88" rx="8" fill="${AM}" stroke="#111" stroke-width="4"/>${i}`;
add('Roadworks','Road Works',tri(`<circle cx="46" cy="40" r="5" fill="#111"/><path d="M44 46l-8 16 6 2 6-12 6 10 5-3-8-13z M30 70h30l-6-8z" fill="#111"/>`),'Road works ahead. Expect workers, narrowed lanes, cones and slower traffic.','Slow down early and be ready to stop. Workers may be close to your wing mirrors.');
add('Roadworks','Lane Closed Ahead',rw(`<g fill="#111"><rect x="30" y="20" width="10" height="60"/><rect x="60" y="20" width="10" height="60"/></g><path d="M50 78V44M38 54l12-14 12 14" stroke="#111" stroke-width="7" fill="none"/>`),'A lane is closed ahead for works. Merge in good time to the lane that stays open.','Let a gap open and merge early. Do not push in at the last moment.');
add('Roadworks','Temporary Speed Limit',`<circle cx="50" cy="50" r="45" fill="#fff" stroke="${R}" stroke-width="9"/>${t('40',50,63,36)}`,'A mandatory speed limit through the works. It stays in force until you see the end of the limit.','Roadworks limits are often enforced by average speed cameras. Your HGV limit still applies if it is lower.');
add('Roadworks','Road Narrows',tri(`<path d="M34 78V50l12-26M66 78V50L54 24" stroke="#111" stroke-width="8" fill="none"/>`),'The road gets narrower ahead on both sides.','Check your width against any width limit and give way where signs say so.');
/* Direction */
const rc=(bg,bd,i)=>`<rect x="4" y="22" width="92" height="56" rx="6" fill="${bg}" stroke="${bd}" stroke-width="4"/>${i}`;
add('Direction','Motorway Direction Sign',rc(BL,'#fff',t('M1',50,60,26,'#fff')),'Blue background with white text: the route is a motorway, or leads onto one.','Motorways have their own rules, including no stopping on the hard shoulder except in an emergency.');
add('Direction','Primary Route Sign',rc('#0b7a3b','#fff',t('A1',50,60,26,'#fff')),'Green background with white text: a primary route, the main A roads between large towns.','');
add('Direction','Local Route Sign',rc('#fff','#111',t('Town',50,60,22,'#111')),'White background with black text and border: a non-primary or local route.','');
add('Direction','Tourist Sign',rc('#7a4a1b','#fff',t('Castle',50,60,20,'#fff')),'Brown background: a tourist attraction or tourist route.','Check the height and weight limits before following signs to an attraction.');
/* Information */
add('Information','Parking',`<rect x="6" y="6" width="88" height="88" rx="8" fill="${BL}"/>${t('P',50,72,64,'#fff')}`,'A place where you may park. Read any plates for times, tickets and who the parking is for.','Check that the bay suits your vehicle length and weight.');
add('Information','Hospital',`<rect x="6" y="6" width="88" height="88" rx="8" fill="${BL}"/><rect x="20" y="20" width="60" height="60" fill="#fff"/><path d="M50 28v44M28 50h44" stroke="${BL}" stroke-width="12"/>`,'The way to a hospital, or the hospital itself. Take care for ambulances and pedestrians.','');
add('Information','Lane Direction Signs',rc(BL,'#fff','<path d="M34 70V36M34 36l-8 10M34 36l8 10M66 70V36M66 36l-8 10M66 36l8 10" stroke="#fff" stroke-width="5" fill="none"/>'),'Arrows on a blue panel show which lanes go where. Get in the right lane in good time.','Use your mirrors and signal early so other traffic can see a long vehicle changing lane.');
window.SIGNS=S;
})();
