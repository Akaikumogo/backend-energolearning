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

run(c, f"cd {BACKEND} && git status --short && echo '---' && git log -3 --oneline && echo '---' && git remote -v")
run(c, f"ls {BACKEND}/dist/database/migrations/ 2>&1 | tail -20")
run(c, f"ls {BACKEND}/src/database/migrations/ 2>&1 | tail -20")
run(c, f"grep -n '0017\\|AddOrganizationParentAndDefault' {BACKEND}/src/database/typeorm.config.ts")
run(c, f"grep -n '0017\\|AddOrganizationParentAndDefault' {BACKEND}/dist/database/typeorm.config.js 2>&1")
run(c, f"PGPASSWORD='StrongPassword123!' psql -h localhost -U sarvarbekxazratov -d elektrolearn -c \"SELECT name FROM _migrations ORDER BY id;\" 2>&1 | tail -30")
run(c, f"PGPASSWORD='StrongPassword123!' psql -h localhost -U sarvarbekxazratov -d elektrolearn -c \"\\d organizations\" 2>&1 | tail -30")

c.close()
