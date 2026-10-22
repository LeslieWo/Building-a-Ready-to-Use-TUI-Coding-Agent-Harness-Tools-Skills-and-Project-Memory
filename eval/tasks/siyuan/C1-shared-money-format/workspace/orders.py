def total_cents(amounts):
    return sum(amounts)

def total_label(amounts):
    return "$" + str(total_cents(amounts) / 100)
