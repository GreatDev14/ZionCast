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

tag = 'v1.3.2'
release_name = 'ZionCast 1.3.2 - Keyboard Typing & Focus Reliability Fix + Smart Scripture Phrase Search'
body_notes = """## ZionCast v1.3.2 Release Notes

### ⌨️ Rock-Solid Keyboard Typing & Input Focus Across All Windows
- **Eliminated Windows Electron Dialog Focus Lockups**: Replaced all synchronous `window.alert()` and `window.confirm()` calls with non-blocking frosted-glass Toast Notifications and an in-app Confirmation Modal so deleting items, saving service files, importing lyrics, or validating forms never detaches Windows keyboard focus from text fields.
- **Zero Focus-Stealing Projector / TV Window**: Launching or repositioning the Audience TV / Projector (`displayWindow`) and Stage Display now uses `showInactive()` and preserves active keyboard focus on the Operator Control Desk—even when going live or running dual screens.
- **First-Click Caret & Text Selection**: Overrode global `user-select: none` on all `<input>` and `<textarea>` fields (`user-select: text !important`) across both the Desktop Control Desk and Mobile Wi-Fi Remote, and added automatic first-click OS focus recovery.
- **Modal Auto-Focus & Hotkey Guard**: Opening **Announcement Slide** (plus a new 1-click `📢 + Slide` button in the Library header), **Create Song**, **Import Lyrics**, **Alert Banner**, **YouTube Live**, or switching to **Songs / Bibles** automatically focuses the primary input and blocks `[Space]`, `[B]`, `[C]`, `[T]` hotkeys while modals or `Ctrl`/`Alt` shortcuts are active.

### 📖 Smarter Scripture Search (References, Verse Ranges & Full-Text Phrases)
- Type exact references (`John 3:16`), verse ranges (`John 3:16-18`, `Psalm 23:1-6`), shorthand aliases (`mk 11:24`, `1 cor 13`), **or actual Scripture words/phrases** (e.g. `my shepherd`, `for God so loved`) right in the Bible search bar.

### 📥 Downloads
- **Windows Installer**: `ZionCast-Setup-1.3.2.exe`
- **Portable Edition**: `ZionCast-Portable-1.3.2.zip`
"""

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

files_to_upload = [
    r'dist\ZionCast-Setup-1.3.2.exe',
    r'dist\ZionCast-Portable-1.3.2.zip'
]

for filepath in files_to_upload:
    if not os.path.exists(filepath):
        print(f"ERROR: Missing required build artifact {filepath}!")
        sys.exit(1)

    filename = os.path.basename(filepath)
    filesize = os.path.getsize(filepath)

    max_attempts = 5
    for attempt in range(1, max_attempts + 1):
        try:
            chk_req = urllib.request.Request(f'https://api.github.com/repos/GreatDev14/ZionCast/releases/{release_id}/assets', headers=headers)
            with urllib.request.urlopen(chk_req) as resp:
                assets = json.loads(resp.read().decode('utf-8'))

            existing = next((a for a in assets if a['name'] == filename), None)
            if existing:
                if existing['size'] == filesize and existing.get('state') == 'uploaded':
                    print(f"[EXISTS] {filename} ({filesize/1024/1024:.1f} MB) already matches. Skipping.")
                    break
                else:
                    del_req = urllib.request.Request(
                        f"https://api.github.com/repos/GreatDev14/ZionCast/releases/assets/{existing['id']}",
                        headers=headers,
                        method='DELETE'
                    )
                    with urllib.request.urlopen(del_req):
                        pass

            print(f"\n>>> Uploading {filename} ({filesize / 1024 / 1024:.1f} MB) to GitHub Release (Attempt {attempt}/{max_attempts})...")
            conn = http.client.HTTPSConnection('uploads.github.com', timeout=600)
            upload_path = f"/repos/GreatDev14/ZionCast/releases/{release_id}/assets?name={filename}"
            conn.putrequest('POST', upload_path)
            conn.putheader('Authorization', f'Bearer {token}')
            conn.putheader('Content-Type', 'application/octet-stream')
            conn.putheader('Accept', 'application/vnd.github+json')
            conn.putheader('Content-Length', str(filesize))
            conn.putheader('User-Agent', 'ZionCast-Release-Tool')
            conn.endheaders()

            CHUNK = 256 * 1024
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
                    if pct != last_pct and (pct % 20 == 0 or pct == 100):
                        elapsed = time.time() - start_time
                        mbps = (sent_bytes / 1024 / 1024) / max(0.1, elapsed)
                        print(f"  [{pct}%] {sent_bytes / 1024 / 1024:.1f} MB / {filesize / 1024 / 1024:.1f} MB ({mbps:.2f} MB/s)", flush=True)
                        last_pct = pct

            res = conn.getresponse()
            print(f"Upload complete for {filename}: HTTP {res.status} {res.reason}")
            if res.status in (200, 201):
                break
            else:
                raise RuntimeError(f"Unexpected HTTP {res.status}: {res.read().decode('utf-8', 'ignore')}")
        except Exception as err:
            print(f"Attempt {attempt} failed: {err}")
            if attempt < max_attempts:
                time.sleep(3)
            else:
                raise

print("\nAll assets successfully published to GitHub Release v1.3.2!")

