"""
SSTG — Pricing, Plans & Subscriptions
========================================
Plans are defined in code (PLANS below), not editable at runtime — that's
intentional for a first pass: pricing changes should go through a review,
not a database edit. Each plan has a monthly and yearly price.

Subscription is a database table so each user's current plan can be tracked
and checked by other routes (e.g. gating the number of personal timetables
on the Free plan). No payment processor is wired in yet: `/billing/subscribe`
records the user's chosen plan and billing cycle directly and returns
"pending_payment" — this is the integration point for a future Stripe/
Paystack checkout session. Swapping in a real processor means:
  1. Create a Checkout Session (or equivalent) in `subscribe()` instead of
     writing the row directly, pointing success_url back to this app.
  2. Add a `/billing/webhook` endpoint that verifies the provider's
     signature and flips Subscription.status to "active" on payment success.
  3. Add a cron/scheduled job (or the webhook's invoice.payment_failed
     event) to flip status to "past_due" / "canceled".
None of that requires changing the Plan config or the frontend Pricing page.
"""
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Session, relationship

from database import Base, get_db
from security import get_current_user
from models import User, _uuid, _now

router = APIRouter(tags=["Billing & Plans"])


# ── Plan catalogue (code-defined, not DB-editable) ────────────────────────────
# price_* in whole currency units (display only — a payment processor's own
# price objects are the source of truth once one is wired in).
PLANS = [
    {
        "id": "free",
        "name": "Free",
        "tagline": "Try the basics with one class.",
        "audience": "personal",
        "price_monthly": 0,
        "price_yearly": 0,
        "currency": "USD",
        "features": [
            "1 personal timetable (home or office)",
            "1 school class, up to 20 students",
            "PDF export with watermark",
            "Community support",
        ],
        "limits": {"personal_timetables": 1, "classes": 1, "teachers": 3},
        "highlighted": False,
    },
    {
        "id": "personal",
        "name": "Personal",
        "tagline": "Unlimited home & office timetables.",
        "audience": "personal",
        "price_monthly": 3,
        "price_yearly": 30,
        "currency": "USD",
        "features": [
            "Unlimited personal timetables",
            "Custom colours & labels",
            "PDF export, no watermark",
            "Email support",
        ],
        "limits": {"personal_timetables": None, "classes": 0, "teachers": 0},
        "highlighted": False,
    },
    {
        "id": "school_starter",
        "name": "School Starter",
        "tagline": "For a single small school.",
        "audience": "school",
        "price_monthly": 29,
        "price_yearly": 290,
        "currency": "USD",
        "features": [
            "Up to 10 classes",
            "Up to 25 teachers",
            "Timetable + exam generation",
            "3 timetable drafts per generation",
            "PDF/Excel/CSV export",
            "Email support",
        ],
        "limits": {"personal_timetables": 3, "classes": 10, "teachers": 25},
        "highlighted": True,
    },
    {
        "id": "school_pro",
        "name": "School Pro",
        "tagline": "For larger schools and multi-campus groups.",
        "audience": "school",
        "price_monthly": 79,
        "price_yearly": 790,
        "currency": "USD",
        "features": [
            "Unlimited classes & teachers",
            "Unlimited timetable drafts",
            "Custom exam & timetable layout templates",
            "Curriculum presets (CAIE, UNEB, IB, AP, CBC)",
            "Priority support",
            "Multiple admin accounts (coming soon)",
        ],
        "limits": {"personal_timetables": None, "classes": None, "teachers": None},
        "highlighted": False,
    },
]

_PLAN_IDS = {p["id"] for p in PLANS}


def _yearly_savings_pct(plan: dict) -> int:
    if plan["price_monthly"] <= 0:
        return 0
    monthly_annualized = plan["price_monthly"] * 12
    if monthly_annualized <= 0:
        return 0
    return round((1 - plan["price_yearly"] / monthly_annualized) * 100)


# ── Subscription table ────────────────────────────────────────────────────────

class Subscription(Base):
    __tablename__ = "subscriptions"
    id         = Column(String(36), primary_key=True, default=_uuid)
    user_id    = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    plan_id    = Column(String(30), default="free")        # matches a PLANS[].id
    billing_cycle = Column(String(10), default="monthly")  # monthly | yearly
    status     = Column(String(20), default="active")      # active | pending_payment | past_due | canceled
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)


class SubscribeRequest(BaseModel):
    plan_id: str
    billing_cycle: str = "monthly"   # monthly | yearly


def _get_or_create_subscription(db: Session, user: User) -> Subscription:
    sub = db.query(Subscription).filter(Subscription.user_id == user.id).first()
    if not sub:
        sub = Subscription(user_id=user.id, plan_id="free", billing_cycle="monthly", status="active")
        db.add(sub)
        db.commit()
        db.refresh(sub)
    return sub


def _fmt_subscription(sub: Subscription) -> dict:
    plan = next((p for p in PLANS if p["id"] == sub.plan_id), PLANS[0])
    return {
        "plan_id": sub.plan_id,
        "plan_name": plan["name"],
        "billing_cycle": sub.billing_cycle,
        "status": sub.status,
        "updated_at": sub.updated_at.isoformat(),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/billing/plans")
def list_plans():
    """Public — no auth required, shown on the marketing Pricing page."""
    return [
        {**p, "yearly_savings_pct": _yearly_savings_pct(p)}
        for p in PLANS
    ]


@router.get("/billing/my-subscription")
def my_subscription(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    sub = _get_or_create_subscription(db, user)
    return _fmt_subscription(sub)


@router.post("/billing/subscribe")
def subscribe(data: SubscribeRequest, db: Session = Depends(get_db),
              user: User = Depends(get_current_user)):
    """
    Records the chosen plan immediately with status='pending_payment'.

    INTEGRATION POINT: a real payment processor replaces the direct write
    below with creating a Checkout Session and returning its redirect URL;
    the processor's webhook then flips status to 'active' once payment
    clears. Until that's wired in, this endpoint is honest about the state:
    it does NOT claim the user is on a paid plan.
    """
    if data.plan_id not in _PLAN_IDS:
        raise HTTPException(400, f"Unknown plan_id — must be one of: {', '.join(sorted(_PLAN_IDS))}")
    if data.billing_cycle not in ("monthly", "yearly"):
        raise HTTPException(400, "billing_cycle must be 'monthly' or 'yearly'")

    sub = _get_or_create_subscription(db, user)
    sub.plan_id = data.plan_id
    sub.billing_cycle = data.billing_cycle
    sub.status = "active" if data.plan_id == "free" else "pending_payment"
    db.commit()
    db.refresh(sub)

    plan = next(p for p in PLANS if p["id"] == data.plan_id)
    return {
        **_fmt_subscription(sub),
        "message": (
            "Switched to the Free plan."
            if data.plan_id == "free" else
            f"Plan selection saved — payment collection for {plan['name']} "
            f"isn't wired in yet. No payment processor is connected."
        ),
    }
