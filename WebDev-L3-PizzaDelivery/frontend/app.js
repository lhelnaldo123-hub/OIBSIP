const { useState, useEffect, useRef } = React;
const API = window.API_URL.replace(/\/$/, "");
const $ = (n) => "$" + Number(n).toFixed(2);
const STATUSES = ["Order Received", "In Kitchen", "Sent to Delivery"];
const LOW_FALLBACK = 20; // only used if the server sends no reorder level
const isLow = (i) => i.stock < (i.reorderLevel !== undefined && i.reorderLevel !== null ? i.reorderLevel : LOW_FALLBACK);
const go = (h) => { location.hash = h; };
const readJSON = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v === null || v === undefined ? d : v; } catch (e) { return d; } };
const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const imgFor = (name) => (window.PIZZA_IMG && window.PIZZA_IMG[name]) || window.DEFAULT_IMG;

const COUNTRIES = ["Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda","Argentina","Armenia","Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Cabo Verde","Cambodia","Cameroon","Canada","Central African Republic","Chad","Chile","China","Colombia","Comoros","Congo (DRC)","Congo (Republic)","Costa Rica","Côte d'Ivoire","Croatia","Cuba","Cyprus","Czechia","Denmark","Djibouti","Dominica","Dominican Republic","Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","Fiji","Finland","France","Gabon","Gambia","Georgia","Germany","Ghana","Greece","Grenada","Guatemala","Guinea","Guinea-Bissau","Guyana","Haiti","Honduras","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kiribati","Kosovo","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Marshall Islands","Mauritania","Mauritius","Mexico","Micronesia","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar","Namibia","Nauru","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea","North Macedonia","Norway","Oman","Pakistan","Palau","Palestine","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Rwanda","Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines","Samoa","San Marino","São Tomé and Príncipe","Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands","Somalia","South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste","Togo","Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Tuvalu","Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan","Vanuatu","Vatican City","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe","Other"];

/* ---- Change these to your real details ---- */
const SHOP = { name: "Slice & Co.", phone: "+233 20 000 0000", email: "help@sliceandco.com", address: "12 Market Street, Accra", hours: "Open daily 10am – 11pm" };
const telHref = "tel:" + SHOP.phone.replace(/[^\d+]/g, "");

const TYPE_ICON = { base: "🍞", sauce: "🥫", cheese: "🧀", veggie: "🥬", packaging: "📦", drink: "🥤", side: "🍟", supply: "🧴", other: "📝" };
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

