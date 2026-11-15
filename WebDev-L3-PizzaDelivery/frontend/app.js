const { useState, useEffect, useRef } = React;
const API = window.API_URL.replace(/\/$/, "");
const $ = (n) => "$" + Number(n).toFixed(2);
const STATUSES = ["Order Received", "In Kitchen", "Sent to Delivery"];
const LOW_LIMIT = 20;
const go = (h) => { location.hash = h; };
const imgFor = (name) => (window.PIZZA_IMG && window.PIZZA_IMG[name]) || window.DEFAULT_IMG;

const COUNTRIES = ["Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda","Argentina","Armenia","Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Cabo Verde","Cambodia","Cameroon","Canada","Central African Republic","Chad","Chile","China","Colombia","Comoros","Congo (DRC)","Congo (Republic)","Costa Rica","Côte d'Ivoire","Croatia","Cuba","Cyprus","Czechia","Denmark","Djibouti","Dominica","Dominican Republic","Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","Fiji","Finland","France","Gabon","Gambia","Georgia","Germany","Ghana","Greece","Grenada","Guatemala","Guinea","Guinea-Bissau","Guyana","Haiti","Honduras","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kiribati","Kosovo","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Marshall Islands","Mauritania","Mauritius","Mexico","Micronesia","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar","Namibia","Nauru","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea","North Macedonia","Norway","Oman","Pakistan","Palau","Palestine","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Rwanda","Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines","Samoa","San Marino","São Tomé and Príncipe","Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands","Somalia","South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste","Togo","Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Tuvalu","Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan","Vanuatu","Vatican City","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe","Other"];

/* ---- Change these to your real details ---- */
const SHOP = { name: "Slice & Co.", phone: "+233 20 000 0000", email: "help@sliceandco.com", address: "12 Market Street, Accra", hours: "Open daily 10am – 11pm" };

const TYPE_ICON = { base: "🍞", sauce: "🥫", cheese: "🧀", veggie: "🥬" };
const NAME_ICON = { Mushroom: "🍄", Onion: "🧅", "Bell Pepper": "🫑", Olives: "🫒", Sweetcorn: "🌽", Tomato: "🍅", "Tomato Basil": "🍅", BBQ: "🍖", Pesto: "🌿", "White Garlic": "🧄", "Spicy Arrabbiata": "🌶️", "Cheese Burst": "🧀", "Gluten Free": "🌾", "Whole Wheat": "🌾" };
const iconFor = (i) => NAME_ICON[i.name] || TYPE_ICON[i.type] || "🍕";

const place = (dl) => [dl.address, dl.area, dl.country].filter(Boolean).join(", ");

