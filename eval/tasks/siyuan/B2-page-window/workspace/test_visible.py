import unittest
from paging import paginate
class Tests(unittest.TestCase):
    def test_first(self): self.assertEqual(paginate([1,2,3,4],0,2),[1,2])
    def test_second(self): self.assertEqual(paginate([1,2,3,4],1,2),[3,4])
