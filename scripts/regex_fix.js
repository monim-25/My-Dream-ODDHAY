const fs = require('fs');
const path = 'f:/oddhay/client/views/dashboard-unified.ejs';
let text = fs.readFileSync(path, 'utf8');

// Pattern to match the broken loop
const brokenPattern = /<% if\(todayTasks && todayTasks\.length> 0\) \{ %>[\s\S]+?<% \} else \{ %>/;

const cleanLoop = `<% if(typeof todayTasks !== 'undefined' && todayTasks && todayTasks.length > 0) { %>
                                    <% todayTasks.forEach((task) => { %>
                                        <div id="task-card-<%= task._id %>" class="task-card flex items-center gap-4 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border-2 border-transparent hover:border-primary/10 transition-all cursor-pointer" onclick="toggleTask('<%= task._id %>')">
                                            <div id="check-<%= task._id %>" class="size-6 rounded-lg border-2 <%= task.isCompleted ? 'bg-primary border-primary' : 'border-slate-300 dark:border-slate-600' %> flex items-center justify-center bg-white dark:bg-slate-800 transition-colors">
                                               <span class="material-symbols-rounded text-white text-sm font-black <%= task.isCompleted ? '' : 'hidden' %>" id="icon-<%= task._id %>">check</span>
                                            </div>
                                            <span id="text-<%= task._id %>" class="text-base font-black text-slate-700 dark:text-slate-300 <%= task.isCompleted ? 'line-through opacity-40' : '' %> transition-all"><%= task.title %></span>
                                        </div>
                                    <% }) %>
                                <% } else { %>`;

if (brokenPattern.test(text)) {
    text = text.replace(brokenPattern, cleanLoop);
    fs.writeFileSync(path, text);
    console.log('Success: Replaced broken loop with clean version.');
} else {
    console.log('Error: Pattern not found.');
}