// Download a CSV file from the admin API (needs the admin login, so a plain link will not work).
async function downloadCsv(path, filename) {
  const res = await fetch(API + path, { headers: { Authorization: "Bearer " + (localStorage.getItem("pizza_admin_token") || "") } });
  if (!res.ok) throw new Error("Could not download the file");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---- pizza sizes (the server sends the list; Regular is the fallback) ---- */
const DEFAULT_SIZES = [{ key: "R", label: "Regular", mult: 1, portions: 1 }];
const sizeList = (opts) => (opts && opts.sizes && opts.sizes.length ? opts.sizes : DEFAULT_SIZES);
const sizeOf = (opts, key) => sizeList(opts).find((s) => s.key === key) || sizeList(opts)[0];
// p.price is the Regular price; the size multiplies it (the server does the same sum).
const priceFor = (opts, p, key) => Math.round(p.price * sizeOf(opts, key || p.size || "R").mult * 100) / 100;

function SizePicker({ opts, value, onChange, base, minStock }) {
  const list = sizeList(opts);
  if (list.length < 2) return null;
  return (
    <div className="sizes" role="group" aria-label="Pizza size">
      {list.map((s) => {
        const short = minStock !== undefined && minStock < s.portions;
        return (
          <button type="button" key={s.key} className={"szb" + (value === s.key ? " on" : "")} disabled={short} onClick={() => onChange(s.key)}>
            <b>{s.label}</b><span>{short ? "not enough" : $(Math.round(base * s.mult * 100) / 100)}</span>
          </button>
        );
      })}
    </div>
  );
}

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
function Header({ user, cartCount, logout, theme, toggleTheme }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  useEffect(() => {
    if (!open) return;
    const k = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);

  // [link, icon, label] used by the side menu
  const links = user
    ? [["#dashboard", "🍕", "Menu"], ["#build", "🛠️", "Build your pizza"], ["#favourites", "❤️", "Favourites"], ["#orders", "📦", "Orders"], ["#offers", "🏷️", "Special offers"], ["#account", "👤", "My account"], ["#support", "💬", "Support"], ["#cart", "🛒", "Cart"]]
    : [["#support", "💬", "Support"], ["#login", "🔑", "Log in"], ["#register", "📝", "Sign up"]];

  return (
    <header className="top">
      <div className="brand">
        <button className="burger" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
        <a className="logo" href={user ? "#dashboard" : "#login"}>🍕 Slice <span>&amp; Co.</span></a>
      </div>
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

      {/* Side menu (the ☰ button) */}
      <div className={"drawer-bg" + (open ? " open" : "")} onClick={close} />
      <aside className={"drawer" + (open ? " open" : "")} aria-hidden={!open}>
        <div className="drawer-top">
          <a className="logo" href={user ? "#dashboard" : "#login"} onClick={close}>🍕 Slice <span>&amp; Co.</span></a>
          <button className="drawer-x" onClick={close} aria-label="Close menu">✕</button>
        </div>
        {user && <p className="drawer-hi">Hi, {user} 👋</p>}
        {open && KITCHEN_CLIPS.length > 0 && !REDUCE_MOTION && <DrawerReel />}
        <div className="drawer-links">
          {links.map(([href, icon, label]) => (
            <a key={href} href={href} onClick={close}>
              <span className="di">{icon}</span>{label}
              {href === "#cart" && <span className="badge">{cartCount}</span>}
            </a>
          ))}
          <a href={telHref} onClick={close}><span className="di">📞</span>Call us</a>
          <button className="drawer-theme" onClick={toggleTheme}>
            <span className="di">{theme === "dark" ? "☀️" : "🌙"}</span>{theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </div>
        {user && <button className="btn full" onClick={() => { close(); logout(); }}>Log out</button>}
      </aside>
    </header>
  );
}

/* ---------- Floating cart (drag it anywhere, it snaps to the left or right edge) ---------- */
function FloatingCart({ cart, setCart, opts }) {
  const SIZE = 58, GAP = 8;
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const fit = (p) => ({ x: clamp(p.x, GAP, window.innerWidth - SIZE - GAP), y: clamp(p.y, GAP, window.innerHeight - SIZE - GAP) });
  const snap = (p) => ({ x: p.x + SIZE / 2 < window.innerWidth / 2 ? GAP : window.innerWidth - SIZE - GAP, y: p.y });

  const [pos, setPos] = useState(() => {
    const saved = readJSON("pizza_cart_pos", null);
    return fit(saved && typeof saved.x === "number" && typeof saved.y === "number" ? saved : { x: window.innerWidth - SIZE - GAP, y: 130 });
  });
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [bump, setBump] = useState(false);
  const cur = useRef(pos);
  cur.current = pos;
  const drag = useRef(null);
  const skipClick = useRef(false);
  const prevCount = useRef(cart.length);

  // little "pop" when a pizza is added
  useEffect(() => {
    const grew = cart.length > prevCount.current;
    prevCount.current = cart.length;
    if (!grew) return;
    setBump(true);
    const t = setTimeout(() => setBump(false), 500);
    return () => clearTimeout(t);
  }, [cart.length]);

  // keep the button on screen when the phone rotates / window resizes
  useEffect(() => {
    const onResize = () => setPos((p) => snap(fit(p)));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const down = (e) => {
    drag.current = { sx: e.clientX, sy: e.clientY, ox: cur.current.x, oy: cur.current.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 6) return; // small wiggle = a tap, not a drag
    if (!d.moved) { d.moved = true; setDragging(true); setOpen(false); }
    setPos(fit({ x: d.ox + dx, y: d.oy + dy }));
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (d && d.moved) {
      const s = snap(cur.current);
      setPos(s);
      saveJSON("pizza_cart_pos", s);
      skipClick.current = true; // the click that follows a drag must not open the cart
      setTimeout(() => { skipClick.current = false; }, 60);
    }
  };
  const click = () => {
    if (skipClick.current) { skipClick.current = false; return; }
    setOpen((o) => !o);
  };

  // group identical pizzas so they show as one line with a quantity
  const groups = [];
  cart.forEach((p, i) => {
    const k = [p.name, p.size || "R", p.labels || ""].join("|");
    let g = groups.find((x) => x.k === k);
    if (!g) { g = { k, p, idx: [] }; groups.push(g); }
    g.idx.push(i);
  });
  const plus = (g) => setCart([...cart, { ...g.p }]);
  const minus = (g) => { const last = g.idx[g.idx.length - 1]; setCart(cart.filter((_, x) => x !== last)); };
  const removeAll = (g) => setCart(cart.filter((_, x) => !g.idx.includes(x)));

  const total = cart.reduce((a, p) => a + priceFor(opts, p), 0);
  const onRight = pos.x > window.innerWidth / 2;
  const below = pos.y < window.innerHeight / 2;
  const popStyle = {
    [onRight ? "right" : "left"]: GAP + 4,
    ...(below ? { top: pos.y + SIZE + 10 } : { bottom: window.innerHeight - pos.y + 10 }),
  };

  return (
    <>
      {open && (
        <div className="fpop" style={popStyle}>
          <div className="fp-head"><b>Your cart ({cart.length})</b><button onClick={() => setOpen(false)} aria-label="Close cart">✕</button></div>
          {!cart.length ? (
            <>
              <p className="muted" style={{ margin: "10px 0 14px" }}>Your cart is empty.</p>
              <button className="btn full" onClick={() => { setOpen(false); go("dashboard"); }}>Browse pizzas</button>
            </>
          ) : (
            <>
              <div className="fp-list">
                {groups.map((g) => (
                  <div className="fp-row" key={g.k}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b>{g.p.name}</b>
                      <div className="muted">{sizeOf(opts, g.p.size || "R").label} · {$(priceFor(opts, g.p))} each</div>
                    </div>
                    <div className="qty">
                      <button onClick={() => minus(g)} aria-label={"One less " + g.p.name}>−</button>
                      <span>{g.idx.length}</span>
                      <button onClick={() => plus(g)} aria-label={"One more " + g.p.name}>+</button>
                    </div>
                    <button className="fp-rm" onClick={() => removeAll(g)} aria-label={"Remove " + g.p.name}>🗑️</button>
                  </div>
                ))}
              </div>
              <div className="row fp-total"><b>Total</b><span className="price">{$(total)}</span></div>
              <button className="btn full" onClick={() => { setOpen(false); go("cart"); }}>Go to checkout</button>
            </>
          )}
        </div>
      )}
      <button
        className={"fcart" + (dragging ? " drag" : "") + (bump ? " bump" : "")}
        style={{ left: pos.x, top: pos.y }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onClick={click}
        aria-label={"Cart, " + cart.length + " items. Drag to move."}
      >
        🛒{cart.length > 0 && <span className="fc-n">{cart.length}</span>}
      </button>
    </>
  );
}

/* ---------- Favourites / Offers / My account ---------- */
// Edit these cards to match your real deals. They are display-only:
// a real discount must also be applied by the backend, or customers will be charged the normal price.
const OFFERS = [
  { icon: "🍕", title: "Build your own", text: "Pick any base, sauce and cheese, then add as many vegetables as you like.", link: "build", cta: "Start building" },
  { icon: "🌱", title: "Vegan & gluten-free", text: "Choose Vegan Cheese or a Gluten Free base in the pizza builder.", link: "build", cta: "Try it" },
  { icon: "🚚", title: "Fast delivery", text: "Most orders arrive in 30–45 minutes. Track yours live under Orders.", link: "dashboard", cta: "Order now" },
];

function Favourites({ opts, addToCart, favs, toggleFav }) {
  const list = opts.varieties.filter((v) => favs.includes(v.name));
  return (
    <div className="wrap wide">
      <h2>❤️ My favourites</h2>
      {!list.length && (
        <>
          <p className="empty">No favourites yet. Tap the 🤍 on any pizza to save it here.</p>
          <button className="btn full" onClick={() => go("dashboard")}>Browse pizzas</button>
        </>
      )}
      <div className="grid">
        {list.map((v) => <PizzaCard key={v.name} v={v} opts={opts} addToCart={addToCart} fav={true} toggleFav={toggleFav} />)}
      </div>
    </div>
  );
}

function Offers() {
  return (
    <div className="wrap">
      <h2>🏷️ Special offers</h2>
      {!OFFERS.length && <p className="empty">No offers right now. Check back soon!</p>}
      {OFFERS.map((o) => (
        <div className="card offer" key={o.title}>
          <div className="oicon">{o.icon}</div>
          <div style={{ flex: 1 }}>
            <b>{o.title}</b>
            <p className="muted">{o.text}</p>
            <button className="btn" style={{ marginTop: 8 }} onClick={() => go(o.link)}>{o.cta}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Account({ user, theme, toggleTheme, favs }) {
  const [addrs, setAddrs] = useState(() => readJSON("pizza_addresses", []));
  const [perm, setPerm] = useState(() => ("Notification" in window ? Notification.permission : "unsupported"));
  const removeAddr = (i) => { const l = addrs.filter((_, x) => x !== i); setAddrs(l); saveJSON("pizza_addresses", l); };
  const ask = () => { try { Notification.requestPermission().then(setPerm); } catch (e) {} };
  return (
    <div className="wrap">
      <h2>👤 My account</h2>
      <div className="card">
        <div className="row"><b>Name</b><span>{user}</span></div>
        <div className="row" style={{ marginTop: 10 }}><b>Favourites</b><a href="#favourites">{favs.length} saved →</a></div>
      </div>

      <div className="card">
        <div className="row">
          <b>{theme === "dark" ? "🌙 Dark mode" : "☀️ Light mode"}</b>
          <button className="btn ghost" onClick={toggleTheme}>Switch to {theme === "dark" ? "light" : "dark"}</button>
        </div>
      </div>

      <div className="card">
        <b>🔔 Order notifications</b>
        <p className="muted" style={{ margin: "6px 0 10px" }}>Get an alert when your order moves to the kitchen or goes out for delivery (while the site is open).</p>
        {perm === "granted" && <p className="msg ok">Notifications are on.</p>}
        {perm === "denied" && <p className="muted">Notifications are blocked. Allow them in your browser's site settings.</p>}
        {perm === "unsupported" && <p className="muted">This browser doesn't support notifications. You will still see an alert on the page.</p>}
        {perm === "default" && <button className="btn" onClick={ask}>Turn on notifications</button>}
      </div>

      <h2 style={{ marginTop: 18 }}>📍 Saved addresses</h2>
      {!addrs.length && <p className="muted">None yet. In your cart, tap "Save this address" to keep one here.</p>}
      {addrs.map((a, i) => (
        <div className="card row" key={i}>
          <span className="muted" style={{ flex: 1 }}>{place(a)}{a.phone ? " · " + a.phone : ""}</span>
          <button className="btn ghost" onClick={() => removeAddr(i)}>Remove</button>
        </div>
      ))}

      <p className="muted" style={{ marginTop: 14 }}>Favourites, addresses and ratings are saved on this device.</p>
    </div>
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
          <p>📞 <a href={telHref}>{SHOP.phone}</a></p>
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
/* ---------- Videos (put the files in frontend/videos/) ---------- */
// Homepage background: someone packaging pizza. Set to "" to turn it off.
const HERO_VIDEO = "videos/packaging.mp4";
// Kitchen clips shown in the ☰ side menu. Add, remove or rename as you like. A missing file is simply skipped.
const KITCHEN_CLIPS = [
  { src: "videos/chef-dough.mp4", title: "Fresh dough, made by hand" },
  { src: "videos/chef-toppings.mp4", title: "Toppings added with care" },
  { src: "videos/chef-oven.mp4", title: "Baked hot to order" },
];
const REDUCE_MOTION = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// A silent, looping video that only plays while it is on screen (saves data and battery).
function LoopVideo({ src, cls, onBad }) {
  const ref = useRef(null);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!v || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } else v.pause(); }, { threshold: 0.35 });
    io.observe(v);
    return () => io.disconnect();
  }, [bad]);
  if (bad) return null;
  return <video ref={ref} className={cls} src={src} muted loop playsInline autoPlay preload="metadata" onError={() => { setBad(true); if (onBad) onBad(); }} />;
}

// Plays the kitchen clips one after another inside the side menu. It only loads while the menu is open.
function DrawerReel() {
  const [i, setI] = useState(0);
  const [bad, setBad] = useState([]);
  const good = KITCHEN_CLIPS.filter((c) => !bad.includes(c.src));
  if (!good.length) return null;
  const k = good[i % good.length];
  return (
    <div className="reel">
      <video key={k.src + i} src={k.src} muted playsInline autoPlay preload="metadata"
        onEnded={() => setI((n) => n + 1)} onError={() => setBad((b) => [...b, k.src])} />
      <span>👨‍🍳 {k.title}</span>
    </div>
  );
}

function PizzaCard({ v, opts, addToCart, fav, toggleFav }) {
  const [size, setSize] = useState("R");
  return (
    <div className="pcard">
      <Photo src={imgFor(v.name)} alt={v.name} />
      <div className="pbody">
        <div className="row"><b>{v.name}</b><span>{toggleFav && <button className="heart" onClick={() => toggleFav(v.name)} aria-label={fav ? "Remove from favourites" : "Save to favourites"}>{fav ? "❤️" : "🤍"}</button>} <span className="price">{$(priceFor(opts, v, size))}</span></span></div>
        <p className="muted">{v.desc}</p>
        <p className="muted">{v.labels}</p>
        <SizePicker opts={opts} value={size} onChange={setSize} base={v.price} minStock={v.minStock} />
        <button className="btn full" style={{ marginTop: 8 }} disabled={v.soldOut} onClick={() => addToCart({ ...v, size })}>{v.soldOut ? "Sold out" : "Add to cart"}</button>
      </div>
    </div>
  );
}

function Menu({ opts, addToCart, name, favs = [], toggleFav }) {
  return (
    <div>
      <div className="hero" style={{ backgroundImage: "url(" + window.HERO_IMG + ")" }}>
        {HERO_VIDEO && !REDUCE_MOTION && <LoopVideo src={HERO_VIDEO} cls="hero-video" />}
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
          {opts.varieties.map((v) => <PizzaCard key={v.name} v={v} opts={opts} addToCart={addToCart} fav={favs.includes(v.name)} toggleFav={toggleFav} />)}
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
  const [size, setSize] = useState("R");
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
      name: "Custom Pizza", size, base: sel.base, sauce: sel.sauce, cheese: sel.cheese, veggies: sel.veggies,
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
      {step === 3 && (() => {
        const all = [find("base", sel.base), find("sauce", sel.sauce), find("cheese", sel.cheese), ...sel.veggies.map((id) => find("veggie", id))].filter(Boolean);
        const regular = 4 + all.reduce((a, i) => a + i.price, 0);
        return (
          <div style={{ marginTop: 12 }}>
            <h3>Choose your size</h3>
            <SizePicker opts={opts} value={size} onChange={setSize} base={regular} minStock={Math.min(...all.map((i) => i.stock))} />
          </div>
        );
      })()}
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
function Cart({ cart, setCart, opts }) {
  const { busy, msg, setMsg, run } = useAsync();
  const blank = { country: "", area: "", address: "", phone: "", note: "" };
  const [d, setD] = useState(() => {
    try { return { ...blank, ...(JSON.parse(localStorage.getItem("pizza_delivery")) || {}) }; }
    catch (e) { return blank; }
  });
  const setField = (k) => (e) => setD({ ...d, [k]: e.target.value });
  const [saved, setSaved] = useState(() => readJSON("pizza_addresses", []));
  const saveAddr = () => {
    if (d.area.trim().length < 2 || d.address.trim().length < 5) return setMsg({ ok: false, text: "Fill in your city/area and address first." });
    const entry = { country: d.country, area: d.area, address: d.address, phone: d.phone };
    const list = [entry, ...saved.filter((a) => !(a.address === entry.address && a.area === entry.area))].slice(0, 5);
    setSaved(list); saveJSON("pizza_addresses", list);
    setMsg({ ok: true, text: "Address saved." });
  };
  const fillAddr = (i) => { if (i === "") return; const a = saved[+i]; setD({ ...d, country: a.country || "", area: a.area || "", address: a.address || "", phone: a.phone || d.phone }); };
  const total = cart.reduce((a, p) => a + priceFor(opts, p), 0);

  const pay = () => {
    if (!d.country) return setMsg({ ok: false, text: "Please choose your country." });
    if (d.area.trim().length < 2) return setMsg({ ok: false, text: "Please enter your city or area." });
    if (d.address.trim().length < 5) return setMsg({ ok: false, text: "Please write your street address or landmark." });
    if (d.phone.replace(/\D/g, "").length < 7) return setMsg({ ok: false, text: "Please enter a phone number we can call (include the country code)." });
    run(async () => {
      localStorage.setItem("pizza_delivery", JSON.stringify(d));
      const pizzas = cart.map(({ name, size, base, sauce, cheese, veggies }) => ({ name, size: size || "R", base, sauce, cheese, veggies }));
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
              <div className="row"><b>{p.name}</b><span className="price">{$(priceFor(opts, p))}</span></div>
              <p className="muted">{p.labels}</p>
            </div>
          </div>
          <SizePicker opts={opts} value={p.size || "R"} base={p.price} onChange={(k) => setCart(cart.map((x, n) => (n === i ? { ...x, size: k } : x)))} />
          <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => setCart(cart.filter((_, x) => x !== i))}>Remove</button>
        </div>
      ))}
      <div className="card row"><b>Total</b><span className="price">{$(total)}</span></div>

      <h2 style={{ marginTop: 18 }}>📍 Delivery location</h2>
      <div className="card">
        {saved.length > 0 && (
          <>
            <label className="muted">Use a saved address</label>
            <select value="" onChange={(e) => fillAddr(e.target.value)}>
              <option value="">Choose...</option>
              {saved.map((a, i) => <option key={i} value={i}>{[a.address, a.area].filter(Boolean).join(", ")}</option>)}
            </select>
          </>
        )}
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
        <button type="button" className="btn ghost full" onClick={saveAddr}>💾 Save this address</button>
      </div>

      <button className="btn full" disabled={busy} onClick={pay}>{busy ? "Opening payment..." : "Pay with Stripe (test mode)"}</button>
      <p className="muted" style={{ marginTop: 10 }}>Test card: 4242 4242 4242 4242, any future date, any 3 digits. No real money is charged.</p>
      <Msg m={msg} />
    </div>
  );
}

/* ---------- My orders ---------- */
function Orders({ opts, addToCart }) {
  const [orders, setOrders] = useState(null);
  const [err, setErr] = useState(null);
  const [ratings, setRatings] = useState(() => readJSON("pizza_ratings", {}));
  const rate = (id, n) => { const r = { ...ratings, [id]: n }; setRatings(r); saveJSON("pizza_ratings", r); };
  const reorder = (o) => {
    const found = (type, n) => opts[type].find((i) => i.name === n);
    let added = 0, missed = 0;
    o.pizzas.forEach((p) => {
      const sz = sizeList(opts).find((x) => x.label === p.sizeLabel) || sizeList(opts)[0];
      const v = opts.varieties.find((x) => x.name === p.name);
      if (v) { if (v.soldOut) missed++; else { addToCart({ ...v, size: sz.key }); added++; } return; }
      const b = found("base", p.base), sa = found("sauce", p.sauce), c = found("cheese", p.cheese);
      const vs = (p.veggies || []).map((n) => found("veggie", n));
      if (!b || !sa || !c || vs.some((x) => !x)) { missed++; return; }
      addToCart({
        name: "Custom Pizza", size: sz.key, base: b.id, sauce: sa.id, cheese: c.id, veggies: vs.map((x) => x.id),
        labels: [b.name, sa.name, c.name, ...vs.map((x) => x.name)].join(", "),
        price: +(4 + b.price + sa.price + c.price + vs.reduce((a, x) => a + x.price, 0)).toFixed(2),
      });
      added++;
    });
    if (added) go("cart");
    else setErr({ ok: false, text: "Sorry, those items are not available right now." });
  };
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
            {o.pizzas.map((p, i) => <p className="muted" key={i}>🍕 {p.name}{p.sizeLabel && p.sizeLabel !== "Regular" ? " (" + p.sizeLabel + ")" : ""}: {p.base}, {p.sauce}, {p.cheese}{p.veggies.length ? ", " + p.veggies.join(", ") : ""}</p>)}
            {o.delivery && o.delivery.address && <p className="muted" style={{ marginTop: 6 }}>📍 {place(o.delivery)}</p>}
            {o.status === "Cancelled"
              ? <p className="cancelled">❌ This order was cancelled{o.refundedAt ? ". Your payment has been refunded; your bank may take a few days to show it." : ". If you were charged, please contact us."}</p>
              : <div className="track">{STATUSES.map((s, i) => <span key={s} className={i <= idx ? "on" : ""}>{s}</span>)}</div>}
            {o.status === "Sent to Delivery" && (
              <div className="rate">
                <span className="muted">{ratings[o._id] ? "Your rating:" : "Rate this order:"}</span>
                {[1, 2, 3, 4, 5].map((n) => <button key={n} className={n <= (ratings[o._id] || 0) ? "on" : ""} onClick={() => rate(o._id, n)} aria-label={n + " stars"}>★</button>)}
              </div>
            )}
            {o.status !== "Cancelled" && opts && <button className="btn ghost full" style={{ marginTop: 10 }} onClick={() => reorder(o)}>🔁 Reorder</button>}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Admin ---------- */
const GROUPS = [
  ["base", "🍞 Pizza bases"], ["sauce", "🥫 Sauces"], ["cheese", "🧀 Cheeses"], ["veggie", "🥬 Vegetables & toppings"],
  ["packaging", "📦 Packaging"], ["drink", "🥤 Drinks"], ["side", "🍟 Sides"], ["supply", "🧴 Supplies"], ["other", "📝 Other"],
];
const SELLS = ["base", "sauce", "cheese", "veggie"]; // types that appear in the customer's pizza builder
const REASONS = [["delivery", "Delivery received"], ["wastage", "Wastage / spoiled"], ["correction", "Stock count correction"], ["other", "Other"]];
const REASON_LABEL = { delivery: "Delivery", wastage: "Wastage", correction: "Correction", other: "Other", order: "Customer order", "order-released": "Order released", "order-cancelled": "Order cancelled", "new-item": "New item" };
const SIZE_CHOICES = [["", "Every size"], ["R", "Regular"], ["L", "Large"], ["F", "Family"]]; // keep in step with backend/sizes.js
const daysLeft = (d) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null);
const dateValue = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");

function StockRow({ item, onSaved }) {
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("delivery");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [m, setM] = useState(null);
  const [busy, setBusy] = useState(false);
  const low = isLow(item);
  const hidden = item.active === false;
  const left = daysLeft(item.expiry);
  const pct = Math.max(2, Math.min(100, Math.round((item.stock / (Math.max(1, item.reorderLevel) * 3)) * 100)));

  const typeDelta = (v) => {
    setDelta(v);
    const n = parseInt(v, 10);
    if (n < 0 && reason === "delivery") setReason("wastage");
    if (n > 0 && reason === "wastage") setReason("delivery");
  };
  const apply = () => {
    const n = parseInt(delta, 10);
    if (isNaN(n) || n === 0) return setM({ ok: false, text: "Enter a number such as 10 or -3" });
    setBusy(true);
    A("/api/admin/inventory/" + item._id + "/adjust", "POST", { change: n, reason, note })
      .then(() => { setDelta(""); setNote(""); setM({ ok: true, text: "Saved ✓" }); onSaved(); })
      .catch((e) => setM({ ok: false, text: e.message }))
      .finally(() => setBusy(false));
  };

  const openEdit = () => {
    setForm({
      name: item.name, price: item.price, unit: item.unit || "pcs",
      reorderLevel: item.reorderCustom ? item.reorderLevel : "",
      supplier: item.supplier || "", expiry: dateValue(item.expiry), active: !hidden,
      usePerPizza: item.usePerPizza || 0, forSize: item.forSize || "", usePerOrder: item.usePerOrder || 0,
    });
    setEditing(true);
    setM(null);
  };
  const saveEdit = () => {
    setBusy(true);
    A("/api/admin/inventory/" + item._id, "PATCH", form)
      .then(() => { setEditing(false); setM({ ok: true, text: "Details saved ✓" }); onSaved(); })
      .catch((e) => setM({ ok: false, text: e.message }))
      .finally(() => setBusy(false));
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className={"icard" + (low && !hidden ? " low" : "") + (hidden ? " off" : "")}>
      <div className="ihead">
        <IngImg item={item} cls="ico" />
        <div className="info">
          <b>{item.name}</b>
          {low && !hidden && <span className="tag">LOW</span>}
          {hidden && <span className="tag grey">HIDDEN</span>}
          {left !== null && left <= 7 && <span className={"tag " + (left < 0 ? "" : "amber")}>{left < 0 ? "EXPIRED" : "EXPIRES IN " + left + "d"}</span>}
          <div className="muted"><b className="big">{item.stock}</b> {item.unit || "pcs"} · reorder at {item.reorderLevel}</div>
          {item.supplier && <div className="muted">Supplier: {item.supplier}</div>}
          {(item.usePerPizza > 0 || item.usePerOrder > 0) && (
            <div className="muted">Auto-used: {item.usePerPizza > 0 ? item.usePerPizza + " per " + ((SIZE_CHOICES.find((s) => s[0] === (item.forSize || "")) || [0, "every"])[1]).toLowerCase() + " pizza" : ""}{item.usePerPizza > 0 && item.usePerOrder > 0 ? " + " : ""}{item.usePerOrder > 0 ? item.usePerOrder + " per order" : ""}</div>
          )}
        </div>
      </div>
      <div className="sbar"><i style={{ width: pct + "%" }}></i></div>
      <div className="adj">
        <input type="number" step="1" placeholder="+10 or -3" value={delta} onChange={(e) => typeDelta(e.target.value)} aria-label={"Change in " + item.name} />
        <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason">
          {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <input type="text" placeholder="Note (optional)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
      <div className="iactions">
        <button className="btn" disabled={busy} onClick={apply}>Update stock</button>
        <button className="btn ghost" onClick={editing ? () => setEditing(false) : openEdit}>{editing ? "Close" : "Edit"}</button>
      </div>
      <Msg m={m} />
      {editing && (
        <div className="eform">
          <div className="fgrid">
            <label>Name<input value={form.name} onChange={set("name")} /></label>
            {SELLS.includes(item.type) && <label>Customer price<input type="number" step="0.01" min="0" value={form.price} onChange={set("price")} /></label>}
            <label>Unit<input value={form.unit} onChange={set("unit")} placeholder="pcs, kg, boxes" /></label>
            <label>Reorder level (blank = shop default)<input type="number" min="0" value={form.reorderLevel} onChange={set("reorderLevel")} /></label>
            <label>Supplier<input value={form.supplier} onChange={set("supplier")} /></label>
            <label>Best before<input type="date" value={form.expiry} onChange={set("expiry")} /></label>
            {!SELLS.includes(item.type) && <label>Used per pizza (automatic)<input type="number" min="0" step="1" value={form.usePerPizza} onChange={set("usePerPizza")} /></label>}
            {!SELLS.includes(item.type) && <label>…for which size<select value={form.forSize} onChange={set("forSize")}>{SIZE_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
            {!SELLS.includes(item.type) && <label>Used per order (automatic)<input type="number" min="0" step="1" value={form.usePerOrder} onChange={set("usePerOrder")} /></label>}
          </div>
          <label className="chk"><input type="checkbox" checked={!!form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active (untick to hide this item)</label>
          <p className="muted" style={{ margin: "6px 0 10px" }}>Hiding an ingredient also hides the menu pizzas that use it. Items used by a menu pizza cannot be renamed.</p>
          <button className="btn full" disabled={busy} onClick={saveEdit}>Save details</button>
        </div>
      )}
    </div>
  );
}

function AddItem({ onAdded }) {
  const blank = { type: "packaging", name: "", stock: "", unit: "pcs", price: "", reorderLevel: "", supplier: "", expiry: "", usePerPizza: "", forSize: "", usePerOrder: "" };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank);
  const [m, setM] = useState(null);
  const [busy, setBusy] = useState(false);
  const sells = SELLS.includes(f.type);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = (e) => {
    e.preventDefault();
    setBusy(true);
    A("/api/admin/inventory", "POST", f)
      .then(() => { setF(blank); setM({ ok: true, text: "Item added ✓" }); onAdded(); })
      .catch((err) => setM({ ok: false, text: err.message }))
      .finally(() => setBusy(false));
  };
  if (!open) return <button className="btn" style={{ marginBottom: 12 }} onClick={() => setOpen(true)}>+ Add item</button>;
  return (
    <form className="card eform" onSubmit={save}>
      <div className="row"><b>New inventory item</b><button type="button" className="pill" onClick={() => setOpen(false)}>Close</button></div>
      <p className="muted" style={{ margin: "6px 0 10px" }}>
        {sells ? "This item will appear in the customer's pizza builder straight away." : "Stock-only item: tracked here, not shown to customers."}
      </p>
      <div className="fgrid">
        <label>Category
          <select value={f.type} onChange={set("type")}>
            {GROUPS.map(([v, l]) => <option key={v} value={v}>{l.replace(/^\S+\s/, "")}</option>)}
          </select>
        </label>
        <label>Name<input value={f.name} onChange={set("name")} placeholder="e.g. Large pizza box" required /></label>
        <label>Starting stock<input type="number" min="0" step="1" value={f.stock} onChange={set("stock")} placeholder="0" /></label>
        <label>Unit<input value={f.unit} onChange={set("unit")} placeholder="pcs, kg, boxes" /></label>
        {sells && <label>Customer price<input type="number" min="0" step="0.01" value={f.price} onChange={set("price")} placeholder="0.00" /></label>}
        <label>Reorder level (blank = shop default)<input type="number" min="0" step="1" value={f.reorderLevel} onChange={set("reorderLevel")} /></label>
        <label>Supplier<input value={f.supplier} onChange={set("supplier")} /></label>
        <label>Best before<input type="date" value={f.expiry} onChange={set("expiry")} /></label>
        {!sells && <label>Used per pizza (automatic)<input type="number" min="0" step="1" value={f.usePerPizza} onChange={set("usePerPizza")} placeholder="0" /></label>}
        {!sells && <label>…for which size<select value={f.forSize} onChange={set("forSize")}>{SIZE_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
        {!sells && <label>Used per order (automatic)<input type="number" min="0" step="1" value={f.usePerOrder} onChange={set("usePerOrder")} placeholder="0" /></label>}
      </div>
      {!sells && <p className="muted" style={{ margin: "0 0 10px" }}>Example: a pizza box with "1 per pizza" is taken off the stock every time a pizza is ordered. A carry bag with "1 per order" is taken once per order. Leave 0 for items you count by hand.</p>}
      <button className="btn full" disabled={busy}>{busy ? "Adding..." : "Add item"}</button>
      <Msg m={m} />
    </form>
  );
}

function StockLogTab() {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState(null);
  const load = () => A("/api/admin/stock-log?limit=200").then((r) => { setRows(r); setErr(null); }).catch((e) => setErr({ ok: false, text: e.message }));
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);
  const needle = q.trim().toLowerCase();
  const shown = (rows || []).filter((r) => !needle || (r.itemName || "").toLowerCase().includes(needle) || (r.note || "").toLowerCase().includes(needle));
  return (
    <div>
      <div className="toolbar">
        <input placeholder="Search item or note" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the stock log" />
        <button className="btn ghost" onClick={() => downloadCsv("/api/admin/stock-log.csv?days=90", "stock-log.csv").catch((e) => setErr({ ok: false, text: e.message }))}>⬇ Download CSV (90 days)</button>
      </div>
      <Msg m={err} />
      {rows === null && !err && <p className="empty">Loading the stock log...</p>}
      {rows !== null && shown.length === 0 && <p className="empty">No stock movements to show yet.</p>}
      <div className="logs">
        {shown.map((r) => (
          <div className="logrow" key={r._id}>
            <div className="lg-main">
              <b>{r.itemName}</b>
              <span className="muted">{REASON_LABEL[r.reason] || r.reason}{r.note ? " · " + r.note : ""}</span>
            </div>
            <div className={"lg-chg " + (r.change > 0 ? "up" : "down")}>{r.change > 0 ? "+" : ""}{r.change}</div>
            <div className="lg-meta muted">{r.before} → {r.after} · {new Date(r.createdAt).toLocaleString()} · {r.by}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CancelBox({ order, onDone }) {
  const [open, setOpen] = useState(false);
  // Ingredients go back by default only if the kitchen has not started yet.
  const [restock, setRestock] = useState(order.status === "Order Received");
  const [refund, setRefund] = useState(true);
  const [note, setNote] = useState("");
  const [m, setM] = useState(null);
  const [busy, setBusy] = useState(false);
  const go_ = () => {
    setBusy(true);
    A("/api/admin/orders/" + order._id + "/cancel", "POST", { restock, refund, note })
      .then((r) => {
        setM(r.refundError ? { ok: false, text: "Order cancelled, but the refund failed: " + r.refundError + ". Refund it in the Stripe dashboard." } : { ok: true, text: "Order cancelled ✓" });
        onDone();
      })
      .catch((e) => setM({ ok: false, text: e.message }))
      .finally(() => setBusy(false));
  };
  if (!open) return <button className="btn ghost danger" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>Cancel order…</button>;
  return (
    <div className="eform">
      <b>Cancel this order?</b>
      <label className="chk"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> Put the ingredients and packaging back in stock</label>
      <label className="chk"><input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} /> Refund {$(order.total)} to the customer (Stripe)</label>
      <input placeholder="Reason (optional)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="iactions">
        <button className="btn danger" disabled={busy} onClick={go_}>{busy ? "Cancelling..." : "Yes, cancel it"}</button>
        <button className="btn ghost" onClick={() => setOpen(false)}>Keep order</button>
      </div>
      <Msg m={m} />
    </div>
  );
}

function ReportTab() {
  const [days, setDays] = useState(30);
  const [r, setR] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    setR(null);
    A("/api/admin/report?days=" + days).then((x) => { setR(x); setErr(null); }).catch((e) => setErr({ ok: false, text: e.message }));
  }, [days]);
  const dl = (path, name) => downloadCsv(path, name).catch((e) => setErr({ ok: false, text: e.message }));
  return (
    <div>
      <div className="toolbar">
        <select value={days} onChange={(e) => setDays(+e.target.value)} aria-label="Report period">
          <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last year</option>
        </select>
        <button className="btn ghost" onClick={() => dl("/api/admin/report.csv?days=" + days, "stock-report-" + days + "days.csv")}>⬇ Stock report CSV</button>
      </div>
      <Msg m={err} />
      {!r && !err && <p className="empty">Building the report...</p>}
      {r && (
        <div>
          <div className="stats">
            <div className="stat"><i>🧾</i><b>{r.orders}</b><span>Paid orders</span></div>
            <div className="stat"><i>💰</i><b>{$(r.revenue)}</b><span>Sales</span></div>
            <div className="stat"><i>❌</i><b>{r.cancelled}</b><span>Cancelled</span></div>
          </div>
          <h3>Pizzas sold</h3>
          {r.pizzas.length === 0 && <p className="empty">No sales in this period.</p>}
          <div className="rtable">
            {r.pizzas.map((p, i) => <div className="rrow" key={i}><span>{p.name} <span className="muted">({p.size})</span></span><b>{p.count}</b><span className="muted">{$(p.revenue)}</span></div>)}
          </div>
          <h3>Stock used</h3>
          <p className="muted" style={{ marginBottom: 8 }}>Used = taken by customer orders (unpaid and cancelled ones are given back, so they are not counted). Days left is a guess from the average use in this period.</p>
          <div className="rtable">
            <div className="rrow head"><span>Item</span><b>Used</b><span>Wasted</span><span>Left</span><span>Days left</span></div>
            {r.items.filter((i) => i.used || i.wasted || i.delivered).map((i) => (
              <div className={"rrow" + (i.daysLeft !== null && i.daysLeft <= 3 ? " hot" : "")} key={i.id}>
                <span>{i.name}</span><b>{i.used}</b><span>{i.wasted}</span><span>{i.stock} {i.unit}</span><span>{i.daysLeft === null ? "–" : i.daysLeft}</span>
              </div>
            ))}
          </div>
        </div>
      )}
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
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const { busy, msg, run } = useAsync();

  const loadOrders = () => A("/api/admin/orders").then((o) => { setOrders(o); setErr(null); }).catch((e) => setErr({ ok: false, text: e.message }));
  const loadInv = () => A("/api/admin/inventory").then(setInv).catch((e) => setErr({ ok: false, text: e.message }));

  useEffect(() => {
    if (!authed) return;
    loadOrders(); loadInv();
    const t = setInterval(loadOrders, 5000);
    const t2 = setInterval(loadInv, 30000); // pick up stock taken by customer orders
    return () => { clearInterval(t); clearInterval(t2); };
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

  const live = orders.filter((o) => o.status !== "Cancelled");
  const kitchen = orders.filter((o) => o.status === "In Kitchen").length;
  const delivery = orders.filter((o) => o.status === "Sent to Delivery").length;
  const lowCount = inv.filter((i) => i.active !== false && isLow(i)).length;
  const needle = q.trim().toLowerCase();
  const visible = inv.filter((i) =>
    (showHidden || i.active !== false) &&
    (!lowOnly || isLow(i)) &&
    (!needle || i.name.toLowerCase().includes(needle) || (i.supplier || "").toLowerCase().includes(needle))
  );

  return (
    <div className="admin">
      <div className="top"><b>🍕 Admin panel</b><nav><button className="pill" onClick={out}>Log out</button></nav></div>
      <div className="ahero" style={{ backgroundImage: "url(" + window.HERO_IMG + ")" }}>
        <h1>Kitchen <em>dashboard</em></h1>
        <p>{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} · {SHOP.name}</p>
      </div>
      <div className="wrap wide">
        <div className="stats">
          <div className="stat"><i>🧾</i><b>{live.length}</b><span>Paid orders</span></div>
          <div className="stat"><i>🔥</i><b>{kitchen}</b><span>In kitchen</span></div>
          <div className="stat"><i>🛵</i><b>{delivery}</b><span>Out for delivery</span></div>
          <div className={"stat" + (lowCount ? " warn" : "")}><i>⚠️</i><b>{lowCount}</b><span>Low stock</span></div>
        </div>
        <Msg m={err} />
        <div className="tabs">
          <button className={"btn" + (tab === "orders" ? "" : " ghost")} onClick={() => setTab("orders")}>Orders</button>
          <button className={"btn" + (tab === "stock" ? "" : " ghost")} onClick={() => setTab("stock")}>Inventory</button>
          <button className={"btn" + (tab === "log" ? "" : " ghost")} onClick={() => setTab("log")}>Stock log</button>
          <button className={"btn" + (tab === "report" ? "" : " ghost")} onClick={() => setTab("report")}>Reports</button>
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
                    {o.pizzas.map((p, i) => <div className="pline" key={i}>🍕 <b>{p.name}</b>{p.sizeLabel ? <span className="sztag">{p.sizeLabel}</span> : null}: {p.base}, {p.sauce}, {p.cheese}{p.veggies.length ? ", " + p.veggies.join(", ") : ""}</div>)}
                    {o.status === "Cancelled"
                      ? <p className="cancelled">❌ Cancelled{o.cancelNote ? ": " + o.cancelNote : ""}{o.refundedAt ? " · refunded" : " · not refunded"}</p>
                      : <div>
                          <div className="statusbtns">{STATUSES.map((s) => <button key={s} className={o.status === s ? "on" : ""} onClick={() => setStatus(o._id, s)}>{s}</button>)}</div>
                          <CancelBox order={o} onDone={() => { loadOrders(); loadInv(); }} />
                        </div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "stock" && (
          <div>
            <div className="toolbar">
              <input placeholder="Search items or suppliers" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search items" />
              <label className="chk"><input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock only</label>
              <label className="chk"><input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Show hidden</label>
            </div>
            <AddItem onAdded={loadInv} />
            {visible.length === 0 && <p className="empty">No items match.</p>}
            {GROUPS.map(([type, title]) => {
              const list = visible.filter((i) => i.type === type);
              if (!list.length) return null;
              return (
                <div key={type}>
                  <h3>{title}</h3>
                  <div className="igrid">
                    {list.map((i) => <StockRow key={i._id} item={i} onSaved={loadInv} />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "log" && <StockLogTab />}
        {tab === "report" && <ReportTab />}
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
  const [favs, setFavs] = useState(() => readJSON("pizza_favs", []));
  const [theme, setTheme] = useState(() => readJSON("pizza_theme", "light"));
  const toggleFav = (n) => setFavs((f) => { const l = f.includes(n) ? f.filter((x) => x !== n) : [...f, n]; saveJSON("pizza_favs", l); return l; });
  const toggleTheme = () => setTheme((t) => { const n = t === "dark" ? "light" : "dark"; saveJSON("pizza_theme", n); return n; });
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);

  // alert the customer when an order's status changes (checks every 20 seconds while the site is open)
  const seen = useRef(null);
  useEffect(() => {
    if (!user) { seen.current = null; return; }
    let stop = false;
    const check = () => call("/api/orders/mine").then((list) => {
      if (stop || !Array.isArray(list)) return;
      const now = {};
      list.forEach((o) => { now[o._id] = o.status; });
      if (seen.current) {
        list.forEach((o) => {
          if (seen.current[o._id] && seen.current[o._id] !== o.status) {
            const text = o.status === "Cancelled" ? "Your order was cancelled." : "Your order is now: " + o.status;
            setBanner({ ok: o.status !== "Cancelled", text });
            try { if ("Notification" in window && Notification.permission === "granted") new Notification("Slice & Co.", { body: text }); } catch (e) {}
          }
        });
      }
      seen.current = now;
    }).catch(() => {});
    check();
    const t = setInterval(check, 20000);
    return () => { stop = true; clearInterval(t); };
  }, [user]);

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
      const cancelledId = q.get("cancelled");
      history.replaceState(null, "", location.pathname);
      if (cancelledId !== "1") call("/api/orders/cancel", "POST", { orderId: cancelledId }).catch(() => {});
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
  else if (route === "cart") page = <Cart cart={cart} setCart={setCart} opts={opts} />;
  else if (route === "orders") page = <Orders opts={opts} addToCart={addToCart} />;
  else if (route === "favourites") page = <Favourites opts={opts} addToCart={addToCart} favs={favs} toggleFav={toggleFav} />;
  else if (route === "offers") page = <Offers />;
  else if (route === "account") page = <Account user={user} theme={theme} toggleTheme={toggleTheme} favs={favs} />;
  else page = <Menu opts={opts} addToCart={addToCart} name={user} favs={favs} toggleFav={toggleFav} />;

  const isAdmin = route === "admin";
  return (
    <div>
      {!isAdmin && <Header user={user} cartCount={cart.length} logout={logout} theme={theme} toggleTheme={toggleTheme} />}
      {banner && <div className="toast"><Msg m={banner} /></div>}
      {page}
      {!isAdmin && <Footer />}
      {!isAdmin && <Chatbot />}
      {!isAdmin && user && opts && route !== "cart" && <FloatingCart cart={cart} setCart={setCart} opts={opts} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);