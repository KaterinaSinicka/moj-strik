import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, setDoc,
  deleteDoc, collection, onSnapshot, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getMessaging, getToken, onMessage, isSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

const fbApp = initializeApp(self.FIREBASE_CONFIG);
const auth = getAuth(fbApp);
const fs = initializeFirestore(fbApp, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
let swReg = null, messaging = null;
if ("serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.register("./sw.js").then(r => swReg = r).catch(console.warn);
  // новая версия приложения установилась → один раз перезагружаемся
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
  // при каждом возвращении в приложение проверяем, нет ли обновления
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") swReg?.update().catch(() => {}); });
}

/* ---------- constants ---------- */
const CATALOG=[
 {g:"Зал",items:[["leg","🦵","Leg day"],["arm","💪","Arm day"],["full","🏋️‍♀️","Full body"],["cardio","🏃‍♀️","Кардио"],["home","🏠","Тренировка дома"]]},
 {g:"Улица и вода",items:[["run","👟","Бег"],["walk","🚶‍♀️","Прогулка"],["hike","🥾","Поход"],["bike","🚴","Велосипед"],["swim","🏊","Плавание"]]},
 {g:"Студия",items:[["dance","💃","Танцы"],["yoga","🧘","Йога"],["pilates","🤸","Пилатес"],["stretch","🙆‍♀️","Растяжка"],["boulder","🧗","Боулдеринг"],["box","🥊","Бокс"]]},
 {g:"Игры",items:[["football","⚽","Футбол"],["basket","🏀","Баскетбол"],["volley","🏐","Волейбол"],["tennis","🎾","Теннис"],["pingpong","🏓","Настольный теннис"]]},
 {g:"Зима",items:[["ski","⛷️","Лыжи"],["snowboard","🏂","Сноуборд"],["skate","⛸️","Коньки"]]}
];
const CAT={};CATALOG.forEach(g=>g.items.forEach(([id,e,n])=>CAT[id]={e,n}));
const REST={e:"😴",n:"Отдых"};
const DOW=["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];
const WEEK_ORDER=[1,2,3,4,5,6,0];
const DEF_PLAN={1:"leg",2:"cardio",3:"arm",4:"rest",5:"leg",6:"cardio",0:"rest"};
const MEALS=[{k:"b",n:"Завтрак",e:"🍳",h:11,msg:"Завтрак сам себя не съест 🍳"},{k:"l",n:"Обед",e:"🥗",h:16,msg:"Обед ждёт тебя, а ты его игноришь 🥗"},{k:"d",n:"Ужин",e:"🍲",h:21,msg:"Ужин тоже считается, не забудь отметить 🍲"}];
const TIERS={bronze:{n:"Бронза",c:"var(--bronze)"},silver:{n:"Серебро",c:"var(--silver)"},gold:{n:"Золото",c:"var(--gold)"},plat:{n:"Платина",c:"var(--plat)"}};
const TROPHIES=[
 {id:"first",t:"bronze",e:"⚖️",n:"Первый шаг",d:"Первое взвешивание",p:s=>[s.weighIns,1]},
 {id:"fullday",t:"bronze",e:"✅",n:"Идеальный день",d:"Вес, три приёма пищи и тренировка за один день",p:s=>[s.full,1]},
 {id:"s3",t:"bronze",e:"🔥",n:"Разогрев",d:"Стрик 3 дня",p:s=>[s.best,3]},
 {id:"photo10",t:"bronze",e:"📸",n:"Фуд-блогер",d:"10 фото еды",p:s=>[s.photos,10]},
 {id:"lark",t:"bronze",e:"🐦",n:"Ой, ты жаворонок",d:"Тренировка до 10:00",p:s=>[s.early,1]},
 {id:"owl",t:"bronze",e:"🦉",n:"А я думала, сова",d:"Тренировка после 21:00",p:s=>[s.late,1]},
 {id:"hour1",t:"bronze",e:"⏱️",n:"Первый час",d:"60 минут тренировок в сумме",p:s=>[s.min,60]},
 {id:"here5",t:"bronze",e:"📍",n:"Я тут была",d:"5 фото с тренировок",p:s=>[s.wphotos,5]},
 {id:"wo5",t:"bronze",e:"🏋️‍♀️",n:"Втянулась",d:"5 тренировок",p:s=>[s.wo,5]},
 {id:"s7",t:"silver",e:"🔥",n:"Неделя огня",d:"Стрик 7 дней",p:s=>[s.best,7]},
 {id:"wo20",t:"silver",e:"💪",n:"В ритме",d:"20 тренировок",p:s=>[s.wo,20]},
 {id:"variety3",t:"silver",e:"🎨",n:"Многостаночница",d:"3 разных вида активности",p:s=>[s.kinds,3]},
 {id:"fav10",t:"silver",e:"⭐",n:"Любимое дело",d:"10 тренировок одного вида",p:s=>[s.fav,10]},
 {id:"w30",t:"silver",e:"🗓️",n:"Ритуал",d:"30 утренних взвешиваний",p:s=>[s.weighIns,30]},
 {id:"q25",t:"silver",e:"📉",n:"Четверть пути",d:"25% цели",p:s=>[s.pct,25]},
 {id:"long90",t:"silver",e:"🧱",n:"Марафонка",d:"Одна тренировка 90+ минут",p:s=>[s.maxSess,90]},
 {id:"h10",t:"silver",e:"⌛",n:"10 часов в деле",d:"10 часов тренировок",p:s=>[Math.floor(s.min/60),10]},
 {id:"h50",t:"gold",e:"🕰️",n:"50 часов в деле",d:"50 часов тренировок",p:s=>[Math.floor(s.min/60),50]},
 {id:"s30",t:"gold",e:"🔥",n:"Месяц без пропусков",d:"Стрик 30 дней",p:s=>[s.best,30]},
 {id:"wo50",t:"gold",e:"🏆",n:"Зверь в зале",d:"50 тренировок",p:s=>[s.wo,50]},
 {id:"q50",t:"gold",e:"⛰️",n:"Экватор",d:"Половина цели",p:s=>[s.pct,50]},
 {id:"plat",t:"plat",e:"💎",n:"Цель достигнута",d:"100% цели",p:s=>[s.pct,100]}
];

/* ---------- utils ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad=n=>String(n).padStart(2,"0");
const keyOf=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const parseKey=k=>{const [y,m,d]=k.split("-").map(Number);return new Date(y,m-1,d)};
const addDays=(k,n)=>{const d=parseKey(k);d.setDate(d.getDate()+n);return keyOf(d)};
const todayKey=()=>keyOf(new Date());
const num=v=>{const n=parseFloat(String(v).replace(",","."));return isFinite(n)?n:null};
const fmt=n=>(Math.round(n*10)/10).toString().replace(".",",");
const clone=o=>JSON.parse(JSON.stringify(o));
const nowHM=()=>{const d=new Date();return pad(d.getHours())+":"+pad(d.getMinutes())};
const toMin=hm=>{if(!hm)return null;const [h,m]=hm.split(":").map(Number);return h*60+m};
const fromMin=m=>{m=((m%1440)+1440)%1440;return pad(Math.floor(m/60))+":"+pad(m%60)};
function durOf(d){const a=toMin(d.wot),b=toMin(d.woe);if(a==null||b==null)return 0;let x=b-a;if(x<0)x+=1440;return x>720?0:x}
const fmtDur=m=>{m=Math.round(m);const h=Math.floor(m/60),mm=m%60;return h?h+" ч"+(mm?" "+mm+" мин":""):mm+" мин"};
const SNACKS=[["☕","Кофе"],["🍵","Чай"],["🍎","Фрукт"],["🥜","Орехи"],["🍫","Сладкое"],["🥛","Йогурт"],["🥤","Напиток"],["🥪","Другое"]];

/* ---------- state ---------- */
let picker=false, pickSel=null, snackMenu=false, snackSel=null, showCatalog=false, freezeFor=null, freezeReason=null;
let uid=null, st=null, photos={}, board=[], tab="today", pendingPhoto=null, unsubGroup=null, authMode="login";

const chains={};
function serial(key,fn){chains[key]=(chains[key]||Promise.resolve()).then(fn).catch(onWriteErr);return chains[key]}
function onWriteErr(e){
  console.error(e);
  if(e&&e.code==="permission-denied")toastText("Нет доступа","Проверь правила Firestore");
  else if(e&&e.code==="resource-exhausted")toastText("Лимит Firebase на сегодня","Попробуй позже");
  else toastText("Не сохранилось","Проверь интернет, попробуем ещё раз при следующем изменении");
}
let saveT=null;
function save(){
  clearTimeout(saveT);
  saveT=setTimeout(()=>{if(!uid)return;const snap=clone(st);serial("state",()=>setDoc(doc(fs,"users",uid),snap));pushBoard()},500);
}

/* ---------- logic ---------- */
function day(k){return st.log[k]||(st.log[k]={})}
function act(id){
  if(id==="rest")return REST;if(CAT[id])return CAT[id];
  const c=(st.custom||[]).find(x=>x.id===id);return c?{e:c.e,n:c.n}:{e:"⭐",n:"Активность"};
}
const unlockedCount=()=>TROPHIES.filter(t=>(st.unlocked||{})[t.id]).length;
function planFor(k){return st.plan[parseKey(k).getDay()]||"rest"}
function isFull(k){
  const d=st.log[k];if(!d)return false;
  return d.w!=null&&d.b&&d.l&&d.d&&(planFor(k)==="rest"||!!d.wo);
}
function currentWeight(){
  const ks=Object.keys(st.log).filter(k=>st.log[k].w!=null).sort();
  return ks.length?st.log[ks[ks.length-1]].w:st.start;
}
function pctGoal(){
  const span=st.start-st.goal;if(!span)return 0;
  const p=(st.start-currentWeight())/span*100;
  return Math.max(0,Math.min(100,Math.round(p)));
}
const isFrozen=k=>!!(st.log[k]&&st.log[k].frz);
function streakAt(k){let n=0;while(isFull(k)||isFrozen(k)){if(isFull(k))n++;k=addDays(k,-1)}return n}
function streakNow(){
  let k=todayKey();if(!isFull(k)&&!isFrozen(k))k=addDays(k,-1);
  return streakAt(k);
}
const weekStart=k=>addDays(k,-((parseKey(k).getDay()+6)%7));
function freezeUsedInWeek(k){const ws=weekStart(k);for(let i=0;i<7;i++){const x=addDays(ws,i);if(x!==k&&isFrozen(x))return x}return null}
const canFreeze=k=>!isFull(k)&&!isFrozen(k)&&!freezeUsedInWeek(k);
const REASONS=[["sick","🤒","Болею"],["trip","✈️","В поездке"],["work","💼","Много работы"],["party","🎉","Праздник"],["tired","🌧️","Нет сил"],["other","✍️","Другое"]];
const reasonLabel=r=>{const x=REASONS.find(z=>z[0]===r);return x?x[1]+" "+x[2]:"❄️"};
function stats(){
  const ks=Object.keys(st.log).sort();
  const s={weighIns:0,photos:0,full:0,wo:0,by:{},best:0,pct:pctGoal(),kinds:0,fav:0,early:0,late:0,min:0,maxSess:0,wphotos:0};
  for(const k of ks){
    const d=st.log[k];
    if(d.w!=null)s.weighIns++;
    s.photos+=["b","l","d"].filter(m=>d["p"+m]).length+(d.sn||[]).filter(x=>x.p).length;
    if(d.pw)s.wphotos++;
    if(d.wo&&d.wo!=="rest"){const du=durOf(d);s.min+=du;s.maxSess=Math.max(s.maxSess,du)}
    if(d.wo&&d.wo!=="rest"){s.wo++;s.by[d.wo]=(s.by[d.wo]||0)+1;if(d.wot&&d.wot<"10:00")s.early++;if(d.wot&&d.wot>="21:00")s.late++}
    if(isFull(k))s.full++;
  }
  s.kinds=Object.keys(s.by).length;s.fav=Math.max(0,...Object.values(s.by));
  if(ks.length){
    let k=ks[0],run=0;const end=todayKey();
    while(k<=end){if(isFull(k)){run++;s.best=Math.max(s.best,run)}else if(!isFrozen(k))run=0;k=addDays(k,1)}
  }
  return s;
}
function checkTrophies(silent){
  const s=stats();st.unlocked=st.unlocked||{};const fresh=[];
  for(const t of TROPHIES){const [v,goal]=t.p(s);if(v>=goal&&!st.unlocked[t.id]){st.unlocked[t.id]=todayKey();fresh.push(t)}}
  if(fresh.length&&!silent){fresh.forEach((t,i)=>setTimeout(()=>toastTrophy(t),i*3800));save()}
  return fresh;
}
function paceText(start,goal,deadline){
  if(start==null||goal==null||!deadline)return "";
  const days=(parseKey(deadline)-parseKey(todayKey()))/864e5;
  if(days<=0)return "Выбери дату в будущем.";
  const perWeek=Math.abs(start-goal)/(days/7);
  let t="Темп: примерно "+fmt(perWeek)+" кг в неделю.";
  if(perWeek>1)t+=" Это быстрее, чем обычно советуют (0,5–1 кг в неделю). Можно, но прислушивайся к самочувствию.";
  return t;
}

/* ---------- group (together) ---------- */
let lastBoard="";
function boardBody(){
  const k=todayKey(),d=st.log[k]||{};
  return {nick:st.nick.slice(0,30),pct:pctGoal(),streak:streakNow(),trophies:unlockedCount(),
    day:k,w:d.w!=null,m:["b","l","d"].filter(m=>d[m]).length,wo:!!d.wo,rest:planFor(k)==="rest",frz:d.frz?d.frz.r:null,
    wmin:(()=>{const ws=weekStart(k);let m=0;for(let i=0;i<7;i++){const x=st.log[addDays(ws,i)];if(x&&x.wo&&x.wo!=="rest")m+=durOf(x)}return m})(),
    sent:Object.fromEntries(Object.entries(st.sent||{}).filter(([,v])=>v.day===k))};
}
function pushBoard(force){
  if(!uid||!st||!st.nick||!st.group)return Promise.resolve();
  const body=boardBody(),j=JSON.stringify(body);
  if(j===lastBoard&&!force)return Promise.resolve();lastBoard=j;
  const g=st.group;
  return serial("board",()=>setDoc(doc(fs,"groups",g,"members",uid),{...body,upd:Date.now()}));
}
function subscribeGroup(){
  if(unsubGroup){unsubGroup();unsubGroup=null}
  board=[];if(!st.group)return;
  unsubGroup=onSnapshot(collection(fs,"groups",st.group,"members"),snap=>{
    board=snap.docs.map(d=>({id:d.id,...d.data()}));
    notifyReactions();
    if(tab==="together")render();
  },e=>console.warn("group",e));
}
const REACTS=["🔥","👏","💪","❤️"];
function received(pid){const tk=todayKey();return board.filter(o=>o.id!==pid&&o.sent&&o.sent[pid]&&o.sent[pid].day===tk).map(o=>({id:o.id,e:o.sent[pid].e,nick:o.nick||"Кто-то"}))}
function notifyReactions(){
  let seen=[];try{seen=JSON.parse(localStorage.getItem("ms-seen-react")||"[]")}catch(e){}
  const tk=todayKey(),fresh=received(uid).filter(r=>!seen.includes(r.id+":"+r.e+":"+tk));
  if(!fresh.length)return;
  toastText(fresh.map(r=>r.e).join(" ")+" для тебя!",fresh.map(r=>r.nick).join(", ")+" поддерживает тебя");
  seen=[...seen.filter(x=>x.endsWith(tk)),...fresh.map(r=>r.id+":"+r.e+":"+tk)];
  try{localStorage.setItem("ms-seen-react",JSON.stringify(seen))}catch(e){}
}
function newCode(){
  const a="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let s="";
  const r=crypto.getRandomValues(new Uint32Array(8));for(const x of r)s+=a[x%a.length];return s;
}
async function joinGroup(code){
  code=String(code||"").trim().toUpperCase();
  if(!/^[A-Z0-9]{6,12}$/.test(code)){toastText("Неверный код","6–12 букв и цифр");return}
  if(st.group&&st.group!==code)await leaveGroup(true);
  st.group=code;lastBoard="";
  await pushBoard(true);
  subscribeGroup();save();render();
}
async function leaveGroup(quiet){
  if(!st.group)return;
  const g=st.group;
  if(unsubGroup){unsubGroup();unsubGroup=null}
  try{await deleteDoc(doc(fs,"groups",g,"members",uid))}catch(e){console.warn(e)}
  st.group=null;board=[];lastBoard="";
  if(!quiet){save();render()}
}

/* ---------- notifications ---------- */
const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone=matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
async function initMessaging(){
  if(messaging)return messaging;
  if(!(await isSupported().catch(()=>false)))return null;
  messaging=getMessaging(fbApp);
  onMessage(messaging,p=>toastText(p.notification?.title||"Мой стрик",p.notification?.body||""));
  return messaging;
}
async function registerToken(){
  const m=await initMessaging();if(!m)return false;
  const reg=swReg||await navigator.serviceWorker.ready;
  const token=await getToken(m,{vapidKey:self.VAPID_KEY,serviceWorkerRegistration:reg});
  if(!token)return false;
  await setDoc(doc(fs,"tokens",uid),{tokens:arrayUnion(token)},{merge:true});
  return true;
}
async function enableNotifications(){
  if(isIOS&&!isStandalone){toastText("Сначала на экран Домой","В Safari: Поделиться → На экран Домой, потом открой приложение с иконки");return}
  if(!("Notification" in window)||!(await initMessaging())){toastText("Этот браузер не умеет push","Попробуй Chrome на Android или установленное приложение на iPhone");return}
  const perm=await Notification.requestPermission();
  if(perm!=="granted"){toastText("Уведомления запрещены","Разреши их в настройках браузера для этого сайта");return}
  try{
    if(await registerToken()){st.remind.on=true;save();render();toastText("Уведомления включены 🔔","Напомню про вес, еду и стрик")}
  }catch(e){console.error(e);toastText("Не получилось включить","Проверь VAPID_KEY в firebase-config.js")}
}
function notifStatus(){
  if(!("Notification" in window))return isIOS&&!isStandalone?"На iPhone уведомления работают только в приложении с экрана Домой.":"Этот браузер не поддерживает push-уведомления.";
  if(Notification.permission==="denied")return "Уведомления запрещены в настройках браузера.";
  if(Notification.permission==="granted"&&st.remind.on)return "Уведомления включены на этом устройстве ✅";
  return "Уведомления выключены.";
}

/* ---------- photos ---------- */
function compress(file,max=560,limit=75000){
  return new Promise((res,rej)=>{
    const img=new Image(),url=URL.createObjectURL(file);
    img.onload=()=>{
      const sc=Math.min(1,max/Math.max(img.width,img.height));
      const c=document.createElement("canvas");c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);
      c.getContext("2d").drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);
      let q=.7,out=c.toDataURL("image/jpeg",q);
      while(out.length>limit&&q>.3){q-=.1;out=c.toDataURL("image/jpeg",q)}
      res(out);
    };
    img.onerror=()=>{URL.revokeObjectURL(url);rej(new Error("img"))};
    img.src=url;
  });
}
$("#photo").addEventListener("change",async e=>{
  const f=e.target.files[0];e.target.value="";if(!f||!pendingPhoto)return;
  const pp=pendingPhoto;pendingPhoto=null;
  try{
    const k=todayKey(),d=day(k);
    const data=await compress(f,pp.kind==="snack"?400:560,pp.kind==="snack"?45000:75000);
    photos[k]=photos[k]||{};
    if(pp.kind==="meal"){photos[k][pp.key]=data;d[pp.key]=true;d["p"+pp.key]=true}
    else if(pp.kind==="wo"){photos[k].w=data;d.pw=true}
    else{const sn=(d.sn||[]).find(x=>x.id===pp.key);if(!sn)return;photos[k][sn.id]=data;sn.p=true;snackSel=null}
    savePhotos(k);checkTrophies();save();render();
  }catch(err){toastText("Не получилось загрузить фото","Попробуй другое изображение")}
});
function savePhotos(k){const snap=clone(photos[k]||{});serial("ph",()=>setDoc(doc(fs,"users",uid,"photos",k),snap))}

