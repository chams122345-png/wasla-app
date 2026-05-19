const apiBase = location.protocol === "file:" ? "http://127.0.0.1:5173" : "";

const state = {
  city: "nouakchott",
  user: null,
  authToken: "",
  data: null,
  selectedMapRider: null,
};

const authFlow = {
  stage: "phone",
  phone: "",
};

const roleText = {
  customer: "زبون",
  rider: "راكب",
  dispatcher: "مشرف",
};

const statusText = {
  Assigned: "تم التعيين",
  Pickup: "في الاستلام",
  Delivering: "قيد التوصيل",
  Delivered: "تم التسليم",
  Urgent: "بحاجة لراكب",
};

const riderStatusText = {
  Available: "متاح",
  Busy: "مشغول",
};

const sizeFees = {
  small: 0,
  medium: 20,
  large: 40,
};

let locationWatchId = null;
let locationRefreshId = null;
let events = null;

const loginView = document.querySelector("#loginView");
const authenticatedApp = document.querySelector("#authenticatedApp");
const loginForm = document.querySelector("#loginForm");
const loginPhone = document.querySelector("#loginPhone");
const loginCode = document.querySelector("#loginCode");
const otpField = document.querySelector("#otpField");
const otpHint = document.querySelector("#otpHint");
const loginSubmit = document.querySelector("#loginSubmit");
const changePhone = document.querySelector("#changePhone");
const roleLabel = document.querySelector("#roleLabel");
const accountName = document.querySelector("#accountName");
const logoutButton = document.querySelector("#logoutButton");
const cityTabsShell = document.querySelector("#cityTabs");
const citySelect = document.querySelector("#city");
const pickupSelect = document.querySelector("#pickup");
const dropoffSelect = document.querySelector("#dropoff");
const packageSize = document.querySelector("#packageSize");
const quoteFee = document.querySelector("#quoteFee");
const quoteEta = document.querySelector("#quoteEta");
const quoteDistance = document.querySelector("#quoteDistance");
const cityStatus = document.querySelector("#cityStatus");
const riderCityStatus = document.querySelector("#riderCityStatus");
const riderIdentity = document.querySelector("#riderIdentity");
const riderLocationStatus = document.querySelector("#riderLocationStatus");
const dispatcherCityStatus = document.querySelector("#dispatcherCityStatus");
const motorCount = document.querySelector("#motorCount");
const todayOrders = document.querySelector("#todayOrders");
const averageTime = document.querySelector("#averageTime");
const ordersList = document.querySelector("#ordersList");
const customerTracking = document.querySelector("#customerTracking");
const dispatchOrdersList = document.querySelector("#dispatchOrdersList");
const orderCount = document.querySelector("#orderCount");
const riderList = document.querySelector("#riderList");
const jobList = document.querySelector("#jobList");
const riderEarnings = document.querySelector("#riderEarnings");
const riderOpenJobs = document.querySelector("#riderOpenJobs");
const nextRouteEta = document.querySelector("#nextRouteEta");
const shareLocation = document.querySelector("#shareLocation");
const liveMapCount = document.querySelector("#liveMapCount");
const mapMarkers = document.querySelector("#mapMarkers");
const mapRiderDetails = document.querySelector("#mapRiderDetails");
const unassignedCount = document.querySelector("#unassignedCount");
const busyCount = document.querySelector("#busyCount");
const cashDue = document.querySelector("#cashDue");
const baseFeeInput = document.querySelector("#baseFee");
const pricingTitle = document.querySelector("#pricingTitle");
const savePricing = document.querySelector("#savePricing");
const form = document.querySelector("#deliveryForm");
const dispatcherOrderForm = document.querySelector("#dispatcherOrderForm");
const dispatchCustomerPhone = document.querySelector("#dispatchCustomerPhone");
const dispatchRecipientPhone = document.querySelector("#dispatchRecipientPhone");
const dispatchPickup = document.querySelector("#dispatchPickup");
const dispatchDropoff = document.querySelector("#dispatchDropoff");
const dispatchPickupAddress = document.querySelector("#dispatchPickupAddress");
const dispatchDropoffAddress = document.querySelector("#dispatchDropoffAddress");
const dispatchPackageSize = document.querySelector("#dispatchPackageSize");
const dispatchPayment = document.querySelector("#dispatchPayment");
const addRiderForm = document.querySelector("#addRiderForm");
const riderNameInput = document.querySelector("#riderName");
const riderPhoneInput = document.querySelector("#riderPhone");
const riderCitySelect = document.querySelector("#riderCity");
const riderZoneSelect = document.querySelector("#riderZone");
const cityTabs = Array.from(document.querySelectorAll("[data-city-tab]"));
const roleViews = Array.from(document.querySelectorAll("[data-role-view]"));
const realMapFrame = document.querySelector("#realMapFrame");

