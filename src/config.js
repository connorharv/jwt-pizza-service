require('dotenv').config();
const getenv = require('getenv');

const user = getenv('DB_USER');
const db_password = getenv('DB_PASSWORD');
const jwt_secret = getenv('JWT_SECRET');
const api_key = getenv('API_KEY');

module.exports =  {
    jwtSecret: jwt_secret,
    db: {
        connection: {
            host: '127.0.0.1',
            user: user,
            password: db_password,
            database: 'pizza',
            connectTimeout: 60000,
        },
        listPerPage: 10,
    },
    factory: {
        url: 'https://pizza-factory.cs329.click',
        apiKey: api_key,
    },
};