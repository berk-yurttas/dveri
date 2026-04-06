import time
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

import urllib3
import requests
from flask import current_app
from requests import RequestException

from app import db
from app.models import ApiEndpoint


def _is_success_status(code: int) -> bool:
    return 200 <= code < 300


def check_endpoint(endpoint: ApiEndpoint, timeout_seconds: int) -> None:
    method = (endpoint.http_method or "GET").upper()
    start = time.perf_counter()
    status_code = None
    ok = False
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        
        # Suppress insecure request warnings due to verify=False
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        
        
        target_url = endpoint.check_url if getattr(endpoint, 'check_url', None) else endpoint.url
        resp = requests.request(
            method,
            target_url, 
            headers=headers, 
            timeout=timeout_seconds,
            allow_redirects=True,
            verify=False,  # Bypass corporate SSL proxy interception
        )
        status_code = resp.status_code
        ok = _is_success_status(status_code)
    except RequestException as e:
        error_msg = str(e)
        # Provide helpful hint for localhost connection issues
        if "localhost" in endpoint.url.lower() and ("Connection refused" in error_msg or "Failed to establish" in error_msg):
            current_app.logger.error(
                f"Health check failed for {endpoint.url}: {e} "
                f"(Note: If running in Docker, use 'host.docker.internal' instead of 'localhost')"
            )
        else:
            current_app.logger.error(f"Health check failed for {endpoint.url}: {e}")
        ok = False
    elapsed_ms = (time.perf_counter() - start) * 1000.0

    n = endpoint.total_checks + 1
    endpoint.total_checks = n
    if ok:
        endpoint.successful_checks += 1

    if endpoint.avg_response_time_ms is None:
        endpoint.avg_response_time_ms = elapsed_ms
    else:
        endpoint.avg_response_time_ms = (
            endpoint.avg_response_time_ms * (n - 1) + elapsed_ms
        ) / n

    endpoint.is_up = ok
    endpoint.last_response_time_ms = round(elapsed_ms, 2)
    endpoint.last_check_at = datetime.now(timezone.utc)


def check_all_endpoints() -> int:
    """Check all active endpoints concurrently for faster execution."""
    timeout = current_app.config["REQUEST_TIMEOUT_SECONDS"]
    endpoints = ApiEndpoint.query.filter_by(is_active=True).all()
    
    if not endpoints:
        return 0
    
    start_time = time.perf_counter()
    current_app.logger.info(f"Starting health checks for {len(endpoints)} endpoints...")
    
    # Get the Flask app context to pass to threads
    app = current_app._get_current_object()
    
    def check_endpoint_with_context(endpoint):
        """Wrapper to run check_endpoint with Flask app context."""
        with app.app_context():
            check_endpoint(endpoint, timeout)
    
    # Use ThreadPoolExecutor for concurrent checks (max 10 threads to avoid overwhelming)
    max_workers = min(10, len(endpoints))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all check tasks
        future_to_endpoint = {
            executor.submit(check_endpoint_with_context, ep): ep 
            for ep in endpoints
        }
        
        # Wait for all to complete
        completed = 0
        for future in as_completed(future_to_endpoint):
            ep = future_to_endpoint[future]
            try:
                future.result()
                completed += 1
            except Exception as e:
                current_app.logger.error(f"Exception checking endpoint {ep.url}: {e}")
                completed += 1
    
    # Commit all changes at once
    db.session.commit()
    
    elapsed = time.perf_counter() - start_time
    current_app.logger.info(
        f"Completed {completed}/{len(endpoints)} health checks in {elapsed:.2f}s"
    )
    
    return len(endpoints)
