# Omnia Workspace — مشروع مستقل بالكامل

نسخة مستقلة من تطبيق **Omnia Workspace** كانت تعمل داخل منصة Sekai. تم فصل الواجهة والخادم والبيانات بالكامل، مع الحفاظ على نفس التصميم وكل الصفحات والأزرار والوظائف (الرئيسية، الملفات، الجدول، الملاحظات، الورد اليومي، المظهر، اللغة، تسجيل الدخول/الخروج).

> **لا يوجد أي اعتماد على Sekai**: لا سكربتات، لا `save-share`، لا CDN، لا خوادم، لا `postMessage` إلى منصة. الشعار والخطوط والألوان كلها محلية داخل المشروع.

---

## 1) ما الذي تغيّر بالضبط؟

| العنصر | قبل (Sekai) | بعد (مستقل) |
|---|---|---|
| استضافة الواجهة | iframe داخل `sekai.ai` | يخدمها خادمك مباشرة |
| حفظ البيانات | `save-share.v1` عبر جسر Sekai | `PostgreSQL` (Supabase) عبر `/api/workspace` |
| تسجيل الدخول | كلمة مرور ثابتة `xxxx` داخل الواجهة | حسابات حقيقية + `bcrypt` + جلسة `JWT` في كوكي `httpOnly` |
| الملفات | `dataUrl` (Base64) داخل JSON | Supabase Storage (bucket خاص) + جدول `files` |
| الشعار | رابط CDN تابع لـ Sekai | `public/assets/logo.webp` |
| التصميم | — | **لم يتغيّر** (نفس CSS ونفس العناصر) |

تمت إضافة حقل **البريد الإلكتروني** وزر **إنشاء حساب جديد** إلى شاشة الدخول فقط، لأن الحسابات الحقيقية تحتاج بريداً. كل ما عدا ذلك بقي كما هو.

---

## 2) البنية

```
omnia-workspace/
├─ public/                 # الواجهة (نفس التصميم الأصلي)
│  ├─ index.html           # التطبيق كامل (HTML+CSS+JS)
│  ├─ app-bridge.js        # بديل جسر Sekai (تخزين/مصادقة/ملفات)
│  └─ assets/logo.webp
├─ server/
│  ├─ index.js             # Express: يخدم الواجهة + API
│  ├─ config.js            # متغيرات البيئة
│  ├─ db.js                # اتصال PostgreSQL (Supabase)
│  ├─ auth.js              # JWT + كوكي httpOnly
│  ├─ storage.js           # Supabase Storage (أو قرص محلي للاختبار)
│  ├─ schema.sql           # جداول users/workspaces/files/backups + RLS
│  ├─ migrate.js           # تنفيذ المخطط
│  ├─ backup-cli.js        # نسخة احتياطية يدوية/مجدولة
│  └─ routes/              # auth / workspace / files / backup
├─ supabase-storage.sql    # إنشاء Buckets الخاصة
├─ render.yaml             # نشر تلقائي على Render
├─ .env.example
└─ package.json
```

### واجهات API

| Method | Path | الوظيفة |
|---|---|---|
| POST | `/api/auth/register` | إنشاء حساب (اسم، بريد، كلمة مرور) |
| POST | `/api/auth/login` | تسجيل الدخول |
| POST | `/api/auth/logout` | تسجيل الخروج |
| GET | `/api/auth/me` | التحقق من الجلسة |
| POST | `/api/auth/change-password` | تغيير كلمة المرور |
| GET/PUT | `/api/workspace` | تحميل/حفظ كل بيانات المستخدم |
| GET | `/api/files` | قائمة الملفات |
| POST | `/api/files` | رفع ملف (multipart) |
| GET | `/api/files/:id/download` | تنزيل (يتحقق من الملكية) |
| DELETE | `/api/files/:id` | حذف |
| GET | `/api/backup/export` | تصدير بيانات المستخدم JSON |
| POST | `/api/backup/cron` | نسخة احتياطية كاملة (محمية بـ `BACKUP_SECRET`) |
| GET | `/healthz` | فحص الصحة |

---

## 3) التشغيل محلياً

