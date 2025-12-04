from flask import Flask, request, render_template, redirect, url_for, session, flash, jsonify
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
import datetime
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(
    __name__,
    static_folder=os.path.join(BASE_DIR, "static"),
    template_folder=os.path.join(BASE_DIR, "templates"),
)
CORS(app)
app.secret_key = "hell_yeah"
app.permanent_session_lifetime = datetime.timedelta(days=14)

# create two seperate databases for tasks and accts
TASK_DB = os.path.join(BASE_DIR, "tasks.db")
ACCOUNTS_DB = os.path.join(BASE_DIR, "accounts.db")

# --- Helpers ---
def query_db(db_file, query, args=(), one=False):
    with sqlite3.connect(db_file) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.execute(query, args)
        rows = cur.fetchall()
        conn.commit()
    return (rows[0] if rows else None) if one else rows

def init_task_db():
    with sqlite3.connect(TASK_DB) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                list_id INTEGER,
                title TEXT NOT NULL,
                description TEXT,
                dueDate TEXT,
                dueTime TEXT,
                priority TEXT,
                done INTEGER DEFAULT 0,
                createdAt TEXT
            )
        """)
        # Lightweight migration: add user_id if missing
        cur = conn.execute("PRAGMA table_info(tasks)")
        cols = {row[1] for row in cur.fetchall()}
        if 'user_id' not in cols:
            conn.execute("ALTER TABLE tasks ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1")
        if 'list_id' not in cols:
            conn.execute("ALTER TABLE tasks ADD COLUMN list_id INTEGER")

        # make the collab lists
        conn.execute("""
            CREATE TABLE IF NOT EXISTS lists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                owner_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                is_collab INTEGER DEFAULT 1
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS list_members (
                list_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                UNIQUE(list_id, user_id)
            )
        """)

def init_accounts_db():
    with sqlite3.connect(ACCOUNTS_DB) as conn:
        # Create table if not exists (latest schema)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                name TEXT  NOT NULL,
                security TEXT NOT NULL,
                password_hash TEXT NOT NULL
            )
        """)
        # Lightweight migration: ensure 'name' and 'security' columns exist for older DBs
        cur = conn.execute("PRAGMA table_info(users)")
        cols = {row[1] for row in cur.fetchall()}
        if 'name' not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN name TEXT")
        if 'security' not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN security TEXT")
    print("✅ users table ready")

def get_user_by_username(username):
    rows = query_db(ACCOUNTS_DB, "SELECT * FROM users WHERE username=?", (username,))
    return rows[0] if rows else None

def is_member(user_id, list_id):
    if list_id is None:
        return True
    rows = query_db(TASK_DB, "SELECT 1 FROM list_members WHERE list_id=? AND user_id=?", (list_id, user_id))
    return bool(rows)


# --- Routes ---
#returns if not at logged in
@app.route("/")
def home():
    if "user_id" not in session:
        return redirect(url_for("auth"))
    return render_template("index.html", username=session["username"])

@app.route("/auth", methods=["GET", "POST"])
def auth():
    logged_in = "user_id" in session
    if request.method == "GET":
        if logged_in:
            return redirect(url_for("home"))
        return render_template("auth.html")

    # If this is an AJAX request asking for JSON, we'll return JSON instead of flashing + redirecting
    wants_json = "application/json" in (request.headers.get("Accept") or "")

    action = request.form.get("action")
    username = request.form.get("username")
    password = request.form.get("password")
    name = request.form.get("name")
    security = request.form.get("security")

    # === SIGNUP ===
    if action == "signup":
        # Require username, password, name, and security answer
        if not username or not password or not name or not security:
            if wants_json:
                return jsonify({"ok": False, "error": "Please fill all fields (username, name, security, password)."}), 400
            flash("Please fill all fields (username, name, security, password).")
            return redirect(url_for("auth"))

        if get_user_by_username(username):
            if wants_json:
                return jsonify({"ok": False, "error": "Username already exists."}), 409
            flash("Username already exists.")
            return redirect(url_for("auth"))

        hashed_pw = generate_password_hash(password)
        hashed_sec = generate_password_hash(security)
        query_db(
            ACCOUNTS_DB,
            "INSERT INTO users (username, name, security, password_hash) VALUES (?, ?, ?, ?)",
            (username, name, hashed_sec, hashed_pw)
        )
        if wants_json:
            return jsonify({"ok": True, "message": "Account created! You can now log in."}), 201
        flash("Account created! You can now log in.")
        return redirect(url_for("auth"))

    # === LOGIN ===
    elif action == "login":
        if logged_in:
            if wants_json:
                return jsonify({"ok": False, "error": "Already logged in."}), 400
            flash("Already logged in.")
            return redirect(url_for("home"))
        user = get_user_by_username(username)
        if not user or not check_password_hash(user["password_hash"], password):
            if wants_json:
                return jsonify({"ok": False, "error": "Invalid username or password."}), 401
            flash("Invalid username or password.")
            return redirect(url_for("auth"))