async function api(path, options = {}) {
  let response;
  const { auth, ...fetchOptions } = options;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (state.authToken && auth !== false) {
    headers.Authorization = `Bearer ${state.authToken}`;
  }
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...fetchOptions,
      headers,
    });
  } catch {
    throw new Error("تعذر الاتصال بالخادم. افتح Wasla من رابط الخادم الحقيقي، وليس من Netlify Static أو file://.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 404 && path.startsWith("/api/")) {
      throw new Error("هذا الرابط يشغل الواجهة فقط بدون الخادم. Wasla يحتاج نشر Node backend مع الموقع.");
    }
    throw new Error(payload.error || "تعذر الاتصال بالخادم.");
  }
  return payload;
}

async function loadState() {
  const data = await api("/api/state");
  state.data = data;
  populateStaticSelects();
  updateCityLabels();
  renderAll();
}

function connectEvents() {
  if (events) events.close();
  events = new EventSource(`${apiBase}/api/events?token=${encodeURIComponent(state.authToken)}`);
  events.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "state") {
      state.data = payload.state;
      populateStaticSelects();
      updateCityLabels();
      renderAll();
    }
  };
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length > 8 ? digits.slice(-8) : digits;
}

function currentCity() {
  return state.data?.cities?.[state.city];
}

function cityList() {
  return Object.entries(state.data?.cities || {});
}

function populateStaticSelects() {
  if (!state.data) return;

  fillSelect(citySelect, cityList().map(([value, city]) => ({ value, label: city.label })));
  citySelect.value = state.city;
  fillSelect(riderCitySelect, cityList().map(([value, city]) => ({ value, label: city.label })));
  fillCityZones();
  fillRiderZones();
}

function fillCityZones() {
  const city = currentCity();
  if (!city) return;
  fillSelect(pickupSelect, city.zones.map((zone) => ({ value: zone, label: zone })));
  fillSelect(dropoffSelect, city.zones.map((zone) => ({ value: zone, label: zone })));
  fillSelect(dispatchPickup, city.zones.map((zone) => ({ value: zone, label: zone })));
  fillSelect(dispatchDropoff, city.zones.map((zone) => ({ value: zone, label: zone })));
  dropoffSelect.selectedIndex = Math.min(1, city.zones.length - 1);
  dispatchDropoff.selectedIndex = Math.min(1, city.zones.length - 1);
}

function fillRiderZones() {
  const city = state.data?.cities?.[riderCitySelect.value];
  if (!city) return;
  fillSelect(riderZoneSelect, city.zones.map((zone) => ({ value: zone, label: zone })));
}

function fillSelect(select, options) {
  const selected = select.value;
  select.innerHTML = "";
  options.forEach((option) => {
    const item = document.createElement("option");
    item.value = option.value;
    item.textContent = option.label;
    select.append(item);
  });
  if (options.some((option) => option.value === selected)) {
    select.value = selected;
  }
}

function resetLoginFlow() {
  authFlow.stage = "phone";
  authFlow.phone = "";
  loginPhone.disabled = false;
  loginCode.value = "";
  otpField.hidden = true;
  changePhone.hidden = true;
  otpHint.textContent = "أدخل الرمز الذي وصلك في الرسالة.";
  loginSubmit.textContent = "إرسال رمز SMS";
}