```bash
cd omnia-workspace
cp .env.example .env      # ثم عدّل القيم
npm install
npm run migrate           # ينشئ الجداول
npm start                 # http://localhost:3000
```

للتشغيل المحلي بدون Supabase استخدم:

```env
STORAGE_DRIVER=local
DATA_DIR=./data
DATABASE_URL=postgresql://omnia:omnia_local_pw@127.0.0.1:5432/omnia
COOKIE_SECURE=false
```

---

## 4) إعداد Supabase (قاعدة البيانات + التخزين)

1. أنشئ مشروعاً جديداً على <https://supabase.com> (الخطة المجانية تكفي للبداية).
2. من **SQL Editor** نفّذ محتوى `server/schema.sql` ثم `supabase-storage.sql`.
3. من **Project Settings → Database → Connection string → URI** انسخ رابط الاتصال (يفضّل *Session pooler*) وضعه في `DATABASE_URL` مع `?sslmode=require`.
4. من **Project Settings → API** انسخ:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (سرّي، لا يوضع في الواجهة أبداً).
5. تأكد أن الـ Buckets `workspace-files` و`workspace-backups` **خاصة (Private)**.

> الجداول عليها `Row Level Security` مفعّل بدون سياسات عامة، أي أن مفتاح `anon` لا يستطيع قراءتها. الخادم فقط (service role) يصل إليها.

---

## 5) النشر على Render (استضافة دائمة 24/7)

### الطريقة السريعة (Blueprint)
1. ارفع المشروع إلى GitHub.
2. Render → **New → Blueprint** → اختر المستودع → سيقرأ `render.yaml`.
3. أدخل القيم السرية عند الطلب: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
4. اضغط **Deploy**. سيصبح الرابط الدائم مثل: `https://omnia-workspace.onrender.com`.

### الطريقة اليدوية
- **New → Web Service** → Node
- Build: `npm ci --omit=dev`
- Start: `npm start`
- Health check: `/healthz`
- أضف نفس متغيرات البيئة من `.env.example`.

**مهم:** خطة Render المجانية تُنيم الخدمة بعد 15 دقيقة خمول. للحصول على تشغيل مستمر 24/7 استخدم خطة **Starter**.

---

## 6) ربط دومين خاص عبر Cloudflare

1. اشترِ الدومين (أو استخدم دوميناً موجوداً) وأضفه إلى Cloudflare.
2. في Render: **Settings → Custom Domains → Add Custom Domain** وأدخل `app.yourdomain.com`.
3. في Cloudflare → DNS أضف:
   - `CNAME` للاسم `app` إلى `omnia-workspace.onrender.com` (Proxy: **DNS only** أثناء التحقق، ثم يمكن تفعيل Proxy).
4. انتظر شهادة TLS من Render (تلقائية). بعدها الموقع يعمل على دومينك.
5. لا تضع أي مفتاح Supabase في Cloudflare أو في الواجهة.

---

## 7) النسخ الاحتياطي

- **تصدير يدوي لكل مستخدم:** `GET /api/backup/export` (من داخل التطبيق بعد الدخول).
- **نسخة كاملة يومية:** وظيفة `omnia-daily-backup` في `render.yaml` تشغّل `node server/backup-cli.js` كل يوم 02:00 UTC وترفع JSON إلى bucket `workspace-backups`، مع الاحتفاظ بآخر 30 نسخة.
- **بديل بدون Render Cron:** استخدم <https://cron-job.org> لاستدعاء:
  ```
  POST https://your-app.onrender.com/api/backup/cron
  Header: x-backup-secret: <BACKUP_SECRET>
  ```
- **نسخة قاعدة البيانات الكاملة (اختياري):** من Supabase → Database → Backups (الخطة المدفوعة)، أو `pg_dump "$DATABASE_URL" > backup.sql`.
- ملفات المستخدمين نفسها محفوظة في Supabase Storage؛ نسخها متاح من Supabase → Storage، أو عبر `supabase storage cp`.

---

## 8) الأمان

