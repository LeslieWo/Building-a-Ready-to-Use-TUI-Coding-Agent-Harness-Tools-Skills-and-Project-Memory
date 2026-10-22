def merge_intervals(intervals):
    ordered = sorted(intervals)
    result = []
    for start, end in ordered:
        if not result or start >= result[-1][1]:
            result.append([start, end])
        else:
            result[-1][1] = max(result[-1][1], end)
    return result
