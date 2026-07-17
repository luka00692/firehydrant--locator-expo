const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Pool } = require('pg');

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgres://postgres:hydrant@localhost:5432/hydrants_test';

const { createMockRes } = require('./helpers/mockRes');
const registerHandler = require('../api/auth/register');
const sessionHandler = require('../api/auth/session');
// join, pending-requests, and per-membership PATCH/DELETE are all folded into
// these two handlers now (see backend/README.md TODO for the consolidation).
const groupsHandler = require('../api/groups/index');
const groupByIdHandler = require('../api/groups/[id]/index');
const groupMembersHandler = require('../api/groups/[id]/members');
const groupVehiclesHandler = require('../api/groups/[id]/vehicles');

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

// The join endpoint auto-approves (see backend/README.md TODO), so this
// inserts a 'pending' clanstvo row directly — the way one would have existed
// before that change — to exercise the still-real approve/reject/seat-limit
// logic in isolation.
async function insertPendingMembership(userId, groupId) {
  const { rows } = await pool.query(
    `INSERT INTO clanstvo (uporabnik_id, skupina_id, vloga, status) VALUES ($1, $2, 'member', 'pending') RETURNING id`,
    [userId, groupId]
  );
  return rows[0].id;
}

test('POST /api/auth/register creates a user and a session', async () => {
  const { user, token } = await registerUser('owner@gmail.com', 'owner');
  assert.equal(user.email, 'owner@gmail.com');
  assert.ok(token);

  const res = createMockRes();
  await sessionHandler(authedReq(token, { method: 'GET' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.id, user.id);
});

test('POST /api/auth/register is idempotent for the same email (login, not duplicate)', async () => {
  const first = await registerUser('same@gmail.com', 'first-name');
  const second = await registerUser('same@gmail.com', 'ignored-name');
  assert.equal(first.user.id, second.user.id);
});

test('GET /api/auth/session 401s without a token', async () => {
  const res = createMockRes();
  await sessionHandler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 401);
});

test('POST /api/groups requires a purchased package', async () => {
  const { token } = await registerUser('nopackage@gmail.com', 'nopackage');
  const res = createMockRes();
  await groupsHandler(authedReq(token, { method: 'POST', body: { imeSkupine: 'PGD Test' } }), res);
  assert.equal(res.statusCode, 402);
});

test('POST /api/groups creates a group (as admin) and consumes the package', async () => {
  const { user, token } = await registerUser('buyer@gmail.com', 'buyer');
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

  // A second group creation fails only because the one package was already
  // consumed — belonging to a group already is not itself blocked (a user
  // can belong to any number of groups).
  const secondRes = createMockRes();
  await groupsHandler(authedReq(token, { method: 'POST', body: { imeSkupine: 'PGD Drugo' } }), secondRes);
  assert.equal(secondRes.statusCode, 402);

  await grantPackage(user.id, 3);
  const thirdRes = createMockRes();
  await groupsHandler(authedReq(token, { method: 'POST', body: { imeSkupine: 'PGD Tretja' } }), thirdRes);
  assert.equal(thirdRes.statusCode, 201);
});

test('POST /api/groups {fakePurchase} records a paket without real payment', async () => {
  const { token } = await registerUser('fakebuyer@gmail.com', 'fakebuyer');
  const res = createMockRes();
  await groupsHandler(
    authedReq(token, { method: 'POST', body: { fakePurchase: { tip: 'napredni', stSedezev: 100 } } }),
    res
  );
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.tip, 'napredni');
  assert.equal(res.body.stSedezev, 100);
});

test('POST /api/groups {fakePurchase} rejects an out-of-range seat count', async () => {
  const { token } = await registerUser('fakebuyer2@gmail.com', 'fakebuyer2');
  const res = createMockRes();
  await groupsHandler(
    authedReq(token, { method: 'POST', body: { fakePurchase: { tip: 'osnovni', stSedezev: 999 } } }),
    res
  );
  assert.equal(res.statusCode, 400);
});

