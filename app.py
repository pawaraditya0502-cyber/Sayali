"""
Hrushhi Wellness and Fitness Studio
Pure Python app: Streamlit (UI) + SQLite (storage) + Anthropic SDK (meal photo analysis).

Run:  pip install -r requirements.txt
      streamlit run app.py
"""
import base64
import hashlib
import hmac
import io
import json
import os
import re
import sqlite3
from datetime import datetime, timedelta

import pandas as pd
import streamlit as st
from PIL import Image, ImageOps

BRAND = "Hrushhi Wellness and Fitness Studio"
DB_PATH = os.environ.get("HRUSHHI_DB", "hrushhi.db")
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5-5")
MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack"]
DAY = 86400
NUTRIENTS = ["calories", "protein", "carbs", "fat", "fiber", "sugar", "sodium"]

# --------------------------------------------------------------------------
# Database
# --------------------------------------------------------------------------
SCHEMA = """
CREATE TABLE IF NOT EXISTS users(email TEXT PRIMARY KEY, name TEXT, picture TEXT);
CREATE TABLE IF NOT EXISTS communities(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE COLLATE NOCASE,
  salt BLOB, pw_hash BLOB, owner_name TEXT, created REAL);
CREATE TABLE IF NOT EXISTS members(
  community_id INTEGER, email TEXT, name TEXT, joined REAL, PRIMARY KEY(community_id, email));
CREATE TABLE IF NOT EXISTS meals(
  id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, user_name TEXT, meal_type TEXT, ts REAL,
  image BLOB, dish TEXT, calories REAL, protein REAL, carbs REAL, fat REAL, fiber REAL,
  sugar REAL, sodium REAL, items TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS meal_shares(meal_id INTEGER, community_id INTEGER, PRIMARY KEY(meal_id, community_id));
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT, community_id INTEGER, email TEXT, name TEXT,
  body TEXT, ts REAL, system INTEGER DEFAULT 0);
"""


def conn():
    c = sqlite3.connect(DB_PATH, timeout=15)
    c.row_factory = sqlite3.Row
    return c


def run(sql, args=(), *, one=False, write=False):
    c = conn()
    try:
        cur = c.execute(sql, args)
        if write:
            c.commit()
            return cur.lastrowid
        rows = cur.fetchall()
        if one:
            return rows[0] if rows else None
        return rows
    finally:
        c.close()


def hash_pw(pw: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 150_000)


@st.cache_resource
def init_db():
    c = conn()
    c.executescript(SCHEMA)
    c.commit()
    c.close()
    # Built-in community: name "Aditya", password "Aditya"
    if not run("SELECT id FROM communities WHERE name=?", ("Aditya",), one=True):
        salt = os.urandom(16)
        run("INSERT INTO communities(name, salt, pw_hash, owner_name, created) VALUES(?,?,?,?,?)",
            ("Aditya", salt, hash_pw("Aditya", salt), "Hrushhi Studio", datetime.now().timestamp()), write=True)
    return True


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def now() -> float:
    return datetime.now().timestamp()


def day_of(ts: float):
    return datetime.fromtimestamp(ts).date()


def day_label(d) -> str:
    today = datetime.now().date()
    if d == today:
        return "Today"
    if d == today - timedelta(days=1):
        return "Yesterday"
    return d.strftime("%a, %d %b")


def time_label(ts: float) -> str:
    return datetime.fromtimestamp(ts).strftime("%I:%M %p").lstrip("0")


def num(v) -> float:
    try:
        return max(0.0, float(v))
    except (TypeError, ValueError):
        m = re.search(r"\d+(?:\.\d+)?", str(v))
        return float(m.group()) if m else 0.0


def totals(rows) -> dict:
    return {k: round(sum(num(r[k]) for r in rows)) for k in NUTRIENTS}


def secret(name):
    try:
        return st.secrets.get(name)
    except Exception:
        return None


# --------------------------------------------------------------------------
# Meal photo analysis (Claude)
# --------------------------------------------------------------------------
PROMPT = """You are a nutrition analyst. Look at this meal photo and estimate its nutrition for the portion shown.
Respond ONLY with JSON, no markdown, in exactly this shape:
{"dish":"short name","items":[{"name":"food item","portion":"e.g. 1 cup / 150 g"}],"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0,"sodium_mg":0,"note":"one short sentence of advice or caveat"}
All numeric fields must be numbers. If the image is not food, return {"error":"not food"}."""


