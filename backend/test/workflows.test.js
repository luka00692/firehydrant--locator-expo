const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgres://postgres:hydrant@localhost:5432/hydrants_test';

const { createMockRes } = require('./helpers/mockRes');
const registerHandler = require('../api/auth/register');
const sessionHandler = require('../api/auth/session');
const groupsHandler = require('../api/groups/index');
const groupJoinHandler = require('../api/groups/join');
const groupByIdHandler = require('../api/groups/[id]/index');
const groupRequestsHandler = require('../api/groups/[id]/requests');
const groupMembersHandler = require('../api/groups/[id]/members');
const groupVehiclesHandler = require('../api/groups/[id]/vehicles');
const membershipHandler = require('../api/memberships/[id]');
const vehicleByIdHandler = require('../api/vehicles/[id]');

let pool;

before(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await pool.query(schema);
});

after(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query('TRUNCATE vozilo, clanstvo, paket, session, skupina, uporabnik RESTART IDENTITY CASCADE');
});

async function registerUser(email, uporabnisko_ime) {
  const res = createMockRes();
  await registerHandler({ method: 'POST', body: { email, uporabniskoIme: uporabnisko_ime } }, res);
  return res.body; // { user, token, expiresAt }
}

function authedReq(token, extra) {
  return { headers: { authorization: `Bearer ${token}` }, query: {}, body: {}, ...extra };
}

async function grantPackage(userId, st_sedezev = 5) {
  await pool.query(`INSERT INTO paket (kupec_id, tip, st_sedezev) VALUES ($1, 'osnovni', $2)`, [userId, st_sedezev]);
}