#permanent
        session.permanent = True
        session["user_id"] = user["id"]
        session["username"] = user["username"]
        if wants_json:
            return jsonify({"ok": True, "redirect": url_for("home")}), 200
        flash("Logged in successfully!")
        return redirect(url_for("home"))

    return redirect(url_for("auth"))

#clear when refreshin
@app.route("/logout")
def logout():
    session.clear()
    flash("Logged out.")
    return redirect(url_for("auth"))


# === Profile ===
@app.route("/profile", methods=["GET", "POST"])
def profile():
    if "user_id" not in session:
        return redirect(url_for("auth"))

    user_id = session["user_id"]
    user = query_db(ACCOUNTS_DB, "SELECT * FROM users WHERE id=?", (user_id,), one=True)

    if request.method == "GET":
        return render_template("profile.html", user=user)

    name = request.form.get("name")
    username = request.form.get("username")
    old_pw = request.form.get("old_password")
    new_pw = request.form.get("new_password")

    if new_pw:
        if not check_password_hash(user["password_hash"], old_pw):
            flash("Old password incorrect.")
            return redirect(url_for("profile"))
        new_hash = generate_password_hash(new_pw)
    else:
        new_hash = user["password_hash"]

    query_db(ACCOUNTS_DB, "UPDATE users SET name=?, username=?, password_hash=? WHERE id=?",
             (name, username, new_hash, user_id))
    session["username"] = username
    flash("Profile updated successfully.")
    return redirect(url_for("profile"))


# === Forgot Password ===
@app.route("/forgot", methods=["POST"])
def forgot_password():
    # Detect JSON expectation
    wants_json = "application/json" in (request.headers.get("Accept") or "")
    username = request.form.get("username")
    security_answer = request.form.get("security")
    new_password = request.form.get("new_password")

    # Basic validation
    if not username or not security_answer or not new_password:
        if wants_json:
            return jsonify({"ok": False, "error": "Please fill all fields (username, security, new password)."}), 400
        flash("Please fill all fields (username, security, new password).")
        return redirect(url_for("auth"))

    user = get_user_by_username(username)
    if not user:
        if wants_json:
            return jsonify({"ok": False, "error": "User not found."}), 404
        flash("User not found.")
        return redirect(url_for("auth"))

    # Verify security answer against stored hash
    if not check_password_hash(user["security"], security_answer):
        if wants_json:
            return jsonify({"ok": False, "error": "Incorrect security answer."}), 403
        flash("Incorrect security answer.")
        return redirect(url_for("auth"))

    # Update password
    new_hash = generate_password_hash(new_password)
    query_db(ACCOUNTS_DB, "UPDATE users SET password_hash=? WHERE id=?", (new_hash, user["id"]))

    if wants_json:
        return jsonify({"ok": True, "message": "Password has been reset. You can now log in."}), 200
    flash("Password has been reset. You can now log in.")
    return redirect(url_for("auth"))


