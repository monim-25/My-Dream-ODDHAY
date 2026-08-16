async function test() {
    try {
        const res = await fetch('http://localhost:3005/superadmin/stats/live');
        const data = await res.json();
        console.log('Stats:', data);
    } catch (err) {
        console.error('Error:', err.message);
    }
}
test();
