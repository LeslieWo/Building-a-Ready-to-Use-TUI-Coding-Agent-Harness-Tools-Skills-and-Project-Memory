import re

def normalize(title):
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "item"

def unique_slug(title, existing):
    raise NotImplementedError("unique slug allocation")
