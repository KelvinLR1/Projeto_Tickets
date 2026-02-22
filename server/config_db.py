import os
import sys
import re

# ─────────────────────────────────────────────
#  Utilitários de caminho e .env
# ─────────────────────────────────────────────

def get_install_dir():
    """Retorna o diretório de instalação do sistema (pasta do EXE ou pasta do script)."""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    else:
        return os.path.dirname(os.path.abspath(__file__))


def get_current_db_url():
    """Lê a DATABASE_URL atual do arquivo .env."""
    install_dir = get_install_dir()
    env_path = os.path.join(install_dir, ".env")
    if not os.path.exists(env_path):
        return None
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip()
    return None


def update_env_file(database_url):
    """Salva a DATABASE_URL no arquivo .env na pasta de instalação."""
    install_dir = get_install_dir()
    env_path = os.path.join(install_dir, ".env")
    lines = []

    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

    db_url_found = False
    new_lines = []
    for line in lines:
        if line.strip().startswith("DATABASE_URL="):
            new_lines.append(f"DATABASE_URL={database_url}\n")
            db_url_found = True
        else:
            new_lines.append(line)

    if not db_url_found:
        new_lines.append(f"\nDATABASE_URL={database_url}\n")

    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)


def parse_current_url(url):
    """Analisa a URL do banco atual e retorna um dict com os campos."""
    if not url:
        return {"type": "sqlite", "dbname": "tickets.db"}

    if url.startswith("sqlite"):
        path = url.replace("sqlite:///", "").replace("sqlite://", "")
        return {"type": "sqlite", "dbname": os.path.basename(path)}

    # PostgreSQL: postgresql+pg8000://user:password@host:port/dbname
    match = re.match(
        r"postgresql(?:\+\w+)?://([^:]+):([^@]*)@([^:]+):(\d+)/(.+)", url
    )
    if match:
        return {
            "type": "postgresql",
            "user": match.group(1),
            "password": match.group(2),
            "host": match.group(3),
            "port": match.group(4),
            "dbname": match.group(5).split("?")[0],
        }
    return {"type": "sqlite", "dbname": "tickets.db"}


def create_database_if_not_exists(user, password, host, port, dbname):
    """Cria o banco PostgreSQL se não existir."""
    import pg8000.native
    conn = pg8000.native.Connection(
        user=user, password=password,
        host=host, port=int(port),
        database="postgres"
    )
    result = conn.run("SELECT 1 FROM pg_database WHERE datname=:db", db=dbname)
    if not result:
        conn.run(f"CREATE DATABASE {dbname}")
    conn.close()


# ─────────────────────────────────────────────
#  GUI tkinter
# ─────────────────────────────────────────────