/* ---------- toast ---------- */
let toastT=null;
function showToast(html){
  const t=$("#toast");t.innerHTML=html;t.classList.add("show");
  clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove("show"),3800);
}
function toastTrophy(t){
  const prize=(st.prizes||{})[t.id];
  showToast(`<div class="tin"><div class="medal" style="--tc:${TIERS[t.t].c}">${t.e}</div><div><b>Трофей получен: ${esc(t.n)}</b><small>${prize?"🎁 Приз: "+esc(prize):TIERS[t.t].n}</small></div></div>`);
}
function toastText(a,b){showToast(`<div class="tin"><div><b>${esc(a)}</b><small>${esc(b)}</small></div></div>`)}

/* ---------- week summary ---------- */
function weekSummary(ws){
  const end=todayKey(),days=[];for(let i=0;i<7;i++){const k=addDays(ws,i);if(k<=end)days.push(k)}
  const r={ws,days:days.length,full:0,wo:0,min:0,by:{},meals:0,weigh:0,frz:[],tro:[],delta:null};
  for(const k of days){const d=st.log[k]||{};
    if(isFull(k))r.full++;if(d.frz)r.frz.push(d.frz.r);
    if(d.wo&&d.wo!=="rest"){r.wo++;r.by[d.wo]=(r.by[d.wo]||0)+1;r.min+=durOf(d)}
    r.meals+=["b","l","d"].filter(m=>d[m]).length;if(d.w!=null)r.weigh++;}
  const wk=Object.keys(st.log).filter(k=>st.log[k].w!=null).sort();
  const inW=wk.filter(k=>k>=ws&&k<=addDays(ws,6)),before=wk.filter(k=>k<ws);
  if(inW.length){const last=st.log[inW[inW.length-1]].w,base=before.length?st.log[before[before.length-1]].w:st.log[inW[0]].w;if(inW.length>1||before.length)r.delta=last-base}
  r.tro=TROPHIES.filter(t=>{const u=(st.unlocked||{})[t.id];return u&&u>=ws&&u<=addDays(ws,6)});
  return r;
}
function summaryHTML(r,title,dismiss){
  const range=parseKey(r.ws).toLocaleDateString("ru-RU",{day:"numeric",month:"short"})+" – "+parseKey(addDays(r.ws,6)).toLocaleDateString("ru-RU",{day:"numeric",month:"short"});
  const verdict=r.full>=6?"Легенда недели 👑":r.full>=4?"Отличная неделя 💪":r.full>=2?"Неплохо, на следующей будет ещё лучше 🙌":"Новая неделя, новый старт ✨";
  const top=Object.entries(r.by).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([id,n])=>act(id).e+" "+esc(act(id).n)+" ×"+n).join(", ");
  const dl=r.delta==null?"":Math.abs(r.delta)<0.05?"0":(r.delta<0?"−"+fmt(-r.delta):"+"+fmt(r.delta));
  return `<div class="sumcard"><div class="sumhd"><h3>${title}</h3><span class="small muted">${range}</span></div>
    <p class="sumverdict">${verdict}</p>
    <div class="sumgrid"><div><b>${r.full}/7</b><span class="small muted">идеальных дней</span></div><div><b>${r.wo}</b><span class="small muted">тренировок</span></div>
      <div><b>${r.meals}/${r.days*3}</b><span class="small muted">приёмов пищи</span></div><div><b>${dl||r.weigh+"/"+r.days}</b><span class="small muted">${dl?"кг за неделю":"взвешиваний"}</span></div></div>
    ${r.min?`<p class="small">Время в тренировках: ${fmtDur(r.min)}</p>`:""}
    ${top?`<p class="small" style="margin-top:6px">Чаще всего: ${top}</p>`:""}
    ${r.tro.length?`<p class="small" style="margin-top:6px">Новые трофеи: ${r.tro.map(t=>t.e+" "+esc(t.n)).join(", ")}</p>`:""}
    ${r.frz.length?`<p class="small" style="margin-top:6px">Заморозка: ${r.frz.map(reasonLabel).join(", ")}</p>`:""}
    ${dismiss?`<button class="linkbtn" style="margin-top:8px" data-act="sumhide" data-ws="${r.ws}">Скрыть</button>`:""}
  </div>`;
}
function freezePanel(k){
  const label=k===todayKey()?"сегодня":"вчера";
  return `<div class="freeze">
    <h3>❄️ Заморозить ${label}</h3>
    <p class="small" style="margin-top:4px">Одна заморозка в неделю. Стрик не прервётся, но и не вырастет за этот день. Напоминаний в этот день не будет.</p>
    <p class="small" style="font-weight:700;margin-top:12px">Почему?</p>
    <div class="chips" style="margin-top:6px">${REASONS.map(([id,e,n])=>`<button class="chip ${freezeReason===id?"on":""}" data-act="frzreason" data-r="${id}" aria-pressed="${freezeReason===id}">${e} ${n}</button>`).join("")}</div>
    <input id="frz-note" maxlength="80" placeholder="Комментарий, если хочешь" style="margin-top:10px" aria-label="Комментарий">
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn" data-act="frzdo" ${freezeReason?"":"disabled"}>Заморозить</button><button class="btn ghost" data-act="frzcancel">Отмена</button></div>
  </div>`;
}
function freezeBlock(){
  const k=todayKey(),y=addDays(k,-1),d=st.log[k]||{};
  if(freezeFor)return freezePanel(freezeFor);
  if(d.frz)return `<div class="freeze"><h3>❄️ День заморожен</h3><p class="small" style="margin-top:4px">${reasonLabel(d.frz.r)}${d.frz.note?": "+esc(d.frz.note):""}. Стрик в безопасности, отдыхай.</p>
    <button class="linkbtn" style="margin-top:6px" data-act="unfreeze" data-k="${k}">Разморозить</button></div>`;
  const yLost=!isFull(y)&&!isFrozen(y)&&streakAt(addDays(y,-1))>0&&!isFull(k);
  if(yLost&&canFreeze(y))return `<div class="freeze"><h3>Вчера стрик 🔥${streakAt(addDays(y,-1))} прервался</h3><p class="small" style="margin-top:4px">Если была причина, его можно спасти заморозкой.</p>
    <button class="btn" style="margin-top:10px" data-act="frzopen" data-k="${y}">❄️ Заморозить вчера</button></div>`;
  if(!isFull(k)&&canFreeze(k))return `<button class="linkbtn" style="margin-top:12px" data-act="frzopen" data-k="${k}">❄️ Заморозить сегодня</button>`;
  if(!isFull(k)&&!isFrozen(k)){const u=freezeUsedInWeek(k);if(u)return `<p class="small muted" style="margin-top:12px">❄️ Заморозка на этой неделе уже использована.</p>`}
  return "";
}
function summaryToday(){
  const k=todayKey(),dow=parseKey(k).getDay(),h=new Date().getHours();
  let ws=null,title="";
  if(dow===0&&h>=18){ws=weekStart(k);title="Итоги этой недели"}
  else if(dow===1){ws=weekStart(addDays(k,-1));title="Итоги прошлой недели"}
  if(!ws||st.sumHidden===ws)return "";
  const r=weekSummary(ws);if(!Object.keys(st.log).some(x=>x>=ws&&x<=addDays(ws,6)))return "";
  return summaryHTML(r,title,true);
}

