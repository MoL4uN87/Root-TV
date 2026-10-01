"""Compare HTTP/2 and HTTP/3 against Kinozal without printing credentials."""
import json
from pathlib import Path

from curl_cffi import requests
from curl_cffi.const import CurlHttpVersion


cookies = json.loads((Path(__file__).parent / "kinozal-cookies-refresh.json").read_text(encoding="utf-8"))
ua = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/150.0.0.0 YaBrowser/26.8.0.0 Safari/537.36"
)
for version in (CurlHttpVersion.V2_0, CurlHttpVersion.V3):
    try:
        response = requests.get(
            "https://kinozal.guru/top.php",
            cookies=cookies,
            impersonate="chrome150",
            headers={"User-Agent": ua},
            http_version=version,
            timeout=20,
        )
        protocol = "HTTP/2" if response.http_version == CurlHttpVersion.V2_0 else str(response.http_version)
        print(f"requested={version.name} actual={protocol} status={response.status_code} challenge={response.headers.get('cf-mitigated') == 'challenge'}")
    except Exception as exc:
        print(f"requested={version.name} error={type(exc).__name__}")
