import paramiko, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

HOST = "192.0.6.84"
USER = "sroot"
PASSWORD = "Q!w3trey"
BACKEND = "/home/sroot/BACKEND_PROJECTS/backend-energolearning"

def run(c, cmd, t=60):
    print(f"\n>>> {cmd}")
    _, o, e = c.exec_command(cmd, timeout=t)
    out = o.read().decode(errors="ignore")
    err = e.read().decode(errors="ignore")
    code = o.channel.recv_exit_status()
    if out: print(out)
    if err: print("STDERR:", err)
    print(f"exit={code}")
    return code, out, err

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=15)

run(c, "pm2 list || systemctl status backend-energolearning --no-pager || true")
run(c, f"ls {BACKEND}/.env 2>/dev/null && grep -E '^(DATABASE_URL|DB_)' {BACKEND}/.env | sed 's/PASSWORD=.*/PASSWORD=***/' || echo 'no .env'")
run(c, "pm2 logs --nostream --lines 80 2>/dev/null || journalctl -u backend-energolearning -n 80 --no-pager 2>/dev/null || true")
run(c, "sudo -n -u postgres psql -l 2>/dev/null | head -40 || psql -U postgres -l 2>/dev/null | head -40 || true")

c.close()
