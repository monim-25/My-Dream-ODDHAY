const fs = require('fs');

const coursesEjs = `<!DOCTYPE html>
<html class="light" lang="bn">
<head>
    <title>কোর্স লাইব্রেরি | অধ্যায়</title>
    <%- include('partials/head') %>
    <style>
        .reveal { opacity: 0; transform: translateY(20px); transition: all 0.6s cubic-bezier(0.22, 1, 0.36, 1); }
        .reveal.active { opacity: 1; transform: translateY(0); }
        .course-card:hover { transform: translateY(-8px); }
    </style>
</head>
<body class="bg-[#F8FAFC] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 min-h-screen font-sans">
    <%- include('partials/nav') %>

    <main class="relative pt-32 pb-24 overflow-hidden">
        <div class="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px] translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
        <div class="relative z-10 max-w-7xl mx-auto px-6">
            <div class="text-center mb-16 reveal">
                <div class="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-primary/10 text-primary font-bold text-xs mb-6 border border-primary/20 uppercase tracking-widest">
                    <span class="material-symbols-outlined text-lg">auto_awesome</span> প্রিমিয়াম লার্নিং এক্সপেরিয়েন্স
                </div>
                <h1 class="text-4xl md:text-6xl font-black tracking-tight mb-6 leading-tight">আপনার পছন্দের <span class="bg-gradient-to-r from-primary to-indigo-500 bg-clip-text text-transparent">কোর্স</span> খুঁজে নিন</h1>
                <p class="text-slate-500 dark:text-slate-400 font-medium text-lg max-w-2xl mx-auto leading-relaxed">সেরা মেন্টরদের নির্দেশনায় নিজেকে তৈরি করুন আগামীর জন্য। আমাদের প্রতিটি কোর্স সাজানো হয়েছে আপনার সর্বোচ্চ সফলতার কথা মাথায় রেখে।</p>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-12 gap-10">
                <aside class="lg:col-span-3 space-y-6 reveal">
                    <div class="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-200/50 dark:border-slate-800/50 shadow-sm">
                        <h3 class="font-black text-xs uppercase tracking-widest mb-6 flex items-center gap-3 text-slate-400"><span class="material-symbols-outlined text-primary">search</span> অনুসন্ধান</h3>
                        <form action="/courses" method="GET" class="relative">
                            <input type="text" name="search" value="<%= search || '' %>" placeholder="কীওয়ার্ড দিন..." class="w-full pl-6 pr-14 h-14 bg-slate-50 dark:bg-slate-800 rounded-2xl border-transparent focus:ring-2 focus:ring-primary outline-none font-bold text-sm">
                            <button type="submit" class="absolute right-2 top-2 size-10 bg-primary text-white rounded-xl flex items-center justify-center transition-transform hover:scale-105"><span class="material-symbols-outlined">search</span></button>
                        </form>
                    </div>
                    <div class="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-200/50 dark:border-slate-800/50 shadow-sm">
                        <h3 class="font-black text-xs uppercase tracking-widest mb-6 flex items-center gap-3 text-slate-400"><span class="material-symbols-outlined text-primary">category</span> ক্যাটাগরি</h3>
                        <div class="space-y-2">
                            <a href="/courses" class="flex items-center justify-between p-4 rounded-2xl transition-all font-bold text-sm <%= (!activeCategory || activeCategory === 'all') ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800' %>">সবগুলো <span>All</span></a>
                            <% categories.forEach(function(cat) { %>
                                <a href="/courses?category=<%= cat %>" class="flex items-center justify-between p-4 rounded-2xl transition-all font-bold text-sm <%= activeCategory === cat ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800' %>"><%= cat %> <span class="material-symbols-outlined text-xs opacity-40">arrow_forward</span></a>
                            <% }); %>
                        </div>
                    </div>
                </aside>
                <div class="lg:col-span-9">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 reveal delay-200">
                        <% if (courses.length === 0) { %>
                            <div class="col-span-full py-32 text-center bg-white dark:bg-slate-900 rounded-[4rem] border-2 border-dashed border-slate-200">
                                <h2 class="text-2xl font-black mb-2">কোনো কোর্স পাওয়া যায়নি</h2>
                                <a href="/courses" class="btn-primary mt-4">সব কোর্স দেখুন</a>
                            </div>
                        <% } else { %>
                            <% courses.forEach(function(course) { 
                                var price = (course.plans && course.plans.length > 0) ? course.plans[0].price : 0;
                                var isFree = course.accessType === 'free' || price === 0;
                                var lessonCount = course.chapters ? course.chapters.reduce(function(acc, ch){ return acc + (ch.recordedClasses ? ch.recordedClasses.length : 0); }, 0) : 0;
                            %>
                                <div class="group course-card bg-white dark:bg-slate-900 rounded-[2.5rem] overflow-hidden border border-slate-200/50 dark:border-slate-800/50 shadow-sm hover:shadow-2xl transition-all flex flex-col cursor-pointer" onclick="window.location='/course-details/<%= course._id %>'">
                                    <div class="aspect-[16/9] relative overflow-hidden bg-slate-100 dark:bg-slate-800">
                                        <% if (course.thumbnail) { %><img src="<%= course.thumbnail %>" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" onerror="this.src='/images/course-placeholder.jpg'"><% } %>
                                        <div class="absolute top-5 left-5 flex gap-2">
                                            <span class="px-3 py-1 rounded-full bg-black/40 backdrop-blur-md text-white font-black text-[9px] uppercase tracking-widest"><%= course.classLevel %></span>
                                            <% if (isFree) { %><span class="px-3 py-1 rounded-full bg-emerald-500 text-white font-black text-[9px] uppercase tracking-widest shadow-lg shadow-emerald-500/20">Free</span><% } %>
                                        </div>
                                        <div class="absolute bottom-5 right-5"><span class="px-3 py-1 rounded-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm text-slate-900 dark:text-white font-black text-[9px] flex items-center gap-2"><span class="material-symbols-outlined text-sm text-primary">play_circle</span> <%= lessonCount %>+ লেসন</span></div>
                                    </div>
                                    <div class="p-8 flex-1 flex flex-col">
                                        <div class="flex items-center gap-2 mb-4">
                                            <span class="text-[10px] font-black text-primary uppercase tracking-[0.2em]"><%= course.category || 'সাধারণ' %></span>
                                        </div>
                                        <h3 class="text-xl font-black mb-6 text-slate-900 dark:text-white group-hover:text-primary transition-colors line-clamp-2 leading-tight flex-1"><%= course.title %></h3>
                                        <div class="flex items-center justify-between pt-6 border-t border-slate-50 dark:border-slate-800">
                                            <div>
                                                <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">কোর্স ফি</p>
                                                <p class="text-2xl font-black text-slate-900 dark:text-white"><%= isFree ? 'বিনামূল্যে' : '৳' + price.toLocaleString('bn-BD') %></p>
                                            </div>
                                            <button class="size-12 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all shadow-sm"><span class="material-symbols-outlined">arrow_forward</span></button>
                                        </div>
                                    </div>
                                </div>
                            <% }); %>
                        <% } %>
                    </div>
                </div>
            </div>
        </div>
    </main>
    <%- include('partials/footer') %>
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => entry.isIntersecting && entry.target.classList.add('active'));
            }, { threshold: 0.1 });
            document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
        });
    </script>
</body>
</html>`;

