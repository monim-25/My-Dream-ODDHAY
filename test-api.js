const axios = require('axios');

async function test() {
    try {
        const res = await axios.post('http://localhost:3005/register', {
            name: "Test Student",
            identifier: "test-student-" + Date.now() + "@test.com",
            password: "password123",
            confirmPassword: "password123",
            role: "student",
            classLevel: "Class 10"
        });
        console.log('Status:', res.status);
    } catch (err) {
        console.log('Error:', err.response ? err.response.data : err.message);
    }
}

// Note: This requires the server to be running. I can't run the server in the background easily.
// But I can check the code again.
