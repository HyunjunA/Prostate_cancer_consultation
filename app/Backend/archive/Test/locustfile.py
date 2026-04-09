"""
Locust-based Professional Load Testing
Run: locust -f locustfile.py --host=http://localhost:8000
Web UI: http://localhost:8089
"""

from locust import HttpUser, task, between, events
from locust.runners import MasterRunner
import random
import json
import time

# API Key
API_KEY = "<YOUR_API_KEY>"
HEADERS = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

# Test file/patient data
TEST_FILES = [
    "quality-coded-nlp-pilot-sid-1.xlsx",
    "quality-coded-nlp-pilot-sid-4.xlsx",
    "quality-coded-nlp-pilot-sid-5.xlsx",
]

SPEAKERS = [
    "Interviewer:",
    "Patient_quality-coded-nlp-pilot-sid-1",
]

# ============================================================
# Doctor Interface User
# ============================================================
class DoctorUser(HttpUser):
    """Doctor user simulation"""
    
    weight = 3  # Doctor:Patient ratio = 3:7
    wait_time = between(1, 3)  # 1-3 second wait
    
    def on_start(self):
        """On session start"""
        self.file = random.choice(TEST_FILES)
        self.speaker = "Interviewer:"
    
    @task(10)
    def get_files(self):
        """Get file list (frequently called)"""
        self.client.get("/api/doctor/files", headers=HEADERS, name="/api/doctor/files")
    
    @task(8)
    def get_sentences(self):
        """Get sentences (DB intensive)"""
        self.client.get(
            f"/api/doctor/sentences/{self.file}/{self.speaker}",
            headers=HEADERS,
            name="/api/doctor/sentences/[file]/[speaker]"
        )
    
    @task(5)
    def get_rewrites(self):
        """Get rewrite history"""
        self.client.get(
            f"/api/doctor/rewrites?file={self.file}&speaker={self.speaker}",
            headers=HEADERS,
            name="/api/doctor/rewrites"
        )
    
    @task(5)
    def get_score_average(self):
        """Get score average"""
        self.client.get(
            f"/api/doctor/scores/average?file={self.file}",
            headers=HEADERS,
            name="/api/doctor/scores/average"
        )
    
    @task(3)
    def get_score_summary(self):
        """Get score summary"""
        self.client.get(
            f"/api/doctor/scores/summary/{self.file}/{self.speaker}",
            headers=HEADERS,
            name="/api/doctor/scores/summary/[file]/[speaker]"
        )
    
    @task(3)
    def get_class_distribution(self):
        """Get class distribution"""
        self.client.get(
            f"/api/doctor/class-distribution/{self.file}",
            headers=HEADERS,
            name="/api/doctor/class-distribution/[file]"
        )
    
    @task(2)
    def get_improvement_suggestions(self):
        """Get improvement suggestions"""
        class_id = random.randint(1, 5)
        self.client.get(
            f"/api/doctor/improvement-suggestions/{class_id}",
            headers=HEADERS,
            name="/api/doctor/improvement-suggestions/[class]"
        )
    
    @task(1)
    def submit_rewrite(self):
        """Submit rewrite (write operation)"""
        data = {
            "file": self.file,
            "i": random.randint(0, 50),
            "i2": random.randint(1, 5),
            "speaker": self.speaker,
            "time": "2025-01-15T10:30:00",
            "original_sentence": "Test original sentence",
            "revised_sentence": "Test revised sentence",
            "score": random.randint(1, 5),
            "class_": str(random.randint(1, 5)),
            "selected": True
        }
        self.client.put(
            "/api/doctor/rewrites",
            headers=HEADERS,
            json=data,
            name="/api/doctor/rewrites [PUT]"
        )