const detailsEjs = `<!DOCTYPE html>
<html class="light" lang="bn">
<head>
    <title><%= course.title %> | অধ্যায়</title>
    <%- include('partials/head') %>
    <style>
        .reveal { opacity: 0; transform: translateY(20px); transition: all 0.6s cubic-bezier(0.22, 1, 0.36, 1); }
        .reveal.active { opacity: 1; transform: translateY(0); }
        .glass-nav { backdrop-blur:md; background: rgba(255,255,255,0.7); }
        .dark .glass-nav { background: rgba(15,23,42,0.7); }
    </style>
</head>
<body class="bg-[#F8FAFC] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 min-h-screen">
    <%- include('partials/nav') %>
    <main class="relative">
        <!-- Hero -->
        <section class="relative bg-[#0F172A] pt-32 pb-24 overflow-hidden">
            <div class="absolute inset-0 opacity-20"><div class="absolute top-0 right-0 w-[600px] h-[600px] bg-primary rounded-full blur-[140px] translate-x-1/3 -translate-y-1/3"></div></div>
            <div class="max-w-7xl mx-auto px-6 relative z-10">
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                    <div class="reveal">
                        <div class="flex gap-2 mb-6">
                            <span class="px-3 py-1 rounded-full bg-primary/20 text-primary font-black text-[10px] uppercase border border-primary/20"><%= course.classLevel %></span>
                            <span class="px-3 py-1 rounded-full bg-white/10 text-white font-black text-[10px] uppercase border border-white/10"><%= course.category %></span>
                        </div>
                        <h1 class="text-4xl md:text-6xl font-black text-white mb-6 leading-tight"><%= course.title %></h1>
                        <p class="text-slate-400 text-lg mb-10 leading-relaxed max-w-xl"><%= course.description || 'এই কোর্সের মাধ্যমে আপনি আপনার কাঙ্ক্ষিত বিষয়টি অত্যন্ত সহজভাবে আয়ত্ত করতে পারবেন।' %></p>
                        <div class="flex items-center gap-10 text-white/80 mb-12">
                            <div class="flex items-center gap-2">
                                <span class="material-symbols-outlined text-primary">play_circle</span>
                                <span class="text-sm font-bold"><%= course.chapters ? course.chapters.reduce(function(acc, ch){ return acc + (ch.recordedClasses ? ch.recordedClasses.length : 0); }, 0) : 0 %> টি লেসন</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="material-symbols-outlined text-emerald-500">group</span>
                                <span class="text-sm font-bold"><%= course.enrollmentCount || 0 %>+ শিক্ষার্থী</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-6">
                            <% var pr = (course.plans && course.plans.length > 0) ? course.plans[0].price : 0; %>
                            <div>
                                <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 text-white/50">কোর্স ফি</p>
                                <p class="text-4xl font-black text-white">৳<%= pr.toLocaleString('bn-BD') %></p>
                            </div>
                            <a href="/checkout/<%= course._id %>" class="btn-primary !px-12 !py-4 !text-lg !rounded-2xl shadow-2xl shadow-primary/30">এনরোল করুন</a>
                        </div>
                    </div>
                    <div class="reveal delay-200">
                        <div class="relative rounded-[3rem] overflow-hidden border-8 border-white/5 shadow-2xl">
                            <% if (course.thumbnail) { %><img src="<%= course.thumbnail %>" class="w-full aspect-video object-cover"><% } else { %>
                                <div class="w-full aspect-video bg-slate-800 flex items-center justify-center"><span class="material-symbols-outlined text-7xl text-slate-700">school</span></div>
                            <% } %>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- Syllabus -->
        <section class="py-24 max-w-4xl mx-auto px-6">
            <div class="flex items-center gap-4 mb-12 reveal">
                <div class="size-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><span class="material-symbols-outlined text-3xl">menu_book</span></div>
                <h2 class="text-4xl font-black">কোর্স সিলেবাস</h2>
            </div>
            <div class="space-y-4 reveal delay-100">
                <% (course.chapters || []).forEach(function(chapter, idx) { %>
                    <div class="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-200/50 dark:border-slate-800/50 shadow-sm flex items-center justify-between group hover:border-primary/30 transition-all">
                        <div class="flex items-center gap-6">
                            <span class="size-10 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center font-black text-xs border border-slate-100 dark:border-slate-700 text-slate-400"><%= idx + 1 %></span>
                            <div>
                                <h4 class="font-black text-lg group-hover:text-primary transition-colors"><%= chapter.title %></h4>
                                <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1"><%= (chapter.recordedClasses || []).length %> টি ভিডিও ক্লাস</p>
                            </div>
                        </div>
                        <span class="material-symbols-outlined text-slate-300">chevron_right</span>
                    </div>
                <% }); %>
            </div>
        </section>
    </main>
    <%- include('partials/footer') %>
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => entry.isIntersecting && entry.target.classList.add('active'));
            }, { threshold: 0.1 });
            document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
        });
    </script>
</body>
</html>`;

