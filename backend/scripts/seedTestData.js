const crypto = require('crypto');

async function seedTestData(pool) {
  const users = [
    { id: crypto.randomUUID(), email: 'ana.novak@example.com', uporabnisko_ime: 'ana.novak', nacin_prijave: 'email' },
    { id: crypto.randomUUID(), email: 'marko.kovac@example.com', uporabnisko_ime: 'marko.kovac', nacin_prijave: 'google' },
    { id: crypto.randomUUID(), email: 'petra.zupan@example.com', uporabnisko_ime: 'petra.zupan', nacin_prijave: 'apple' }
  ];
  for (const u of users) {
    await pool.query(
      `INSERT INTO uporabnik (id, email, uporabnisko_ime, nacin_prijave) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [u.id, u.email, u.uporabnisko_ime, u.nacin_prijave]
    );
  }

  const groups = [
    { id: crypto.randomUUID(), lastnik_id: users[0].id, ime: 'PGD Ljubljana Center', lat: 46.0569, lon: 14.5058, st_sedezev: 12 },
    { id: crypto.randomUUID(), lastnik_id: users[1].id, ime: 'PGD Maribor', lat: 46.5547, lon: 15.6459, st_sedezev: 8 }
  ];
  for (const g of groups) {
    await pool.query(
      `INSERT INTO skupina (id, lastnik_id, ime, lokacija_doma, st_sedezev)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $6)
       ON CONFLICT (id) DO NOTHING`,
      [g.id, g.lastnik_id, g.ime, g.lon, g.lat, g.st_sedezev]
    );
  }

  const packages = [
    { id: crypto.randomUUID(), kupec_id: users[0].id, skupina_id: groups[0].id, tip: 'premium', st_sedezev: 12 },
    { id: crypto.randomUUID(), kupec_id: users[1].id, skupina_id: groups[1].id, tip: 'osnovni', st_sedezev: 8 }
  ];
  for (const p of packages) {
    await pool.query(
      `INSERT INTO paket (id, kupec_id, skupina_id, tip, st_sedezev) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [p.id, p.kupec_id, p.skupina_id, p.tip, p.st_sedezev]
    );
  }

  const memberships = [
    { id: crypto.randomUUID(), uporabnik_id: users[0].id, skupina_id: groups[0].id, vloga: 'admin', status: 'approved' },
    { id: crypto.randomUUID(), uporabnik_id: users[2].id, skupina_id: groups[0].id, vloga: 'member', status: 'approved' },
    { id: crypto.randomUUID(), uporabnik_id: users[1].id, skupina_id: groups[1].id, vloga: 'admin', status: 'approved' },
    { id: crypto.randomUUID(), uporabnik_id: users[2].id, skupina_id: groups[1].id, vloga: 'member', status: 'pending' }
  ];
  for (const m of memberships) {
    await pool.query(
      `INSERT INTO clanstvo (id, uporabnik_id, skupina_id, vloga, status) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [m.id, m.uporabnik_id, m.skupina_id, m.vloga, m.status]
    );
  }

  const vehicles = [
    { id: crypto.randomUUID(), skupina_id: groups[0].id, ime: 'GVC 16/15', premer_cevi: 75 },
    { id: crypto.randomUUID(), skupina_id: groups[0].id, ime: 'GVM-1', premer_cevi: 52 },
    { id: crypto.randomUUID(), skupina_id: groups[1].id, ime: 'AC 24/50', premer_cevi: 110 }
  ];
  for (const v of vehicles) {
    await pool.query(
      `INSERT INTO vozilo (id, skupina_id, ime, premer_cevi) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [v.id, v.skupina_id, v.ime, v.premer_cevi]
    );
  }

  return { users, groups, packages, memberships, vehicles };
}

async function run() {
  require('dotenv').config();
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const { users, groups, packages, memberships, vehicles } = await seedTestData(pool);
  console.log(
    `Seeded ${users.length} uporabniki, ${groups.length} skupine, ${packages.length} paketi, ` +
      `${memberships.length} clanstva, ${vehicles.length} vozila`
  );
  await pool.end();
}

module.exports = { seedTestData };

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
