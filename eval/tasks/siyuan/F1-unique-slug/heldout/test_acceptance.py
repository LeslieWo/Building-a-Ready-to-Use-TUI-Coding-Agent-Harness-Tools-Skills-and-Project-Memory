import unittest
from slugs import unique_slug
class Tests(unittest.TestCase):
    def test_gap(self): self.assertEqual(unique_slug("A",{"a","a-2","a-4"}),"a-3")
    def test_empty(self): self.assertEqual(unique_slug("!!!",{"item","item-2"}),"item-3")
    def test_input_preserved(self):
        existing={"x","x-2"}; self.assertEqual(unique_slug(" X ",existing),"x-3")
        self.assertEqual(existing,{"x","x-2"})
    def test_existing_suffix(self): self.assertEqual(unique_slug("X-2",{"x-2"}),"x-2-2")
