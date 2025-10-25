const mongoose = require('mongoose');
let bucket;

function getBucket() {
  if (bucket) return bucket;
  const db = mongoose.connection.db;
  bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: 'uploads' });
  return bucket;
}

module.exports = { getBucket };
