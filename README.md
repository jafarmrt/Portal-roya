# پرتال اطلاع‌رسانی رویا طرح داخلی

پرتال داخلی برای اطلاع‌رسانی و گردش اطلاعات در سازمان: اخبار و اطلاعیه‌ها برای همه یا گروه‌های مشخص، بخشنامه با تأیید مطالعه و مهلت، اسناد و فرم‌ها، دفتر تلفن و چارت سازمانی، تقویم، دوره‌های آموزشی و نظرسنجی.
این نرم‌افزار جای اتوماسیون اداری یا حضور و غیاب را نمی‌گیرد و فقط به آن‌ها لینک می‌دهد.

برنامه برای اجرا روی **سرور داخلی شرکت** طراحی شده و به هیچ سرویس ابری (فونت، CDN، ورود با گوگل و…) وابسته نیست.

## اجزا

| بخش | فناوری |
| --- | --- |
| رابط کاربری | React 19، Vite، Tailwind |
| سرور | Node.js 22، Express |
| پایگاه داده | PostgreSQL 16 (با Drizzle ORM و migration خودکار) |
| فایل‌ها | پوشهٔ `uploads` روی همان سرور |
| ایمیل (اختیاری) | سرور SMTP داخلی شرکت |

## نصب با Docker (پیشنهادی)

پیش‌نیاز: Docker و Docker Compose روی سرور.

```bash
git clone <آدرس مخزن> portal && cd portal
cp .env.example .env
# در فایل .env حداقل این‌ها را پر کنید: POSTGRES_PASSWORD، SESSION_SECRET، APP_URL
# برای ساخت SESSION_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
docker compose up -d --build
```

پرتال روی `http://<آی‌پی سرور>:3000` بالا می‌آید. اگر سرور به اینترنت دسترسی ندارد، image را روی سیستمی با اینترنت بسازید (`docker compose build`) و با `docker save` / `docker load` منتقل کنید.

## نصب بدون Docker

راهنمای کامل و گام‌به‌گام نصب با PM2 کنار برنامه‌های دیگر و پشت nginx در [`deploy/INSTALL-PM2.md`](deploy/INSTALL-PM2.md) آمده است. در این روش سرور نیازی به npm ندارد: GitHub بعد از موفق بودن تست‌ها، بستهٔ آمادهٔ برنامه را در بخش Releases منتشر می‌کند و `deploy/update.sh` همان را دانلود و نصب می‌کند.

برای اجرا از روی کد (مثلاً روی سیستم توسعه):

```bash
npm ci
cp .env.example .env      # DATABASE_URL و SESSION_SECRET را تنظیم کنید
npm run build
TZ=Asia/Tehran npm start
```

خروجی ساخت (`dist/` و `server-dist/index.cjs` و `drizzle/`) بدون `node_modules` اجرا می‌شود، چون همهٔ وابستگی‌های سرور داخل همان یک فایل قرار گرفته‌اند.

برای اجرای دائمی از systemd یا pm2 استفاده کنید. نمونهٔ سرویس systemd:

```ini
[Unit]
Description=Roya portal
After=network.target postgresql.service

[Service]
WorkingDirectory=/opt/portal
EnvironmentFile=/opt/portal/.env
Environment=NODE_ENV=production TZ=Asia/Tehran
ExecStart=/usr/bin/node --enable-source-maps server-dist/index.cjs
Restart=always
User=portal

[Install]
WantedBy=multi-user.target
```

جدول‌های پایگاه داده هنگام هر بار اجرای سرور به‌صورت خودکار ساخته یا به‌روز می‌شوند.

## اولین راه‌اندازی

1. پرتال را در مرورگر باز کنید. صفحهٔ «راه‌اندازی اولیه» نمایش داده می‌شود.
2. حساب مدیر اصلی را بسازید (اگر `SETUP_TOKEN` را در `.env` گذاشته‌اید، همان کد را وارد کنید).
3. از منوی «تنظیمات پرتال» واحدها، محل‌های استقرار و دسته‌بندی‌ها را اصلاح کنید و از «سامانه‌ها» لینک اتوماسیون، حضور و غیاب و… را بگذارید.
4. از «مدیریت کارکنان» همکاران را اضافه کنید (یکی‌یکی یا با فایل اکسل). برای همکارانی که حساب پورتال دارند یک رمز موقت ساخته می‌شود که فقط یک بار نمایش داده می‌شود و همکار در اولین ورود باید رمز شخصی انتخاب کند. همکارانی مثل کارکنان کارگاه را می‌توانید بدون حساب پورتال ثبت کنید تا فقط در دفتر تلفن و کارت‌های تولد دیده شوند.
5. به‌طور پیش‌فرض کسی که وارد نشده هم می‌تواند اخبار عمومی، نظرسنجی‌ها، اسناد، آموزش، تقویم و سامانه‌ها را ببیند (فقط مشاهده). برای هر تعامل (رأی، لایک، تبریک، اعلان‌ها) باید وارد شود. این دسترسی و نمایش دفتر تلفن به مهمان از «تنظیمات پرتال ← دسترسی مهمان» قابل تغییر است.