test('GET /api/groups lists only the caller\'s groups', async () => {
  const { user: owner, token: ownerToken } = await registerUser('owner2@gmail.com', 'owner2');
  await grantPackage(owner.id, 3);
  const createRes = createMockRes();
  await groupsHandler(authedReq(ownerToken, { method: 'POST', body: { imeSkupine: 'PGD Owner2' } }), createRes);

  const { token: otherToken } = await registerUser('outsider@gmail.com', 'outsider');

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
  const { ownerToken, group } = await createGroup('rename-owner@gmail.com', 'rename-owner');
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
  const { group } = await createGroup('owner3@gmail.com', 'owner3');
  const { token: strangerToken } = await registerUser('stranger@gmail.com', 'stranger');

  const res = createMockRes();
  await groupByIdHandler(authedReq(strangerToken, { method: 'PATCH', query: { id: group.id }, body: { ime: 'Hack' } }), res);
  assert.equal(res.statusCode, 403);
});

test('POST /api/groups {join} auto-approves and auto-creates a group for an unknown name', async () => {
  const { token, user } = await registerUser('joinauto@gmail.com', 'joinauto');
  const res = createMockRes();
  await groupsHandler(
    authedReq(token, { method: 'POST', body: { join: { imeSkupine: `Ni Obstajala ${crypto.randomUUID()}` } } }),
    res
  );
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.status, 'approved');
  assert.equal(res.body.vloga, 'admin');
  assert.equal(res.body.uporabnikId, user.id);
});

test('POST /api/groups {join} joins an existing group as a member', async () => {
  const { group } = await createGroup('joinexisting-owner@gmail.com', 'joinexisting-owner', 3);
  const { token: guestToken, user: guest } = await registerUser('joinexisting-guest@gmail.com', 'joinexisting-guest');

  const res = createMockRes();
  await groupsHandler(authedReq(guestToken, { method: 'POST', body: { join: { imeSkupine: group.ime } } }), res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.status, 'approved');
  assert.equal(res.body.vloga, 'member');
  assert.equal(res.body.skupinaId, group.id);
  assert.equal(res.body.uporabnikId, guest.id);
});

test('POST /api/groups {join} allows joining more than one group', async () => {
  const { group: firstGroup } = await createGroup('multigroup-a@gmail.com', 'multigroup-a');
  const { group: secondGroup } = await createGroup('multigroup-b@gmail.com', 'multigroup-b');
  const { token: guestToken } = await registerUser('multigroup-guest@gmail.com', 'multigroup-guest');

  const firstJoin = createMockRes();
  await groupsHandler(authedReq(guestToken, { method: 'POST', body: { join: { imeSkupine: firstGroup.ime } } }), firstJoin);
  assert.equal(firstJoin.statusCode, 201);

  const secondJoin = createMockRes();
  await groupsHandler(authedReq(guestToken, { method: 'POST', body: { join: { imeSkupine: secondGroup.ime } } }), secondJoin);
  assert.equal(secondJoin.statusCode, 201);
  assert.equal(secondJoin.body.status, 'approved');
});

test('POST /api/groups {join} re-requesting the same group is idempotent, not an error', async () => {
  const { group } = await createGroup('rejoin-owner@gmail.com', 'rejoin-owner', 3);
  const { token: guestToken } = await registerUser('rejoin-guest@gmail.com', 'rejoin-guest');

  const firstJoin = createMockRes();
  await groupsHandler(authedReq(guestToken, { method: 'POST', body: { join: { imeSkupine: group.ime } } }), firstJoin);
  assert.equal(firstJoin.statusCode, 201);

  const secondJoin = createMockRes();
  await groupsHandler(authedReq(guestToken, { method: 'POST', body: { join: { imeSkupine: group.ime } } }), secondJoin);
  assert.equal(secondJoin.statusCode, 201);
  assert.equal(secondJoin.body.status, 'approved');
  assert.equal(secondJoin.body.id, firstJoin.body.id);
});

