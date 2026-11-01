# پنل مدیریت آموزشگاه فامو (نسخه React + TypeScript)

این پروژه نسخه بازنویسی‌شده پنل مدیریت آموزشگاه فامو با استفاده از **React 19**، **TypeScript**، **Vite 6** و **Tailwind CSS v4** است که مستقیماً به سرور اصلی `https://api.famoacademy.ir/api/v1` متصل می‌شود.

---

## ۱. پیش‌نیازها

برای اجرای پروژه روی سیستم لوکال یا سرور بیلد، به موارد زیر نیاز دارید:
- **Node.js** نسخه `18.x` یا بالاتر (پیشنهادی: `20 LTS` یا `22 LTS`)
- **npm** نسخه `9.x` یا بالاتر

برای بررسی نصب بودن آن‌ها:
```bash
node -v
npm -v
```

---

## ۲. نصب و راه‌اندازی در محیط توسعه (Local Development)

### گام اول: نصب پکیج‌ها
در پوشه اصلی پروژه دستور زیر را اجرا کنید:
```bash
npm install
```

### گام دوم: تنظیم متغیرهای محیطی (اختیاری)
به‌صورت پیش‌فرض، پروژه بدون نیاز به فایل `.env` به آدرس `https://api.famoacademy.ir/api/v1` متصل می‌شود.
اگر قصد تغییر آدرس API یا سایت اصلی را دارید، یک فایل `.env` از روی `.env.example` بسازید:

```bash
cp .env.example .env
```

محتوای فایل `.env`:
```env
VITE_API_BASE=https://api.famoacademy.ir/api/v1
VITE_MAIN_SITE_URL=https://famoacademy.ir
```

### گام سوم: اجرای سرور توسعه
```bash
npm run dev
```
سپس پنل در آدرس زیر در دسترس خواهد بود:
```
http://localhost:3000
```

---

## ۳. نحوه احراز هویت و ورود به پنل

پنل مدیریت از دو روش استاندارد فامو برای احراز هویت با `api.famoacademy.ir` استفاده می‌کند:
1. **توکن JWT (`famo_jwt`)**:
   - هنگامی که ادمین از سایت اصلی (`famoacademy.ir/#loginModal`) وارد می‌شود و با پارامتر `?token=YOUR_JWT_TOKEN` به پنل هدایت می‌شود، پنل به‌صورت خودکار توکن را در `localStorage` با کلید `famo_jwt` ذخیره کرده و توکن را از نوار آدرس مرورگر پاک می‌کند.
   - تمام درخواست‌ها با هدر `Authorization: Bearer <token>` به سرور ارسال می‌شوند.
2. **کوکی نشست (`credentials: 'include'`)**:
   - در صورتی که پنل روی ساب‌دامنه رسمی (مثلاً `admin.famoacademy.ir` یا مسیر `/admin`) میزبانی شود، کوکی‌های `HttpOnly` دامنه `.famoacademy.ir` نیز به‌صورت خودکار همراه درخواست‌ها ارسال می‌شوند.

> **نکته CORS در محیط لوکال**: سرور `api.famoacademy.ir` دارای بررسی امنیتی Origin/CORS است. برای اینکه درخواست‌ها بدون خطای CORS/CSRF پذیرفته شوند، پنل باید روی دامنه/ساب‌دامنه مجاز در تنظیمات سرور (`famoacademy.ir`) قرار گیرد یا در زمان توسعه لوکال، آدرس `http://localhost:3000` در لیست سفید CORS بک‌اند قرار داشته باشد.

---

## ۴. بیلد گرفتن و استقرار روی سرور (Production Deployment)

از آنجایی که این پروژه یک **Single Page Application (SPA)** استاتیک است، خروجی بیلد آن شامل فایل‌های استاتیک (`HTML/CSS/JS`) در پوشه `dist` خواهد بود و روی هر وب‌سروری (Nginx، Caddy، Apache، Cloudflare Pages یا هاست اشتراکی/cPanel) قابل میزبانی است.