async function call(path, method = "GET", body, key = "pizza_token") {
  const headers = { "Content-Type": "application/json" };
  const t = localStorage.getItem(key);
  if (t) headers.Authorization = "Bearer " + t;
  let res;
  try {
    res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    throw new Error("Cannot reach the server. It may be waking up, try again in 30 seconds.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}
const A = (p, m, b) => call(p, m, b, "pizza_admin_token");

function useHash() {
  const [h, setH] = useState(location.hash.slice(1));
  useEffect(() => {
    const f = () => { setH(location.hash.slice(1)); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return h;
}

function useAsync() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const run = async (fn) => {
    setBusy(true); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ ok: false, text: e.message }); }
    setBusy(false);
  };
  return { busy, msg, setMsg, run };
}

function Msg({ m }) {
  return m ? <div className={"msg " + (m.ok ? "ok" : "bad")}>{m.text}</div> : null;
}

function Photo({ src, alt, cls }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return <div className={"ph " + (cls || "")}>🍕</div>;
  return <img className={cls} src={src} alt={alt} loading="lazy" onError={() => setBad(true)} />;
}

function IngImg({ item, cls }) {
  const [bad, setBad] = useState(false);
  const src = window.ING_IMG && window.ING_IMG[item.name];
  if (!src || bad) return <div className={cls}>{iconFor(item)}</div>;
  return <img className={cls} src={src} alt={item.name} loading="lazy" onError={() => setBad(true)} />;
}

/* ---------- Header / Footer ---------- */
function Header({ user, cartCount, logout }) {
  return (
    <header className="top">
      <a className="logo" href={user ? "#dashboard" : "#login"}>🍕 Slice <span>&amp; Co.</span></a>
      <nav>
        {user ? (
          <>
            <a href="#dashboard">Menu</a>
            <a href="#build">Build</a>
            <a href="#orders">Orders</a>
            <a href="#support">Support</a>
            <a href="#cart">Cart<span className="badge">{cartCount}</span></a>
            <button className="pill" onClick={logout}>Log out</button>
          </>
        ) : (
          <>
            <a href="#support">Support</a>
            <a href="#login">Log in</a>
            <a href="#register" className="pill">Sign up</a>
          </>
        )}
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="cols">
        <div>
          <h4>🍕 {SHOP.name}</h4>
          <p>Fresh dough, real cheese, built your way and delivered hot.</p>
        </div>
        <div>
          <h4>Customer service</h4>
          <p>📞 {SHOP.phone}</p>
          <p>✉️ {SHOP.email}</p>
          <p>📍 {SHOP.address}</p>
          <p>🕗 {SHOP.hours}</p>
        </div>
        <div>
          <h4>Quick links</h4>
          <a href="#dashboard">Menu</a>
          <a href="#build">Build your pizza</a>
          <a href="#orders">Track my order</a>
          <a href="#support">Help &amp; FAQ</a>
          <a href="#admin">Staff login</a>
        </div>
      </div>
      <p className="copy">© {new Date().getFullYear()} {SHOP.name}. All rights reserved.</p>
    </footer>
  );
}

/* ---------- Chatbot ---------- */
const RULES = [
  [/hello|hi\b|hey|good (morning|afternoon|evening)/, "Hi! 👋 I'm Pizzabot. Ask me about our menu, delivery, payment or your order."],
  [/hour|open|close|time/, SHOP.hours + "."],
  [/deliver|how long|arrive|late|where is my|area|location|country/, "Delivery usually takes 30–45 minutes. In the cart, choose your country, enter your city or area and your address before paying. Track your order under Orders."],
  [/pay|card|stripe|price|cost|cash/, "You pay securely by card at checkout. This site runs in test mode, so use card 4242 4242 4242 4242, any future date and any 3 digits. No real money is charged."],
  [/vegan|vegetarian|veg\b|gluten|allerg/, "We have Vegan Cheese and a Gluten Free base. Use Build to pick them. For serious allergies please call " + SHOP.phone + "."],
  [/custom|build|own|topping|base|sauce|cheese/, "Tap Build in the menu bar: choose a base, sauce, cheese, then any vegetables."],
  [/order|status|track/, "Open Orders in the menu bar. It updates every few seconds as the kitchen works on your pizza."],
  [/cancel|refund|wrong|problem|complain/, "Sorry about that! Please call " + SHOP.phone + " or email " + SHOP.email + " with your order time and we'll sort it out."],
  [/password|login|log in|verify|account/, "Forgot your password? Tap Log in, then 'Forgot password?'. New accounts must verify their email before ordering."],
  [/contact|phone|call|email|address|where/, "📞 " + SHOP.phone + "  ✉️ " + SHOP.email + "  📍 " + SHOP.address],
  [/thank/, "You're welcome! Enjoy your pizza 🍕"],
];
function botReply(t) {
  const s = t.toLowerCase();
  for (const [re, ans] of RULES) if (re.test(s)) return ans;
  return "I'm not sure about that. Try asking about hours, delivery, payment or your order, or open the Support page.";
}

function Chatbot() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState([{ from: "bot", text: "Hi! I'm Pizzabot 🍕 How can I help?" }]);
  const end = useRef(null);
  useEffect(() => { if (end.current) end.current.scrollIntoView({ behavior: "smooth" }); }, [msgs, open]);
  const send = (q) => {
    const t = (q || text).trim();
    if (!t) return;
    setMsgs((m) => [...m, { from: "me", text: t }, { from: "bot", text: botReply(t) }]);
    setText("");
  };
  const chips = ["Opening hours", "Delivery time", "How to pay", "Vegan options", "Track my order"];
  return (
    <div>
      {open && (
        <div className="botbox">
          <div className="bot-head"><span>🍕 Pizzabot</span><button onClick={() => setOpen(false)}>✕</button></div>
          <div className="bot-msgs">
            {msgs.map((m, i) => <div key={i} className={"bubble " + (m.from === "bot" ? "fromBot" : "me")}>{m.text}</div>)}
            <div ref={end} />
          </div>
          <div className="chips">{chips.map((c) => <button key={c} onClick={() => send(c)}>{c}</button>)}</div>
          <form className="bot-in" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input placeholder="Type your question..." value={text} onChange={(e) => setText(e.target.value)} />
            <button>Send</button>
          </form>
        </div>
      )}
      <button className="bot-fab" onClick={() => setOpen(!open)} aria-label="Chat">{open ? "✕" : "💬"}</button>
    </div>
  );
}

/* ---------- Support ---------- */
function Support() {
  const [f, setF] = useState({ name: "", email: "", message: "" });
  const [sent, setSent] = useState(false);
  const submit = (e) => { e.preventDefault(); if (f.name && f.email && f.message) setSent(true); };
  const faqs = [
    ["How long does delivery take?", "Usually 30–45 minutes. Track it live under Orders."],
    ["How do I pay?", "By card at checkout. This demo uses Stripe test mode: card 4242 4242 4242 4242."],
    ["Where do you deliver?", "Choose your country, enter your city or area and write your street address or landmark in the cart before paying."],
    ["Can I make my own pizza?", "Yes! Tap Build and choose a base, sauce, cheese and vegetables."],
    ["Do you have vegan or gluten-free options?", "Yes: Vegan Cheese and a Gluten Free base."],
    ["I forgot my password.", "On the login page tap 'Forgot password?' and follow the link we send."],
  ];
  return (
    <div className="wrap">
      <h2>Customer service</h2>
      <div className="support-box">
        <div><b>📞</b>{SHOP.phone}</div>
        <div><b>✉️</b>{SHOP.email}</div>
        <div><b>🕗</b>{SHOP.hours}</div>
      </div>
      <h2>FAQ</h2>
      {faqs.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
      <h2 style={{ marginTop: 20 }}>Send us a message</h2>
      {sent ? <div className="msg ok">Thanks {f.name}! Our team will get back to you soon.</div> : (
        <form onSubmit={submit}>
          <input placeholder="Your name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input type="email" placeholder="Your email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <textarea placeholder="How can we help?" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
          <button className="btn full">Send message</button>
        </form>
      )}
      <p className="muted" style={{ marginTop: 12 }}>Or chat with Pizzabot using the 💬 button.</p>
    </div>
  );
}

/* ---------- Login / Register / Forgot ---------- */
function AuthPage({ mode, onLogin }) {
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const { busy, msg, setMsg, run } = useAsync();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const titles = { login: "Welcome back", register: "Create account", forgot: "Forgot password" };
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      if (mode === "login") {
        const d = await call("/api/auth/login", "POST", f);
        localStorage.setItem("pizza_token", d.token);
        localStorage.setItem("pizza_name", d.name);
        onLogin(d.name);
        go("dashboard");
      } else {
        const d = await call("/api/auth/" + mode, "POST", f);
        if (d.verifyToken) return go("inbox-verify/" + d.verifyToken);
        if (d.resetToken) return go("inbox-reset/" + d.resetToken);
        setMsg({ ok: true, text: d.message });
      }
    });
  };
  return (
    <div className="authbg" style={{ backgroundImage: "linear-gradient(rgba(20,8,5,.6),rgba(20,8,5,.75)), url(" + (window.AUTH_IMG || "") + ")" }}>
      <div className="auth">
        <h1>🍕 {titles[mode]}</h1>
        <form onSubmit={submit}>
          {mode === "register" && <input placeholder="Full name" value={f.name} onChange={set("name")} />}
          <input type="email" placeholder="Email" value={f.email} onChange={set("email")} />
          {mode !== "forgot" && <input type="password" placeholder="Password (8+ chars, 1 number)" value={f.password} onChange={set("password")} />}
          <button className="btn full" disabled={busy}>
            {busy ? "Please wait..." : mode === "login" ? "Log in" : mode === "register" ? "Sign up" : "Send reset link"}
          </button>
        </form>
        <Msg m={msg} />
        <div className="links">
          {mode === "login" ? <a href="#register">Create account</a> : <a href="#login">Back to login</a>}
          {mode === "login" && <a href="#forgot">Forgot password?</a>}
        </div>
      </div>
    </div>
  );
}

