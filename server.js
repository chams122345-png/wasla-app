const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");

const root = __dirname;
const dataDir = path.join(root, "data");
const dataFile = path.join(dataDir, "state.json");
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";
const dispatcherPhone = normalizePhone(process.env.DISPATCHER_PHONE || "44990000");
const authSecret = process.env.AUTH_SECRET || "wasla-dev-secret-change-before-public-launch";
const sessionTtlMs = 30 * 24 * 60 * 60 * 1000;
const otpTtlMs = 5 * 60 * 1000;
const otpMaxAttempts = 5;
const otpWindowMs = 10 * 60 * 1000;
const otpMaxRequestsPerWindow = 5;
const otpStore = new Map();
const otpRateLimit = new Map();

const cities = {
  nouakchott: {
    label: "نواكشوط",
    zones: ["تفرغ زينة", "لكصر", "السبخة", "عرفات", "دار النعيم", "توجنين"],
    center: { lat: 18.0735, lng: -15.9582 },
    bounds: { north: 18.14, south: 17.99, east: -15.84, west: -16.08 },
    avg: "31 د",
  },
  nouadhibou: {
    label: "نواذيبو",
    zones: ["كانصادو", "نومروات", "دبي", "السوق المركزي", "منطقة الميناء", "الترحيل"],
    center: { lat: 20.93, lng: -17.035 },
    bounds: { north: 21.02, south: 20.84, east: -16.91, west: -17.12 },
    avg: "34 د",
  },
};

const clients = new Set();

function defaultState() {
  return {
    orderSequence: 1104,
    prices: {
      nouakchott: 90,
      nouadhibou: 100,
    },
    riderEarnings: {
      nouakchott: 0,
      nouadhibou: 0,
    },
    riders: [],
    orders: [],
  };
}

function ensureDataFile() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify(defaultState(), null, 2));
  }
}

function readState() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(dataFile, "utf8"));
}

function writeState(state) {
  fs.writeFileSync(dataFile, JSON.stringify(state, null, 2));
  broadcast();
}

function publicState(phone = "") {
  const state = readState();
  const account = phone ? findRole(state, normalizePhone(phone)) : null;

  if (account?.role === "dispatcher") {
    return {
      ...state,
      cities,
      dispatcherPhone,
    };
  }

  if (account?.role === "rider") {
    const rider = state.riders.find((item) => normalizePhone(item.phone) === account.phone);
    return {
      ...state,
      cities,
      dispatcherPhone: "",
      riders: rider ? [rider] : [],
      orders: state.orders.filter(
        (order) => order.rider === rider?.name || (order.status === "Urgent" && order.city === rider?.city),
      ),
    };
  }

  if (account?.role === "customer") {
    const ownOrders = state.orders.filter((order) => order.customerPhone === account.phone);
    const assignedNames = new Set(ownOrders.map((order) => order.rider).filter(Boolean));
    return {
      ...state,
      cities,
      dispatcherPhone: "",
      riders: state.riders
        .filter((rider) => assignedNames.has(rider.name))
        .map((rider) => ({
          name: rider.name,
          city: rider.city,
          zone: rider.zone,
          status: rider.status,
          lastSeen: rider.lastSeen,
          location: rider.location,
        })),
      orders: ownOrders,
    };
  }

  return {
    ...defaultState(),
    prices: state.prices,
    cities,
    dispatcherPhone: "",
  };
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length > 8 ? digits.slice(-8) : digits;
}

