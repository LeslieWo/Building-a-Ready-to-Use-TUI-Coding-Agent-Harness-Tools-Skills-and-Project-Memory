def clamp(value, lower, upper):
    """Clamp to inclusive bounds. Reversed bounds must raise ValueError."""
    if lower > upper:
        raise ValueError("lower must not exceed upper")
    return max(lower, min(value, upper))
