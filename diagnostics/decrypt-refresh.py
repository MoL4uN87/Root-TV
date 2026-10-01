"""Decrypt the three Kinozal cookies from a stopped Yandex Browser snapshot.

Run as the Windows account that owns the browser profile. Never print values.
"""
import base64
import ctypes
import hashlib
import json
import os
import sqlite3
from ctypes import byref, c_void_p, create_string_buffer, string_at
from ctypes.wintypes import BOOL, DWORD
from pathlib import Path

from Crypto.Cipher import AES


class Blob(ctypes.Structure):
    _fields_ = [("cbData", DWORD), ("pbData", c_void_p)]


crypt32 = ctypes.windll.crypt32
kernel32 = ctypes.windll.kernel32
crypt32.CryptUnprotectData.argtypes = [ctypes.POINTER(Blob), c_void_p, c_void_p, c_void_p, c_void_p, DWORD, ctypes.POINTER(Blob)]
crypt32.CryptUnprotectData.restype = BOOL
kernel32.LocalFree.argtypes = [c_void_p]
kernel32.LocalFree.restype = c_void_p


def dpapi_decrypt(data):
    buf = create_string_buffer(data, len(data))
    source = Blob(len(data), ctypes.cast(buf, c_void_p))
    result = Blob()
    if not crypt32.CryptUnprotectData(byref(source), None, None, None, None, 0, byref(result)):
        raise ctypes.WinError()
    try:
        return string_at(result.pbData, result.cbData)
    finally:
        kernel32.LocalFree(result.pbData)


root = Path(__file__).resolve().parent
state_path = Path(os.environ["LOCALAPPDATA"]) / "Yandex" / "YandexBrowser" / "User Data" / "Local State"
state = json.loads(state_path.read_text(encoding="utf-8"))
wrapped_key = base64.b64decode(state["os_crypt"]["encrypted_key"])
if not wrapped_key.startswith(b"DPAPI"):
    raise RuntimeError("Unsupported Yandex Browser key format")
key = dpapi_decrypt(wrapped_key[5:])

connection = sqlite3.connect(f"file:{root / 'Cookies-yandex-refresh'}?mode=ro", uri=True)
rows = connection.execute(
    "select host_key,name,encrypted_value,creation_utc from cookies where host_key=?",
    (".kinozal.guru",),
).fetchall()
cookies = {}
created = {}
for host, name, encrypted, creation in rows:
    if name not in {"uid", "pass", "cf_clearance"} or not encrypted.startswith(b"v10"):
        continue
    value = AES.new(key, AES.MODE_GCM, nonce=encrypted[3:15]).decrypt_and_verify(encrypted[15:-16], encrypted[-16:])
    host_hash = hashlib.sha256(host.encode()).digest()
    if value.startswith(host_hash):
        value = value[32:]
    cookies[name] = value.decode("utf-8")
    created[name] = creation
if set(cookies) != {"uid", "pass", "cf_clearance"}:
    raise RuntimeError("Required Kinozal cookies are missing")
output = root / 'kinozal-cookies-refresh.json'
output.write_text(json.dumps(cookies), encoding="utf-8")
print("Decrypted cookie names:", ", ".join(sorted(cookies)))
print("cf_clearance creation timestamp:", created["cf_clearance"])
print("Private output:", output)