function showCodeStep(phone, payload) {
  authFlow.stage = "code";
  authFlow.phone = phone;
  loginPhone.disabled = true;
  otpField.hidden = false;
  changePhone.hidden = false;
  loginSubmit.textContent = "تأكيد الرمز";
  otpHint.textContent =
    payload.devCode
      ? `رمز الاختبار المحلي: ${payload.devCode}`
      : "أدخل الرمز الذي وصلك في الرسالة خلال 5 دقائق.";
  loginCode.focus();
}

async function requestLoginCode(rawPhone) {
  const phone = normalizePhone(rawPhone);
  if (phone.length < 6) {
    showToast("أدخل رقم هاتف صحيح.");
    return;
  }

  const payload = await api("/api/auth/request-code", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ phone: rawPhone }),
  });

  showCodeStep(phone, payload);
  showToast("تم إرسال رمز SMS.");
}

async function verifyLoginCode() {
  const code = normalizePhone(loginCode.value);
  if (code.length !== 6) {
    showToast("أدخل رمز SMS المكون من 6 أرقام.");
    return;
  }

  const payload = await api("/api/auth/verify-code", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ phone: authFlow.phone, code }),
  });

  enterAccount(payload);
}

function enterAccount(payload) {
  state.authToken = payload.token;
  state.user = payload.account;
  state.data = payload.state;
  loginView.hidden = true;
  authenticatedApp.hidden = false;
  roleLabel.textContent = roleText[state.user.role];
  accountName.textContent = `${state.user.name} - ${roleText[state.user.role]}`;
  cityTabsShell.hidden = state.user.role === "rider";

  if (state.user.role === "rider") {
    state.city = state.user.city;
    startRiderTracking();
  } else {
    stopRiderTracking();
  }

  roleViews.forEach((view) => {
    view.classList.toggle("active", view.dataset.roleView === state.user.role);
  });

  connectEvents();
  populateStaticSelects();
  setCity(state.city);
}

function logout() {
  stopRiderTracking();
  if (events) events.close();
  events = null;
  state.user = null;
  state.authToken = "";
  authenticatedApp.hidden = true;
  loginView.hidden = false;
  loginPhone.value = "";
  resetLoginFlow();
  loginPhone.focus();
}

function setCity(city) {
  state.city = city;
  citySelect.value = city;
  cityTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.cityTab === city);
  });
  fillCityZones();
  updateCityLabels();
  renderAll();
}

function updateCityLabels() {
  const city = currentCity();
  if (!city || !state.data) return;
  const cityOrders = activeOrders(state.city);
  const cityRiders = state.data.riders.filter((rider) => rider.city === state.city);
  cityStatus.textContent = `${city.label} مفتوحة`;
  riderCityStatus.textContent = city.label;
  dispatcherCityStatus.textContent = `${city.label} مباشرة`;
  motorCount.textContent = cityRiders.filter((rider) => rider.status === "Available").length;
  todayOrders.textContent = cityOrders.length;
  averageTime.textContent = city.avg;
  baseFeeInput.value = state.data.prices[state.city] || 90;
  pricingTitle.textContent = `${city.label}: ${state.data.prices[state.city] || 90} أوقية`;
}

function calculateDistance() {
  return calculateDistanceFromIndexes(pickupSelect.selectedIndex, dropoffSelect.selectedIndex);
}

function calculateDistanceFromIndexes(pickupIndexValue, dropoffIndexValue) {
  const pickupIndex = pickupIndexValue + 1;
  const dropoffIndex = dropoffIndexValue + 1;
  const spread = Math.abs(pickupIndex - dropoffIndex);
  return Math.max(2.4, 2.2 + spread * 1.35);
}

