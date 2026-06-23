import os
import re
import html
import urllib.request
import xml.etree.ElementTree as ET
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
CACHE_FILE = "release_notes_cache.xml"

def strip_html(html_str):
    """Strip HTML tags and unescape entities to produce plain text."""
    if not html_str:
        return ""
    # Replace common HTML block tags with spaces to keep words separated
    text = re.sub(r'</?(p|li|h1|h2|h3|div|ul|ol)[^>]*>', ' ', html_str)
    # Strip remaining HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    # Unescape HTML entities
    text = html.unescape(text)
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def parse_entry_content(content_html):
    """Split an entry's HTML content by <h3> headers into individual updates."""
    if not content_html:
        return []
    
    # Split by h3 tags: e.g. <h3>Feature</h3> ... content ... <h3>Issue</h3> ... content
    parts = re.split(r'(?i)<h3[^>]*>(.*?)</h3>', content_html)
    updates = []
    
    # The first element before any h3 tag is the preamble
    preamble = parts[0].strip()
    if preamble:
        clean_preamble = strip_html(preamble)
        if clean_preamble:
            updates.append({
                "type": "General",
                "html": preamble,
                "text": clean_preamble
            })
            
    # Iterate through pairs of (header, body)
    for i in range(1, len(parts), 2):
        header = parts[i].strip()
        body = parts[i+1].strip() if i+1 < len(parts) else ""
        clean_body = strip_html(body)
        updates.append({
            "type": header,
            "html": body,
            "text": clean_body
        })
        
    return updates

def fetch_feed_xml(force_refresh=False):
    """Fetch BQ release notes XML. Uses a local cache file to speed up loads."""
    if not force_refresh and os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return f.read()
        except Exception:
            pass # Fall back to network fetch if cache read fails
            
    try:
        # Fetch with a standard User-Agent to prevent bot-blocking issues
        req = urllib.request.Request(
            FEED_URL, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ReleaseNotesTracker/1.0'}
        )
        with urllib.request.urlopen(req) as response:
            xml_data = response.read().decode("utf-8")
            
        # Write to cache
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            f.write(xml_data)
            
        return xml_data
    except Exception as e:
        # If network fails but cache exists, return cache as backup
        if os.path.exists(CACHE_FILE):
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return f.read()
        raise e

def get_release_notes(force_refresh=False):
    """Parse the XML and return a list of structured updates."""
    xml_data = fetch_feed_xml(force_refresh)
    root = ET.fromstring(xml_data)
    
    # Namespaces
    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    
    entries = root.findall('atom:entry', ns)
    all_updates = []
    
    for entry_idx, entry in enumerate(entries):
        title = entry.find('atom:title', ns).text  # Usually the date (e.g. "June 22, 2026")
        updated = entry.find('atom:updated', ns).text
        link = ""
        link_elem = entry.find('atom:link[@rel="alternate"]', ns)
        if link_elem is not None:
            link = link_elem.attrib.get('href', '')
        else:
            # Fallback to any link
            link_elem = entry.find('atom:link', ns)
            if link_elem is not None:
                link = link_elem.attrib.get('href', '')
                
        content_elem = entry.find('atom:content', ns)
        content_html = content_elem.text if content_elem is not None else ""
        
        # Split single entry HTML into individual update items
        parsed_updates = parse_entry_content(content_html)
        
        for update_idx, update in enumerate(parsed_updates):
            unique_id = f"note_{entry_idx}_{update_idx}"
            all_updates.append({
                "id": unique_id,
                "date": title,
                "updated_timestamp": updated,
                "link": link,
                "type": update["type"],
                "html": update["html"],
                "text": update["text"]
            })
            
    return all_updates

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/releases")
def api_releases():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    try:
        notes = get_release_notes(force_refresh=force_refresh)
        return jsonify({
            "status": "success",
            "count": len(notes),
            "data": notes
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
