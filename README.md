# TEDDY TECH INC DONATION WEBSITE

A full-stack donation website starter for Teddy Tech Inc. It includes a responsive public site, custom donation amounts, Paystack transaction initialization and server-side verification, MongoDB persistence, Telegram administrator notifications, a private administrator dashboard, and CSV export.

> **Deployment note:** This repository is an implementation starter that must be configured and tested with your own Paystack, MongoDB Atlas, and Telegram credentials before accepting live donations. Do not assume payment channels are enabled until confirmed in your Paystack dashboard. Test mode first.

## Stack

- Node.js 20+
- Express
- MongoDB Atlas / Mongoose
- Paystack API
- Telegram Bot API
- HTML, CSS, and browser JavaScript

## Project structure

```text
.
├── public/
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   ├── payment-result.html
│   ├── admin.html
│   └── favicon.svg
├── scripts/create-admin.js
├── server.js
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## Requirements

- Node.js 20 or newer and npm
- A MongoDB Atlas database and connection string
- A Paystack account with API keys
- A Telegram bot and administrator chat ID
- HTTPS domain for production webhooks and payment callbacks

## Local installation

1. Extract the ZIP and open a terminal in the project directory.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and fill in credentials. Never commit `.env`.
4. Configure MongoDB Atlas network access and database user permissions. Prefer limiting access to the backend host when possible.
5. Start the application:

   ```bash
   npm start
   ```

6. Open `http://localhost:3000`.

The server refuses to start if `MONGODB_URI` is missing. Paystack and Telegram keys are required for their respective integrations.

## Environment variables

| Variable | Description |
|---|---|
| `NODE_ENV` | Use `production` in production |
| `PORT` | HTTP port, normally supplied by hosting |
| `MONGODB_URI` | Private MongoDB Atlas connection string |
| `PAYSTACK_PUBLIC_KEY` | Public Paystack key; safe to return as public config |
| `PAYSTACK_SECRET_KEY` | Private Paystack secret key; backend only |
| `TELEGRAM_BOT_TOKEN` | Private Telegram bot token |
| `TELEGRAM_CHAT_ID` | Administrator chat/group ID |
| `SESSION_SECRET` | Long random session signing secret |
| `PAYSTACK_CALLBACK_URL` | Optional absolute URL for the post-payment return page; leave blank to use the callback configured in Paystack or its default |
| `DEFAULT_CURRENCY` | Defaults to `KES`; merchant account must support it |
| `DAILY_SUMMARY_ENABLED` | Reserved configuration flag; daily summary scheduler is not enabled in this starter |
| `DAILY_SUMMARY_HOUR_UTC` | Reserved setting for a future scheduled daily summary |

Optional public contact environment variables read by the frontend configuration endpoint:

- `PUBLIC_CONTACT_EMAIL`
- `PUBLIC_WEBSITE_URL`
- `PUBLIC_TELEGRAM_URL`
- `PUBLIC_WHATSAPP_URL`
- `PUBLIC_GITHUB_URL`

Use only actual official contact details. Do not put secrets in these variables.

## MongoDB Atlas

1. Create a project and database in MongoDB Atlas.
2. Create a database user with a strong password.
3. Set the Network Access rules appropriate for your host. Avoid broad access when your hosting supports fixed egress IPs.
4. Copy the Node.js connection string into `MONGODB_URI`.
5. URL-encode special characters in the database username/password.
6. The application creates collections and indexes through Mongoose models.

Collections include donations, admins, notifications, settings (model ready for use), and session storage.

## Paystack setup

1. Sign in to your Paystack dashboard and obtain test API keys.
2. Put the test public key in `PAYSTACK_PUBLIC_KEY` and test secret key in `PAYSTACK_SECRET_KEY`.
3. Confirm that your account supports the configured currency and desired payment channels. The application defaults to KES; Paystack may reject it if your account/configuration does not support it.
4. Configure a webhook URL pointing to:

   `https://YOUR_BACKEND_HOST/api/paystack/webhook`