function updateQuote() {
  if (!state.data) return { fee: 0, eta: 0, distance: 0 };
  const distance = calculateDistance();
  const baseFee = state.data.prices[state.city] || 90;
  const fee = Math.round(baseFee + distance * 12 + sizeFees[packageSize.value]);
  const eta = Math.round(14 + distance * 4 + (packageSize.value === "large" ? 4 : 0));
  quoteFee.textContent = `${fee} أوقية`;
  quoteEta.textContent = `${eta} دقيقة`;
  quoteDistance.textContent = `${distance.toFixed(1)} كم`;
  return { fee, eta, distance };
}

function renderAll() {
  if (!state.data || !state.user) return;
  updateQuote();
  renderCustomerOrders();
  renderCustomerTracking();
  renderRiderJobs();
  renderDispatcher();
  renderRiders();
  renderLiveMap();
}

function activeOrders(city = state.city) {
  return (state.data?.orders || []).filter((order) => order.city === city && order.status !== "Delivered");
}

function renderCustomerOrders() {
  const orders = activeOrders().filter((order) => order.customerPhone === state.user?.phone);
  orderCount.textContent = `${orders.length} نشطة`;
  ordersList.innerHTML = "";
  if (!orders.length) {
    ordersList.append(createEmptyState("لا توجد طلبات نشطة لهذا الرقم."));
    return;
  }
  orders.forEach((order) => ordersList.append(createOrderCard(order, false)));
}

function renderCustomerTracking() {
  const orders = activeOrders().filter((order) => order.customerPhone === state.user?.phone);
  const assignedOrder = orders.find((order) => order.rider && order.rider !== "بانتظار راكب");
  const rider = assignedOrder
    ? state.data.riders.find((item) => item.name === assignedOrder.rider && item.location)
    : null;

  if (!assignedOrder || !rider) {
    customerTracking.innerHTML = "لا يوجد راكب مخصص لطلبك الآن.";
    return;
  }

  customerTracking.innerHTML = `
    <div>
      <p class="eyebrow">تتبع الراكب</p>
      <h3>${rider.name}</h3>
      <p>${assignedOrder.id} - ${statusText[assignedOrder.status]}</p>
      <p dir="ltr">${formatCoordinate(rider.location.lat)}, ${formatCoordinate(rider.location.lng)}</p>
    </div>
    <a class="secondary-button compact" href="${googleMapsUrl(rider.location)}" target="_blank" rel="noreferrer">
      فتح الخريطة
    </a>
  `;
}

function renderRiderJobs() {
  const rider = findCurrentRider();
  const jobs = rider
    ? activeOrders(rider.city).filter((order) => order.rider === rider.name || order.status === "Urgent")
    : [];

  riderIdentity.textContent = rider
    ? `${rider.name} - رقم الدخول: ${formatPhone(rider.phone)}`
    : "هذا الرقم غير مسجل كراكب.";
  riderLocationStatus.textContent = rider ? locationStatusLine(rider) : "أضف هذا الرقم من لوحة المشرف أولا.";
  riderOpenJobs.textContent = jobs.length;
  riderEarnings.textContent = `${state.data.riderEarnings[rider?.city || state.city] || 0} أوقية`;
  nextRouteEta.textContent = jobs.length ? `${jobs[0].eta} دقيقة` : "جاهز";
  jobList.innerHTML = "";

  if (!jobs.length) {
    jobList.append(createEmptyState("لا توجد مهام الآن."));
    return;
  }

  jobs.forEach((job) => {
    const card = document.createElement("article");
    card.className = "job-card";
    card.innerHTML = `
      <div class="order-top">
        <div>
          <h3>${job.pickup} إلى ${job.dropoff}</h3>
          <p>${job.id} - ${job.fee} أوقية - ${job.payment}</p>
        </div>
        <span class="order-chip ${chipClass(job.status)}">${statusText[job.status]}</span>
      </div>
      <div class="job-steps">
        <span>الاستلام</span>
        <strong>${job.pickup}</strong>
        <span>التسليم</span>
        <strong>${job.dropoff}</strong>
      </div>
      <button class="primary-button compact" type="button" data-rider-action="${job.id}">
        ${actionLabel(job.status)}
      </button>
    `;
    jobList.append(card);
  });
}

