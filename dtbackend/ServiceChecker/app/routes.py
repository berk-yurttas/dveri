from flask import Blueprint, current_app, jsonify, request

from app import db
from app.health import check_all_endpoints, check_endpoint
from app.models import ApiEndpoint

bp = Blueprint("main", __name__)


from flask import render_template_string

@bp.get("/")
def index():
    html_content = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Service Checker Admin</title>
        <style>
            body { font-family: -apple-system, sans-serif; padding: 2rem; background: #f9fafb; color: #111827; }
            table { width: 100%; border-collapse: collapse; margin-top: 1rem; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            th, td { border: 1px solid #e5e7eb; padding: 0.75rem; text-align: left; }
            th { background: #f3f4f6; }
            .up { color: #10b981; font-weight: bold; }
            .down { color: #ef4444; font-weight: bold; }
            .btn { cursor: pointer; padding: 0.5rem 1rem; border: none; background: #3b82f6; color: white; border-radius: 4px; }
            .btn:hover { background: #2563eb; }
            .form-card { background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 2rem; max-width: 600px;}
            input, select { padding: 0.5rem; margin: 0.5rem 0; width: 100%; box-sizing: border-box; border: 1px solid #d1d5db; border-radius: 4px; }
        </style>
    </head>
    <body>
        <h2>Service Checker Endpoints</h2>
        
        <div class="form-card">
            <h3>Add New Endpoint</h3>
            <form id="addForm">
                <label>Name</label>
                <input type="text" id="name" placeholder="e.g. My Service" required>
                
                <label>Frontend Feature URL (UI Binding)</label>
                <input type="url" id="url" placeholder="e.g. https://example.com" required>
                
                <label>API Health Check URL (Optional - Backend specific ping)</label>
                <input type="url" id="check_url" placeholder="e.g. https://api.example.com/health">
                
                <button type="submit" class="btn">Add Endpoint</button>
            </form>
        </div>

        <button class="btn" onclick="checkAllNow()">Force Check All Now</button>
        
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>UI URL</th>
                    <th>Check URL</th>
                    <th>Status</th>
                    <th>Avg Rsp (ms)</th>
                    <th>Last Checked</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody id="tableBody"></tbody>
        </table>

        <script>
            async function fetchEndpoints() {
                const res = await fetch('/api/endpoints');
                const data = await res.json();
                const tbody = document.getElementById('tableBody');
                tbody.innerHTML = '';
                data.forEach(ep => {
                    const statusClass = ep.is_up ? 'up' : (ep.is_up === false ? 'down' : '');
                    const statusText = ep.is_up ? 'UP' : (ep.is_up === false ? 'DOWN' : 'UNKNOWN');
                    tbody.innerHTML += `
                        <tr>
                            <td>${ep.id}</td>
                            <td>${ep.name}</td>
                            <td>${ep.url}</td>
                            <td>${ep.check_url || '-'}</td>
                            <td class="${statusClass}">${statusText}</td>
                            <td>${ep.avg_response_time_ms || '-'}</td>
                            <td>${ep.last_check_at ? new Date(ep.last_check_at).toLocaleString() : 'Never'}</td>
                            <td>
                                <button onclick="deleteEndpoint(${ep.id})" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Delete</button>
                            </td>
                        </tr>
                    `;
                });
            }

            document.getElementById('addForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                await fetch('/api/endpoints', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        name: document.getElementById('name').value,
                        url: document.getElementById('url').value,
                        check_url: document.getElementById('check_url').value || null
                    })
                });
                document.getElementById('addForm').reset();
                fetchEndpoints();
            });

            async function deleteEndpoint(id) {
                if(confirm('Are you sure?')) {
                    await fetch('/api/endpoints/' + id, {method: 'DELETE'});
                    fetchEndpoints();
                }
            }
            
            async function checkAllNow() {
                await fetch('/api/check-now', {method: 'POST'});
                fetchEndpoints();
            }

            fetchEndpoints();
        </script>
    </body>
    </html>
    """
    return render_template_string(html_content)


@bp.get("/api/endpoints")
def list_endpoints():
    rows = ApiEndpoint.query.order_by(ApiEndpoint.id).all()
    return jsonify([e.to_dict() for e in rows])


@bp.post("/api/endpoints")
def create_endpoint():
    data = request.get_json(silent=True) or {}
    name = data.get("name")
    url = data.get("url")
    if not name or not url:
        return jsonify({"error": "name and url are required"}), 400
    ep = ApiEndpoint(
        name=name.strip(),
        url=url.strip(),
        check_url=data.get("check_url").strip() if data.get("check_url") else None,
        http_method=(data.get("http_method") or "GET").upper(),
        is_active=bool(data.get("is_active", True)),
    )
    db.session.add(ep)
    db.session.commit()
    return jsonify(ep.to_dict()), 201


@bp.get("/api/endpoints/<int:ep_id>")
def get_endpoint(ep_id):
    ep = db.session.get(ApiEndpoint, ep_id)
    if not ep:
        return jsonify({"error": "not found"}), 404
    return jsonify(ep.to_dict())


@bp.patch("/api/endpoints/<int:ep_id>")
def update_endpoint(ep_id):
    ep = db.session.get(ApiEndpoint, ep_id)
    if not ep:
        return jsonify({"error": "not found"}), 404
    data = request.get_json(silent=True) or {}
    if "name" in data and data["name"]:
        ep.name = str(data["name"]).strip()
    if "url" in data and data["url"]:
        ep.url = str(data["url"]).strip()
    if "check_url" in data:
        ep.check_url = str(data["check_url"]).strip() if data["check_url"] else None
    if "http_method" in data:
        ep.http_method = str(data["http_method"] or "GET").upper()
    if "is_active" in data:
        ep.is_active = bool(data["is_active"])
    db.session.commit()
    return jsonify(ep.to_dict())


@bp.delete("/api/endpoints/<int:ep_id>")
def delete_endpoint(ep_id):
    ep = db.session.get(ApiEndpoint, ep_id)
    if not ep:
        return jsonify({"error": "not found"}), 404
    db.session.delete(ep)
    db.session.commit()
    return jsonify({"deleted": True, "id": ep_id})


@bp.post("/api/endpoints/<int:ep_id>/check")
def check_one_now(ep_id):
    ep = db.session.get(ApiEndpoint, ep_id)
    if not ep:
        return jsonify({"error": "not found"}), 404
    if not ep.is_active:
        return jsonify({"error": "endpoint is not active"}), 400
    timeout = current_app.config["REQUEST_TIMEOUT_SECONDS"]
    check_endpoint(ep, timeout)
    db.session.commit()
    return jsonify(ep.to_dict())


@bp.post("/api/check-now")
def check_now():
    """Run health checks immediately (all active endpoints)."""
    n = check_all_endpoints()
    return jsonify({"checked": n})
