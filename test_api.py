import urllib.request, json
try:
    with urllib.request.urlopen('http://localhost:8001/api/reports/b8db4ad2-2329-4daf-b873-7a87d7a79640/evidence/c0f839b3') as response:
        data = json.loads(response.read().decode())
        print('Confidence:', data.get('confidence'))
        print('Chunk Text:', data.get('chunk_text'))
        print('Related Confidences:', [r['confidence'] for r in data.get('related_entities', [])])
except Exception as e:
    print('Error:', e)
