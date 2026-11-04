<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>جلسات رفع اشکال</title>
    <link rel="stylesheet" href="../public/css/output.css">
    <style>
        .circle {
            width: 1.5rem;
            height: 1.5rem;
            border-radius: 9999px;
            border: 2px solid #d1d5db;
            background-color: white;
            display: inline-block;
            cursor: pointer;
            transition: all 0.2s;
        }
        .circle.checked {
            background-color: #10b981;
            border-color: #10b981;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='white' viewBox='0 0 24 24'%3E%3Cpath d='M20 6L9 17l-5-5' stroke='white' stroke-width='2' fill='none'/%3E%3C/svg%3E");
            background-size: 14px;
            background-position: center;
            background-repeat: no-repeat;
        }
        .tab-button {
            padding: 0.625rem 1.25rem;
            border-radius: 0.75rem;
            font-weight: 500;
            transition: all 0.2s;
            color: #4b5563;
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
        .time-input {
            padding: 0.25rem 0.5rem;
            border: 1px solid #d1d5db;
            border-radius: 0.5rem;
            font-size: 0.875rem;
            width: 90px;
        }
        .time-input:focus {
            border-color: #445D84;
            outline: none;
            ring: 2px #445D84;
        }
        .delete-btn {
            background: none;
            border: none;
            cursor: pointer;
            color: #ef4444;
            font-size: 1.2rem;
            font-weight: bold;
            padding: 0 0.25rem;
            transition: color 0.2s;
        }
        .delete-btn:hover {
            color: #b91c1c;
        }
    </style>
</head>
<body class="bg-gray-50">

<header class="bg-white shadow-sm border-b border-gray-100 px-6 py-4 flex justify-end">
    <a href="dashboard" class="inline-flex items-center gap-2 bg-[#445D84] text-white px-5 py-2 rounded-xl hover:bg-[#3a4f72] transition shadow-md text-sm font-medium">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/></svg>
        صفحه نوبت‌دهی
    </a>
</header>

<div class="max-w-7xl mx-auto px-4 py-8">
    <div class="flex justify-between items-center mb-6 flex-wrap gap-4">
        <h1 class="text-2xl md:text-3xl font-bold text-[#445D84] flex items-center gap-2">
            <svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/></svg>
            جلسات رفع اشکال
        </h1>
        <button id="createSessionBtn" class="bg-[#445D84] text-white px-5 py-2.5 rounded-xl hover:bg-[#3a4f72] transition shadow-md flex items-center gap-2 font-medium">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            ایجاد هفته جدید
        </button>
    </div>

    <div id="sessionsContainer" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
        <?php if (!empty($sessions)): ?>
            <?php foreach ($sessions as $s): ?>
                <div class="session-card bg-white rounded-2xl shadow-md hover:shadow-xl transition-all cursor-pointer border border-gray-100 p-5" data-session-id="<?= $s['id'] ?>">
                    <div class="font-bold text-lg text-gray-800 mb-1"><?= htmlspecialchars($s['title']) ?></div>
                    <div class="text-sm text-gray-500 flex items-center gap-2">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>
                        <?= htmlspecialchars($s['start_date']) ?> تا <?= htmlspecialchars($s['end_date']) ?>
                    </div>
                </div>
            <?php endforeach; ?>
        <?php else: ?>
            <p class="text-gray-500 col-span-full text-center py-10">هنوز هیچ جلسه‌ای ایجاد نشده است.</p>
        <?php endif; ?>
    </div>

    <div id="sessionDetail" class="hidden mt-8 bg-white rounded-2xl shadow-lg p-6"></div>
</div>

<!-- مودال ایجاد جلسه -->
<div id="sessionModal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 hidden">
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md relative p-6">
        <button id="closeSessionModal" class="absolute left-4 top-4 text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        <h3 class="text-xl font-bold text-gray-800 mb-4">ایجاد جلسه جدید</h3>
        <div class="space-y-4">
            <div>
                <label class="block text-gray-700 mb-1 text-sm">عنوان جلسه</label>
                <input type="text" id="sessionTitle" placeholder="مثلاً هفته اول اسفند" class="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:border-[#445D84] focus:ring-2">
            </div>
            <div>
                <label class="block text-gray-700 mb-1 text-sm">تاریخ شروع (YYYY-MM-DD)</label>
                <input type="text" id="sessionStartDate" placeholder="۱۴۰۴-۱۲-۰۱" class="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl">
            </div>
            <div>
                <label class="block text-gray-700 mb-1 text-sm">تاریخ پایان (YYYY-MM-DD)</label>
                <input type="text" id="sessionEndDate" placeholder="۱۴۰۴-۱۲-۰۵" class="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl">
            </div>
            <button id="submitSessionBtn" class="w-full bg-[#445D84] text-white py-2.5 rounded-xl hover:bg-[#3a4f72] transition font-medium">ایجاد</button>
        </div>
    </div>
</div>

<!-- مودال افزودن دانش‌آموز به جلسه -->
<div id="addStudentModal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 hidden">
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md relative p-6">
        <button id="closeAddStudentModal" class="absolute left-4 top-4 text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        <h3 class="text-xl font-bold text-gray-800 mb-4">افزودن دانش‌آموز</h3>
        <div class="space-y-4">
            <div>
                <label class="block text-gray-700 mb-1 text-sm">شناسه دانش‌آموز</label>
                <input type="number" id="newStudentId" placeholder="شناسه عددی" class="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl">
            </div>
            <button id="submitAddStudent" class="w-full bg-[#445D84] text-white py-2.5 rounded-xl hover:bg-[#3a4f72] transition font-medium">افزودن</button>
        </div>
    </div>
</div>
<!-- قبل از </body> در remedial.php -->
<script src="/public/js/attendance-manager.js"></script>
<script>
document.addEventListener('DOMContentLoaded', () => {
    const sessionsContainer = document.getElementById('sessionsContainer');
    const createSessionBtn = document.getElementById('createSessionBtn');
    const sessionModal = document.getElementById('sessionModal');
    const closeSessionModal = document.getElementById('closeSessionModal');
    const submitSessionBtn = document.getElementById('submitSessionBtn');
    const detailDiv = document.getElementById('sessionDetail');
    let currentSessionId = null;
    let currentData = null;

    // مودال افزودن دانش‌آموز
    const addStudentModal = document.getElementById('addStudentModal');
    const closeAddStudentModal = document.getElementById('closeAddStudentModal');
    const submitAddStudent = document.getElementById('submitAddStudent');
    const newStudentIdInput = document.getElementById('newStudentId');

    createSessionBtn.addEventListener('click', () => sessionModal.classList.remove('hidden'));
    closeSessionModal.addEventListener('click', () => sessionModal.classList.add('hidden'));
    sessionModal.addEventListener('click', (e) => { if(e.target === sessionModal) sessionModal.classList.add('hidden'); });

    submitSessionBtn.addEventListener('click', async () => {
        const title = document.getElementById('sessionTitle').value.trim();
        const start = document.getElementById('sessionStartDate').value.trim();
        const end   = document.getElementById('sessionEndDate').value.trim();
        if (!title || !start || !end) return alert('همه فیلدها الزامی هستند.');
        const res = await fetch('remedial/createSession', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ title, start_date: start, end_date: end })
        });
        const result = await res.json();
        if (result.success) location.reload();
        else alert('خطا: ' + (result.error || ''));
    });

    document.querySelectorAll('.session-card').forEach(card => {
        card.addEventListener('click', async function() {
            const id = this.dataset.sessionId;
            currentSessionId = id;
            const res = await fetch(`remedial/getSessionData?session_id=${id}`);
            const data = await res.json();
            if (data.error) return alert(data.error);
            renderSessionDetail(data);
        });
    });

    // مدیریت تغییرات زمان
    detailDiv.addEventListener('change', async (e) => {
        const input = e.target;
        if (!input.matches('.time-input')) return;
        const sessionId = parseInt(input.dataset.sessionId);
        const studentId = parseInt(input.dataset.studentId);
        const field = input.dataset.field;
        const value = input.value || null;
        try {
            const res = await fetch('remedial/updateStudentTime', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId, student_id: studentId, field, value })
            });
            const result = await res.json();
            if (!result.success) alert('خطا در ذخیره زمان');
        } catch (err) {
            console.error(err);
            alert('خطا در ارتباط با سرور');
        }
    });

    // مدیریت کلیک روی دکمه‌های حذف و افزودن (delegation)
    detailDiv.addEventListener('click', async (e) => {
        // دکمه حذف کلاس
        const removeClassBtn = e.target.closest('.remove-class-btn');
        if (removeClassBtn) {
            e.stopPropagation();
            const classId = parseInt(removeClassBtn.dataset.classId);
            const sessionId = parseInt(removeClassBtn.dataset.sessionId);
            if (!confirm('این کلاس از جلسه حذف شود؟')) return;
            try {
                const res = await fetch('remedial/deleteClass', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ class_id: classId, session_id: sessionId })
                });
                if (res.ok) {
                    // رفرش تب فعال
                    refreshCurrentTab();
                }
            } catch (err) {
                alert('خطا در حذف کلاس');
                console.error(err);
            }
            return;
        }

        // دکمه حذف دانش‌آموز
        const removeStudentBtn = e.target.closest('.remove-student-btn');
        if (removeStudentBtn) {
            e.stopPropagation();
            const studentId = parseInt(removeStudentBtn.dataset.studentId);
            const sessionId = parseInt(removeStudentBtn.dataset.sessionId);
            if (!confirm('از حذف این دانش‌آموز از جلسه مطمئن هستید؟')) return;
            try {
                const res = await fetch('remedial/removeStudentFromSession', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ student_id: studentId, session_id: sessionId })
                });
                if (res.ok) {
                    refreshCurrentTab();
                }
            } catch (err) {
                alert('خطا در حذف دانش‌آموز');
                console.error(err);
            }
            return;
        }

        // دکمه افزودن دانش‌آموز (در هدر جدول)
        const addStudentBtn = e.target.closest('.add-student-to-session-btn');
        if (addStudentBtn) {
            e.stopPropagation();
            const sessionId = parseInt(addStudentBtn.dataset.sessionId);
            // باز کردن مودال افزودن
            currentSessionId = sessionId; // اطمینان
            addStudentModal.classList.remove('hidden');
            newStudentIdInput.value = '';
            newStudentIdInput.focus();
            return;
        }
    });

    // رویداد دکمه‌های مودال افزودن
    closeAddStudentModal.addEventListener('click', () => addStudentModal.classList.add('hidden'));
    addStudentModal.addEventListener('click', (e) => { if(e.target === addStudentModal) addStudentModal.classList.add('hidden'); });

    submitAddStudent.addEventListener('click', async () => {
        const studentId = parseInt(newStudentIdInput.value);
        if (!studentId || !currentSessionId) {
            alert('لطفاً شناسه معتبر وارد کنید.');
            return;
        }
        try {
            const res = await fetch('remedial/addStudentToSession', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ session_id: currentSessionId, student_id: studentId })
            });
            const result = await res.json();
            if (result.success) {
                addStudentModal.classList.add('hidden');
                refreshCurrentTab();
            } else {
                alert(result.error || 'خطا در افزودن دانش‌آموز');
            }
        } catch (err) {
            alert('خطا در ارتباط با سرور');
            console.error(err);
        }
    });

    function refreshCurrentTab() {
        if (!currentData || !currentSessionId) return;
        // پیدا کردن تب فعال
        const activeTab = document.querySelector('#tabNav .tab-button.active');
        if (activeTab) {
            const field = activeTab.textContent.trim();
            showAttendanceTable(field, currentData.tabs[field], currentSessionId);
        }
    }

    function renderSessionDetail(data) {
        currentData = data;
        const { session, tabs } = data;
        detailDiv.innerHTML = `
            <div class="border-b border-gray-200 pb-3 mb-4">
                <h2 class="text-xl font-bold text-gray-800">${session.title}</h2>
                <p class="text-gray-500 text-sm">${session.start_date} تا ${session.end_date}</p>
            </div>
            <div>
                <nav class="flex gap-2 mb-6 overflow-x-auto" id="tabNav"></nav>
                <div id="tabContent"></div>
            </div>
        `;
        detailDiv.classList.remove('hidden');
        const fields = Object.keys(tabs);
        const tabNav = document.getElementById('tabNav');
        fields.forEach((field, idx) => {
            const btn = document.createElement('button');
            btn.className = `tab-button ${idx === 0 ? 'active' : ''}`;
            btn.textContent = field;
            btn.onclick = () => {
                document.querySelectorAll('#tabNav .tab-button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                showAttendanceTable(field, tabs[field], session.id);
            };
            tabNav.appendChild(btn);
        });
        if (fields.length) showAttendanceTable(fields[0], tabs[fields[0]], session.id);
    }

    function showAttendanceTable(field, fieldData, sessionId) {
        const { students, classes } = fieldData;
        const studentTimes = currentData ? (currentData.studentTimes || {}) : {};

        let html = `<div class="flex justify-between items-center mb-4 flex-wrap gap-2">
            <button id="addClassBtn" class="bg-[#445D84] text-white px-4 py-2 rounded-xl text-sm hover:bg-[#3a4f72] transition flex items-center gap-2">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14"/></svg>
                افزودن کلاس به ${field}
            </button>
            <button class="add-student-to-session-btn bg-green-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-green-700 transition flex items-center gap-2" data-session-id="${sessionId}">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14"/></svg>
                افزودن دانش‌آموز
            </button>
        </div>`;

        html += `<div class="overflow-x-auto">
            <table class="min-w-full bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100">
                <thead class="bg-[#445D84] text-white">
                    <tr>
                        <th class="px-5 py-3 text-right">نام</th>
                        <th class="px-5 py-3 text-right">پایه</th>
                        <th class="px-5 py-3 text-right">ورود</th>
                        <th class="px-5 py-3 text-right">شروع آزمون</th>
                        <th class="px-5 py-3 text-right">پایان آزمون</th>
                        <th class="px-3 py-3 text-right"></th>`;

        classes.forEach(c => html += `<th class="px-5 py-3 text-right relative">
            ${c.class_name}
            <button class="remove-class-btn delete-btn absolute top-1 left-1" data-session-id="${sessionId}" data-class-id="${c.id}">×</button>
        </th>`);

        html += `</tr></thead><tbody>`;

        students.forEach(s => {
            const times = studentTimes[s.id] || {};
            const arrival = times.arrival_time || '';
            const examStart = times.exam_start_time || '';
            const examEnd = times.exam_end_time || '';

            html += `<tr class="border-b border-gray-100 hover:bg-gray-50">
                        <td class="px-5 py-3 font-medium">${s.name}</td>
                        <td class="px-5 py-3">${s.grade}</td>
                        <td class="px-2 py-3 text-center">
                            <input type="time" class="time-input" 
                                   data-session-id="${sessionId}" data-student-id="${s.id}" 
                                   data-field="arrival_time" value="${arrival}">
                        </td>
                        <td class="px-2 py-3 text-center">
                            <input type="time" class="time-input" 
                                   data-session-id="${sessionId}" data-student-id="${s.id}" 
                                   data-field="exam_start_time" value="${examStart}">
                        </td>
                        <td class="px-2 py-3 text-center">
                            <input type="time" class="time-input" 
                                   data-session-id="${sessionId}" data-student-id="${s.id}" 
                                   data-field="exam_end_time" value="${examEnd}">
                        </td>
                        <td class="px-2 py-3 text-center">
                            <button class="remove-student-btn delete-btn" data-session-id="${sessionId}" data-student-id="${s.id}">×</button>
                        </td>`;

            classes.forEach(c => {
                const attended = c.attendees.some(a => a == s.id);
                html += `<td class="px-5 py-3 text-center">
                            <span class="circle ${attended ? 'checked' : ''}" 
                                  data-session-id="${sessionId}" 
                                  data-class-id="${c.id}" 
                                  data-student-id="${s.id}" 
                                  data-checked="${attended ? 1 : 0}"></span>
                         </td>`;
            });
            html += `</tr>`;
        });

        html += `</tbody></table></div>`;
        document.getElementById('tabContent').innerHTML = html;

        // رویداد دایره‌های حضور
        document.querySelectorAll('.circle').forEach(circ => {
            circ.addEventListener('click', async function(e) {
                e.stopPropagation();
                const sid = parseInt(this.dataset.sessionId);
                const cid = parseInt(this.dataset.classId);
                const stId = parseInt(this.dataset.studentId);
                let checked = this.dataset.checked === '1';
                checked = !checked;
                this.dataset.checked = checked ? '1' : '0';
                this.classList.toggle('checked', checked);
                await fetch('remedial/toggleAttendance', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ session_id: sid, class_id: cid, student_id: stId, checked })
                });
            });
        });

        document.getElementById('addClassBtn')?.addEventListener('click', () => openAddClassModal(field));
    }

    // پیدا کن این تابع رو و جایگزین کن:
async function openAddClassModal(field) {
    const name = prompt('نام کلاس جدید:');
    if (!name) return;
    const res = await fetch('remedial/createClass', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ 
            field, 
            class_name: name,
            session_id: currentSessionId  // ← اضافه شد
        })
    });
    const result = await res.json();
    if (result.success && currentSessionId) {
        refreshCurrentTab();  // به جای کلیک مجدد روی card
    } else {
        alert('خطا در ایجاد کلاس');
    }
}
});
</script>
</body>
</html>