test('GET /api/groups?imeSkupine=... lets the caller poll their own request status', async () => {
  const { group } = await createGroup('joinpoll@gmail.com', 'joinpoll', 2);
  const { token: guestToken } = await registerUser('guestpoll@gmail.com', 'guestpoll');

  const notFoundRes = createMockRes();
  await groupsHandler(authedReq(guestToken, { method: 'GET', query: { imeSkupine: group.ime } }), notFoundRes);
  assert.equal(notFoundRes.statusCode, 404);

  await groupsHandler(authedReq(guestToken, { method: 'POST', body: { join: { imeSkupine: group.ime } } }), createMockRes());

  const pollRes = createMockRes();
  await groupsHandler(authedReq(guestToken, { method: 'GET', query: { imeSkupine: group.ime } }), pollRes);
  assert.equal(pollRes.statusCode, 200);
  assert.equal(pollRes.body.status, 'approved');
});

test('Approving a pending membership fails once the group is full, succeeds when a seat is free', async () => {
  const { ownerToken, group } = await createGroup('seatlimit-owner@gmail.com', 'seatlimit-owner', 1);
  const { user: guest } = await registerUser('seatlimit-guest@gmail.com', 'seatlimit-guest');
  const membershipId = await insertPendingMembership(guest.id, group.id);

  // The group only has 1 seat and the admin already occupies it.
  const approveRes = createMockRes();
  await groupMembersHandler(
    authedReq(ownerToken, { method: 'PATCH', query: { id: group.id, membershipId }, body: { status: 'approved' } }),
    approveRes
  );
  assert.equal(approveRes.statusCode, 409);
});

test('Admin can approve a pending membership when a seat is available', async () => {
  const { ownerToken, group } = await createGroup('seatok-owner@gmail.com', 'seatok-owner', 2);
  const { user: guest } = await registerUser('seatok-guest@gmail.com', 'seatok-guest');
  const membershipId = await insertPendingMembership(guest.id, group.id);

  const approveRes = createMockRes();
  await groupMembersHandler(
    authedReq(ownerToken, { method: 'PATCH', query: { id: group.id, membershipId }, body: { status: 'approved' } }),
    approveRes
  );
  assert.equal(approveRes.statusCode, 200);
  assert.equal(approveRes.body.status, 'approved');
});

test('Admin can reject a pending membership via PATCH', async () => {
  const { ownerToken, group } = await createGroup('reject-owner@gmail.com', 'reject-owner', 2);
  const { user: guest } = await registerUser('reject-guest@gmail.com', 'reject-guest');
  const membershipId = await insertPendingMembership(guest.id, group.id);

  const rejectRes = createMockRes();
  await groupMembersHandler(
    authedReq(ownerToken, { method: 'PATCH', query: { id: group.id, membershipId }, body: { status: 'rejected' } }),
    rejectRes
  );
  assert.equal(rejectRes.statusCode, 200);
  assert.equal(rejectRes.body.status, 'rejected');
});

test('Admin can remove a membership via DELETE', async () => {
  const { ownerToken, group } = await createGroup('remove-owner@gmail.com', 'remove-owner', 2);
  const { user: guest } = await registerUser('remove-guest@gmail.com', 'remove-guest');
  const membershipId = await insertPendingMembership(guest.id, group.id);

  const deleteRes = createMockRes();
  await groupMembersHandler(authedReq(ownerToken, { method: 'DELETE', query: { id: group.id, membershipId } }), deleteRes);
  assert.equal(deleteRes.statusCode, 204);

  const { rows } = await pool.query(`SELECT * FROM clanstvo WHERE id = $1`, [membershipId]);
  assert.equal(rows.length, 0);
});

