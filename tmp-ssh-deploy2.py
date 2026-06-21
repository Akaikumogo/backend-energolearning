import paramiko, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

HOST="192.0.6.84"; USER="sroot"; PASSWORD="Q!w3trey"
BACKEND="/home/sroot/BACKEND_PROJECTS/backend-energolearning"
BASE = r"c:\Users\User\Desktop\ILHOM AKA\ELEKTRO LEARN\backend-energolearning"

UPLOADS = [
    (rf"{BASE}\src\users\users.service.ts",                f"{BACKEND}/src/users/users.service.ts"),
    (rf"{BASE}\src\database\typeorm.config.ts",            f"{BACKEND}/src/database/typeorm.config.ts"),
    (rf"{BASE}\src\database\migrations\0017-fix-nes-employee-unique.ts",
     f"{BACKEND}/src/database/migrations/0017-fix-nes-employee-unique.ts"),
]

def run(c, cmd, t=600):
    print(f"\n>>> {cmd}")
    _,o,e = c.exec_command(cmd, timeout=t)
    out=o.read().decode(errors="ignore"); err=e.read().decode(errors="ignore")
    code=o.channel.recv_exit_status()
    if out: print(out)
    if err: print("STDERR:", err)
    print(f"exit={code}")
    return code

c=paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=15)

sftp = c.open_sftp()
for local, remote in UPLOADS:
    sftp.put(local, remote)
    print(f"Uploaded {remote}")
sftp.close()

run(c, f"cd {BACKEND} && npm run build 2>&1 | tail -25")
run(c, f"cd {BACKEND} && node -r dotenv/config dist/run-migrations.js 2>&1 | tail -20")
run(c, "PGPASSWORD='StrongPassword123!' psql -h localhost -U sarvarbekxazratov -d elektrolearn -c \"SELECT name FROM _migrations ORDER BY id;\" 2>&1 | tail -22")
run(c, "PGPASSWORD='StrongPassword123!' psql -h localhost -U sarvarbekxazratov -d elektrolearn -c \"SELECT id,email,role FROM users;\" 2>&1")
run(c, "pm2 restart elektro-learn-backend && sleep 5 && pm2 list")
run(c, "tail -n 25 /home/sroot/.pm2/logs/elektro-learn-backend-out.log")
run(c, "tail -n 20 /home/sroot/.pm2/logs/elektro-learn-backend-error.log")

c.close()