- كلمات المرور مُخزّنة بـ `bcrypt` (12 rounds) — لا تُخزّن أبداً كنص.
- الجلسة `JWT` داخل كوكي `httpOnly` + `SameSite=Lax` + `Secure` في الإنتاج.
- كل استعلامات SQL مُعاملة (parameterized) — لا حقن SQL.
- كل عملية على ملف تتحقق من `user_id` (لا يمكن لمستخدم تنزيل/حذف ملف غيره).
- `helmet` + `Content-Security-Policy` + تحديد معدل الطلبات على المصادقة.
- لا مفاتيح سرية في الواجهة؛ `SUPABASE_SERVICE_ROLE_KEY` موجود فقط في بيئة الخادم.
- RLS مفعّل على الجداول.

---

## 9) التكلفة والحدود (تقديرية)

| الخدمة | الخطة | التكلفة | ملاحظات |
|---|---|---|---|
| Render Web Service | Free | 0$ | تنام بعد 15 دقيقة خمول — **ليست 24/7** |
| Render Web Service | **Starter** | **~7$/شهر** | تشغيل مستمر 24/7، 512MB RAM |
| Render Cron Job | Starter | ~1$/شهر أو حسب الاستخدام | للنسخ الاحتياطي اليومي |
| Supabase | Free | 0$ | 500MB قاعدة بيانات، 1GB تخزين، يتوقف المشروع بعد أسبوع بلا نشاط |
| Supabase | Pro | ~25$/شهر | 8GB قاعدة، 100GB تخزين، نسخ احتياطي يومي |
| Cloudflare | Free | 0$ | DNS + TLS + حماية |
| الدومين | — | ~10–15$/سنة | حسب المزوّد |

**حدود مضبوطة في الكود:**
- أقصى حجم للملف الواحد: **25MB** (`MAX_UPLOAD_BYTES`).
- أقصى حجم لبيانات مساحة العمل (JSON): **5MB** (`MAX_WORKSPACE_BYTES`).
- مدة الجلسة: **7 أيام** (`JWT_EXPIRES_IN`).
- الاحتفاظ بالنسخ الاحتياطية: **30 نسخة**.

---

## 10) ما تم اختباره فعلياً (وليس ادّعاءً)

تم تشغيل المشروع محلياً على **PostgreSQL حقيقي** واختبار التالي بنجاح:

- ✅ تسجيل حساب جديد عبر الواجهة (المتصفح) ثم الدخول إلى مساحة العمل.
- ✅ تسجيل الخروج ثم الدخول مجدداً.
- ✅ رفض كلمة المرور الخاطئة (401) ورفض البريد المكرر (409).
- ✅ حفظ بيانات مساحة العمل (ملاحظات/جدول/ورد/مظهر) واسترجاعها.
- ✅ إضافة ملاحظة من الواجهة، ثم **إعادة تحميل الصفحة** — بقيت الملاحظة والجلسة.
- ✅ **إعادة تشغيل الخادم** — بقيت البيانات في قاعدة البيانات.
- ✅ رفع ملف PDF، تنزيله (69 بايت مطابقة)، حذفه.
- ✅ منع تنزيل الملف بدون جلسة (401).
- ✅ تصدير نسخة احتياطية JSON ونسخة كاملة مجدولة.
- ✅ عدم وجود أي طلب شبكة خارجي إلى Sekai (`performance` أظهر صفر طلبات خارجية).
- ✅ الشعار يُحمّل محلياً (1080px) وبدون `<base>`.

**ما لم يُختبر بعد:** النشر الفعلي على حسابك في Supabase/Render، لأنه يتطلب مفاتيح حسابك. الكود جاهز ومُختبَر محلياً، والخطوات أعلاه هي المتبقية.

---

## 11) ملاحظات مهمة

- لا تحذف `server/schema.sql` قبل تنفيذه في Supabase.
- عند تغيير `JWT_SECRET` تُلغى كل الجلسات الحالية (وهذا سلوك أمني مقصود).
- إذا أردت لاحقاً إضافة استعادة كلمة المرور بالبريد، يمكن ربط Supabase Auth أو خدمة بريد مثل Resend؛ البنية الحالية تدعم ذلك دون تغيير الواجهة.
- الملفات القديمة التي كانت محفوظة كـ `dataUrl` داخل Sekai لن تُنقل تلقائياً؛ إن وُجدت بيانات قديمة يمكن تصديرها من Sekai ثم استيرادها عبر سكربت بسيط.
