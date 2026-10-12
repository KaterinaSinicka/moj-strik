Мой стрик 🔥

A weight, food and workout tracker with streaks, trophies and shared progress. Everything runs for free: GitHub Pages (hosting), Firebase on the Spark plan (accounts, database, push), GitHub Actions (reminders).

Note: the app interface is in Russian.

How it works:

index.html, app.js, styles.css are the app itself.
sw.js runs in the background: offline cache and notifications.
firestore.rules are the access rules: personal data is visible only to its owner, shared progress only to group members.
reminders/send.mjs + .github/workflows/reminders.yml check every hour who missed what and send a push.
1. Firebase (≈15 minutes)
Go to console.firebase.google.com → Add project → name it moj-strik, Google Analytics can be turned off.
Authentication → Get started → Sign-in method → Email/Password → enable → Save.
Firestore Database → Create database → a location in Europe (e.g. eur3) → Start in production mode. Then open the Rules tab → paste the contents of firestore.rules → Publish.
⚙️ Project settings → General → Your apps → </> icon (Web) → any name, Hosting is not needed. Copy the values from firebaseConfig into firebase-config.js in place of ВСТАВЬ_СЮДА.
⚙️ Project settings → Cloud Messaging → Web Push certificates → Generate key pair. Copy the key into VAPID_KEY in the same file.
⚙️ Project settings → Service accounts → Generate new private key → a JSON file is downloaded. ⚠️ This is a secret key: never put it in the repository, you only need it in step 2.4.
2. GitHub (≈10 minutes)
Create a public repository moj-strik and upload all files from this folder, including the hidden .github folder (on the website: Add file → Upload files, drag in the folder contents; or use git push).
Settings → Pages → Source: Deploy from a branch → main / (root) → Save. After a minute the app will be live at https://YOUR_USERNAME.github.io/moj-strik/.
In Firebase: Authentication → Settings → Authorized domains → Add domain → YOUR_USERNAME.github.io.
In the repository: Settings → Secrets and variables → Actions:
Secrets tab → New repository secret: name FIREBASE_SERVICE_ACCOUNT, value = the entire contents of the JSON from step 1.6;
Variables tab → New repository variable: name APP_URL, value https://YOUR_USERNAME.github.io/moj-strik/ (with the trailing slash).
Actions tab → enable workflows if asked → Reminders → Run workflow. A green check mark means everything is connected.
3. Installing on a phone
Android (Chrome): open the link → ⋮ → Install app.
iPhone (Safari, iOS 16.4+): open the link → Share → Add to Home Screen → open the app from the icon. Push notifications on iPhone only work this way.

Then: create an account → set your goal → Цель (Goal) tab → Включить уведомления 🔔 (Turn on notifications).

When reminders arrive

Local time, nothing is sent at night (23:00 to 6:00), and each reminder is sent at most once a day:

weight not logged by the chosen hour (9:00 by default);
breakfast not checked by 11:00, lunch by 16:00, dinner by 21:00;
at 20:00, if the streak is at risk.
Good to know
GitHub may run the cron job 10–20 minutes late, that's normal.
If nothing changes in the repository for 60 days, GitHub disables the schedule and sends an email. To turn it back on: Actions → Reminders → Enable.
firebase-config.js is safe to keep in a public repository: data is protected by the Firestore rules, not by this key. The only secret is the service account JSON.
Photos are stored compressed directly in Firestore, so Firebase Storage (which requires a paid plan) is not needed.