/* ---------- Demo inbox (simulated email) ---------- */
function DemoInbox({ kind, token }) {
  const isVerify = kind === "verify";
  const link = "#" + (isVerify ? "verify/" : "reset/") + token;
  return (
    <div className="authbg">
      <div className="auth">
        <h1>📬 Demo inbox</h1>
        <p className="muted">This page stands in for the real email in demo mode.</p>
        <div className="mail">
          <div className="bar">From: Pizza Delivery<br />Subject: {isVerify ? "Verify your email" : "Reset your password"}</div>
          <div className="body">
            <p style={{ marginBottom: 14 }}>
              {isVerify ? "Welcome to Pizza Delivery! Tap the button below to verify your email." : "Tap the button below to choose a new password. The link is valid for 1 hour."}
            </p>
            <a href={link}><button className="btn full">{isVerify ? "Verify my email" : "Reset password"}</button></a>
          </div>
        </div>
      </div>
    </div>
  );
}

function Verify({ token }) {
  const [m, setM] = useState({ ok: true, text: "Verifying..." });
  useEffect(() => {
    call("/api/auth/verify/" + token).then((d) => setM({ ok: true, text: d.message })).catch((e) => setM({ ok: false, text: e.message }));
  }, [token]);
  return <div className="authbg"><div className="auth"><h1>Email verification</h1><Msg m={m} /><div className="links"><a href="#login">Go to login</a></div></div></div>;
}