function renderDispatcher() {
  const orders = activeOrders();
  const cityRiders = state.data.riders.filter((rider) => rider.city === state.city);
  const cashTotal = orders
    .filter((order) => order.payment.includes("نقدا"))
    .reduce((total, order) => total + order.fee, 0);
  unassignedCount.textContent = orders.filter((order) => order.status === "Urgent").length;
  busyCount.textContent = cityRiders.filter((rider) => rider.status === "Busy").length;
  cashDue.textContent = `${cashTotal} أوقية`;
  dispatchOrdersList.innerHTML = "";

  if (!orders.length) {
    dispatchOrdersList.append(createEmptyState("لا توجد طلبات نشطة في هذه المدينة."));
    return;
  }
  orders.forEach((order) => dispatchOrdersList.append(createOrderCard(order, true)));
}

function renderRiders() {
  const cityRiders = state.data.riders.filter((rider) => rider.city === state.city);
  riderList.innerHTML = "";
  if (!cityRiders.length) {
    riderList.append(createEmptyState("لا يوجد ركاب حقيقيون بعد. أضف أول راكب برقم هاتفه."));
    return;
  }

  cityRiders.forEach((rider) => {
    const activeJob = activeOrders(rider.city).find((order) => order.rider === rider.name);
    const row = document.createElement("article");
    row.className = "rider-row";
    row.innerHTML = `
      <div>
        <h3>${rider.name}</h3>
        <p>رقم الدخول: ${formatPhone(rider.phone)}</p>
        <p>${state.data.cities[rider.city].label} - ${rider.zone} - ${rider.lastSeen}</p>
        <p>${locationStatusLine(rider)}</p>
        <p>${activeJob ? `${activeJob.id}: ${activeJob.pickup} إلى ${activeJob.dropoff}` : "بدون طلب نشط"}</p>
      </div>
      <span class="rider-chip ${rider.status.toLowerCase()}">${riderStatusText[rider.status]}</span>
      <div class="card-actions">
        <button class="quiet-button compact" type="button" data-select-rider="${rider.phone}">
          عرض على الخريطة
        </button>
      </div>
    `;
    riderList.append(row);
  });
}

function renderLiveMap() {
  const riders = state.data.riders.filter((rider) => rider.city === state.city && rider.location);
  liveMapCount.textContent = `${riders.length} راكب`;
  mapMarkers.innerHTML = "";
  if (!riders.length) {
    mapRiderDetails.textContent = "لا توجد نقاط GPS حقيقية. يدخل الراكب من هاتفه ويسمح بالموقع.";
    return;
  }

  if (!riders.some((rider) => normalizePhone(rider.phone) === state.selectedMapRider)) {
    state.selectedMapRider = normalizePhone(riders[0].phone);
  }

  riders.forEach((rider) => {
    const point = mapPointForLocation(rider.city, rider.location);
    const marker = document.createElement("button");
    marker.className = `motor-marker ${rider.status.toLowerCase()}`;
    marker.type = "button";
    marker.style.left = `${point.x}%`;
    marker.style.top = `${point.y}%`;
    marker.dataset.selectRider = rider.phone;
    marker.setAttribute("aria-label", `موقع ${rider.name}`);
    marker.textContent = rider.name.slice(0, 1);
    if (normalizePhone(rider.phone) === state.selectedMapRider) marker.classList.add("selected");
    mapMarkers.append(marker);
  });

  const selected = riders.find((rider) => normalizePhone(rider.phone) === state.selectedMapRider);
  renderMapRiderDetails(selected || riders[0]);
}

