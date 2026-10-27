# راه‌اندازی HTTPS برای پرتال

این کار را **پیش از روشن کردن ورود با اکتیو دایرکتوری** ([AD-LOGIN.md](AD-LOGIN.md)) انجام دهید. با ورود AD، همکاران رمز ویندوزشان را در پرتال می‌زنند. روی `http` این رمز بدون رمزنگاری در شبکه جابه‌جا می‌شود و هر کسی که ترافیک شبکه را شنود کند می‌تواند آن را ببیند. با `https` مسیر مرورگر تا سرور رمزنگاری می‌شود.

## روش کار در یک نگاه

- پرتال فقط داخل شبکه است، پس گواهی رایگان اینترنتی (مثل Let's Encrypt) به کار نمی‌آید. به‌جایش یک «مرجع صدور گواهی» (CA) کوچک مخصوص شرکت می‌سازیم و با آن برای پرتال گواهی صادر می‌کنیم.
- گواهی این CA را مسئول IT یک بار با Group Policy روی کامپیوترهای دامنه نصب می‌کند. از آن به بعد مرورگرها به پرتال اعتماد می‌کنند و هشداری نمی‌بینند.
- **DC** (Domain Controller) همان سرور ویندوزی است که اکتیو دایرکتوری روی آن است. DNS داخلی و Group Policy هم روی همین سرور تنظیم می‌شوند.
- نشانی پرتال `https://portal.royaco.com` می‌شود. لینک‌ها و نشانک‌های قدیمی (`http://192.168.0.21:8081`) خودکار به نشانی تازه می‌روند.
- سایت دیگری که روی پورت‌های 80 و 443 همین سرور است (مثلاً `card.royaco.com`) دست نمی‌خورد. nginx هر درخواست را از روی نام به سایت درست می‌فرستد.

در مثال‌ها نام پرتال `portal.royaco.com` و IP سرور `192.168.0.21` است.

## ۱. ساخت گواهی (روی سرور پرتال)

اول پرتال را به آخرین نسخه به‌روز کنید (`bash /tmp/update.sh`). بعد:

```bash
sudo bash /opt/roya-portal/current/deploy/make-cert.sh 192.168.0.21 portal.royaco.com
```

اسکریپت این فایل‌ها را در `/opt/roya-portal/ssl/` می‌سازد:

| فایل | چیست |
|---|---|
| `roya-ca.crt` | گواهی CA شرکت. روی کامپیوترها و گوشی‌ها نصب می‌شود و محرمانه نیست. |
| `roya-ca.key` | کلید خصوصی CA. محرمانه است (پایین‌تر، «نگه‌داری کلید CA»). |
| `portal.crt` و `portal.key` | گواهی و کلید پرتال برای nginx. کلید را فقط root می‌خواند. |

CA ده سال اعتبار دارد و گواهی پرتال ۸۲۵ روز (حدود دو سال و سه ماه). اگر اسکریپت را دوباره بزنید، فقط گواهی پرتال تازه می‌شود و CA همان می‌ماند.

**آوردن `roya-ca.crt` به ویندوز:** از سرور بیرون بیایید (`exit`) و در WSL روی کامپیوتر خودتان بزنید:

```bash
scp jafar@192.168.0.21:/opt/roya-portal/ssl/roya-ca.crt /mnt/c/Users/Public/
```

فایل در `C:\Users\Public\roya-ca.crt` قرار می‌گیرد.

## ۲. کار مسئول IT (یک بار، روی DC)

فایل `roya-ca.crt` را با این متن برای مسئول IT بفرستید:

> سلام. برای پرتال داخلی دو کار لازم است:
> ۱. در DNS یک رکورد A بسازید: `portal.royaco.com` به `192.168.0.21`. اگر نام دامنهٔ اکتیو دایرکتوری `royaco.com` نیست، یک Forward Lookup Zone تازه به نام `portal.royaco.com` بسازید و در آن یک رکورد A بدون نام به `192.168.0.21` بگذارید، تا سایت و ایمیل عمومی royaco.com دست نخورد.
> ۲. گواهی پیوست (`roya-ca.crt`) را با Group Policy روی همهٔ کامپیوترهای دامنه، در Trusted Root Certification Authorities نصب کنید. برای این کار یک GPO تازه به نام `Roya Portal CA` بسازید و فایل را در این مسیر Import کنید:
> `Computer Configuration > Policies > Windows Settings > Security Settings > Public Key Policies > Trusted Root Certification Authorities`

کامپیوترها گواهی را با ری‌استارت بعدی یا حداکثر در حدود ۹۰ دقیقه می‌گیرند (برای آزمایش فوری: `gpupdate /force`).

**آماده است یا نه؟** روی کامپیوتر خودتان در Command Prompt:
- `ping portal.royaco.com` باید از `192.168.0.21` جواب بگیرد (DNS آماده است).
- در `certlm.msc`، زیر `Trusted Root Certification Authorities > Certificates` باید `Roya Portal CA` باشد (گواهی رسیده است).

تا این دو آماده نشده‌اند، قدم ۳ را نزنید. وگرنه کامپیوترها نشانی تازه را پیدا نمی‌کنند یا هشدار می‌بینند.

## ۳. روشن کردن HTTPS (روی سرور پرتال، یک دستور)

بدون `sudo` بزنید. اسکریپت خودش رمز sudo را می‌پرسد:

```bash
bash /opt/roya-portal/current/deploy/enable-https.sh portal.royaco.com
```

اسکریپت:
- تنظیم فعلی nginx پرتال و `.env` را در `/opt/roya-portal/backups/https/` نگه می‌دارد؛
- فایل nginx پرتال را برای `https://portal.royaco.com` می‌نویسد و نشانی‌های قدیمی را به آن می‌فرستد؛
- در `.env` مقدارهای `APP_URL`، `COOKIE_SECURE` و `TRUST_PROXY` را تنظیم می‌کند و پرتال را دوباره راه می‌اندازد؛
- آخر کار بررسی می‌کند که پرتال روی نشانی تازه جواب می‌دهد. اگر جواب نداد، خودش همه‌چیز را به حالت قبل برمی‌گرداند.

بعد در مرورگر `https://portal.royaco.com` را باز کنید. کنار نشانی باید علامت قفل باشد. همکارانی که وارد پرتال هستند لازم نیست دوباره وارد شوند.

**برگرداندن به حالت قبل:**

```bash
bash /opt/roya-portal/current/deploy/enable-https.sh --undo
```

پرتال دوباره روی `http://192.168.0.21:8081` می‌آید. (مرورگرهایی که یک بار نشانی https را باز کرده‌اند، نام `portal.royaco.com` را تا مدتی فقط با https باز می‌کنند؛ نشانی با IP همیشه کار می‌کند.)

## کامپیوترهای بیرون از دامنه و گوشی‌ها

Group Policy فقط به کامپیوترهای عضو دامنه می‌رسد. برای بقیه، فایل `roya-ca.crt` را بدهید:

- **ویندوز:** روی فایل دو بار کلیک کنید، «Install Certificate» را بزنید، «Local Machine» را انتخاب کنید و در «Place all certificates in the following store» گزینهٔ «Trusted Root Certification Authorities» را بدهید.
- **اندروید:** Settings ← Security ← Encryption & credentials ← Install a certificate ← CA certificate (نام منوها در هر برند کمی فرق دارد).
- **آیفون:** فایل را باز کنید و در Settings پروفایل دانلودشده را نصب کنید. بعد در Settings ← General ← About ← Certificate Trust Settings گزینهٔ `Roya Portal CA` را روشن کنید.
- **Firefox:** اگر هشدار داد، در `about:config` گزینهٔ `security.enterprise_roots.enabled` را `true` کنید.

## نگه‌داری کلید CA

هر کسی که `roya-ca.key` را داشته باشد می‌تواند برای هر سایتی گواهی بسازد که کامپیوترهای شرکت به آن اعتماد کنند. پس بهتر است آن را از سرور بردارید و جای امنی نگه دارید، مثلاً روی کامپیوتر خودتان و یک فلش. این کلید فقط برای تمدید گواهی پرتال لازم می‌شود.

```bash
sudo install -m 600 -o $USER /opt/roya-portal/ssl/roya-ca.key ~/roya-ca.key   # روی سرور
scp jafar@192.168.0.21:roya-ca.key ~/roya-ca.key                                 # در WSL
rm ~/roya-ca.key && sudo rm /opt/roya-portal/ssl/roya-ca.key                      # روی سرور، بعد از کپی سالم
```

اگر این کلید گم شود، مشکل فوری پیش نمی‌آید. فقط برای تمدید باید CA تازه بسازید و Group Policy را با فایل تازه تکرار کنید.

## تمدید گواهی (حدود هر دو سال)

تاریخ انقضا: `openssl x509 -enddate -noout -in /opt/roya-portal/ssl/portal.crt`

```bash
scp ~/roya-ca.key jafar@192.168.0.21:                                                         # در WSL
sudo install -m 600 -o root ~/roya-ca.key /opt/roya-portal/ssl/roya-ca.key && rm ~/roya-ca.key   # روی سرور
sudo bash /opt/roya-portal/current/deploy/make-cert.sh 192.168.0.21 portal.royaco.com
sudo nginx -t && sudo systemctl reload nginx
```

کامپیوترها چیز تازه‌ای لازم ندارند، چون CA همان است. بعد دوباره کلید CA را از سرور بردارید.

## اگر CA ویندوزی (AD CS) دارید

اگر شبکهٔ شما Active Directory Certificate Services دارد، می‌توانید گواهی پرتال را از همان بگیرید. کامپیوترهای دامنه از قبل به آن اعتماد دارند و پخش با Group Policy لازم نیست. گواهی باید `portal.royaco.com` را در Subject Alternative Name داشته باشد. آن را با نام‌های `portal.crt` و `portal.key` در `/opt/roya-portal/ssl/` بگذارید و قدم ۳ را بزنید.

## بدون نام، فقط با IP

اگر نمی‌خواهید نامی در DNS بسازید، پرتال می‌تواند روی `https://192.168.0.21:8081` باشد:

1. گواهی را فقط با IP بسازید: `sudo bash /opt/roya-portal/current/deploy/make-cert.sh 192.168.0.21`
2. گواهی CA را مثل قدم ۲ پخش کنید (رکورد DNS لازم نیست).
3. فایل nginx پرتال را با نمونهٔ آماده عوض کنید:
   ```bash
   cp /etc/nginx/sites-available/roya-portal ~/roya-portal.nginx.bak
   sudo cp /opt/roya-portal/current/deploy/nginx-https.conf.example /etc/nginx/sites-available/roya-portal
   sudo nginx -t && sudo systemctl reload nginx
   ```
4. در `/opt/roya-portal/.env` بگذارید `APP_URL=https://192.168.0.21:8081`، `COOKIE_SECURE=true` و `TRUST_PROXY=true`، و `pm2 restart roya-portal` را بزنید.

برای برگرداندن، فایل `~/roya-portal.nginx.bak` را سر جایش بگذارید، nginx را reload کنید و در `.env` مقدار `APP_URL` را به `http://...` و `COOKIE_SECURE` را به `false` برگردانید.

## بعد از HTTPS: ورود با AD

حالا مسیر مرورگر تا پرتال امن است. مسیر پرتال تا DC هم بهتر است رمزنگاری شود: اگر روی DC گواهی هست، در [AD-LOGIN.md](AD-LOGIN.md) از `ldaps://...:636` استفاده کنید.
