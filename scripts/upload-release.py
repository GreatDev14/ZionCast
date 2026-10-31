import http.client
import subprocess
import urllib.request
import json
import os
import sys
import time

def get_token():
    p = subprocess.Popen(['git', 'credential', 'fill'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    stdout, _ = p.communicate(input='url=https://github.com/GreatDev14/ZionCast.git\n')
    for line in stdout.splitlines():
        if line.startswith('password='):
            return line.split('=', 1)[1].strip()
    return None

token = get_token()
if not token:
    print("Could not retrieve GitHub token!")
    sys.exit(1)

headers = {
    'Authorization': f'Bearer {token}',
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'ZionCast-Release-Tool'
}

# 1. Get Release info
req = urllib.request.Request('https://api.github.com/repos/GreatDev14/ZionCast/releases/tags/v1.0.0', headers=headers)
with urllib.request.urlopen(req) as resp:
    rel_data = json.loads(resp.read().decode('utf-8'))

release_id = rel_data['id']
print(f"Found release ID: {release_id} (Tag: {rel_data['tag_name']})")

# 2. Delete existing target assets to allow overwriting
assets = rel_data.get('assets', [])
for asset in assets:
    name = asset['name']
    if name in ['ZionCast-Setup-1.0.0.exe', 'ZionCast-Portable-1.0.0.zip']:
        print(f"Deleting older release asset: {name} (ID: {asset['id']})...")
        del_req = urllib.request.Request(
            f"https://api.github.com/repos/GreatDev14/ZionCast/releases/assets/{asset['id']}",
            headers=headers,
            method='DELETE'
        )
        with urllib.request.urlopen(del_req) as del_resp:
            print(f"Deleted {name}: HTTP {del_resp.status}")

# 3. Upload new binaries with streaming HTTPSConnection
files_to_upload = [
    r'dist\ZionCast-Setup-1.0.0.exe',
    r'dist\ZionCast-Portable-1.0.0.zip'
]

for filepath in files_to_upload:
    if not os.path.exists(filepath):
        print(f"Error: {filepath} not found!")
        continue
    
    filename = os.path.basename(filepath)
    filesize = os.path.getsize(filepath)
    print(f"\n>>> Uploading {filename} ({filesize / 1024 / 1024:.1f} MB) to GitHub Release...")
    
    conn = http.client.HTTPSConnection('uploads.github.com', timeout=600)
    path = f"/repos/GreatDev14/ZionCast/releases/{release_id}/assets?name={filename}"
    
    conn.putrequest('POST', path)
    conn.putheader('Authorization', f'Bearer {token}')
    conn.putheader('Content-Type', 'application/octet-stream')
    conn.putheader('Accept', 'application/vnd.github+json')
    conn.putheader('Content-Length', str(filesize))
    conn.putheader('User-Agent', 'ZionCast-Release-Tool')
    conn.endheaders()
    
    CHUNK = 1024 * 1024  # 1MB buffer
    sent_bytes = 0
    last_pct = -1
    start_time = time.time()
    
    with open(filepath, 'rb') as f:
        while True:
            chunk = f.read(CHUNK)
            if not chunk:
                break
            conn.send(chunk)
            sent_bytes += len(chunk)
            pct = int((sent_bytes / filesize) * 100)
            if pct != last_pct and (pct % 10 == 0 or pct == 100):
                elapsed = time.time() - start_time
                mbps = (sent_bytes / 1024 / 1024) / max(0.1, elapsed)
                print(f"  [{pct}%] {sent_bytes / 1024 / 1024:.1f} MB / {filesize / 1024 / 1024:.1f} MB ({mbps:.2f} MB/s)")
                sys.stdout.flush()
                last_pct = pct
    
    resp = conn.getresponse()
    body = resp.read().decode('utf-8')
    if resp.status in (200, 201):
        data = json.loads(body)
        print(f"  [SUCCESS] {filename} uploaded! Asset ID: {data.get('id')}")
        print(f"  Direct URL: {data.get('browser_download_url')}")
    else:
        print(f"  [FAILED] HTTP {resp.status} {resp.reason}")
        print("  Response:", body[:300])
        sys.exit(1)

print("\n[ALL OK] All release assets uploaded successfully!")