function renderMapRiderDetails(rider) {
  if (!rider?.location) {
    mapRiderDetails.textContent = "اختر راكبا من الخريطة لعرض التفاصيل.";
    return;
  }
  const activeJob = activeOrders(rider.city).find((order) => order.rider === rider.name);
  mapRiderDetails.innerHTML = `
    <div>
      <strong>${rider.name}</strong>
      <p>${riderStatusText[rider.status]} - ${state.data.cities[rider.city].label} - ${rider.zone}</p>
      <p>${activeJob ? `${activeJob.id}: ${activeJob.pickup} إلى ${activeJob.dropoff}` : "بدون طلب نشط"}</p>
      <p dir="ltr">GPS: ${formatCoordinate(rider.location.lat)}, ${formatCoordinate(rider.location.lng)} ±${Math.round(rider.location.accuracy || 0)}m</p>
      <p>${motionLine(rider.location)}</p>
      <p>آخر تحديث: ${formatTime(rider.location.updatedAt)}</p>
    </div>
    <a class="secondary-button compact" href="${googleMapsUrl(rider.location)}" target="_blank" rel="noreferrer">
      فتح في Google Maps
    </a>
  `;
  realMapFrame.src = googleMapsEmbedUrl(rider.location);
}

function createOrderCard(order, withActions) {
  const card = document.createElement("article");
  card.className = "order-card";
  card.innerHTML = `
    <div class="order-top">
      <div>
        <h3>${order.id} - ${order.pickup} إلى ${order.dropoff}</h3>
        <p>${order.rider} - ${order.payment}</p>
      </div>
      <span class="order-chip ${chipClass(order.status)}">${statusText[order.status]}</span>
    </div>
    <div class="order-meta">
      <span class="meta-item">${order.fee} أوقية</span>
      <span class="meta-item">${order.eta} دقيقة</span>
      <span class="meta-item">${state.data.cities[order.city].label}</span>
    </div>
  `;

  if (withActions) {
    const actions = document.createElement("div");
    actions.className = "card-actions";
    actions.innerHTML = `
      <button class="secondary-button compact" type="button" data-advance-order="${order.id}">
        تحديث الحالة
      </button>
      <button class="quiet-button compact" type="button" data-reassign-order="${order.id}">
        تعيين راكب
      </button>
    `;
    card.append(actions);
  }
  return card;
}

function createEmptyState(message) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  return empty;
}

function actionLabel(status) {
  if (status === "Assigned") return "بدء الاستلام";
  if (status === "Pickup") return "بدء التوصيل";
  if (status === "Delivering") return "تم التسليم";
  return "قبول الطلب";
}

function chipClass(status) {
  return status.toLowerCase().replace(/\s+/g, "-");
}

function formatPhone(phone) {
  const value = normalizePhone(phone);
  if (value.length !== 8) return phone;
  return `${value.slice(0, 2)} ${value.slice(2, 4)} ${value.slice(4, 6)} ${value.slice(6)}`;
}

function formatCoordinate(value) {
  return Number(value).toFixed(6);
}

function formatTime(value) {
  if (!value) return "لم يرسل GPS بعد";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("ar-MR", { hour: "2-digit", minute: "2-digit" });
}

function locationStatusLine(rider) {
  if (!rider?.location) return "GPS: لم يرسل الهاتف موقعا بعد";
  return `GPS: ${formatCoordinate(rider.location.lat)}, ${formatCoordinate(rider.location.lng)} - ${formatTime(rider.location.updatedAt)}`;
}

function googleMapsUrl(location) {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${location.lat},${location.lng}`)}`;
}

