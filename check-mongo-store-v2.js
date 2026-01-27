const MongoS = require('connect-mongo');
console.log('MongoS.default:', MongoS.default);
if (MongoS.default) console.log('MongoS.default.create:', typeof MongoS.default.create);

console.log('MongoS.MongoStore:', MongoS.MongoStore);
if (MongoS.MongoStore) console.log('MongoS.MongoStore.create:', typeof MongoS.MongoStore.create);
