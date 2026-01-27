const MongoStore = require('connect-mongo');
console.log('Type of MongoStore:', typeof MongoStore);
console.log('MongoStore keys:', Object.keys(MongoStore));
if (typeof MongoStore === 'function') {
    console.log('MongoStore might be a class/constructor');
}
try {
    console.log('MongoStore.create type:', typeof MongoStore.create);
} catch (e) {
    console.log('Error accessing create:', e.message);
}
