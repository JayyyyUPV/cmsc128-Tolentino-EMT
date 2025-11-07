from flask import Flask, request, render_template, redirect, url_for, session, flash, jsonify
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
import datetime

app = Flask(__name__)
CORS(app)
app.secret_key = "hell_yeah"

TASK_DB = "tasks.db"
ACCOUNTS_DB = "accounts.db"

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


# --- Routes ---
@app.route("/")
def home():
    if "user_id" not in session:
        return redirect(url_for("auth"))
    return render_template("index.html", username=session["username"])

@app.route("/auth", methods=["GET", "POST"])
def auth():
    if request.method == "GET":
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
        user = get_user_by_username(username)
        if not user or not check_password_hash(user["password_hash"], password):
            if wants_json:
                return jsonify({"ok": False, "error": "Invalid username or password."}), 401
            flash("Invalid username or password.")
            return redirect(url_for("auth"))

        session["user_id"] = user["id"]
        session["username"] = user["username"]
        if wants_json:
            return jsonify({"ok": True, "redirect": url_for("home")}), 200
        flash("Logged in successfully!")
        return redirect(url_for("home"))

    return redirect(url_for("auth"))

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
    rows = query_db(TASK_DB, "SELECT * FROM tasks WHERE user_id=?", (user_id,))
    return jsonify([dict(r) for r in rows])

@app.route("/tasks", methods=["POST"])
def add_task():
    if "user_id" not in session:
        return ("Unauthorized", 401)
    data = request.json
    user_id = session["user_id"]
    query_db(
        TASK_DB,
        "INSERT INTO tasks (user_id, title, description, dueDate, dueTime, priority, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            user_id,
            data["title"],
            data.get("description", ""),
            data.get("dueDate"),
            data.get("dueTime"),
            data.get("priority", "Low"),
            datetime.datetime.now().isoformat()
        )
    )
    return jsonify({"message": "Task added"}), 201


if __name__ == "__main__":
    init_task_db()
    init_accounts_db()
    app.run(debug=True)