function Reset({ token }) {
  const [password, setPassword] = useState("");
  const { busy, msg, setMsg, run } = useAsync();
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const d = await call("/api/auth/reset/" + token, "POST", { password });
      setMsg({ ok: true, text: d.message });
    });
  };
  return (
    <div className="authbg">
      <div className="auth">
        <h1>New password</h1>
        <form onSubmit={submit}>
          <input type="password" placeholder="New password (8+ chars, 1 number)" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn full" disabled={busy}>{busy ? "Please wait..." : "Change password"}</button>
        </form>
        <Msg m={msg} />
        <div className="links"><a href="#login">Go to login</a></div>
      </div>
    </div>
  );
}

/* ---------- Menu ---------- */
function Menu({ opts, addToCart, name }) {
  return (
    <div>
      <div className="hero" style={{ backgroundImage: "url(" + window.HERO_IMG + ")" }}>
        <h1>Hot, fresh pizza<br />at <em>your door</em></h1>
        <p>Welcome{name ? ", " + name : ""}! Pick a favourite or build your own.</p>
        <div className="btns">
          <a href="#menu-list"><button className="btn">Order now</button></a>
          <button className="btn light" onClick={() => go("build")}>Build your own</button>
        </div>
        <div className="perks"><span>🚚 30–45 min delivery</span><span>🧀 Real mozzarella</span><span>🔥 Baked to order</span></div>
      </div>
      <div className="strip">
        {(window.GALLERY || []).map((g, i) => <Photo key={i} src={g} alt="Pizza" />)}
      </div>
      <div className="wrap wide" id="menu-list">
        <div className="how">
          <div><b>🍕</b><strong>1. Choose</strong>Pick a favourite or build your own</div>
          <div><b>💳</b><strong>2. Pay</strong>Secure card checkout</div>
          <div><b>🛵</b><strong>3. Track</strong>Watch it go from kitchen to door</div>
        </div>
        <h2>Our pizzas</h2>
        <div className="grid">
          {opts.varieties.map((v) => (
            <div className="pcard" key={v.name}>
              <Photo src={imgFor(v.name)} alt={v.name} />
              <div className="pbody">
                <div className="row"><b>{v.name}</b><span className="price">{$(v.price)}</span></div>
                <p className="muted">{v.desc}</p>
                <p className="muted">{v.labels}</p>
                <button className="btn full" style={{ marginTop: 8 }} onClick={() => addToCart(v)}>Add to cart</button>
              </div>
            </div>
          ))}
        </div>
        <button className="btn alt full" style={{ marginTop: 20 }} onClick={() => go("build")}>🍕 Build your own pizza</button>
      </div>
    </div>
  );
}

