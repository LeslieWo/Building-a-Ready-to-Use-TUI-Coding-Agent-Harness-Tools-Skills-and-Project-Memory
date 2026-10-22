def paginate(items, page, size):
    if page < 0 or size < 0:
        raise ValueError("invalid pagination")
    start = page * size
    return list(items[start:start + size - 1])
