const config = require('../config');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const readline = require('readline');
const { Admin } = require('../server');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(resolve => rl.question(q, resolve));
(async () => {
  try {
    if (!config.database.mongoUri) throw new Error('Set MONGODB_URI in .env first.');
    const email = (await ask('Admin email: ')).trim().toLowerCase();
    const password = await ask('Choose a strong admin password (input is visible in this basic prompt): ');
    if (!email || password.length < 12) throw new Error('Email required; password must be at least 12 characters.');
    await mongoose.connect(config.database.mongoUri);
    const passwordHash = await bcrypt.hash(password, 12);
    await Admin.updateOne({ email }, { $set: { email, passwordHash, role: 'admin', active: true } }, { upsert: true });
    console.log(`Administrator account configured for ${email}`);
  } catch (e) { console.error(e.message); process.exitCode = 1; }
  finally { rl.close(); await mongoose.disconnect().catch(() => {}); }
})();
