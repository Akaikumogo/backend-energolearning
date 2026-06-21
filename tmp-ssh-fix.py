import paramiko, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

HOST="192.0.6.84"; USER="sroot"; PASSWORD="Q!w3trey"
BACKEND="/home/sroot/BACKEND_PROJECTS/backend-energolearning"
LOCAL_CONFIG = r"c:\Users\User\Desktop\ILHOM AKA\ELEKTRO LEARN\backend-energolearning\src\database\typeorm.config.ts"
REMOTE_CONFIG = f"{BACKEND}/src/database/typeorm.config.ts"

def run(c, cmd, t=300):
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

# Backup remote config
run(c, f"cp {REMOTE_CONFIG} {REMOTE_CONFIG}.bak.$(date +%s)")

# Upload fixed config
sftp = c.open_sftp()
sftp.put(LOCAL_CONFIG, REMOTE_CONFIG)
sftp.close()
print("Uploaded typeorm.config.ts")

run(c, f"grep -n 'AddOrganizationParentAndDefault' {REMOTE_CONFIG}")

# Build
run(c, f"cd {BACKEND} && npm run build 2>&1 | tail -30", t=600)

# Run migrations
run(c, f"cd {BACKEND} && node -r dotenv/config dist/run-migrations.js 2>&1 | tail -40", t=300)

# Verify column exists
run(c, "PGPASSWORD='StrongPassword123!' psql -h localhost -U sarvarbekxazratov -d elektrolearn -c \"SELECT name FROM _migrations ORDER BY id;\" 2>&1 | tail -25")
run(c, "PGPASSWORD='StrongPassword123!' psql -h localhost -U sarvarbekxazratov -d elektrolearn -c \"SELECT column_name FROM information_schema.columns WHERE table_name='organizations' ORDER BY ordinal_position;\" 2>&1")

# Restart backend
run(c, "pm2 restart elektro-learn-backend && sleep 4 && pm2 list")

# Tail logs
run(c, "tail -n 30 /home/sroot/.pm2/logs/elektro-learn-backend-out.log")
run(c, "tail -n 30 /home/sroot/.pm2/logs/elektro-learn-backend-error.log")

c.close()
