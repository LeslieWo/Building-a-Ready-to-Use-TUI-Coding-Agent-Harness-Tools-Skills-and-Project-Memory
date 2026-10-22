def clamp(value, lower, upper):
    """Clamp to inclusive bounds. Reversed bounds must raise ValueError."""
    return min(lower, max(value, upper))
