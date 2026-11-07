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

tag = 'v1.2.0'
release_name = 'ZionCast 1.2.0 - Phone Bible Scriptures & Secret Preacher Stage Notes'
body_notes = """## ZionCast v1.2.0 Release Notes

### 📱 New Mobile Phone Remote Capabilities
- **📖 Bible Scriptures on Phone**: Search any scripture (e.g., *John 3:16*, *Romans 8:28*, *Psalm 23*, *Gen 1:1*) directly from your phone or tablet on stage or in the sound booth.
  - Switch translations on the fly: **KJV**, **RSV**, and **GNT**.
  - Quick book chips for rapid scripture lookup.
  - Full verse text preview on the phone before going on air.
  - **1-Tap Project Live**: Instantly project the scripture to the audience TV screen.
  - **Add to Service**: Queue the scripture directly into the Sunday Order of Service.

- **🤫 Secret Messages to Preacher's Confidence Screen**:
  - Discreetly send private notes and stage alerts from your phone straight to the **Preacher & Choir Stage Display** (`/stage`).
  - **100% Private**: Displayed ONLY on the stage monitor facing the pulpit—the congregation on the main sanctuary TV will NEVER see it.
  - Quick 1-tap preset shortcuts: *5 Mins Left*, *Wrap Up*, *Communion*, *Mic Low*, *Nursery #104*, *Speak Louder*, *Altar Call*.
  - Live status indicator on your phone showing what note is currently active on stage.
  - 1-tap Clear Note button.

### 🎥 Live Video & Display Fixes (From v1.1.1)
- Seamless YouTube live stream playback without stalling or 0:00 buffering.
- Removed duplicate center text badge overlay.
- Single-TV Sanctuary Clock overlay and quick bottom toolbar buttons.

### 📥 Downloads
- **Windows Installer**: `ZionCast-Setup-1.2.0.exe`
- **Portable Edition**: `ZionCast-Portable-1.2.0.zip`
"""

# 1. Create or fetch release
req = urllib.request.Request(f'https://api.github.com/repos/GreatDev14/ZionCast/releases/tags/{tag}', headers=headers)
try:
    with urllib.request.urlopen(req) as resp:
        rel_data = json.loads(resp.read().decode('utf-8'))
        release_id = rel_data['id']
        print(f"Existing release found: ID {release_id}")
except urllib.error.HTTPError as e:
    if e.code == 404:
        print(f"Release {tag} does not exist. Creating new release...")
        create_payload = json.dumps({
            'tag_name': tag,
            'name': release_name,
            'body': body_notes,
            'draft': False,
            'prerelease': False
        }).encode('utf-8')
        create_req = urllib.request.Request(
            'https://api.github.com/repos/GreatDev14/ZionCast/releases',
            data=create_payload,
            headers={**headers, 'Content-Type': 'application/json'},
            method='POST'
        )
        with urllib.request.urlopen(create_req) as resp:
            rel_data = json.loads(resp.read().decode('utf-8'))
            release_id = rel_data['id']
            print(f"Created release: ID {release_id}")
    else:
        raise

# 2. Upload assets
files_to_upload = [
    r'dist\ZionCast-Setup-1.2.0.exe',
    r'dist\ZionCast-Portable-1.2.0.zip'
]

for filepath in files_to_upload:
    if not os.path.exists(filepath):
        print(f"Skipping {filepath} (file does not exist)")
        continue

    filename = os.path.basename(filepath)
    filesize = os.path.getsize(filepath)

    chk_req = urllib.request.Request(f'https://api.github.com/repos/GreatDev14/ZionCast/releases/{release_id}/assets', headers=headers)
    with urllib.request.urlopen(chk_req) as resp:
        assets = json.loads(resp.read().decode('utf-8'))
    
    existing = next((a for a in assets if a['name'] == filename), None)
    if existing:
        if existing['size'] == filesize:
            print(f"[EXISTS] {filename} ({filesize/1024/1024:.1f} MB) already matches. Skipping.")
            continue
        else:
            print(f"Deleting older asset {filename} (ID {existing['id']})...")
            del_req = urllib.request.Request(
                f"https://api.github.com/repos/GreatDev14/ZionCast/releases/assets/{existing['id']}",
                headers=headers,
                method='DELETE'
            )
            with urllib.request.urlopen(del_req) as del_resp:
                print(f"Deleted old asset: HTTP {del_resp.status}")

    print(f"\n>>> Uploading {filename} ({filesize / 1024 / 1024:.1f} MB) to GitHub Release...")
    conn = http.client.HTTPSConnection('uploads.github.com', timeout=600)
    upload_path = f"/repos/GreatDev14/ZionCast/releases/{release_id}/assets?name={filename}"
    conn.putrequest('POST', upload_path)
    conn.putheader('Authorization', f'Bearer {token}')
    conn.putheader('Content-Type', 'application/octet-stream')
    conn.putheader('Accept', 'application/vnd.github+json')
    conn.putheader('Content-Length', str(filesize))
    conn.putheader('User-Agent', 'ZionCast-Release-Tool')
    conn.endheaders()

    CHUNK = 512 * 1024
    sent_bytes = 0
    start_time = time.time()
    last_pct = -1

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
                last_pct = pct

    res = conn.getresponse()
    print(f"Upload complete for {filename}: HTTP {res.status} {res.reason}")

print("\nAll assets successfully published to GitHub Release v1.2.0!")
