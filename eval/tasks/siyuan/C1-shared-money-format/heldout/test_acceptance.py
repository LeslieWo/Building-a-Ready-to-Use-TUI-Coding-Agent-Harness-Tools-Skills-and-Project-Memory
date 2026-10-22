import unittest, importlib
from unittest.mock import patch
import money, orders, receipts
class Tests(unittest.TestCase):
    def test_negative(self): self.assertEqual(money.format_cents(-5),"-$0.05")
    def test_large(self): self.assertEqual(money.format_cents(10000000000000001),"$100000000000000.01")
    def test_empty(self): self.assertEqual(receipts.render_receipt([]),"Total: $0.00")
    def test_total(self): self.assertEqual(orders.total_cents([2,-5,8]),5)
    def test_shared_formatter(self):
        with patch.object(money,"format_cents",side_effect=lambda n:"C"+str(n)):
            importlib.reload(orders); importlib.reload(receipts)
            try: self.assertEqual(receipts.render_receipt([1,2]),"C1\nC2\nTotal: C3")
            finally: pass
        importlib.reload(orders); importlib.reload(receipts)
