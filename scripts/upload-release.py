import subprocess
import urllib.request
import json
import os
import sys

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

# 3. Upload new binaries with curl.exe
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
    upload_url = f"https://uploads.github.com/repos/GreatDev14/ZionCast/releases/{release_id}/assets?name={filename}"
    
    print(f"\nUploading {filename} ({filesize / 1024 / 1024:.1f} MB)...")
    cmd = [
        'curl.exe',
        '-X', 'POST',
        '-H', f'Authorization: Bearer {token}',
        '-H', 'Content-Type: application/octet-stream',
        '-H', 'Accept: application/vnd.github+json',
        '--data-binary', f'@{filepath}',
        '--retry', '3',
        '--connect-timeout', '30',
        '-f',
        '-s',
        '-w', 'HTTP_STATUS: %{http_code}\n',
        upload_url
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    print('Curl Output:', res.stdout.strip())
    if res.returncode != 0:
        print('Curl Error:', res.stderr.strip())

print("\n✓ Release asset updates completed successfully!")
