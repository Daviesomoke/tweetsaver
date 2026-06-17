








import os
import re
import logging
from time import time
from collections import defaultdict

from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
import yt_dlp
import requests
from http.cookiejar import MozillaCookieJar

# ---------- App setup ----------
app = Flask(__name__, static_folder='.', static_url_path='')

# CORS: in production, restrict to your actual domain.
# Set the ALLOWED_ORIGIN env var on Render to e.g. https://www.tweetsaver.com
ALLOWED_ORIGIN = os.environ.get('ALLOWED_ORIGIN', '*')
CORS(app, origins=ALLOWED_ORIGIN)

# ---------- Logging ----------
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s'
)

# ---------- Configuration from environment ----------
COOKIE_FILE = os.environ.get('COOKIE_FILE', 'cookies.txt')
API_KEY = os.environ.get('API_KEY', '')        # optional — leave empty to disable
COOKIE_CONTENT = os.environ.get('COOKIE_CONTENT', '')

# If the cookie file doesn't exist but we have the content as an env var, write it.
if not os.path.exists(COOKIE_FILE) and COOKIE_CONTENT:
    with open(COOKIE_FILE, 'w', encoding='utf-8') as f:
        f.write(COOKIE_CONTENT)

# ---------- Rate limiting (in-memory) ----------
rate_limit_store = defaultdict(list)
RATE_LIMIT_WINDOW = 60   # seconds
MAX_REQUESTS = 10        # per window per IP


def is_rate_limited(ip: str) -> bool:
    now = time()
    cutoff = now - RATE_LIMIT_WINDOW
    rate_limit_store[ip] = [t for t in rate_limit_store[ip] if t > cutoff]
    if len(rate_limit_store[ip]) >= MAX_REQUESTS:
        return True
    rate_limit_store[ip].append(now)
    return False


def extract_tweet_id(url: str) -> str | None:
    match = re.search(r'/status/(\d+)', url)
    return match.group(1) if match else None


def load_cookies():
    """Load Netscape cookies into a requests Session for proxy downloads."""
    session = requests.Session()
    if os.path.exists(COOKIE_FILE):
        cj = MozillaCookieJar(COOKIE_FILE)
        cj.load(ignore_discard=True, ignore_expires=True)
        session.cookies.update(cj)
    return session


def _extract_media_list(info: dict) -> list[dict]:
    """Shared formatting logic so list+download stay consistent."""
    media_list = []
    if 'formats' in info:
        for f in info['formats']:
            if f.get('vcodec') != 'none' or f.get('acodec') != 'none':
                quality = f.get('height') or f.get('format_note') or 'unknown'
                media_list.append({
                    'quality': f'{quality}p' if str(quality).isdigit() else str(quality),
                    'url': f['url'],
                    'type': 'video' if f.get('vcodec') != 'none' else 'audio',
                })
    elif 'thumbnail' in info:   # image-only post
        media_list.append({
            'quality': 'original',
            'url': info['thumbnail'],
            'type': 'image',
        })
    return media_list


def resolve_tweet(url: str) -> dict:
    """Run yt-dlp against a tweet URL and return the raw info dict (one fresh
       extraction = one fresh set of signed CDN URLs)."""
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'cookiefile': COOKIE_FILE,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        if 'entries' in info:       # playlist — take first item
            info = info['entries'][0]
        return info


def fetch_media_info_real(url: str) -> dict:
    """Use yt-dlp with an authenticated cookies file."""
    info = resolve_tweet(url)
    media_list = _extract_media_list(info)
    return {
        'tweet_id': info.get('id') or extract_tweet_id(url),
        'thumbnail': info.get('thumbnail', ''),
        'media': media_list,
    }


