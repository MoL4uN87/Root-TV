# IPTV for Seena webOS

## Goal

Replace the embedded NTV-PLUS pages with an IPTV section that plays public HLS streams directly in Seena and accepts a user-provided M3U or M3U8 playlist.

## User flow

The top menu contains `IPTV` instead of `ТВ-передачи`.

The IPTV screen initially shows verified public channels. Selecting a channel probes its HLS manifest through the local helper. When the manifest is playable, Seena opens its existing native video player. A failed probe leaves the user on the IPTV screen with a clear status message.

`Добавить плейлист` opens a dialog with a URL input. The existing Seena keyboard is used to enter a URL. Saving the URL downloads and parses the M3U through the loopback helper. The playlist URL is stored in `localStorage`; channels are reloaded when IPTV is opened.

## Data and security

The helper accepts only HTTPS playlist URLs, limits downloads to 2 MB, requires a `#EXTM3U` header, and permits at most 500 channel records. It returns names, safe logo URLs, group titles, and HTTPS HLS stream URLs. URLs containing credentials, ports, or local/private addresses are rejected.

The native player receives only a validated HTTPS `.m3u8` URL. No NTV-PLUS iframe, account, or credentials remain in the app.

## Built-in channels

The first release includes only sources verified on the LG TV:

- 360° Новости: `https://live-vgtrksmotrim.cdnvideo.ru/vgtrksmotrim/smotrim-live-03-srt.smil/playlist.m3u8`
- Астрахань 24: `https://streaming.astrakhan.ru/astrakhan24/playlist.m3u8`
- 5 минут тишины: `https://cdn-dvr.ntv.ru/5_minut_tishiny/index.m3u8`

The helper checks the selected manifest at playback time because live stream addresses and child playlists rotate.

## Components

- `helper/seena-iptv.js`: validates playlist and HLS URLs, parses M3U records, and probes a selected manifest.
- `helper/seena-kinozal-helper.js`: provides loopback `/iptv/playlist` and `/iptv/probe` routes using the existing hardened fetcher.
- `model.js`: validates helper responses before a stream reaches the player.
- `index.html`, `app.js`, and `styles.css`: IPTV screen, playlist dialog, cards, and removal of the NTV-PLUS iframe UI.

## Errors

Invalid playlist, invalid stream URL, oversized playlist, and a failed HLS probe show Russian user-facing messages. A broken third-party stream does not remove saved playlists or affect Kinozal, Sport, history, cache, or TorrServer.

## Verification

Unit tests cover URL validation, M3U parsing, channel limits, and HLS manifest recognition. The complete test suite and JavaScript syntax checks must pass. Installation verifies helper health and the application version. The built-in 360° Новости stream is probed on the TV after installation.
