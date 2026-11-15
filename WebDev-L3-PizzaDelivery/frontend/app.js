const { useState, useEffect } = React;
const API = window.API_URL.replace(/\/$/, "");
const $ = (n) => "$" + Number(n).toFixed(2);
const STATUSES = ["Order Received", "In Kitchen", "Sent to Delivery"];
const go = (h) => { location.hash = h; };

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
        setMsg({ ok: true, text: d.message });
      }
    });
  };
  return (
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
      <div className="links"><a href="#admin">Admin login</a></div>
    </div>
  );
}

function Verify({ token }) {
  const [m, setM] = useState({ ok: true, text: "Verifying..." });
  useEffect(() => {
    call("/api/auth/verify/" + token).then((d) => setM({ ok: true, text: d.message })).catch((e) => setM({ ok: false, text: e.message }));
  }, [token]);
  return <div className="auth"><h1>Email verification</h1><Msg m={m} /><div className="links"><a href="#login">Go to login</a></div></div>;
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
    <div className="auth">
      <h1>New password</h1>
      <form onSubmit={submit}>
        <input type="password" placeholder="New password (8+ chars, 1 number)" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn full" disabled={busy}>{busy ? "Please wait..." : "Change password"}</button>
      </form>
      <Msg m={msg} />
      <div className="links"><a href="#login">Go to login</a></div>
    </div>
  );
}

/* ---------- Menu (pizza varieties) ---------- */
function Menu({ opts, addToCart }) {
  return (
    <div className="wrap">
      <h2>Our pizzas</h2>
      {opts.varieties.map((v) => (
        <div className="card" key={v.name}>
          <div className="row"><b>{v.name}</b><span className="price">{$(v.price)}</span></div>
          <p className="muted">{v.desc}</p>
          <p className="muted">{v.labels}</p>
          <button className="btn full" style={{ marginTop: 10 }} onClick={() => addToCart(v)}>Add to cart</button>
        </div>
      ))}
      <button className="btn alt full" onClick={() => go("build")}>🍕 Build your own pizza</button>
    </div>
  );
}

/* ---------- Custom pizza builder ---------- */
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
          <span>{i.name}{i.stock <= 0 ? " (sold out)" : ""}</span><span className="price">{$(i.price)}</span>
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

/* ---------- Order summary + payment ---------- */
function Cart({ cart, setCart }) {
  const { busy, msg, run } = useAsync();
  const total = cart.reduce((a, p) => a + p.price, 0);
  const pay = () => run(async () => {
    const pizzas = cart.map(({ name, base, sauce, cheese, veggies }) => ({ name, base, sauce, cheese, veggies }));
    const d = await call("/api/orders", "POST", { pizzas });
    window.location.href = d.url;
  });
  if (!cart.length) return <div className="wrap"><p className="empty">Your cart is empty.</p><button className="btn full" onClick={() => go("dashboard")}>Browse pizzas</button></div>;
  return (
    <div className="wrap">
      <h2>Order summary</h2>
      {cart.map((p, i) => (
        <div className="card" key={i}>
          <div className="row"><b>{p.name}</b><span className="price">{$(p.price)}</span></div>
          <p className="muted">{p.labels}</p>
          <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setCart(cart.filter((_, x) => x !== i))}>Remove</button>
        </div>
      ))}
      <div className="card row"><b>Total</b><span className="price">{$(total)}</span></div>
      <button className="btn full" disabled={busy} onClick={pay}>{busy ? "Opening payment..." : "Pay with Stripe (test mode)"}</button>
      <p className="muted" style={{ marginTop: 10 }}>Test card: 4242 4242 4242 4242, any future date, any 3 digits. No real money is charged.</p>
      <Msg m={msg} />
    </div>
  );
}

/* ---------- My orders with live status ---------- */
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
            <div className="track">{STATUSES.map((s, i) => <span key={s} className={i <= idx ? "on" : ""}>{s}</span>)}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Admin ---------- */
