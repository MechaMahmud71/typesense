const { MongoClient } = require('mongodb');

let db;

const connect = async () => {
    const client = new MongoClient("mongodb://0.0.0.0:27017");
    await client.connect();
    db = client.db("product_db")
}
const getDb = async () => {
    if (!db) await connect();
    return db;
}

module.exports = { connect, getDb }

