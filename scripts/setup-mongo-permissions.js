# MongoDB Permissions Script for Question Collection
# This script grants the necessary permissions for the Question history feature

# Connect to MongoDB
mongo --host cluster.mongodb.net --username monimmdmonim41_db_user --password gSLd4eXrzdV8LzxO --authenticationDatabase admin

# Switch to the correct database
use oddhay;

# Grant read permissions to the Question collection
# Note: Replace 'your_user' with the actual MongoDB user if different
db.grantRolesToUser("monimmdmonim41_db_user", [
  {
    role: "read",
    db: "oddhay"
  }
]);

# Verify permissions
printjson(db.runCommand({usersInfo: "monimmdmonim41_db_user", showPrivileges: true}));

# Test the Question collection access
printjson(db.Question.find().limit(1).toArray());