function workoutBlock(k,d,plan,T,ph){
  const ptime=st.planTime[parseKey(k).getDay()];
  if(d.wo){
    const du=durOf(d),a=act(d.wo);
    return `<div class="band isdone">
      <span class="big" aria-hidden="true">${a.e}</span>
      <div class="grow"><h3>${esc(a.n)}</h3><p class="small">Сделано, ты молодец!${du?" ⏱ "+fmtDur(du):""}</p>
        <div class="wotimes"><label>Начало <input type="time" id="wot" value="${esc(d.wot||"")}"></label><label>Конец <input type="time" id="woe" value="${esc(d.woe||"")}"></label></div></div>
      <button class="btn" data-act="wo" aria-label="Снять отметку">✓</button>
    </div>
    <div class="wophoto">${ph.w?`<img src="${ph.w}" alt="Фото с тренировки"><button class="linkbtn" data-act="wophoto">Заменить фото</button>`:`<button class="btn ghost" data-act="wophoto">📷 Сфоткать, где ты была</button>`}</div>`;
  }
  if(d.run){
    const a=act(d.run.a),el=Math.max(0,(Date.now()-d.run.ts)/60000);
    return `<div class="band running">
      <span class="big" aria-hidden="true">${a.e}</span>
      <div class="grow"><h3>${esc(a.n)}</h3><p class="small">Началась в ${esc(d.run.s)}, идёт ${fmtDur(el)}</p></div>
      <button class="btn" data-act="wofinish">⏹ Закончить</button>
    </div>
    <button class="linkbtn" style="margin-top:8px" data-act="wocancel">Отменить тренировку</button>`;
  }
  const rest=plan==="rest";
  let html=`<div class="band ${rest?"rest":""}">
    <span class="big" aria-hidden="true">${T.e}</span>
    <div class="grow"><h3>${esc(T.n)}</h3><p class="small">${rest?"Сегодня отдыхаем, это тоже часть плана.":"По плану на сегодня"+(ptime?" в "+ptime:"")}</p></div>
    ${rest?"":`<button class="btn" data-act="wostart" data-a="${esc(plan)}">▶️ Начать</button>`}
  </div>
  <button class="linkbtn" style="margin-top:8px" data-act="picker">${rest?"Всё равно тренируешься? Выбрать":"Другое занятие или уже позанималась?"}</button>`;
  if(picker){
    const sel=pickSel||(rest?st.activities[0]:plan);
    html+=st.activities.length?`<div class="chips" style="margin-top:8px">${st.activities.map(id=>`<button class="chip ${sel===id?"on":""}" data-act="pickact" data-a="${esc(id)}" aria-pressed="${sel===id}">${act(id).e} ${esc(act(id).n)}</button>`).join("")}</div>
      <div style="display:flex;gap:8px;margin-top:10px"><button class="btn" data-act="wostart" data-a="${esc(sel)}">▶️ Начать</button><button class="btn ghost" data-act="womanual" data-a="${esc(sel)}">✓ Уже сделала</button></div>`
      :`<p class="small muted" style="margin-top:8px">Добавь активности во вкладке «Зал»</p>`;
  }
  return html;
}
function snackBlock(k,d,ph){
  const sn=d.sn||[];
  let html=`<h2>Перекусы</h2><div class="snacks">${sn.map(x=>`<button class="snack ${snackSel===x.id?"sel":""}" data-act="snsel" data-id="${esc(x.id)}" aria-label="${esc(x.n)} в ${esc(x.t)}">
      ${ph[x.id]?`<img src="${ph[x.id]}" alt="">`:`<span class="semo" aria-hidden="true">${x.e}</span>`}<span class="sl">${esc(x.n)}<small>${esc(x.t)}</small></span></button>`).join("")}
    ${sn.length<8?`<button class="snack add" data-act="snadd" aria-expanded="${snackMenu}"><span class="semo" aria-hidden="true">＋</span><span class="sl">Перекус</span></button>`:""}</div>`;
  if(snackMenu)html+=`<div class="chips" style="margin-top:10px">${SNACKS.map(([e,n],i)=>`<button class="chip" data-act="snnew" data-i="${i}">${e} ${n}</button>`).join("")}</div>`;
  const cur=sn.find(x=>x.id===snackSel);
  if(cur)html+=`<div style="display:flex;gap:8px;margin-top:10px"><button class="btn ghost" data-act="snphoto" data-id="${esc(cur.id)}">📷 ${ph[cur.id]?"Заменить фото":"Фото"}</button><button class="btn ghost" data-act="sndel" data-id="${esc(cur.id)}">🗑 Удалить</button></div>`;
  return html;
}
function waterBlock(d){
  const n=d.wa||0,g=st.water.goal;
  return `<h2>Вода</h2><div class="water">
    <button class="btn ghost" data-act="water" data-d="-1" aria-label="Минус стакан" ${n?"":"disabled"}>−</button>
    <div class="glasses" aria-label="${n} из ${g} стаканов">${Array.from({length:Math.max(g,n)},(_,i)=>`<span class="${i<n?"on":""}">💧</span>`).join("")}</div>
    <button class="btn" data-act="water" data-d="1" aria-label="Плюс стакан">+</button>
  </div><p class="small muted" style="margin-top:6px">${n} из ${g} стаканов по 250 мл${n>=g?" 🎉":""}</p>`;
}