# --- To-Do routes (unchanged) ---
@app.route("/tasks", methods=["GET"])
def get_tasks():
    if "user_id" not in session:
        return jsonify([])
    user_id = session["user_id"]
    list_id = request.args.get("list_id")
    #gets list and ensures that they are a member of an owner
    if list_id:
        # Ensure user is a member of the collab list
        try:
            lid = int(list_id)
        except ValueError:
            return jsonify({"ok": False, "error": "Invalid list_id"}), 400
        if not is_member(user_id, lid):
            return ("Forbidden", 403)
        rows = query_db(TASK_DB, "SELECT * FROM tasks WHERE list_id=?", (lid,))
    else:
        # GET fetches tasks owned by current user only:
        rows = query_db(TASK_DB, "SELECT * FROM tasks WHERE user_id=? AND (list_id IS NULL OR list_id='')", (user_id,))
    return jsonify([dict(r) for r in rows])

@app.route("/tasks", methods=["POST"])
def add_task():
    if "user_id" not in session:
        return ("Unauthorized", 401)
    data = request.json
    user_id = session["user_id"]
    list_id = data.get("list_id")
    lid = None
    if list_id is not None:
        try:
            lid = int(list_id)
        except (ValueError, TypeError):
            return jsonify({"ok": False, "error": "Invalid list_id"}), 400
        if not is_member(user_id, lid):
            return ("Forbidden", 403)
    query_db(
        TASK_DB,
        "INSERT INTO tasks (user_id, list_id, title, description, dueDate, dueTime, priority, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            user_id,
            lid,
            data["title"],
            data.get("description", ""),
            data.get("dueDate"),
            data.get("dueTime"),
            data.get("priority", "Low"),
            datetime.datetime.now().isoformat()
        )
    )
    return jsonify({"message": "Task added"}), 201

@app.route("/tasks/<int:task_id>", methods=["PATCH", "PUT"])
def update_task(task_id):
    #when it loads tsks checks first if user is in session
    if "user_id" not in session:
        return ("Unauthorized", 401)
    user_id = session["user_id"]
    data = request.json or {}
    # Fetch task to check permissions
    row = query_db(TASK_DB, "SELECT * FROM tasks WHERE id=?", (task_id,), one=True)
    if not row:
        return ("Not found", 404)
    owner_id = row["user_id"]
    list_id = row["list_id"]
    if list_id:
        if not is_member(user_id, list_id):
            return ("Forbidden", 403)
    else:
        if owner_id != user_id:
            return ("Forbidden", 403)
    fields = []
    args = []
    for key in ["title", "description", "dueDate", "dueTime", "priority", "done"]:
        if key in data:
            fields.append(f"{key}=?")
            args.append(data[key])
    if not fields:
        return jsonify({"ok": False, "error": "No fields to update"}), 400
    args.append(task_id)
    query_db(TASK_DB, f"UPDATE tasks SET {', '.join(fields)} WHERE id=?", tuple(args))
    return jsonify({"message": "Task updated"}), 200

@app.route("/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    if "user_id" not in session:
        return ("Unauthorized", 401)
    user_id = session["user_id"]
    row = query_db(TASK_DB, "SELECT * FROM tasks WHERE id=?", (task_id,), one=True)
    if not row:
        return ("Not found", 404)
    owner_id = row["user_id"]
    list_id = row["list_id"]
    if list_id:
        if not is_member(user_id, list_id):
            return ("Forbidden", 403)
    else:
        if owner_id != user_id:
            return ("Forbidden", 403)
    query_db(TASK_DB, "DELETE FROM tasks WHERE id=?", (task_id,))
    return jsonify({"message": "Task deleted"}), 200

# === Collaborative Lists ===
@app.route("/lists", methods=["GET"])
#shows all  lists current user has
def list_lists():
    if "user_id" not in session:
        return ("Unauthorized", 401)
    user_id = session["user_id"]
    rows = query_db(
        TASK_DB,
        """
        SELECT l.id, l.name, l.owner_id, l.is_collab,
               CASE WHEN l.owner_id=? THEN 1 ELSE 0 END AS is_owner
        FROM lists l
        JOIN list_members m ON m.list_id = l.id
        WHERE m.user_id = ?
        ORDER BY l.name
        """,
        (user_id, user_id),
    )
    return jsonify([dict(r) for r in rows])

@app.route("/lists", methods=["POST"])
def create_list():
    if "user_id" not in session:
        return ("Unauthorized", 401)
    user_id = session["user_id"]
    data = request.json or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"ok": False, "error": "List name required"}), 400
    # Create collab list
    query_db(TASK_DB, "INSERT INTO lists (owner_id, name, is_collab) VALUES (?, ?, 1)", (user_id, name))
    # Fetch created id
    row = query_db(TASK_DB, "SELECT id FROM lists WHERE owner_id=? AND name=? ORDER BY id DESC", (user_id, name), one=True)
    list_id = row["id"]
    # Add owner as member
    try:
    # ADD MEMBERS
        query_db(TASK_DB, "INSERT OR IGNORE INTO list_members (list_id, user_id) VALUES (?, ?)", (list_id, user_id))
    except Exception:
        pass
    return jsonify({"message": "List created", "id": list_id}), 201