class NotFood(Exception):
    pass


def api_key():
    return secret("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")


def prepare_image(raw: bytes, max_side: int = 900) -> bytes:
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    img.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=80)
    return buf.getvalue()


def normalize(d: dict) -> dict:
    def pick(*keys):
        for k in keys:
            if k in d and d[k] not in (None, ""):
                return num(d[k])
        return 0.0

    items = [{"name": str(i.get("name", "")), "portion": str(i.get("portion", ""))}
             for i in (d.get("items") or []) if isinstance(i, dict)]
    return {
        "dish": str(d.get("dish") or "Meal")[:80], "items": items,
        "calories": pick("calories"), "protein": pick("protein", "protein_g"),
        "carbs": pick("carbs", "carbs_g"), "fat": pick("fat", "fat_g"),
        "fiber": pick("fiber", "fiber_g"), "sugar": pick("sugar", "sugar_g"),
        "sodium": pick("sodium", "sodium_mg"), "note": str(d.get("note") or ""),
    }


def analyze_meal(img: bytes) -> dict:
    import anthropic

    client = anthropic.Anthropic(api_key=api_key())
    msg = client.messages.create(
        model=MODEL, max_tokens=1000,
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                         "data": base64.b64encode(img).decode()}},
            {"type": "text", "text": PROMPT}]}],
    )
    text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text").strip()
    text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    data = json.loads(text)
    if data.get("error"):
        raise NotFood("That doesn't look like a meal. Try another photo.")
    return normalize(data)


# --------------------------------------------------------------------------
# Auth (Google via st.login, with a demo fallback)
# --------------------------------------------------------------------------
def google_configured() -> bool:
    try:
        return "auth" in st.secrets
    except Exception:
        return False


def current_user():
    if google_configured():
        u = st.user
        if getattr(u, "is_logged_in", False):
            email = getattr(u, "email", None) or ""
            return {"email": email, "name": getattr(u, "name", None) or email.split("@")[0],
                    "picture": getattr(u, "picture", None)}
        return None
    return st.session_state.get("demo_user")


RING = """<svg width="150" height="150" viewBox="0 0 42 42" role="img" aria-label="Protein, carbs and fat ring">
<g fill="none" stroke-width="5.5" stroke-linecap="round" transform="rotate(-90 21 21)">
<circle cx="21" cy="21" r="15.915" stroke="#fff"/>
<circle cx="21" cy="21" r="15.915" stroke="#B83A5B" pathLength="100" stroke-dasharray="34 66"/>
<circle cx="21" cy="21" r="15.915" stroke="#E49B13" pathLength="100" stroke-dasharray="44 56" stroke-dashoffset="-37"/>
<circle cx="21" cy="21" r="15.915" stroke="#2B7A78" pathLength="100" stroke-dasharray="17 83" stroke-dashoffset="-84"/>
</g></svg>"""


def sign_in_page():
    st.markdown(f"<div style='text-align:center;margin-top:1.5rem'>{RING}</div>", unsafe_allow_html=True)
    st.markdown(f"<h1 style='text-align:center;line-height:1.1'>{BRAND}</h1>", unsafe_allow_html=True)
    st.markdown("<p style='text-align:center;color:#5B7570'>Snap your meal. See the protein, carbs and fat. "
                "Cheer on your community.</p>", unsafe_allow_html=True)
    _, mid, _ = st.columns([1, 2, 1])
    with mid:
        if google_configured():
            st.button("Continue with Google", type="primary", on_click=st.login)
        else:
            st.info("Google sign-in isn't configured yet, so this is demo sign-in. "
                    "See the setup steps to switch on real Google login.")
            with st.form("demo_login"):
                name = st.text_input("Name")
                email = st.text_input("Google email")
                if st.form_submit_button("Sign in", type="primary"):
                    if name.strip() and "@" in email and "." in email:
                        st.session_state.demo_user = {"email": email.strip().lower(), "name": name.strip(), "picture": None}
                        st.rerun()
                    else:
                        st.error("Enter your name and a valid email address.")