/* ---------- charts ---------- */
function barsSVG(items,unit){
  const W=320,H=150,pb=22,pt=16,bw=(W-20)/items.length,max=Math.max(1,...items.map(x=>x.v));
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Минуты тренировок по неделям">${items.map((x,i)=>{
    const h=(H-pb-pt)*x.v/max,xx=10+i*bw+bw*.18,w=bw*.64,y=H-pb-h;
    return `<rect x="${xx.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(h,x.v?2:0).toFixed(1)}" rx="5" fill="${x.hi?"var(--accent)":"var(--sunk)"}" stroke="var(--accent)" stroke-opacity="${x.hi?0:.35}"/>
      ${x.v?`<text x="${(xx+w/2).toFixed(1)}" y="${(y-4).toFixed(1)}" text-anchor="middle" font-size="9" fill="var(--muted)" font-family="Manrope">${x.lab2}</text>`:""}
      <text x="${(xx+w/2).toFixed(1)}" y="${H-6}" text-anchor="middle" font-size="9" fill="var(--muted)" font-family="Manrope">${x.lab}</text>`}).join("")}</svg>`;
}
function hbars(rows){
  const max=Math.max(1,...rows.map(r=>r.v));
  return rows.map(r=>`<div class="hb"><span class="hbl">${r.l}</span><div class="hbt"><i style="width:${(r.v/max*100).toFixed(1)}%"></i></div><span class="hbv">${r.t}</span></div>`).join("");
}
function statsBlock(){
  const tk=todayKey(),ws0=weekStart(tk),weeks=[];
  for(let w=7;w>=0;w--){const ws=addDays(ws0,-7*w);let m=0;for(let i=0;i<7;i++){const d=st.log[addDays(ws,i)];if(d&&d.wo&&d.wo!=="rest")m+=durOf(d)}
    weeks.push({v:m,lab:parseKey(ws).toLocaleDateString("ru-RU",{day:"numeric",month:"numeric"}),lab2:m>=60?Math.round(m/6)/10+"ч":m+"м",hi:w===0})}
  const by={},tod={morning:0,day:0,evening:0};let total=0,n=0,cnt={};
  for(const d of Object.values(st.log)){if(!d.wo||d.wo==="rest")continue;const du=durOf(d);by[d.wo]=(by[d.wo]||0)+du;cnt[d.wo]=(cnt[d.wo]||0)+1;
    if(du){total+=du;n++}const t=toMin(d.wot);if(t!=null){tod[t<720?"morning":t<1080?"day":"evening"]++}}
  if(!Object.keys(cnt).length)return "";
  const actRows=Object.keys(cnt).sort((a,b)=>(by[b]||0)-(by[a]||0)||cnt[b]-cnt[a]).slice(0,6).map(id=>({l:act(id).e+" "+esc(act(id).n),v:by[id]||cnt[id],t:by[id]?fmtDur(by[id]):cnt[id]+"×"}));
  const todRows=[{l:"🌅 Утро",v:tod.morning,t:tod.morning},{l:"☀️ День",v:tod.day,t:tod.day},{l:"🌙 Вечер",v:tod.evening,t:tod.evening}];
  return `<h2>Статистика</h2>
  <div class="statgrid"><div><b>${total?fmtDur(total):"0"}</b><span class="small muted">всего в тренировках</span></div><div><b>${n?fmtDur(total/n):"–"}</b><span class="small muted">в среднем за раз</span></div></div>
  <div class="chart"><p class="small" style="font-weight:700;margin-bottom:4px">Минуты по неделям</p>${barsSVG(weeks)}</div>
  <div class="chart"><p class="small" style="font-weight:700;margin-bottom:8px">По видам</p>${hbars(actRows)}</div>
  ${tod.morning+tod.day+tod.evening?`<div class="chart"><p class="small" style="font-weight:700;margin-bottom:8px">Когда ты тренируешься</p>${hbars(todRows)}</div>`:""}`;
}
function heatmap(){
  const tk=todayKey(),start=addDays(weekStart(tk),-7*11);let cells="";
  for(let w=0;w<12;w++)for(let i=0;i<7;i++){const k=addDays(start,w*7+i);const d=st.log[k]||{};
    const cls=k>tk?"fut":isFull(k)?"full":d.frz?"frz":Object.keys(d).length?"part":"";
    cells+=`<i class="${cls}" style="grid-column:${w+1};grid-row:${i+1}" title="${k}"></i>`}
  return `<div class="chart"><p class="small" style="font-weight:700;margin-bottom:8px">Последние 12 недель</p>
    <div class="heat">${cells}</div>
    <div class="heatleg small muted"><span><i class="full"></i>идеальный день</span><span><i class="part"></i>частично</span><span><i class="frz"></i>заморожен</span></div></div>`;
}

/* ---------- views ---------- */
function nudges(){
  const h=new Date().getHours(),k=todayKey(),d=st.log[k]||{},out=[];
  if(d.frz)return out;
  if(d.w==null&&h>=10)out.push("Весы скучают ⚖️ Ты ещё не взвесилась сегодня.");
  for(const m of MEALS)if(!d[m.k]&&h>=m.h)out.push(m.msg);
  if(h>=20&&!isFull(k)){const s=streakNow();if(s>0)out.push(`До полуночи закрой день, иначе стрик 🔥${s} сгорит.`)}
  return out;
}
function chartSVG(){
  const pts=Object.keys(st.log).filter(k=>st.log[k].w!=null).sort().slice(-60).map(k=>({k,w:st.log[k].w}));
  if(pts.length<2)return `<p class="muted small">График появится после второго взвешивания.</p>`;
  const W=320,H=140,px=8,py=14;
  const ws=pts.map(p=>p.w).concat([st.goal]);const lo=Math.min(...ws)-.5,hi=Math.max(...ws)+.5;
  const x=i=>px+i*(W-2*px)/(pts.length-1),y=w=>py+(hi-w)*(H-2*py)/(hi-lo);
  const line=pts.map((p,i)=>(i?"L":"M")+x(i).toFixed(1)+" "+y(p.w).toFixed(1)).join(" ");
  const last=pts[pts.length-1];
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="График веса">
    <line x1="${px}" x2="${W-px}" y1="${y(st.goal)}" y2="${y(st.goal)}" stroke="var(--ok)" stroke-dasharray="4 4" stroke-width="1.5"/>
    <text x="${W-px}" y="${y(st.goal)-4}" text-anchor="end" font-size="10" fill="var(--ok)" font-family="Manrope">цель ${fmt(st.goal)}</text>
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(pts.length-1)}" cy="${y(last.w)}" r="4.5" fill="var(--accent)"/>
  </svg>`;
}
function viewToday(){
  const k=todayKey(),d=st.log[k]||{},s=streakNow(),plan=planFor(k),T=act(plan),ph=photos[k]||{};
  const cw=currentWeight(),diff=cw-st.start;
  const meals=MEALS.map(m=>{const img=ph[m.k];return `
    <div class="meal ${d[m.k]?"done":""} ${img?"hasimg":""}">
      ${img?`<img src="${img}" alt="Фото: ${m.n}">`:`<span class="emo" aria-hidden="true">${m.e}</span>`}
      <button class="chk" data-act="meal" data-m="${m.k}" aria-label="${d[m.k]?"Снять отметку":"Отметить"}: ${m.n}">${d[m.k]?"✓":""}</button>
      <button class="lab" data-act="photo" data-m="${m.k}" style="all:unset;position:relative;z-index:1;font-weight:700;font-size:.9rem;cursor:pointer">${m.n}<br><span class="small" style="font-weight:500">${img?"заменить фото":"+ фото"}</span></button>
    </div>`}).join("");
  const nd=nudges();
  return `
  <div class="top">
    <div><p class="muted">${new Date().toLocaleDateString("ru-RU",{weekday:"long",day:"numeric",month:"long"})}</p><h1>Привет, ${esc(st.nick)}</h1></div>
    <div class="flame ${s?"":"cold"}"><b>🔥${s}</b><span>${s===1?"день":"дней"} подряд</span></div>
  </div>
  ${nd.length?`<div class="nudges">${nd.map(t=>`<div class="nudge">${esc(t)}</div>`).join("")}</div>`:""}
  ${freezeBlock()}
  ${summaryToday()}
  <div class="weigh">
    <div class="grow">${d.w!=null
      ?`<div class="num">${fmt(d.w)}<small>кг</small></div><p class="small muted">${diff<=0?"−"+fmt(-diff):"+"+fmt(diff)} кг от старта</p>`
      :`<p style="font-weight:700">Утреннее взвешивание</p><p class="small muted">Натощак, до завтрака</p>`}</div>
    <input id="w" inputmode="decimal" placeholder="${fmt(cw)}" aria-label="Вес в кг" value="${d.w!=null?fmt(d.w):""}">
    <button class="btn" data-act="weigh">${d.w!=null?"Обновить":"Сохранить"}</button>
  </div>
  <h2>Еда сегодня</h2>
  <div class="meals">${meals}</div>
  <p class="small muted mealhint">Нажми на название, чтобы добавить фото. Фото видишь только ты.</p>
  ${snackBlock(k,d,ph)}
  ${st.water.on?waterBlock(d):""}
  <h2>Тренировка</h2>
  ${workoutBlock(k,d,plan,T,ph)}
  <h2>Путь к цели</h2>
  <div class="prow"><b>${pctGoal()}%</b><span class="muted small">${fmt(st.start)} → ${fmt(st.goal)} кг до ${parseKey(st.deadline).toLocaleDateString("ru-RU",{day:"numeric",month:"long"})}</span></div>
  <div class="bar"><i style="width:${pctGoal()}%"></i></div>
  <div class="chart">${chartSVG()}</div>`;
}
function catalogHTML(){
  const mine=new Set(st.activities);
  return CATALOG.map(g=>`<h3 class="cg">${g.g}</h3><div class="chips">${
    g.items.map(([id,e,n])=>`<button class="chip ${mine.has(id)?"on":""}" data-act="acttoggle" data-a="${id}" aria-pressed="${mine.has(id)}">${e} ${n}</button>`).join("")}</div>`).join("")+
  `<h3 class="cg">Своя активность</h3>
  <div class="customrow"><input id="c-emo" maxlength="8" placeholder="⭐" aria-label="Эмодзи"><input id="c-name" maxlength="24" placeholder="Например, скалолазание" aria-label="Название"><button class="btn" data-act="actadd">Добавить</button></div>`;
}
function viewGym(){
  const tk=todayKey(),tdow=parseKey(tk).getDay(),s=stats(),mine=st.activities;
  const start=addDays(tk,-((tdow+6)%7));
  const week=[0,1,2,3,4,5,6].map(i=>{const k=addDays(start,i),p=planFor(k),d=st.log[k]||{};
    const mark=d.frz?"❄️":d.wo?"✅":p==="rest"?"😴":k<tk?"✖️":act(p).e;
    const tm=d.wot||(p!=="rest"?st.planTime[parseKey(k).getDay()]:"")||"";return `<div><span class="muted">${DOW[parseKey(k).getDay()]}</span><b>${mark}</b><small class="muted">${esc(tm)}</small></div>`}).join("");
  const opts=[...mine,"rest"];
  const rows=WEEK_ORDER.map(w=>`<div class="prow2 ${w===tdow?"today":""}"><span class="dn">${DOW[w]}</span>${st.plan[w]==="rest"?`<span class="small muted">отдых</span>`:`<input type="time" class="ptime" data-ptime="${w}" value="${esc(st.planTime[w]||"")}" aria-label="Время тренировки, ${DOW[w]}">`}<div class="chips">${
    opts.map(id=>{const a=act(id),on=st.plan[w]===id;return `<button class="chip ${on?"on":""}" data-act="plan" data-d="${w}" data-t="${esc(id)}" aria-pressed="${on}">${a.e} ${esc(a.n)}</button>`}).join("")}</div></div>`).join("");
  const countIds=[...new Set([...mine,...Object.keys(s.by)])];
  const counts=countIds.map(id=>`<div><b>${s.by[id]||0}</b>${act(id).e} ${esc(act(id).n)}</div>`).join("");
  return `<h1>Тренировки</h1>
  <h2>Эта неделя</h2><div class="week">${week}</div>
  <h2>Мои активности</h2>
  <p class="small muted" style="margin:-4px 0 12px">Выбери, чем ты занимаешься: зал, бег, танцы, боулдеринг или что-то своё.</p>
  <div class="chips">${mine.map(id=>`<span class="chip on">${act(id).e} ${esc(act(id).n)}<button class="x" data-act="actdel" data-a="${esc(id)}" aria-label="Убрать ${esc(act(id).n)}">×</button></span>`).join("")||`<span class="small muted">Пока ничего не выбрано</span>`}</div>
  <button class="btn ghost" style="margin-top:12px" data-act="catalog">${showCatalog?"Готово":"+ Добавить активность"}</button>
  ${showCatalog?catalogHTML():""}
  <h2>Мой план на неделю</h2><p class="small muted" style="margin:-4px 0 12px">Выбери активность и время для каждого дня. В дни отдыха тренировка не нужна для стрика.</p>
  <div class="plan">${rows}</div>
  ${counts?`<h2>Всего тренировок</h2><div class="counts">${counts}</div>`:""}
  ${statsBlock()}
  ${(()=>{const ws=weekStart(addDays(start,-1));return Object.keys(st.log).some(x=>x>=ws&&x<start)?summaryHTML(weekSummary(ws),"Итоги прошлой недели",false):""})()}`;
}
function trophyRow(t,s){
  const [v,goal]=t.p(s),got=!!(st.unlocked||{})[t.id],pr=(st.prizes||{})[t.id]||"";
  const pct=Math.min(100,Math.round(v/goal*100));
  return `<div class="troph ${got?"":"locked"}" style="--tc:${TIERS[t.t].c}">
    <div class="medal" aria-hidden="true">${t.e}</div>
    <div class="grow"><h3>${esc(t.n)}</h3><p class="small muted">${esc(t.d)}${got?", получен":`, ${Math.min(v,goal)}/${goal}${t.id.startsWith("q")?"%":""}`}</p>
      ${got?"":`<div class="bar"><i style="width:${pct}%"></i></div>`}
      <div class="prize">${got&&pr?`<span class="got">🎁 ${esc(pr)}</span>`:`<input data-prize="${t.id}" placeholder="🎁 Приз за этот трофей" value="${esc(pr)}" aria-label="Приз за трофей ${esc(t.n)}">`}</div>
    </div></div>`;
}
function viewTrophies(){
  const s=stats(),got=unlockedCount(),plat=TROPHIES.find(t=>t.t==="plat");
  const platGot=!!(st.unlocked||{}).plat,pr=(st.prizes||{}).plat||"";
  let html=`<h1>Трофеи</h1>
  <div class="summary"><div><b>${got}/${TROPHIES.length}</b><span class="small muted">получено</span></div><div><b>🔥${s.best}</b><span class="small muted">лучший стрик</span></div><div><b>${s.full}</b><span class="small muted">идеальных дней</span></div></div>
  ${heatmap()}
  <div class="platcard"><div style="display:flex;gap:16px;align-items:center">
    <div class="medal" style="--tc:var(--plat);${platGot?"":"filter:grayscale(.6);opacity:.7"}">${plat.e}</div>
    <div><h3 style="font-family:var(--display);font-size:1.15rem">Платина</h3><p class="small">${platGot?"Цель достигнута! 🎉":"Доберись до цели: "+fmt(st.goal)+" кг. Сейчас "+s.pct+"%"}</p></div></div>
    <div class="prize" style="margin-top:14px">${platGot&&pr?`<span class="got" style="color:#1C1A2B">🎁 ${esc(pr)}</span>`:`<input data-prize="plat" placeholder="🎁 Главный приз, например заказ с ASOS" value="${esc(pr)}" aria-label="Главный приз">`}</div>
  </div>`;
  for(const tier of ["gold","silver","bronze"]){
    html+=`<div class="tier"><span class="dot" style="background:${TIERS[tier].c}"></span><h2>${TIERS[tier].n}</h2></div>`;
    html+=TROPHIES.filter(t=>t.t===tier).map(t=>trophyRow(t,s)).join("");
  }
  return html;
}
function viewTogether(){
  if(!st.group)return `<h1>Вместе</h1>
    <p class="muted" style="margin:6px 0 18px">Создай группу и отправь код маме. Вы увидите стрики, трофеи и процент к цели друг друга. Килограммы и фото остаются личными.</p>
    <button class="btn block" data-act="newgroup">Создать группу</button>
    <h2>Или вступи по коду</h2>
    <div class="grouprow"><input id="g-code" maxlength="12" placeholder="Код группы" aria-label="Код группы"><button class="btn" data-act="join">Вступить</button></div>`;
  const tk=todayKey();
  const list=[...board].sort((a,b)=>(b.streak||0)-(a.streak||0));
  const people=list.map(p=>{const me=p.id===uid,today=p.day===tk;
    return `<div class="person"><div class="hd"><h3>${esc(p.nick||"Без имени")}${me?'<span class="you">ты</span>':""}</h3>
      <div class="stats"><span>🔥${p.streak||0}</span><span>🏆${p.trophies||0}</span></div></div>
      <div class="prow" style="margin-bottom:6px"><span class="small muted">Путь к цели</span><b style="font-size:1rem">${p.pct||0}%</b></div>
      <div class="bar"><i style="width:${p.pct||0}%"></i></div>
      ${p.wmin?`<p class="small muted" style="margin-top:8px">⏱ ${fmtDur(p.wmin)} тренировок на этой неделе</p>`:""}
      <div class="today">${today&&p.frz?`<span>❄️ День заморожен: ${esc(reasonLabel(p.frz))}</span>`:today?`<span>${p.w?"✅":"⬜"} вес</span><span>${p.m||0}/3 еда</span><span>${p.rest?"😴 отдых":p.wo?"✅ тренировка":"⬜ тренировка"}</span>`:"<span>Сегодня ещё не заходила</span>"}</div>
      ${(()=>{const rec=received(p.id);return rec.length?`<p class="recv">${rec.map(r=>`${r.e} ${esc(r.nick)}`).join(", ")}</p>`:""})()}
      ${me?"":`<div class="reacts">${REACTS.map(e=>{const on=(st.sent||{})[p.id]&&st.sent[p.id].day===tk&&st.sent[p.id].e===e;return `<button class="rbtn ${on?"on":""}" data-act="react" data-to="${esc(p.id)}" data-e="${e}" aria-pressed="${on}" aria-label="Реакция ${e} для ${esc(p.nick||"")}">${e}</button>`}).join("")}</div>`}
    </div>`}).join("");
  return `<h1>Вместе</h1>
  <p class="muted" style="margin:6px 0 4px">Код группы</p>
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px"><span class="code">${esc(st.group)}</span><button class="btn ghost" data-act="copycode">Скопировать</button></div>
  ${people||`<p class="notice">Загружаем…</p>`}
  ${list.length<2?`<p class="notice">Отправь маме код. Она установит приложение, создаст свой аккаунт и введёт код во вкладке «Вместе».</p>`:""}
  <button class="linkbtn" style="margin-top:16px" data-act="leave">Выйти из группы</button>`;
}
function goalForm(isNew){
  const dl=st.deadline||addDays(todayKey(),30);
  return `
  <label for="f-nick">Как тебя называть</label><input id="f-nick" maxlength="30" value="${esc(st.nick)}" placeholder="Катя">
  <div class="row2">
    <div><label for="f-start">${isNew?"Вес сейчас, кг":"Стартовый вес, кг"}</label><input id="f-start" inputmode="decimal" value="${st.start!=null?fmt(st.start):""}" placeholder="70"></div>
    <div><label for="f-goal">Цель, кг</label><input id="f-goal" inputmode="decimal" value="${st.goal!=null?fmt(st.goal):""}" placeholder="65"></div>
  </div>
  <label for="f-dl">К какой дате</label><input id="f-dl" type="date" value="${dl}" min="${addDays(todayKey(),1)}">
  <p class="small muted" id="pace" style="margin-top:10px">${esc(paceText(st.start,st.goal,dl))}</p>
  <button class="btn block" style="margin-top:18px" data-act="savegoal">${isNew?"Начать":"Сохранить цель"}</button>`;
}
function viewGoal(){
  const hours=[6,7,8,9,10,11,12].map(h=>`<option value="${h}" ${st.remind.weigh===h?"selected":""}>${pad(h)}:00</option>`).join("");
  return `<h1>Моя цель</h1>${goalForm(false)}
  <h2>Напоминания</h2>
  <p class="small muted">${esc(notifStatus())}</p>
  <label for="r-hour">Напомнить взвеситься, если не сделала к</label><select id="r-hour">${hours}</select>
  <label class="check"><input type="checkbox" id="r-meals" ${st.remind.meals?"checked":""}> Напоминать про пропущенную еду и стрик</label>
  ${window.Notification?.permission==="granted"&&st.remind.on
    ?`<button class="btn ghost" style="margin-top:14px" data-act="notifoff">Выключить уведомления</button>`
    :`<button class="btn block" style="margin-top:14px" data-act="notif">Включить уведомления 🔔</button>`}
  <h2>Вода</h2>
  <label class="check"><input type="checkbox" id="w-on" ${st.water.on?"checked":""}> Считать воду на вкладке «Сегодня»</label>
  ${st.water.on?`<label for="w-goal">Цель на день</label><select id="w-goal">${[4,5,6,7,8,9,10,12].map(n=>`<option value="${n}" ${st.water.goal===n?"selected":""}>${n} стаканов (${n*250} мл)</option>`).join("")}</select>`:""}
  <p class="small muted" style="margin-top:6px">Необязательно и не влияет на стрик.</p>
  <h2>Начать заново</h2><p class="small muted" style="margin-bottom:10px">Сотрёт записи, стрик и трофеи. Призы и план тренировок останутся.</p>
  <button class="btn ghost" data-act="reset">Сбросить прогресс</button>
  <h2>Аккаунт</h2><p class="small muted" style="margin-bottom:10px">${esc(auth.currentUser?.email||"")}</p>
  <button class="btn ghost" data-act="logout">Выйти</button>`;
}
function viewOnboard(){
  return `<h1 style="font-size:1.9rem;margin-top:12px">Мой стрик 🔥</h1>
  <p class="muted" style="margin:8px 0 6px">Взвешивайся по утрам, отмечай еду и тренировки, собирай трофеи и забирай призы. Цель ставишь сама.</p>
  ${goalForm(true)}`;
}
function viewLogin(){
  const signup=authMode==="signup";
  return `<h1 style="font-size:1.9rem;margin-top:24px">Мой стрик 🔥</h1>
  <p class="muted" style="margin:8px 0 6px">${signup?"Создай аккаунт, чтобы данные хранились в облаке и были на любом устройстве.":"Войди, чтобы продолжить свой стрик."}</p>
  <div class="login">
    <label for="l-email">Почта</label><input id="l-email" type="email" autocomplete="email">
    <label for="l-pass">Пароль</label><input id="l-pass" type="password" autocomplete="${signup?"new-password":"current-password"}" placeholder="${signup?"Минимум 6 символов":""}">
    <button class="btn block" style="margin-top:18px" data-act="${signup?"signup":"login"}">${signup?"Создать аккаунт":"Войти"}</button>
    <div class="links">
      <button class="linkbtn" data-act="mode">${signup?"У меня уже есть аккаунт":"Создать аккаунт"}</button>
      ${signup?"":`<button class="linkbtn" data-act="forgot">Забыла пароль</button>`}
    </div>
  </div>`;
}

