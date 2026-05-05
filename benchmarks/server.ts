import http from "node:http";

const port = Number(readArg("--port") ?? process.env.PORT ?? 4173);

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
  if (url.pathname === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  const [, app = "auth", variant = "clean"] = url.pathname.split("/");
  if (!["auth", "checkout", "settings", "transfer"].includes(app)) {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("Unknown benchmark app");
    return;
  }

  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(page(app, variant));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`RelUI benchmark server listening on http://127.0.0.1:${port}`);
});

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function page(app: string, variant: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>RelUI ${app} ${variant}</title>
  <style>
    :root {
      --ink: #18202f;
      --muted: #667085;
      --line: #d8e0ea;
      --panel: #ffffff;
      --page: #f3f6fa;
      --navy: #14223a;
      --teal: #0f766e;
      --cyan: #0369a1;
      --amber: #b54708;
      --red: #b42318;
      --green: #027a48;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background:
        linear-gradient(180deg, #eef6f6 0, rgba(238, 246, 246, 0) 260px),
        var(--page);
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding: 18px 30px;
      background: var(--navy);
      color: white;
      border-bottom: 4px solid var(--teal);
      box-shadow: 0 8px 24px rgb(20 34 58 / 0.14);
    }
    header strong { font-size: 18px; letter-spacing: 0; }
    nav { display: flex; gap: 8px; flex-wrap: wrap; }
    main { max-width: 920px; margin: 32px auto; padding: 0 20px; }
    section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 24px;
      box-shadow: 0 10px 28px rgb(16 24 40 / 0.08);
    }
    h1 { margin: 0 0 12px; font-size: 28px; letter-spacing: 0; }
    p { color: var(--muted); }
    form { display: grid; gap: 12px; max-width: 440px; }
    label { display: grid; gap: 5px; color: #344054; font-weight: 650; }
    input {
      width: 100%;
      padding: 10px 11px;
      border: 1px solid #c9d2df;
      border-radius: 6px;
      font: inherit;
      background: #fbfcfe;
      transition: border-color 120ms ease, box-shadow 120ms ease;
    }
    input:focus {
      border-color: var(--teal);
      box-shadow: 0 0 0 3px rgb(15 118 110 / 0.12);
      outline: none;
    }
    button, a.button {
      appearance: none;
      border: 1px solid var(--teal);
      background: var(--teal);
      color: white;
      border-radius: 6px;
      padding: 9px 12px;
      font: inherit;
      font-weight: 650;
      text-decoration: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 38px;
      box-shadow: 0 1px 2px rgb(16 24 40 / 0.08);
    }
    button.secondary, a.secondary {
      color: #1d2939;
      background: #ffffff;
      border-color: #c9d2df;
      box-shadow: none;
    }
    header a.button, header button.secondary {
      min-height: 34px;
      padding: 7px 10px;
      color: #eaf2f8;
      background: rgb(255 255 255 / 0.08);
      border-color: rgb(255 255 255 / 0.22);
    }
    header a.button:hover, header button.secondary:hover {
      background: rgb(255 255 255 / 0.16);
    }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
    .status {
      padding: 10px 12px;
      border-radius: 6px;
      border: 1px solid #b7d9cc;
      background: #eefbf4;
      color: var(--green);
      margin: 10px 0;
    }
    .error {
      padding: 10px 12px;
      border-radius: 6px;
      border: 1px solid #f1b8b3;
      background: #fff4f2;
      color: var(--red);
      margin: 10px 0;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
      margin-top: 14px;
    }
    .summary div {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px;
      background: #fbfcfe;
    }
  </style>
</head>
<body>
  <header>
    <strong>RelUI ${escapeHtml(app)} benchmark</strong>
    <nav id="nav"></nav>
  </header>
  <main id="app"></main>
  <script>
    const APP = ${JSON.stringify(app)};
    const VARIANT = ${JSON.stringify(variant)};
    const BASE = "/" + APP + "/" + VARIANT;

    const store = {
      get(key, fallback) {
        try { return JSON.parse(localStorage.getItem(APP + ":" + key)) ?? fallback; } catch { return fallback; }
      },
      set(key, value) { localStorage.setItem(APP + ":" + key, JSON.stringify(value)); },
      clear() {
        Object.keys(localStorage).filter((key) => key.startsWith(APP + ":")).forEach((key) => localStorage.removeItem(key));
      }
    };

    function route() {
      const path = location.pathname.slice(BASE.length) || "/";
      return path === "" ? "/" : path;
    }
    function go(path) {
      history.pushState({}, "", BASE + path);
      render();
    }
    function button(testId, text, path, secondary = false) {
      return '<a href="' + BASE + path + '" data-testid="' + testId + '" class="button ' + (secondary ? "secondary" : "") + '" onclick="event.preventDefault(); go(\\'' + path + '\\')">' + text + '</a>';
    }
    function setHtml(html) {
      document.getElementById("app").innerHTML = html;
      bindForms();
    }
    function render() {
      if (APP === "auth") renderAuth();
      if (APP === "checkout") renderCheckout();
      if (APP === "settings") renderSettings();
      if (APP === "transfer") renderTransfer();
    }
    window.addEventListener("popstate", render);

    function authSession() {
      return store.get("session", { authed: false, role: "guest" });
    }
    function renderAuth() {
      const session = authSession();
      document.getElementById("nav").innerHTML = [
        button("nav-home", "Home", "/", true),
        button("nav-dashboard", "Dashboard", "/dashboard", true),
        button("nav-admin", "Admin", "/admin", true),
        session.authed ? '<button data-testid="logout" class="secondary" onclick="logout()">Logout</button>' : button("nav-login", "Login", "/login", true)
      ].join("");
      const current = route();
      if (current === "/dashboard") {
        if (!session.authed && VARIANT !== "auth-bypass") {
          return loginPage("Access requires login.");
        }
        return setHtml('<section><h1>Member Dashboard</h1><div class="status">Protected dashboard loaded.</div><p>Account: ' + (session.role || "guest") + '</p></section>');
      }
      if (current === "/admin") {
        if (session.role !== "admin" && !(VARIANT === "role-escalation" && session.authed)) {
          return setHtml('<section><h1>Access Denied</h1><p>Admin Console requires administrator login.</p>' + button("denied-login", "Go to Login", "/login") + '</section>');
        }
        return setHtml('<section><h1>Admin Console</h1><div class="status">Role restricted administration tools.</div></section>');
      }
      if (current === "/login") {
        return loginPage();
      }
      if (current === "/logout") {
        return setHtml('<section><h1>Signed out</h1><p>Your session should no longer access protected pages.</p></section>');
      }
      setHtml('<section><h1>Auth Portal</h1><p>Exercise authentication and authorization flows.</p><div class="actions">' + button("home-login", "Login", "/login") + button("home-dashboard", "Open Dashboard", "/dashboard", true) + button("home-admin", "Open Admin", "/admin", true) + '</div></section>');
    }
    function loginPage(message) {
      setHtml('<section><h1>Login</h1>' + (message ? '<div class="error">' + message + '</div>' : '') + '<form data-form="auth"><label>Username<input data-testid="username" name="username" autocomplete="off"></label><label>Password<input data-testid="password" type="password" name="password"></label><div class="actions"><button data-testid="user-login-submit" type="button" onclick="login(\\'user\\')">User Login</button><button data-testid="admin-login-submit" type="button" onclick="login(\\'admin\\')">Admin Login</button></div></form></section>');
    }
    window.login = function(kind) {
      const username = document.querySelector('[data-testid="username"]').value;
      const password = document.querySelector('[data-testid="password"]').value;
      const userOk = kind === "user" && username === "user" && password === "password";
      const adminOk = kind === "admin" && username === "admin" && password === "adminpass";
      if (userOk || adminOk || VARIANT === "invalid-login-dashboard") {
        store.set("session", { authed: true, role: adminOk ? "admin" : "user" });
        go("/dashboard");
      } else {
        loginPage("Invalid credentials.");
      }
    };
    window.logout = function() {
      if (VARIANT !== "logout-retains-access") {
        store.set("session", { authed: false, role: "guest" });
      }
      go("/logout");
    };

    function checkoutState() {
      return store.get("checkout", { quantity: 1, email: "", address: "", card: "", paid: false, total: 20 });
    }
    function saveCheckout(patch) {
      store.set("checkout", { ...checkoutState(), ...patch });
    }
    function renderCheckout() {
      document.getElementById("nav").innerHTML = [
        button("nav-cart", "Cart", "/cart", true),
        button("nav-contact", "Contact", "/contact", true),
        button("nav-payment", "Payment", "/payment", true),
        button("nav-review", "Review", "/review", true)
      ].join("");
      const current = route();
      if (current === "/contact") return contactPage();
      if (current === "/payment") return paymentPage();
      if (current === "/review") return reviewPage();
      if (current === "/confirmation") return confirmationPage();
      cartPage();
    }
    function cartPage(error) {
      const state = checkoutState();
      setHtml('<section><h1>Cart</h1>' + (error ? '<div class="error">' + error + '</div>' : '') + '<form><label>Quantity<input data-testid="quantity" type="number" name="quantity" value="' + state.quantity + '"></label><div class="actions"><button data-testid="cart-next" type="button" onclick="cartNext()">Continue to Contact</button></div></form></section>');
    }
    window.cartNext = function() {
      const quantity = Number(document.querySelector('[data-testid="quantity"]').value);
      if (quantity <= 0 && VARIANT !== "negative-total") {
        return cartPage("Quantity must be positive.");
      }
      saveCheckout({ quantity, total: quantity * 20 });
      go("/contact");
    };
    function contactPage(error) {
      const state = checkoutState();
      setHtml('<section><h1>Contact</h1>' + (error ? '<div class="error">' + error + '</div>' : '') + '<form><label>Email<input data-testid="email" type="email" name="email" value="' + state.email + '"></label><label>Address<input data-testid="address" name="address" value="' + state.address + '"></label><div class="actions"><button data-testid="contact-next" type="button" onclick="contactNext()">Continue to Payment</button><button data-testid="contact-back" type="button" class="secondary" onclick="go(\\'/cart\\')">Back</button><button data-testid="express-review" type="button" class="secondary" onclick="expressReview()">Express Review</button></div></form></section>');
    }
    window.contactNext = function() {
      const email = document.querySelector('[data-testid="email"]').value;
      const address = document.querySelector('[data-testid="address"]').value;
      const ok = email.includes("@") && address.trim().length > 4;
      if (!ok && VARIANT !== "invalid-step-progression") {
        return contactPage("Valid email and address are required.");
      }
      if (VARIANT === "back-loses-contact" && checkoutState().lostContact) {
        saveCheckout({ email: "", address: "" });
      } else {
        saveCheckout({ email, address });
      }
      go("/payment");
    };
    window.expressReview = function() {
      if (VARIANT === "skip-payment") {
        saveCheckout({ paid: false });
        go("/review");
      } else {
        paymentPage("Payment is required before review.");
        history.replaceState({}, "", BASE + "/payment");
      }
    };
    function paymentPage(error) {
      const state = checkoutState();
      setHtml('<section><h1>Payment</h1>' + (error ? '<div class="error">' + error + '</div>' : '') + '<form><label>Card<input data-testid="card" name="card" value="' + state.card + '"></label><div class="actions"><button data-testid="payment-next" type="button" onclick="paymentNext()">Review Order</button><button data-testid="payment-back" type="button" class="secondary" onclick="paymentBack()">Back to Contact</button></div></form></section>');
    }
    window.paymentBack = function() {
      if (VARIANT === "back-loses-contact") {
        saveCheckout({ email: "", address: "", lostContact: true });
      }
      go("/contact");
    };
    window.paymentNext = function() {
      const card = document.querySelector('[data-testid="card"]').value;
      if (card.replace(/\\D/g, "").length < 12) {
        return paymentPage("Valid card is required.");
      }
      saveCheckout({ card, paid: true });
      go("/review");
    };
    function reviewPage() {
      const state = checkoutState();
      if ((!state.paid || !state.email || !state.address) && VARIANT !== "skip-payment" && VARIANT !== "back-loses-contact") {
        return paymentPage("Complete payment and contact details first.");
      }
      setHtml('<section><h1>Order Review</h1><div class="summary"><div>Email: ' + (state.email || "missing") + '</div><div>Address: ' + (state.address || "missing") + '</div><div>Total: $' + state.total + '</div><div>Paid: ' + (state.paid ? "yes" : "no") + '</div></div><div class="actions"><button data-testid="place-order" type="button" onclick="placeOrder()">Place Order</button></div></section>');
    }
    window.placeOrder = function() {
      const state = checkoutState();
      if (!state.paid && VARIANT !== "skip-payment") {
        return paymentPage("Payment is required before confirmation.");
      }
      go("/confirmation");
    };
    function confirmationPage() {
      const state = checkoutState();
      setHtml('<section><h1>Order Complete</h1><div class="status">Confirmation generated.</div><div class="summary"><div>Email: ' + (state.email || "missing") + '</div><div>Address: ' + (state.address || "missing") + '</div><div>Total: $' + state.total + '</div><div>Paid: ' + (state.paid ? "yes" : "no") + '</div></div></section>');
    }

    function settingsState() {
      return store.get("settings", { displayName: "Default User", notifications: "off", saved: false });
    }
    function saveSettings(patch) {
      store.set("settings", { ...settingsState(), ...patch });
    }
    function renderSettings() {
      document.getElementById("nav").innerHTML = [
        button("nav-settings", "Profile", "/profile", true),
        button("nav-notifications", "Notifications", "/notifications", true),
        button("nav-summary", "Summary", "/summary", true)
      ].join("");
      const current = route();
      if (current === "/notifications") return notificationsPage();
      if (current === "/summary") return settingsSummary();
      profilePage();
    }
    function profilePage(message) {
      const state = settingsState();
      setHtml('<section><h1>Profile Settings</h1>' + (message ? '<div class="status">' + message + '</div>' : '') + '<form><label>Display name<input data-testid="displayName" name="displayName" value="' + state.displayName + '"></label><div class="actions"><button data-testid="save-profile" type="button" onclick="saveProfile()">Save Profile</button><button data-testid="quick-save-profile" type="button" class="secondary" onclick="quickSaveProfile()">Quick Save</button><button data-testid="cancel-profile" type="button" class="secondary" onclick="cancelProfile()">Cancel</button><button data-testid="reset-profile" type="button" class="secondary" onclick="resetProfile()">Reset</button></div></form></section>');
    }
    window.saveProfile = function() {
      const displayName = document.querySelector('[data-testid="displayName"]').value || "Default User";
      saveSettings({ displayName, saved: true });
      go("/summary");
    };
    window.quickSaveProfile = function() {
      const displayName = document.querySelector('[data-testid="displayName"]').value || "Default User";
      saveSettings({ displayName: VARIANT === "alt-save-stale" ? "Default User" : displayName, saved: true });
      go("/summary");
    };
    window.cancelProfile = function() {
      if (VARIANT === "cancel-persists-change") {
        const displayName = document.querySelector('[data-testid="displayName"]').value || "Default User";
        saveSettings({ displayName, saved: true });
      }
      go("/summary");
    };
    window.resetProfile = function() {
      if (VARIANT === "reset-does-not-clear") {
        saveSettings({ saved: true });
      } else {
        saveSettings({ displayName: "Default User", notifications: "off", saved: true });
      }
      go("/summary");
    };
    function notificationsPage() {
      const state = settingsState();
      setHtml('<section><h1>Notification Settings</h1><form><label>Email notifications<input data-testid="notifications" name="notifications" value="' + state.notifications + '"></label><div class="actions"><button data-testid="save-notifications" type="button" onclick="saveNotifications()">Save Notifications</button><button data-testid="quick-save-notifications" type="button" class="secondary" onclick="quickSaveNotifications()">Quick Save</button></div></form></section>');
    }
    window.saveNotifications = function() {
      const notifications = document.querySelector('[data-testid="notifications"]').value || "off";
      saveSettings({ notifications, saved: true });
      go("/summary");
    };
    window.quickSaveNotifications = function() {
      const notifications = document.querySelector('[data-testid="notifications"]').value || "off";
      saveSettings({ notifications: VARIANT === "stale-notification" ? "off" : notifications, saved: true });
      go("/summary");
    };
    function settingsSummary() {
      const state = settingsState();
      setHtml('<section><h1>Settings Saved</h1><div class="summary"><div>Display name: ' + state.displayName + '</div><div>Email notifications: ' + state.notifications + '</div><div>Saved: ' + (state.saved ? "yes" : "no") + '</div></div></section>');
    }

    function transferState() {
      return store.get("transfer", { amount: 100, recipient: "", memo: "", reviewed: false, confirmed: false, lostTransfer: false });
    }
    function saveTransfer(patch) {
      store.set("transfer", { ...transferState(), ...patch });
    }
    function renderTransfer() {
      document.getElementById("nav").innerHTML = [
        button("nav-transfer-start", "Amount", "/start", true),
        button("nav-transfer-recipient", "Recipient", "/recipient", true),
        button("nav-transfer-review", "Review", "/review", true),
        button("nav-transfer-confirmation", "Confirmation", "/confirmation", true)
      ].join("");
      const current = route();
      if (current === "/recipient") return transferRecipientPage();
      if (current === "/review") return transferReviewPage();
      if (current === "/confirmation") return transferConfirmationPage();
      transferAmountPage();
    }
    function transferAmountPage(error) {
      const state = transferState();
      setHtml('<section><h1>Transfer Amount</h1>' + (error ? '<div class="error">' + error + '</div>' : '') + '<form><label>Amount<input data-testid="amount" type="number" name="amount" value="' + state.amount + '"></label><label>Memo<input data-testid="memo" name="memo" value="' + state.memo + '"></label><div class="actions"><button data-testid="transfer-amount-next" type="button" onclick="transferAmountNext()">Continue to Recipient</button></div></form></section>');
    }
    window.transferAmountNext = function() {
      const amount = Number(document.querySelector('[data-testid="amount"]').value);
      const memo = document.querySelector('[data-testid="memo"]').value;
      if ((amount <= 0 || amount > 5000) && VARIANT !== "invalid-amount-progression") {
        return transferAmountPage("Amount must be between $1 and $5,000.");
      }
      saveTransfer({ amount, memo, reviewed: false, confirmed: false });
      go("/recipient");
    };
    function transferRecipientPage(error) {
      const state = transferState();
      setHtml('<section><h1>Transfer Recipient</h1>' + (error ? '<div class="error">' + error + '</div>' : '') + '<form><label>Recipient<input data-testid="recipient" name="recipient" value="' + state.recipient + '"></label><div class="actions"><button data-testid="transfer-recipient-next" type="button" onclick="transferRecipientNext()">Review Transfer</button><button data-testid="transfer-recipient-back" type="button" class="secondary" onclick="go(\\'/start\\')">Back</button></div></form></section>');
    }
    window.transferRecipientNext = function() {
      const recipient = document.querySelector('[data-testid="recipient"]').value;
      const ok = recipient.includes("@") && recipient.trim().length > 5;
      if (!ok && VARIANT !== "invalid-recipient-progression") {
        return transferRecipientPage("A valid recipient email is required.");
      }
      const patch = VARIANT === "back-loses-transfer" && transferState().lostTransfer ? { recipient, reviewed: true, confirmed: false } : { recipient, reviewed: true, confirmed: false };
      saveTransfer(patch);
      go("/review");
    };
    function transferReviewPage(error) {
      const state = transferState();
      if ((!state.amount || !state.recipient) && VARIANT !== "back-loses-transfer") {
        return transferRecipientPage(error ?? "Amount and recipient are required before review.");
      }
      setHtml('<section><h1>Transfer Review</h1>' + (error ? '<div class="error">' + error + '</div>' : '') + '<div class="summary"><div>Amount: ' + (state.amount ? "$" + state.amount : "missing") + '</div><div>Recipient: ' + (state.recipient || "missing") + '</div><div>Memo: ' + (state.memo || "none") + '</div><div>Reviewed: ' + (state.reviewed ? "yes" : "no") + '</div></div><div class="actions"><button data-testid="confirm-transfer" type="button" onclick="confirmTransfer()">Confirm Transfer</button><button data-testid="transfer-review-back" type="button" class="secondary" onclick="transferReviewBack()">Back to Recipient</button></div></section>');
    }
    window.transferReviewBack = function() {
      if (VARIANT === "back-loses-transfer") {
        saveTransfer({ amount: 0, recipient: "", lostTransfer: true, reviewed: false, confirmed: false });
      }
      go("/recipient");
    };
    window.confirmTransfer = function() {
      const state = transferState();
      if ((!state.reviewed || !state.amount || !state.recipient) && VARIANT !== "skip-confirmation" && VARIANT !== "back-loses-transfer") {
        return transferReviewPage("Review a complete transfer before confirmation.");
      }
      saveTransfer({ confirmed: true });
      go("/confirmation");
    };
    function transferConfirmationPage() {
      const state = transferState();
      if (!state.confirmed && VARIANT !== "skip-confirmation") {
        history.replaceState({}, "", BASE + "/review");
        return transferReviewPage("Confirm transfer before receipt.");
      }
      setHtml('<section><h1>Transfer Complete</h1><div class="status">Transfer receipt generated.</div><div class="summary"><div>Amount: ' + (state.amount ? "$" + state.amount : "missing") + '</div><div>Recipient: ' + (state.recipient || "missing") + '</div><div>Memo: ' + (state.memo || "none") + '</div><div>Confirmed: ' + (state.confirmed ? "yes" : "no") + '</div></div></section>');
    }

    function bindForms() {}
    render();
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