5. Optionally set `PAYSTACK_CALLBACK_URL` to the absolute HTTPS URL of your payment result page. If left blank, the app does not send a per-transaction callback URL; configure the callback in your Paystack dashboard if needed.
6. Test initialization, callback return, verification, webhook signature validation, and duplicate webhook delivery in test mode.
7. Only switch to live keys after end-to-end testing and confirmation of enabled payment channels.

Official documentation:
- Paystack API: https://paystack.com/docs/api/
- Paystack transaction initialization: https://paystack.com/docs/api/transaction/
- Paystack webhooks: https://paystack.com/docs/payments/webhooks/
- Paystack supported payment channels/currencies: https://paystack.com/docs/

The backend verifies a transaction with Paystack before marking it successful. It checks reference, amount in minor units, currency, and provider status. Do not change the success logic to trust a redirect or browser-supplied status.

## Telegram notifications

1. Open Telegram and contact the official `@BotFather` account.
2. Send `/newbot` and follow the prompts.
3. Copy the token privately into `TELEGRAM_BOT_TOKEN`. Never publish or commit it.
4. Open the new bot chat and press Start, or add it to the intended admin group and grant appropriate permissions.
5. Obtain the correct chat ID. One way is to send a message to the bot/group, then inspect `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a private browser session. Keep the token URL private and never share screenshots containing it. Group IDs are often negative.
6. Set `TELEGRAM_CHAT_ID` in the backend environment.
7. Test by initializing a test donation and confirming the initiated message arrives. Complete a test payment and confirm a success message arrives only after server-side verification.
8. If delivery fails, check backend logs and the admin dashboard's failed notification list. Eligible notifications can be retried.

Telegram API documentation: https://core.telegram.org/bots/api

The notification queue is stored in MongoDB and retried by the persistent Node process. Telegram failures do not undo a verified payment. Do not send card numbers, CVVs, passwords, or API secrets to Telegram.

## Create the first administrator

Run the command below and enter the administrator email when prompted:

```bash
npm run create-admin
```

Enter a strong password of at least 12 characters. The password is hashed with bcrypt. The script uses the MongoDB connection string. There is no public registration endpoint. For production, run this command in a secure terminal and consider using a hidden-input password prompt.

Open `/admin.html` to log in. Protect the dashboard at the hosting/network layer if you need additional access restrictions.

## Deployment

### Option A: Railway backend (recommended for this starter)

A persistent backend/worker is recommended because it polls MongoDB for notification retries.

1. Push the project to a private or public Git repository (never commit `.env`).
2. Create a Railway project from the repository.
3. Set all backend environment variables in Railway's service Variables panel.
5. Ensure the service start command is `npm start`.
6. Add your custom domain and enable HTTPS.
7. Set the Paystack webhook URL to `https://YOUR_DOMAIN/api/paystack/webhook`.
8. Create the administrator through Railway's shell/command facility where available, or run the admin script locally against the same secured MongoDB URI.
9. Verify `/api/health`, donation initialization in test mode, callback verification, and Telegram delivery.

### Option B: Vercel

The included `vercel.json` is a basic routing hint, not a guarantee of production compatibility. This Express server uses persistent session storage and an in-process notification polling worker. Vercel serverless functions can stop between invocations, so **do not rely on this process as a durable notification worker on Vercel**. For Vercel, deploy the static frontend separately and deploy API routes as serverless functions or use a supported Express adapter; run the notification worker on a persistent service such as Railway. Configure the backend URL/proxy and callback URL accordingly.

### Frontend and backend separately

For a split deployment:
- Host the `public/` files on Vercel.
- Host the Express API and durable worker on Railway.
- Update `public/script.js` to use the backend API origin (and configure CORS and credentials safely), or set up a same-origin reverse proxy.
- Ensure the payment callback URL points to the deployed frontend's `payment-result.html`.
- Use secure cookies and CSRF protection for the admin API. If cross-origin cookies are used, configure exact origins, `SameSite=None; Secure`, and credentials; do not use wildcard CORS.

