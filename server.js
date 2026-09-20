require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// Paths
const publicDir = path.join(__dirname, 'public');
const dataDir = path.join(__dirname, 'data');
const LEADS_FILE = path.join(dataDir, 'leads.json');

// Middleware
app.use(express.json());

// Serve all files from public/
app.use(express.static(publicDir));

// Explicitly serve Shakti logo
app.get('/shakti-logo.png', async (req, res) => {
  try {
    const logoPath = path.join(publicDir, 'shakti-logo.png');

    await fs.access(logoPath);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    res.sendFile(logoPath);
  } catch (err) {
    console.error('Logo not found:', err);
    res.status(404).send('Logo not found');
  }
});

// Explicitly serve favicon
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(publicDir, 'shakti-logo.png'));
});

// Simple write queue so simultaneous submissions don't corrupt leads.json
let writeChain = Promise.resolve();

async function ensureDataFile() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(LEADS_FILE);
  } catch {
    await fs.writeFile(LEADS_FILE, '[]', 'utf8');
  }
}

function appendLead(lead) {
  writeChain = writeChain.then(async () => {
    await ensureDataFile();

    let leads = [];

    try {
      const raw = await fs.readFile(LEADS_FILE, 'utf8');
      leads = JSON.parse(raw);

      if (!Array.isArray(leads)) {
        leads = [];
      }
    } catch (err) {
      leads = [];
    }

    leads.push(lead);

    await fs.writeFile(
      LEADS_FILE,
      JSON.stringify(leads, null, 2),
      'utf8'
    );
  });

  return writeChain;
}

// SMTP configuration
function getTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    return null;
  }

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Shakti backend is running',
  });
});

// Save quote request
app.post('/api/quote', async (req, res) => {
  const {
    name,
    business,
    phone,
    email,
    need,
    message,
  } = req.body || {};

  // Validation
  if (!name || !phone || !need) {
    return res.status(400).json({
      success: false,
      error: 'नाम, नंबर और सेवा भरना ज़रूरी है।',
    });
  }

  const lead = {
    id:
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 7),

    name: String(name).trim(),
    business: business ? String(business).trim() : '',
    phone: String(phone).trim(),
    email: email ? String(email).trim() : '',
    need: String(need).trim(),
    message: message ? String(message).trim() : '',
    createdAt: new Date().toISOString(),
  };

  // Save lead
  try {
    await appendLead(lead);
  } catch (err) {
    console.error('Could not save lead:', err);

    return res.status(500).json({
      success: false,
      error:
        'Request save नहीं हो पाई, कृपया दोबारा कोशिश करें।',
    });
  }

  // Email
  const transporter = getTransporter();

  if (transporter) {
    const fromEmail =
      process.env.FROM_EMAIL || process.env.SMTP_USER;

    // Owner notification
    if (process.env.OWNER_EMAIL) {
      transporter
        .sendMail({
          from: fromEmail,
          to: process.env.OWNER_EMAIL,
          subject: `नया Quote Request — ${lead.name}`,
          text:
            `नाम: ${lead.name}\n` +
            `Business: ${lead.business || '-'}\n` +
            `नंबर: ${lead.phone}\n` +
            `Email: ${lead.email || '-'}\n` +
            `ज़रूरत: ${lead.need}\n` +
            `संदेश: ${lead.message || '-'}\n` +
            `समय: ${lead.createdAt}\n`,
        })
        .then(() => {
          console.log('Owner notification email sent');
        })
        .catch((err) => {
          console.error(
            'Owner notification email failed:',
            err
          );
        });
    }

    // Customer auto-reply
    if (lead.email) {
      transporter
        .sendMail({
          from: fromEmail,
          to: lead.email,
          subject:
            'Shakti Graphic Solution — आपका Quote Request मिल गया है',

          text:
            `नमस्ते ${lead.name},\n\n` +
            `आपकी "${lead.need}" की request हमें मिल गई है।\n\n` +
            `हमारी टीम जल्द ही आपसे ${lead.phone} पर संपर्क करेगी।\n\n` +
            `तुरंत बात करने के लिए WhatsApp करें:\n` +
            `https://wa.me/919888966849\n\n` +
            `या कॉल करें:\n` +
            `+91 98889 66849\n\n` +
            `धन्यवाद,\n` +
            `Shakti Graphic Solution`,
        })
        .then(() => {
          console.log('Customer auto-reply email sent');
        })
        .catch((err) => {
          console.error(
            'Customer auto-reply email failed:',
            err
          );
        });
    }
  } else {
    console.warn(
      'SMTP not configured — lead saved, but no email was sent.'
    );
  }

  return res.json({
    success: true,
    message: 'Quote request received successfully',
    leadId: lead.id,
  });
});

// Protected leads API
app.get('/api/leads', async (req, res) => {
  if (
    !process.env.ADMIN_KEY ||
    req.query.key !== process.env.ADMIN_KEY
  ) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
    });
  }

  try {
    await ensureDataFile();

    const raw = await fs.readFile(
      LEADS_FILE,
      'utf8'
    );

    const leads = JSON.parse(raw);

    return res.json(leads);
  } catch (err) {
    console.error('Could not read leads:', err);

    return res.json([]);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(
    `Shakti backend चल रहा है: http://localhost:${PORT}`
  );
});
