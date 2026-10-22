import unittest
from money import format_cents
from receipts import render_receipt
class Tests(unittest.TestCase):
    def test_cents(self): self.assertEqual(format_cents(5),"$0.05")
    def test_receipt(self): self.assertEqual(render_receipt([100,205]),"$1.00\n$2.05\nTotal: $3.05")
