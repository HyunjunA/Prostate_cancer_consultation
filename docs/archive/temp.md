모든 정의된 api endpoint들은 http://localhost:8000/docs#/ 참고하기

<!-- Patient Interface로 접속 -->

http://localhost:3000/?fileid=quality-coded-nlp-pilot-sid-1.xlsx&patid=Patient_quality-coded-nlp-pilot-sid-1 를 활용하여 patient interface로 접속.

<!-- Patient가 그 각 Cancer Prognosis, Life Expectancy, Erectile Dysfunction, Urinary Incontinence, Irritative Urinary Symptoms에 대해 rate한것을 db에 저장한 것을 보는 용도의 api call -->

GET {{base}}/api/patient/scoring?file=quality-coded-nlp-pilot-sid-1.xlsx&speaker=Patient_quality-coded-nlp-pilot-sid-1
X-API-Key: {{api_key}}

<!-- Patient가 그 각 설문 조사 Shared Decision Making, Decisional Conflict Survey, Risk Perception Survey, Patient Satisfaction Survey에 대해 응답하고 그 redcap project에 저장한것을 db에 동시에 저장한것을 db로 부터 가져와 보여주는 용도의 api call -->

GET {{base}}/api/surveys/submissions?speaker=Patient_quality-coded-nlp-pilot-sid-1
X-API-Key: {{api_key}}

<!-- Patient Interface로 접속 -->

http://localhost:3000/?fileid=quality-coded-nlp-pilot-sid-1.xlsx&doctorid=Interviewer:
