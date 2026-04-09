#!/usr/bin/env python3
"""
Concurrent Load Testing Script
- Tests DB Connection Pool bottlenecks
- Tests Uvicorn Worker concurrent processing capability
"""

import asyncio
import aiohttp
import time
import statistics
from dataclasses import dataclass, field
from typing import List, Dict, Any
from datetime import datetime
import json

# ============================================================
# Configuration
# ============================================================
BASE_URL = "http://localhost:8000"
API_KEY = "<YOUR_API_KEY>"
HEADERS = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

# ============================================================
# Result Storage
# ============================================================
@dataclass
class TestResult:
    endpoint: str
    method: str
    status: int
    response_time_ms: float
    success: bool
    error: str = ""

@dataclass
class TestSummary:
    total_requests: int = 0
    successful: int = 0
    failed: int = 0
    response_times: List[float] = field(default_factory=list)
    errors: Dict[str, int] = field(default_factory=dict)
    
    def add_result(self, result: TestResult):
        self.total_requests += 1
        self.response_times.append(result.response_time_ms)
        if result.success:
            self.successful += 1
        else:
            self.failed += 1
            self.errors[result.error] = self.errors.get(result.error, 0) + 1
    
    def print_summary(self):
        print("\n" + "="*60)
        print("📊 Test Results Summary")
        print("="*60)
        print(f"Total Requests: {self.total_requests}")
        print(f"✅ Successful: {self.successful} ({self.successful/self.total_requests*100:.1f}%)")
        print(f"❌ Failed: {self.failed} ({self.failed/self.total_requests*100:.1f}%)")
        
        if self.response_times:
            print(f"\n⏱️  Response Times:")
            print(f"   Average: {statistics.mean(self.response_times):.2f}ms")
            print(f"   Median: {statistics.median(self.response_times):.2f}ms")
            print(f"   Min: {min(self.response_times):.2f}ms")
            print(f"   Max: {max(self.response_times):.2f}ms")
            if len(self.response_times) > 1:
                print(f"   Std Dev: {statistics.stdev(self.response_times):.2f}ms")
            
            # P95, P99
            sorted_times = sorted(self.response_times)
            p95_idx = int(len(sorted_times) * 0.95)
            p99_idx = int(len(sorted_times) * 0.99)
            print(f"   P95: {sorted_times[p95_idx]:.2f}ms")
            print(f"   P99: {sorted_times[p99_idx]:.2f}ms")
        
        if self.errors:
            print(f"\n🚨 Error Distribution:")
            for error, count in self.errors.items():
                print(f"   {error}: {count} occurrences")

# ============================================================
# API Request Functions
# ============================================================
async def make_request(
    session: aiohttp.ClientSession,
    method: str,
    endpoint: str,
    data: Dict = None,
    summary: TestSummary = None
) -> TestResult:
    """Execute a single API request"""
    url = f"{BASE_URL}{endpoint}"
    start_time = time.perf_counter()
    
    try:
        if method == "GET":
            async with session.get(url, headers=HEADERS) as resp:
                status = resp.status
                await resp.text()
        elif method == "POST":
            async with session.post(url, headers=HEADERS, json=data) as resp:
                status = resp.status
                await resp.text()
        elif method == "PUT":
            async with session.put(url, headers=HEADERS, json=data) as resp:
                status = resp.status
                await resp.text()
        
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        success = 200 <= status < 300
        
        result = TestResult(
            endpoint=endpoint,
            method=method,
            status=status,
            response_time_ms=elapsed_ms,
            success=success,
            error="" if success else f"HTTP {status}"
        )
        
    except asyncio.TimeoutError:
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        result = TestResult(
            endpoint=endpoint,
            method=method,
            status=0,
            response_time_ms=elapsed_ms,
            success=False,
            error="Timeout"
        )
    except Exception as e:
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        result = TestResult(
            endpoint=endpoint,
            method=method,
            status=0,
            response_time_ms=elapsed_ms,
            success=False,
            error=str(type(e).__name__)
        )
    
    if summary:
        summary.add_result(result)
    
    return result

# ============================================================
# Test Scenarios
# ============================================================

async def test_health_check(session, summary):
    """Health check test"""
    return await make_request(session, "GET", "/health", summary=summary)

async def test_get_doctor_files(session, summary):
    """Get doctor file list"""
    return await make_request(session, "GET", "/api/doctor/files", summary=summary)

async def test_get_patient_files(session, summary):
    """Get patient file list"""
    return await make_request(session, "GET", "/api/patient/files", summary=summary)

async def test_get_sentences(session, summary):
    """Get sentences (DB intensive)"""
    return await make_request(
        session, "GET", 
        "/api/doctor/sentences/quality-coded-nlp-pilot-sid-1.xlsx/Interviewer:",
        summary=summary
    )