test('POST /api/auth/register creates a user and a session', async () => {
  const { user, token } = await registerUser('owner@example.com', 'owner');
  assert.equal(user.email, 'owner@example.com');
  assert.ok(token);

  const res = createMockRes();
  await sessionHandler(authedReq(token, { method: 'GET' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.id, user.id);
});

test('POST /api/auth/register is idempotent for the same email (login, not duplicate)', async () => {
  const first = await registerUser('same@example.com', 'first-name');
  const second = await registerUser('same@example.com', 'ignored-name');
  assert.equal(first.user.id, second.user.id);
});

test('GET /api/auth/session 401s without a token', async () => {
  const res = createMockRes();
  await sessionHandler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 401);
});

test('POST /api/groups requires a purchased package', async () => {
  const { token } = await registerUser('nopackage@example.com', 'nopackage');
  const res = createMockRes();
  await groupsHandler(authedReq(token, { method: 'POST', body: { imeSkupine: 'PGD Test' } }), res);
  assert.equal(res.statusCode, 402);
});

test('POST /api/groups creates a group (as admin) and consumes the package', async () => {
  const { user, token } = await registerUser('buyer@example.com', 'buyer');
  await grantPackage(user.id, 5);

  const res = createMockRes();
  await groupsHandler(authedReq(token, { method: 'POST', body: { imeSkupine: 'PGD Test' } }), res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.ime, 'PGD Test');
  assert.equal(res.body.stSedezev, 5);

  const { rows } = await pool.query(`SELECT skupina_id FROM paket WHERE kupec_id = $1`, [user.id]);
  assert.equal(rows[0].skupina_id, res.body.id);

  const { rows: membershipRows } = await pool.query(`SELECT vloga, status FROM clanstvo WHERE uporabnik_id = $1`, [user.id]);
  assert.equal(membershipRows[0].vloga, 'admin');
  assert.equal(membershipRows[0].status, 'approved');

  // A second group creation now fails — the one package was already consumed.
  const secondRes = createMockRes();
  await groupsHandler(authedReq(token, { method: 'POST', body: { imeSkupine: 'PGD Drugo' } }), secondRes);
  assert.equal(secondRes.statusCode, 402);
});

test('GET /api/groups lists only the caller\'s groups', async () => {
  const { user: owner, token: ownerToken } = await registerUser('owner2@example.com', 'owner2');
  await grantPackage(owner.id, 3);
  const createRes = createMockRes();
  await groupsHandler(authedReq(ownerToken, { method: 'POST', body: { imeSkupine: 'PGD Owner2' } }), createRes);

  const { token: otherToken } = await registerUser('outsider@example.com', 'outsider');

  const ownerList = createMockRes();
  await groupsHandler(authedReq(ownerToken, { method: 'GET' }), ownerList);
  assert.equal(ownerList.body.length, 1);

  const outsiderList = createMockRes();
  await groupsHandler(authedReq(otherToken, { method: 'GET' }), outsiderList);
  assert.equal(outsiderList.body.length, 0);
});

async function createGroup(email, uporabnisko_ime, seats = 5) {
  const { user, token } = await registerUser(email, uporabnisko_ime);
  await grantPackage(user.id, seats);
  const res = createMockRes();
  await groupsHandler(authedReq(token, { method: 'POST', body: { imeSkupine: `Skupina ${email}` } }), res);
  return { owner: user, ownerToken: token, group: res.body };
}

test('PATCH /api/groups/:id lets the admin rename and set a home location', async () => {
  const { ownerToken, group } = await createGroup('rename-owner@example.com', 'rename-owner');
  const res = createMockRes();
  await groupByIdHandler(
    authedReq(ownerToken, {
      method: 'PATCH',
      query: { id: group.id },
      body: { ime: 'Novo ime', lokacijaDoma: { lat: 46.05, lng: 14.5 } }
    }),
    res
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ime, 'Novo ime');
  assert.ok(Math.abs(Number(res.body.lat) - 46.05) < 0.001);
  assert.ok(Math.abs(Number(res.body.lng) - 14.5) < 0.001);
});

test('PATCH /api/groups/:id is forbidden for a non-admin', async () => {
  const { group } = await createGroup('owner3@example.com', 'owner3');
  const { token: strangerToken } = await registerUser('stranger@example.com', 'stranger');

  const res = createMockRes();
  await groupByIdHandler(authedReq(strangerToken, { method: 'PATCH', query: { id: group.id }, body: { ime: 'Hack' } }), res);
  assert.equal(res.statusCode, 403);
});

test('Guest join request → admin sees it → approve succeeds only when a seat is free', async () => {
  const { ownerToken, group } = await createGroup('joinowner@example.com', 'joinowner', 1);
  const { user: guest, token: guestToken } = await registerUser('guest@example.com', 'guest');

  const joinRes = createMockRes();
  await groupJoinHandler(authedReq(guestToken, { method: 'POST', body: { imeSkupine: group.ime } }), joinRes);
  assert.equal(joinRes.statusCode, 201);
  assert.equal(joinRes.body.status, 'pending');
  assert.equal(joinRes.body.vloga, 'member');

  const requestsRes = createMockRes();
  await groupRequestsHandler(authedReq(ownerToken, { method: 'GET', query: { id: group.id } }), requestsRes);
  assert.equal(requestsRes.body.length, 1);
  assert.equal(requestsRes.body[0].uporabnikId, guest.id);

  // The group only has 1 seat and the admin already occupies it.
  const approveRes = createMockRes();
  await membershipHandler(
    authedReq(ownerToken, { method: 'PATCH', query: { id: joinRes.body.id }, body: { status: 'approved' } }),
    approveRes
  );
  assert.equal(approveRes.statusCode, 409);
});

test('Guest join request approved when a seat is available', async () => {
  const { ownerToken, group } = await createGroup('joinowner2@example.com', 'joinowner2', 2);
  const { token: guestToken } = await registerUser('guest2@example.com', 'guest2');

  const joinRes = createMockRes();
  await groupJoinHandler(authedReq(guestToken, { method: 'POST', body: { imeSkupine: group.ime } }), joinRes);

  const approveRes = createMockRes();
  await membershipHandler(
    authedReq(ownerToken, { method: 'PATCH', query: { id: joinRes.body.id }, body: { status: 'approved' } }),
    approveRes
  );
  assert.equal(approveRes.statusCode, 200);
  assert.equal(approveRes.body.status, 'approved');
});

test('Admin can reject a pending join request via PATCH', async () => {
  const { ownerToken, group } = await createGroup('joinowner3@example.com', 'joinowner3', 2);
  const { token: guestToken } = await registerUser('guest3@example.com', 'guest3');

  const joinRes = createMockRes();
  await groupJoinHandler(authedReq(guestToken, { method: 'POST', body: { imeSkupine: group.ime } }), joinRes);

  const rejectRes = createMockRes();
  await membershipHandler(
    authedReq(ownerToken, { method: 'PATCH', query: { id: joinRes.body.id }, body: { status: 'rejected' } }),
    rejectRes
  );
  assert.equal(rejectRes.statusCode, 200);
  assert.equal(rejectRes.body.status, 'rejected');
});

test('Admin can also reject/remove via DELETE', async () => {
  const { ownerToken, group } = await createGroup('joinowner3b@example.com', 'joinowner3b', 2);
  const { token: guestToken } = await registerUser('guest3b@example.com', 'guest3b');

  const joinRes = createMockRes();
  await groupJoinHandler(authedReq(guestToken, { method: 'POST', body: { imeSkupine: group.ime } }), joinRes);

  const deleteRes = createMockRes();
  await membershipHandler(authedReq(ownerToken, { method: 'DELETE', query: { id: joinRes.body.id } }), deleteRes);
  assert.equal(deleteRes.statusCode, 204);

  const { rows } = await pool.query(`SELECT * FROM clanstvo WHERE id = $1`, [joinRes.body.id]);
  assert.equal(rows.length, 0);
});

test('A member cannot approve or remove other members', async () => {
  const { ownerToken, group } = await createGroup('joinowner4@example.com', 'joinowner4', 3);
  const { token: memberToken } = await registerUser('member4@example.com', 'member4');

  const joinRes = createMockRes();
  await groupJoinHandler(authedReq(memberToken, { method: 'POST', body: { imeSkupine: group.ime } }), joinRes);
  await membershipHandler(
    authedReq(ownerToken, { method: 'PATCH', query: { id: joinRes.body.id }, body: { status: 'approved' } }),
    createMockRes()
  );

  const { token: otherGuestToken } = await registerUser('guest4@example.com', 'guest4');
  const otherJoinRes = createMockRes();
  await groupJoinHandler(authedReq(otherGuestToken, { method: 'POST', body: { imeSkupine: group.ime } }), otherJoinRes);

  const forbiddenRes = createMockRes();
  await membershipHandler(
    authedReq(memberToken, { method: 'PATCH', query: { id: otherJoinRes.body.id }, body: { status: 'approved' } }),
    forbiddenRes
  );
  assert.equal(forbiddenRes.statusCode, 403);
});

test('GET /api/groups/join lets the caller poll their own request status', async () => {
  const { ownerToken, group } = await createGroup('joinpoll@example.com', 'joinpoll', 2);
  const { token: guestToken } = await registerUser('guestpoll@example.com', 'guestpoll');

  const notFoundRes = createMockRes();
  await groupJoinHandler(authedReq(guestToken, { method: 'GET', query: { imeSkupine: group.ime } }), notFoundRes);
  assert.equal(notFoundRes.statusCode, 404);

  const joinRes = createMockRes();
  await groupJoinHandler(authedReq(guestToken, { method: 'POST', body: { imeSkupine: group.ime } }), joinRes);

  const pollPendingRes = createMockRes();
  await groupJoinHandler(authedReq(guestToken, { method: 'GET', query: { imeSkupine: group.ime } }), pollPendingRes);
  assert.equal(pollPendingRes.statusCode, 200);
  assert.equal(pollPendingRes.body.status, 'pending');

  await membershipHandler(
    authedReq(ownerToken, { method: 'PATCH', query: { id: joinRes.body.id }, body: { status: 'approved' } }),
    createMockRes()
  );

  const pollApprovedRes = createMockRes();
  await groupJoinHandler(authedReq(guestToken, { method: 'GET', query: { imeSkupine: group.ime } }), pollApprovedRes);
  assert.equal(pollApprovedRes.statusCode, 200);
  assert.equal(pollApprovedRes.body.status, 'approved');
});

test('GET /api/groups/:id/members lists only approved members, visible to any member', async () => {
  const { ownerToken, group } = await createGroup('memberslist@example.com', 'memberslist', 3);
  const { token: memberToken } = await registerUser('memberslist-m@example.com', 'memberslist-m');
  const { token: strangerToken } = await registerUser('memberslist-x@example.com', 'memberslist-x');

  const joinRes = createMockRes();
  await groupJoinHandler(authedReq(memberToken, { method: 'POST', body: { imeSkupine: group.ime } }), joinRes);
  await membershipHandler(
    authedReq(ownerToken, { method: 'PATCH', query: { id: joinRes.body.id }, body: { status: 'approved' } }),
    createMockRes()
  );

  const membersRes = createMockRes();
  await groupMembersHandler(authedReq(memberToken, { method: 'GET', query: { id: group.id } }), membersRes);
  assert.equal(membersRes.statusCode, 200);
  assert.equal(membersRes.body.length, 2);

  const forbiddenRes = createMockRes();
  await groupMembersHandler(authedReq(strangerToken, { method: 'GET', query: { id: group.id } }), forbiddenRes);
  assert.equal(forbiddenRes.statusCode, 403);
});

test('Admin can promote a member to admin', async () => {
  const { ownerToken, group } = await createGroup('promote@example.com', 'promote', 3);
  const { token: memberToken } = await registerUser('promoted-member@example.com', 'promoted-member');

  const joinRes = createMockRes();
  await groupJoinHandler(authedReq(memberToken, { method: 'POST', body: { imeSkupine: group.ime } }), joinRes);
  await membershipHandler(
    authedReq(ownerToken, { method: 'PATCH', query: { id: joinRes.body.id }, body: { status: 'approved' } }),
    createMockRes()
  );

  const promoteRes = createMockRes();
  await membershipHandler(
    authedReq(ownerToken, { method: 'PATCH', query: { id: joinRes.body.id }, body: { vloga: 'admin' } }),
    promoteRes
  );
  assert.equal(promoteRes.statusCode, 200);
  assert.equal(promoteRes.body.vloga, 'admin');
});

test('Admin can add, list, update, and remove vehicles; members can only list', async () => {
  const { ownerToken, group } = await createGroup('vehowner@example.com', 'vehowner');
  const { token: memberToken } = await registerUser('vehmember@example.com', 'vehmember');
  const joinRes = createMockRes();
  await groupJoinHandler(authedReq(memberToken, { method: 'POST', body: { imeSkupine: group.ime } }), joinRes);
  await membershipHandler(
    authedReq(ownerToken, { method: 'PATCH', query: { id: joinRes.body.id }, body: { status: 'approved' } }),
    createMockRes()
  );

  const addRes = createMockRes();
  await groupVehiclesHandler(
    authedReq(ownerToken, { method: 'POST', query: { id: group.id }, body: { ime: 'GVC 16/15', premerCevi: 75 } }),
    addRes
  );
  assert.equal(addRes.statusCode, 201);
  assert.equal(Number(addRes.body.premerCevi), 75);

  const memberAddRes = createMockRes();
  await groupVehiclesHandler(
    authedReq(memberToken, { method: 'POST', query: { id: group.id }, body: { ime: 'Hack Truck', premerCevi: 1 } }),
    memberAddRes
  );
  assert.equal(memberAddRes.statusCode, 403);

  const memberListRes = createMockRes();
  await groupVehiclesHandler(authedReq(memberToken, { method: 'GET', query: { id: group.id } }), memberListRes);
  assert.equal(memberListRes.statusCode, 200);
  assert.equal(memberListRes.body.length, 1);

  const updateRes = createMockRes();
  await vehicleByIdHandler(
    authedReq(ownerToken, { method: 'PATCH', query: { id: addRes.body.id }, body: { premerCevi: 110 } }),
    updateRes
  );
  assert.equal(updateRes.statusCode, 200);
  assert.equal(Number(updateRes.body.premerCevi), 110);

  const removeRes = createMockRes();
  await vehicleByIdHandler(authedReq(ownerToken, { method: 'DELETE', query: { id: addRes.body.id } }), removeRes);
  assert.equal(removeRes.statusCode, 204);
});