/* ---------- render ---------- */
const NAV=[["today","📅","Сегодня"],["gym","🏋️‍♀️","Зал"],["trophies","🏆","Трофеи"],["together","👯‍♀️","Вместе"],["goal","🎯","Цель"]];
function render(){
  const app=$("#app"),nav=$("#nav");
  if(!uid){app.innerHTML=viewLogin();nav.classList.add("hidden");return}
  if(!st)return;
  if(st.goal==null){app.innerHTML=viewOnboard();nav.classList.add("hidden");return}
  nav.classList.remove("hidden");
  nav.querySelector(".in").innerHTML=NAV.map(([id,e,n])=>`<button class="${tab===id?"on":""}" data-tab="${id}" aria-current="${tab===id?"page":"false"}"><span aria-hidden="true">${e}</span>${n}</button>`).join("");
  const v={today:viewToday,gym:viewGym,trophies:viewTrophies,together:viewTogether,goal:viewGoal}[tab];
  app.innerHTML=v();
}

/* ---------- auth ---------- */
const AUTH_ERR={"auth/invalid-credential":"Неверная почта или пароль","auth/wrong-password":"Неверная почта или пароль","auth/user-not-found":"Неверная почта или пароль",
  "auth/email-already-in-use":"Такой аккаунт уже есть, просто войди","auth/weak-password":"Пароль минимум 6 символов","auth/invalid-email":"Проверь адрес почты",
  "auth/too-many-requests":"Слишком много попыток, подожди немного","auth/network-request-failed":"Нет интернета"};