async def test_get_rewrites(session, summary):
    """Get rewrite history"""
    return await make_request(session, "GET", "/api/doctor/rewrites", summary=summary)

async def test_get_score_average(session, summary):
    """Get score average (aggregation query)"""
    return await make_request(session, "GET", "/api/doctor/scores/average", summary=summary)

async def test_get_summaries(session, summary):
    """Get patient summaries"""
    return await make_request(session, "GET", "/api/patient/summaries", summary=summary)

async def test_get_class_distribution(session, summary):
    """Get class distribution"""
    return await make_request(session, "GET", "/api/doctor/class-distribution", summary=summary)

async def test_dashboard_stats(session, summary):
    """Get dashboard statistics (complex aggregation)"""
    return await make_request(session, "GET", "/api/stats/dashboard", summary=summary)

async def test_survey_stats(session, summary):
    """Get survey statistics"""
    return await make_request(session, "GET", "/api/surveys/stats", summary=summary)

async def test_post_survey(session, summary, patient_id: int):
    """Submit survey (POST)"""
    data = {
        "survey_type": "sdm",
        "file": f"test_load_{patient_id}.txt",
        "speaker": f"LOAD_TEST_PATIENT_{patient_id}",
        "answers": {
            "q1": "1",
            "q2": "2", 
            "q3": "3",
            "q4": "1"
        }
    }
    return await make_request(session, "POST", "/api/surveys/submit", data=data, summary=summary)

async def test_ai_rewrite(session, summary):
    """AI Rewrite request (includes external API call, slow)"""
    data = {
        "sentence": "The cancer might spread.",
        "class_": "1",
        "target_score": 5
    }
    return await make_request(session, "POST", "/api/doctor/ai-rewrite", data=data, summary=summary)

# ============================================================
# Load Test Runner
# ============================================================

async def run_concurrent_test(
    test_name: str,
    test_func,
    concurrent_users: int,
    requests_per_user: int = 1,
    timeout_seconds: int = 30
):
    """Execute concurrent user test"""
    print(f"\n{'='*60}")
    print(f"🚀 Test: {test_name}")
    print(f"   Concurrent Users: {concurrent_users}")
    print(f"   Requests per User: {requests_per_user}")
    print(f"   Total Requests: {concurrent_users * requests_per_user}")
    print("="*60)
    
    summary = TestSummary()
    
    timeout = aiohttp.ClientTimeout(total=timeout_seconds)
    connector = aiohttp.TCPConnector(limit=0)  # No connection limit
    
    async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
        start_time = time.perf_counter()
        
        # Create all requests simultaneously
        tasks = []
        for user_id in range(concurrent_users):
            for _ in range(requests_per_user):
                if "patient_id" in test_func.__code__.co_varnames:
                    tasks.append(test_func(session, summary, user_id))
                else:
                    tasks.append(test_func(session, summary))
        
        # Execute concurrently
        await asyncio.gather(*tasks, return_exceptions=True)
        
        total_time = time.perf_counter() - start_time
    
    summary.print_summary()
    print(f"\n⏱️  Total Duration: {total_time:.2f}s")
    print(f"📈 Throughput: {summary.total_requests / total_time:.2f} req/sec")
    
    return summary

async def run_mixed_workload(concurrent_users: int, duration_seconds: int = 30):
    """Simulate real usage patterns"""
    print(f"\n{'='*60}")
    print(f"🔀 Mixed Workload Test")
    print(f"   Concurrent Users: {concurrent_users}")
    print(f"   Duration: {duration_seconds}s")
    print("="*60)
    
    summary = TestSummary()
    
    # Request patterns matching real usage
    request_patterns = [
        (test_get_doctor_files, 20),      # 20% - File list
        (test_get_sentences, 25),          # 25% - Sentence queries
        (test_get_score_average, 15),      # 15% - Score queries
        (test_get_summaries, 15),          # 15% - Summary queries
        (test_dashboard_stats, 10),        # 10% - Dashboard
        (test_get_class_distribution, 10), # 10% - Class distribution
        (test_health_check, 5),            # 5% - Health check
    ]
    
    timeout = aiohttp.ClientTimeout(total=60)
    connector = aiohttp.TCPConnector(limit=0)
    
    async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
        start_time = time.perf_counter()
        
        async def user_session(user_id: int):
            """Simulate a single user session"""
            import random
            while time.perf_counter() - start_time < duration_seconds:
                # Random selection based on weights
                funcs, weights = zip(*request_patterns)
                test_func = random.choices(funcs, weights=weights)[0]
                await test_func(session, summary)
                # Add realistic delay like a real user
                await asyncio.sleep(random.uniform(0.1, 0.5))
        
        # Run all users concurrently
        await asyncio.gather(*[user_session(i) for i in range(concurrent_users)])
        
        total_time = time.perf_counter() - start_time
    
    summary.print_summary()
    print(f"\n⏱️  Total Duration: {total_time:.2f}s")
    print(f"📈 Throughput: {summary.total_requests / total_time:.2f} req/sec")
    
    return summary