def sign_out():
    if google_configured():
        st.logout()
    else:
        st.session_state.pop("demo_user", None)
        st.rerun()


# --------------------------------------------------------------------------
# UI building blocks
# --------------------------------------------------------------------------
def show_nutrition(n):
    a = st.columns(4)
    a[0].metric("Calories", f"{num(n['calories']):.0f}")
    a[1].metric("Protein", f"{num(n['protein']):.0f} g")
    a[2].metric("Carbs", f"{num(n['carbs']):.0f} g")
    a[3].metric("Fat", f"{num(n['fat']):.0f} g")
    b = st.columns(3)
    b[0].metric("Fibre", f"{num(n['fiber']):.0f} g")
    b[1].metric("Sugar", f"{num(n['sugar']):.0f} g")
    b[2].metric("Sodium", f"{num(n['sodium']):.0f} mg")


def show_items(n):
    items = n.get("items")
    if isinstance(items, str):
        items = json.loads(items or "[]")
    if items:
        st.markdown("\n".join(f"- {i['name']} ({i['portion']})" for i in items))
    if n.get("note"):
        st.caption(n["note"])


def meal_card(m, *, show_owner=False, user_email=None):
    with st.container(border=True):
        when = f"{m['meal_type']} · {day_label(day_of(m['ts']))}, {time_label(m['ts'])}"
        if show_owner:
            st.markdown(f"**{m['user_name']}**  \n<span style='color:#5B7570'>{when}</span>", unsafe_allow_html=True)
        else:
            st.caption(when)
        if m["image"]:
            st.image(m["image"])
        st.markdown(f"**{m['dish']}**")
        show_nutrition(m)
        if m["items"] or m["note"]:
            with st.expander("Ingredients and notes"):
                show_items(dict(m))
        if user_email and m["email"] == user_email:
            if st.button("Delete meal", key=f"del{m['id']}"):
                run("DELETE FROM meal_shares WHERE meal_id=?", (m["id"],), write=True)
                run("DELETE FROM meals WHERE id=? AND email=?", (m["id"], user_email), write=True)
                st.rerun()


def my_communities(email):
    return run("""SELECT c.* FROM communities c JOIN members m ON m.community_id=c.id
                  WHERE m.email=? ORDER BY c.name""", (email,))