const playerEjs = `<!DOCTYPE html>
<html class="light" lang="bn">
<head>
    <title><%= course.title %> — প্লেয়ার | অধ্যায়</title>
    <%- include('partials/head') %>
    <style>
        .player-area { aspect-ratio: 16/9; }
        .sidebar-item.active { background: rgba(19, 127, 236, 0.1); border-right: 4px solid #137fec; color: #137fec; }
    </style>
</head>
<body class="bg-[#F8FAFC] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 h-screen overflow-hidden flex flex-col font-sans">
    <%- include('partials/nav') %>
    <div class="flex-1 flex flex-col lg:flex-row overflow-hidden pt-16">
        <!-- Main Player -->
        <main class="flex-1 flex flex-col overflow-y-auto no-scrollbar">
            <div class="bg-black player-area sticky top-0 z-10 shadow-2xl shadow-primary/5">
                <iframe id="main-video" class="w-full h-full" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>
            </div>
            <div class="p-10 max-w-4xl mx-auto w-full">
                <div class="mb-10">
                    <div class="flex items-center gap-2 mb-4 text-[10px] font-black uppercase text-primary tracking-widest">
                        <span class="px-2 py-0.5 rounded bg-primary/10 border border-primary/10"><%= course.category %></span>
                    </div>
                    <h1 id="lesson-title" class="text-3xl lg:text-4xl font-black mb-6 leading-tight">ভীডিও সিলেক্ট করুন</h1>
                    <div class="h-1 w-20 bg-primary rounded-full"></div>
                </div>
                <div class="prose dark:prose-invert max-w-none text-slate-500 dark:text-slate-400">
                    <p class="leading-loose">এই লেসনের মাধ্যমে আমরা বিস্তারিতভাবে আলোচনা করবো। লেকচার শেষে নিচে দেওয়া কুইজ এবং স্টাডি মেটেরিয়ালগুলো দেখে নিন।</p>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
                    <div class="p-8 rounded-[2rem] bg-indigo-500/5 border border-indigo-500/10 hover:border-indigo-500/30 transition-all group cursor-pointer">
                        <span class="material-symbols-outlined text-3xl text-indigo-500 mb-4">description</span>
                        <h4 class="font-black text-lg">লেকচার নোটস</h4>
                        <p class="text-xs text-slate-400 mt-2">পিডিএফ ফরমেটে ডাউনলোড করুন</p>
                    </div>
                    <div class="p-8 rounded-[2rem] bg-emerald-500/5 border border-emerald-500/10 hover:border-emerald-500/30 transition-all group cursor-pointer">
                        <span class="material-symbols-outlined text-3xl text-emerald-500 mb-4">quiz</span>
                        <h4 class="font-black text-lg">কুইজ পরীক্ষা</h4>
                        <p class="text-xs text-slate-400 mt-2">লেসন শেষ করে পরীক্ষা দিন</p>
                    </div>
                </div>
            </div>
        </main>
        <!-- Sidebar -->
        <aside class="w-full lg:w-[420px] bg-white dark:bg-slate-950 border-l border-slate-200/50 dark:border-slate-800/50 flex flex-col h-full shadow-2xl">
            <div class="p-8 border-b border-slate-100 dark:border-slate-800">
                <h2 class="text-xl font-black mb-2">কোর্স কন্টেন্ট</h2>
                <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest"><%= course.title %></p>
            </div>
            <div class="flex-1 overflow-y-auto pt-4 pb-10">
                <% (course.chapters || []).forEach(function(chapter, chipIdx) { %>
                    <div class="mb-6">
                        <div class="px-8 py-3 bg-slate-50/50 dark:bg-slate-800/50 text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                            <span class="size-5 rounded bg-primary/10 text-primary flex items-center justify-center text-[9px]"><%= chipIdx + 1 %></span> <%= chapter.title %>
                        </div>
                        <div class="mt-2">
                            <% (chapter.recordedClasses || []).forEach(function(lesson) { %>
                                <button onclick="playLesson('<%= lesson.videoUrl %>', '<%= lesson.title %>', this)" class="lesson-btn w-full px-8 py-5 flex items-start gap-4 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all border-r-4 border-transparent text-left group">
                                    <div class="size-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-primary transition-all shrink-0"><span class="material-symbols-outlined text-xl">play_circle</span></div>
                                    <div class="flex-1">
                                        <h5 class="text-sm font-bold group-hover:text-slate-900 dark:group-hover:text-white transition-colors"><%= lesson.title %></h5>
                                        <span class="text-[9px] font-black text-slate-400 uppercase mt-1 inline-block">15:00 Mins</span>
                                    </div>
                                </button>
                            <% }); %>
                        </div>
                    </div>
                <% }); %>
            </div>
        </aside>
    </div>
    <script>
        function playLesson(url, title, btn) {
            const iframe = document.getElementById('main-video');
            iframe.src = url.replace('vimeo.com', 'player.vimeo.com/video');
            document.getElementById('lesson-title').innerText = title;
            document.querySelectorAll('.lesson-btn').forEach(b => b.classList.remove('active'));
            if(btn) btn.classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        document.addEventListener('DOMContentLoaded', function() {
            const first = document.querySelector('.lesson-btn');
            if(first) first.click();
        });
    </script>
</body>
</html>`;

fs.writeFileSync('f:/oddhay/client/views/courses.ejs', coursesEjs);
fs.writeFileSync('f:/oddhay/client/views/course-details.ejs', detailsEjs);
fs.writeFileSync('f:/oddhay/client/views/lesson-player.ejs', playerEjs);
console.log('Premium UI Rebuild Complete for all pages!');
