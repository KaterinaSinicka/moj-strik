// Запускается GitHub Actions раз в час: проверяет, кто что пропустил, и шлёт push.
import admin from "firebase-admin";

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const APP_URL = process.env.APP_URL || "";

const MEALS = [
  { k: "b", h: 11, body: "Завтрак сам себя не съест 🍳" },
  { k: "l", h: 16, body: "Обед ждёт тебя, а ты его игноришь 🥗" },
  { k: "d", h: 21, body: "Ужин тоже считается, не забудь отметить 🍲" }
];
const BAD_TOKEN = ["messaging/registration-token-not-registered", "messaging/invalid-registration-token", "messaging/invalid-argument"];

function localNow(tz) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(new Date()).map(x => [x.type, x.value]));
  return { key: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
const toUTC = k => { const [y, m, d] = k.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const addDays = (k, n) => { const d = toUTC(k); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const planFor = (st, k) => (st.plan || {})[toUTC(k).getUTCDay()] || "rest";
const isFull = (st, k) => { const d = (st.log || {})[k]; return !!d && d.w != null && d.b && d.l && d.d && (planFor(st, k) === "rest" || !!d.wo); };
function streak(st, today) { let k = isFull(st, today) ? today : addDays(today, -1), n = 0; while (isFull(st, k)) { n++; k = addDays(k, -1); } return n; }

async function main() {
  const users = await db.collection("users").get();
  let sentCount = 0;
  for (const u of users.docs) {
    const st = u.data();
    const r = Object.assign({ weigh: 9, meals: true, on: false }, st.remind || {});
    if (st.goal == null || !r.on) continue;
    const tokRef = db.doc(`tokens/${u.id}`);
    const tokens = ((await tokRef.get()).data() || {}).tokens || [];
    if (!tokens.length) continue;

    const { key, hour } = localNow(st.tz || "Europe/Riga");
    if (hour < 6 || hour > 22) continue; // ночью не беспокоим
    const d = (st.log || {})[key] || {};
    const due = [];
    if (hour >= r.weigh && d.w == null) due.push({ id: "w", title: "Весы скучают ⚖️", body: "Ты ещё не взвесилась сегодня." });
    if (r.meals) {
      for (const m of MEALS) if (hour >= m.h && !d[m.k]) due.push({ id: m.k, title: "Мой стрик 🔥", body: m.body });
      const s = streak(st, key);
      if (hour >= 20 && s > 0 && !isFull(st, key)) due.push({ id: "s", title: `Стрик 🔥${s} в опасности`, body: "До полуночи закрой день, иначе он сгорит." });
    }

    const remRef = db.doc(`reminders/${u.id}`);
    const rem = (await remRef.get()).data() || {};
    const already = rem.day === key ? rem.keys || [] : [];
    const fresh = due.filter(x => !already.includes(x.id));
    if (!fresh.length) continue;

    const title = fresh.length === 1 ? fresh[0].title : "Мой стрик 🔥";
    const body = fresh.map(x => x.body).join(" ");
    const message = { tokens, notification: { title, body } };
    if (APP_URL) message.webpush = { notification: { icon: APP_URL + "icons/icon-192.png" }, fcmOptions: { link: APP_URL } };

    const res = await admin.messaging().sendEachForMulticast(message);
    const bad = tokens.filter((t, i) => !res.responses[i].success && BAD_TOKEN.includes(res.responses[i].error?.code));
    if (bad.length) await tokRef.update({ tokens: admin.firestore.FieldValue.arrayRemove(...bad) });
    await remRef.set({ day: key, keys: [...already, ...fresh.map(x => x.id)] });
    sentCount += res.successCount;
    console.log(`${u.id.slice(0, 6)}…: ${fresh.map(x => x.id).join(",")} → ok ${res.successCount}, fail ${res.failureCount}`);
  }
  console.log(`Готово, отправлено: ${sentCount}`);
}
main().catch(e => { console.error(e); process.exit(1); });