# --------------------------------------------------------------------------
# Today tab
# --------------------------------------------------------------------------
def today_tab(user):
    ss = st.session_state
    ss.setdefault("up_n", 0)
    ss.setdefault("pending", None)
    if ss.pop("reset_log", False):
        ss.manual_mode = False
        ss.pending = None
        ss.up_n += 1

    st.subheader("Log a meal")
    default_type = 0 if datetime.now().hour < 11 else 1 if datetime.now().hour < 16 else 2 if datetime.now().hour < 21 else 3
    mtype = st.radio("Meal", MEAL_TYPES, index=default_type, horizontal=True, key="mtype")
    source = st.radio("Photo", ["Upload photo", "Take photo"], horizontal=True, key="source")
    if source == "Upload photo":
        f = st.file_uploader("Choose a meal photo", type=["jpg", "jpeg", "png", "webp"], key=f"up{ss.up_n}")
    else:
        f = st.camera_input("Take a photo of your meal", key=f"cam{ss.up_n}")
    manual_mode = st.checkbox("Enter nutrition manually (no photo needed)", key="manual_mode")

    p = ss.pending
    if f is None and not manual_mode:
        ss.pending = p = None
    if f is not None:
        raw = f.getvalue()
        h = hashlib.md5(raw).hexdigest()
        if not p or p["hash"] != h:
            try:
                img = prepare_image(raw)
            except Exception:
                img = None
                st.error("That file couldn't be opened as a photo. Try a JPG or PNG.")
            if img:
                p = {"hash": h, "img": img, "nutrition": None, "error": None}
                if api_key():
                    with st.spinner("Reading your meal…"):
                        try:
                            p["nutrition"] = analyze_meal(img)
                        except NotFood as e:
                            p["error"] = str(e)
                        except Exception as e:  # noqa: BLE001
                            p["error"] = f"Automatic analysis failed ({type(e).__name__}). Retry or enter the numbers yourself."
                else:
                    p["error"] = "Automatic analysis needs an Anthropic API key (see setup). Enter the numbers yourself for now."
                ss.pending = p
    elif manual_mode and not p:
        ss.pending = p = {"hash": "manual", "img": None, "nutrition": None, "error": None}

    if p:
        if p["img"]:
            st.image(p["img"])
        if p.get("error"):
            st.warning(p["error"])
            if p["img"] and api_key() and st.button("Retry analysis"):
                try:
                    with st.spinner("Reading your meal…"):
                        p["nutrition"] = analyze_meal(p["img"])
                    p["error"] = None
                    st.rerun()
                except Exception as e:  # noqa: BLE001
                    st.error(f"Still couldn't analyse it ({type(e).__name__}).")
        n = p["nutrition"]
        if n is None:
            with st.form("manual_form"):
                dish = st.text_input("Dish name")
                c1, c2 = st.columns(2)
                vals = {
                    "calories": c1.number_input("Calories (kcal)", 0.0, step=10.0),
                    "protein": c2.number_input("Protein (g)", 0.0, step=1.0),
                    "carbs": c1.number_input("Carbs (g)", 0.0, step=1.0),
                    "fat": c2.number_input("Fat (g)", 0.0, step=1.0),
                    "fiber": c1.number_input("Fibre (g)", 0.0, step=1.0),
                    "sugar": c2.number_input("Sugar (g)", 0.0, step=1.0),
                    "sodium": c1.number_input("Sodium (mg)", 0.0, step=10.0),
                }
                if st.form_submit_button("Use these values", type="primary"):
                    p["nutrition"] = {"dish": dish.strip() or "Meal", "items": [], "note": "Entered manually.", **vals}
                    p["error"] = None
                    st.rerun()
        else:
            st.markdown(f"### {n['dish']}")
            show_nutrition(n)
            show_items(n)
            groups = my_communities(user["email"])
            share = []
            if groups:
                share = st.multiselect("Share with", [g["id"] for g in groups],
                                       default=[g["id"] for g in groups],
                                       format_func=lambda i: next(g["name"] for g in groups if g["id"] == i))
            if st.button(f"Save {mtype.lower()}", type="primary"):
                mid = run("""INSERT INTO meals(email,user_name,meal_type,ts,image,dish,calories,protein,carbs,fat,
                             fiber,sugar,sodium,items,note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                          (user["email"], user["name"], mtype, now(), p["img"], n["dish"], n["calories"], n["protein"],
                           n["carbs"], n["fat"], n["fiber"], n["sugar"], n["sodium"], json.dumps(n.get("items", [])),
                           n.get("note", "")), write=True)
                for cid in share:
                    run("INSERT OR IGNORE INTO meal_shares VALUES(?,?)", (mid, cid), write=True)
                ss.reset_log = True
                st.rerun()
            if st.button("Discard"):
                ss.reset_log = True
                st.rerun()

    st.divider()
    start = datetime.combine(datetime.now().date(), datetime.min.time()).timestamp()
    meals = run("SELECT * FROM meals WHERE email=? AND ts>=? ORDER BY ts DESC", (user["email"], start))
    t = totals(meals)
    st.subheader("Today's total")
    show_nutrition(t)
    st.caption(f"{len(meals)} meal{'s' if len(meals) != 1 else ''} logged. The last number of the day is your final count.")
    if not meals:
        st.info("No meals yet today. Upload your first photo above.")
    for m in meals:
        meal_card(m, user_email=user["email"])


# --------------------------------------------------------------------------
# History tab
# --------------------------------------------------------------------------
def history_tab(user):
    st.subheader("Last 7 days")
    today = datetime.now().date()
    days = [today - timedelta(days=i) for i in range(7)]
    start = datetime.combine(days[-1], datetime.min.time()).timestamp()
    rows = run("SELECT * FROM meals WHERE email=? AND ts>=? ORDER BY ts", (user["email"], start))
    by_day = {d: [r for r in rows if day_of(r["ts"]) == d] for d in days}

    chart = pd.DataFrame(
        {"Protein (g)": [totals(by_day[d])["protein"] for d in reversed(days)],
         "Carbs (g)": [totals(by_day[d])["carbs"] for d in reversed(days)],
         "Fat (g)": [totals(by_day[d])["fat"] for d in reversed(days)]},
        index=[d.strftime("%a %d") for d in reversed(days)])
    st.bar_chart(chart, color=["#B83A5B", "#E49B13", "#2B7A78"])

    for d in days:
        t = totals(by_day[d])
        label = f"{day_label(d)} · {t['calories']} kcal · P {t['protein']}g · C {t['carbs']}g · F {t['fat']}g"
        with st.expander(label):
            if not by_day[d]:
                st.write("Nothing logged this day.")
                continue
            show_nutrition(t)
            for m in by_day[d]:
                meal_card(m)


# --------------------------------------------------------------------------
# Community tab
# --------------------------------------------------------------------------
def add_message(cid, user, body, system=False):
    run("INSERT INTO messages(community_id,email,name,body,ts,system) VALUES(?,?,?,?,?,?)",
        (cid, "system" if system else user["email"], "System" if system else user["name"], body, now(), int(system)),
        write=True)


def create_community(user, name, pw):
    name = name.strip()
    if len(name) < 3:
        return "Community name needs at least 3 characters."
    if len(pw) < 4:
        return "Password needs at least 4 characters."
    if run("SELECT 1 FROM communities WHERE name=?", (name,), one=True):
        return "A community with that name already exists."
    salt = os.urandom(16)
    cid = run("INSERT INTO communities(name,salt,pw_hash,owner_name,created) VALUES(?,?,?,?,?)",
              (name, salt, hash_pw(pw, salt), user["name"], now()), write=True)
    run("INSERT INTO members VALUES(?,?,?,?)", (cid, user["email"], user["name"], now()), write=True)
    add_message(cid, user, f'{user["name"]} created the community "{name}"', system=True)
    st.session_state.group = cid
    return None


def join_community(user, cid, pw):
    c = run("SELECT * FROM communities WHERE id=?", (cid,), one=True)
    if not c or not hmac.compare_digest(hash_pw(pw, c["salt"]), c["pw_hash"]):
        return "Wrong community password."
    if not run("SELECT 1 FROM members WHERE community_id=? AND email=?", (cid, user["email"]), one=True):
        run("INSERT INTO members VALUES(?,?,?,?)", (cid, user["email"], user["name"], now()), write=True)
        add_message(cid, user, f'{user["name"]} joined', system=True)
    st.session_state.group = cid
    return None


@st.fragment(run_every=4)
def chat_log(cid, email):
    rows = list(reversed(run("SELECT * FROM messages WHERE community_id=? ORDER BY id DESC LIMIT 40", (cid,))))
    if not rows:
        st.caption("No messages yet. Say hello to the group.")
    last_day = None
    for m in rows:
        d = day_of(m["ts"])
        if d != last_day:
            st.markdown(f"<div style='text-align:center;color:#5B7570;font-size:.8rem'>{day_label(d)}</div>", unsafe_allow_html=True)
            last_day = d
        if m["system"]:
            st.markdown(f"<div style='text-align:center;color:#5B7570;font-size:.85rem'>{m['body']}</div>", unsafe_allow_html=True)
            continue
        mine = m["email"] == email
        with st.chat_message("user" if mine else "assistant", avatar=None if mine else (m["name"][:1].upper() or "?")):
            if not mine:
                st.markdown(f"**{m['name']}**")
            st.write(m["body"])
            st.caption(time_label(m["ts"]))


def group_view(user, cid):
    c = run("SELECT * FROM communities WHERE id=?", (cid,), one=True)
    is_member = run("SELECT 1 FROM members WHERE community_id=? AND email=?", (cid, user["email"]), one=True)
    if not c or not is_member:
        st.session_state.group = None
        st.rerun()
    members = run("SELECT name FROM members WHERE community_id=? ORDER BY joined", (cid,))
    if st.button("← All groups"):
        st.session_state.group = None
        st.rerun()
    st.markdown(f"## {c['name']}")
    with st.expander(f"{len(members)} member{'s' if len(members) != 1 else ''}"):
        st.write(", ".join(m["name"] for m in members))

    chat_tab, meals_tab = st.tabs(["💬 Chat", "🍽️ Meals"])
    with chat_tab:
        chat_log(cid, user["email"])
        text = st.chat_input("Type a message", key=f"chat{cid}")
        if text and text.strip():
            add_message(cid, user, text.strip())
            st.rerun()
    with meals_tab:
        st.caption("Meals from the last 7 days, visible to every member")
        feed = run("""SELECT m.* FROM meals m JOIN meal_shares s ON s.meal_id=m.id
                      WHERE s.community_id=? AND m.ts>=? ORDER BY m.ts DESC LIMIT 30""",
                   (cid, now() - 7 * DAY))
        if not feed:
            st.info("No meals shared yet. Log a meal on the Today tab and share it with this group.")
        for m in feed:
            meal_card(m, show_owner=True, user_email=None)


def community_tab(user):
    ss = st.session_state
    ss.setdefault("group", None)
    if ss.group:
        group_view(user, ss.group)
        return

    st.subheader("Your groups")
    mine = my_communities(user["email"])
    if not mine:
        st.info("You're not in any community yet. Create one or join one below.")
    for g in mine:
        last = run("SELECT * FROM messages WHERE community_id=? ORDER BY id DESC LIMIT 1", (g["id"],), one=True)
        count = run("SELECT COUNT(*) n FROM members WHERE community_id=?", (g["id"],), one=True)["n"]
        with st.container(border=True):
            if st.button(f"💬  {g['name']}", key=f"open{g['id']}"):
                ss.group = g["id"]
                st.rerun()
            preview = "No messages yet"
            if last:
                preview = last["body"] if last["system"] else f"{'You' if last['email'] == user['email'] else last['name']}: {last['body']}"
            st.caption(f"{preview[:80]} · {count} member{'s' if count != 1 else ''}")

    with st.expander("➕ Create a community"):
        with st.form("create_comm", clear_on_submit=True):
            name = st.text_input("Community name")
            pw = st.text_input("Community password (members enter it the first time they join)", type="password")
            if st.form_submit_button("Create community", type="primary"):
                err = create_community(user, name, pw)
                if err:
                    st.error(err)
                else:
                    st.rerun()

    joinable = run("""SELECT * FROM communities WHERE id NOT IN
                      (SELECT community_id FROM members WHERE email=?) ORDER BY name""", (user["email"],))
    if joinable:
        with st.expander("🔒 Join a community", expanded=not mine):
            with st.form("join_comm", clear_on_submit=True):
                cid = st.selectbox("Community", [g["id"] for g in joinable],
                                   format_func=lambda i: next(f"{g['name']} (by {g['owner_name']})" for g in joinable if g["id"] == i))
                pw = st.text_input("Community password", type="password")
                if st.form_submit_button("Join community", type="primary"):
                    err = join_community(user, cid, pw)
                    if err:
                        st.error(err)
                    else:
                        st.rerun()


# --------------------------------------------------------------------------
# App
# --------------------------------------------------------------------------
STYLE = """<style>
.stButton > button[kind="primary"], .stFormSubmitButton > button[kind="primary"]
 { background:#F0A41B; color:#0E2B27; border:0; font-weight:800; }
h1, h2, h3 { letter-spacing:-0.01em; color:#0E2B27; }
</style>"""


def main():
    st.set_page_config(page_title=BRAND, page_icon="🥗", layout="centered")
    st.markdown(STYLE, unsafe_allow_html=True)
    init_db()

    user = current_user()
    if not user:
        sign_in_page()
        return
    run("INSERT OR REPLACE INTO users VALUES(?,?,?)", (user["email"], user["name"], user.get("picture")), write=True)

    top = st.columns([5, 1])
    top[0].markdown(f"### {BRAND}")
    top[1].button("Sign out", on_click=sign_out)
    st.caption(f"Hi {user['name'].split()[0]}, here's your day.")

    t1, t2, t3 = st.tabs(["🍽️ Today", "📅 History", "👥 Community"])
    with t1:
        today_tab(user)
    with t2:
        history_tab(user)
    with t3:
        community_tab(user)


main()
