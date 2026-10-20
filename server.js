const config = require('./config');
const path = require('path');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = express();
const PORT = config.app.port;
const CURRENCY = config.paystack.currency;
const PAYSTACK_API = config.paystack.apiBaseUrl;

const DonationSchema = new mongoose.Schema({
  donorName: { type: String, default: '', maxlength: 100 },
  email: { type: String, required: true, lowercase: true, maxlength: 254 },
  anonymous: { type: Boolean, default: false },
  amountMinor: { type: Number, required: true, min: 1 },
  currency: { type: String, required: true, uppercase: true },
  reference: { type: String, required: true, unique: true, index: true },
  provider: { type: String, default: 'paystack' },
  channel: { type: String, default: '' },
  status: { type: String, enum: ['initialized', 'pending', 'success', 'failed'], default: 'initialized', index: true },
  message: { type: String, default: '', maxlength: 1000 },
  providerTransactionId: { type: String, default: '' },
  paidAt: { type: Date, default: null },
  verificationAt: { type: Date, default: null },
  notifiedSuccessAt: { type: Date, default: null }
}, { timestamps: true });
const AdminSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'admin' },
  active: { type: Boolean, default: true }
}, { timestamps: true });
const NotificationSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  reference: { type: String, default: '' },
  type: { type: String, required: true },
  status: { type: String, enum: ['queued', 'sent', 'failed'], default: 'queued', index: true },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now, index: true },
  lastAttemptAt: { type: Date, default: null },
  sentAt: { type: Date, default: null },
  error: { type: String, default: '' },
  text: { type: String, required: true }
}, { timestamps: true });
const SettingSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  value: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

const Donation = mongoose.model('Donation', DonationSchema);
const Admin = mongoose.model('Admin', AdminSchema);
const Notification = mongoose.model('Notification', NotificationSchema);
const Setting = mongoose.model('Setting', SettingSchema);

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '30kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));
app.use(session({
  name: 'ttinc.sid',
  secret: config.app.sessionSecret || 'development-only-change-this-secret-now',
  resave: false,
  saveUninitialized: false,
  store: config.database.mongoUri ? MongoStore.create({ mongoUrl: config.database.mongoUri, collectionName: config.database.sessionCollection }) : undefined,
  cookie: { httpOnly: true, sameSite: 'lax', secure: config.app.nodeEnv === 'production', maxAge: 8 * 60 * 60 * 1000 }
}));

