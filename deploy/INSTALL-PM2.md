# نصب پرتال بدون Docker (با PM2)

این روش برای سروری است که فضای دیسک کمی دارد یا برنامه‌های دیگرش را با PM2 اجرا می‌کند. روی سرور نه git لازم است و نه npm: هر بار که تغییری در شاخهٔ `main` ادغام می‌شود و تست‌ها موفق‌اند، GitHub بستهٔ آمادهٔ اجرا (حدود ۲ مگابایت) را در بخش Releases منتشر می‌کند و اسکریپت `update.sh` همان را دانلود و نصب می‌کند. هر نسخه حدود ۱۰ مگابایت جا می‌گیرد و فقط ۳ نسخهٔ آخر نگه داشته می‌شود.

پیش‌نیازها: Node.js 20 یا بالاتر، PM2، nginx، PostgreSQL، و دسترسی سرور به `github.com`.

فرض‌ها در این راهنما:
- پرتال روی پورت `8080` و فقط روی `127.0.0.1` اجرا می‌شود و nginx جلوی آن است.
- همه‌چیز در `/opt/roya-portal` قرار می‌گیرد:

```
/opt/roya-portal/
  .env              تنظیمات (فقط همین فایل را دستی ویرایش کنید)
  uploads/          فایل‌های بارگذاری‌شده
  backups/          پشتیبان پایگاه داده قبل از هر به‌روزرسانی
  logs/
  releases/<نسخه>/  نسخه‌های دانلودشده
  current           میان‌بر به نسخهٔ در حال اجرا
```

## ۱. نصب PostgreSQL

```bash
sudo apt update
sudo apt install -y postgresql
sudo apt clean
```

ساخت کاربر و پایگاه داده. به‌جای `STRONG_PASSWORD` یک رمز قوی بگذارید:

```bash
sudo -u postgres psql -c "create user portal with password 'STRONG_PASSWORD';"
sudo -u postgres psql -c "create database portal owner portal;"
```

PostgreSQL به‌صورت پیش‌فرض فقط روی خود سرور (localhost:5432) در دسترس است و پورتی روی شبکه باز نمی‌کند.

## ۲. پوشه و فایل تنظیمات

```bash
sudo mkdir -p /opt/roya-portal && sudo chown $USER: /opt/roya-portal
cd /opt/roya-portal
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # خروجی را در SESSION_SECRET بگذارید
nano .env
```

این مقادیر را در `.env` بنویسید:

```
DATABASE_URL=postgresql://portal:STRONG_PASSWORD@localhost:5432/portal
SESSION_SECRET=<خروجی دستور بالا>
PORT=8080
HOST=127.0.0.1
TRUST_PROXY=true
APP_URL=http://portal.roya.local
SETUP_TOKEN=<یک کد دلخواه برای صفحهٔ راه‌اندازی اولیه>
```

`APP_URL` نشانی‌ای است که کارکنان در مرورگر باز می‌کنند (مثلاً `http://192.168.0.21:8081` اگر DNS داخلی ندارید). بقیهٔ تنظیمات اختیاری (مثل SMTP) در [`.env.example`](../.env.example) توضیح داده شده‌اند. فایل‌های بارگذاری‌شده در `/opt/roya-portal/uploads` ذخیره می‌شوند.

```bash
chmod 600 .env
```

## ۳. نصب و اجرا

```bash
curl -fsSL https://raw.githubusercontent.com/jafarmrt/Portal-roya/main/deploy/update.sh -o /tmp/update.sh
bash /tmp/update.sh
```

این دستور آخرین نسخه را دانلود می‌کند، با PM2 اجرا می‌کند و سلامت آن را بررسی می‌کند. در پایان باید پیام `Done: build-… is running on port 8080` را ببینید. بررسی دستی:

```bash
curl http://127.0.0.1:8080/healthz     # باید {"status":"ok"} برگرداند
```

اگر قبلاً `pm2 startup` را اجرا کرده‌اید، کار تمام است و پرتال بعد از ری‌استارت سرور خودش بالا می‌آید. در غیر این صورت `pm2 startup` را اجرا کنید و دستوری را که چاپ می‌کند بزنید.

لاگ‌ها: `pm2 logs roya-portal`

## ۴. nginx

یک فایل جدید بسازید. سایت‌های فعلی دست نمی‌خورند:

```bash
sudo cp /opt/roya-portal/current/deploy/nginx.conf.example /etc/nginx/sites-available/roya-portal
sudo nano /etc/nginx/sites-available/roya-portal
```

در این فایل:
- هر دو `proxy_pass http://127.0.0.1:3000` را به `http://127.0.0.1:8080` تغییر دهید.
- `server_name` را نامی بگذارید که در DNS داخلی به آی‌پی سرور اشاره می‌کند.
- اگر DNS داخلی ندارید، به‌جای `listen 80;` بنویسید `listen 8081;` و `server_name` را `_` بگذارید. بعد پرتال را با `http://آی‌پی-سرور:8081` باز کنید.

```bash
sudo ln -s /etc/nginx/sites-available/roya-portal /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` تنظیمات را قبل از reload بررسی می‌کند. اگر خطا داد، reload انجام نمی‌شود و سایت‌های فعلی سالم می‌مانند.

## ۵. اولین ورود

پرتال را در مرورگر باز کنید، کد `SETUP_TOKEN` را وارد کنید و حساب مدیر را بسازید.

اگر پرتال از سیستم‌های دیگر باز نمی‌شود، فایروال را بررسی کنید: `sudo ufw status`. اگر `active` بود، `sudo ufw allow 8081/tcp` را بزنید.

## به‌روزرسانی از GitHub

هر تغییری که در شاخهٔ `main` ادغام شود و تست‌هایش موفق باشد، چند دقیقه بعد به‌صورت بستهٔ آماده در GitHub منتشر می‌شود. نصب آن روی سرور:

