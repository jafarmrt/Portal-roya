# نصب پرتال بدون Docker (با PM2)

این روش برای سروری است که فضای دیسک کمی دارد یا برنامه‌های دیگرش را با PM2 اجرا می‌کند. کل نصب حدود ۵۰۰ مگابایت جا لازم دارد (بعد از پاک‌سازی، حدود ۳۰۰ مگابایت می‌ماند).

پیش‌نیازها: Node.js 20 یا بالاتر، PM2، nginx.

فرض‌ها در این راهنما:
- پرتال روی پورت `8080` و فقط روی `127.0.0.1` اجرا می‌شود و nginx جلوی آن است.
- کد پرتال در `/opt/roya-portal` قرار می‌گیرد.

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

## ۲. دریافت کد و ساخت

```bash
sudo mkdir -p /opt/roya-portal && sudo chown $USER: /opt/roya-portal
git clone https://github.com/jafarmrt/Portal-roya.git /opt/roya-portal
cd /opt/roya-portal
npm ci
npm run build
npm prune --omit=dev
npm cache clean --force
```

## ۳. فایل تنظیمات

```bash
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # خروجی را در SESSION_SECRET بگذارید
nano .env
```

این مقادیر را در `.env` تنظیم کنید:

```
DATABASE_URL=postgresql://portal:STRONG_PASSWORD@localhost:5432/portal
SESSION_SECRET=<خروجی دستور بالا>
PORT=8080
HOST=127.0.0.1
TRUST_PROXY=true
APP_URL=http://portal.roya.local
UPLOAD_DIR=/opt/roya-portal/uploads
SETUP_TOKEN=<یک کد دلخواه برای صفحهٔ راه‌اندازی اولیه>
```

```bash
chmod 600 .env
```

## ۴. اجرا با PM2

```bash
pm2 start deploy/ecosystem.config.cjs
pm2 save
curl http://127.0.0.1:8080/healthz     # باید {"status":"ok"} برگرداند
```

اگر قبلاً `pm2 startup` را اجرا کرده‌اید، `pm2 save` کافی است تا پرتال بعد از ری‌استارت سرور خودش بالا بیاید. در غیر این صورت `pm2 startup` را اجرا کنید و دستوری را که چاپ می‌کند بزنید.

لاگ‌ها: `pm2 logs roya-portal`

## ۵. nginx

یک فایل جدید بسازید. سایت‌های فعلی دست نمی‌خورند:

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/roya-portal
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

## ۶. اولین ورود

پرتال را در مرورگر باز کنید، کد `SETUP_TOKEN` را وارد کنید و حساب مدیر را بسازید.

## به‌روزرسانی

```bash
cd /opt/roya-portal
git pull
npm ci && npm run build && npm prune --omit=dev && npm cache clean --force
pm2 restart roya-portal
```

## پشتیبان‌گیری

```bash
sudo -u postgres pg_dump portal | gzip > ~/portal-db-$(date +%F).sql.gz
tar czf ~/portal-uploads-$(date +%F).tgz -C /opt/roya-portal uploads
```
