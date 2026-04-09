#!/usr/bin/env python3
"""
Debug: Check REDCap response structure
"""

import asyncio
import aiohttp
import json

BASE_URL = "http://localhost:8000"
API_KEY = "<YOUR_API_KEY>"
HEADERS = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}


async def main():
    print("🔍 Checking REDCap response structure...\n")
    
    timeout = aiohttp.ClientTimeout(total=60)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        
        async with session.get(f"{BASE_URL}/api/surveys/redcap/records", headers=HEADERS) as resp:
            print(f"Status: {resp.status}")
            
            data = await resp.json()
            
            print(f"\nResponse type: {type(data)}")
            print(f"\nRaw response (formatted):")
            print(json.dumps(data, indent=2, default=str)[:3000])
            
            # Try different ways to extract records
            print("\n" + "="*60)
            print("Attempting to extract record IDs:")
            print("="*60)
            
            if isinstance(data, dict):
                print(f"\nDict keys: {data.keys()}")
                
                for key in data.keys():
                    print(f"\n[{key}]: {type(data[key])}")
                    if isinstance(data[key], list) and len(data[key]) > 0:
                        print(f"  First item: {data[key][0]}")
            
            elif isinstance(data, list):
                print(f"\nList length: {len(data)}")
                if len(data) > 0:
                    print(f"First item type: {type(data[0])}")
                    print(f"First item: {data[0]}")


if __name__ == "__main__":
    asyncio.run(main())