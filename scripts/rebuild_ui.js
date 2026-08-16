const fs = require('fs');

const coursesPremium = `<!DOCTYPE html>
<html class="light" lang="bn">
<head>
    <title>কোর্স লাইব্রেরি | অধ্যায়</title>
    <%- include('partials/head') %>
    <style>
        .reveal { opacity: 0; transform: translateY(20px); transition: all 0.6s cubic-bezier(0.22, 1, 0.36, 1); }
        .reveal.active { opacity: 1; transform: translateY(0); }
        .course-card:hover { transform: translateY(-8px); }
        .glass-sidebar { backdrop-blur:xl; background: rgba(255, 255, 255, 0.8); }
        .dark .glass-sidebar { background: rgba(15, 23, 42, 0.8); }
    </style>
</head>
<body class="bg-[#F8FAFC] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 min-h-screen font-sans">
    <%- include('partials/nav') %>

    <main class="relative pt-32 pb-24 overflow-hidden">
        <!-- Decoration -->
        <div class="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px] translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
        <div class="absolute top-1/2 left-0 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[100px] -translate-x-1/2 pointer-events-none"></div>

        <div class="relative z-10 max-w-7xl mx-auto px-6">
            <!-- Hero Section -->
            <div class="text-center mb-16 reveal">
                <div class="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-primary/10 text-primary font-bold text-xs mb-6 border border-primary/20 uppercase tracking-widest">
                    <span class="material-symbols-outlined text-lg">auto_awesome</span> প্রিমিয়াম লার্নিং এক্সপেরিয়েন্স
                </div>
                <h1 class="text-4xl md:text-6xl font-black tracking-tight mb-6 leading-tight">
                    আপনার পছন্দের <span class="bg-gradient-to-r from-primary to-indigo-500 bg-clip-text text-transparent">কোর্স</span> খুঁজে নিন
                </h1>
                <p class="text-slate-500 dark:text-slate-400 font-medium text-lg max-w-2xl mx-auto leading-relaxed">
                    সেরা মেন্টরদের নির্দেশনায় নিজেকে তৈরি করুন আগামীর জন্য। আমাদের প্রতিটি কোর্স সাজানো হয়েছে আপনার সর্বোচ্চ সফলতার কথা মাথায় রেখে।
                </p>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-12 gap-10">
                <!-- Sidebar Filters -->
                <aside class="lg:col-span-3 space-y-6 reveal">
                    <!-- Search Card -->
                    <div class="bg-white dark:bg-slate-900/50 rounded-[2.5rem] p-8 border border-slate-200/50 dark:border-slate-800/50 shadow-sm backdrop-blur-sm">
                        <h3 class="font-black text-xs uppercase tracking-widest mb-6 flex items-center gap-3 text-slate-400">
                            <span class="material-symbols-outlined text-primary">search</span> অনুসন্ধান
                        </h3>
                        <form action="/courses" method="GET" class="relative">
                            <input type="text" name="search" value="<%= search || '' %>" placeholder="কীওয়ার্ড দিন..." 
                                class="w-full pl-6 pr-14 h-14 bg-slate-50 dark:bg-slate-800 rounded-2xl border-transparent focus:ring-2 focus:ring-primary focus:bg-white dark:focus:bg-slate-700 outline-none transition-all font-bold text-sm">
                            <button type="submit" class="absolute right-2 top-2 size-10 bg-primary text-white rounded-xl flex items-center justify-center hover:scale-105 transition-transform">
                                <span class="material-symbols-outlined">search</span>
                            </button>
                        </form>
                    </div>

                    <!-- Category Card -->
                    <div class="bg-white dark:bg-slate-900/50 rounded-[2.5rem] p-8 border border-slate-200/50 dark:border-slate-800/50 shadow-sm backdrop-blur-sm">
                        <h3 class="font-black text-xs uppercase tracking-widest mb-6 flex items-center gap-3 text-slate-400">
                            <span class="material-symbols-outlined text-primary">category</span> ক্যাটাগরি
                        </h3>
                        <div class="space-y-2">
                            <a href="/courses" class="flex items-center justify-between p-4 rounded-2xl transition-all font-bold text-sm <%= (!activeCategory || activeCategory === 'all') ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800' %>">
                                সবগুলো <span>All</span>
                            </a>
                            <% categories.forEach(function(cat) { %>
                                <a href="/courses?category=<%= cat %>" class="flex items-center justify-between p-4 rounded-2xl transition-all font-bold text-sm <%= activeCategory === cat ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800' %>">
                                    <%= cat %> <span class="material-symbols-outlined text-xs opacity-40">arrow_forward</span>
                                </a>
                            <% }); %>
                        </div>
                    </div>

                    <!-- Class Level Card -->
                    <div class="bg-white dark:bg-slate-900/50 rounded-[2.5rem] p-8 border border-slate-200/50 dark:border-slate-800/50 shadow-sm backdrop-blur-sm">
                        <h3 class="font-black text-xs uppercase tracking-widest mb-6 flex items-center gap-3 text-slate-400">
                            <span class="material-symbols-outlined text-primary">layers</span> ক্লাস বা স্তর
                        </h3>
                        <form action="/courses" method="GET" id="level-form">
                            <input type="hidden" name="category" value="<%= activeCategory || 'all' %>">
                            <input type="hidden" name="search" value="<%= search || '' %>">
                            <select name="classLevel" onchange="this.form.submit()" class="w-full px-6 h-14 bg-slate-50 dark:bg-slate-800 rounded-2xl border-transparent focus:ring-2 focus:ring-primary outline-none font-bold text-sm cursor-pointer appearance-none">
                                <option value="all" <%= (!activeClass || activeClass==='all') ? 'selected' : '' %>>সব ক্লাস</option>
                                <% ['Class 6','Class 7','Class 8','Class 9','Class 10','Class 11','Class 12','HSC'].forEach(function(cls) { %>
                                    <option value="<%= cls %>" <%= activeClass===cls ? 'selected' : '' %>><%= cls %></option>
                                <% }); %>
                            </select>
                        </form>
                    </div>
                </aside>

                <!-- Course Results Grid -->
                <div class="lg:col-span-9">
                    <!-- Top bar -->
                    <div class="flex flex-col md:flex-row items-center justify-between mb-10 gap-6 reveal delay-100">
                        <p class="text-slate-500 font-bold">সার্চ রেজাল্ট: <span class="text-slate-900 dark:text-white font-black"><%= courses.length %> টি কোর্স</span></p>
                        
                        <div class="flex items-center gap-4">
                            <span class="text-[10px] font-black uppercase text-slate-400 tracking-widest">সর্ট করুন:</span>
                            <form action="/courses" method="GET">
                                <input type="hidden" name="category" value="<%= activeCategory || 'all' %>">
                                <input type="hidden" name="search" value="<%= search || '' %>">
                                <select name="sort" onchange="this.form.submit()" class="px-5 py-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/50 dark:border-slate-800/50 text-xs font-black shadow-sm outline-none cursor-pointer">
                                    <option value="" <%= !activeSort ? 'selected' : '' %>>নতুন কোর্স</option>
                                    <option value="popular" <%= activeSort==='popular' ? 'selected' : '' %>>জনপ্রিয়</option>
                                    <option value="price_asc" <%= activeSort==='price_asc' ? 'selected' : '' %>>কম দামে</option>
                                    <option value="price_desc" <%= activeSort==='price_desc' ? 'selected' : '' %>>বেশি দামে</option>
                                </select>
                            </form>
                        </div>
                    </div>

                    <!-- List -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 reveal delay-200">
                        <% if (courses.length === 0) { %>
                            <div class="col-span-full py-32 text-center bg-white dark:bg-slate-900/50 rounded-[4rem] border-2 border-dashed border-slate-200 dark:border-slate-800">
                                <div class="size-20 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-6">
                                    <span class="material-symbols-outlined text-4xl text-slate-300">sentiment_dissatisfied</span>
                                </div>
                                <h2 class="text-2xl font-black mb-2 text-slate-900 dark:text-white">কোনো কোর্স পাওয়া যায়নি</h2>
                                <p class="text-slate-500 mb-8">অনুগ্রহ করে অন্য কীওয়ার্ড বা ক্যাটাগরি ট্রাই করুন</p>
                                <a href="/courses" class="btn-primary !px-8">সব কোর্স দেখুন</a>
                            </div>
                        <% } else { %>
                            <% courses.forEach(function(course) { 
                                var price = (course.plans && course.plans.length > 0) ? course.plans[0].price : 0;
                                var isFree = course.accessType === 'free' || price === 0;
                                var lessonCount = course.chapters ? course.chapters.reduce(function(acc, ch){ return acc + (ch.recordedClasses ? ch.recordedClasses.length : 0); }, 0) : 0;
                            %>
                                <div class="group course-card bg-white dark:bg-slate-900 rounded-[2.5rem] overflow-hidden border border-slate-200/50 dark:border-slate-800/50 shadow-sm hover:shadow-2xl hover:shadow-primary/10 transition-all duration-500 flex flex-col cursor-pointer" onclick="window.location='/course-details/<%= course._id %>'">
                                    <!-- Thumbnail -->
                                    <div class="aspect-[16/9] relative overflow-hidden bg-slate-100 dark:bg-slate-800">
                                        <% if (course.thumbnail) { %>
                                            <img src="<%= course.thumbnail %>" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" onerror="this.src='/images/course-placeholder.jpg'">
                                        <% } else { %>
                                            <div class="w-full h-full flex items-center justify-center">
                                                <span class="material-symbols-outlined text-6xl text-slate-200 dark:text-slate-700">school</span>
                                            </div>
                                        <% } %>

                                        <!-- Badges -->
                                        <div class="absolute top-5 left-5 flex gap-2">
                                            <span class="px-3 py-1 rounded-full bg-black/40 backdrop-blur-md text-white font-black text-[9px] uppercase tracking-widest border border-white/20">
                                                <%= course.classLevel %>
                                            </span>
                                            <% if (isFree) { %>
                                                <span class="px-3 py-1 rounded-full bg-emerald-500 text-white font-black text-[9px] uppercase tracking-widest shadow-lg shadow-emerald-500/20">Free</span>
                                            <% } %>
                                        </div>

                                        <!-- Lesson Counter -->
                                        <div class="absolute bottom-5 right-5">
                                            <span class="px-3 py-1 rounded-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm text-slate-900 dark:text-white font-black text-[9px] flex items-center gap-2 shadow-sm">
                                                <span class="material-symbols-outlined text-sm text-primary">play_circle</span> <%= lessonCount %>+ লেসন
                                            </span>
                                        </div>
                                    </div>

                                    <!-- Content -->
                                    <div class="p-8 flex-1 flex flex-col">
                                        <div class="flex items-center gap-2 mb-4">
                                            <span class="text-[10px] font-black text-primary uppercase tracking-[0.2em]"><%= course.category || 'সাধারণ' %></span>
                                            <span class="size-1 rounded-full bg-slate-200 dark:bg-slate-700"></span>
                                            <span class="text-[10px] font-bold text-slate-400">একাডেমিক</span>
                                        </div>
                                        <h3 class="text-xl font-black mb-6 text-slate-900 dark:text-white group-hover:text-primary transition-colors line-clamp-2 leading-tight flex-1">
                                            <%= course.title %>
                                        </h3>

                                        <div class="flex items-center justify-between pt-6 border-t border-slate-50 dark:border-slate-800">
                                            <div>
                                                <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">কোর্স ফি</p>
                                                <p class="text-2xl font-black text-slate-900 dark:text-white">
                                                    <%= isFree ? 'বিনামূল্যে' : '৳' + price.toLocaleString('bn-BD') %>
                                                </p>
                                            </div>
                                            <button class="size-12 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
                                                <span class="material-symbols-outlined">arrow_forward</span>
                                            </button>
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
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('active');
                    }
                });
            }, { threshold: 0.1 });
            document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
        });
    </script>
</body>
</html>`;

fs.writeFileSync('f:/oddhay/client/views/courses.ejs', coursesPremium);
console.log('UI Rebuild Complete!');
