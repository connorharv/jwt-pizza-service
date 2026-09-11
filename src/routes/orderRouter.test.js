// noinspection JSUnresolvedReference

const request = require('supertest');
const app = require('../service');

let adminUser;
let testUserAuthToken;

const { Role, DB } = require('../database/database.js');

function randomName() {
    return Math.random().toString(36).substring(2, 12);
}

async function createAdminUser() {
    let user = { password: 'toomanysecrets', roles: [{ role: Role.Admin }] };
    user.name = randomName();
    user.email = user.name + '@admin.com';

    user = await DB.addUser(user);
    return { ...user, password: 'toomanysecrets' };
}

beforeAll(async() => {
    adminUser = await createAdminUser();
    const loginRes = await request(app).put('/api/auth').send(adminUser);
    testUserAuthToken = loginRes.body.token;
    expectValidJwt(testUserAuthToken);
})

test('Get menu', async () => {
    const orderRes = await request(app).get('/api/order/menu');
    expect(orderRes.status).toBe(200);
})

const item = { "title":"Student", "description": "No topping, no sauce, just carbs", "image":"pizza9.png", "price": 0.0001 };

test('Add item to menu', async () => {
    const addItemRes = await request(app).put('/api/order/menu')
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .send(item);
    expect(addItemRes.status).toBe(200);
})

test('Get authenticated orders', async () => {
    const orderRes = await request(app).get('/api/order')
        .set('Authorization', `Bearer ${testUserAuthToken}`);
    expect(orderRes.status).toBe(200);
})

const order = {"franchiseId": 1, "storeId":1, "items":[{ "menuId": 1, "description": "Veggie", "price": 0.05 }]};

test('Create order', async () => {
    const createOrderRes = await request(app).post('/api/order')
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .send(order);
    expect(createOrderRes.status).toBe(200);
})

function expectValidJwt(potentialJwt) {
    expect(potentialJwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}