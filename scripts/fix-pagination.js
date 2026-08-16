const fs = require('fs');

// 1. Update admin.js for Pagination and Object ID Validation
let adminJs = fs.readFileSync('server/routes/admin.js', 'utf8');

// A. Insert ObjectId validators right after logActivity...
const paramCheckLogic = `
// MongoDB ID Validator Middleware
const validateObjectId = (req, res, next, id) => {
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(id)) {
         return res.status(404).send('Invalid OR Malformed Database ID.');
    }
    next();
};
router.param('id', validateObjectId);
router.param('cid', validateObjectId);
router.param('chid', validateObjectId);
router.param('qid', validateObjectId);
`;

if (!adminJs.includes('validateObjectId')) {
    adminJs = adminJs.replace('// Admin main dashboard', paramCheckLogic + '\n// Admin main dashboard');
}

// B. Update /users endpoint query
const oldUsersRoute = `router.get('/users', superAdminProtect, async (req, res) => {
    try {
        await connectDB();
        const users = await User.find().sort({ createdAt: -1 });
        res.render('admin/users', { users, user: req.session.user, active: 'users' });
    } catch (err) { res.status(500).send('Error loading users'); }
});`;

const newUsersRoute = `router.get('/users', superAdminProtect, async (req, res) => {
    try {
        await connectDB();
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        const skip = (page - 1) * limit;
        const totalUsers = await User.countDocuments();
        const totalPages = Math.ceil(totalUsers / limit);
        const users = await User.find().sort({ createdAt: -1 }).skip(skip).limit(limit);
        res.render('admin/users', { users, user: req.session.user, active: 'users', currentPage: page, totalPages, totalUsers });
    } catch (err) { res.status(500).send('Error loading users'); }
});`;

adminJs = adminJs.replace(oldUsersRoute, newUsersRoute);
fs.writeFileSync('server/routes/admin.js', adminJs);

// 2. Update users.ejs for Pagination UI
let usersEjs = fs.readFileSync('client/views/admin/users.ejs', 'utf8');
const paginationUI = `
                <!-- Pagination Controls -->
                <% if (typeof totalPages !== 'undefined' && totalPages > 1) { %>
                <div class="px-10 py-6 border-t border-slate-100 dark:border-slate-800/50 flex items-center justify-between">
                    <span class="text-xs font-bold text-slate-400">Total <%= totalUsers %> Users</span>
                    <div class="flex items-center gap-2">
                        <% if (currentPage > 1) { %>
                            <a href="?page=<%= currentPage - 1 %>" class="px-4 py-2 bg-slate-50 dark:bg-slate-800 text-slate-500 rounded-xl font-bold text-xs hover:text-primary transition-all">Previous</a>
                        <% } %>
                        <span class="text-xs font-bold text-slate-400">Page <%= currentPage %> of <%= totalPages %></span>
                        <% if (currentPage < totalPages) { %>
                            <a href="?page=<%= currentPage + 1 %>" class="px-4 py-2 bg-slate-50 dark:bg-slate-800 text-slate-500 rounded-xl font-bold text-xs hover:text-primary transition-all">Next</a>
                        <% } %>
                    </div>
                </div>
                <% } %>
`;

// Insert it right before the closing div of the panel (after the loop container '</div> </div> </div>')
if (!usersEjs.includes('Pagination Controls')) {
    usersEjs = usersEjs.replace('                </div>\n            </div>\n        </div>\n    </main>',
        '                </div>\n' + paginationUI + '            </div>\n        </div>\n    </main>');
    fs.writeFileSync('client/views/admin/users.ejs', usersEjs);
}

console.log('Fixed Pagination and MongoDB CastError!');
