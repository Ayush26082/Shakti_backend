# Shakti Graphic Solution — Website + Backend

This folder has everything: the landing page (`public/index.html`) and a small
Node.js server (`server.js`) that receives the "Free Quote" form, saves each
request, emails you a notification, and auto-replies to the customer if they
gave an email address.

## What it does

1. Visitor fills the quote form and submits.
2. The server saves the request to `data/leads.json`.
3. If SMTP is configured, it emails you (`OWNER_EMAIL`) the details.
4. If the visitor gave an email, it sends them a short auto-reply confirming
   the request and sharing your WhatsApp/phone number.
5. The WhatsApp and "Call now" buttons on the page keep working regardless —
   they don't depend on the backend at all.

## 1. Install

You need [Node.js](https://nodejs.org) 18 or newer installed.

```bash
cd shakti-backend
npm install
```

## 2. Configure email

```bash
cp .env.example .env
```

Then edit `.env`:
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — your email provider's
  SMTP details. For Gmail: turn on 2-Step Verification, then create an
  **App Password** and use that as `SMTP_PASS` (your normal Gmail password
  won't work).
- `OWNER_EMAIL` — where you want new-request notifications sent.
- `ADMIN_KEY` — any random secret string, used to view saved leads.

If you skip this step, the site still works — requests are saved, just no
emails go out.

## 3. Run it

```bash
npm start
```

Visit `http://localhost:3000` — you'll see the landing page, and the form now
submits to the backend.

## 4. View saved leads

Open this in a browser (replace with your real admin key from `.env`):

```
http://localhost:3000/api/leads?key=YOUR_ADMIN_KEY
```

## 5. Deploying it

Any host that runs Node.js works: **Render**, **Railway**, or a VPS. Steps
are the same everywhere:
1. Upload this whole folder (or connect your Git repo).
2. Set the environment variables from `.env` in the host's dashboard —
   don't upload your real `.env` file anywhere public.
3. Set the start command to `npm start`.
4. Point your domain (e.g. the one from the "Domain" service on the page) at
   the host.

If your hosting only offers PHP/shared hosting (common with cheap Indian
hosting plans) and not Node.js, let me know — that needs a different backend
written in PHP instead of this one.

## Notes

- Leads are stored in a plain JSON file (`data/leads.json`), which is enough
  for a small business getting a modest number of enquiries. If volume grows
  a lot, this can be swapped for a real database later.
- Keep `.env` and `data/leads.json` out of any public Git repository — they
  can contain customer contact details.
