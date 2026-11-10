"""Flexible class/level label matching.

Schools name levels in many ways ("8", "Grade 8", "Form 2", "S3", "Year 9").
Comparing raw text made "Grade 8" and "8" different, so classes silently got no
subjects. norm_level() strips filler words and spacing so those compare equal;
labels like "S3" or "DP1" are left as-is. Class allocations (when present) still
take priority over any label matching.
"""
import re

_NOISE = re.compile(r"\b(grade|form|class|year|std|standard|level)\b")


def norm_level(value) -> str:
    s = _NOISE.sub(" ", (value or "").strip().lower())
    return re.sub(r"[\s\-_]+", "", s)


def same_level(a, b) -> bool:
    return norm_level(a) == norm_level(b)