function ensureConfigured() {
  const missing = [['MONGODB_URI', config.database.mongoUri], ['PAYSTACK_SECRET_KEY', config.paystack.secretKey], ['TELEGRAM_BOT_TOKEN', config.telegram.botToken], ['TELEGRAM_CHAT_ID', config.telegram.chatId], ['SESSION_SECRET', config.app.sessionSecret]]
    .filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error('Missing required environment configuration: ' + missing.join(', '));
}
function minorToMajor(minor) { return (minor / 100).toFixed(2); }
function escapeHtml(s='') {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function money(d) { return `${d.currency} ${minorToMajor(d.amountMinor)}`; }
async function paystack(pathname, options={}) {
  if (!config.paystack.secretKey) throw new Error('Paystack is not configured.');
  const response = await fetch(`${PAYSTACK_API}${pathname}`, {
    ...options,
    headers: { Authorization: `Bearer ${config.paystack.secretKey}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.status) throw new Error(data.message || `Paystack request failed (${response.status})`);
  return data.data;
}
function telegramSafe(s='') {
  return String(s).replace(/[\u0000-\u001F\u007F]/g, ' ').slice(0, 1000);
}
async function queueNotification(key, reference, type, text) {
  try {
    await Notification.updateOne({ key }, { $setOnInsert: { key, reference, type, text, status: 'queued', nextAttemptAt: new Date() } }, { upsert: true });
  } catch (e) { console.error('Notification queue error:', e.message); }
}
async function processNotifications(limit=20) {
  const now = new Date();
  const jobs = await Notification.find({ status: { $in: ['queued', 'failed'] }, attempts: { $lt: 8 }, nextAttemptAt: { $lte: now } }).sort({ createdAt: 1 }).limit(limit);
  for (const job of jobs) {
    // Atomic claim avoids multiple workers sending the same notification concurrently.
    const claimed = await Notification.findOneAndUpdate(
      { _id: job._id, status: { $in: ['queued', 'failed'] }, nextAttemptAt: { $lte: now } },
      { $set: { status: 'queued', lastAttemptAt: now }, $inc: { attempts: 1 } }, { new: true }
    );
    if (!claimed) continue;
    try {
      if (!config.telegram.botToken || !config.telegram.chatId) throw new Error('Telegram is not configured');
      const res = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: config.telegram.chatId, text: telegramSafe(claimed.text), disable_web_page_preview: true })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.description || `Telegram API error ${res.status}`);
      await Notification.updateOne({ _id: claimed._id }, { $set: { status: 'sent', sentAt: new Date(), error: '' } });
    } catch (e) {
      const attempts = claimed.attempts;
      await Notification.updateOne({ _id: claimed._id }, { $set: {
        status: 'failed', error: String(e.message).slice(0, 300),
        nextAttemptAt: new Date(Date.now() + Math.min(6 * 60 * 60 * 1000, 15000 * (2 ** Math.min(attempts, 8))))
      } });
    }
  }
}
function notifySoon() { setTimeout(() => processNotifications().catch(e => console.error('Notification worker:', e.message)), 50).unref?.(); }
function requireAdmin(req, res, next) {
  if (!req.session.adminId) return res.status(401).json({ error: 'Administrator login required.' });
  next();
}
function requireCsrf(req, res, next) {
  const supplied = req.get('x-csrf-token');
  if (!req.session.csrfToken || !supplied || supplied !== req.session.csrfToken) return res.status(403).json({ error: 'Invalid security token. Refresh and try again.' });
  next();
}
function newReference() { return `TTINC_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`; }

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'Teddy Tech Inc Donation Website' }));
app.get('/api/config', (_req, res) => res.json({
  companyName: config.public.companyName, title: config.public.websiteTitle,
  tagline: config.public.tagline,
  secondaryTagline: config.public.secondaryTagline,
  currency: CURRENCY, paystackPublicKey: config.paystack.publicKey,
  contactEmail: config.public.contactEmail,
  websiteUrl: config.public.websiteUrl,
  telegramUrl: config.public.telegramUrl,
  whatsappUrl: config.public.whatsappUrl,
  githubUrl: config.public.githubUrl
}));

const donationSchema = z.object({
  amount: z.coerce.number().finite().positive().max(100000000),
  email: z.string().trim().email().max(254),
  donorName: z.string().trim().max(100).optional().default(''),
  message: z.string().trim().max(1000).optional().default(''),
  anonymous: z.boolean().optional().default(false)
});

app.post('/api/donations/initialize', rateLimit({ windowMs: 10 * 60 * 1000, limit: 15 }), async (req, res) => {
  try {
    const parsed = donationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Enter a valid positive donation amount and email address.' });
    const { amount, email, donorName, message, anonymous } = parsed.data;
    const amountMinor = Math.round(amount * 100);
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 1) return res.status(400).json({ error: 'Invalid donation amount.' });
    if (CURRENCY !== 'KES' && !/^[A-Z]{3}$/.test(CURRENCY)) return res.status(500).json({ error: 'Configured currency is invalid.' });

    const reference = newReference();
    const donation = await Donation.create({
      donorName: telegramSafe(donorName), email, anonymous, amountMinor, currency: CURRENCY,
      reference, message: telegramSafe(message), status: 'initialized'
    });
    const data = await paystack('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email, amount: amountMinor, currency: CURRENCY, reference,
        ...(config.paystack.callbackUrl ? { callback_url: config.paystack.callbackUrl } : {}),
        metadata: { donationReference: reference, company: 'Teddy Tech Inc' }
      })
    });
    await Donation.updateOne({ reference }, { $set: { status: 'pending' } });
    await queueNotification(`initiated:${reference}`, reference, 'initiated',
      `🆕 NEW DONATION INITIATED\n\n🏢 Company: Teddy Tech Inc\n💰 Amount: ${CURRENCY} ${minorToMajor(amountMinor)}\n👤 Donor: ${donorName || 'Not Provided'}\n📧 Email: ${email}\n💳 Gateway: Paystack\n🔖 Reference: ${reference}\n📊 Status: AWAITING PAYMENT\n🕒 Time: ${new Date().toISOString()}`);
    notifySoon();
    res.json({ authorizationUrl: data.authorization_url, reference, amount: minorToMajor(amountMinor), currency: CURRENCY });
  } catch (e) {
    console.error('Donation initialization error:', e.message);
    res.status(502).json({ error: 'We could not start checkout. Please try again later.' });
  }
});

async function verifyAndUpdate(reference) {
  const donation = await Donation.findOne({ reference });
  if (!donation) return { error: 'Transaction not found.', status: 404 };
  const data = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  if (data.reference !== reference || Number(data.amount) !== donation.amountMinor || String(data.currency).toUpperCase() !== donation.currency) {
    return { error: 'Payment details did not match the expected transaction.', status: 409 };
  }
  if (data.status === 'success') {
    const updated = await Donation.findOneAndUpdate(
      { reference, status: { $ne: 'success' } },
      { $set: { status: 'success', channel: data.channel || '', providerTransactionId: String(data.id || ''), paidAt: data.paid_at ? new Date(data.paid_at) : new Date(), verificationAt: new Date() } },
      { new: true }
    );
    const current = updated || await Donation.findOne({ reference });
    if (updated) {
      const displayName = updated.anonymous ? 'Anonymous' : (updated.donorName || 'Not Provided');
      await queueNotification(`success:${reference}`, reference, 'success',
        `✅ DONATION RECEIVED SUCCESSFULLY\n\n🏢 Company: Teddy Tech Inc\n💰 Amount: ${money(updated)}\n👤 Donor: ${displayName}\n💳 Payment Method: ${updated.channel || 'Not provided'}\n🔖 Reference: ${reference}\n📊 Status: SUCCESSFUL\n🕒 Time: ${new Date().toISOString()}\n💻 Purpose: VPS, hosting, domains, and technology maintenance.\n❤️ Thank you for supporting Teddy Tech Inc!`);
      notifySoon();
    }
    return { donation: current, providerStatus: data.status };
  }
  if (['failed', 'abandoned'].includes(data.status)) {
    const updated = await Donation.findOneAndUpdate({ reference, status: { $nin: ['success', 'failed'] } },
      { $set: { status: 'failed', verificationAt: new Date(), channel: data.channel || '' } }, { new: true });
    if (updated) {
      await queueNotification(`failed:${reference}`, reference, 'failed',
        `❌ DONATION PAYMENT FAILED\n\n🏢 Company: Teddy Tech Inc\n💰 Amount: ${money(updated)}\n🔖 Reference: ${reference}\n📊 Status: FAILED\n🕒 Time: ${new Date().toISOString()}`);
      notifySoon();
    }
    return { donation: updated || await Donation.findOne({ reference }), providerStatus: data.status };
  }
  const updated = await Donation.findOneAndUpdate({ reference, status: { $nin: ['success', 'failed'] } },
    { $set: { status: 'pending', verificationAt: new Date() } }, { new: true });
  return { donation: updated || await Donation.findOne({ reference }), providerStatus: data.status };
}

app.get('/api/donations/status/:reference', rateLimit({ windowMs: 5 * 60 * 1000, limit: 40 }), async (req, res) => {
  try {
    const reference = String(req.params.reference || '');
    if (!/^TTINC_[A-Za-z0-9_]+$/.test(reference)) return res.status(400).json({ error: 'Invalid transaction reference.' });
    const result = await verifyAndUpdate(reference);
    if (result.error) return res.status(result.status).json({ error: result.error });
    const d = result.donation;
    res.json({ reference: d.reference, status: d.status, amount: minorToMajor(d.amountMinor), currency: d.currency, channel: d.channel, paidAt: d.paidAt, createdAt: d.createdAt });
  } catch (e) {
    console.error('Status verification error:', e.message);
    res.status(502).json({ error: 'Could not verify payment right now. Please try again.' });
  }
});

app.post('/api/paystack/webhook', express.raw({ type: 'application/json', limit: '100kb' }), async (req, res) => {
  try {
    const signature = req.get('x-paystack-signature');
    if (!signature || !config.paystack.secretKey) return res.sendStatus(401);
    const expected = crypto.createHmac('sha512', config.paystack.secretKey).update(req.body).digest('hex');
    const a = Buffer.from(signature, 'hex'), b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.sendStatus(401);
    const event = JSON.parse(req.body.toString('utf8'));
    if (event.event === 'charge.success' && event.data?.reference) {
      const result = await verifyAndUpdate(String(event.data.reference));
      if (result.error) console.warn('Webhook verification mismatch:', result.error);
    } else if (event.event === 'charge.failed' && event.data?.reference) {
      // Verify with Paystack before changing state; never trust webhook payload alone.
      await verifyAndUpdate(String(event.data.reference));
    }
    res.sendStatus(200);
  } catch (e) {
    console.error('Webhook error:', e.message);
    res.sendStatus(500);
  }
});

app.get('/api/admin/csrf', (req, res) => {
  req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  res.json({ csrfToken: req.session.csrfToken });
});
app.post('/api/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 8 }), async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const admin = await Admin.findOne({ email, active: true });
    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) return res.status(401).json({ error: 'Invalid credentials.' });
    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: 'Could not start secure session.' });
      req.session.adminId = String(admin._id);
      req.session.csrfToken = crypto.randomBytes(32).toString('hex');
      res.json({ ok: true, csrfToken: req.session.csrfToken });
    });
  } catch (e) { res.status(500).json({ error: 'Login unavailable.' }); }
});
app.post('/api/admin/logout', requireAdmin, requireCsrf, (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/admin/me', requireAdmin, async (req, res) => res.json({ email: (await Admin.findById(req.session.adminId).select('email')).email }));
app.get('/api/admin/summary', requireAdmin, async (_req, res) => {
  const [success, pending, failed, countSuccess, countPending, countFailed] = await Promise.all([
    Donation.aggregate([{ $match: { status: 'success' } }, { $group: { _id: '$currency', totalMinor: { $sum: '$amountMinor' } } }]),
    Donation.countDocuments({ status: 'pending' }), Donation.countDocuments({ status: 'failed' }),
    Donation.countDocuments({ status: 'success' }), Donation.countDocuments({ status: 'pending' }), Donation.countDocuments({ status: 'failed' })
  ]);
  res.json({ totals: success.map(x => ({ currency: x._id, amount: minorToMajor(x.totalMinor) })), successful: countSuccess, pending: countPending, failed: countFailed });
});
app.get('/api/admin/donations', requireAdmin, async (req, res) => {
  const filter = {};
  if (['success', 'pending', 'failed', 'initialized'].includes(req.query.status)) filter.status = req.query.status;
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(`${req.query.to}T23:59:59.999Z`);
  }
  if (req.query.q) filter.reference = { $regex: String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
  const docs = await Donation.find(filter).sort({ createdAt: -1 }).skip((page - 1) * 50).limit(50).lean();
  res.json({ donations: docs.map(d => ({ ...d, amount: minorToMajor(d.amountMinor), email: d.email })), page });
});
app.get('/api/admin/notifications', requireAdmin, async (_req, res) => {
  const docs = await Notification.find({ status: { $ne: 'sent' } }).sort({ createdAt: -1 }).limit(100).select('-text').lean();
  res.json({ notifications: docs });
});
app.post('/api/admin/notifications/:id/retry', requireAdmin, requireCsrf, async (req, res) => {
  const n = await Notification.findByIdAndUpdate(req.params.id, { $set: { status: 'queued', nextAttemptAt: new Date(), error: '' } }, { new: true });
  if (!n) return res.status(404).json({ error: 'Notification not found.' });
  notifySoon(); res.json({ ok: true });
});
app.get('/api/admin/export.csv', requireAdmin, async (_req, res) => {
  const docs = await Donation.find().sort({ createdAt: -1 }).limit(10000).lean();
  const columns = ['createdAt','reference','status','amount','currency','donorName','anonymous','email','channel','message'];
  const csv = [columns.join(','), ...docs.map(d => {
    const row = { ...d, amount: minorToMajor(d.amountMinor) };
    return columns.map(k => `"${String(row[k] ?? '').replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`).join(',');
  })].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="teddy-tech-donations.csv"');
  res.send(csv);
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API endpoint not found.' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'), err => err && next(err));
});
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'An unexpected error occurred.' });
});

async function start() {
  if (!config.database.mongoUri) {
    console.error('MONGODB_URI is required. Copy .env.example to .env and configure credentials.');
    if (require.main === module) process.exitCode = 1;
    return;
  }
  await mongoose.connect(config.database.mongoUri);
  console.log('Connected to MongoDB');
  // Polling worker is suitable for a persistent Node/Railway process; serverless deployments need a separate worker/scheduler.
  setInterval(() => processNotifications().catch(e => console.error('Notification worker:', e.message)), config.telegram.workerIntervalMs).unref();
  if (require.main === module) app.listen(PORT, () => console.log(`Teddy Tech Inc app listening on ${PORT}`));
}
if (require.main === module) start().catch(e => { console.error('Startup failed:', e.message); process.exit(1); });
module.exports = { app, start, Donation, Admin, Notification, Setting, verifyAndUpdate, processNotifications };