## متغیرهای تنظیمات

همهٔ متغیرها با توضیح در [`.env.example`](.env.example) آمده‌اند. مهم‌ترین‌ها:

| متغیر | توضیح |
| --- | --- |
| `DATABASE_URL` | آدرس اتصال PostgreSQL |
| `SESSION_SECRET` | رشتهٔ تصادفی حداقل ۳۲ کاراکتری (اجباری در حالت production) |
| `APP_URL` | آدرسی که همکاران پرتال را با آن باز می‌کنند (در لینک ایمیل‌ها) |
| `COOKIE_SECURE` | فقط اگر پرتال با HTTPS سرو می‌شود `true` کنید |
| `TRUST_PROXY` | اگر پشت nginx است `true` کنید |
| `SETUP_TOKEN` | کد اختیاری برای صفحهٔ راه‌اندازی اولیه |
| `SMTP_HOST` و… | ایمیل داخلی برای اخبار فوری و بخشنامه‌ها؛ خالی = غیرفعال |
| `LDAP_URL` و… | ورود با نام کاربری و رمز ویندوز (اکتیو دایرکتوری)؛ خالی = غیرفعال. راهنما: [`deploy/AD-LOGIN.md`](deploy/AD-LOGIN.md) |
| `UPLOAD_DIR`، `MAX_UPLOAD_MB` | محل و سقف حجم فایل‌های بارگذاری‌شده |

اگر می‌خواهید پرتال با نام دامنهٔ داخلی یا HTTPS در دسترس باشد، نمونهٔ تنظیم nginx در [`deploy/nginx.conf.example`](deploy/nginx.conf.example) است. توجه کنید که بافر برای مسیر `/api/events` (به‌روزرسانی زنده) باید خاموش باشد.

## پشتیبان‌گیری

دو چیز باید پشتیبان گرفته شود: پایگاه داده و پوشهٔ فایل‌ها.

```bash
# با Docker
docker compose exec -T db pg_dump -U portal portal | gzip > backup-$(date +%F).sql.gz
docker run --rm -v portal_uploads:/data -v "$PWD":/backup busybox tar czf /backup/uploads-$(date +%F).tgz -C /data .

# بازگردانی پایگاه داده
gunzip -c backup-2026-10-26.sql.gz | docker compose exec -T db psql -U portal portal
```

(نام volume ممکن است بسته به نام پوشه متفاوت باشد؛ با `docker volume ls` ببینید.) پیشنهاد می‌شود این دستورها با cron هر شب اجرا شوند.

## به‌روزرسانی

در نصب بدون Docker، دستور `deploy/update.sh` آخرین بستهٔ منتشرشده در GitHub را با پشتیبان‌گیری و بازگشت خودکار نصب می‌کند و می‌تواند با cron خودکار شود. جزئیات در [`deploy/INSTALL-PM2.md`](deploy/INSTALL-PM2.md) آمده است. با Docker:

```bash
git pull
docker compose up -d --build
```

قبل از به‌روزرسانی پشتیبان بگیرید. migrationهای پایگاه داده هنگام شروع سرور خودکار اجرا می‌شوند.

## توسعه

```bash
npm ci
cp .env.example .env        # DATABASE_URL را به یک PostgreSQL محلی بدهید
npm run dev                 # سرور و Vite روی http://localhost:3000
npm run lint && npm run typecheck
npm test                    # به TEST_DATABASE_URL (پایگاه دادهٔ جدا) نیاز دارد
npm run build && npm run test:e2e   # تست مرورگر همهٔ صفحه‌ها؛ پایگاه داده را E2E_DATABASE_URL می‌دهد و پاک می‌کند
npm run db:generate         # بعد از تغییر server/db/schema.ts برای ساخت migration
```

ساختار پوشه‌ها:

- `server/` سرور Express: `routes/` مسیرهای API، `db/schema.ts` جدول‌ها، `auth.ts` ورود و نشست
- `src/` رابط کاربری React
- `shared/` توابع تاریخ شمسی مشترک بین سرور و مرورگر
- `drizzle/` فایل‌های migration پایگاه داده
- `tests/` تست‌های خودکار API

## نکات امنیتی

- رمزها با bcrypt ذخیره می‌شوند و نشست در کوکی HttpOnly نگه داشته می‌شود.
- پس از ۵ تلاش ناموفق، حساب ۱۵ دقیقه قفل می‌شود.
- همهٔ APIها و فایل‌های بارگذاری‌شده فقط برای کاربران واردشده در دسترس‌اند.
- پاسخ‌های «حال امروز» بی‌نام‌اند و مدیران فقط آمار تجمیعی می‌بینند.

## مهاجرت از نسخهٔ قبلی

نسخهٔ ۲ ساختار پایگاه داده را کاملاً عوض کرده و دادهٔ نسخهٔ قبلی (که بخش زیادی از آن فقط در مرورگر ذخیره می‌شد) به‌صورت خودکار منتقل نمی‌شود. پیشنهاد می‌شود با یک پایگاه دادهٔ خالی نصب کنید و همکاران را از نو اضافه کنید.