const authErr=e=>toastText(AUTH_ERR[e.code]||"Ошибка входа",e.code||"");
function creds(){return [$("#l-email").value.trim(),$("#l-pass").value]}

onAuthStateChanged(auth,async u=>{
  if(unsubGroup){unsubGroup();unsubGroup=null}
  if(!u){uid=null;st=null;photos={};board=[];render();return}
  uid=u.uid;$("#app").innerHTML=`<p class="muted">Загрузка…</p>`;
  let loaded=null;
  try{const s=await getDoc(doc(fs,"users",uid));loaded=s.exists()?s.data():null}catch(e){console.warn(e)}
  st=Object.assign({v:1,nick:"",start:null,goal:null,deadline:null,startDate:null,plan:{...DEF_PLAN},prizes:{},log:{},unlocked:{},group:null},loaded||{});
  st.remind=Object.assign({weigh:9,meals:true,on:false},st.remind||{});
  st.custom=st.custom||[];st.planTime=st.planTime||{};st.water=Object.assign({on:false,goal:8},st.water||{});
  if(!Array.isArray(st.activities)){const fromPlan=[...new Set(Object.values(st.plan).filter(x=>x!=="rest"))];st.activities=fromPlan.length?fromPlan:["leg","arm","cardio"]}
  const tz=Intl.DateTimeFormat().resolvedOptions().timeZone;
  if(st.tz!==tz){st.tz=tz;if(loaded)save()}
  try{const p=await getDoc(doc(fs,"users",uid,"photos",todayKey()));photos[todayKey()]=p.exists()?p.data():{}}catch(e){}
  if(st.goal!=null)checkTrophies(true);
  tab="today";render();
  if(st.group){subscribeGroup();pushBoard(true)}
  if(st.remind.on&&"Notification" in window&&Notification.permission==="granted")registerToken().catch(console.warn);
});

