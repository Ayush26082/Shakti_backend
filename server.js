require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');

app.use(express.json());

const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// Serve Shakti logo explicitly
app.get('/shakti-logo.png', (req, res) => {
  res.sendFile(path.join(publicDir, 'shakti-logo.png'));
});

// Simple write queue so two submissions at the same moment don't corrupt leads.json
let writeChain = Promise.resolve();

function appendLead(lead) {
  writeChain = writeChain.then(async () => {
    let leads = [];

    try {
      const raw = await fs.readFile(LEADS_FILE, 'utf8');
      leads = JSON.parse(raw);
    } catch (err) {
      leads = [];
    }

    leads.push(lead);
    await fs.writeFile(LEADS_FILE, JSON.stringify(leads, null, 2));
  });

  return writeChain;
}

function getTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return null;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// Save a quote request, notify the owner, auto-reply to the customer
app.post('/api/quote', async (req, res) => {
  const { name, business, phone, email, need, message } = req.body || {};

  if (!name || !phone || !need) {
    return res.status(400).json({
      success: false,
      error: 'नाम, नंबर और सेवा भरना ज़रूरी है।',
    });
  }

  const lead = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name,
    business: business || '',
    phone,
    email: email || '',
    need,
    message: message || '',
    createdAt: new Date().toISOString(),
  };

  try {
    await appendLead(lead);
  } catch (err) {
    console.error('Could not save lead:', err);

    return res.status(500).json({
      success: false,
      error: 'Request save नहीं हो पाई, कृपया दोबारा कोशिश करें।',
    });
  }

  const transporter = getTransporter();

  if (transporter) {
    const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER;

    if (process.env.OWNER_EMAIL) {
      transporter.sendMail({
        from: fromEmail,
        to: process.env.OWNER_EMAIL,
        subject: `नया Quote Request — ${name}`,
        text:
          `नाम: ${name}\n` +
          `Business: ${business || '-'}\n` +
          `नंबर: ${phone}\n` +
          `Email: ${email || '-'}\n` +
          `ज़रूरत: ${need}\n` +
          `संदेश: ${message || '-'}\n` +
          `समय: ${lead.createdAt}`,
      }).catch(err =>
        console.error('Owner notification email failed:', err)
      );
    }

    if (email) {
      transporter.sendMail({
        from: fromEmail,
        to: email,
        subject: 'Shakti Graphic Solution — आपका Quote Request मिल गया है',
        text:
          `नमस्ते ${name},\n\n` +
          `आपकी "${need}" की request हमें मिल गई है। हमारी टीम जल्द ही आपसे ${phone} पर संपर्क करेगी।\n\n` +
          `तुरंत बात करने के लिए WhatsApp करें: https://wa.me/919888966849\n` +
          `या कॉल करें: +91 98889 66849\n\n` +
          `धन्यवाद,\nShakti Graphic Solution`,
      }).catch(err =>
        console.error('Customer auto-reply email failed:', err)
      );
    }
  } else {
    console.warn(
      'SMTP not configured (.env) — lead saved, but no emails were sent.'
    );
  }

  res.json({ success: true });
});

// Protected view of saved leads
app.get('/api/leads', async (req, res) => {
  if (!process.env.ADMIN_KEY || req.query.key !== process.env.ADMIN_KEY) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
    });
  }

  try {
    const raw = await fs.readFile(LEADS_FILE, 'utf8');
    res.json(JSON.parse(raw));
  } catch (err) {
    res.json([]);
  }
});

app.listen(PORT, () => {
  console.log(`Shakti backend चल रहा है: http://localhost:${PORT}`);
});