```bash
/opt/roya-portal/current/deploy/update.sh
```

این اسکریپت به ترتیب این کارها را می‌کند:
1. آخرین بستهٔ منتشرشده را از GitHub می‌خواند. اگر همان نسخهٔ در حال اجرا باشد، کاری نمی‌کند.
2. بسته را دانلود می‌کند و در پوشهٔ جدا باز می‌کند.
3. از پایگاه داده نسخهٔ پشتیبان می‌گیرد. ۱۰ نسخهٔ آخر در پوشهٔ `backups/` نگه داشته می‌شود.
4. نسخهٔ جدید را اجرا می‌کند و سلامت آن را بررسی می‌کند. اگر بالا نیاید، نسخهٔ قبلی را خودکار برمی‌گرداند.
5. نسخهٔ قبلی و جدید را می‌نویسد (مثلاً `v2.19.0 (build-55) -> v2.21.0 (build-60)`) و عنوان تغییرات میان آن دو را از `CHANGELOG.md` چاپ می‌کند. اگر اسکریپت از نسخه‌ای بیرون از پوشهٔ `releases` اجرا شده باشد (مثلاً `/tmp/update.sh`)، آن نسخه را هم به‌روز می‌کند.

برای دیدن نسخهٔ نصب‌شده و در حال اجرا، بدون به‌روزرسانی:

```bash
/opt/roya-portal/current/deploy/update.sh --version
```

شمارهٔ نسخه و بیلد در پاورقی همهٔ صفحه‌های پرتال و در کادر «وضعیت سرور» تنظیمات هم دیده می‌شود؛ با زدن روی آن فهرست تغییرات باز می‌شود.

### به‌روزرسانی خودکار (اختیاری)

اگر می‌خواهید سرور هر ۱۰ دقیقه خودش بررسی کند و نسخهٔ جدید را نصب کند، `crontab -e` را بزنید (با همان کاربری که PM2 را اجرا می‌کند، نه root) و این خط را اضافه کنید:

```
*/10 * * * * /opt/roya-portal/current/deploy/update.sh --auto >> /opt/roya-portal/logs/update.log 2>&1
```

چون GitHub فقط commitهایی را منتشر می‌کند که تست‌هایشان موفق بوده، نسخهٔ خراب معمولاً به سرور نمی‌رسد. اگر نسخه‌ای روی سرور بالا نیاید، نسخهٔ قبلی برمی‌گردد و cron دیگر آن نسخه را امتحان نمی‌کند تا نسخهٔ بعدی منتشر شود. برای امتحان دوباره، اسکریپت را دستی اجرا کنید.

گزارش به‌روزرسانی‌ها: `tail -n 50 /opt/roya-portal/logs/update.log`

### برگشت دستی به نسخهٔ قبلی

```bash
ls /opt/roya-portal/releases/                       # نسخه‌های موجود
cd /opt/roya-portal && ln -sfn releases/build-12 current   # نام نسخهٔ مورد نظر
pm2 delete roya-portal && pm2 start current/deploy/ecosystem.config.cjs && pm2 save
```

## پشتیبان‌گیری

پرتال خودش پشتیبان می‌گیرد و فایل‌ها را در `/opt/roya-portal/backups` می‌گذارد:

| فایل | زمان | چند نسخه می‌ماند |
| --- | --- | --- |
| `nightly-db-YYYY-MM-DD.sql.gz` (پایگاه داده) | هر شب ساعت ۲ | ۷ |
| `weekly-uploads-YYYY-MM-DD.tar.gz` (فایل‌های بارگذاری‌شده) | شب‌های جمعه | ۲ |
| `db-…-<نسخه>.sql.gz` (پایگاه داده) | پیش از هر به‌روزرسانی | ۱۰ |

اگر پشتیبان‌گیری شبانه انجام نشود (مثلاً `pg_dump` نصب نباشد) یا فضای خالی دیسک از ۵۰۰ مگابایت کمتر شود، به مدیران پرتال اعلان داده می‌شود. وضعیت پشتیبان‌ها و دیسک در «تنظیمات پرتال ← وضعیت سرور و پشتیبان‌ها» دیده می‌شود. پیش از پشتیبان فایل‌ها بررسی می‌شود که دیسک جا داشته باشد. برای پوشهٔ دیگر، `BACKUP_DIR` را در `.env` بگذارید.

این پشتیبان‌ها روی همان دیسک سرورند؛ اگر دیسک خراب شود از دست می‌روند. هر چند وقت یک بار پوشهٔ `backups` را روی کامپیوتر یا دیسک دیگری کپی کنید، مثلاً از یک کامپیوتر ویندوزی با WinSCP یا با دستور:

```bash
scp -r user@192.168.0.21:/opt/roya-portal/backups ./portal-backups
```

برگرداندن پایگاه داده از یک پشتیبان: پرتال را متوقف کنید، پایگاه داده را خالی از نو بسازید و پشتیبان را با کاربر `portal` (همان رمز `DATABASE_URL`) در آن بریزید. همهٔ داده‌های بعد از زمان پشتیبان از دست می‌رود.

```bash
pm2 stop roya-portal
sudo -u postgres psql -c "drop database portal;" -c "create database portal owner portal;"
gunzip -c /opt/roya-portal/backups/nightly-db-2026-10-27.sql.gz | psql "postgresql://portal:STRONG_PASSWORD@localhost:5432/portal"
pm2 start roya-portal
```

پشتیبان دستی در هر زمان:

```bash
sudo -u postgres pg_dump portal | gzip > ~/portal-db-$(date +%F).sql.gz
tar czf ~/portal-uploads-$(date +%F).tgz -C /opt/roya-portal uploads
```