def fetch_media_info_demo(url: str) -> dict:
    """Fallback demo response when no cookies are available."""
    tweet_id = extract_tweet_id(url)
    if not tweet_id:
        raise ValueError("Invalid tweet URL")
    return {
        'tweet_id': tweet_id,
        'thumbnail': 'https://placehold.co/480x270/1a1a1a/ffffff?text=Demo+Preview',
        'media': [
            {'quality': '1080p', 'url': 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4', 'type': 'video'},
            {'quality': '720p',  'url': 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4', 'type': 'video'},
            {'quality': '480p',  'url': 'https://sample-videos.com/video321/mp4/480/big_buck_bunny_480p_1mb.mp4', 'type': 'video'},
        ],
    }


# ---------- Routes ----------

@app.route('/')
def index():
    return app.send_static_file('index.html')


@app.route('/<path:path>')
def static_files(path):
    return app.send_static_file(path)


@app.route('/api/download', methods=['POST'])
def download():
    # Optional API key guard (only enforced when API_KEY env var is set)
    if API_KEY and request.headers.get('X-API-Key') != API_KEY:
        return jsonify({'error': 'Forbidden'}), 403

    # Rate limiting
    client_ip = request.headers.get('X-Forwarded-For', request.remote_addr).split(',')[0].strip()
    if is_rate_limited(client_ip):
        return jsonify({'error': 'Too many requests. Please wait a minute.'}), 429

    data = request.get_json(silent=True)
    if not data or 'url' not in data:
        return jsonify({'error': "Missing 'url' in request body"}), 400

    url = data['url'].strip()
    if not re.match(r'^https?://(www\.)?(twitter\.com|x\.com)/', url):
        return jsonify({'error': 'Invalid X / Twitter URL'}), 400

    try:
        if os.path.exists(COOKIE_FILE) and os.path.getsize(COOKIE_FILE) > 0:
            media_info = fetch_media_info_real(url)
        else:
            app.logger.info('No cookies found — returning demo response')
            media_info = fetch_media_info_demo(url)
        return jsonify(media_info)
    except Exception as e:
        app.logger.error('Download error: %s', e)
        return jsonify({'error': 'Could not retrieve media. Please try again later.'}), 500


def _stream_from_cdn(session, cdn_url: str, filename: str):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://twitter.com/',
    }
    resp = session.get(cdn_url, headers=headers, stream=True, timeout=30)
    resp.raise_for_status()

    cd = resp.headers.get('Content-Disposition', '')
    if 'filename=' in cd:
        import re as regex
        fname = regex.findall('filename="?([^"]+)"?', cd)
        if fname:
            filename = fname[0]

    def generate():
        for chunk in resp.iter_content(chunk_size=8192):
            if chunk:
                yield chunk

    return Response(
        stream_with_context(generate()),
        headers={
            'Content-Disposition': f'attachment; filename="{filename}"',
            'Content-Type': resp.headers.get('Content-Type', 'application/octet-stream'),
        }
    )


@app.route('/api/proxy_download')
def proxy_download():
    """Stream a video through the server using cookies, so the browser never touches
       video.twimg.com directly.

       IMPORTANT: Twitter's CDN URLs are short-lived signed URLs. If the browser
       held onto a URL from an earlier /api/download call (e.g. user pasted several
       tweet links before clicking Download on any of them), that URL may have
       already expired by the time this route is hit. To make downloads reliable
       regardless of how much time has passed or how many tweets were queued up,
       this route re-resolves the ORIGINAL tweet URL fresh via yt-dlp whenever it's
       provided, and only falls back to the (possibly stale) raw CDN url otherwise.
    """
    tweet_url = request.args.get('tweet_url')
    quality = request.args.get('quality')
    video_url = request.args.get('video_url')
    filename = request.args.get('filename', 'twitter_video.mp4')

    if not tweet_url and not video_url:
        return jsonify({'error': 'Missing tweet_url or video_url parameter'}), 400

    try:
        session = load_cookies()

        if tweet_url:
            # Fresh extraction = fresh signed CDN URL, every single time.
            info = resolve_tweet(tweet_url)
            media_list = _extract_media_list(info)
            if not media_list:
                return jsonify({'error': 'No downloadable media found in this tweet.'}), 404

            chosen = None
            if quality:
                chosen = next((m for m in media_list if m['quality'] == quality), None)
            if not chosen:
                # Best-effort: highest quality video, else first item
                videos = [m for m in media_list if m['type'] == 'video']
                chosen = (videos or media_list)[0]

            return _stream_from_cdn(session, chosen['url'], filename)

        # Fallback path: no tweet_url provided (e.g. older cached frontend) —
        # try the raw URL directly, accepting it may have expired.
        return _stream_from_cdn(session, video_url, filename)

    except Exception as e:
        app.logger.error('Proxy error: %s', e)
        return jsonify({'error': 'Failed to download video. The link may have expired — please paste the tweet link again.'}), 500


# ---------- Health check (useful for Render) ----------
@app.route('/health')
def health():
    return jsonify({'status': 'ok'}), 200


# ---------- Dev server (do NOT use in production) ----------
if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5000)