/* ---------- events ---------- */
function removeActivity(id){
  st.activities=st.activities.filter(x=>x!==id);
  for(const w of Object.keys(st.plan))if(st.plan[w]===id)st.plan[w]="rest";
}
document.addEventListener("click",async e=>{
  const tb=e.target.closest("[data-tab]");if(tb){tab=tb.dataset.tab;render();window.scrollTo(0,0);return}
  const a=e.target.closest("[data-act]");if(!a)return;
  const action=a.dataset.act,k=todayKey();
  if(action==="login"){const [em,pw]=creds();signInWithEmailAndPassword(auth,em,pw).catch(authErr)}
  else if(action==="signup"){const [em,pw]=creds();createUserWithEmailAndPassword(auth,em,pw).catch(authErr)}
  else if(action==="mode"){authMode=authMode==="login"?"signup":"login";render()}
  else if(action==="forgot"){const em=$("#l-email").value.trim();if(!em){toastText("Впиши почту","И нажми ещё раз");return}
    sendPasswordResetEmail(auth,em).then(()=>toastText("Письмо отправлено","Проверь почту, включая спам")).catch(authErr)}
  else if(action==="logout"){await signOut(auth)}
  else if(action==="weigh"){
    const w=num($("#w").value);if(w==null||w<20||w>400){toastText("Проверь вес","Введи число в килограммах");return}
    day(k).w=w;checkTrophies();save();render();
  }else if(action==="meal"){
    const d=day(k),m=a.dataset.m;d[m]=!d[m];checkTrophies();save();render();
  }else if(action==="photo"){
    pendingPhoto={kind:"meal",key:a.dataset.m};$("#photo").click();
  }else if(action==="wophoto"){pendingPhoto={kind:"wo"};$("#photo").click();
  }else if(action==="wostart"){
    const d=day(k);d.run={a:a.dataset.a,s:nowHM(),ts:Date.now()};picker=false;pickSel=null;save();render();
  }else if(action==="wofinish"){
    const d=day(k);if(!d.run)return;d.wo=d.run.a;d.wot=d.run.s;d.woe=nowHM();delete d.run;
    checkTrophies();save();render();toastText("Тренировка закончена 💪",fmtDur(durOf(d))+", можно сфоткать, где ты была");
  }else if(action==="wocancel"){if(!confirm("Отменить тренировку?"))return;delete day(k).run;save();render();
  }else if(action==="womanual"){
    const d=day(k),pt=st.planTime[parseKey(k).getDay()],now=toMin(nowHM());
    d.wo=a.dataset.a;d.woe=nowHM();d.wot=pt&&toMin(pt)<now?pt:fromMin(now-60);
    picker=false;pickSel=null;checkTrophies();save();render();
  }else if(action==="pickact"){pickSel=a.dataset.a;render();
  }else if(action==="snadd"){snackMenu=!snackMenu;snackSel=null;render();
  }else if(action==="snnew"){
    const [e,n]=SNACKS[+a.dataset.i],d=day(k);d.sn=d.sn||[];if(d.sn.length>=8)return;
    const id="s"+Date.now().toString(36);d.sn.push({id,e,n,t:nowHM()});snackMenu=false;snackSel=id;save();render();
  }else if(action==="snsel"){snackSel=snackSel===a.dataset.id?null:a.dataset.id;snackMenu=false;render();
  }else if(action==="snphoto"){pendingPhoto={kind:"snack",key:a.dataset.id};$("#photo").click();
  }else if(action==="sndel"){
    const d=day(k),id=a.dataset.id;d.sn=(d.sn||[]).filter(x=>x.id!==id);
    if(photos[k]&&photos[k][id]){delete photos[k][id];savePhotos(k)}
    snackSel=null;save();render();
  }else if(action==="water"){
    const d=day(k);d.wa=Math.max(0,(d.wa||0)+Number(a.dataset.d));save();render();
  }else if(action==="wo"){
    const d=day(k);if(!d.wo)return;if(!confirm("Снять отметку о тренировке?"))return;delete d.wo;delete d.wot;delete d.woe;checkTrophies();save();render();
  }else if(action==="frzopen"){freezeFor=a.dataset.k;freezeReason=null;render();
  }else if(action==="frzreason"){const note=$("#frz-note")?.value||"";freezeReason=a.dataset.r;render();const n=$("#frz-note");if(n)n.value=note;
  }else if(action==="frzcancel"){freezeFor=null;freezeReason=null;render();
  }else if(action==="frzdo"){
    if(!freezeFor||!freezeReason)return;
    if(!canFreeze(freezeFor)){toastText("Не получится","Заморозка на этой неделе уже использована");freezeFor=null;render();return}
    const note=($("#frz-note")?.value||"").trim().slice(0,80);
    day(freezeFor).frz=note?{r:freezeReason,note}:{r:freezeReason};
    freezeFor=null;freezeReason=null;save();render();toastText("День заморожен ❄️","Стрик в безопасности");
  }else if(action==="unfreeze"){delete day(a.dataset.k).frz;save();render();
  }else if(action==="sumhide"){st.sumHidden=a.dataset.ws;save();render();
  }else if(action==="react"){
    st.sent=st.sent||{};const to=a.dataset.to,e=a.dataset.e,cur=st.sent[to];
    if(cur&&cur.day===k&&cur.e===e)delete st.sent[to];else st.sent[to]={day:k,e};
    for(const [id,v] of Object.entries(st.sent))if(v.day!==k)delete st.sent[id];
    save();pushBoard();render();
  }else if(action==="picker"){picker=!picker;pickSel=null;render();

  }else if(action==="catalog"){showCatalog=!showCatalog;render();
  }else if(action==="acttoggle"){
    const id=a.dataset.a;
    if(st.activities.includes(id))removeActivity(id);else st.activities.push(id);
    save();render();
  }else if(action==="actdel"){removeActivity(a.dataset.a);save();render();
  }else if(action==="actadd"){
    const n=$("#c-name").value.trim().slice(0,24),e=$("#c-emo").value.trim()||"⭐";
    if(!n){toastText("Впиши название","Например, скалолазание");return}
    const id="c_"+Date.now().toString(36);
    st.custom.push({id,e,n});st.activities.push(id);save();render();toastText("Добавлено",e+" "+n);
  }else if(action==="plan"){
    st.plan[a.dataset.d]=a.dataset.t;save();render();
  }else if(action==="savegoal"){
    const nick=$("#f-nick").value.trim(),start=num($("#f-start").value),goal=num($("#f-goal").value),dl=$("#f-dl").value;
    if(!nick||start==null||goal==null||!dl){toastText("Заполни все поля","Имя, вес, цель и дата");return}
    if(start===goal){toastText("Цель совпадает с весом","Поставь другую цифру");return}
    const isNew=st.goal==null;
    Object.assign(st,{nick,start,goal,deadline:dl});
    if(isNew){st.startDate=k;day(k).w=start}
    checkTrophies(isNew);save();
    if(isNew){tab="today";render();toastText("Поехали! 🔥","Первый трофей уже твой")}
    else{render();toastText("Цель сохранена","")}
  }else if(action==="reset"){
    if(!confirm("Точно сбросить весь прогресс?"))return;
    st.log={};st.unlocked={};st.startDate=k;photos={};save();render();
  }else if(action==="newgroup"){joinGroup(newCode())}
  else if(action==="join"){joinGroup($("#g-code").value)}
  else if(action==="leave"){if(confirm("Выйти из группы?"))leaveGroup()}
  else if(action==="copycode"){navigator.clipboard?.writeText(st.group).then(()=>toastText("Код скопирован",st.group)).catch(()=>{})}
  else if(action==="notif"){enableNotifications()}
  else if(action==="notifoff"){st.remind.on=false;save();render();toastText("Уведомления выключены","")}
});
document.addEventListener("change",e=>{
  const p=e.target.dataset&&e.target.dataset.prize;
  if(p){st.prizes=st.prizes||{};const v=e.target.value.trim().slice(0,80);if(v)st.prizes[p]=v;else delete st.prizes[p];save();return}
  if(e.target.dataset&&e.target.dataset.ptime!=null){const w=e.target.dataset.ptime;if(e.target.value)st.planTime[w]=e.target.value;else delete st.planTime[w];save();return}
  if(e.target.id==="wot"||e.target.id==="woe"){const d=day(todayKey()),f=e.target.id;if(e.target.value)d[f]=e.target.value;else delete d[f];checkTrophies();save();render();return}
  if(e.target.id==="w-on"){st.water.on=e.target.checked;save();render();return}
  if(e.target.id==="w-goal"){st.water.goal=Number(e.target.value);save();return}
  if(e.target.id==="r-hour"){st.remind.weigh=Number(e.target.value);save()}
  if(e.target.id==="r-meals"){st.remind.meals=e.target.checked;save()}
});
document.addEventListener("input",e=>{
  if(["f-start","f-goal","f-dl"].includes(e.target.id)){
    const el=$("#pace");if(el)el.textContent=paceText(num($("#f-start").value),num($("#f-goal").value),$("#f-dl").value);
  }
});
document.addEventListener("keydown",e=>{
  if(e.key!=="Enter")return;
  if(e.target.id==="w")$('[data-act="weigh"]').click();
  if(e.target.id==="l-pass")$('[data-act="login"],[data-act="signup"]').click();
});
setInterval(()=>{if(st&&tab==="today"&&(st.log[todayKey()]||{}).run&&document.visibilityState==="visible"&&!document.activeElement.matches("input"))render()},30000);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&st&&st.goal!=null&&!document.activeElement.matches("input"))render()});
