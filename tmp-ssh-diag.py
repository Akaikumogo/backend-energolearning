import paramiko, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

HOST="192.0.6.84"; USER="sroot"; PASSWORD="Q!w3trey"
BACKEND="/home/sroot/BACKEND_PROJECTS/backend-energolearning"

def run(c, cmd, t=60):
    print(f"\n>>> {cmd}")
    _,o,e = c.exec_command(cmd, timeout=t)
    out=o.read().decode(errors="ignore"); err=e.read().decode(errors="ignore")
    code=o.channel.recv_exit_status()
    if out: print(out)
    if err: print("STDERR:", err)
    print(f"exit={code}")

c=paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=15)

run(c, "PGPASSWORD='StrongPassword123!' psql -h localhost -U sarvarbekxazratov -l 2>&1 | head -40")
run(c, "pm2 describe elektro-learn-backend 2>&1 | head -40")
run(c, "tail -n 200 /home/sroot/.pm2/logs/elektro-learn-backend-error.log 2>&1")
run(c, "tail -n 300 /home/sroot/.pm2/logs/elektro-learn-backend-out.log 2>&1 | tail -120")

c.close()
