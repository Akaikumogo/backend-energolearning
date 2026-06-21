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

sftp = client.open_sftp()
sftp.put(LOCAL_CHECK, REMOTE_CHECK)
sftp.close()

run(client, f"ps aux | grep cutover-energo | grep -v grep || echo 'no cutover running'")
code, out, _ = run(client, f"cd {BACKEND} && node -r dotenv/config {REMOTE_CHECK}")
run(client, f"rm -f {REMOTE_CHECK}")

client.close()
sys.exit(code)
