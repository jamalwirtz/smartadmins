"""
SSTG — Public Holidays (Nager.Date API)
========================================
Fetches public holidays for any country — completely free, no API key.
API: https://date.nager.at

Usage: GET /holidays/{country_code}/{year}
Example: GET /holidays/ZA/2025   (South Africa)
         GET /holidays/KE/2025   (Kenya)
         GET /holidays/US/2025   (United States)
         GET /holidays/GB/2025   (United Kingdom)

Supported country codes: https://date.nager.at/Country
"""
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from security import get_current_user
from models import User
from config import get_settings

router = APIRouter(tags=["Holidays"])

NAGER_BASE = "https://date.nager.at/api/v3"


@router.get("/holidays/{country_code}/{year}")
async def get_holidays(
    country_code: str,
    year:         int,
    _: User = Depends(get_current_user),
):
    """
    Fetch public holidays from Nager.Date (free, no key).
    Returns a list of holiday objects with date, name, and type.
    The frontend uses these to highlight/block holiday dates on timetables.
    """
    if year < 2020 or year > 2030:
        raise HTTPException(400, "Year must be between 2020 and 2030")

    country_code = country_code.upper()

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(f"{NAGER_BASE}/PublicHolidays/{year}/{country_code}")

        if r.status_code == 404:
            raise HTTPException(404, f"Country code '{country_code}' not found. "
                                     f"See https://date.nager.at/Country for valid codes.")
        if r.status_code != 200:
            raise HTTPException(502, f"Holiday API returned {r.status_code}")

        holidays = r.json()
        return {
            "country":      country_code,
            "year":         year,
            "count":        len(holidays),
            "holidays": [
                {
                    "date":        h["date"],
                    "name":        h["name"],
                    "local_name":  h.get("localName", h["name"]),
                    "type":        h.get("types", ["Public"])[0],
                    "is_school_holiday": True,   # treat all public holidays as school off days
                }
                for h in holidays
            ],
        }
    except httpx.TimeoutException:
        raise HTTPException(504, "Holiday API timed out. Try again in a moment.")
    except httpx.RequestError as e:
        raise HTTPException(502, f"Could not reach holiday API: {e}")


@router.get("/holidays/supported-countries")
async def list_supported_countries(_: User = Depends(get_current_user)):
    """Return the list of countries supported by Nager.Date."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(f"{NAGER_BASE}/AvailableCountries")
        if r.status_code != 200:
            raise HTTPException(502, "Could not fetch country list")
        countries = r.json()
        # Sort alphabetically by country name
        return sorted(
            [{"code": c["countryCode"], "name": c["name"]} for c in countries],
            key=lambda x: x["name"]
        )
    except httpx.RequestError as e:
        raise HTTPException(502, f"Could not reach holiday API: {e}")


@router.get("/holidays/check-date/{country_code}/{date}")
async def check_date(
    country_code: str,
    date:         str,   # "2025-06-16"
    _: User = Depends(get_current_user),
):
    """Check if a specific date is a public holiday."""
    try:
        year = int(date.split("-")[0])
    except (ValueError, IndexError):
        raise HTTPException(400, "Date must be in YYYY-MM-DD format")

    result = await get_holidays(country_code, year, _)
    holiday = next(
        (h for h in result["holidays"] if h["date"] == date), None
    )
    return {
        "date":         date,
        "is_holiday":   holiday is not None,
        "holiday_name": holiday["name"] if holiday else None,
    }
