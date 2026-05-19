# Wasla Real-Time App

Wasla is now an Arabic real-time delivery app foundation for Mauritania, starting with Nouakchott and Nouadhibou.

It is no longer only a static mockup. It has a local Node backend, server-side data storage, SMS-code login, protected role access, real-time updates, rider creation, customer orders, and phone GPS submission from rider accounts.

## One app, three roles

Wasla stays as one app. The customer, rider, and dispatcher experiences are different roles inside the same product, not separate apps.

The app starts with phone login, sends a 6-digit SMS code, and then shows only the correct role after the code is confirmed:

- Customer: request and track deliveries
- Rider: accept and complete jobs
- Dispatcher: manage orders, motors, pricing, and assignments

Local access:

- Customer: any normal phone number
- Rider: a phone number added by the dispatcher
- Dispatcher: `44990000` by default, or set `DISPATCHER_PHONE`

## What is included

- Arabic interface with right-to-left layout
- SMS-code phone login before entering the app
- Signed login tokens after SMS confirmation, so API actions are not opened by only typing a phone number
- Server-side role filtering so customers do not receive dispatcher fleet data
- Customer role: pickup/dropoff, package details, payment, quote, and request flow
- Customer tracking: customers see only the rider assigned to their own order
- Rider role: job queue, pickup/dropoff steps, delivery status actions, and mandatory phone GPS while logged in
- Dispatcher role: active orders, rider assignment, fleet availability, city pricing, add riders, add phone-call deliveries for customers, and live map tracking for all riders
- Server-Sent Events for live updates between dispatcher, rider, and customer screens
- JSON data store at runtime under `data/state.json`
- Local area options for Nouakchott and Nouadhibou
- Estimated price, delivery time, and distance
- Mauritania-inspired courier visual

## GPS rule

Rider GPS is not optional in Wasla. A rider account is expected to share phone GPS while on duty.

The app uses high-accuracy phone GPS, continuous watch updates, and a 10-second refresh while the rider is logged in. The backend stores latitude, longitude, accuracy, speed, heading, and timestamp, then broadcasts updates to dispatcher and customer screens.

The backend also blocks rider delivery status updates unless that rider has sent a fresh GPS point in the last 2 minutes.

Important real-world detail: iPhone and Android still control location permission. The real production app should require location permission before the rider can go online, run over HTTPS, and use a native/mobile wrapper for all-day background GPS. A browser/PWA can track accurately while open, but it cannot guarantee whole-day background GPS on every phone.

## SMS setup

Local development shows a test code on the login screen so the flow can be tested without spending SMS credit.

For public launch, set these environment variables on the server:

```text
AUTH_SECRET=use-a-long-random-secret
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_VERIFY_SERVICE_SID=your_twilio_verify_service_sid
```

`TWILIO_VERIFY_SERVICE_SID` is the recommended production OTP setup. If you do not use Twilio Verify, Wasla can also send its own code through Programmable Messaging with either `TWILIO_FROM` or `TWILIO_MESSAGING_SERVICE_SID`.

For Mauritania, use an alphanumeric sender ID or approved messaging service. Twilio notes that numeric sender IDs can fail on Chinguitel.

## Run locally

```bash
npm start
```

Then open:

```text
http://127.0.0.1:5173/
```

## Production next steps

- Replace local JSON storage with PostgreSQL or Firebase/Supabase.
- Add the production SMS provider credentials.
- Move OTP rate limits and sessions to Redis or the database if running more than one server instance.
- Deploy the backend to a Node-capable host.
- Serve the app over HTTPS so phone GPS works on real devices.
- Build mobile wrappers or a React Native/Expo app for stronger background GPS behavior.

Static hosting warning: Wasla will not work correctly on a static-only Netlify Drop link because the app needs the Node backend. Use Render, Railway, Fly.io, DigitalOcean, or a VPS.

## Name direction

Recommended working name: **Wasla**

Why it works:
- Short and easy to say
- Feels connected to delivery and connection
- Works well as an app name and icon
- Not locked to only one city

Other possible names:
- Tawsiila
- MauriMoto
- Sarii
- Zeyna Express
- Rakib

Before using a final name publicly, check domain, app store, and trademark availability.
