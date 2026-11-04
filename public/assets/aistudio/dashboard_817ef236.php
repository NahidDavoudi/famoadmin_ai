<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>پنل نوبت‌دهی</title>
    <link rel="stylesheet" href="../public/css/output.css">
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
                .cards-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 1rem;
            padding: 1.5rem 1rem;
        }
        @media (min-width: 640px) {
            .cards-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }
        @media (min-width: 768px) {
            .cards-grid {
                grid-template-columns: repeat(3, 1fr);
            }
        }
        @media (min-width: 1024px) {
            .cards-grid {
                grid-template-columns: repeat(4, 1fr);
            }
        }
        /* مخفی کردن پنل‌ها */
        .tab-panel.hidden {
            display: none;
        }
        .card-check {
            position: absolute;
            top: 0.75rem;
            right: 0.75rem;
            width: 1.5rem;
            height: 1.5rem;
            border-radius: 9999px;
            border: 2px solid #d1d5db;
            background-color: white;
            transition: all 0.2s;
            cursor: pointer;
            z-index: 10;
        }
        /* حالت انتخاب شده برای دایره */
        .student-card.selected .card-check {
            background-color: #445D84;
            border-color: #445D84;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='white' viewBox='0 0 24 24'%3E%3Cpath d='M20 6L9 17l-5-5' stroke='white' stroke-width='2' fill='none'/%3E%3C/svg%3E");
            background-size: 14px;
            background-position: center;
            background-repeat: no-repeat;
        }
        /* هایلایت کارت انتخاب شده */
        .student-card.selected {
            background-color: #f8fafc;
            border: 2px solid #445D84 !important;
            box-shadow: 0 4px 12px rgba(68, 93, 132, 0.15);
        }
        /* استایل تب‌ها (در صورت نیاز) */
        .tab-button {
            padding: 0.625rem 1.25rem;
            border-radius: 0.75rem;
            font-weight: 500;
            transition: all 0.2s;
            color: #4b5563;
            cursor: pointer;
        }
        .tab-button:hover {
            color: #445D84;
            background-color: #f3f4f6;
        }
        .tab-button.active {
            background-color: #445D84;
            color: white;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
        }
        .student-card {
            background-color: #ffffff;
            border-radius: 12px;
            padding: 1rem;
            border-width: 2px;
            border-style: solid;
            box-shadow: 0 1px 3px rgba(0,0,0,0.04);
            transition: box-shadow 0.2s;
        }
        .student-card:hover {
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            cursor: pointer;

        }

        /* رنگ‌های وضعیت */
        .student-card.accepted { border-color: #22c55e; }
        .student-card.rejected { border-color: #ef4444; }
        .student-card.pending  { border-color: #eab308; }
        .student-card.no-appointment { border-color: #d1d5db; }

        .card-body {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            margin-bottom: 0.75rem;
        }
        .card-avatar {
            width: 40px;
            height: 40px;
            color: #6b7280;
            flex-shrink: 0;
        }
        .card-info {
            flex: 1;
        }
        .card-name {
            font-weight: 600;
            font-size: 1rem;
            color: #1f2937;
            line-height: 1.3;
        }
        .card-meta {
            font-size: 0.75rem;
            color: #6b7280;
        }
        .card-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .appointment-date {
            font-size: 0.75rem;
            color: #4b5563;
        }
        .badge {
            display: inline-block;
            padding: 0.25rem 0.75rem;
            font-size: 0.75rem;
            font-weight: 500;
            border-radius: 9999px;
        }
        /* رنگ‌های بج */
        .badge.accepted { background-color: #dcfce7; color: #166534; }
        .badge.rejected { background-color: #fee2e2; color: #991b1b; }
        .badge.pending  { background-color: #fef9c3; color: #854d0e; }
        .badge.no-appointment { background-color: #f3f4f6; color: #374151; }

        .empty-message {
            text-align: center;
            color: #9ca3af;
            padding: 2rem;
        }
        /* سایر کلاس‌های کمکی */
        .hidden { display: none; }
    </style>
</head>
<body class="bg-gray-50 font-sans">

<header class="bg-white shadow-sm border-b border-gray-100 px-6 py-4 flex justify-end">
    <a href="remedial" class="inline-flex items-center gap-2 bg-[#445D84] text-white px-5 py-2 rounded-xl hover:bg-[#3a4f72] transition shadow-md text-sm font-medium">
        <i data-lucide="book-open" class="w-5 h-5"></i>
        صفحه حضور و غیاب
    </a>
</header>

<div class="max-w-7xl mx-auto px-4 py-8">
    <div class="bg-white rounded-2xl shadow-lg p-6">
        <!-- نویگیشن تب‌ها -->
        <nav class="flex gap-2 border-b border-gray-200 mb-6 overflow-x-auto pb-2" role="tablist" id="tabNav"></nav>
        <!-- محتوای تب‌ها (app.js کارت‌ها را در اینجا می‌سازد) -->
        <div id="tabsContent"></div>
    </div>
</div>

<!-- Toast برای انتخاب چندگانه -->
<div id="multiSelectToast" class="fixed bottom-6 right-1/2 translate-x-1/2 bg-[#445D84] text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-3 z-50 hidden">
    <span id="toastCount">0</span> دانش‌آموز
    <button id="toastActionBtn" class="bg-white text-[#445D84] px-4 py-1.5 rounded-full font-medium text-sm hover:bg-gray-100 transition">ثبت نوبت</button>
</div>

<!-- مودال ثبت نوبت -->
<div id="appointmentModal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 hidden">
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md relative p-6">
        <button id="closeModalBtn" class="absolute left-4 top-4 text-gray-400 hover:text-gray-600 transition p-1">
            <i data-lucide="x" class="w-5 h-5"></i>
        </button>
        <div class="text-center mb-4">
            <i data-lucide="calendar-plus" class="w-12 h-12 text-[#445D84] mx-auto"></i>
        </div>
        <h3 class="text-xl font-bold text-gray-800 text-center mb-1">ثبت نوبت جدید</h3>
        <p id="modalStudentName" class="text-gray-500 text-center text-sm mb-4">نام دانش‌آموز</p>
        <input type="hidden" id="modalStudentId" />
        <input type="hidden" id="modalDateHidden" />
        <div class="space-y-4">
            <div>
                <label class="block text-gray-700 mb-1 text-sm font-medium">تاریخ</label>
                <input type="text" id="modalDate" class="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:border-[#445D84] focus:ring-2 focus:ring-[#445D84]/20 transition" placeholder="30 اردیبهشت">
            </div>
            <div>
                <label class="block text-gray-700 mb-1 text-sm font-medium">ساعت شروع</label>
                <input type="text" id="modalTime" class="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:border-[#445D84] focus:ring-2 focus:ring-[#445D84]/20 transition" placeholder="10:30">
            </div>
            <button id="submitAppointmentBtn" class="w-full bg-gradient-to-r from-[#445D84] to-[#5a779e] text-white py-3 rounded-xl font-medium hover:shadow-lg transition flex items-center justify-center gap-2">
                <i data-lucide="check" class="w-4 h-4"></i>
                ثبت نوبت
            </button>
        </div>
    </div>
</div>

<script>
    window.__INITIAL_TABS__ = <?= $initialJson ?: 'null' ?>;
</script>
<script src="../public/js/app.js"></script>
<script>
    // اطمینان از ایجاد آیکون‌ها بعد از بارگذاری
    document.addEventListener('DOMContentLoaded', function() {
        if (typeof lucide !== 'undefined') lucide.createIcons();
    });
</script>
</body>
</html>