# ============================================================
# Patient Interface User
# ============================================================
class PatientUser(HttpUser):
    """Patient user simulation"""
    
    weight = 7  # Doctor:Patient ratio = 3:7
    wait_time = between(2, 5)  # Patients browse more slowly
    
    def on_start(self):
        """On session start"""
        self.patient_id = f"LOAD_TEST_PATIENT_{random.randint(1000, 9999)}"
        self.file = random.choice(TEST_FILES)
    
    @task(10)
    def get_files(self):
        """Get file list"""
        self.client.get("/api/patient/files", headers=HEADERS, name="/api/patient/files")
    
    @task(8)
    def get_summaries(self):
        """Get summaries"""
        self.client.get("/api/patient/summaries", headers=HEADERS, name="/api/patient/summaries")
    
    @task(5)
    def get_summary_detail(self):
        """Get detailed summary"""
        speaker = f"Patient_{self.file.replace('.xlsx', '')}"
        self.client.get(
            f"/api/patient/summaries/{self.file}/{speaker}",
            headers=HEADERS,
            name="/api/patient/summaries/[file]/[speaker]"
        )
    
    @task(3)
    def get_responses(self):
        """Get responses"""
        self.client.get(
            "/api/patient/responses",
            headers=HEADERS,
            name="/api/patient/responses"
        )
    
    @task(2)
    def submit_sdm_survey(self):
        """Submit SDM survey"""
        data = {
            "survey_type": "sdm",
            "file": f"load_test_{self.patient_id}.txt",
            "speaker": self.patient_id,
            "answers": {
                "q1": str(random.randint(1, 5)),
                "q2": str(random.randint(1, 5)),
                "q3": str(random.randint(1, 5)),
                "q4": str(random.randint(1, 5))
            }
        }
        self.client.post(
            "/api/surveys/submit",
            headers=HEADERS,
            json=data,
            name="/api/surveys/submit [SDM]"
        )
    
    @task(2)
    def submit_dcs_survey(self):
        """Submit DCS survey"""
        data = {
            "survey_type": "dcs",
            "file": f"load_test_{self.patient_id}.txt",
            "speaker": self.patient_id,
            "answers": {f"q{i}": str(random.randint(0, 4)) for i in range(1, 17)}
        }
        self.client.post(
            "/api/surveys/submit",
            headers=HEADERS,
            json=data,
            name="/api/surveys/submit [DCS]"
        )
    
    @task(1)
    def submit_satisfaction(self):
        """Submit satisfaction survey"""
        data = {
            "survey_type": "satisfaction",
            "file": f"load_test_{self.patient_id}.txt",
            "speaker": self.patient_id,
            "answers": {
                "feedbackText": "Load test feedback " + str(random.randint(1, 1000))
            }
        }
        self.client.post(
            "/api/surveys/submit",
            headers=HEADERS,
            json=data,
            name="/api/surveys/submit [Satisfaction]"
        )


# ============================================================
# Dashboard/Statistics User (Admin)
# ============================================================
class AdminUser(HttpUser):
    """Admin/statistics query simulation"""
    
    weight = 1  # Minority
    wait_time = between(5, 10)  # Less frequent requests
    
    @task(5)
    def get_dashboard_stats(self):
        """Get dashboard statistics (complex aggregation)"""
        self.client.get(
            "/api/stats/dashboard",
            headers=HEADERS,
            name="/api/stats/dashboard"
        )
    
    @task(3)
    def get_survey_stats(self):
        """Get survey statistics"""
        self.client.get(
            "/api/surveys/stats",
            headers=HEADERS,
            name="/api/surveys/stats"
        )
    
    @task(3)
    def get_survey_submissions(self):
        """Get survey submission list"""
        self.client.get(
            "/api/surveys/submissions?page=1&size=50",
            headers=HEADERS,
            name="/api/surveys/submissions"
        )
    
    @task(2)
    def get_all_rewrites(self):
        """Get all rewrite history"""
        self.client.get(
            "/api/doctor/rewrites?skip=0&limit=100",
            headers=HEADERS,
            name="/api/doctor/rewrites [all]"
        )
    
    @task(1)
    def health_check(self):
        """Health check"""
        self.client.get("/health", headers=HEADERS, name="/health")


# ============================================================
# Event Handlers (Statistics Collection)
# ============================================================
@events.request.add_listener
def on_request(request_type, name, response_time, response_length, response, context, exception, **kwargs):
    """Per-request detailed logging (optional)"""
    if exception:
        print(f"❌ {request_type} {name}: {exception}")
    elif response.status_code >= 400:
        print(f"⚠️  {request_type} {name}: HTTP {response.status_code}")


@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """On test start"""
    print("="*60)
    print("🚀 Load Test Started")
    print("="*60)
    print(f"Target: {environment.host}")
    print(f"User Classes: DoctorUser, PatientUser, AdminUser")
    print(f"Ratio: Doctors 30%, Patients 70%, Admin ~10%")
    print("="*60)


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """On test stop"""
    print("\n" + "="*60)
    print("🏁 Load Test Completed")
    print("="*60)

