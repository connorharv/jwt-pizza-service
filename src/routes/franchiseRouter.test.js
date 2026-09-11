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

test('Get Empty Franchises', async () => {
    const franchiseRes = await request(app).get('/api/franchise');
    expect(franchiseRes.status).toBe(200);
})

test('Get User Franchises without authorization', async () => {
    const userFranchiseRes = await request(app).get('/api/franchise/5');
    expect(userFranchiseRes.status).toBe(401);
})

test('Get user franchises with authorization', async () => {
    const userFranchiseRes = await request(app).get('/api/franchise/5')
        .set('Authorization', `Bearer ${testUserAuthToken}`);
    expect(userFranchiseRes.status).toBe(200);
    expect(userFranchiseRes.body).toMatchObject([]);
})

let newFranchiseId;

test('Create new franchise', async () => {
    const randFranchise = randomName();
    const newFranchise = {"name": randFranchise, "admins": [{"email": adminUser.email}]};
    const newFranchiseRes = await request(app).post('/api/franchise')
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .send(newFranchise);
    expect(newFranchiseRes.status).toBe(200);
    expect(newFranchiseRes.body.name).toBe(randFranchise);
    newFranchiseId = newFranchiseRes.body.id;
})

const storeId = Math.floor(Math.random() * 10000)+1;
const randStore = randomName();

const store = {"franchiseId": storeId, "name": randStore}

test('Create franchise store', async () => {
    const newStoreRes = await request(app).post(`/api/franchise/${newFranchiseId}/store`)
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .send(store);
    expect(newStoreRes.status).toBe(200);
})

test('Delete franchise store', async () => {
    const delStoreRes = await request(app).delete(`/api/franchise/${newFranchiseId}/store/${storeId}`)
        .set('Authorization', `Bearer ${testUserAuthToken}`);
    expect(delStoreRes.status).toBe(200);
})

test('Delete franchise', async () => {
    const delFranchiseRes = await request(app).delete(`/api/franchise/${newFranchiseId}`)
        .set('Authorization', `Bearer ${testUserAuthToken}`);
    expect(delFranchiseRes.status).toBe(200);
})


function expectValidJwt(potentialJwt) {
    expect(potentialJwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}