function toE164(rawPhone, phone) {
  const text = String(rawPhone || "").trim();
  const digits = text.replace(/\D/g, "");
  if (text.startsWith("+")) return `+${digits}`;
  if (digits.startsWith("222") && digits.length >= 11) return `+${digits}`;
  return `+222${phone}`;
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function consumeOtpRateLimit(key) {
  const now = Date.now();
  const bucket = otpRateLimit.get(key);
  if (!bucket || bucket.resetAt <= now) {
    otpRateLimit.set(key, { count: 1, resetAt: now + otpWindowMs });
    return true;
  }
  if (bucket.count >= otpMaxRequestsPerWindow) return false;
  bucket.count += 1;
  return true;
}

function createSessionToken(account) {
  const encoded = Buffer.from(
    JSON.stringify({
      phone: account.phone,
      issuedAt: Date.now(),
      expiresAt: Date.now() + sessionTtlMs,
    }),
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", authSecret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifySessionToken(token) {
  const [encoded, signature] = String(token || "").split(".");
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac("sha256", authSecret).update(encoded).digest("base64url");
  if (!timingSafeEqualText(signature, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!payload.phone || Date.now() > payload.expiresAt) return null;
    return { phone: normalizePhone(payload.phone) };
  } catch {
    return null;
  }
}

function readSessionToken(req, url) {
  const authHeader = req.headers.authorization || "";
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  return bearerMatch?.[1] || url.searchParams.get("token") || "";
}

function accountFromRequest(req, state, url) {
  const session = verifySessionToken(readSessionToken(req, url));
  return session ? findRole(state, session.phone) : null;
}

function requireAccount(req, res, state, url) {
  const account = accountFromRequest(req, state, url);
  if (!account) {
    sendJson(res, 401, { error: "يجب تأكيد رقم الهاتف برمز SMS أولا." });
    return null;
  }
  return account;
}

function hasVerifyProvider() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_VERIFY_SERVICE_SID,
  );
}

function hasMessagingProvider() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID),
  );
}

function twilioAuthHeader() {
  return `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString(
    "base64",
  )}`;
}

async function postTwilioForm(url, params) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: twilioAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || "تعذر الاتصال بخدمة SMS الآن.");
  }
  return payload;
}

async function startTwilioVerification(rawPhone, phone) {
  const to = toE164(rawPhone, phone);
  await postTwilioForm(
    `https://verify.twilio.com/v2/Services/${process.env.TWILIO_VERIFY_SERVICE_SID}/Verifications`,
    new URLSearchParams({
      To: to,
      Channel: "sms",
      Locale: "ar",
    }),
  );
  return { mode: "verify" };
}

async function checkTwilioVerification(phone, code) {
  const to = toE164("", phone);
  const payload = await postTwilioForm(
    `https://verify.twilio.com/v2/Services/${process.env.TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`,
    new URLSearchParams({
      To: to,
      Code: code,
    }),
  );
  return payload.status === "approved";
}

