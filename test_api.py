import requests
import time
start = time.time()
r = requests.get('http://localhost:8001/api/reports/204403a6-1f18-4c24-a36b-a41b61a01ba9/graph')
print(f"Took {time.time()-start:.2f}s")
print(f"Status: {r.status_code}")