test('A member cannot approve or remove other members', async () => {
  const { ownerToken, group } = await createGroup('joinowner4@gmail.com', 'joinowner4', 3);
  const { token: memberToken, user: member } = await registerUser('member4@gmail.com', 'member4');
  const memberMembershipId = await insertPendingMembership(member.id, group.id);
  await groupMembersHandler(
    authedReq(ownerToken, { method: 'PATCH', query: { id: group.id, membershipId: memberMembershipId }, body: { status: 'approved' } }),
    createMockRes()
  );

  const { user: otherGuest } = await registerUser('guest4@gmail.com', 'guest4');
  const otherMembershipId = await insertPendingMembership(otherGuest.id, group.id);

  const forbiddenRes = createMockRes();
  await groupMembersHandler(
    authedReq(memberToken, { method: 'PATCH', query: { id: group.id, membershipId: otherMembershipId }, body: { status: 'approved' } }),
    forbiddenRes
  );
  assert.equal(forbiddenRes.statusCode, 403);
});

test('GET /api/groups/:id/members lists only approved members, visible to any member', async () => {
  const { ownerToken, group } = await createGroup('memberslist@gmail.com', 'memberslist', 3);
  const { token: memberToken } = await registerUser('memberslist-m@gmail.com', 'memberslist-m');
  const { token: strangerToken } = await registerUser('memberslist-x@gmail.com', 'memberslist-x');

  await groupsHandler(authedReq(memberToken, { method: 'POST', body: { join: { imeSkupine: group.ime } } }), createMockRes());

  const membersRes = createMockRes();
  await groupMembersHandler(authedReq(memberToken, { method: 'GET', query: { id: group.id } }), membersRes);
  assert.equal(membersRes.statusCode, 200);
  assert.equal(membersRes.body.length, 2);

  const forbiddenRes = createMockRes();
  await groupMembersHandler(authedReq(strangerToken, { method: 'GET', query: { id: group.id } }), forbiddenRes);
  assert.equal(forbiddenRes.statusCode, 403);

  // Owner-only view of still-pending requests (there are none — join
  // auto-approves — but the endpoint should still respond correctly).
  const pendingRes = createMockRes();
  await groupMembersHandler(authedReq(ownerToken, { method: 'GET', query: { id: group.id, status: 'pending' } }), pendingRes);
  assert.equal(pendingRes.statusCode, 200);
  assert.equal(pendingRes.body.length, 0);
});

test('Admin can promote a member to admin', async () => {
  const { ownerToken, group } = await createGroup('promote@gmail.com', 'promote', 3);
  const { token: memberToken, user: member } = await registerUser('promoted-member@gmail.com', 'promoted-member');

  const joinRes = createMockRes();
  await groupsHandler(authedReq(memberToken, { method: 'POST', body: { join: { imeSkupine: group.ime } } }), joinRes);

  const promoteRes = createMockRes();
  await groupMembersHandler(
    authedReq(ownerToken, {
      method: 'PATCH',
      query: { id: group.id, membershipId: joinRes.body.id },
      body: { vloga: 'admin' }
    }),
    promoteRes
  );
  assert.equal(promoteRes.statusCode, 200);
  assert.equal(promoteRes.body.vloga, 'admin');
  assert.equal(member.id, joinRes.body.uporabnikId);
});

test('Admin can add, list, update, and remove vehicles; members can only list', async () => {
  const { ownerToken, group } = await createGroup('vehowner@gmail.com', 'vehowner');
  const { token: memberToken } = await registerUser('vehmember@gmail.com', 'vehmember');
  await groupsHandler(authedReq(memberToken, { method: 'POST', body: { join: { imeSkupine: group.ime } } }), createMockRes());

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
  await groupVehiclesHandler(
    authedReq(ownerToken, {
      method: 'PATCH',
      query: { id: group.id, vehicleId: addRes.body.id },
      body: { premerCevi: 110 }
    }),
    updateRes
  );
  assert.equal(updateRes.statusCode, 200);
  assert.equal(Number(updateRes.body.premerCevi), 110);

  const removeRes = createMockRes();
  await groupVehiclesHandler(
    authedReq(ownerToken, { method: 'DELETE', query: { id: group.id, vehicleId: addRes.body.id } }),
    removeRes
  );
  assert.equal(removeRes.statusCode, 204);
});