def run_gui():
    import tkinter as tk
    from tkinter import ttk, messagebox

    current_url = get_current_db_url()
    parsed = parse_current_url(current_url)

    # ── Cores e fontes ──────────────────────────────────────
    BG       = "#0f172a"
    CARD     = "#1e293b"
    ACCENT   = "#3b82f6"
    SUCCESS  = "#22c55e"
    MUTED    = "#64748b"
    FG       = "#f1f5f9"
    ENTRY_BG = "#0f172a"
    FONT_H   = ("Segoe UI", 14, "bold")
    FONT_B   = ("Segoe UI", 10, "bold")
    FONT_N   = ("Segoe UI", 10)
    FONT_S   = ("Segoe UI", 8)

    # ── Janela principal ────────────────────────────────────
    root = tk.Tk()
    root.title("TicketFlow — Configurador de Banco de Dados")
    root.geometry("520x600")
    root.resizable(False, False)
    root.configure(bg=BG)

    # Centraliza a janela
    root.update_idletasks()
    w, h = root.winfo_width(), root.winfo_height()
    x = (root.winfo_screenwidth() // 2) - (w // 2)
    y = (root.winfo_screenheight() // 2) - (h // 2)
    root.geometry(f"+{x}+{y}")

    # ── Cabeçalho ──────────────────────────────────────────
    hdr = tk.Frame(root, bg=ACCENT, padx=24, pady=18)
    hdr.pack(fill="x")
    tk.Label(hdr, text="⚙️  Configurador de Banco de Dados",
             bg=ACCENT, fg="white", font=FONT_H).pack(anchor="w")
    tk.Label(hdr, text="TicketFlow — Configuração de conexão",
             bg=ACCENT, fg="#bfdbfe", font=FONT_S).pack(anchor="w")

    # ── Status atual ───────────────────────────────────────
    status_frame = tk.Frame(root, bg=BG, padx=24, pady=12)
    status_frame.pack(fill="x")

    if current_url:
        db_type_label = "SQLite" if parsed["type"] == "sqlite" else "PostgreSQL"
        db_detail = parsed.get("dbname", "")
        fg_status = SUCCESS
        status_text = f"Configuração atual: {db_type_label} — {db_detail}"
    else:
        fg_status = "#f59e0b"
        status_text = "⚠️  Nenhuma configuração encontrada. Configure abaixo."

    tk.Label(status_frame, text=status_text,
             bg=BG, fg=fg_status, font=FONT_S).pack(anchor="w")

    separator = tk.Frame(root, bg=CARD, height=1)
    separator.pack(fill="x", padx=24)

    # ── Seleção de tipo ────────────────────────────────────
    content = tk.Frame(root, bg=BG, padx=24, pady=16)
    content.pack(fill="both", expand=True)

    tk.Label(content, text="Selecione o tipo de banco de dados:",
             bg=BG, fg=MUTED, font=FONT_B).pack(anchor="w", pady=(0, 8))

    db_var = tk.StringVar(value=parsed["type"])

    btn_frame = tk.Frame(content, bg=BG)
    btn_frame.pack(fill="x", pady=(0, 16))

    # Frames de seleção para SQLite/PostgreSQL
    sqlite_btn = tk.Frame(btn_frame, bg=CARD, relief="flat", cursor="hand2")
    sqlite_btn.pack(side="left", fill="both", expand=True, padx=(0, 6), ipady=8)

    pg_btn = tk.Frame(btn_frame, bg=CARD, relief="flat", cursor="hand2")
    pg_btn.pack(side="left", fill="both", expand=True, padx=(6, 0), ipady=8)

    sqlite_label = tk.Label(sqlite_btn, text="🗄️  SQLite\n(Local)",
                            bg=CARD, fg=FG, font=FONT_B, cursor="hand2")
    sqlite_label.pack(expand=True)

    pg_label = tk.Label(pg_btn, text="🐘  PostgreSQL\n(Servidor)",
                        bg=CARD, fg=FG, font=FONT_B, cursor="hand2")
    pg_label.pack(expand=True)

    # ── Área de formulários ────────────────────────────────
    form_frame = tk.Frame(content, bg=BG)
    form_frame.pack(fill="both", expand=True)

    # Form SQLite
    sqlite_form = tk.Frame(form_frame, bg=BG)
    tk.Label(sqlite_form, text="Nome do arquivo de banco de dados:",
             bg=BG, fg=MUTED, font=FONT_B).pack(anchor="w", pady=(0, 4))
    sqlite_dbname = tk.Entry(sqlite_form, bg=ENTRY_BG, fg=FG, insertbackground=FG,
                             font=FONT_N, relief="flat",
                             highlightthickness=1, highlightbackground=CARD,
                             highlightcolor=ACCENT)
    sqlite_dbname.insert(0, parsed.get("dbname", "tickets.db"))
    sqlite_dbname.pack(fill="x", ipady=6)
    tk.Label(sqlite_form, text="O banco de dados será criado na pasta de instalação.",
             bg=BG, fg=MUTED, font=FONT_S).pack(anchor="w", pady=(4, 0))

    # Form PostgreSQL
    pg_form = tk.Frame(form_frame, bg=BG)

    def add_field(parent, label_text, default="", show=""):
        tk.Label(parent, text=label_text, bg=BG, fg=MUTED, font=FONT_B).pack(anchor="w", pady=(8, 2))
        e = tk.Entry(parent, bg=ENTRY_BG, fg=FG, insertbackground=FG,
                     font=FONT_N, relief="flat", show=show,
                     highlightthickness=1, highlightbackground=CARD, highlightcolor=ACCENT)
        e.insert(0, default)
        e.pack(fill="x", ipady=6)
        return e

    pg_host   = add_field(pg_form, "Endereço do Servidor (host):", parsed.get("host", "localhost"))
    pg_port   = add_field(pg_form, "Porta:", parsed.get("port", "5432"))
    pg_user   = add_field(pg_form, "Usuário:", parsed.get("user", "postgres"))
    pg_pass   = add_field(pg_form, "Senha:", parsed.get("password", ""), show="•")
    pg_dbname = add_field(pg_form, "Nome do Banco de Dados:", parsed.get("dbname", "ticketflow_db"))

    # ── Seleção de modo ─────────────────────────────────────
    def update_mode(mode):
        db_var.set(mode)
        if mode == "sqlite":
            sqlite_btn.configure(bg=ACCENT)
            sqlite_label.configure(bg=ACCENT, fg="white")
            pg_btn.configure(bg=CARD)
            pg_label.configure(bg=CARD, fg=FG)
            pg_form.pack_forget()
            sqlite_form.pack(fill="both", expand=True)
        else:
            pg_btn.configure(bg=ACCENT)
            pg_label.configure(bg=ACCENT, fg="white")
            sqlite_btn.configure(bg=CARD)
            sqlite_label.configure(bg=CARD, fg=FG)
            sqlite_form.pack_forget()
            pg_form.pack(fill="both", expand=True)

    sqlite_btn.bind("<Button-1>", lambda e: update_mode("sqlite"))
    sqlite_label.bind("<Button-1>", lambda e: update_mode("sqlite"))
    pg_btn.bind("<Button-1>", lambda e: update_mode("postgresql"))
    pg_label.bind("<Button-1>", lambda e: update_mode("postgresql"))

    update_mode(parsed["type"])

    # ── Status de operação e botão salvar ───────────────────
    bottom = tk.Frame(root, bg=BG, padx=24, pady=16)
    bottom.pack(fill="x", side="bottom")

    op_status_var = tk.StringVar(value="")
    op_status_label = tk.Label(bottom, textvariable=op_status_var,
                               bg=BG, fg=SUCCESS, font=FONT_S)
    op_status_label.pack(anchor="w", pady=(0, 8))

    def save():
        mode = db_var.get()
        install_dir = get_install_dir()

        if mode == "sqlite":
            dbname = sqlite_dbname.get().strip() or "tickets.db"
            if not dbname.endswith(".db"):
                dbname += ".db"
            db_path = os.path.join(install_dir, "server", dbname).replace(os.sep, "/")
            db_url = f"sqlite:///{db_path}"
            try:
                update_env_file(db_url)
                op_status_var.set(f"✅ Configuração SQLite salva: {dbname}")
                op_status_label.configure(fg=SUCCESS)
            except Exception as ex:
                op_status_var.set(f"❌ Erro: {ex}")
                op_status_label.configure(fg="#ef4444")

        else:
            host   = pg_host.get().strip() or "localhost"
            port   = pg_port.get().strip() or "5432"
            user   = pg_user.get().strip() or "postgres"
            pwd    = pg_pass.get().strip()
            dbname = pg_dbname.get().strip() or "ticketflow_db"

            op_status_var.set("⏳ Testando conexão com o PostgreSQL...")
            op_status_label.configure(fg="#f59e0b")
            root.update()

            try:
                create_database_if_not_exists(user, pwd, host, port, dbname)
                db_url = f"postgresql+pg8000://{user}:{pwd}@{host}:{port}/{dbname}"
                update_env_file(db_url)
                op_status_var.set(f"✅ PostgreSQL configurado: {host}/{dbname}")
                op_status_label.configure(fg=SUCCESS)
            except Exception as ex:
                op_status_var.set(f"❌ Falha: {ex}")
                op_status_label.configure(fg="#ef4444")

    save_btn = tk.Button(bottom, text="💾  SALVAR CONFIGURAÇÃO",
                        command=save,
                        bg=ACCENT, fg="white", font=FONT_B,
                        relief="flat", cursor="hand2",
                        activebackground="#2563eb", activeforeground="white",
                        padx=16, pady=10)
    save_btn.pack(fill="x")

    tk.Label(bottom,
             text="Após salvar, reinicie os serviços para aplicar as mudanças.",
             bg=BG, fg=MUTED, font=FONT_S).pack(anchor="w", pady=(8, 0))

    root.mainloop()


# ─────────────────────────────────────────────
#  Modo silencioso (chamado pelo instalador)
# ─────────────────────────────────────────────

def run_silent():
    """Configura SQLite padrão de forma silenciosa (sem GUI)."""
    install_dir = get_install_dir()
    dbname = "tickets.db"
    db_path = os.path.join(install_dir, "server", dbname).replace(os.sep, "/")
    db_url = f"sqlite:///{db_path}"
    print(f"[config_db] Modo silencioso: configurando SQLite em {db_path}")
    update_env_file(db_url)
    print("[config_db] Configuração SQLite padrão salva com sucesso.")


# ─────────────────────────────────────────────
#  Entry point
# ─────────────────────────────────────────────

def main():
    silent = "--silent" in sys.argv or not sys.stdin.isatty()
    if silent:
        run_silent()
    else:
        run_gui()


if __name__ == "__main__":
    main()