function googleMapsEmbedUrl(location) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(`${location.lat},${location.lng}`)}&z=17&output=embed`;
}

function motionLine(location) {
  const parts = [];
  if (Number.isFinite(location.speed)) parts.push(`السرعة: ${Math.max(0, location.speed * 3.6).toFixed(1)} كم/س`);
  if (Number.isFinite(location.heading)) parts.push(`الاتجاه: ${Math.round(location.heading)}°`);
  return parts.length ? parts.join(" - ") : "السرعة والاتجاه غير متاحين من الهاتف";
}

function mapPointForLocation(cityKey, location) {
  const bounds = state.data.cities[cityKey].bounds;
  const x = ((location.lng - bounds.west) / (bounds.east - bounds.west)) * 100;
  const y = ((bounds.north - location.lat) / (bounds.north - bounds.south)) * 100;
  return { x: clamp(x, 7, 93), y: clamp(y, 9, 91) };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function createOrder() {
  const quote = updateQuote();
  const payload = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      customerPhone: state.user.phone,
      city: state.city,
      pickup: pickupSelect.value,
      dropoff: dropoffSelect.value,
      pickupAddress: document.querySelector("#pickupAddress").value,
      dropoffAddress: document.querySelector("#dropoffAddress").value,
      recipientPhone: document.querySelector("#phone").value,
      packageSize: packageSize.value,
      payment: document.querySelector("#payment").value,
      fee: quote.fee,
      eta: quote.eta,
      distance: quote.distance,
    }),
  });
  state.data = payload.state;
  form.reset();
  setCity(state.city);
  showToast("تم إنشاء الطلب الحقيقي على الخادم.");
}

async function createDispatcherOrder() {
  const distance = calculateDistanceFromIndexes(dispatchPickup.selectedIndex, dispatchDropoff.selectedIndex);
  const baseFee = state.data.prices[state.city] || 90;
  const fee = Math.round(baseFee + distance * 12 + sizeFees[dispatchPackageSize.value]);
  const eta = Math.round(14 + distance * 4 + (dispatchPackageSize.value === "large" ? 4 : 0));

  const payload = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      dispatcherPhone: state.user.phone,
      source: "phone_call",
      customerPhone: dispatchCustomerPhone.value,
      city: state.city,
      pickup: dispatchPickup.value,
      dropoff: dispatchDropoff.value,
      pickupAddress: dispatchPickupAddress.value,
      dropoffAddress: dispatchDropoffAddress.value,
      recipientPhone: dispatchRecipientPhone.value,
      packageSize: dispatchPackageSize.value,
      payment: dispatchPayment.value,
      fee,
      eta,
      distance,
    }),
  });
  state.data = payload.state;
  dispatcherOrderForm.reset();
  fillCityZones();
  renderAll();
  showToast("تمت إضافة التوصيل الهاتفي على الخادم.");
}

function findCurrentRider() {
  if (state.user?.role !== "rider") return null;
  return state.data.riders.find((rider) => normalizePhone(rider.phone) === state.user.phone);
}

function startRiderTracking() {
  stopRiderTracking();
  updateCurrentRiderLocation();
  if (!navigator.geolocation) {
    riderLocationStatus.textContent = "هذا الهاتف لا يدعم GPS من المتصفح.";
    return;
  }
  locationWatchId = navigator.geolocation.watchPosition(updateRiderLocationFromPosition, handleLocationError, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 10000,
  });
  locationRefreshId = window.setInterval(updateCurrentRiderLocation, 10000);
}

function stopRiderTracking() {
  if (locationWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(locationWatchId);
  }
  locationWatchId = null;
  if (locationRefreshId !== null) {
    window.clearInterval(locationRefreshId);
  }
  locationRefreshId = null;
}

function updateCurrentRiderLocation() {
  if (state.user?.role !== "rider") return;
  if (!navigator.geolocation) {
    riderLocationStatus.textContent = "هذا الهاتف لا يدعم GPS من المتصفح.";
    return;
  }
  riderLocationStatus.textContent = "جاري قراءة GPS من الهاتف...";
  navigator.geolocation.getCurrentPosition(updateRiderLocationFromPosition, handleLocationError, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 10000,
  });
}

async function updateRiderLocationFromPosition(position) {
  try {
    const payload = await api("/api/rider/location", {
      method: "POST",
      body: JSON.stringify({
        phone: state.user.phone,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        speed: position.coords.speed,
        heading: position.coords.heading,
        timestamp: position.timestamp,
      }),
    });
    state.data = payload.state;
    renderAll();
  } catch (error) {
    showToast(error.message);
  }
}

function handleLocationError(error) {
  const message =
    error.code === 1
      ? "يجب السماح للموقع حتى يعمل حساب الراكب."
      : "تعذر قراءة GPS الآن. تأكد من تفعيل الموقع في الهاتف.";
  riderLocationStatus.textContent = message;
  showToast(message);
}

async function advanceOrder(orderId) {
  const payload = await api(`/api/orders/${encodeURIComponent(orderId)}/advance`, {
    method: "POST",
    body: JSON.stringify({ phone: state.user.phone }),
  });
  state.data = payload.state;
  renderAll();
}

async function assignOrder(orderId) {
  const payload = await api(`/api/orders/${encodeURIComponent(orderId)}/assign`, {
    method: "POST",
    body: JSON.stringify({ phone: state.user.phone }),
  });
  state.data = payload.state;
  renderAll();
}

async function addRider() {
  const payload = await api("/api/riders", {
    method: "POST",
    body: JSON.stringify({
      dispatcherPhone: state.user.phone,
      name: riderNameInput.value.trim(),
      phone: riderPhoneInput.value,
      city: riderCitySelect.value,
      zone: riderZoneSelect.value,
    }),
  });
  state.data = payload.state;
  addRiderForm.reset();
  fillRiderZones();
  renderAll();
  showToast("تمت إضافة الراكب الحقيقي. يستطيع الدخول برقمه الآن.");
}

function selectMapRider(phone) {
  const rider = state.data.riders.find((item) => normalizePhone(item.phone) === normalizePhone(phone));
  if (!rider) return;
  state.selectedMapRider = normalizePhone(rider.phone);
  if (rider.city !== state.city) {
    setCity(rider.city);
    return;
  }
  renderAll();
}

function showToast(message) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  window.setTimeout(() => {
    toast.classList.remove("visible");
    window.setTimeout(() => toast.remove(), 220);
  }, 2800);
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const action = authFlow.stage === "phone" ? requestLoginCode(loginPhone.value) : verifyLoginCode();
  action.catch((error) => showToast(error.message));
});

changePhone.addEventListener("click", () => {
  resetLoginFlow();
  loginPhone.focus();
});

logoutButton.addEventListener("click", logout);

cityTabs.forEach((tab) => {
  tab.addEventListener("click", () => setCity(tab.dataset.cityTab));
});

citySelect.addEventListener("change", (event) => setCity(event.target.value));
pickupSelect.addEventListener("change", updateQuote);
dropoffSelect.addEventListener("change", updateQuote);
packageSize.addEventListener("change", updateQuote);
riderCitySelect.addEventListener("change", fillRiderZones);
shareLocation.addEventListener("click", updateCurrentRiderLocation);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  createOrder().catch((error) => showToast(error.message));
});

addRiderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addRider().catch((error) => showToast(error.message));
});

dispatcherOrderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  createDispatcherOrder().catch((error) => showToast(error.message));
});

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const riderAction = event.target.closest("[data-rider-action]");
  const advanceAction = event.target.closest("[data-advance-order]");
  const reassignAction = event.target.closest("[data-reassign-order]");
  const selectRiderAction = event.target.closest("[data-select-rider]");

  if (riderAction) advanceOrder(riderAction.dataset.riderAction).catch((error) => showToast(error.message));
  if (advanceAction) advanceOrder(advanceAction.dataset.advanceOrder).catch((error) => showToast(error.message));
  if (reassignAction) assignOrder(reassignAction.dataset.reassignOrder).catch((error) => showToast(error.message));
  if (selectRiderAction) selectMapRider(selectRiderAction.dataset.selectRider);
});

savePricing.addEventListener("click", () => {
  api("/api/pricing", {
    method: "POST",
    body: JSON.stringify({
      dispatcherPhone: state.user.phone,
      city: state.city,
      baseFee: Number(baseFeeInput.value),
    }),
  })
    .then((payload) => {
      state.data = payload.state;
      updateCityLabels();
      renderAll();
      showToast("تم حفظ التسعير على الخادم.");
    })
    .catch((error) => showToast(error.message));
});

loadState().catch((error) => {
  showToast(`${error.message} شغل الخادم الحقيقي أولا.`);
});
