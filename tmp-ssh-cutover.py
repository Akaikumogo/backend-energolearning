import paramiko
import sys

HOST = "192.0.6.84"
USER = "sroot"
PASSWORD = "Q!w3trey"
BACKEND = "/home/sroot/BACKEND_PROJECTS/backend-energolearning"
LOCAL_CHECK = r"c:\Users\User\Desktop\ILHOM AKA\ELEKTRO LEARN\backend-energolearning\tmp-check-db.mjs"
REMOTE_CHECK = f"{BACKEND}/tmp-check-db.mjs"


def run(client, cmd, timeout=120):
    print(f"\n>>> {cmd}\n")
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode()
    err = stderr.read().decode()
    code = stdout.channel.recv_exit_status()
    if out:
        print(out)
    if err:
        print("STDERR:", err)
    print(f"exit={code}")
    return code, out, err


client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=15)

cutover_cmd = f"cd {BACKEND} && node -r dotenv/config scripts/cutover-energo-id-fresh-start.mjs --confirm"
print(">>> CUTOVER START (10-30 min)...")
_, stdout, stderr = client.exec_command(cutover_cmd, timeout=3600)
while True:
    line = stdout.readline()
    if not line:
        break
    print(line, end="")
err = stderr.read().decode()
if err:
    print("STDERR:", err)
code = stdout.channel.recv_exit_status()
print(f"\nCUTOVER exit={code}")

if code != 0:
    client.close()
    sys.exit(code)

sftp = client.open_sftp()
sftp.put(LOCAL_CHECK, REMOTE_CHECK)
sftp.close()
run(client, f"cd {BACKEND} && node -r dotenv/config {REMOTE_CHECK}")
run(client, f"rm -f {REMOTE_CHECK}")
run(client, "pm2 restart elektro-learn-backend --update-env", timeout=60)

client.close()
print("\nDone. Admin paneldan ENERGO ID sinxronlash qiling.")