### ساخت نسخه نهایی (Build)
```bash
npm run build
```
پس از اتمام این دستور، پوشه `dist/` ساخته می‌شود.

### پیش‌نمایش نسخه بیلد شده روی سیستم
```bash
npm run preview
```

### نمونه کانفیگ Caddy (پیشنهادی، مشابه سرور فعلی فامو)
```caddyfile
admin.famoacademy.ir {
    root * /var/www/famo-admin/dist
    encode gzip zstd
    try_files {path} /index.html
    file_server
}
```

### نمونه کانفیگ Nginx
```nginx
server {
    listen 80;
    server_name admin.famoacademy.ir;
    root /var/www/famo-admin/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## ۵. دستورات پرکاربرد (Scripts)

| دستور | کاربرد |
|---|---|
| `npm run dev` | اجرای پروژه در حالت توسعه روی پورت `3000` |
| `npm run build` | تولید نسخه پروداکشن در پوشه `dist/` |
| `npm run preview` | اجرای پیش‌نمایش نسخه بیلد شده |
| `npm run lint` | بررسی صحت تایپ‌های TypeScript (`tsc --noEmit`) |
| `npx tsx --test src/lib/logic.test.ts` | اجرای تست‌های واحد (تبدیل تاریخ شمسی، فرمول درصد کنکور و اعتبارسنجی‌ها) |

---

## ۶. ساختار پوشه‌ها و فایل‌ها

```text
├── index.html                  # فایل HTML اصلی (راست‌به‌چپ + فونت وزیرمتن)
├── package.json                # وابستگی‌ها و اسکریپت‌های پروژه
├── vite.config.ts              # تنظیمات Vite و Tailwind CSS v4
├── tsconfig.json               # تنظیمات TypeScript
├── .env.example                # نمونه متغیرهای محیطی
└── src/
    ├── main.tsx                # نقطه ورود React
    ├── App.tsx                 # شل اصلی برنامه، مسیریابی صفحات و میانبرهای کیبورد
    ├── index.css               # استایل‌های سراسری و متغیرهای رنگ فامو
    ├── types.ts                # تایپ‌ها و اینترفیس‌های TypeScript
    ├── lib/
    │   ├── api.ts              # کلاینت ارتباط مستقیم با api.famoacademy.ir/api/v1
    │   ├── jalali.ts           # توابع تبدیل تاریخ میلادی و شمسی (جلالی)
    │   ├── exam-math.ts        # محاسبه نمره منفی کنکور و اعتبارسنجی موبایل/کدملی
    │   └── logic.test.ts       # تست‌های واحد منطق برنامه
    ├── components/
    │   ├── Sidebar.tsx         # منوی کناری دسکتاپ و هدر موبایل
    │   ├── Modal.tsx           # کامپوننت مودال با Focus Trap و بستن با کلید Esc
    │   ├── ConfirmModal.tsx    # مودال تایید حذف و عملیات حساس
    │   ├── ToastStack.tsx      # نمایش پیام‌های وضعیت (Toast)
    │   └── Charts.tsx          # نمودارهای SVG بومی (ستونی، خطی و دایره‌ای)
    └── pages/
        ├── OverviewPage.tsx    # داشبورد و آمار کلی
        ├── StudentsPage.tsx    # مدیریت دانش‌آموزان، فیلترها و صفحه‌بندی
        ├── CoursesPage.tsx     # مدیریت دوره‌ها
        ├── InstructorsPage.tsx # مدیریت اساتید
        ├── ExamsPage.tsx       # مشاهده نتایج آزمون‌ها (۳ سطحی)
        ├── ExamEntryPage.tsx   # ثبت نتایج آزمون با محاسبه زنده درصد
        ├── FilesPage.tsx       # آپلود و مدیریت فایل‌های آزمون
        ├── SupportersPage.tsx  # مدیریت پشتیبان‌ها
        ├── BlogPage.tsx        # مدیریت وبلاگ و ویرایشگر متن غنی (WYSIWYG)
        └── ReportsPage.tsx     # تحلیل و نمودار روند روزانه گزارش‌ها
```