## Testing checklist

Before live use, verify:

- [ ] MongoDB persistence across restarts.
- [ ] Positive amount and valid email validation.
- [ ] Paystack transaction initialization with test keys.
- [ ] Successful payment verification and amount/currency/reference checks.
- [ ] Pending and failed payment states.
- [ ] Invalid webhook signature rejected.
- [ ] Duplicate webhook delivery does not duplicate success notifications.
- [ ] Telegram temporary errors are retried from MongoDB.
- [ ] Admin login and session protection.
- [ ] Unauthenticated dashboard endpoints return 401.
- [ ] CSV export works and is accessible only after admin login.
- [ ] Secrets do not appear in frontend files or Git.
- [ ] HTTPS, domain, and Paystack webhook configured.
- [ ] Payment channels confirmed enabled in Paystack dashboard.

## Important production hardening

This starter is a foundation, not a substitute for a formal security review. Before launch:
- Add automated integration tests against Paystack test mode and webhook fixtures.
- Add CSRF protection to every state-changing admin endpoint and consider session regeneration/logout invalidation tests.
- Add robust origin allowlisting, audit logs, database backups, and monitoring.
- Restrict transaction amount limits based on current Paystack account rules. Paystack may enforce minimums, maximums, and currency-specific minor-unit behavior.
- Review Paystack's exact currency/amount conventions for your account. This implementation assumes two decimal places (minor units) for KES; confirm provider requirements before production.
- Review how abandoned transactions are classified; an abandoned checkout is not necessarily a provider-confirmed failure.
- Configure durable scheduled jobs for daily summaries if required. The daily summary feature is documented as reserved but is not implemented in this starter.
- Have a qualified developer review and test the application before accepting real money.

## Troubleshooting

- **MongoDB connection error:** Check `MONGODB_URI`, database user credentials, network access rules, and URL-encoded password characters.
- **Paystack initialization fails:** Check API keys, supported currency, account activation, and backend logs. Do not expose secret keys in support messages.
- **No Telegram messages:** Confirm the bot token/chat ID, start the bot or add it to the group, then inspect notification records and backend logs.
- **Webhook returns 401:** Ensure the configured secret matches the Paystack account and the raw request body is preserved for signature verification.
- **Success page shows pending:** Wait briefly and check again. Verify webhook delivery and Paystack transaction status in the dashboard.
- **Admin login fails:** Run `npm run create-admin` with the correct `MONGODB_URI` and password.

## Donation transparency text

“Donations are voluntary contributions intended to support Teddy Tech Inc's server maintenance, hosting infrastructure, and technology development. Donations do not represent investments and do not guarantee financial returns or specific services. Contributions help support these activities, subject to applicable payment fees and operating expenses.”


## Central configuration (`config.js`)

All application configuration is centralized in `config.js`, including runtime, MongoDB, Paystack, Telegram notifications, administrator email, and public company details. The file reads values from environment variables (local `.env` or your hosting provider's secret/config panel). This keeps configuration organized without embedding private keys in source code.

For local development, copy `.env.example` to `.env`. In production, set the same variables in the backend service's environment settings. Keep `PAYSTACK_SECRET_KEY`, `TELEGRAM_BOT_TOKEN`, `MONGODB_URI`, and `SESSION_SECRET` private and backend-only. `PAYSTACK_PUBLIC_KEY` may be returned to the browser for checkout initialization, but the secret key must never be exposed.

The `PUBLIC_*` variables are public company/contact settings and may be returned by `/api/config`. Set only contact links and details you actually own. `PAYSTACK_CALLBACK_URL` should point to the public payment result page, for example `https://your-domain.example/payment-result.html`. The webhook endpoint is `/api/paystack/webhook`; configure that full HTTPS URL in Paystack.