/* ---------- Builder ---------- */
function Builder({ opts, addToCart }) {
  const keys = ["base", "sauce", "cheese", "veggie"];
  const titles = ["Choose your base", "Choose your sauce", "Choose your cheese", "Choose vegetables (optional)"];
  const [step, setStep] = useState(0);
  const [sel, setSel] = useState({ base: null, sauce: null, cheese: null, veggies: [] });
  const list = opts[keys[step]];
  const chosen = (id) => (step < 3 ? sel[keys[step]] === id : sel.veggies.includes(id));
  const pick = (id) => {
    if (step < 3) setSel({ ...sel, [keys[step]]: id });
    else setSel({ ...sel, veggies: sel.veggies.includes(id) ? sel.veggies.filter((x) => x !== id) : [...sel.veggies, id] });
  };
  const canNext = step < 3 ? !!sel[keys[step]] : true;
  const find = (type, id) => opts[type].find((i) => i.id === id);
  const finish = () => {
    const b = find("base", sel.base), s = find("sauce", sel.sauce), c = find("cheese", sel.cheese);
    const vs = sel.veggies.map((id) => find("veggie", id));
    addToCart({
      name: "Custom Pizza", base: sel.base, sauce: sel.sauce, cheese: sel.cheese, veggies: sel.veggies,
      labels: [b.name, s.name, c.name, ...vs.map((v) => v.name)].join(", "),
      price: +(4 + b.price + s.price + c.price + vs.reduce((a, v) => a + v.price, 0)).toFixed(2),
    });
    go("cart");
  };
  return (
    <div className="wrap">
      <div className="steps">{["Base", "Sauce", "Cheese", "Veggies"].map((s, i) => <span key={s} className={i <= step ? "on" : ""}>{i + 1}. {s}</span>)}</div>
      <h2>{titles[step]}</h2>
      {list.map((i) => (
        <button key={i.id} className={"opt" + (chosen(i.id) ? " on" : "")} disabled={i.stock <= 0} onClick={() => pick(i.id)}>
          <span className="oname"><IngImg item={{ ...i, type: keys[step] }} cls="thumb" />{i.name}{i.stock <= 0 ? " (sold out)" : ""}</span>
          <span className="price">{$(i.price)}</span>
        </button>
      ))}
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
        {step < 3
          ? <button className="btn" disabled={!canNext} onClick={() => setStep(step + 1)}>Next</button>
          : <button className="btn" onClick={finish}>Add to cart</button>}
      </div>
    </div>
  );
}

