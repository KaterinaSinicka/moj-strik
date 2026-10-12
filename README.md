# Мой стрик 🔥

Трекер веса, еды и тренировок со стриками, трофеями и общим прогрессом.
Всё бесплатно: GitHub Pages (хостинг), Firebase на плане Spark (аккаунты, база, push), GitHub Actions (напоминания).

Как это устроено:
- **index.html, app.js, styles.css** это само приложение.
- **sw.js** работает в фоне: кэш для офлайна и показ уведомлений.
- **firestore.rules** правила доступа: личные данные видит только владелец, общий прогресс видят только участники группы.
- **reminders/send.mjs** + **.github/workflows/reminders.yml** раз в час проверяют, кто что пропустил, и шлют push.

## 1. Firebase (≈15 минут)

1. Зайди на console.firebase.google.com → **Add project** → название `moj-strik`, Google Analytics можно выключить.
2. **Build → Authentication → Get started → Sign-in method → Email/Password** → включить → Save.
3. **Build → Firestore Database → Create database** → локация в Европе (например `eur3`) → **Start in production mode**.
   Потом вкладка **Rules** → вставь содержимое `firestore.rules` → **Publish**.
4. ⚙️ **Project settings → General → Your apps → значок `</>`** (Web) → название любое, Hosting не нужен.
   Скопируй объект `firebaseConfig` в `firebase-config.js` вместо `ВСТАВЬ_СЮДА`.
5. ⚙️ **Project settings → Cloud Messaging → Web Push certificates → Generate key pair**.
   Скопируй ключ в `VAPID_KEY` в том же файле.
6. ⚙️ **Project settings → Service accounts → Generate new private key** → скачается JSON.
   ⚠️ Это секретный ключ: не клади его в репозиторий, он понадобится только в шаге 2.4.

## 2. GitHub (≈10 минут)

1. Создай **публичный** репозиторий `moj-strik` и загрузи туда все файлы из этой папки,
   включая скрытую папку `.github` (через сайт: Add file → Upload files, перетащи всю папку целиком; или через `git push`).
2. **Settings → Pages → Source: Deploy from a branch → main / (root)** → Save.
   Через минуту приложение будет по адресу `https://ТВОЙ_НИК.github.io/moj-strik/`.
3. В Firebase: **Authentication → Settings → Authorized domains → Add domain** → `ТВОЙ_НИК.github.io`.
4. В репозитории: **Settings → Secrets and variables → Actions**:
   - вкладка **Secrets → New repository secret**: имя `FIREBASE_SERVICE_ACCOUNT`, значение = всё содержимое JSON из шага 1.6;
   - вкладка **Variables → New repository variable**: имя `APP_URL`, значение `https://ТВОЙ_НИК.github.io/moj-strik/` (со слешем в конце).
5. Вкладка **Actions** → если просит, включи workflows → **Reminders → Run workflow**.
   Зелёная галочка значит, что всё подключено.

## 3. Установка на телефон

- **Android (Chrome):** открой ссылку → ⋮ → **Установить приложение**.
- **iPhone (Safari, iOS 16.4+):** открой ссылку → **Поделиться → На экран Домой** → открой приложение с иконки.
  Push на iPhone работают только так.

Дальше: создай аккаунт → поставь цель → вкладка **Цель → Включить уведомления 🔔**.

## 4. Мама

Мама ставит приложение так же и создаёт свой аккаунт.
Ты во вкладке **Вместе → Создать группу** и отправляешь ей код, она вводит его у себя.
В группе видно только стрик, трофеи, процент к цели и отметки за сегодня. Килограммы и фото остаются личными.

## Когда приходят напоминания

Время местное, ночью (с 23 до 6) ничего не приходит, каждое напоминание максимум раз в день:
- вес не записан к выбранному часу (по умолчанию 9:00);
- завтрак не отмечен к 11:00, обед к 16:00, ужин к 21:00;
- в 20:00, если стрик под угрозой.

## Полезно знать

- GitHub запускает cron с задержкой до 10–20 минут, это нормально.
- Если в репозитории 60 дней ничего не меняется, GitHub выключит расписание и пришлёт письмо. Включить обратно: Actions → Reminders → Enable.
- `firebase-config.js` можно спокойно держать в публичном репозитории: защищают данные правила Firestore, а не этот ключ. Секрет только JSON сервисного аккаунта.
- Данные из версии в Claude сюда не переносятся, начнёшь с чистого листа.
- Фото хранятся сжатыми прямо в Firestore, поэтому Firebase Storage (который требует платный план) не нужен.
