'use strict';

// Central configuration for TEDDY TECH INC DONATION WEBSITE.
// Put private credentials in the server's .env file or hosting-provider secrets.
// Never put real secrets in this file or expose them to frontend code.
require('dotenv').config();

const config = {
  app: {
    name: process.env.APP_NAME || 'Teddy Tech Inc Donation Website',
    nodeEnv: process.env.NODE_ENV || 'development',
    port: Number(process.env.PORT || 3000),
    sessionSecret: process.env.SESSION_SECRET || '',
    trustProxy: process.env.TRUST_PROXY !== 'false'
  },
  database: {
    mongoUri: process.env.MONGODB_URI || '',
    sessionCollection: process.env.MONGODB_SESSION_COLLECTION || 'sessions'
  },
  paystack: {
    apiBaseUrl: 'https://api.paystack.co',
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    secretKey: process.env.PAYSTACK_SECRET_KEY || '',
    currency: (process.env.DEFAULT_CURRENCY || 'KES').toUpperCase(),
    callbackUrl: process.env.PAYSTACK_CALLBACK_URL || '',
    webhookPath: process.env.PAYSTACK_WEBHOOK_PATH || '/api/paystack/webhook'
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    retryMaxAttempts: Number(process.env.TELEGRAM_RETRY_MAX_ATTEMPTS || 8),
    workerIntervalMs: Number(process.env.NOTIFICATION_WORKER_INTERVAL_MS || 15000),
    dailySummaryEnabled: process.env.DAILY_SUMMARY_ENABLED === 'true',
    dailySummaryHourUtc: Number(process.env.DAILY_SUMMARY_HOUR_UTC || 18)
  },
  public: {
    companyName: process.env.PUBLIC_COMPANY_NAME || 'Teddy Tech Inc',
    websiteTitle: process.env.PUBLIC_WEBSITE_TITLE || 'Teddy Tech Inc | Support Our Servers',
    tagline: process.env.PUBLIC_TAGLINE || 'Keep Our Servers Running. Power the Future.',
    secondaryTagline: process.env.PUBLIC_SECONDARY_TAGLINE || 'Your Support Keeps Our Technology Alive.',
    contactEmail: process.env.PUBLIC_CONTACT_EMAIL || '',
    websiteUrl: process.env.PUBLIC_WEBSITE_URL || '',
    telegramUrl: process.env.PUBLIC_TELEGRAM_URL || '',
    whatsappUrl: process.env.PUBLIC_WHATSAPP_URL || '',
    githubUrl: process.env.PUBLIC_GITHUB_URL || '',
    description: process.env.PUBLIC_COMPANY_DESCRIPTION || 'Voluntary contributions help maintain servers, hosting, domains, and technology projects.'
  }
};

module.exports = config;