/* ---------- Cart + delivery location (worldwide) ---------- */
function Cart({ cart, setCart }) {
  const { busy, msg, setMsg, run } = useAsync();
  const blank = { country: "", area: "", address: "", phone: "", note: "" };
  const [d, setD] = useState(() => {
    try { return { ...blank, ...(JSON.parse(localStorage.getItem("pizza_delivery")) || {}) }; }
    catch (e) { return blank; }
  });
  const setField = (k) => (e) => setD({ ...d, [k]: e.target.value });
  const total = cart.reduce((a, p) => a + p.price, 0);

  const pay = () => {
    if (!d.country) return setMsg({ ok: false, text: "Please choose your country." });
    if (d.area.trim().length < 2) return setMsg({ ok: false, text: "Please enter your city or area." });
    if (d.address.trim().length < 5) return setMsg({ ok: false, text: "Please write your street address or landmark." });
    if (d.phone.replace(/\D/g, "").length < 7) return setMsg({ ok: false, text: "Please enter a phone number we can call (include the country code)." });
    run(async () => {
      localStorage.setItem("pizza_delivery", JSON.stringify(d));
      const pizzas = cart.map(({ name, base, sauce, cheese, veggies }) => ({ name, base, sauce, cheese, veggies }));
      const r = await call("/api/orders", "POST", { pizzas, delivery: d });
      window.location.href = r.url;
    });
  };

  if (!cart.length) return <div className="wrap"><p className="empty">Your cart is empty.</p><button className="btn full" onClick={() => go("dashboard")}>Browse pizzas</button></div>;
  return (
    <div className="wrap">
      <h2>Order summary</h2>
      {cart.map((p, i) => (
        <div className="card" key={i}>
          <div className="item">
            <Photo src={imgFor(p.name)} alt={p.name} />
            <div style={{ flex: 1 }}>
              <div className="row"><b>{p.name}</b><span className="price">{$(p.price)}</span></div>
              <p className="muted">{p.labels}</p>
            </div>
          </div>
          <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => setCart(cart.filter((_, x) => x !== i))}>Remove</button>
        </div>
      ))}
      <div className="card row"><b>Total</b><span className="price">{$(total)}</span></div>

      <h2 style={{ marginTop: 18 }}>📍 Delivery location</h2>
      <div className="card">
        <label className="muted">Country</label>
        <select value={d.country} onChange={setField("country")}>
          <option value="">Choose your country...</option>
          {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="muted">City / area</label>
        <input placeholder="e.g. East Legon, Accra" value={d.area} onChange={setField("area")} />
        <label className="muted">Street address or landmark</label>
        <input placeholder="e.g. House 12, Oxford Street, near the bank" value={d.address} onChange={setField("address")} />
        <label className="muted">Phone number (with country code)</label>
        <input type="tel" placeholder="e.g. +233 24 000 0000" value={d.phone} onChange={setField("phone")} />
        <label className="muted">Note for the rider (optional)</label>
        <input placeholder="e.g. Call when you arrive" value={d.note} onChange={setField("note")} />
      </div>

      <button className="btn full" disabled={busy} onClick={pay}>{busy ? "Opening payment..." : "Pay with Stripe (test mode)"}</button>
      <p className="muted" style={{ marginTop: 10 }}>Test card: 4242 4242 4242 4242, any future date, any 3 digits. No real money is charged.</p>
      <Msg m={msg} />
    </div>
  );
}

