const fs = require('fs');

const content = \`<!DOCTYPE html>
<html lang="bn" class="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>অধ্যায় | ড্যাশবোর্ড</title>
    
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Hind+Siliguri:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    fontFamily: { sans: ['Outfit', 'Hind Siliguri', 'sans-serif'] },
                    colors: { 
                        primary: '#137fec',
                        darkBg: '#020617',
                        darkCard: '#0f172a'
                    }
                }
            }
        }
    </script>

    <style>
        * { font-style: normal !important; box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Hind Siliguri', 'Outfit', sans-serif; overflow: hidden; height: 100vh; height: 100dvh; background: #F8FAFC; }
        .dark body { background: #020617; }

        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        .app-container { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
        .main-wrapper { display: flex; flex: 1; overflow: hidden; position: relative; }
        
        .sidebar-panel { width: 280px; height: 100%; border-right: 1px solid rgba(0,0,0,0.05); display: flex; flex-direction: column; background: #fff; z-index: 200; transition: transform 0.3s ease; }
        .dark .sidebar-panel { background: #0F172A; border-color: rgba(255,255,255,0.05); }
        .sidebar-content { flex: 1; overflow-y: auto; padding: 0 0.75rem; }
        
        .content-panel { flex: 1; overflow-y: auto; padding: 2rem; scroll-behavior: smooth; background: #F8FAFC; }
        .dark .content-panel { background: #020617; }

        .nav-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 1rem; font-weight: 700; font-size: 14px; transition: all 0.3s ease; color: #64748b; margin-bottom: 2px; }
        .nav-item:hover { background: #F1F5F9; color: #137fec; }
        .dark .nav-item:hover { background: #1E293B; color: #60a5fa; }
        .nav-active { background: #EFF6FF; color: #137fec; }
        .dark .nav-active { background: rgba(19, 127, 236, 0.1); color: #60a5fa; }

        .glass-card { background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.5); border-radius: 2.25rem; }
        .dark .glass-card { background: rgba(15, 23, 42, 0.7); border-color: rgba(255,255,255,0.05); }

        .app-header { height: 72px; border-bottom: 1px solid rgba(0,0,0,0.05); background: rgba(255,255,255,0.9); backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: space-between; z-index: 150; padding: 0 2rem; flex-shrink: 0; }
        .dark .app-header { background: rgba(2, 6, 23, 0.9); border-color: rgba(255,255,255,0.05); }

        .services-grid-box { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; width: 100%; }
        @media (max-width: 1024px) { .services-grid-box { grid-template-columns: repeat(3, 1fr); } }

        .service-card-mini { background: #fff; border: 1px solid rgba(19, 127, 236, 0.05); border-radius: 1rem; padding: 0.75rem 0.4rem; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; transition: all 0.3s ease; box-shadow: 0 2px 10px rgba(0,0,0,0.02); }
        .dark .service-card-mini { background: #0F172A; border-color: rgba(255,255,255,0.05); }
        .service-card-mini:hover { transform: translateY(-3px); border-color: #137fec; }

        .service-icon-box-mini { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; }

        .progress-bar-animated { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #137fec, #60a5fa); position: relative; overflow: hidden; }
        .progress-bar-animated::after { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent); animation: progress-shimmer 2s infinite; }
        @keyframes progress-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }

        @media (max-width: 1024px) {
            .sidebar-panel { position: fixed; top: 0; left: 0; height: 100dvh; transform: translateX(-100%); width: 280px; z-index: 300; }
            .sidebar-open .sidebar-panel { transform: translateX(0); }
            .sidebar-overlay { position: fixed; inset: 0; background: rgba(2, 6, 23, 0.4); backdrop-filter: blur(4px); z-index: 250; display: none; }
            .sidebar-open .sidebar-overlay { display: block; }
            .app-header { padding: 0 1rem; height: 60px; }
            .content-panel { padding: 1.25rem; padding-bottom: 110px; }
        }

        .reveal { opacity: 0; transform: translateY(10px); animation: revealIn 0.5s ease forwards; }
        @keyframes revealIn { to { opacity: 1; transform: translateY(0); } }
    </style>
</head>
<body class="dark:text-white">
    <div class="app-container">
        <header class="app-header">
            <div class="flex items-center gap-6">
                <button onclick="toggleSidebar()" class="lg:hidden size-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 active:scale-95">
                    <span class="material-symbols-rounded font-bold text-slate-600 dark:text-slate-300">menu</span>
                </button>
                <div class="hidden lg:flex items-center gap-2">
                    <div class="size-8 bg-primary rounded-lg flex items-center justify-center text-white scale-110 shadow-lg shadow-primary/20">
                        <span class="material-symbols-rounded text-lg">school</span>
                    </div>
                    <span class="text-xl font-black tracking-tighter uppercase dark:text-white">ODDHAY</span>
                </div>
            </div>
            <div class="flex items-center gap-3">
                <button onclick="toggleTheme()" class="size-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
                    <span class="material-symbols-rounded dark:hidden">dark_mode</span>
                    <span class="material-symbols-rounded hidden dark:block text-amber-400">light_mode</span>
                </button>
                <div class="h-5 w-px bg-slate-200 dark:bg-slate-800 mx-1"></div>
                <button class="size-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <span class="material-symbols-rounded">notifications</span>
                </button>
                <a href="/profile" class="size-9 rounded-full overflow-hidden border-2 border-white dark:border-slate-700 shadow-sm transition-transform hover:scale-110">
                    <img src="<%= user.profileImage || 'https://ui-avatars.com/api/?name=' + user.name + '&background=random' %>" class="w-full h-full object-cover">
                </a>
            </div>
        </header>

        <div class="main-wrapper">
            <div class="sidebar-overlay" onclick="toggleSidebar()"></div>
            <aside class="sidebar-panel">
                <div class="sidebar-content no-scrollbar mt-6 lg:mt-8">
                    <nav class="space-y-0.5">
                        <a href="/dashboard" class="nav-item nav-active"><span class="material-symbols-rounded">dashboard</span> ড্যাশবোর্ড</a>
                        <a href="/courses" class="nav-item"><span class="material-symbols-rounded">play_circle</span> ক্লাসসমূহ</a>
                        <a href="/routine" class="nav-item"><span class="material-symbols-rounded">event_note</span> রুটিন ও প্ল্যান</a>
                        <a href="/analytics" class="nav-item"><span class="material-symbols-rounded">analytics</span> প্রগ্রেস রিপোর্ট</a>
                        <a href="/notes" class="nav-item"><span class="material-symbols-rounded">description</span> লেকচার নোটস</a>
                        <a href="/messages" class="nav-item"><span class="material-symbols-rounded">forum</span> মেসেঞ্জার</a>
                        <a href="/library" class="nav-item"><span class="material-symbols-rounded">local_library</span> লাইব্রেরি</a>
                    </nav>
                </div>
                <div class="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-[#0F172A]">
                    <a href="/logout" class="flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all font-black text-sm">
                        <span class="material-symbols-rounded">logout</span> সাইন আউট
                    </a>
                </div>
            </aside>

            <main class="content-panel no-scrollbar">
                <div class="max-w-[1240px] mx-auto space-y-8">
                    <div class="reveal">
                        <h1 class="text-3xl md:text-4xl font-black text-slate-800 dark:text-white mb-2 line-clamp-1">স্বাগতম, <%= user.name %>! 👋</h1>
                        <p class="text-slate-500 dark:text-slate-400 font-bold text-sm md:text-base">পড়াশোনাকে আনন্দের সাথে গ্রহণ করো।</p>
                    </div>

                    <div class="reveal">
                        <div class="services-grid-box">
                            <% const menus = [ { i: 'play_circle', t: 'ক্লাস', l: '/courses', c: 'bg-primary' }, { i: 'edit_document', t: 'এক্সাম', l: '/exams', c: 'bg-rose-500' }, { i: 'description', t: 'নোটস', l: '/notes', c: 'bg-amber-500' }, { i: 'smart_toy', t: 'AI টিউটর', l: '/ai-chat', c: 'bg-indigo-500' }, { i: 'local_library', t: 'লাইব্রেরি', l: '/library', c: 'bg-sky-500' }, { i: 'book', t: 'ব্যাংক', l: '#', c: 'bg-orange-500' } ]; %>
                            <% menus.forEach(m => { %>
                                <a href="<%= m.l %>" class="service-card-mini group">
                                    <div class="service-icon-box-mini <%= m.c %> shadow-md group-hover:scale-110 transition-transform"><span class="material-symbols-rounded text-base md:text-lg"><%= m.i %></span></div>
                                    <span class="text-[10px] md:text-[11px] font-black text-slate-700 dark:text-slate-300 leading-tight"><%= m.t %></span>
                                </a>
                            <% }) %>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        <div class="lg:col-span-8 space-y-8">
                            <% if(typeof priorityAlert !== 'undefined' && priorityAlert) { %>
                                <div class="reveal relative bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2rem] p-6 flex items-center gap-6 overflow-hidden shadow-sm">
                                    <div class="absolute left-0 top-0 bottom-0 w-1.5 bg-rose-500 animate-pulse"></div>
                                    <div class="size-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0 dark:bg-rose-500/10"><span class="material-symbols-rounded text-2xl font-black"><%= priorityAlert.type === 'exam' ? 'edit_document' : 'notifications_active' %></span></div>
                                    <div class="flex-1">
                                        <h4 class="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em] mb-1">প্রাইওরিটি এলার্ট</h4>
                                        <p class="text-sm md:text-base font-bold text-slate-700 dark:text-slate-300">আপনার <span class="text-rose-500 font-black">'<%= priorityAlert.title %>'</span> আজ <%= priorityAlert.time %> টায়। <a href="/routine" class="text-primary font-black ml-1 uppercase text-[11px] tracking-widest">এখনই দেখুন &rarr;</a></p>
                                    </div>
                                </div>
                            <% } else { %>
                                <div class="reveal relative bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2rem] p-6 flex items-center gap-6 overflow-hidden shadow-sm">
                                    <div class="absolute left-0 top-0 bottom-0 w-1.5 bg-primary animate-pulse"></div>
                                    <div class="size-12 rounded-2xl bg-blue-50 text-primary flex items-center justify-center shrink-0 dark:bg-primary/10"><span class="material-symbols-rounded text-2xl">campaign</span></div>
                                    <div class="flex-1">
                                        <h4 class="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1">জেনারেল আপডেট</h4>
                                        <p class="text-sm md:text-base font-bold text-slate-700 dark:text-slate-300">নতুন লেকচার নোটস আপলোড করা হয়েছে। <a href="/notes" class="text-primary font-black ml-1">সংগ্রহ করুন &rarr;</a></p>
                                    </div>
                                </div>
                            <% } %>

                            <% if(user.lastWatchedLesson) { %>
                                <div class="reveal relative h-52 rounded-[2.5rem] bg-slate-900 border border-slate-800 overflow-hidden shadow-2xl group cursor-pointer" onclick="location.href='/course-details/<%= user.lastWatchedLesson.course?._id %>'">
                                    <img src="<%= user.lastWatchedLesson.course?.thumbnail %>" class="absolute inset-0 w-full h-full object-cover opacity-30 group-hover:scale-105 transition-transform duration-1000">
                                    <div class="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
                                    <div class="relative h-full p-8 flex items-end justify-between">
                                        <div><span class="px-3 py-1 bg-primary/20 backdrop-blur-md text-primary text-[10px] font-black rounded-full border border-primary/20 uppercase tracking-[0.2em] mb-4 inline-block">CONTINUE WATCHING</span><h3 class="text-2xl font-black text-white line-clamp-1"><%= user.lastWatchedLesson.lessonTitle %></h3></div>
                                        <div class="size-16 bg-white rounded-full flex items-center justify-center text-slate-900 shadow-2xl group-hover:scale-110 transition-transform"><span class="material-symbols-rounded text-4xl">play_arrow</span></div>
                                    </div>
                                </div>
                            <% } %>
                        </div>

                        <div class="lg:col-span-4 h-full">
                            <div class="reveal glass-card p-8 h-full bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 shadow-sm border border-slate-100/50 flex flex-col justify-between">
                                <div class="flex items-center gap-5">
                                    <div class="size-14 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center shadow-inner"><span class="material-symbols-rounded text-3xl font-black">token</span></div>
                                    <div><p class="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Global Learn XP</p><p class="text-3xl font-black dark:text-white mt-1"><%= (user.quizResults || []).reduce((a, b) => a + (b.score || 0), 0) * 10 %></p></div>
                                </div>
                                <div class="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800"><span class="text-[10px] font-black text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1 rounded-lg w-fit mb-3 block">+১৫% গ্রোথ</span><h3 class="text-xl font-black text-slate-800 dark:text-white mb-2">চমৎকার অগ্রগতি!</h3><p class="text-sm font-bold text-slate-500 dark:text-slate-400 leading-relaxed">আপনি গত সপ্তাহের তুলনায় ৬ ঘণ্টা বেশি সময় পড়াশোনা করেছেন।</p></div>
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div class="reveal glass-card p-8 space-y-8 shadow-sm border border-slate-100/50">
                            <h3 class="text-xl font-black flex items-center gap-3 dark:text-white"><span class="material-symbols-rounded text-primary">auto_awesome</span> আজকের টার্গেট</h3>
                            <div class="space-y-4" id="target-checklist">
                                <% if(typeof todayTasks !== 'undefined' && todayTasks && todayTasks.length > 0) { %>
                                    <% todayTasks.forEach((task) => { %>
                                        <div id="task-card-<%= task._id %>" class="task-card flex items-center gap-4 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border-2 border-transparent hover:border-primary/10 transition-all cursor-pointer" onclick="toggleTask('<%= task._id %>')">
                                            <div id="check-<%= task._id %>" class="size-6 rounded-lg border-2 <%= task.isCompleted ? 'bg-primary border-primary' : 'border-slate-300 dark:border-slate-600' %> flex items-center justify-center bg-white dark:bg-slate-800 transition-colors"><span class="material-symbols-rounded text-white text-sm font-black <%= task.isCompleted ? '' : 'hidden' %>" id="icon-<%= task._id %>">check</span></div>
                                            <span id="text-<%= task._id %>" class="text-base font-black text-slate-700 dark:text-slate-300 <%= task.isCompleted ? 'line-through opacity-40' : '' %> transition-all"><%= task.title %></span>
                                        </div>
                                    <% }) %>
                                <% } else { %>
                                    <div class="text-center py-10 opacity-40"><span class="material-symbols-rounded text-5xl mb-2">event_available</span><p class="text-sm font-black text-slate-500">আজকের জন্য কোনো টাস্ক সেট করা নেই</p><a href="/routine" class="text-primary text-xs mt-2 inline-block hover:underline">রুটিন থেকে যোগ করুন &rarr;</a></div>
                                <% } %>
                            </div>
                        </div>

                        <div class="reveal glass-card p-8 space-y-8 shadow-sm border border-slate-100/50"><div class="flex items-center justify-between"><h3 class="text-xl font-black flex items-center gap-3 dark:text-white"><span class="material-symbols-rounded text-rose-500">pie_chart</span> সিলেবাসের প্রগতি</h3><a href="/analytics" class="text-[10px] font-black text-primary hover:underline">বিস্তারিত &rarr;</a></div><div class="space-y-8"><% [ { s: 'গণিত', p: 85 }, { s: 'পদার্থবিজ্ঞান', p: 60 } ].forEach(item => { %><div class="space-y-3"><div class="flex justify-between items-center px-1"><span class="text-[11px] font-black text-slate-400 uppercase tracking-widest"><%= item.s %></span><span class="text-sm font-black text-primary"><%= item.p %>%</span></div><div class="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-[2px] shadow-sm"><div class="progress-bar-animated h-full rounded-full" style="width: <%= item.p %>%"></div></div></div><% }) %></div></div>
                    </div>

                    <div class="reveal glass-card p-10 shadow-sm border border-slate-100/50"><div class="flex items-center justify-between mb-8"><h3 class="text-2xl font-black dark:text-white flex items-center gap-3"><span class="material-symbols-rounded text-amber-500">schedule</span> আসন্ন রুটিন ও প্ল্যান</h3><a href="/routine" class="px-6 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-black hover:bg-primary hover:text-white transition-all">সবগুলো দেখুন &rarr;</a></div><div class="grid grid-cols-1 md:grid-cols-3 gap-6"><% if(typeof upcomingTasks !== 'undefined' && upcomingTasks && upcomingTasks.length > 0) { %><% upcomingTasks.forEach(task => { %><div class="p-6 rounded-[2rem] bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/50 flex flex-col gap-4"><div class="flex items-start justify-between"><div class="size-12 rounded-2xl bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center text-amber-500"><span class="material-symbols-rounded"><%= task.type === 'exam' ? 'edit_document' : 'event' %></span></div><span class="px-3 py-1 bg-amber-500/10 text-amber-500 text-[9px] font-black rounded-lg uppercase tracking-widest"><%= task.time %></span></div><div><h5 class="font-black text-slate-800 dark:text-white mb-1"><%= task.title %></h5><p class="text-[10px] font-bold text-slate-400"><%= new Date(task.date).toLocaleDateString('bn-BD', { weekday: 'long', month: 'long', day: 'numeric' }) %></p></div></div><% }) %><% } else { %><div class="col-span-3 text-center py-10 opacity-30 italic font-bold">কোনো আসন্ন টাস্ক পাওয়া যায়নি</div><% } %></div></div>

                    <div class="reveal glass-card p-10 shadow-sm border border-slate-100/50"><h3 class="text-2xl font-black dark:text-white flex items-center gap-3 mb-10"><span class="material-symbols-rounded text-primary text-3xl">analytics</span> লার্নিং গ্রাফ</h3><div class="h-96 w-full relative"><canvas id="interactiveChart"></canvas></div></div>
                </div>
            </main>
        </div>

        <nav class="fixed bottom-0 left-0 right-0 h-16 bg-white/95 dark:bg-[#0F172A]/95 border-t border-slate-100 dark:border-slate-800 flex items-center justify-around lg:hidden z-[300] pb-safe backdrop-blur-md shadow-2xl"><a href="/dashboard" class="flex flex-col items-center text-primary"><span class="material-symbols-rounded font-bold text-2xl">home</span><span class="text-[9px] font-black uppercase tracking-tight mt-0.5">হোম</span></a><a href="/courses" class="flex flex-col items-center text-slate-400"><span class="material-symbols-rounded text-2xl">play_circle</span><span class="text-[9px] font-black uppercase tracking-tight mt-0.5">ক্লাস</span></a><a href="/messages" class="flex flex-col items-center text-slate-400"><span class="material-symbols-rounded text-2xl">forum</span><span class="text-[9px] font-black uppercase tracking-tight mt-0.5">মেসেজ</span></a><a href="/profile" class="flex flex-col items-center text-slate-400"><span class="material-symbols-rounded text-2xl">person</span><span class="text-[9px] font-black uppercase tracking-tight mt-0.5">প্রোফাইল</span></a></nav>
    </div>

    <script>
        function toggleSidebar() { document.body.classList.toggle('sidebar-open'); }
        function toggleTheme() { const html = document.documentElement; if (html.classList.contains('dark')) { html.classList.remove('dark'); localStorage.setItem('theme', 'light'); } else { html.classList.add('dark'); localStorage.setItem('theme', 'dark'); } }
        async function toggleTask(taskId) { try { const response = await fetch(\`/routine/toggle/\${taskId}\`, { method: 'POST', headers: { 'Accept': 'application/json' } }); const data = await response.json(); if (data.success) { const check = document.getElementById(\`check-\${taskId}\`); const icon = document.getElementById(\`icon-\${taskId}\`); const text = document.getElementById(\`text-\${taskId}\`); const card = document.getElementById(\`task-card-\${taskId}\`); if (data.isCompleted) { check.classList.add('bg-primary', 'border-primary'); check.classList.remove('border-slate-300', 'dark:border-slate-600'); icon.classList.remove('hidden'); text.classList.add('line-through', 'opacity-40'); card.parentElement.appendChild(card); } else { check.classList.remove('bg-primary', 'border-primary'); check.classList.add('border-slate-300', 'dark:border-slate-600'); icon.classList.add('hidden'); text.classList.remove('line-through', 'opacity-40'); card.parentElement.prepend(card); } } } catch (e) { console.error('Toggle error:', e); } }
        document.addEventListener('DOMContentLoaded', () => {
            const chartCtx = document.getElementById('interactiveChart')?.getContext('2d');
            if (chartCtx) {
                const gradient = chartCtx.createLinearGradient(0, 0, 0, 400); gradient.addColorStop(0, 'rgba(19, 127, 236, 0.25)'); gradient.addColorStop(1, 'rgba(19, 127, 236, 0)');
                new Chart(chartCtx, { type: 'line', data: { labels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], datasets: [{ data: [45, 95, 70, 120, 110, 145, 170], borderColor: '#137fec', backgroundColor: gradient, fill: true, tension: 0.45, borderWidth: 6, pointRadius: 5, pointBackgroundColor: '#fff', pointBorderColor: '#137fec', pointBorderWidth: 4, pointHoverRadius: 8 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1e293b', padding: 12, cornerRadius: 16 } }, scales: { y: { display: false }, x: { grid: { display: false }, ticks: { font: { family: 'Outfit', weight: '900', size: 10 }, color: '#94a3b8' } } } } });
            }
            if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) { document.documentElement.classList.add('dark'); }
        });
    </script>
</body>
</html>\`;

fs.writeFileSync('f:/oddhay/client/views/dashboard-unified.ejs', content);
console.log('Done!');
`;

fs.writeFileSync('f:/oddhay/v_dashboard_perfect_flow.js', content);