async function sendLocalOrMessagingSms(rawPhone, phone, code) {
  const to = toE164(rawPhone, phone);
  if (hasMessagingProvider()) {
    const params = new URLSearchParams({
      To: to,
      Body: `رمز الدخول إلى وصلة هو ${code}. صالح لمدة 5 دقائق.`,
    });
    if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
      params.set("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID);
    } else {
      params.set("From", process.env.TWILIO_FROM);
    }

    await postTwilioForm(
      `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
      params,
    );
    return { mode: "sms" };
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("خدمة SMS غير مفعلة على الخادم.");
  }

  console.log(`Wasla local SMS code for ${to}: ${code}`);
  return { mode: "local", devCode: code };
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function emit(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcast() {
  clients.forEach((client) => {
    emit(client.res, { type: "state", state: publicState(client.phone) });
  });
}

function activeOrders(state, city) {
  return state.orders.filter((order) => order.city === city && order.status !== "Delivered");
}

function findRole(state, phone) {
  if (phone === dispatcherPhone) {
    return { role: "dispatcher", name: "مشرف وصلة", phone };
  }

  const rider = state.riders.find((item) => normalizePhone(item.phone) === phone);
  if (rider) {
    return { role: "rider", name: rider.name, phone, riderName: rider.name, city: rider.city };
  }

  return { role: "customer", name: "زبون وصلة", phone };
}

function hasFreshLocation(rider) {
  if (!rider?.location?.updatedAt) return false;
  const updatedAt = Date.parse(rider.location.updatedAt);
  return Number.isFinite(updatedAt) && Date.now() - updatedAt <= 2 * 60 * 1000;
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

async function handleApi(req, res, url) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    const state = readState();
    const account = accountFromRequest(req, state, url);
    sendJson(res, 200, publicState(account?.phone || ""));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    const state = readState();
    const account = accountFromRequest(req, state, url);
    if (!account) {
      sendJson(res, 401, { error: "يجب تأكيد رقم الهاتف برمز SMS أولا." });
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    const client = { res, phone: account.phone };
    clients.add(client);
    emit(res, { type: "state", state: publicState(client.phone) });
    req.on("close", () => clients.delete(client));
    return;
  }

  const body = req.method === "POST" ? await readJson(req) : {};
  const state = readState();

  if (req.method === "POST" && url.pathname === "/api/auth/request-code") {
    const rawPhone = String(body.phone || "").trim();
    const phone = normalizePhone(rawPhone);
    if (phone.length < 6) {
      sendJson(res, 400, { error: "رقم الهاتف غير صحيح." });
      return;
    }
    const ip = req.socket.remoteAddress || "local";
    if (!consumeOtpRateLimit(`phone:${phone}`) || !consumeOtpRateLimit(`ip:${ip}`)) {
      sendJson(res, 429, { error: "محاولات كثيرة. انتظر قليلا ثم حاول مرة أخرى." });
      return;
    }

    let sms;
    try {
      if (hasVerifyProvider()) {
        sms = await startTwilioVerification(rawPhone, phone);
      } else {
        const code = generateOtp();
        otpStore.set(phone, {
          code,
          attempts: 0,
          expiresAt: Date.now() + otpTtlMs,
          rawPhone,
        });
        sms = await sendLocalOrMessagingSms(rawPhone, phone, code);
      }
    } catch (error) {
      otpStore.delete(phone);
      sendJson(res, 503, { error: error.message || "تعذر إرسال رمز SMS الآن." });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      mode: sms.mode,
      devCode: process.env.NODE_ENV === "production" ? undefined : sms.devCode,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/verify-code") {
    const phone = normalizePhone(body.phone);
    const code = String(body.code || "").replace(/\D/g, "");
    if (code.length !== 6) {
      sendJson(res, 400, { error: "رمز SMS غير صحيح." });
      return;
    }

    if (hasVerifyProvider()) {
      let approved = false;
      try {
        approved = await checkTwilioVerification(phone, code);
      } catch (error) {
        sendJson(res, 503, { error: error.message || "تعذر تأكيد رمز SMS الآن." });
        return;
      }
      if (!approved) {
        sendJson(res, 400, { error: "رمز SMS غير صحيح." });
        return;
      }
      const account = findRole(state, phone);
      sendJson(res, 200, {
        account,
        token: createSessionToken(account),
        state: publicState(phone),
      });
      return;
    }

    const saved = otpStore.get(phone);
    if (!saved || saved.expiresAt <= Date.now()) {
      otpStore.delete(phone);
      sendJson(res, 400, { error: "انتهت صلاحية الرمز. اطلب رمزا جديدا." });
      return;
    }
    if (saved.attempts >= otpMaxAttempts) {
      otpStore.delete(phone);
      sendJson(res, 429, { error: "محاولات كثيرة. اطلب رمزا جديدا." });
      return;
    }
    if (!timingSafeEqualText(saved.code, code)) {
      saved.attempts += 1;
      sendJson(res, 400, { error: "رمز SMS غير صحيح." });
      return;
    }

    otpStore.delete(phone);
    const account = findRole(state, phone);
    sendJson(res, 200, {
      account,
      token: createSessionToken(account),
      state: publicState(phone),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    sendJson(res, 410, { error: "الدخول الآن يتم برمز SMS فقط." });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/riders") {
    const account = requireAccount(req, res, state, url);
    if (!account) return;
    if (account.role !== "dispatcher") {
      sendJson(res, 403, { error: "هذه العملية للمشرف فقط." });
      return;
    }

    const name = String(body.name || "").trim();
    const phone = normalizePhone(body.phone);
    const city = body.city;
    const zone = body.zone;

    if (!name || phone.length < 6 || !cities[city] || !cities[city].zones.includes(zone)) {
      sendJson(res, 400, { error: "بيانات الراكب غير مكتملة." });
      return;
    }

    if (state.riders.some((rider) => normalizePhone(rider.phone) === phone)) {
      sendJson(res, 409, { error: "هذا الرقم مسجل لراكب آخر." });
      return;
    }

    state.riders.push({
      name,
      phone,
      city,
      zone,
      status: "Available",
      load: "جاهز",
      lastSeen: "لم يرسل GPS بعد",
      location: null,
    });
    writeState(state);
    sendJson(res, 201, { state: publicState(account.phone) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/orders") {
    const account = requireAccount(req, res, state, url);
    if (!account) return;
    const isDispatcher = account.role === "dispatcher";
    const customerPhone = isDispatcher ? normalizePhone(body.customerPhone) : account.phone;
    const city = body.city;
    if (!customerPhone || !cities[city]) {
      sendJson(res, 400, { error: "بيانات الطلب غير صحيحة." });
      return;
    }

    const availableRider = state.riders.find(
      (rider) => rider.city === city && rider.status === "Available",
    );
    const distance = Number(body.distance || 2.4);
    const fee = Number(body.fee || state.prices[city] + distance * 12);
    const eta = Number(body.eta || 20);

    const order = {
      id: `WS-${state.orderSequence}`,
      city,
      pickup: String(body.pickup || ""),
      dropoff: String(body.dropoff || ""),
      pickupAddress: String(body.pickupAddress || ""),
      dropoffAddress: String(body.dropoffAddress || ""),
      recipientPhone: normalizePhone(body.recipientPhone),
      customerPhone,
      packageSize: body.packageSize || "small",
      payment: String(body.payment || ""),
      fee: Math.round(fee),
      eta: Math.round(eta),
      status: availableRider ? "Assigned" : "Urgent",
      rider: availableRider ? availableRider.name : "بانتظار راكب",
      source: isDispatcher && body.source === "phone_call" ? "phone_call" : "customer_app",
      createdBy: isDispatcher ? "dispatcher" : "customer",
      createdAt: new Date().toISOString(),
    };
    state.orderSequence += 1;
    state.orders.unshift(order);

    if (availableRider) {
      availableRider.status = "Busy";
      availableRider.load = "طلب واحد";
      availableRider.zone = order.pickup;
      availableRider.lastSeen = availableRider.location ? "GPS محفوظ" : "لم يرسل GPS بعد";
    }

    writeState(state);
    sendJson(res, 201, {
      order,
      state: publicState(account.phone),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/rider/location") {
    const account = requireAccount(req, res, state, url);
    if (!account) return;
    if (account.role !== "rider") {
      sendJson(res, 403, { error: "إرسال GPS خاص بحساب الراكب فقط." });
      return;
    }
    const phone = account.phone;
    const rider = state.riders.find((item) => normalizePhone(item.phone) === phone);
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!rider || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      sendJson(res, 400, { error: "تعذر حفظ GPS." });
      return;
    }

    rider.location = {
      lat: Number(lat.toFixed(8)),
      lng: Number(lng.toFixed(8)),
      accuracy: Math.round(Number(body.accuracy || 0)),
      speed: Number.isFinite(Number(body.speed)) ? Number(body.speed) : null,
      heading: Number.isFinite(Number(body.heading)) ? Number(body.heading) : null,
      updatedAt: Number.isFinite(Number(body.timestamp))
        ? new Date(Number(body.timestamp)).toISOString()
        : new Date().toISOString(),
    };
    rider.lastSeen = "GPS الآن";
    writeState(state);
    sendJson(res, 200, { rider, state: publicState(phone) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/pricing") {
    const account = requireAccount(req, res, state, url);
    if (!account) return;
    if (account.role !== "dispatcher") {
      sendJson(res, 403, { error: "هذه العملية للمشرف فقط." });
      return;
    }

    const city = body.city;
    const baseFee = Number(body.baseFee);
    if (!cities[city] || !Number.isFinite(baseFee) || baseFee < 50) {
      sendJson(res, 400, { error: "السعر الأساسي غير صحيح." });
      return;
    }

    state.prices[city] = Math.round(baseFee);
    writeState(state);
    sendJson(res, 200, { state: publicState(account.phone) });
    return;
  }

  const orderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/(advance|assign)$/);
  if (req.method === "POST" && orderMatch) {
    const [, orderId, action] = orderMatch;
    const account = requireAccount(req, res, state, url);
    if (!account) return;
    const order = state.orders.find((item) => item.id === orderId);
    if (!order) {
      sendJson(res, 404, { error: "الطلب غير موجود." });
      return;
    }

    if (action === "assign") {
      if (account.role !== "dispatcher") {
        sendJson(res, 403, { error: "هذه العملية للمشرف فقط." });
        return;
      }
      const rider = state.riders.find(
        (item) => item.city === order.city && item.status === "Available",
      );
      if (!rider) {
        sendJson(res, 409, { error: "لا يوجد راكب متاح الآن." });
        return;
      }
      order.rider = rider.name;
      order.status = "Assigned";
      rider.status = "Busy";
      rider.load = "طلب واحد";
      rider.zone = order.pickup;
    } else {
      if (account.role !== "dispatcher" && account.role !== "rider") {
        sendJson(res, 403, { error: "تحديث حالة الطلب للراكب أو المشرف فقط." });
        return;
      }
      if (account.role === "rider") {
        const currentRider = state.riders.find((item) => normalizePhone(item.phone) === account.phone);
        if (!hasFreshLocation(currentRider)) {
          sendJson(res, 403, { error: "يجب إرسال GPS حديث قبل تحديث الطلب." });
          return;
        }
      }
      const nextStatus = {
        Urgent: "Assigned",
        Assigned: "Pickup",
        Pickup: "Delivering",
        Delivering: "Delivered",
      };
      if (account.role === "rider" && order.rider !== account.riderName && order.status !== "Urgent") {
        sendJson(res, 403, { error: "هذا الطلب ليس لهذا الراكب." });
        return;
      }

      if (order.status === "Urgent") {
        const rider =
          account.role === "rider"
            ? state.riders.find((item) => normalizePhone(item.phone) === account.phone)
            : state.riders.find((item) => item.city === order.city && item.status === "Available");
        if (!rider || rider.status !== "Available") {
          sendJson(res, 409, { error: "لا يوجد راكب متاح الآن." });
          return;
        }
        order.rider = rider.name;
        rider.status = "Busy";
        rider.load = "طلب واحد";
        rider.zone = order.pickup;
      }

      order.status = nextStatus[order.status] || "Assigned";
      if (order.status === "Delivered") {
        const rider = state.riders.find((item) => item.name === order.rider);
        if (rider) {
          rider.status = "Available";
          rider.load = "جاهز";
          rider.zone = order.dropoff;
        }
        state.riderEarnings[order.city] = (state.riderEarnings[order.city] || 0) + order.fee;
      }
    }

    writeState(state);
    sendJson(res, 200, { order, state: publicState(account.phone) });
    return;
  }

  sendJson(res, 404, { error: "API endpoint not found." });
}

function serveStatic(req, res, url) {
  let filePath = decodeURIComponent(url.pathname);
  if (filePath === "/") filePath = "/index.html";
  const resolved = path.normalize(path.join(root, filePath));
  if (!resolved.startsWith(root) || resolved.startsWith(dataDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(resolved, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(resolved);
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".webmanifest": "application/manifest+json; charset=utf-8",
      ".png": "image/png",
      ".txt": "text/plain; charset=utf-8",
    };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url).catch((error) => {
      sendJson(res, 500, { error: error.message || "Server error" });
    });
    return;
  }
  serveStatic(req, res, url);
});

server.listen(port, host, () => {
  ensureDataFile();
  if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET) {
    console.warn("Set AUTH_SECRET before public launch.");
  }
  if (process.env.NODE_ENV === "production" && !hasVerifyProvider() && !hasMessagingProvider()) {
    console.warn("Set Twilio Verify or SMS environment variables before public launch.");
  }
  console.log(`Wasla real-time server running on http://${host}:${port}`);
});
