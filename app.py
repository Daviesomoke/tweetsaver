






import os
import re
import logging
from time import time
from collections import defaultdict

from flask import Flask, request, jsonify
from flask_cors import CORS
import yt_dlp

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
# This is how you supply cookies.txt on Render without uploading the file to GitHub.
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


def fetch_media_info_real(url: str) -> dict:
    """Use yt-dlp with an authenticated cookies file."""
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'cookiefile': COOKIE_FILE,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        if 'entries' in info:       # playlist — take first item
            info = info['entries'][0]

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


# ---------- Health check (useful for Render) ----------
@app.route('/health')
def health():
    return jsonify({'status': 'ok'}), 200


# ---------- Dev server (do NOT use in production) ----------
if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5000)