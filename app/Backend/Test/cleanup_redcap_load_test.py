#!/usr/bin/env python3
"""
REDCap Cleanup - LOAD_TEST_PATIENT_* records only

Run: python cleanup_redcap_load_test.py
"""

import asyncio
import aiohttp

BASE_URL = "http://localhost:8000"
API_KEY = "REDACTED_API_KEY"
HEADERS = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}


async def main():
    print("="*60)
    print("🧹 REDCap Cleanup: LOAD_TEST_PATIENT_* records")
    print("="*60)
    
    timeout = aiohttp.ClientTimeout(total=60)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        
        # 1. Fetch all REDCap records
        print("\n📋 Fetching REDCap records...")
        async with session.get(f"{BASE_URL}/api/surveys/redcap/records", headers=HEADERS) as resp:
            if resp.status != 200:
                print(f"❌ Failed: HTTP {resp.status}")
                print(await resp.text())
                return
            
            data = await resp.json()
        
        # Extract record_ids from the correct location
        record_ids = data.get("record_ids", [])
        print(f"✅ Total records in REDCap: {len(record_ids)}")
        
        # 2. Filter LOAD_TEST_PATIENT_* records
        target_records = [
            rid for rid in record_ids 
            if rid.startswith("LOAD_TEST_PATIENT_")
        ]
        
        print(f"🎯 LOAD_TEST_PATIENT_* records found: {len(target_records)}")
        
        if not target_records:
            print("\n✅ No LOAD_TEST_PATIENT_* records to delete!")
            return
        
        # 3. Show records
        print("\n📋 Records to delete:")
        for record_id in target_records:
            print(f"   - {record_id}")
        
        # 4. Confirm
        print(f"\n⚠️  Delete {len(target_records)} records?")
        confirm = input("Type 'yes' to confirm: ").strip().lower()
        
        if confirm != "yes":
            print("❌ Cancelled.")
            return
        
        # 5. Delete
        print(f"\n🗑️  Deleting...")
        deleted = 0
        failed = 0
        
        for record_id in target_records:
            url = f"{BASE_URL}/api/surveys/redcap/records/{record_id}"
            async with session.delete(url, headers=HEADERS) as resp:
                if resp.status in [200, 204]:
                    deleted += 1
                    print(f"   ✅ {record_id}")
                else:
                    failed += 1
                    text = await resp.text()
                    print(f"   ❌ {record_id} (HTTP {resp.status}): {text[:100]}")
        
        print(f"\n{'='*60}")
        print(f"✅ Done! Deleted: {deleted}, Failed: {failed}")
        print(f"{'='*60}")


if __name__ == "__main__":
    asyncio.run(main())