async def run_db_stress_test(concurrent_connections: int):
    """DB Connection Pool stress test"""
    print(f"\n{'='*60}")
    print(f"🗄️  DB Connection Pool Stress Test")
    print(f"   Concurrent DB Requests: {concurrent_connections}")
    print(f"   (Current Pool: POOL_SIZE=10, MAX_OVERFLOW=20, Total=30)")
    print("="*60)
    
    summary = TestSummary()
    
    # DB-intensive requests
    db_heavy_tests = [
        test_get_sentences,
        test_get_score_average,
        test_dashboard_stats,
        test_get_class_distribution,
    ]
    
    timeout = aiohttp.ClientTimeout(total=60)
    connector = aiohttp.TCPConnector(limit=0)
    
    async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
        start_time = time.perf_counter()
        
        tasks = []
        for i in range(concurrent_connections):
            test_func = db_heavy_tests[i % len(db_heavy_tests)]
            tasks.append(test_func(session, summary))
        
        await asyncio.gather(*tasks, return_exceptions=True)
        
        total_time = time.perf_counter() - start_time
    
    summary.print_summary()
    print(f"\n⏱️  Total Duration: {total_time:.2f}s")
    
    # Analysis
    if summary.failed > 0:
        print(f"\n⚠️  Warning: {summary.failed} out of {concurrent_connections} concurrent requests failed")
        print("   → High probability of DB Connection Pool bottleneck")
    else:
        print(f"\n✅ All {concurrent_connections} concurrent DB requests succeeded")
    
    return summary

# ============================================================
# Main Execution
# ============================================================

async def main():
    print("="*60)
    print("🧪 FastAPI + Gunicorn + UvicornWorker Load Test")
    print("="*60)
    print(f"Target Server: {BASE_URL}")
    print(f"Start Time: {datetime.now().isoformat()}")
    
    # 1. Server status check
    print("\n📡 Checking server connection...")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{BASE_URL}/health", headers=HEADERS) as resp:
                if resp.status == 200:
                    print("✅ Server is running normally")
                else:
                    print(f"⚠️  Server response: {resp.status}")
                    return
    except Exception as e:
        print(f"❌ Server connection failed: {e}")
        return
    
    # 2. Step-by-step tests
    test_results = []
    
    # 2-1. Lightweight concurrent request test
    result = await run_concurrent_test(
        "Health Check Concurrent Requests",
        test_health_check,
        concurrent_users=50,
        requests_per_user=1
    )
    test_results.append(("Health Check x50", result))
    
    # 2-2. DB read test (gradual increase)
    for users in [10, 30, 50, 100]:
        result = await run_concurrent_test(
            f"File List Query ({users} concurrent users)",
            test_get_doctor_files,
            concurrent_users=users
        )
        test_results.append((f"Files x{users}", result))
    
    # 2-3. DB Connection Pool stress test
    for connections in [20, 30, 40, 50]:
        result = await run_db_stress_test(connections)
        test_results.append((f"DB Stress x{connections}", result))
    
    # 2-4. Mixed Workload test
    result = await run_mixed_workload(
        concurrent_users=30,
        duration_seconds=15
    )
    test_results.append(("Mixed Workload", result))
    
    # 3. Final report
    print("\n" + "="*60)
    print("📋 Final Test Report")
    print("="*60)
    print(f"{'Test':<25} {'Success%':>10} {'Avg(ms)':>10} {'P95(ms)':>10}")
    print("-"*60)
    
    for name, result in test_results:
        success_rate = result.successful / result.total_requests * 100 if result.total_requests > 0 else 0
        avg_time = statistics.mean(result.response_times) if result.response_times else 0
        sorted_times = sorted(result.response_times) if result.response_times else [0]
        p95 = sorted_times[int(len(sorted_times) * 0.95)] if sorted_times else 0
        
        status = "✅" if success_rate == 100 else "⚠️" if success_rate > 90 else "❌"
        print(f"{status} {name:<23} {success_rate:>9.1f}% {avg_time:>10.1f} {p95:>10.1f}")
    
    print("\n" + "="*60)
    print(f"Completion Time: {datetime.now().isoformat()}")

if __name__ == "__main__":
    asyncio.run(main())