function StockRow({ item }) {
  const [v, setV] = useState(item.stock);
  const [m, setM] = useState("");
  const save = () => A("/api/admin/inventory/" + item._id, "PUT", { stock: v }).then(() => setM("Saved ✓")).catch((e) => setM(e.message));
  return (
    <div className="card">
      <div className="row">
        <div><b>{item.name}</b><div className="muted">{item.type}</div></div>
        <div style={{ width: 110 }}><input type="number" min="0" value={v} onChange={(e) => setV(e.target.value)} style={{ marginBottom: 0 }} /></div>
      </div>
      <div className="row" style={{ marginTop: 8 }}><span className="muted">{m}</span><button className="btn" onClick={save}>Save</button></div>
    </div>
  );
}

function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [err, setErr] = useState(null);
  const load = () => A("/api/admin/orders").then((o) => { setOrders(o); setErr(null); }).catch((e) => setErr({ ok: false, text: e.message }));
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  const setStatus = (id, status) => A("/api/admin/orders/" + id, "PUT", { status }).then(load).catch((e) => setErr({ ok: false, text: e.message }));
  return (
    <div>
      <Msg m={err} />
      {orders.length === 0 && <p className="empty">No paid orders yet.</p>}
      {orders.map((o) => (
        <div className="card" key={o._id}>
          <div className="row"><b>{o.user ? o.user.name : "Customer"}</b><span className="price">{$(o.total)}</span></div>
          <p className="muted">{o.user && o.user.email} · {new Date(o.createdAt).toLocaleString()}</p>
          {o.pizzas.map((p, i) => <p className="muted" key={i}>🍕 {p.name}: {p.base}, {p.sauce}, {p.cheese}{p.veggies.length ? ", " + p.veggies.join(", ") : ""}</p>)}
          <div className="statusbtns">{STATUSES.map((s) => <button key={s} className={o.status === s ? "on" : ""} onClick={() => setStatus(o._id, s)}>{s}</button>)}</div>
        </div>
      ))}
    </div>
  );
}

function AdminStock() {
  const [inv, setInv] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { A("/api/admin/inventory").then(setInv).catch((e) => setErr({ ok: false, text: e.message })); }, []);
  return <div><Msg m={err} />{inv && inv.map((i) => <StockRow key={i._id} item={i} />)}</div>;
}

function Admin() {
  const [authed, setAuthed] = useState(!!localStorage.getItem("pizza_admin_token"));
  const [tab, setTab] = useState("orders");
  const [f, setF] = useState({ email: "", password: "" });
  const { busy, msg, run } = useAsync();
  const login = (e) => {
    e.preventDefault();
    run(async () => {
      const d = await call("/api/admin/login", "POST", f);
      localStorage.setItem("pizza_admin_token", d.token);
      setAuthed(true);
    });
  };
  const out = () => { localStorage.removeItem("pizza_admin_token"); setAuthed(false); };
  if (!authed)
    return (
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
    );
  return (
    <div>
      <div className="top"><b>🍕 Admin panel</b><nav><button onClick={out}>Log out</button></nav></div>
      <div className="wrap">
        <div className="tabs">
          <button className={"btn" + (tab === "orders" ? "" : " ghost")} onClick={() => setTab("orders")}>Orders</button>
          <button className={"btn" + (tab === "stock" ? "" : " ghost")} onClick={() => setTab("stock")}>Inventory</button>
        </div>
        {tab === "orders" ? <AdminOrders /> : <AdminStock />}
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
  else if (!user) {
    const mode = route === "register" || route === "forgot" ? route : "login";
    page = <AuthPage key={mode} mode={mode} onLogin={setUser} />;
  } else if (!opts) page = <p className="empty">Loading menu (the server may be waking up)...</p>;
  else if (route === "build") page = <Builder opts={opts} addToCart={addToCart} />;
  else if (route === "cart") page = <Cart cart={cart} setCart={setCart} />;
  else if (route === "orders") page = <Orders />;
  else page = <Menu opts={opts} addToCart={addToCart} />;

  const showNav = user && !["admin", "verify", "reset"].includes(route);
  return (
    <div>
      {showNav && (
        <div className="top">
          <b>🍕 Pizza Delivery</b>
          <nav>
            <a href="#dashboard">Menu</a>
            <a href="#build">Build</a>
            <a href="#cart">Cart ({cart.length})</a>
            <a href="#orders">Orders</a>
            <button onClick={logout}>Log out</button>
          </nav>
        </div>
      )}
      {banner && <div className="toast"><Msg m={banner} /></div>}
      {page}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);