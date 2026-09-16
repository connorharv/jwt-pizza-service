// noinspection JSUnresolvedReference

const request = require('supertest');
const app = require('../service');

function randomName() {
    return Math.random().toString(36).substring(2, 12);
}

async function registerUser(service) {
    const testUser = {
        name: 'pizza diner',
        email: `${randomName()}@test.com`,
        password: 'a',
    };
    const registerRes = await service.post('/api/auth').send(testUser);
    registerRes.body.user.password = testUser.password;

    return [registerRes.body.user, registerRes.body.token];
}

async function loginAdmin(service) {
    const adminUser = {
        email: "a@jwt.com",
        password: 'admin'
    };
    const loginRes = await service.put('/api/auth').send(adminUser);
    return [loginRes.body.user, loginRes.body.token];
}

test('list users unauthorized', async () => {
    const listUsersRes = await request(app).get('/api/user');
    expect(listUsersRes.status).toBe(401);
});

test('list users', async () => {
    const [_, userToken] = await loginAdmin(request(app));
    const listUsersRes = await request(app)
        .get('/api/user?limit=1')
        .set('Authorization', 'Bearer ' + userToken);
    expect(listUsersRes.status).toBe(200);
    expect(listUsersRes.body.users.length).toBe(1);
    expect(listUsersRes.body.users[0].roles.length).toBe(1);
});

test('list users invalid', async () => {
    const [_, userToken] = await registerUser(request(app));
    const listUsersResLimit = await request(app)
        .get('/api/user?limit=-1')
        .set('Authorization', 'Bearer ' + userToken);
    expect(listUsersResLimit.status).toBe(403);

    const listUsersResName = await request(app)
        .get('/api/user?name=54')
        .set('Authorization', 'Bearer ' + userToken);
    expect(listUsersResName.status).toBe(403);
})

// === Delete Users ===

test('delete user unauthorized', async () => {
    const deleteUserRes = await request(app).delete('/api/user/1');
    expect(deleteUserRes.status).toBe(401);

    const [_, userToken] = await registerUser(request(app));
    const deleteUserRes2 = await request(app)
        .delete('/api/user/1')
        .set('Authorization', 'Bearer ' + userToken);
    expect(deleteUserRes2.status).toBe(403);
});

test('delete user authorized', async () => {
    const [_, userToken] = await loginAdmin(request(app));
    const deleteUserRes = await request(app)
        .delete('/api/user/2')
        .set('Authorization', 'Bearer ' + userToken);

    expect(deleteUserRes.status).toBe(200);
})

