from orders import total_label

def render_receipt(amounts):
    lines = ["$" + str(value / 100) for value in amounts]
    return "\n".join(lines + ["Total: " + total_label(amounts)])
