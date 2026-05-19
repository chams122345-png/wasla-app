# Publish Wasla

Wasla now needs a backend server. Do not deploy it as only static files, because live riders, orders, and GPS need API routes and real-time events.

## Local run

```bash
npm start
```

Open `http://127.0.0.1:5173/`.

## Public hosting

Use a host that supports Node servers, for example:

- Render
- Railway
- Fly.io
- DigitalOcean App Platform
- A VPS

Do not use Netlify Drop for the real-time app. Netlify Drop publishes only static files, so SMS login, `/api/orders`, and live GPS updates will not exist.

## Render quick setup

1. Put this project in a GitHub repository.
2. In Render, create a new Web Service from that repository.
3. Use:
   - Build command: `npm install`
   - Start command: `npm start`
4. Set environment variables:
   - `HOST=0.0.0.0`
   - `DISPATCHER_PHONE=44990000`
   - `AUTH_SECRET=use-a-long-random-secret`
   - `TWILIO_ACCOUNT_SID=...`
   - `TWILIO_AUTH_TOKEN=...`
   - `TWILIO_VERIFY_SERVICE_SID=...`
5. Open the Render HTTPS URL.

The included `render.yaml` can also be used as a Render blueprint.

Twilio Verify is the recommended production OTP setup. If you do not use Twilio Verify, Wasla can also send its own code through Programmable Messaging with either `TWILIO_FROM` or `TWILIO_MESSAGING_SERVICE_SID`.

For Mauritania delivery, use an alphanumeric sender ID or approved messaging service. Numeric sender IDs can fail on Chinguitel.

For production, replace the local JSON file with a real database. If you run more than one backend instance, move OTP rate limits and login sessions into Redis or the database.

## GPS requirement

Phone GPS requires HTTPS outside localhost. If you publish Wasla publicly, use HTTPS or rider phones will not be able to send location reliably.

The current web app sends real high-accuracy GPS while the rider app is open. For whole-day background tracking after the rider locks the phone or switches apps, build a native mobile wrapper or React Native/Expo rider app with background location permission.
