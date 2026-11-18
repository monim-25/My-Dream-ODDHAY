// MongoDB Permissions Script for Question Collection
// This script grants the necessary permissions for the Question history feature
/*
mongo --host cluster.mongodb.net --username monimmdmonim41_db_user --password <PASSWORD> --authenticationDatabase admin
use oddhay;
db.grantRolesToUser("monimmdmonim41_db_user", [
  {
    role: "read",
    db: "oddhay"
  }
]);
printjson(db.runCommand({usersInfo: "monimmdmonim41_db_user", showPrivileges: true}));
*/