#ADD NEW MEMBERS TO LISTT, called by share button
@app.route("/lists/<int:list_id>/members", methods=["POST"])
def add_member(list_id):
    if "user_id" not in session:
        return ("Unauthorized", 401)
    user_id = session["user_id"]
    # checks if th ecaller owns list
    row = query_db(TASK_DB, "SELECT * FROM lists WHERE id=?", (list_id,), one=True)
    if not row:
        return ("Not found", 404)
    if row["owner_id"] != user_id:
        return ("Forbidden", 403)
    data = request.json or {}
    username = (data.get("username") or "").strip()
    if not username:
        return jsonify({"ok": False, "error": "username required"}), 400
    user = get_user_by_username(username)
    if not user:
        return jsonify({"ok": False, "error": "User not found"}), 404
    query_db(TASK_DB, "INSERT OR IGNORE INTO list_members (list_id, user_id) VALUES (?, ?)", (list_id, user["id"]))
    return jsonify({"message": "Member added"}), 200

@app.route("/lists/<int:list_id>/members", methods=["GET"])
def list_members_endpoint(list_id):
    if "user_id" not in session:
        return ("Unauthorized", 401)
    user_id = session["user_id"]
    row = query_db(TASK_DB, "SELECT * FROM lists WHERE id=?", (list_id,), one=True)
    if not row:
        return ("Not found", 404)
    # Only members can view
    if not is_member(user_id, list_id):
        return ("Forbidden", 403)
    members = query_db(
        TASK_DB,
        """
        SELECT lm.user_id, CASE WHEN l.owner_id = lm.user_id THEN 1 ELSE 0 END AS is_owner
        FROM list_members lm
        JOIN lists l ON l.id = lm.list_id
        WHERE lm.list_id=?
        """,
        (list_id,)
    )
    # Pull usernames from accounts DB
    results = []
    for m in members:
        user = query_db(ACCOUNTS_DB, "SELECT username FROM users WHERE id=?", (m["user_id"],), one=True)
        username = user["username"] if user else f"user-{m['user_id']}"
        results.append({"user_id": m["user_id"], "is_owner": m["is_owner"], "username": username})
    # Sort owner first, then username
    results.sort(key=lambda x: (-(x["is_owner"] or 0), x["username"].lower()))
    return jsonify(results)

@app.route("/lists/<int:list_id>/members/<int:member_id>", methods=["DELETE"])
def remove_member(list_id, member_id):
    if "user_id" not in session:
        return ("Unauthorized", 401)
    user_id = session["user_id"]
    row = query_db(TASK_DB, "SELECT * FROM lists WHERE id=?", (list_id,), one=True)
    if not row:
        return ("Not found", 404)
    # Only owner can remove, and owner cannot remove themselves
    if row["owner_id"] != user_id:
        return ("Forbidden", 403)
    if member_id == row["owner_id"]:
        return jsonify({"ok": False, "error": "Owner cannot be removed."}), 400
    query_db(TASK_DB, "DELETE FROM list_members WHERE list_id=? AND user_id=?", (list_id, member_id))
    return jsonify({"message": "Member removed"}), 200


@app.after_request
def add_no_cache_headers(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


if __name__ == "__main__":
    init_task_db()
    init_accounts_db()
    app.run(debug=True)
