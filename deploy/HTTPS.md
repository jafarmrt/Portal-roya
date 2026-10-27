# راه‌اندازی HTTPS برای پرتال

این کار را **پیش از روشن کردن ورود با اکتیو دایرکتوری** ([AD-LOGIN.md](AD-LOGIN.md)) انجام دهید. با ورود AD، همکاران رمز ویندوزشان را در پرتال می‌زنند. روی `http` این رمز بدون رمزنگاری در شبکه جابه‌جا می‌شود و هر کسی که ترافیک شبکه را شنود کند می‌تواند آن را ببیند. با `https` مسیر مرورگر تا سرور رمزنگاری می‌شود.

## روش کار در یک نگاه

- پرتال فقط داخل شبکه است و نام دامنهٔ اینترنتی ندارد، پس گواهی رایگان اینترنتی (مثل Let's Encrypt) به کار نمی‌آید.
- به‌جایش یک «مرجع صدور گواهی» (CA) کوچک مخصوص شرکت می‌سازیم و با آن برای پرتال گواهی صادر می‌کنیم. اسکریپت `make-cert.sh` هر دو را می‌سازد.
- گواهی این CA را یک بار با Group Policy روی کامپیوترهای دامنه نصب می‌کنیم. از آن به بعد مرورگرها به پرتال اعتماد می‌کنند و هشداری نمی‌بینند.
- نشانی پرتال همان می‌ماند و فقط `http` به `https` تبدیل می‌شود: `https://192.168.0.21:8081`. لینک‌ها و نشانک‌های قدیمی `http://` خودکار به `https://` می‌روند.
- پورت عوض نمی‌شود، پس فایروال تغییری نمی‌خواهد. سایت دیگری که روی پورت‌های 80 و 443 همین سرور است هم دست نمی‌خورد.

زمان لازم: حدود نیم ساعت، به‌اضافهٔ زمانی که Group Policy به کامپیوترها برسد. ترتیب قدم‌ها مهم است: اول گواهی CA روی کامپیوترها نصب می‌شود و بعد HTTPS روشن می‌شود، تا کسی صفحهٔ هشدار نبیند.

> **اگر شبکهٔ شما CA ویندوزی (Active Directory Certificate Services) دارد،** می‌توانید گواهی پرتال را از همان بگیرید. کامپیوترهای دامنه از قبل به آن اعتماد دارند. گواهی باید IP سرور (`192.168.0.21`) را در Subject Alternative Name داشته باشد. در این صورت قدم ۱ و ۲ را رد کنید، گواهی و کلید را با نام‌های `portal.crt` و `portal.key` در `/opt/roya-portal/ssl/` بگذارید و از قدم ۳ ادامه دهید.

## ۱. ساخت گواهی روی سرور

اول پرتال را به آخرین نسخه به‌روز کنید (`bash /tmp/update.sh`) تا اسکریپت روی سرور باشد. بعد:

```bash
sudo bash /opt/roya-portal/current/deploy/make-cert.sh 192.168.0.21
```

اسکریپت این فایل‌ها را در `/opt/roya-portal/ssl/` می‌سازد:

| فایل | چیست |
|---|---|
| `roya-ca.crt` | گواهی CA شرکت. روی کامپیوترها و گوشی‌ها نصب می‌شود و محرمانه نیست. |
| `roya-ca.key` | کلید خصوصی CA. محرمانه است (قدم ۶). |
| `portal.crt` و `portal.key` | گواهی و کلید پرتال برای nginx. کلید را فقط root می‌خواند. |

CA ده سال اعتبار دارد و گواهی پرتال ۸۲۵ روز (حدود دو سال و سه ماه). اسکریپت تاریخ انقضا را چاپ می‌کند.

اگر بعداً در DNS داخلی (روی DC) نامی برای پرتال ساختید، مثلاً `portal.roya.local`، آن نام را هم به دستور اضافه کنید و گواهی را دوباره بسازید:

```bash
sudo bash /opt/roya-portal/current/deploy/make-cert.sh 192.168.0.21 portal.roya.local
```

## ۲. نصب گواهی CA روی کامپیوترها

**گرفتن فایل:** در WSL روی کامپیوتر خودتان:

```bash
scp jafar@192.168.0.21:/opt/roya-portal/ssl/roya-ca.crt /mnt/c/Users/Public/roya-ca.crt
```

فایل در `C:\Users\Public\roya-ca.crt` ذخیره می‌شود. آن را روی DC (یا هر کامپیوتری که Group Policy Management دارد) کپی کنید.

**پخش با Group Policy:**

1. `gpmc.msc` را باز کنید.
2. روی نام دامنه راست‌کلیک کنید و «Create a GPO in this domain, and Link it here» را بزنید. نامش را `Roya Portal CA` بگذارید.
3. روی GPO تازه راست‌کلیک کنید و «Edit» را بزنید.
4. به این مسیر بروید:
   `Computer Configuration > Policies > Windows Settings > Security Settings > Public Key Policies > Trusted Root Certification Authorities`
5. روی آن راست‌کلیک کنید، «Import» را بزنید، فایل `roya-ca.crt` را انتخاب کنید و با Next و Finish تمام کنید.

کامپیوترها این تنظیم را با ری‌استارت بعدی یا حداکثر در حدود ۹۰ دقیقه می‌گیرند. برای آزمایش فوری، روی یک کامپیوتر در Command Prompt بزنید:

```
gpupdate /force
```

**بررسی روی یک کامپیوتر:** `certlm.msc` را باز کنید. در `Trusted Root Certification Authorities > Certificates` باید `Roya Portal CA` دیده شود.

Chrome و Edge از همین فهرست ویندوز استفاده می‌کنند. اگر کسی Firefox دارد و هشدار دید، در `about:config` گزینهٔ `security.enterprise_roots.enabled` را `true` کند.

**کامپیوتری که عضو دامنه نیست:** روی `roya-ca.crt` دو بار کلیک کنید، «Install Certificate» را بزنید، «Local Machine» را انتخاب کنید و در «Place all certificates in the following store» گزینهٔ «Trusted Root Certification Authorities» را بدهید.

**گوشی‌ها** (اگر همکاران پرتال را با وای‌فای شرکت روی گوشی باز می‌کنند): فایل `roya-ca.crt` را برایشان بفرستید.

- اندروید: Settings ← Security ← Encryption & credentials ← Install a certificate ← CA certificate. نام منوها در هر برند کمی فرق دارد.
- آیفون: فایل را باز کنید و در Settings پروفایل دانلودشده را نصب کنید. بعد در Settings ← General ← About ← Certificate Trust Settings گزینهٔ `Roya Portal CA` را روشن کنید.

## ۳. روشن کردن HTTPS در nginx

فقط فایل nginx پرتال عوض می‌شود. اول از فایل فعلی نسخهٔ پشتیبان بگیرید:

```bash
cp /etc/nginx/sites-available/roya-portal ~/roya-portal.nginx.bak
sudo cp /opt/roya-portal/current/deploy/nginx-https.conf.example /etc/nginx/sites-available/roya-portal
sudo nginx -t && sudo systemctl reload nginx
```

اگر فایل پرتال نام دیگری دارد، با `ls -l /etc/nginx/sites-enabled/` پیدایش کنید و همان نام را به‌جای `roya-portal` بگذارید. `nginx -t` تنظیمات را قبل از reload بررسی می‌کند. اگر خطا داد، reload انجام نمی‌شود و همه‌چیز مثل قبل می‌ماند.

## ۴. تنظیم پرتال

```bash
nano /opt/roya-portal/.env
```

این سه خط را تغییر دهید، یا اگر نیستند اضافه کنید:

```
APP_URL=https://192.168.0.21:8081
COOKIE_SECURE=true
TRUST_PROXY=true
```

بعد:

```bash
pm2 restart roya-portal
```

`APP_URL` در لینک اعلان‌ها و فایل تقویم Outlook به کار می‌رود. با `COOKIE_SECURE` کوکی ورود فقط روی HTTPS فرستاده می‌شود. همکارانی که الان وارد پرتال هستند لازم نیست دوباره وارد شوند.

## ۵. بررسی

- در مرورگر `https://192.168.0.21:8081` را باز کنید. کنار نشانی باید علامت قفل باشد و هشداری نیاید.
- نشانی قدیمی `http://192.168.0.21:8081` را باز کنید. باید خودش به `https://` برود.
- وارد شوید و ببینید اعلان‌ها و به‌روزرسانی زنده کار می‌کنند.
- روی سرور این دستور باید `{"status":"ok",...}` برگرداند:

```bash
curl --cacert /opt/roya-portal/ssl/roya-ca.crt https://192.168.0.21:8081/healthz
```

اگر مرورگری هشدار «Your connection is not private» داد، گواهی CA هنوز روی آن کامپیوتر نصب نشده است (قدم ۲).

## ۶. نگه‌داری کلید CA

هر کسی که `roya-ca.key` را داشته باشد می‌تواند برای هر سایتی گواهی بسازد که کامپیوترهای شرکت به آن اعتماد کنند. پس بهتر است آن را از سرور بردارید و جای امنی نگه دارید، مثلاً روی کامپیوتر خودتان و یک فلش. این کلید فقط برای تمدید گواهی پرتال، حدود دو سال دیگر، لازم می‌شود.

روی سرور:

```bash
sudo install -m 600 -o $USER /opt/roya-portal/ssl/roya-ca.key ~/roya-ca.key
```

در WSL:

```bash
scp jafar@192.168.0.21:roya-ca.key ~/roya-ca.key
```

وقتی مطمئن شدید فایل سالم کپی شده است، روی سرور:

```bash
rm ~/roya-ca.key && sudo rm /opt/roya-portal/ssl/roya-ca.key
```

اگر این کلید گم شود، مشکل فوری پیش نمی‌آید. فقط برای تمدید باید CA تازه بسازید و قدم ۲ را دوباره انجام دهید.

## تمدید گواهی (حدود هر دو سال)

تاریخ انقضا را این‌طور ببینید:

```bash
openssl x509 -enddate -noout -in /opt/roya-portal/ssl/portal.crt
```

برای تمدید، کلید CA را به سرور برگردانید، همان دستور قدم ۱ را دوباره بزنید و nginx را reload کنید:

```bash
scp ~/roya-ca.key jafar@192.168.0.21:        # در WSL
sudo install -m 600 -o root ~/roya-ca.key /opt/roya-portal/ssl/roya-ca.key && rm ~/roya-ca.key   # روی سرور
sudo bash /opt/roya-portal/current/deploy/make-cert.sh 192.168.0.21
sudo nginx -t && sudo systemctl reload nginx
```

کامپیوترها چیز تازه‌ای لازم ندارند، چون CA همان است. بعد دوباره کلید CA را طبق قدم ۶ از سرور بردارید.

## برگرداندن به حالت قبل

اگر مشکلی پیش آمد:

```bash
sudo cp ~/roya-portal.nginx.bak /etc/nginx/sites-available/roya-portal
sudo nginx -t && sudo systemctl reload nginx
```

بعد در `/opt/roya-portal/.env` مقدار `APP_URL` را به `http://192.168.0.21:8081` و `COOKIE_SECURE` را به `false` برگردانید و `pm2 restart roya-portal` را بزنید.

## بعد از HTTPS: ورود با AD

حالا مسیر مرورگر تا پرتال امن است. مسیر پرتال تا DC هم بهتر است رمزنگاری شود: اگر روی DC گواهی هست، در [AD-LOGIN.md](AD-LOGIN.md) از `ldaps://...:636` استفاده کنید.