/* ---------- My orders ---------- */
function Orders() {
  const [orders, setOrders] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    const load = () => call("/api/orders/mine").then(setOrders).catch((e) => setErr({ ok: false, text: e.message }));
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="wrap">
      <h2>My orders</h2>
      <p className="muted" style={{ marginBottom: 10 }}>Updates automatically</p>
      <Msg m={err} />
      {orders && orders.length === 0 && <p className="empty">No orders yet.</p>}
      {orders && orders.map((o) => {
        const idx = STATUSES.indexOf(o.status);
        return (
          <div className="card" key={o._id}>
            <div className="row"><b>{new Date(o.createdAt).toLocaleString()}</b><span className="price">{$(o.total)}</span></div>
            {o.pizzas.map((p, i) => <p className="muted" key={i}>🍕 {p.name}: {p.base}, {p.sauce}, {p.cheese}{p.veggies.length ? ", " + p.veggies.join(", ") : ""}</p>)}
            {o.delivery && o.delivery.address && <p className="muted" style={{ marginTop: 6 }}>📍 {place(o.delivery)}</p>}
            <div className="track">{STATUSES.map((s, i) => <span key={s} className={i <= idx ? "on" : ""}>{s}</span>)}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Admin ---------- */
function StockRow({ item, onSaved }) {
  const [v, setV] = useState(item.stock);
  const [m, setM] = useState("");
  const low = item.stock < LOW_LIMIT;
  const pct = Math.max(2, Math.min(100, item.stock));
  const save = () =>
    A("/api/admin/inventory/" + item._id, "PUT", { stock: v })
      .then(() => { setM("Saved ✓"); onSaved(); })
      .catch((e) => setM(e.message));
  return (
    <div className={"icard" + (low ? " low" : "")}>
      <div className="ihead">
        <IngImg item={item} cls="ico" />
        <div className="info">
          <b>{item.name}</b>{low && <span className="tag">LOW</span>}
          <div className="muted">{item.stock} in stock</div>
        </div>
      </div>
      <div className="sbar"><i style={{ width: pct + "%" }}></i></div>
      <div className="iedit">
        <input type="number" min="0" value={v} onChange={(e) => setV(e.target.value)} />
        <button className="btn" onClick={save}>Save</button>
      </div>
      {m && <p className="muted" style={{ marginTop: 6 }}>{m}</p>}
    </div>
  );
}

function Admin() {
  const [authed, setAuthed] = useState(!!localStorage.getItem("pizza_admin_token"));
  const [tab, setTab] = useState("orders");
  const [f, setF] = useState({ email: "", password: "" });
  const [orders, setOrders] = useState([]);
  const [inv, setInv] = useState([]);
  const [err, setErr] = useState(null);
  const { busy, msg, run } = useAsync();

  const loadOrders = () => A("/api/admin/orders").then((o) => { setOrders(o); setErr(null); }).catch((e) => setErr({ ok: false, text: e.message }));
  const loadInv = () => A("/api/admin/inventory").then(setInv).catch((e) => setErr({ ok: false, text: e.message }));

  useEffect(() => {
    if (!authed) return;
    loadOrders(); loadInv();
    const t = setInterval(loadOrders, 5000);
    return () => clearInterval(t);
  }, [authed]);

  const login = (e) => {
    e.preventDefault();
    run(async () => {
      const d = await call("/api/admin/login", "POST", f);
      localStorage.setItem("pizza_admin_token", d.token);
      setAuthed(true);
    });
  };
  const out = () => { localStorage.removeItem("pizza_admin_token"); setAuthed(false); };
  const setStatus = (id, status) => A("/api/admin/orders/" + id, "PUT", { status }).then(loadOrders).catch((e) => setErr({ ok: false, text: e.message }));

  if (!authed)
    return (
      <div className="authbg" style={{ minHeight: "100vh", backgroundImage: "linear-gradient(rgba(20,8,5,.65),rgba(20,8,5,.8)), url(" + (window.HERO_IMG || "") + ")" }}>
        <div className="auth">
          <h1>🔒 Admin login</h1>
          <form onSubmit={login}>
            <input type="email" placeholder="Admin email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <input type="password" placeholder="Admin password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            <button className="btn full" disabled={busy}>{busy ? "Please wait..." : "Log in"}</button>
          </form>
          <Msg m={msg} />
          <div className="links"><a href="#login">Back to customer site</a></div>
        </div>
      </div>
    );

  const kitchen = orders.filter((o) => o.status === "In Kitchen").length;
  const delivery = orders.filter((o) => o.status === "Sent to Delivery").length;
  const lowCount = inv.filter((i) => i.stock < LOW_LIMIT).length;
  const groups = [["base", "🍞 Pizza bases"], ["sauce", "🥫 Sauces"], ["cheese", "🧀 Cheeses"], ["veggie", "🥬 Vegetables"]];

  return (
    <div className="admin">
      <div className="top"><b>🍕 Admin panel</b><nav><button className="pill" onClick={out}>Log out</button></nav></div>
      <div className="ahero" style={{ backgroundImage: "url(" + window.HERO_IMG + ")" }}>
        <h1>Kitchen <em>dashboard</em></h1>
        <p>{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} · {SHOP.name}</p>
      </div>
      <div className="wrap wide">
        <div className="stats">
          <div className="stat"><i>🧾</i><b>{orders.length}</b><span>Paid orders</span></div>
          <div className="stat"><i>🔥</i><b>{kitchen}</b><span>In kitchen</span></div>
          <div className="stat"><i>🛵</i><b>{delivery}</b><span>Out for delivery</span></div>
          <div className={"stat" + (lowCount ? " warn" : "")}><i>⚠️</i><b>{lowCount}</b><span>Low stock</span></div>
        </div>
        <Msg m={err} />
        <div className="tabs">
          <button className={"btn" + (tab === "orders" ? "" : " ghost")} onClick={() => setTab("orders")}>Orders</button>
          <button className={"btn" + (tab === "stock" ? "" : " ghost")} onClick={() => setTab("stock")}>Inventory</button>
        </div>

        {tab === "orders" && (
          <div>
            {orders.length === 0 && <p className="empty">🍕 No paid orders yet.<br />New orders will appear here.</p>}
            <div className="agrid">
              {orders.map((o) => {
                const si = STATUSES.indexOf(o.status) + 1;
                const first = o.pizzas[0] ? o.pizzas[0].name : "";
                const dl = o.delivery || {};
                return (
                  <div className={"ocard s" + si} key={o._id}>
                    <div className="ohead">
                      <Photo src={imgFor(first)} alt={first} />
                      <div className="info">
                        <div className="row"><b>{o.user ? o.user.name : "Customer"}</b><span className="price">{$(o.total)}</span></div>
                        <p className="muted">{o.user && o.user.email}</p>
                        <p className="muted">{new Date(o.createdAt).toLocaleString()}</p>
                        <span className="sbadge">{o.status}</span>
                      </div>
                    </div>
                    {dl.address && (
                      <div className="pline">
                        📍 <b>{[dl.area, dl.country].filter(Boolean).join(", ")}</b><br />
                        {dl.address}<br />
                        📞 {dl.phone}{dl.note ? <span><br />📝 {dl.note}</span> : null}
                      </div>
                    )}
                    {o.pizzas.map((p, i) => <div className="pline" key={i}>🍕 <b>{p.name}</b>: {p.base}, {p.sauce}, {p.cheese}{p.veggies.length ? ", " + p.veggies.join(", ") : ""}</div>)}
                    <div className="statusbtns">{STATUSES.map((s) => <button key={s} className={o.status === s ? "on" : ""} onClick={() => setStatus(o._id, s)}>{s}</button>)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "stock" && (
          <div>
            {groups.map(([type, title]) => (
              <div key={type}>
                <h3>{title}</h3>
                <div className="igrid">
                  {inv.filter((i) => i.type === type).map((i) => <StockRow key={i._id} item={i} onSaved={loadInv} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- App ---------- */
function App() {
  const hash = useHash();
  const [route, arg] = hash.split("/");
  const [user, setUser] = useState(localStorage.getItem("pizza_token") ? localStorage.getItem("pizza_name") : null);
  const [cart, setCart] = useState([]);
  const [opts, setOpts] = useState(null);
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    if (user) call("/api/orders/options").then(setOpts).catch((e) => setBanner({ ok: false, text: e.message }));
  }, [user]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 5000);
    return () => clearTimeout(t);
  }, [banner]);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get("paid") && q.get("session_id")) {
      const orderId = q.get("paid"), sessionId = q.get("session_id");
      history.replaceState(null, "", location.pathname);
      call("/api/orders/confirm", "POST", { orderId, sessionId })
        .then(() => { setCart([]); setBanner({ ok: true, text: "Payment successful! Your order is in." }); go("orders"); })
        .catch((e) => setBanner({ ok: false, text: e.message }));
    } else if (q.get("cancelled")) {
      history.replaceState(null, "", location.pathname);
      setBanner({ ok: false, text: "Payment cancelled." });
      go("cart");
    }
  }, []);

  const addToCart = (p) => { setCart((c) => [...c, p]); setBanner({ ok: true, text: "Added to cart" }); };
  const logout = () => { localStorage.removeItem("pizza_token"); localStorage.removeItem("pizza_name"); setUser(null); setOpts(null); setCart([]); go("login"); };

  let page;
  if (route === "admin") page = <Admin />;
  else if (route === "verify") page = <Verify token={arg} />;
  else if (route === "reset") page = <Reset token={arg} />;
  else if (route === "inbox-verify") page = <DemoInbox kind="verify" token={arg} />;
  else if (route === "inbox-reset") page = <DemoInbox kind="reset" token={arg} />;
  else if (route === "support") page = <Support />;
  else if (!user) {
    const mode = route === "register" || route === "forgot" ? route : "login";
    page = <AuthPage key={mode} mode={mode} onLogin={setUser} />;
  } else if (!opts) page = <p className="empty">Loading menu (the server may be waking up)...</p>;
  else if (route === "build") page = <Builder opts={opts} addToCart={addToCart} />;
  else if (route === "cart") page = <Cart cart={cart} setCart={setCart} />;
  else if (route === "orders") page = <Orders />;
  else page = <Menu opts={opts} addToCart={addToCart} name={user} />;

  const isAdmin = route === "admin";
  return (
    <div>
      {!isAdmin && <Header user={user} cartCount={cart.length} logout={logout} />}
      {banner && <div className="toast"><Msg m={banner} /></div>}
      {page}
      {!isAdmin && <Footer />}
      {!isAdmin && <Chatbot />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);